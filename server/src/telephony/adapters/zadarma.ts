import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";

export const zadarmaAdapter: TelephonyAdapter = {
  name: "zadarma",
  parse(body: unknown, query: Record<string, string>) {
    const data = { ...(body as Record<string, unknown>), ...query };
    const phone = String(data.caller_id || data.caller || data.phone || "");
    if (!phone) return null;

    const event = String(data.event || data.notification || "NOTIFY_START");
    const eventMap: Record<string, NormalizedCallEvent["event"]> = {
      NOTIFY_START: "incoming_call",
      NOTIFY_ANSWER: "call_answer",
      NOTIFY_END: "call_end",
      NOTIFY_OUT_START: "outgoing_call",
    };

    return {
      event: eventMap[event] || "incoming_call",
      phone,
      externalId: data.pbx_call_id ? String(data.pbx_call_id) : undefined,
      duration: data.duration ? Number(data.duration) : 0,
      recordingUrl: data.recording_link ? String(data.recording_link) : (data.recording ? String(data.recording) : undefined),
      direction: event.includes("OUT") ? "outbound" : "inbound",
      raw: data,
    };
  },
};
