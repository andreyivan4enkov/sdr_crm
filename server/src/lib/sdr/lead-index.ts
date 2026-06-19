import {
  SparseDistributedMemory,
  packSdr,
  unpackSdr,
  bytesToPacked,
  packedToBytes,
} from "@sdr-crm/sdr-core";
import { db } from "../../db/index.js";
import { leads, leadSdrVectors } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { encodeLeadRecord, encodeSearchQuery, type LeadSdrFields } from "./encode.js";
import { sdrConfig } from "./config.js";

export class LeadSdrIndex {
  private sdm: SparseDistributedMemory;
  private ready = false;
  private readonly wordCount: number;

  constructor() {
    const cfg = { dimensions: sdrConfig.dimensions, activeBits: sdrConfig.activeBits };
    this.wordCount = (cfg.dimensions + 31) >>> 5;
    this.sdm = new SparseDistributedMemory(cfg, 0.15, sdrConfig.searchRadius);
  }

  isReady() {
    return this.ready;
  }

  async init() {
    if (!sdrConfig.indexOnStart) {
      this.ready = true;
      return;
    }
    await this.rebuildFromDb();
  }

  async rebuildFromDb() {
    const t0 = Date.now();
    const cfg = { dimensions: sdrConfig.dimensions, activeBits: sdrConfig.activeBits };
    this.sdm = new SparseDistributedMemory(cfg, 0.15, sdrConfig.searchRadius);

    const vectorRows = await db.select().from(leadSdrVectors);
    if (vectorRows.length > 0) {
      for (const row of vectorRows) {
        const packed = bytesToPacked(Buffer.from(row.vector, "base64"), this.wordCount);
        const vec = unpackSdr(packed, cfg.dimensions);
        this.sdm.store(row.leadId, vec);
      }
      this.ready = true;
      logger.info("sdr.index.loaded_vectors", { count: vectorRows.length, ms: Date.now() - t0 });
      return;
    }

    const batchSize = 500;
    let offset = 0;
    let total = 0;
    for (;;) {
      const batch = await db
        .select({
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          region: leads.region,
          comment: leads.comment,
        })
        .from(leads)
        .limit(batchSize)
        .offset(offset);
      if (!batch.length) break;
      for (const row of batch) {
        if (total >= sdrConfig.maxLeads) break;
        this.upsertMemory(row);
        total++;
      }
      if (batch.length < batchSize || total >= sdrConfig.maxLeads) break;
      offset += batchSize;
    }
    this.ready = true;
    logger.info("sdr.index.rebuilt", { count: total, ms: Date.now() - t0 });
  }

  private upsertMemory(lead: LeadSdrFields) {
    const vec = encodeLeadRecord(lead);
    this.sdm.store(lead.id, vec);
    return vec;
  }

  async upsert(lead: LeadSdrFields) {
    const vec = this.upsertMemory(lead);
    const packed = packSdr(vec);
    const encoded = packedToBytes(packed).toString("base64");
    await db
      .insert(leadSdrVectors)
      .values({ leadId: lead.id, vector: encoded, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: leadSdrVectors.leadId,
        set: { vector: encoded, updatedAt: new Date() },
      });
  }

  async remove(leadId: string) {
    this.sdm.remove(leadId);
    try {
      await db.delete(leadSdrVectors).where(eq(leadSdrVectors.leadId, leadId));
    } catch (e) {
      logger.logError(e, "sdr.index.remove_failed", { leadId });
    }
  }

  search(query: string, limit = sdrConfig.recallLimit): string[] {
    if (!query.trim()) return [];
    const hits = this.sdm.recallMany(encodeSearchQuery(query), limit);
    return hits.map((h) => h.id);
  }

  size() {
    return this.sdm.size();
  }
}

export const leadSdrIndex = new LeadSdrIndex();

const retryQueue: LeadSdrFields[] = [];
let retryTimer: ReturnType<typeof setInterval> | null = null;

export function queueSdrUpsert(lead: LeadSdrFields) {
  retryQueue.push(lead);
  if (!retryTimer) {
    retryTimer = setInterval(() => {
      void flushSdrRetryQueue();
    }, 5000);
    retryTimer.unref?.();
  }
}

async function flushSdrRetryQueue() {
  while (retryQueue.length) {
    const lead = retryQueue.shift()!;
    try {
      await leadSdrIndex.upsert(lead);
    } catch (e) {
      logger.logError(e, "sdr.index.retry_failed", { leadId: lead.id });
      retryQueue.unshift(lead);
      break;
    }
  }
}

export async function indexLeadAfterWrite(lead: LeadSdrFields) {
  try {
    await leadSdrIndex.upsert(lead);
  } catch (e) {
    logger.logError(e, "sdr.index.upsert_failed", { leadId: lead.id });
    queueSdrUpsert(lead);
  }
}
