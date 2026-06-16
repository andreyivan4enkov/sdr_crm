import type { TelephonyAdapter, NormalizedCallEvent } from "../types.js";

export const asteriskAdapter: TelephonyAdapter = {
  name: "asterisk",
  parse(body: unknown, query: Record<string, string>) {
    const data = { ...(body as Record<string, unknown>), ...query };
    const phone = String(data.callerid || data.CallerIDNum || data.phone || "");
    if (!phone) return null;

    const event = String(data.event || data.Event || "Newchannel");
    const eventMap: Record<string, NormalizedCallEvent["event"]> = {
      Newchannel: "incoming_call",
      Dial: "outgoing_call",
      Hangup: "call_end",
      Bridge: "call_answer",
    };

    return {
      event: eventMap[event] || "incoming_call",
      phone,
      externalId: data.uniqueid ? String(data.uniqueid) : undefined,
      duration: data.duration ? Number(data.duration) : 0,
      direction: data.direction === "outbound" ? "outbound" : "inbound",
      raw: data,
    };
  },
};
