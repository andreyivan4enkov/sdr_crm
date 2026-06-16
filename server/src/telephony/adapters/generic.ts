import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";

export const genericAdapter: TelephonyAdapter = {
  name: "generic",
  parse(body: unknown) {
    const b = body as Record<string, unknown>;
    if (!b.phone && !b.caller) return null;
    return {
      event: (b.event as NormalizedCallEvent["event"]) || "incoming_call",
      phone: String(b.phone || b.caller),
      externalId: b.call_id ? String(b.call_id) : b.externalId ? String(b.externalId) : undefined,
      duration: b.duration ? Number(b.duration) : 0,
      recordingUrl: b.recording_url ? String(b.recording_url) : undefined,
      direction: b.direction === "outbound" ? "outbound" : "inbound",
      raw: body,
    };
  },
};
