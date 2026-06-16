import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { calls, fields, leads, leadNotes } from "../db/schema.js";
import { extractLeadInsights, getAiConfig, transcribeAudio } from "../lib/ai.js";
import { dispatchNotification } from "../lib/notify.js";
import { broadcastToAll } from "../lib/events.js";
import { logger } from "../lib/logger.js";

export async function transcribeCallById(callId: string, opts?: { autoFill?: boolean }) {
  const config = await getAiConfig();
  if (!config) throw new Error("AI не настроен. Укажите API-ключ в настройках телефонии.");

  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) throw new Error("Звонок не найден");
  if (!call.recordingUrl) throw new Error("Нет ссылки на запись разговора");

  await db.update(calls).set({ transcriptStatus: "processing", updatedAt: new Date() }).where(eq(calls.id, callId));

  try {
    const transcript = await transcribeAudio(config, call.recordingUrl);
    let aiSummary = "";
    let aiSuggestions: Record<string, string> = {};

    if (transcript) {
      const customFields = await db.select().from(fields);
      let lead: typeof leads.$inferSelect | null = null;
      if (call.leadId) {
        const [row] = await db.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
        lead = row || null;
      }
      const insights = await extractLeadInsights(
        config,
        transcript,
        lead || {},
        customFields.map((f: { id: string; label: string; type: string }) => ({ id: f.id, label: f.label, type: f.type })),
      );
      aiSummary = insights.summary;
      aiSuggestions = insights.suggestions;
    }

    const [updated] = await db.update(calls).set({
      transcript,
      transcriptStatus: transcript ? "done" : "failed",
      aiSummary,
      aiSuggestions,
      updatedAt: new Date(),
    }).where(eq(calls.id, callId)).returning();

    const autoFill = opts?.autoFill ?? config.autoFillLead;
    if (autoFill && call.leadId && Object.keys(aiSuggestions).length) {
      await applyAiSuggestionsToLead(call.leadId, aiSuggestions, transcript, aiSummary);
    }

    broadcastToAll("call_transcript", { call: updated, leadId: call.leadId });
    await dispatchNotification({
      kind: "callTranscript",
      text: `Расшифровка готова: ${call.phone}${aiSummary ? ` — ${aiSummary.slice(0, 80)}` : ""}`,
      leadId: call.leadId || undefined,
      callId: call.id,
      event: "call_transcript",
    });

    return updated;
  } catch (e) {
    await db.update(calls).set({ transcriptStatus: "failed", updatedAt: new Date() }).where(eq(calls.id, callId));
    logger.warn("call.transcribe_failed", { callId, err: (e as Error).message });
    throw e;
  }
}

export async function applyAiSuggestionsToLead(
  leadId: string,
  suggestions: Record<string, string>,
  transcript?: string,
  summary?: string,
) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new Error("Лид не найден");

  const patch: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
  const custom = { ...(lead.custom || {}) };

  for (const [k, v] of Object.entries(suggestions)) {
    if (k === "comment" || k === "region" || k === "preferredTime" || k === "name") {
      (patch as Record<string, string>)[k] = v;
    } else if (k.startsWith("field_")) {
      custom[k.slice(6)] = v;
    } else {
      custom[k] = v;
    }
  }
  if (Object.keys(custom).length) patch.custom = custom;

  const [updated] = await db.update(leads).set(patch).where(eq(leads.id, leadId)).returning();

  const noteParts = [summary || "AI: данные из звонка"];
  if (transcript) noteParts.push(transcript.slice(0, 500) + (transcript.length > 500 ? "…" : ""));
  await db.insert(leadNotes).values({
    leadId,
    text: noteParts.join("\n\n"),
    author: "AI · телефония",
  });

  return updated;
}

export function scheduleTranscription(callId: string) {
  setTimeout(() => {
    transcribeCallById(callId).catch((e) => {
      logger.warn("call.auto_transcribe_failed", { callId, err: (e as Error).message });
    });
  }, 500);
}
