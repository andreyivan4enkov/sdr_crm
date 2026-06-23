import type { ReactorGraph, ReactorGraphKind, V3Node } from "./types.js";
import { isV3NodeType, V3_NODE_DEFS } from "./nodes.js";
import { REACTOR_EVENT_IDS } from "./events.js";
import { getV3Ports } from "./ports.js";

export type GraphValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type GraphValidationResult = {
  ok: boolean;
  errors: GraphValidationIssue[];
  warnings: GraphValidationIssue[];
};

function push(
  list: GraphValidationIssue[],
  path: string,
  code: string,
  message: string,
) {
  list.push({ path, code, message });
}

export function validateReactorGraph(
  graph: ReactorGraph,
  kind: ReactorGraphKind,
): GraphValidationResult {
  const errors: GraphValidationIssue[] = [];
  const warnings: GraphValidationIssue[] = [];
  const byId = new Map<string, V3Node>();

  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const base = `nodes[${i}]`;
    if (!n.id) push(errors, `${base}.id`, "required", "id обязателен");
    if (byId.has(n.id)) push(errors, `${base}.id`, "duplicate", `Дубликат id: ${n.id}`);
    else byId.set(n.id, n);

    if (!isV3NodeType(n.type)) {
      push(errors, `${base}.type`, "unknown_type", `Неизвестный тип: ${n.type}`);
      continue;
    }

    const def = V3_NODE_DEFS[n.type];
    const op = n.cfg?.op || def.defaultCfg.op || def.defaultCfg.mode;
    if (n.type === "pulse" && n.cfg?.event && !REACTOR_EVENT_IDS.has(n.cfg.event)) {
      push(warnings, `${base}.cfg.event`, "unknown_event", `Событие ${n.cfg.event} не в каталоге`);
    }
    if (n.type === "face" && kind === "view" && n.cfg?.op === "host") {
      push(errors, `${base}.cfg.host`, "forbidden_host", "face.host запрещён — используйте op=component + workspace.module");
    }
    if (op && def.ops.length && !def.ops.includes(op) && n.type !== "pulse") {
      push(warnings, `${base}.cfg.op`, "unknown_op", `op «${op}» не в списке ${def.ops.join(", ")}`);
    }
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    const base = `edges[${i}]`;
    if (!byId.has(e.from.node)) push(errors, `${base}.from`, "dangling", `from ${e.from.node} не существует`);
    if (!byId.has(e.to.node)) push(errors, `${base}.to`, "dangling", `to ${e.to.node} не существует`);
    // Проверка совместимости kind ребра с типами портов
    const fromNode = byId.get(e.from.node);
    const toNode = byId.get(e.to.node);
    if (fromNode && toNode && isV3NodeType(fromNode.type) && isV3NodeType(toNode.type)) {
      const fromPorts = getV3Ports(fromNode);
      const toPorts = getV3Ports(toNode);
      const fromPort = fromPorts.out.find((p) => p.id === e.from.port);
      const toPort = toPorts.in.find((p) => p.id === e.to.port);
      if (fromPort && toPort && fromPort.kind !== toPort.kind) {
        push(errors, `${base}.kind`, "port_kind_mismatch",
          `Несовместимые порты: ${e.from.node}.${e.from.port}(${fromPort.kind}) → ${e.to.node}.${e.to.port}(${toPort.kind})`);
      }
    }
    if (kind === "flow" && e.kind === "data") {
      push(warnings, `${base}.kind`, "flow_data_edge", "data-ребро в flow-графе");
    }
  }

  if (kind === "flow" && !graph.nodes.some((n) => n.type === "pulse")) {
    push(warnings, "nodes", "no_pulse", "Flow без pulse-триггера");
  }

  return { ok: errors.length === 0, errors, warnings };
}