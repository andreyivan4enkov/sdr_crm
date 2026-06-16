import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getClientIp } from "../../lib/clientIp.js";
import { db } from "../../db/index.js";
import { integrations, stages, channels, leads, leadNotes, tasks, pipelines } from "../../db/schema.js";
import { runStageAutomations } from "../../lib/automations.js";
import { persistAutomationSideEffects } from "../../lib/apply-stage-automations.js";
import { broadcastToAll } from "../../lib/events.js";
import { realtors } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import {
  bodyFieldKeys, isTildaTestPing, mapTildaToLead, readTildaWebhookBody,
} from "../../lib/tilda-parse.js";

const TILDA_DEFAULT_MAPPING: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  comment: "Comments",
  preferredTime: "Date",
};

function getBodyField(body: Record<string, string>, key: string): string | undefined {
  if (body[key] !== undefined && body[key] !== "") return body[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(body)) {
    if (k.toLowerCase() === lower && v) return v;
  }
  return undefined;
}

export const tildaWebhook = new Hono();

tildaWebhook.post("/", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`webhook-tilda:${ip}`, 60, 60_000)) {
    return c.json({ error: "Too many requests" }, 429);
  }
  const secret = c.req.header("X-Webhook-Secret") || c.req.query("secret");
  const [integration] = await db.select().from(integrations).where(eq(integrations.type, "tilda")).limit(1);
  if (!integration?.enabled) return c.json({ error: "Tilda integration disabled" }, 403);

  const config = integration.config as {
    webhookSecret?: string;
    fieldMapping?: Record<string, string>;
    consentField?: string;
  };
  if (!secret || secret !== config.webhookSecret) {
    return c.json({ error: "Invalid webhook secret" }, 401);
  }

  const raw = await c.req.text();
  const contentType = c.req.header("content-type") || "";
  const body = await readTildaWebhookBody(raw, contentType);

  if (isTildaTestPing(body)) {
    return c.json({ ok: true, test: true, message: "Webhook test accepted" });
  }

  const mapping = { ...TILDA_DEFAULT_MAPPING, ...config.fieldMapping };
  const { leadData, custom } = mapTildaToLead(body, mapping);

  const meta: string[] = [];
  const formId = getBodyField(body, "formid");
  const tranId = getBodyField(body, "tranid");
  if (formId) meta.push(`форма Tilda: ${formId}`);
  if (tranId) meta.push(`заявка: ${tranId}`);

  const consentField = config.consentField || "pd_consent";
  const consentRaw = getBodyField(body, consentField);
  const hasConsent = consentRaw === "yes" || consentRaw === "1" || consentRaw === "true"
    || consentRaw === "on" || consentRaw === "да";
  const consentNow = hasConsent ? new Date() : undefined;

  const [defaultPipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  const [firstStage] = defaultPipeline
    ? await db.select().from(stages).where(eq(stages.pipelineId, defaultPipeline.id)).orderBy(stages.sortOrder).limit(1)
    : await db.select().from(stages).orderBy(stages.sortOrder).limit(1);
  const [tildaChannel] = await db.select().from(channels).where(eq(channels.name, "Tilda")).limit(1);

  const [lead] = await db.insert(leads).values({
    name: leadData.name || "Без имени",
    phone: leadData.phone,
    email: leadData.email,
    region: leadData.region,
    preferredTime: leadData.preferredTime,
    comment: [leadData.comment, meta.join(" · ")].filter(Boolean).join("\n") || undefined,
    source: "tilda",
    channelId: tildaChannel?.id || null,
    pipelineId: firstStage?.pipelineId,
    statusId: firstStage?.id,
    custom,
    createdBy: "Tilda webhook",
    pdConsent: hasConsent,
    pdConsentAt: consentNow,
  }).returning();

  await writeAudit({
    action: "webhook.tilda",
    entityType: "lead",
    entityId: lead.id,
    ip,
    userAgent: c.req.header("user-agent"),
    meta: {
      formid: formId,
      tranid: tranId,
      fields: bodyFieldKeys(body),
      mapped: { name: !!leadData.name, phone: !!leadData.phone, date: !!leadData.preferredTime },
    },
  });

  const allChannels = await db.select().from(channels);
  const allRealtors = await db.select().from(realtors);
  const allStages = await db.select({ id: stages.id, label: stages.label, pipelineId: stages.pipelineId }).from(stages);
  const stage = firstStage!;
  const result = runStageAutomations(
    stage.automations || [],
    stage,
    lead,
    allChannels,
    allRealtors,
    allStages,
  );
  const autoPatch = await persistAutomationSideEffects(lead.id, lead, result);
  if (Object.keys(autoPatch).length) {
    await db.update(leads).set({ ...autoPatch, updatedAt: new Date() }).where(eq(leads.id, lead.id));
  }

  broadcastToAll("lead_created", { lead });
  return c.json({ ok: true, leadId: lead.id });
});
