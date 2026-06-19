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
}

export const leadSdrGraph = new LeadSdrGraph();
