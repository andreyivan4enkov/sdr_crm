import type { ReactorGraph } from "./types.js";

export const MASK_STYLES_NODE_ID = "mask-styles-root";
export const MASK_COMPONENT_PREFIX = "component:" as const;
export const MASK_ELEMENT_PREFIX = "element:" as const;

export type MaskStyleKeyKind = "component" | "element";

export type ParsedMaskStyleKey = {
  kind: MaskStyleKeyKind;
  value: string;
};

export type MaskElementStyle = Record<string, string>;
export type MaskStylesMap = Record<string, MaskElementStyle>;

/** Человекочитаемые названия инфоблоков (data-mask-component). */
export const MASK_COMPONENT_LABELS: Record<string, string> = {
  "kanban.card": "Карточка лида (канбан)",
  "kanban.column": "Колонка этапа",
  "kanban.pipeline": "Канбан воронки",
  "aggregation.canvas": "Граф агрегации",
};

/** id экземпляра сущности (лид, этап) — не ключ для стилей. */
export function isInstanceMaskId(id: string): boolean {
  if (/^kanban\.(card|col)\./.test(id)) return true;
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(id);
}

/** Канонический ключ хранения: component:… (инфоблок) или element:… (одиночный UI). */
export function canonicalMaskStyleKey(rawKey: string): string {
  if (rawKey.startsWith(MASK_COMPONENT_PREFIX) || rawKey.startsWith(MASK_ELEMENT_PREFIX)) {
    return rawKey;
  }
  if (/^kanban\.card\./.test(rawKey)) return `${MASK_COMPONENT_PREFIX}kanban.card`;
  if (/^kanban\.col\./.test(rawKey)) return `${MASK_COMPONENT_PREFIX}kanban.column`;
  return `${MASK_ELEMENT_PREFIX}${rawKey}`;
}

export function parseMaskStyleKey(key: string): ParsedMaskStyleKey {
  const canonical = canonicalMaskStyleKey(key);
  if (canonical.startsWith(MASK_COMPONENT_PREFIX)) {
    return { kind: "component", value: canonical.slice(MASK_COMPONENT_PREFIX.length) };
  }
  return { kind: "element", value: canonical.slice(MASK_ELEMENT_PREFIX.length) };
}

/** Ключ стилей для выбранного DOM-элемента маски. */
export function maskStyleKeyForTarget(maskId: string, component?: string): string {
  if (component) return `${MASK_COMPONENT_PREFIX}${component}`;
  return `${MASK_ELEMENT_PREFIX}${maskId}`;
}

/** Сливает legacy-ключи (kanban.card.{leadId}) в инфоблоки при загрузке/сохранении. */
export function normalizeMaskStylesMap(raw: MaskStylesMap): MaskStylesMap {
  const out: MaskStylesMap = {};
  for (const [key, style] of Object.entries(raw)) {
    if (!style || typeof style !== "object") continue;
    const k = canonicalMaskStyleKey(key);
    const cleaned = Object.fromEntries(
      Object.entries(style).filter(([, v]) => v != null && v !== ""),
    ) as MaskElementStyle;
    if (Object.keys(cleaned).length === 0) continue;
    out[k] = { ...(out[k] ?? {}), ...cleaned };
  }
  return out;
}

export function maskComponentLabel(component: string): string {
  return MASK_COMPONENT_LABELS[component] ?? component;
}

/** CSS-селектор для ключа стилей (runtime или режим редактирования). */
export function maskStyleSelector(
  styleKey: string,
  scope: "mask-edit" | "runtime" = "mask-edit",
): string {
  const parsed = parseMaskStyleKey(styleKey);
  const esc = parsed.value.replace(/"/g, '\\"');
  const attr = parsed.kind === "component"
    ? `[data-mask-component="${esc}"]`
    : `[data-mask-id="${esc}"]`;
  return scope === "runtime" ? attr : `.mask-edit-body ${attr}`;
}

/** Сохраняет ноду ручных стилей маски при AI-редактировании view-графа. */
export function preserveMaskStylesNode(existing: ReactorGraph | undefined, incoming: ReactorGraph): ReactorGraph {
  if (!existing?.nodes?.length) return incoming;
  const maskNode = existing.nodes.find(
    (n) => n.id === MASK_STYLES_NODE_ID || n.cfg?.op === "mask-styles",
  );
  if (!maskNode) return incoming;
  const nodes = incoming.nodes.filter(
    (n) => n.id !== MASK_STYLES_NODE_ID && n.cfg?.op !== "mask-styles",
  );
  return { ...incoming, nodes: [...nodes, maskNode] };
}

/**
 * Сливает AI-стили поверх существующих при редактировании маски через чат.
 * AI выигрывает на пересекающихся ключах; ручные стили для других ключей сохраняются.
 */
export function mergeMaskStylesNode(existing: ReactorGraph | undefined, incoming: ReactorGraph): ReactorGraph {
  const existingMaskNode = existing?.nodes?.find(
    (n) => n.id === MASK_STYLES_NODE_ID || n.cfg?.op === "mask-styles",
  );
  const existingStyles = parseStylesJson(existingMaskNode?.cfg?.styles);

  const incomingMaskNode = incoming.nodes.find(
    (n) => n.id === MASK_STYLES_NODE_ID || n.cfg?.op === "mask-styles",
  );
  const incomingStyles = parseStylesJson(incomingMaskNode?.cfg?.styles);

  const merged: MaskStylesMap = { ...existingStyles };
  for (const [key, style] of Object.entries(incomingStyles)) {
    merged[key] = { ...(merged[key] ?? {}), ...style };
  }
  const mergedNormalized = normalizeMaskStylesMap(merged);

  const nodesWithoutMask = incoming.nodes.filter(
    (n) => n.id !== MASK_STYLES_NODE_ID && n.cfg?.op !== "mask-styles",
  );

  const mergedMaskNode = {
    id: MASK_STYLES_NODE_ID,
    type: "face" as const,
    x: 0,
    y: 0,
    cfg: { op: "mask-styles", role: "design", styles: JSON.stringify(mergedNormalized) },
  };

  return { ...incoming, nodes: [...nodesWithoutMask, mergedMaskNode] };
}

function parseStylesJson(raw: string | undefined): MaskStylesMap {
  if (!raw) return {};
  try {
    return normalizeMaskStylesMap(JSON.parse(raw) as MaskStylesMap);
  } catch {
    return {};
  }
}

/** Точечное обновление стилей инфоблока в view-графе (без полного compose). */
export function patchMaskStylesInGraph(
  viewGraph: ReactorGraph,
  styleKey: string,
  patch: MaskElementStyle,
): ReactorGraph {
  const key = canonicalMaskStyleKey(styleKey);
  const nodes = viewGraph.nodes.map((n) => ({ ...n, cfg: { ...n.cfg } }));
  let maskIdx = nodes.findIndex(
    (n) => n.id === MASK_STYLES_NODE_ID || n.cfg?.op === "mask-styles",
  );

  if (maskIdx < 0) {
    nodes.push({
      id: MASK_STYLES_NODE_ID,
      type: "face",
      x: 0,
      y: 0,
      cfg: { op: "mask-styles", role: "design", styles: "{}" },
    });
    maskIdx = nodes.length - 1;
  }

  const styles = parseStylesJson(nodes[maskIdx]!.cfg.styles);
  const merged = { ...(styles[key] ?? {}), ...patch };
  const cleaned = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v != null && v !== ""),
  ) as MaskElementStyle;

  if (Object.keys(cleaned).length === 0) {
    delete styles[key];
  } else {
    styles[key] = cleaned;
  }

  nodes[maskIdx] = {
    ...nodes[maskIdx]!,
    cfg: {
      ...nodes[maskIdx]!.cfg,
      op: "mask-styles",
      role: "design",
      styles: JSON.stringify(normalizeMaskStylesMap(styles)),
    },
  };

  return { ...viewGraph, nodes };
}
