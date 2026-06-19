import type { SdrCfg } from "./types.js";

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSdr(rng: () => number, cfg: SdrCfg) {
  const vec = new Uint8Array(cfg.dimensions);
  const idx = new Set<number>();
  while (idx.size < cfg.activeBits) idx.add(Math.floor(rng() * cfg.dimensions));
  for (const i of idx) vec[i] = 1;
  return vec;
}

export class Lfsr {
  private state: number;
  constructor(seed: number, private taps = [32, 22, 2, 1]) {
    this.state = seed || 1;
  }
  nextU32() {
    let v = 0;
    for (let i = 0; i < 32; i++) {
      let fb = 0;
      for (const t of this.taps) fb ^= (this.state >> (t - 1)) & 1;
      this.state = ((this.state << 1) | fb) >>> 0;
      v = (v << 1) | fb;
    }
    return v >>> 0;
  }
}

export function flipBits(vec: Uint8Array, fraction: number, rng: () => number) {
  const out = new Uint8Array(vec);
  const active: number[] = [];
  for (let i = 0; i < out.length; i++) if (out[i]) active.push(i);
  const flips = Math.max(1, Math.floor(active.length * fraction));
  for (let i = 0; i < flips; i++) {
    const idx = active[Math.floor(rng() * active.length)];
    out[idx] = 0;
    let j = Math.floor(rng() * out.length);
    while (out[j]) j = (j + 1) % out.length;
    out[j] = 1;
  }
  return out;
}

export function sparsity(vec: Uint8Array) {
  let c = 0;
  for (const v of vec) if (v) c++;
  return c / vec.length;
}
