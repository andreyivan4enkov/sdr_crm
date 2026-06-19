import type { SdrCfg } from "./types.js";
import { activeIndices, hammingPacked, packSdr } from "./hamming.js";

/** SDM: инвертированный индекс по активным битам SDR + упакованный Hamming (popcount). */
export class SparseDistributedMemory {
  private records = new Map<string, { packed: Uint32Array; active: number[] }>();
  private inverted = new Map<number, Set<string>>();
  private radius: number;
  private readonly k: number;
  private readonly packBuf: Uint32Array;
  private readonly voteScratch = new Map<string, number>();

  constructor(cfg: SdrCfg, radiusFraction = 0.15, explicitRadius?: number) {
    this.k = cfg.activeBits;
    this.radius = explicitRadius ?? Math.max(2, Math.floor(cfg.activeBits * radiusFraction));
    this.packBuf = new Uint32Array((cfg.dimensions + 31) >>> 5);
  }

  private packInto(vec: Uint8Array): Uint32Array {
    this.packBuf.fill(0);
    for (let i = 0; i < vec.length; i++) if (vec[i]) this.packBuf[i >>> 5]! |= 1 << (i & 31);
    return this.packBuf;
  }

  private index(id: string, active: number[]) {
    for (const bit of active) {
      let set = this.inverted.get(bit);
      if (!set) {
        set = new Set();
        this.inverted.set(bit, set);
      }
      set.add(id);
    }
  }

  private unindex(id: string, active: number[]) {
    for (const bit of active) {
      const set = this.inverted.get(bit);
      if (set) {
        set.delete(id);
        if (!set.size) this.inverted.delete(bit);
      }
    }
  }

  store(id: string, vec: Uint8Array) {
    const prev = this.records.get(id);
    if (prev) this.unindex(id, prev.active);
    const active = activeIndices(vec);
    this.records.set(id, { packed: packSdr(vec), active });
    this.index(id, active);
  }

  remove(id: string) {
    const prev = this.records.get(id);
    if (!prev) return;
    this.unindex(id, prev.active);
    this.records.delete(id);
  }

  recall(query: Uint8Array) {
    const many = this.recallMany(query, 1);
    return many[0] ?? null;
  }

  recallMany(query: Uint8Array, limit = 50): Array<{ id: string; distance: number }> {
    const qPacked = this.packInto(query);
    this.voteScratch.clear();
    for (let i = 0; i < query.length; i++) {
      if (!query[i]) continue;
      const set = this.inverted.get(i);
      if (!set) continue;
      for (const id of set) this.voteScratch.set(id, (this.voteScratch.get(id) ?? 0) + 1);
    }
    const minOverlap = Math.ceil(this.k - this.radius / 2);
    const hits: Array<{ id: string; distance: number }> = [];
    for (const [id, overlap] of this.voteScratch) {
      if (overlap < minOverlap) continue;
      const rec = this.records.get(id);
      if (!rec) continue;
      const d = hammingPacked(qPacked, rec.packed);
      if (d <= this.radius) hits.push({ id, distance: d });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits.slice(0, limit);
  }

  size() {
    return this.records.size;
  }
}
