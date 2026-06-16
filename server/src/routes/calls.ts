import { Hono } from "hono";
import { eq, desc, or, isNull, inArray, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { calls, integrations, leads } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { buildSipUri } from "../telephony/service.js";
import { beelineDoCall, beelineRecordingAuthHeader } from "../telephony/beeline-api.js";
import { fetchRecordingBuffer } from "../telephony/recording.js";
import { accessibleLeadIds, canAccessLead, resolveLeadScope } from "../lib/lead-access.js";
import { formatPhoneDisplay, normalizePhoneDigits } from "../lib/lead-phone.js";
import { broadcastToAll } from "../lib/events.js";
import { transcribeCallById, applyAiSuggestionsToLead } from "../telephony/transcribe.js";

export const callRoutes = new Hono<AppEnv>();

callRoutes.use("*", requireAuth);

function mapCall(row: typeof calls.$inferSelect) {
  return {
    id: row.id,
    externalId: row.externalId,
    phone: row.phone,
    direction: row.direction,
    duration: row.duration,
    recordingUrl: row.recordingUrl,
    hasRecording: Boolean(row.recordingUrl),
    transcript: row.transcript,
    transcriptStatus: row.transcriptStatus,
    aiSummary: row.aiSummary,
    aiSuggestions: row.aiSuggestions || {},
    leadId: row.leadId,
    provider: row.provider,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function phoneTailMatch(phone: string) {
  const tail = normalizePhoneDigits(phone).slice(-10);
  if (tail.length < 10) return eq(calls.phone, phone);
  return sql`right(regexp_replace(coalesce(${calls.phone}, ''), '[^0-9]', '', 'g'), 10) = ${tail}`;
}

async function getRecordingAuthHeader() {
  const [telIntegration] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  const config = (telIntegration?.config || {}) as { apiKey?: string; recordingAuthHeader?: string };
  if (config.recordingAuthHeader) return config.recordingAuthHeader;
  if (config.apiKey) return beelineRecordingAuthHeader(String(config.apiKey));
  return undefined;
}

callRoutes.get("/", requirePermission("calls.view"), async (c) => {
  const phone = c.req.query("phone");
  const leadId = c.req.query("leadId");
  const user = c.get("user");
  const scope = await resolveLeadScope(user);

  let whereCond;
  if (scope.mode !== "all") {
    const leadIds = await accessibleLeadIds(scope);
    const scopeCond = leadIds.length
      ? or(isNull(calls.leadId), inArray(calls.leadId, leadIds))
      : isNull(calls.leadId);
    whereCond = scopeCond;
  }
  if (phone && !leadId) {
    const phoneCond = phoneTailMatch(phone);
    whereCond = whereCond ? and(whereCond, phoneCond) : phoneCond;
  }
  if (leadId) {
    const leadCond = phone
      ? or(eq(calls.leadId, leadId), phoneTailMatch(phone))
      : eq(calls.leadId, leadId);
    whereCond = whereCond ? and(whereCond, leadCond) : leadCond;
  }

  const rows = whereCond
    ? await db.select().from(calls).where(whereCond).orderBy(desc(calls.createdAt)).limit(100)
    : await db.select().from(calls).orderBy(desc(calls.createdAt)).limit(100);
  return c.json({ calls: rows.map(mapCall) });
});

callRoutes.get("/:id/recording", requirePermission("calls.view"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call?.recordingUrl) return c.json({ error: "Запись не найдена" }, 404);

  if (call.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
    if (lead && !(await canAccessLead(user, lead))) return c.json({ error: "Not found" }, 404);
  }

  try {
    const authHeader = await getRecordingAuthHeader();
    const audio = await fetchRecordingBuffer(call.recordingUrl, authHeader);
    const type = call.recordingUrl.includes(".wav") ? "audio/wav" : "audio/mpeg";
    return new Response(audio, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(audio.length),
      },
    });
  } catch (e) {
    return c.json({ error: (e as Error).message || "Не удалось загрузить запись" }, 502);
  }
});

callRoutes.post("/dial", requirePermission("calls.dial"), async (c) => {
  const body = z.object({
    phone: z.string().min(5),
    leadId: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const user = c.get("user");
  let lead = null as typeof leads.$inferSelect | null;
  if (body.data.leadId) {
    const [row] = await db.select().from(leads).where(eq(leads.id, body.data.leadId)).limit(1);
    if (!row || !(await canAccessLead(user, row))) return c.json({ error: "Not found" }, 404);
    lead = row;
  }

  const [telIntegration] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  const config = (telIntegration?.config || {}) as {
    sipGateway?: string;
    provider?: string;
    apiKey?: string;
    callerId?: string;
  };

  const provider = config.provider || "generic";
  const rawPhone = body.data.phone.replace(/\s/g, "");
  const displayPhone = formatPhoneDisplay(rawPhone);

  if (provider === "beeline" && config.apiKey && config.callerId) {
    try {
      await beelineDoCall(config.apiKey, config.callerId, rawPhone);
      const [call] = await db.insert(calls).values({
        phone: displayPhone,
        direction: "outbound",
        leadId: lead?.id || body.data.leadId || null,
        provider: "beeline",
        status: "active",
        externalId: `beeline-out-${Date.now()}`,
      }).returning();

      broadcastToAll("incoming_call", { call: mapCall(call), lead, phone: displayPhone, event: "outgoing_call" });

      return c.json({
        ok: true,
        phone: displayPhone,
        provider: "beeline",
        callId: call.id,
        message: "Исходящий звонок через Билайн АТС",
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  }

  const sipUri = buildSipUri(body.data.phone, config.sipGateway || "");

  return c.json({
    ok: true,
    phone: displayPhone,
    sipUri,
    telUri: `tel:${rawPhone.replace(/\D/g, "")}`,
    provider,
    message: "Используйте sipUri для софтфона или telUri для мобильного",
  });
});

callRoutes.post("/:id/transcribe", requirePermission("calls.view"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call) return c.json({ error: "Not found" }, 404);
  if (call.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
    if (lead && !(await canAccessLead(user, lead))) return c.json({ error: "Not found" }, 404);
  }
  try {
    const updated = await transcribeCallById(id);
    return c.json({ call: mapCall(updated) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

callRoutes.post("/:id/apply-ai", requirePermission("leads.write"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call?.leadId) return c.json({ error: "Звонок не привязан к сделке" }, 400);
  const [lead] = await db.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
  if (!lead || !(await canAccessLead(user, lead))) return c.json({ error: "Not found" }, 404);

  const suggestions = (call.aiSuggestions || {}) as Record<string, string>;
  if (!Object.keys(suggestions).length) return c.json({ error: "Нет предложений AI" }, 400);

  const updated = await applyAiSuggestionsToLead(call.leadId, suggestions, call.transcript || undefined, call.aiSummary || undefined);
  return c.json({ ok: true, lead: updated });
});
