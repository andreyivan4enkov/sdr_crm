export type {
  SdrCfg,
  SessionEvent,
  EventModel,
  LeadEncodeInput,
  PipelineCAResult,
  HardwareEntropyPacket,
  FptmClause,
} from "./types.js";

export { mulberry32, createSdr, Lfsr, flipBits, sparsity } from "./prng.js";
export {
  POP8,
  popcount32,
  packSdr,
  unpackSdr,
  packedToBytes,
  bytesToPacked,
  hammingPacked,
  hammingDistance,
  activeIndices,
} from "./hamming.js";
export { SparseDistributedMemory } from "./sdm.js";
export { permuteShift, bindBlockLocal, unbindBlockLocal, bindingAccuracy, gf2Diffuse } from "./vsa.js";
export { VaCoAlGraph, VaCoAlIndex } from "./vacoal.js";
export { Fptm, bitInfer } from "./fptm.js";
export { buildEventModel, eventSurprisalBits, DEFAULT_AUDIT_SURPRISAL_THRESHOLD } from "./surprisal.js";
export {
  elementaryCAStep,
  localStructureHistogram,
  histogramL1Distance,
  runPipelineCA,
  funnelCaDensity,
} from "./ca-rule184.js";
export { NativeIPCBridge } from "./native-ipc.js";
export { DEFAULT_LEAD_SDR_CFG, encodeLeadSdr, encodeQuery } from "./encode-lead.js";
