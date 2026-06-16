import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { calls, integrations, leads } from "../db/schema.js";
import { dispatchNotification } from "../lib/notify.js";
import { broadcastToAll } from "../lib/events.js";
import { getAiConfig } from "../lib/ai.js";
import { scheduleTranscription } from "./transcribe.js";
import type { NormalizedCallEvent } from "./types.js";
import { parseCallLinkConfig, resolveLeadForCall, phonesMatch } from "../lib/lead-phone.js";
import { beelineRecordingAuthHeader } from "./beeline-api.js";

async function getTelephonyConfig() {
  const [row] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  return (row?.config || {}) as Record<string, unknown>;
}

async function upsertCall(event: NormalizedCallEvent, provider: string, leadId: string | null) {
  const now = new Date();
  const base = {
    phone: event.phone,
    direction: event.direction,
    duration: event.duration || 0,
    recordingUrl: event.recordingUrl,
    leadId,
    provider,
    status: event.event === "call_end" ? "completed" : "active",
    updatedAt: now,
  };

  if (event.externalId) {
    const [existing] = await db.select().from(calls).where(
      and(eq(calls.provider, provider), eq(calls.externalId, event.externalId)),
    ).limit(1);

    if (existing) {
      const mergedLeadId = leadId || existing.leadId;
      const [updated] = await db.update(calls).set({
        ...base,
        leadId: mergedLeadId,
        recordingUrl: event.recordingUrl || existing.recordingUrl,
        duration: event.duration ?? existing.duration ?? 0,
      }).where(eq(calls.id, existing.id)).returning();
      return updated;
    }
  }

  const [created] = await db.insert(calls).values({
    externalId: event.externalId,
    ...base,
  }).returning();
  return created;
}

async function ensureRecordingAuth(provider: string, config: Record<string, unknown>) {
  if (provider !== "beeline") return;
  const token = String(config.apiKey || "");
  if (!token) return;
  const header = beelineRecordingAuthHeader(token);
  if (config.recordingAuthHeader === header) return;
  await db.update(integrations).set({
    config: { ...config, recordingAuthHeader: header },
    updatedAt: new Date(),
  }).where(eq(integrations.type, "telephony"));
}

export async function processCallEvent(event: NormalizedCallEvent, provider: string) {
  const telConfig = await getTelephonyConfig();
  const linkConfig = parseCallLinkConfig(telConfig);

  const ignore = Array.isArray(telConfig.ignorePhones)
    ? (telConfig.ignorePhones as string[])
    : [];
  if (ignore.some((p) => phonesMatch(p, event.phone))) {
    return { call: null, lead: null, skipped: true };
  }

  let lead = await resolveLeadForCall(event.phone, linkConfig);
  const call = await upsertCall(event, provider, lead?.id || null);

  if (!lead && call.leadId) {
    const [linked] = await db.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
    lead = linked || null;
  }

  if (lead && call.leadId !== lead.id) {
    await db.update(calls).set({ leadId: lead.id, updatedAt: new Date() }).where(eq(calls.id, call.id));
    call.leadId = lead.id;
  }

  const isStart = event.event === "incoming_call" || event.event === "outgoing_call";
  const isEnd = event.event === "call_end";

  if (isStart) {
    broadcastToAll("incoming_call", { call, lead, phone: event.phone, event: event.event });
    const label = event.event === "incoming_call" ? "Входящий" : "Исходящий";
    await dispatchNotification({
      kind: "incomingCall",
      text: `${label} звонок: ${event.phone}${lead ? ` (${lead.name})` : ""}`,
      leadId: lead?.id,
      callId: call.id,
      event: "incoming_call",
    });
  }

  if (isEnd) {
    if (event.recordingUrl) {
      await ensureRecordingAuth(provider, telConfig);
      await dispatchNotification({
        kind: "callRecording",
        text: `Запись разговора: ${event.phone}${call.duration ? ` · ${call.duration} сек` : ""}`,
        leadId: lead?.id || call.leadId || undefined,
        callId: call.id,
        event: "call_recording",
      });
    }

    const ai = await getAiConfig();
    if (ai?.autoTranscribe && call.recordingUrl && call.transcriptStatus !== "done") {
      scheduleTranscription(call.id);
    }
  }

  return { call, lead };
}

export function buildSipUri(phone: string, gateway: string) {
  const clean = phone.replace(/\s/g, "");
  return gateway ? `sip:${clean}@${gateway}` : `tel:${clean}`;
}
