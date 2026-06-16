import { Hono } from "hono";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { leads, stages, channels, leadNotes, tasks, realtors, pipelines } from "../db/schema.js";
import { runStageAutomations } from "../lib/automations.js";
import { persistAutomationSideEffects } from "../lib/apply-stage-automations.js";
import { broadcastToAll } from "../lib/events.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { renderPrivacyPolicy } from "../data/privacy-policy.js";
import { writeAudit } from "../lib/audit.js";
import { revokeLeadConsent } from "../lib/lead-pd.js";

export const publicRoutes = new Hono();

const leadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(5).max(40),
  region: z.string().max(100).optional(),
  preferredTime: z.string().max(100).optional(),
  comment: z.string().max(2000).optional(),
  pdConsent: z.literal(true, { errorMap: () => ({ message: "Требуется согласие на обработку ПДн" }) }),
  website: z.string().max(500).optional(), // honeypot — должно быть пустым
});

publicRoutes.get("/privacy", (c) => c.json(renderPrivacyPolicy()));

publicRoutes.post("/leads", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`public-lead:${ip}`, 5, 60_000)) {
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

  const [defaultPipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  const [firstStage] = defaultPipeline
    ? await db.select().from(stages).where(eq(stages.pipelineId, defaultPipeline.id)).orderBy(stages.sortOrder).limit(1)
    : await db.select().from(stages).orderBy(stages.sortOrder).limit(1);
  const [siteChannel] = await db.select().from(channels).where(eq(channels.name, "Форма на сайте")).limit(1);
  if (!firstStage) return c.json({ error: "CRM not configured" }, 503);

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

  const [allChannels, allRealtors, allStages] = await Promise.all([
    db.select().from(channels),
    db.select().from(realtors),
    db.select({ id: stages.id, label: stages.label, pipelineId: stages.pipelineId }).from(stages),
  ]);
  const result = runStageAutomations(
    firstStage.automations || [],
    firstStage,
    lead,
    allChannels,
    allRealtors,
    allStages,
  );
  const autoPatch = await persistAutomationSideEffects(lead.id, lead, result);
  if (Object.keys(autoPatch).length) {
    await db.update(leads).set({ ...autoPatch, updatedAt: new Date() }).where(eq(leads.id, lead.id));
  }

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
});

publicRoutes.post("/revoke", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`public-revoke:${ip}`, 3, 300_000)) {
    return c.json({ error: "Слишком много запросов. Попробуйте позже." }, 429);
  }

  const body = revokeSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Укажите телефон" }, 400);

  const normalized = body.data.phone.replace(/\D/g, "");
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
      meta: { source: "public_revoke" },
    });
  }

  return c.json({
    ok: true,
    message: "Если ваши данные есть в системе, согласие отозвано и данные обезличены. Ответ в течение 30 дней по запросу.",
  });
});
