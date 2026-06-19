import type { EventModel, SessionEvent } from "./types.js";

export function buildEventModel(events: SessionEvent[]): EventModel {
  const typeCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);
  const byteBins = new Array(10).fill(0);
  for (const e of events) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    hourCounts[e.hour]++;
    byteBins[Math.min(9, Math.floor(e.bytes / 10000))]++;
  }
  return { typeCounts, hourCounts, byteBins, n: events.length || 1 };
}

export function eventSurprisalBits(e: SessionEvent, model: EventModel, alpha = 1): number {
  const typeKinds = 3;
  const typeP = ((model.typeCounts.get(e.type) ?? 0) + alpha) / (model.n + alpha * typeKinds);
  const hourP = (model.hourCounts[e.hour]! + alpha) / (model.n + alpha * 24);
  const bin = Math.min(9, Math.floor(e.bytes / 10000));
  const byteP = (model.byteBins[bin]! + alpha) / (model.n + alpha * 10);
  return -(Math.log2(typeP) + Math.log2(hourP) + Math.log2(byteP));
}

export const DEFAULT_AUDIT_SURPRISAL_THRESHOLD = 12;
