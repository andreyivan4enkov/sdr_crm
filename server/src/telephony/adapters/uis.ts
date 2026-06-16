import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";

export const uisAdapter: TelephonyAdapter = {
  name: "uis",
  parse(body: unknown) {
    const b = body as Record<string, unknown>;
    const phone = String(b.caller_number || b.contact_phone_number || b.phone || "");
    if (!phone) return null;

    const status = String(b.call_status || b.status || "start");
    const eventMap: Record<string, NormalizedCallEvent["event"]> = {
      start: "incoming_call",
      answer: "call_answer",
      end: "call_end",
    };

    return {
      event: eventMap[status] || "incoming_call",
      phone,
      externalId: b.call_session_id ? String(b.call_session_id) : undefined,
      duration: b.duration ? Number(b.duration) : 0,
      recordingUrl: b.record_url ? String(b.record_url) : undefined,
      direction: b.direction === "out" ? "outbound" : "inbound",
      raw: body,
    };
  },
};
