import { createHash } from "node:crypto";
import type { LeadEncodeInput, SdrCfg } from "./types.js";

export const DEFAULT_LEAD_SDR_CFG: SdrCfg = { dimensions: 2048, activeBits: 32 };

function hashSelectBits(text: string, cfg: SdrCfg, salt: string): Uint8Array {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const vec = new Uint8Array(cfg.dimensions);
  if (!normalized) return vec;

  const grams = new Set<string>([normalized]);
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= normalized.length - n; i++) {
      grams.add(normalized.slice(i, i + n));
    }
  }

  const indices = new Set<number>();
  for (const gram of grams) {
    let counter = 0;
    while (indices.size < cfg.activeBits && counter < 64) {
      const hash = createHash("sha256").update(salt).update("\0").update(gram).update("\0").update(String(counter)).digest();
      for (let i = 0; i + 1 < hash.length && indices.size < cfg.activeBits; i += 2) {
        const pos = (hash[i]! << 8 | hash[i + 1]!) % cfg.dimensions;
        indices.add(pos);
      }
      counter++;
    }
  }

  for (const i of indices) vec[i] = 1;
  return vec;
}

function mergeSdrVectors(parts: Uint8Array[], cfg: SdrCfg): Uint8Array {
  const merged = new Uint8Array(cfg.dimensions);
  const active: number[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      if (p[i]) {
        merged[i] = 1;
        active.push(i);
      }
    }
  }
  if (active.length <= cfg.activeBits) return merged;

  const ranked = active
    .map((bit) => {
      const hash = createHash("sha256").update("trim").update(String(bit)).digest();
      return { bit, rank: hash[0]! };
    })
    .sort((a, b) => a.rank - b.rank);

  const out = new Uint8Array(cfg.dimensions);
  for (let i = 0; i < cfg.activeBits; i++) out[ranked[i]!.bit] = 1;
  return out;
}

/** Детерминированный вектор из полей лида (name, phone, email, …). */
export function encodeLeadSdr(lead: LeadEncodeInput, cfg: SdrCfg = DEFAULT_LEAD_SDR_CFG): Uint8Array {
  const parts: Uint8Array[] = [];
  if (lead.name) parts.push(hashSelectBits(lead.name, cfg, "name"));
  if (lead.phone) parts.push(hashSelectBits(lead.phone.replace(/\D/g, ""), cfg, "phone"));
  if (lead.email) parts.push(hashSelectBits(lead.email, cfg, "email"));
  if (lead.region) parts.push(hashSelectBits(lead.region, cfg, "region"));
  if (lead.comment) parts.push(hashSelectBits(lead.comment, cfg, "comment"));
  if (!parts.length) return new Uint8Array(cfg.dimensions);
  return mergeSdrVectors(parts, cfg);
}

/** Вектор для поискового запроса (?search=). */
export function encodeQuery(query: string, cfg: SdrCfg = DEFAULT_LEAD_SDR_CFG): Uint8Array {
  const q = query.trim();
  if (!q) return new Uint8Array(cfg.dimensions);
  const digits = q.replace(/\D/g, "");
  const canonical = digits.length >= 4 ? `${q}|${digits}` : q;
  return hashSelectBits(canonical, cfg, "query");
}
