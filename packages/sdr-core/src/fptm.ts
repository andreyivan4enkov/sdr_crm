import type { FptmClause } from "./types.js";

export class Fptm {
  private clauses: FptmClause[][];

  constructor(
    private numClasses: number,
    private features: number,
    clausesPerClass: number,
  ) {
    this.clauses = Array.from({ length: numClasses }, () =>
      Array.from({ length: clausesPerClass }, () => ({ positives: [], negatives: [] })),
    );
  }

  predict(x: Uint8Array) {
    let best = 0;
    let bestS = -Infinity;
    for (let c = 0; c < this.numClasses; c++) {
      let s = 0;
      for (const cl of this.clauses[c]!) {
        for (const p of cl.positives) if (x[p]) s += 2;
        for (const n of cl.negatives) if (x[n]) s -= 2;
      }
      if (s > bestS) {
        bestS = s;
        best = c;
      }
    }
    return best;
  }

  predictProba(x: Uint8Array): number[] {
    const scores = this.clauses.map((group) => {
      let s = 0;
      for (const cl of group) {
        for (const p of cl.positives) if (x[p]) s += 2;
        for (const n of cl.negatives) if (x[n]) s -= 2;
      }
      return s;
    });
    const max = Math.max(...scores);
    const exp = scores.map((s) => Math.exp(s - max));
    const sum = exp.reduce((a, b) => a + b, 0) || 1;
    return exp.map((e) => e / sum);
  }

  fit(X: Uint8Array[], y: number[], epochs = 2) {
    for (let e = 0; e < epochs; e++) {
      for (let i = 0; i < X.length; i++) {
        for (let c = 0; c < this.numClasses; c++) {
          for (const cl of this.clauses[c]!) {
            const inc = c === y[i];
            for (let f = 0; f < this.features; f++) {
              const gate = ((e * 131 + i * 17 + f * 7 + c * 3) >>> 0) & 1;
              if (X[i]![f] && inc && gate === 0) cl.positives.push(f);
              if (!X[i]![f] && !inc && gate === 1) cl.negatives.push(f);
            }
          }
        }
      }
    }
  }

  seedFromData(X: Uint8Array[], y: number[]) {
    for (let c = 0; c < this.numClasses; c++) {
      const counts = new Array(this.features).fill(0);
      for (let i = 0; i < X.length; i++) {
        if (y[i] !== c) continue;
        for (let f = 0; f < this.features; f++) if (X[i]![f]) counts[f]++;
      }
      const ranked = counts.map((cnt, f) => ({ f, cnt })).sort((a, b) => b.cnt - a.cnt);
      const cl = this.clauses[c]![0]!;
      for (let k = 0; k < Math.min(3, ranked.length); k++) {
        if (ranked[k]!.cnt > 0) cl.positives.push(ranked[k]!.f);
      }
    }
  }

  modelSizeBytes() {
    let n = 0;
    for (const g of this.clauses) for (const c of g) n += c.positives.length + c.negatives.length;
    return n * 4;
  }

  extractRules(names: string[], classes: string[] = []) {
    const rules: string[] = [];
    for (let c = 0; c < this.numClasses; c++) {
      for (const cl of this.clauses[c]!) {
        const body = cl.positives.map((p) => names[p] ?? `f${p}`).join(" AND ");
        const label = classes[c] ?? `class${c}`;
        if (body) rules.push(`IF ${body} THEN "${label}"`);
      }
    }
    return rules;
  }

  eraseStale(mask: Uint8Array) {
    for (const g of this.clauses) {
      for (const c of g) {
        c.positives = c.positives.filter((p) => mask[p]);
        c.negatives = c.negatives.filter((n) => !mask[n]);
      }
    }
  }
}

export function bitInfer(clauses: FptmClause[], x: Uint8Array) {
  let score = 0;
  for (const cl of clauses) {
    let ok = true;
    for (const p of cl.positives) if (!x[p]) {
      ok = false;
      break;
    }
    if (!ok) continue;
    for (const n of cl.negatives) if (x[n]) {
      ok = false;
      break;
    }
    if (ok) score++;
  }
  return score;
}
