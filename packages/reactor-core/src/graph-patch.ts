import type { ReactorGraph, V3Edge, V3Node } from "./types.js";

export type GraphPatchInput = {
  nodes?: V3Node[];
  edges?: V3Edge[];
  remove?: string[];
};

/** Сжатое представление графа для LLM-контекста (без координат при большом размере). */
export function summarizeGraphForAi(graph: ReactorGraph | undefined, maxNodes = 60): string {
  if (!graph?.nodes?.length) return "(пустой граф)";
  if (graph.nodes.length <= maxNodes) {
    return JSON.stringify(graph, null, 0);
  }
  return JSON.stringify({
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, cfg: n.cfg })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: e.kind,
    })),
    _truncated: `${graph.nodes.length} nodes, coords omitted`,
  });
}

/** Инкрементальный patch: добавить/обновить ноды и рёбра, удалить по id. */
export function applyGraphPatch(
  graph: ReactorGraph,
  patch: GraphPatchInput,
  action: "build" | "patch" = "patch",
): ReactorGraph {
  if (action === "build" && patch.nodes?.length) {
    return {
      nodes: patch.nodes,
      edges: patch.edges ?? [],
    };
  }

  const removeSet = new Set(patch.remove ?? []);
  const nodes = graph.nodes
    .filter((n) => !removeSet.has(n.id))
    .map((n) => ({ ...n, cfg: { ...n.cfg } }));

  const edges = graph.edges.filter(
    (e) =>
      !removeSet.has(e.id)
      && !removeSet.has(e.from.node)
      && !removeSet.has(e.to.node),
  );

  for (const rn of patch.nodes ?? []) {
    const idx = nodes.findIndex((n) => n.id === rn.id);
    if (idx >= 0) {
      nodes[idx] = {
        ...nodes[idx],
        ...rn,
        cfg: { ...nodes[idx].cfg, ...rn.cfg },
      };
    } else {
      nodes.push({ ...rn });
    }
  }

  for (const re of patch.edges ?? []) {
    const idx = edges.findIndex((e) => e.id === re.id);
    if (idx >= 0) {
      edges[idx] = { ...re };
    } else {
      edges.push({ ...re });
    }
  }

  return { nodes, edges };
}

export type GraphDiffSummary = {
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
};

export function diffGraphs(before: ReactorGraph | undefined, after: ReactorGraph | undefined): GraphDiffSummary {
  const bNodes = new Set(before?.nodes.map((n) => n.id) ?? []);
  const aNodes = new Set(after?.nodes.map((n) => n.id) ?? []);
  const bEdges = new Set(before?.edges.map((e) => e.id) ?? []);
  const aEdges = new Set(after?.edges.map((e) => e.id) ?? []);

  return {
    nodesAdded: [...aNodes].filter((id) => !bNodes.has(id)).length,
    nodesRemoved: [...bNodes].filter((id) => !aNodes.has(id)).length,
    edgesAdded: [...aEdges].filter((id) => !bEdges.has(id)).length,
    edgesRemoved: [...bEdges].filter((id) => !aEdges.has(id)).length,
  };
}
