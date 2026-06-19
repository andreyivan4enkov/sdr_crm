export type SdrCfg = { dimensions: number; activeBits: number };

export type SessionEvent = { type: string; bytes: number; hour: number };

export type EventModel = {
  typeCounts: Map<string, number>;
  hourCounts: number[];
  byteBins: number[];
  n: number;
};

export type LeadEncodeInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
  comment?: string | null;
};

export type PipelineCAResult = {
  stability: number;
  bottleneck: number;
  occupancyCounts: Uint32Array;
  finalState: Uint8Array;
  generations: number;
};

export type HardwareEntropyPacket = {
  source: "native-ipc-stub";
  bytes: Uint8Array;
  timestampMs: number;
  daemonConnected: boolean;
};

export type FptmClause = { positives: number[]; negatives: number[] };
