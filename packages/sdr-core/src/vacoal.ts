/** VaCoAl graph index for multi-hop SDR search. */
export class VaCoAlGraph {
  private nodes = new Map<string, { id: string; sdr: Uint8Array; edges: string[] }>();

  addNode(n: { id: string; sdr: Uint8Array; edges: string[] }) {
    this.nodes.set(n.id, n);
  }

  removeNode(id: string) {
    this.nodes.delete(id);
  }

  link(fromId: string, toId: string) {
    const node = this.nodes.get(fromId);
    if (!node) return;
    if (!node.edges.includes(toId)) node.edges.push(toId);
  }

  getNodeSdr(id: string): Uint8Array | undefined {
    return this.nodes.get(id)?.sdr;
  }

  multiHopSearch(startId: string, query: Uint8Array, hops: number) {
    let frontier = [startId];
    const visited = new Set<string>();
    const results: string[] = [];
    for (let h = 0; h < hops; h++) {
      const next: string[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        const node = this.nodes.get(id);
        if (!node) continue;
        let dist = 0;
        for (let i = 0; i < query.length; i++) if (node.sdr[i] !== query[i]) dist++;
        if (dist < query.length * 0.2) results.push(id);
        next.push(...node.edges);
      }
      frontier = next;
    }
    return results;
  }
}

/** @deprecated use VaCoAlGraph */
export const VaCoAlIndex = VaCoAlGraph;
