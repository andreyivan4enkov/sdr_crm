import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { integrations } from "../db/schema.js";
import { fetchRecordingBuffer } from "../telephony/recording.js";

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
};

export async function getAiConfig(): Promise<AiConfig | null> {
  const envKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
  const [row] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  const cfg = (row?.config || {}) as AiTelephonyConfig & Record<string, unknown>;
  const apiKey = String(cfg.aiApiKey || envKey || "");
  const enabled = Boolean(cfg.aiEnabled && apiKey);
  if (!enabled) return null;
  return {
    enabled: true,
    apiKey,
    baseUrl: String(cfg.aiBaseUrl || process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: String(cfg.aiModel || process.env.AI_MODEL || "gpt-4o-mini"),
    whisperModel: String(cfg.whisperModel || process.env.AI_WHISPER_MODEL || "whisper-1"),
    autoTranscribe: cfg.autoTranscribe !== false,
    autoFillLead: cfg.autoFillLead === true,
    recordingAuthHeader: cfg.recordingAuthHeader ? String(cfg.recordingAuthHeader) : undefined,
  };
}

export async function transcribeAudio(config: AiConfig, recordingUrl: string): Promise<string> {
  const audio = await fetchRecordingBuffer(recordingUrl, config.recordingAuthHeader);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), "recording.mp3");
  form.append("model", config.whisperModel);
  form.append("language", "ru");

  const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
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
  const fieldList = fields.map((f) => `- ${f.label} (${f.type}, id=${f.id})`).join("\n");
  const system = `Ты помощник CRM недвижимости. По расшифровке звонка верни JSON:
{"summary":"краткое резюме 1-3 предложения","suggestions":{"comment":"...","region":"...","preferredTime":"...","field_<id>":"..."}}
Заполняй только поля, о которых явно говорили. Пустые не включай.`;
  const user = `Текущая карточка: имя=${lead.name || "—"}, регион=${lead.region || "—"}, время=${lead.preferredTime || "—"}, комментарий=${lead.comment || "—"}
Доп. поля:\n${fieldList || "нет"}

Расшифровка:\n${transcript}`;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
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
