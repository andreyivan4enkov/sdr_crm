import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getClientIp } from "../../lib/clientIp.js";
import { db } from "../../db/index.js";
import { integrations, stages, channels, leads } from "../../db/schema.js";
import { broadcastToAll } from "../../lib/events.js";
import { dispatchNotification } from "../../lib/notify.js";
import { writeAudit } from "../../lib/audit.js";
import { verifyWebhookAuth } from "../../lib/webhook-secret.js";
import { isMarketingType, MARKETING_CHANNEL_BY_TYPE, MARKETING_LABELS } from "../../lib/marketing-meta.js";
import { parseMarketingLead, readMarketingBody } from "../../lib/marketing-parse.js";

export const marketingWebhook = new Hono();

marketingWebhook.post("/:source", async (c) => {
  const source = c.req.param("source");
  if (!isMarketingType(source)) return c.json({ error: "Unknown source" }, 404);

  const ip = getClientIp(c);
  if (!rateLimit(`webhook-marketing:${source}:${ip}`, 120, 60_000)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const secret = c.req.header("X-Webhook-Secret");
  const [integration] = await db.select().from(integrations).where(eq(integrations.type, source)).limit(1);
  if (!integration?.enabled) return c.json({ error: "Integration disabled" }, 403);

  const config = (integration.config || {}) as { webhookSecret?: string };
  const raw = await c.req.text();
  const check = verifyWebhookAuth(secret, raw, c.req.header("X-Webhook-Signature"), config.webhookSecret);
  if (!check.ok) {
    return c.json({ error: check.error }, check.status);
  }

  const contentType = c.req.header("content-type") || "";
  const body = readMarketingBody(raw, contentType);

  if (body.test === "1" || body.ping === "1") {
    return c.json({ ok: true, test: true });
  }

  const parsed = parseMarketingLead(body, MARKETING_LABELS[source]);
  if (!parsed.phone && !parsed.email && !parsed.comment) {
    return c.json({ error: "Empty payload" }, 400);
  }

  const [firstStage] = await db.select().from(stages).orderBy(stages.sortOrder).limit(1);
  const channelName = MARKETING_CHANNEL_BY_TYPE[source];
  const [channel] = channelName
    ? await db.select().from(channels).where(eq(channels.name, channelName)).limit(1)
    : [null];

  const [lead] = await db.insert(leads).values({
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    region: parsed.region,
    comment: parsed.comment,
    source: source,
    channelId: channel?.id ?? null,
    statusId: firstStage?.id,
    custom: parsed.custom,
    pdConsent: parsed.pdConsent,
    pdConsentAt: parsed.pdConsent ? new Date() : undefined,
    createdBy: MARKETING_LABELS[source],
  }).returning();

  await writeAudit({
    action: "webhook.marketing",
    entityType: "lead",
    entityId: lead.id,
    ip,
    userAgent: c.req.header("user-agent"),
    meta: { source },
  });

  broadcastToAll("lead_created", { lead });
  await dispatchNotification({
    kind: "newLead",
    text: `Новая заявка (${MARKETING_LABELS[source]}): ${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`,
    leadId: lead.id,
    event: "notification",
  });

  return c.json({ ok: true, leadId: lead.id });
});
