import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";

export const mangoAdapter: TelephonyAdapter = {
  name: "mango",
  parse(body: unknown) {
    const b = body as Record<string, unknown>;
    const json = typeof b.json === "string" ? JSON.parse(b.json) : b;
    const data = json as Record<string, unknown>;
    const entry = data.entry_id || data.call_id;
    const from = data.from || data.from_number;
    const to = data.to || data.to_number;
    const phone = String(from || to || "");
    if (!phone) return null;

    const eventMap: Record<string, NormalizedCallEvent["event"]> = {
      "call.start": "incoming_call",
      "call.answer": "call_answer",
      "call.finish": "call_end",
    };

    return {
      event: eventMap[String(data.call_state || data.event || "call.start")] || "incoming_call",
      phone,
      externalId: entry ? String(entry) : undefined,
      duration: data.talk_time ? Number(data.talk_time) : 0,
      recordingUrl: data.recording ? String(data.recording) : undefined,
      direction: data.direction === "out" ? "outbound" : "inbound",
      raw: body,
    };
  },
};
