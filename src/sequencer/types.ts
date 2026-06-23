export type EntityType = "lead" | "deal" | "task" | "doc";

export type SectorKey = "delete" | "var1" | "var2" | "target" | "interact";

export type OverlayKind = "reason" | "comment" | "dictation" | "none";

export type InteractKind = "call" | "view" | "camera" | "checklist";

export type SequencerAction = {
  label: string;
  input: OverlayKind;
};

export type SequencerInteract = {
  label: string;
  kind: InteractKind;
  items?: string[];
};

export type SequencerItem = {
  id: string;
  type: EntityType;
  title: string;
  company: string;
  line1: string;
  line2: string;
  statusLabel: string;
  statusColor: string;
  priority: number;
  reason: string;
  interact: SequencerInteract;
  var1: SequencerAction;
  var2: SequencerAction;
  target: SequencerAction;
  /** Bit-vector fingerprint for topological gating */
  sdrBits: Uint8Array;
  sourceKind: "lead" | "task";
  sourceId: string;
};

export type DoneGlyph = { type: EntityType; color: string };

export const STATUS_COLORS = {
  blue: "#5B86C9",
  amber: "#E0A53F",
  green: "#4FA877",
  red: "#D8513B",
  slate: "#8893A6",
  interact: "#4E8C86",
} as const;

export const GEOMETRY = {
  CX: 201,
  PY: 268,
  R: 118,
  FAN: 76,
  NEUT: 14,
  ARCH: 88,
  RMIN: 48,
  FIG: 84,
} as const;
