import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";
import { beelineRecordDownloadUrl } from "../beeline-api.js";

function pickPhone(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).replace(/^tel:/i, "").trim();
    const digits = s.replace(/\D/g, "");
    if (digits.length >= 10) return s.startsWith("+") ? s : `+${digits.startsWith("7") ? digits : `7${digits.slice(-10)}`}`;
  }
  return "";
}

function mapBeelineEvent(name: string, direction?: string): NormalizedCallEvent["event"] {
  const n = name.toLowerCase();
  if (/released|completed|finish|end|disconnect/.test(n)) return "call_end";
  if (/answered|established|bridge/.test(n)) return "call_answer";
  if (/originated|outgoing|dial/.test(n) || direction === "OUTBOUND") return "outgoing_call";
  return "incoming_call";
}

function parseBeelineJson(body: Record<string, unknown>): NormalizedCallEvent | null {
  const nested = (body.data || body.event || body.payload || body.call) as Record<string, unknown> | undefined;
  const src = { ...body, ...(nested && typeof nested === "object" ? nested : {}) };

  const phone = pickPhone(
    src.phone, src.clientPhone, src.caller, src.from, src.ani, src.aNumber,
    src.remotePhone, src.externalNumber,
    (src.remoteParty as Record<string, unknown>)?.address,
    (src.callingParty as Record<string, unknown>)?.address,
  );
  if (!phone) return null;

  const dirRaw = String(src.direction || src.callDirection || src.type || "").toUpperCase();
  const direction: "inbound" | "outbound" = /OUT|OUTBOUND|ИСХ/.test(dirRaw) ? "outbound" : "inbound";

  const eventName = String(src.event || src.eventType || src.state || src.status || src.callState || "");
  const externalId = src.callId || src.call_id || src.id || src.externalId || src.conversationId;
  const recordId = src.recordId || src.record_id || src.recordingId;

  let duration = 0;
  if (src.duration != null) {
    const d = Number(src.duration);
    duration = d > 10000 ? Math.round(d / 1000) : d;
  } else if (src.talkTime != null) {
    duration = Number(src.talkTime);
  }

  return {
    event: mapBeelineEvent(eventName, direction),
    phone,
    externalId: externalId ? String(externalId) : undefined,
    duration,
    recordingUrl: recordId ? beelineRecordDownloadUrl(String(recordId)) : undefined,
    direction,
    raw: body,
  };
}

function parseBeelineXml(xml: string): NormalizedCallEvent | null {
  const eventMatch = xml.match(/<(Call[A-Za-z]+Event)/);
  const eventName = eventMatch?.[1] || "CallReceivedEvent";

  const phone = pickPhone(
    xml.match(/<address[^>]*>(?:tel:)?([^<]+)/i)?.[1],
    xml.match(/remoteParty[\s\S]*?<address[^>]*>(?:tel:)?([^<]+)/i)?.[1],
    xml.match(/<phone[^>]*>([^<]+)/i)?.[1],
  );
  if (!phone) return null;

  const callId = xml.match(/<callId[^>]*>([^<]+)/i)?.[1]
    || xml.match(/<extTrackingId[^>]*>([^<]+)/i)?.[1];
  const recordId = xml.match(/<recordId[^>]*>([^<]+)/i)?.[1];
  const direction = /Outbound|Originating/i.test(xml) ? "outbound" : "inbound";

  return {
    event: mapBeelineEvent(eventName, direction),
    phone,
    externalId: callId,
    recordingUrl: recordId ? beelineRecordDownloadUrl(recordId) : undefined,
    direction,
    raw: xml,
  };
}

export const beelineAdapter: TelephonyAdapter = {
  name: "beeline",
  parse(body: unknown, query: Record<string, string>) {
    if (typeof body === "string") {
      if (body.trim().startsWith("<")) return parseBeelineXml(body);
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        return parseBeelineJson(j);
      } catch {
        return null;
      }
    }
    if (body && typeof body === "object") {
      const parsed = parseBeelineJson(body as Record<string, unknown>);
      if (parsed) return parsed;
    }
    if (query.phone || query.caller) {
      return {
        event: mapBeelineEvent(query.event || "incoming"),
        phone: pickPhone(query.phone, query.caller),
        externalId: query.callId || query.call_id,
        direction: query.direction === "outbound" ? "outbound" : "inbound",
        raw: { body, query },
      };
    }
    return null;
  },
};
