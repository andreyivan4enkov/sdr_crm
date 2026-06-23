import { VaCoAlGraph, createSdr, gf2Diffuse, Lfsr, mulberry32, type SdrCfg } from "@sdr-crm/sdr-core";
import { db } from "../../db/index.js";
import { leads, tasks, leadNotes, calls } from "../../db/schema.js";
import { isNotNull } from "drizzle-orm";
import { logger } from "../logger.js";
import { sdrConfig } from "./config.js";

const GRAPH_CFG: SdrCfg = { dimensions: 512, activeBits: 16 };

export class LeadSdrGraph {
  private graph = new VaCoAlGraph();
  private ready = false;

  async init() {
    if (!sdrConfig.graph) {
      this.ready = true;
      return;
    }
    const t0 = Date.now();
    const leadRows = await db.select({ id: leads.id }).from(leads).limit(50_000);
    const lfsr = new Lfsr(0xdeadbeef);
    for (let i = 0; i < leadRows.length; i++) {
      const id = leadRows[i]!.id;
      const sdr = gf2Diffuse(createSdr(mulberry32(i + 404), GRAPH_CFG), 3, lfsr);
      this.graph.addNode({ id, sdr, edges: [] });
    }
    const [taskRows, noteRows, callRows] = await Promise.all([
      db.select({ id: tasks.id, leadId: tasks.leadId }).from(tasks).where(isNotNull(tasks.leadId)),
      db.select({ id: leadNotes.id, leadId: leadNotes.leadId }).from(leadNotes),
      db.select({ id: calls.id, leadId: calls.leadId }).from(calls).where(isNotNull(calls.leadId)),
    ]);
    for (const t of taskRows) {
      if (!t.leadId) continue;
      const nodeId = `task:${t.id}`;
      const sdr = gf2Diffuse(createSdr(mulberry32(nodeId.length + 7), GRAPH_CFG), 2, lfsr);
      this.graph.addNode({ id: nodeId, sdr, edges: [t.leadId] });
      this.graph.link(t.leadId, nodeId);
    }
    for (const n of noteRows) {
      const nodeId = `note:${n.id}`;
      const sdr = gf2Diffuse(createSdr(mulberry32(nodeId.length + 3), GRAPH_CFG), 2, lfsr);
      this.graph.addNode({ id: nodeId, sdr, edges: [n.leadId] });
      this.graph.link(n.leadId, nodeId);
    }
    for (const c of callRows) {
      if (!c.leadId) continue;
      const nodeId = `call:${c.id}`;
      const sdr = gf2Diffuse(createSdr(mulberry32(nodeId.length + 11), GRAPH_CFG), 2, lfsr);
      this.graph.addNode({ id: nodeId, sdr, edges: [c.leadId] });
      this.graph.link(c.leadId, nodeId);
    }
    this.ready = true;
    logger.info("sdr.graph.ready", { leads: leadRows.length, ms: Date.now() - t0 });
  }

  isReady() {
    return this.ready;
  }

  multiHop(leadId: string, hops: number) {
    const query = this.graph.getNodeSdr(leadId);
    if (!query) return [];
    return this.graph.multiHopSearch(leadId, query, hops);
  }

  /** Percolation expansion: BFS with vector similarity threshold; tau at first component-size jump. */
  percolationExpand(seedId: string, minSimilarity = 0.82): string[] {
    const seedSdr = this.graph.getNodeSdr(seedId);
    if (!seedSdr) return [];

    const allIds = this.graph.nodeIds();
    const adj = new Map<string, Set<string>>();
    for (const id of allIds) {
      const neighbors = new Set(this.graph.neighbors(id));
      for (const other of allIds) {
        if (other !== id && this.graph.sdrSimilarity(id, other) >= minSimilarity) {
          neighbors.add(other);
        }
      }
      adj.set(id, neighbors);
    }

    const bfs = (tau: number) => {
      const visited = new Set<string>();
      const queue = [seedId];
      while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        if (this.graph.sdrSimilarity(seedId, cur) < tau) continue;
        visited.add(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!visited.has(nb)) queue.push(nb);
        }
      }
      return visited;
    };

    let prevSize = 0;
    let bestSet = bfs(minSimilarity);
    for (let tau = 0.95; tau >= 0.5; tau -= 0.05) {
      const comp = bfs(tau);
      const jump = comp.size - prevSize;
      if (jump >= 2 && prevSize > 0) {
        bestSet = comp;
        break;
      }
      prevSize = comp.size;
      if (comp.size > bestSet.size) bestSet = comp;
    }

    return [...bestSet].filter((id) => id !== seedId).slice(0, 50);
  }
}

export const leadSdrGraph = new LeadSdrGraph();
