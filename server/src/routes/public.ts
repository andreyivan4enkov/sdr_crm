import { Hono } from "hono";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { leads, stages, channels, leadNotes, tasks, dealManagers, pipelines } from "../db/schema.js";
import { triggerBlueprintsForStage } from "../lib/blueprint/executor.js";
import { broadcastToAll } from "../lib/events.js";
import { rateLimitAsync } from "../middleware/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { renderPrivacyPolicy } from "../data/privacy-policy-i18n.js";
import { normalizeLocale, parseAcceptLanguage } from "@sdr-crm/i18n";
import { writeAudit } from "../lib/audit.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { revokeLeadConsent } from "../lib/lead-pd.js";
import {
  createRevokeOtp,
  consumeRevokeOtp,
  normalizePhone,
  purgeExpiredRevokeTokens,
} from "../lib/public-revoke.js";

export const publicRoutes = new Hono();

publicRoutes.get("/config", (c) => c.json({
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
}));

const leadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(5).max(40),
  region: z.string().max(100).optional(),
  preferredTime: z.string().max(100).optional(),
  comment: z.string().max(2000).optional(),
  pdConsent: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
  website: z.string().max(500).optional(), // honeypot — должно быть пустым
  turnstileToken: z.string().max(4096).optional(),
});

publicRoutes.get("/privacy", (c) => {
  const locale = normalizeLocale(c.req.query("lang") || parseAcceptLanguage(c.req.header("accept-language")));
  return c.json(renderPrivacyPolicy(locale));
});

publicRoutes.post("/leads", async (c) => {
  const ip = getClientIp(c);
  if (!(await rateLimitAsync(`public-lead:${ip}`, 5, 60_000))) {
    return c.json({ error: "Слишком много заявок. Попробуйте позже." }, 429);
  }

  const body = leadSchema.safeParse(await c.req.json());
  if (!body.success) {
    const msg = body.error.flatten().fieldErrors.pdConsent?.[0] || "Проверьте данные формы";
    return c.json({ error: msg, details: body.error.flatten() }, 400);
  }

  // Honeypot: боты заполняют скрытое поле — тихо отклоняем
  if (body.data.website?.trim()) {
    return c.json({ ok: true, leadId: crypto.randomUUID() }, 201);
  }

  if (!(await verifyTurnstile(body.data.turnstileToken, ip))) {
    return c.json({ error: "Подтвердите, что вы не робот" }, 403);
  }

  const [defaultPipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  const [firstStage] = defaultPipeline
    ? await db.select().from(stages).where(eq(stages.pipelineId, defaultPipeline.id)).orderBy(stages.sortOrder).limit(1)
    : await db.select().from(stages).orderBy(stages.sortOrder).limit(1);
  const [siteChannel] = await db.select().from(channels).where(eq(channels.name, "Форма на сайте")).limit(1);
  if (!firstStage) return c.json({ error: "CRM not configured" }, 503);

  const normalizedPhone = body.data.phone.replace(/\D/g, "");
  if (normalizedPhone.length >= 10) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    const [dup] = await db.select().from(leads).where(
      and(
        isNotNull(leads.phone),
        sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g') = ${normalizedPhone}`,
        sql`${leads.createdAt} >= ${fiveMinAgo}`,
        isNull(leads.erasedAt),
      ),
    ).limit(1);
    if (dup) return c.json({ ok: true, leadId: dup.id, duplicate: true }, 201);
  }

  const now = new Date();
  const [lead] = await db.insert(leads).values({
    name: body.data.name,
    phone: body.data.phone,
    region: body.data.region,
    preferredTime: body.data.preferredTime,
    comment: body.data.comment,
    source: "form",
    channelId: siteChannel?.id || null,
    pipelineId: firstStage.pipelineId,
    statusId: firstStage.id,
    createdBy: "Форма с лендинга",
    pdConsent: true,
    pdConsentAt: now,
  }).returning();

  void triggerBlueprintsForStage(lead.id, firstStage.id, firstStage.pipelineId).catch(() => {});

  await writeAudit({
    action: "lead.public_create",
    entityType: "lead",
    entityId: lead.id,
    ip,
    userAgent: c.req.header("user-agent"),
    meta: { source: "landing" },
  });

  return c.json({ ok: true, leadId: lead.id }, 201);
});

const revokeSchema = z.object({
  phone: z.string().min(5),
  email: z.string().email().optional(),
  turnstileToken: z.string().max(4096).optional(),
});

publicRoutes.post("/revoke", async (c) => {
  await purgeExpiredRevokeTokens();
  const ip = getClientIp(c);
  if (!(await rateLimitAsync(`public-revoke:${ip}`, 3, 300_000))) {
    return c.json({ error: "Слишком много запросов. Попробуйте позже." }, 429);
  }

  const body = revokeSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Укажите телефон" }, 400);

  const normalized = normalizePhone(body.data.phone);
  if (normalized.length < 10) return c.json({ error: "Укажите корректный телефон" }, 400);

  if (!(await verifyTurnstile(body.data.turnstileToken, ip))) {
    return c.json({ error: "Подтвердите, что вы не робот" }, 403);
  }

  if (!(await rateLimitAsync(`public-revoke-phone:${normalized}`, 2, 86_400_000))) {
    return c.json({ error: "Для этого номера запрос уже отправлен. Попробуйте позже." }, 429);
  }

  await createRevokeOtp(normalized, body.data.email);

  await writeAudit({
    action: "lead.consent_revoke_request",
    entityType: "lead",
    ip,
    userAgent: c.req.header("user-agent"),
    meta: { source: "public_revoke", phoneTail: normalized.slice(-4) },
  });

  return c.json({
    ok: true,
    message: "Если ваши данные есть в системе, на указанный контакт отправлен код подтверждения. Введите его для завершения отзыва согласия.",
  });
});

const revokeConfirmSchema = z.object({
  phone: z.string().min(5),
  otp: z.string().min(4).max(8),
});

publicRoutes.post("/revoke/confirm", async (c) => {
  await purgeExpiredRevokeTokens();
  const ip = getClientIp(c);
  if (!(await rateLimitAsync(`public-revoke-confirm:${ip}`, 5, 300_000))) {
    return c.json({ error: "Слишком много запросов. Попробуйте позже." }, 429);
  }

  const body = revokeConfirmSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Укажите телефон и код подтверждения" }, 400);

  const normalized = normalizePhone(body.data.phone);
  if (!(await consumeRevokeOtp(normalized, body.data.otp))) {
    return c.json({ error: "Неверный или просроченный код подтверждения" }, 403);
  }

  const matches = await db.select().from(leads).where(
    and(
      isNotNull(leads.phone),
      sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g') = ${normalized}`,
      isNull(leads.erasedAt),
    ),
  );

  for (const lead of matches) {
    await revokeLeadConsent(lead.id, true);
    await writeAudit({
      action: "lead.consent_revoke",
      entityType: "lead",
      entityId: lead.id,
      ip,
      userAgent: c.req.header("user-agent"),
      meta: { source: "public_revoke_confirm" },
    });
  }

  return c.json({
    ok: true,
    message: "Если ваши данные есть в системе, согласие отозвано и данные обезличены. Ответ в течение 30 дней по запросу.",
  });
});
