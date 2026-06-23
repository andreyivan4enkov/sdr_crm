import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { integrations } from "../db/schema.js";
import { fetchRecordingBuffer } from "../telephony/recording.js";
import { getAiRuntimeForModule } from "./ai-config.js";
import { aiFetchSignal } from "./ai-fetch.js";
import { compactFieldHints, maxTokensFor, trimText } from "./aiboard/ai-optimize.js";
import { resolveEffectiveProtocol } from "./aiboard/ai-providers.js";
import { yandexChatCompletion } from "./yandex-cloud/completion.js";
import { yandexTranscribeAudio } from "./yandex-cloud/speech.js";

export type AiTelephonyConfig = {
  aiEnabled?: boolean;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  whisperModel?: string;
  autoTranscribe?: boolean;
  autoFillLead?: boolean;
  recordingAuthHeader?: string;
};

export type AiConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  whisperModel: string;
  autoTranscribe: boolean;
  autoFillLead: boolean;
  recordingAuthHeader?: string;
  providerId?: string;
  folderId?: string;
  protocol?: string;
};

export async function getAiConfig(): Promise<AiConfig | null> {
  const rt = await getAiRuntimeForModule("calls");
  if (!rt) return null;
  const [tel] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  const tc = (tel?.config || {}) as AiTelephonyConfig;
  return {
    enabled: true,
    apiKey: rt.apiKey,
    baseUrl: rt.baseUrl,
    model: rt.model,
    whisperModel: rt.whisperModel,
    autoTranscribe: rt.autoTranscribe,
    autoFillLead: rt.autoFillLead,
    recordingAuthHeader: tc.recordingAuthHeader ? String(tc.recordingAuthHeader) : undefined,
    providerId: rt.preset.id,
    folderId: rt.folderId,
    protocol: rt.protocol,
  };
}

export async function transcribeAudio(config: AiConfig, recordingUrl: string): Promise<string> {
  const audio = await fetchRecordingBuffer(recordingUrl, config.recordingAuthHeader);

  if (config.providerId === "yandex" || config.providerId === "yandex_lite") {
    return yandexTranscribeAudio(Buffer.from(audio), {
      apiKey: config.apiKey,
      folderId: config.folderId,
      urlHint: recordingUrl,
    });
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), "recording.mp3");
  form.append("model", config.whisperModel);
  form.append("language", "ru");

  const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: aiFetchSignal(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.error || `Whisper HTTP ${res.status}`);
  return String(data.text || "").trim();
}

export type LeadFieldHint = { id: string; label: string; type: string };

export async function extractLeadInsights(
  config: AiConfig,
  transcript: string,
  lead: { name?: string | null; region?: string | null; comment?: string | null; preferredTime?: string | null },
  fields: LeadFieldHint[],
): Promise<{ summary: string; suggestions: Record<string, string> }> {
  const fieldList = compactFieldHints(fields, 10);
  const transcriptShort = trimText(transcript, 6000);
  const system = `CRM: верни JSON {"summary":"1-2 предложения","suggestions":{"comment?":"","region?":"","preferredTime?":"","field_<id>?":""}}. Только явные факты.`;
  const user = `Карточка: ${lead.name || "—"} | ${lead.region || "—"} | ${lead.preferredTime || "—"}
Поля: ${fieldList || "—"}
Звонок:\n${transcriptShort}`;

  const protocol = resolveEffectiveProtocol({
    protocol: config.protocol as import("./aiboard/ai-providers.js").AiProtocol | undefined,
    providerId: config.providerId,
    baseUrl: config.baseUrl,
    folderId: config.folderId,
  });

  if (protocol === "yandex") {
    const raw = await yandexChatCompletion({
      apiKey: config.apiKey,
      folderId: config.folderId,
      model: config.model,
      task: "lead_insights",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    let parsed: { summary?: string; suggestions?: Record<string, string> } = {};
    try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw); } catch { /* ignore */ }
    const suggestions: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.suggestions || {})) {
      if (typeof v === "string" && v.trim()) suggestions[k] = v.trim();
    }
    return { summary: String(parsed.summary || "").trim(), suggestions };
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: maxTokensFor("lead_insights"),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.error || `AI HTTP ${res.status}`);

  const raw = String(data.choices?.[0]?.message?.content || "{}");
  let parsed: { summary?: string; suggestions?: Record<string, string> } = {};
  try { parsed = JSON.parse(raw); } catch { /* ignore */ }

  const suggestions: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.suggestions || {})) {
    if (typeof v === "string" && v.trim()) suggestions[k] = v.trim();
  }
  return { summary: String(parsed.summary || "").trim(), suggestions };
}
