import type { PipelineCAResult } from "./types.js";
import { Lfsr } from "./prng.js";

/** Элементарное правило 184 (Wolfram): детерминированный поток вправо по решётке. */
const RULE184: readonly number[] = [0, 0, 0, 1, 0, 1, 1, 1];

export function elementaryCAStep(state: Uint8Array): Uint8Array {
  const width = state.length;
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const left = i > 0 ? state[i - 1]! : 0;
    const center = state[i]!;
    const right = i < width - 1 ? state[i + 1]! : 0;
    const neighborhood = (left << 2) | (center << 1) | right;
    next[i] = RULE184[neighborhood]!;
  }
  return next;
}

export function localStructureHistogram(state: Uint8Array): Float64Array {
  const patterns = 4;
  const hist = new Float64Array(patterns);
  const width = state.length;
  for (let i = 0; i < width; i++) {
    const a = state[i]!;
    const b = state[(i + 1) % width]!;
    hist[(a << 1) | b]++;
  }
  for (let k = 0; k < patterns; k++) hist[k]! /= width;
  return hist;
}

export function histogramL1Distance(a: Float64Array, b: Float64Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  return d;
}

export function runPipelineCA(width: number, generations: number, seed: number): PipelineCAResult {
  const lfsrInit = new Lfsr(seed);
  let state = new Uint8Array(width);
  for (let i = 0; i < width; i++) state[i] = lfsrInit.nextU32() & 1;

  const scheduleLfsr = new Lfsr(seed ^ 0xc0ffee);
  const occupancyCounts = new Uint32Array(width);
  let prevHist = localStructureHistogram(state);
  let stabilitySum = 0;

  for (let g = 0; g < generations; g++) {
    const inject = (scheduleLfsr.nextU32() & 7) === 0;
    state = elementaryCAStep(state);
    if (inject) state[0] = 1;
    for (let i = 0; i < width; i++) if (state[i]) occupancyCounts[i]++;
    const hist = localStructureHistogram(state);
    if (g > 0) stabilitySum += 1 - histogramL1Distance(prevHist, hist) / 2;
    prevHist = hist;
  }

  const stability = stabilitySum / Math.max(1, generations - 1);
  let maxOcc = 0;
  let bottleneck = 0;
  for (let i = 0; i < width; i++) {
    if (occupancyCounts[i]! > maxOcc) {
      maxOcc = occupancyCounts[i]!;
      bottleneck = i;
    }
  }
  return { stability, bottleneck, occupancyCounts, finalState: state, generations };
}

/** CA density metric for funnel stage distribution (1 = full, 0 = empty). */
export function funnelCaDensity(stageCounts: number[]): { stability: number; density: number; bottleneck: number } {
  const width = Math.max(stageCounts.length, 1);
  const total = stageCounts.reduce((a, b) => a + b, 0) || 1;
  const seed = stageCounts.reduce((s, c, i) => s + c * (i + 1), 0) || 1;
  const result = runPipelineCA(width, 200, seed);
  const density = stageCounts.reduce((s, c) => s + (c > 0 ? 1 : 0), 0) / width;
  const load = stageCounts.map((c) => c / total);
  const bottleneck = load.indexOf(Math.max(...load));
  return { stability: result.stability, density, bottleneck };
}
