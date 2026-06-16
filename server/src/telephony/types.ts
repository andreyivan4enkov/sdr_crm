export type NormalizedCallEvent = {
  event: "incoming_call" | "outgoing_call" | "call_end" | "call_answer";
  phone: string;
  externalId?: string;
  duration?: number;
  recordingUrl?: string;
  direction: "inbound" | "outbound";
  raw?: unknown;
};

export type TelephonyAdapter = {
  name: string;
  parse: (body: unknown, query: Record<string, string>) => NormalizedCallEvent | NormalizedCallEvent[] | null;
};
