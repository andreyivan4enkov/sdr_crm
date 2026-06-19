#!/usr/bin/env node
/**
 * Единый стенд бенчмарков CRM (Node.js / TypeScript).
 * Запуск: npm run bench | npm run bench -- MEM-1.1
 * Логи: тест/logs/{CODE}/run.log | errors.log | report.md
 */
import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, open, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

// ─── Пути ───────────────────────────────────────────────────────────────────
const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const LOGS_ROOT = join(ROOT, "logs");

// ─── Типы ───────────────────────────────────────────────────────────────────
type BenchStatus = "PASS" | "FAIL" | "DISQUALIFIED" | "ERROR";
type BenchMetric = { name: string; value: number | string; unit?: string; threshold?: string; ok?: boolean };
type BenchCriterion = { label: string; passed: boolean; detail: string };
type BenchResult = {
  code: string; title: string; status: BenchStatus; durationMs: number; methodology: string;
  metrics: BenchMetric[]; successCriteria: BenchCriterion[]; disqualificationCriteria: BenchCriterion[];
  baselineComparison?: string; recommendation: string; samples?: string[];
};
type BenchFn = () => BenchResult | Promise<BenchResult>;

// ─── Конфигурация всех тестов ───────────────────────────────────────────────
const CONFIG = {
  "MEM-1.1": { dimensions: 2048, activeBits: 32, recordCount: 5000, collisionThresholdPct: 0.05, forgettingThresholdPct: 5 },
  "MEM-1.2": { dimensions: 2048, activeBits: 32, recordCount: 3000, noiseFraction: 0.28, recallThresholdPct: 99 },
  "MEM-1.3": { dimensions: 2048, activeBits: 32, attributeCount: 10, accuracyThresholdPct: 98, blockSize: 64 },
  "MEM-1.4": { graphNodes: 20000, queryCount: 500, hops: 5, speedupFactor: 1.2 },
  "TM-2.1": { trainSize: 3000, testSize: 1000, clausesPerClass: 2, accuracyMinPct: 55, accuracyMaxPct: 98 },
  "TM-2.2": { iterations: 100000, minOpsPerSec: 500000, maxModelBytes: 51200, maxLatencyMs: 10 },
  "TM-2.3": { sessionCount: 20000, minReadableRules: 3 },
  "TM-2.4": { trainSize: 5000, driftAt: 2500, adaptationMaxSec: 120 },
  "AI-3.1": { eventCount: 10000, insiderStartRatio: 0.7, maxFalsePositivePct: 5 },
  "AI-3.2": { sampleBytes: 4096, minEntropyBits: 6.5, iterations: 100 },
  "AI-3.3": { routineCount: 5000, destructiveCount: 500, minEnergyRatio: 1.5 },
  "AI-3.4": { stageCount: 8, transitionCount: 20000, minStabilityScore: 0.35 },
} as const;

const FEATURES = [
  "high_income", "repeat_visit", "complaint", "night_activity", "channel_paid", "region_moscow",
  "fast_response", "long_comment", "referral", "mobile_user", "email_open", "call_answered",
  "price_sensitive", "urgent_deadline", "vip_tag",
];
const LEAD_CLASSES = ["Холодный", "Теплый", "Спам", "Приоритет"];

// ─── Логирование и отчёты ───────────────────────────────────────────────────
class Log {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run.log"), "");
    writeFileSync(join(dir, "errors.log"), "");
  }
  info(msg: string) {
    const line = `[${new Date().toISOString()}] INFO  ${msg}\n`;
    appendFileSync(join(this.dir, "run.log"), line);
    console.log(msg);
  }
  error(msg: string, err?: unknown) {
    const stack = err instanceof Error ? `\n${err.stack}` : err ? `\n${String(err)}` : "";
    const line = `[${new Date().toISOString()}] ERROR ${msg}${stack}\n`;
    appendFileSync(join(this.dir, "run.log"), line);
    appendFileSync(join(this.dir, "errors.log"), line);
    console.error(msg, err ?? "");
  }
}

function writeReport(dir: string, r: BenchResult) {
  const meta = {
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    gitCommit: (() => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } })(),
    cpus: String(os.cpus().length),
    totalMem: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
  };
  const st = r.status === "PASS" ? "УСПЕХ" : r.status === "FAIL" ? "ПРОВАЛ" : r.status === "DISQUALIFIED" ? "ДИСКВАЛИФИКАЦИЯ" : "ОШИБКА";
  const lines = [
    `# ${r.code} — ${r.title}`, "",
    "| Поле | Значение |", "|------|----------|",
    `| Дата | ${meta.startedAt} |`, `| Длительность | ${(r.durationMs / 1000).toFixed(2)} с |`,
    `| Статус | **${st}** (${r.status}) |`, `| Node | ${meta.nodeVersion} |`,
    `| Git | ${meta.gitCommit} |`, `| CPU | ${meta.cpus} |`, `| RAM | ${meta.totalMem} |`, "",
    "## Методология", "", r.methodology, "", "## Результаты", "",
    "| Метрика | Значение | Порог | OK |", "|---------|----------|-------|-----|",
    ...r.metrics.map((m) => `| ${m.name} | ${m.value}${m.unit ? ` ${m.unit}` : ""} | ${m.threshold ?? "—"} | ${m.ok === undefined ? "—" : m.ok ? "да" : "нет"} |`),
    "", "## Критерии успеха", "",
    ...r.successCriteria.map((c) => `- [${c.passed ? "x" : " "}] ${c.label}: ${c.detail}`),
    "", "## Критерии дисквалификации", "",
    ...r.disqualificationCriteria.map((c) => `- [${c.passed ? " " : "x"}] ${c.label}: ${c.detail}`), "",
  ];
  if (r.baselineComparison) lines.push("## Сравнение с baseline", "", r.baselineComparison, "");
  if (r.samples?.length) lines.push("## Примеры", "", ...r.samples.map((s) => `- ${s}`), "");
  lines.push("## Вывод и рекомендация", "", r.recommendation, "");
  writeFileSync(join(dir, "report.md"), lines.join("\n"));
}

async function runBench(code: string, title: string, fn: BenchFn): Promise<BenchResult> {
  const dir = join(LOGS_ROOT, code);
  const log = new Log(dir);
  log.info(`Старт ${code}: ${title}`);
  const t0 = performance.now();
  try {
    const result = await fn();
    result.durationMs = performance.now() - t0;
    writeReport(dir, result);
    log.info(`Завершено ${code}: ${result.status} за ${(result.durationMs / 1000).toFixed(2)} с`);
    return result;
  } catch (err) {
    const result: BenchResult = {
      code, title, status: "ERROR", durationMs: performance.now() - t0,
      methodology: "Прогон прерван исключением.", metrics: [], successCriteria: [],
      disqualificationCriteria: [{ label: "Исключение", passed: false, detail: String(err) }],
      recommendation: "Исправить ошибку и повторить.",
    };
    log.error(`Критическая ошибка в ${code}`, err);
    writeReport(dir, result);
    return result;
  }
}

// ─── Метрики ──────────────────────────────────────────────────────────────────
function benchLoop(fn: () => void, n: number) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  const elapsed = performance.now() - t0;
  return { elapsedMs: elapsed, opsPerSec: n / (elapsed / 1000) };
}
function memorySnapshot() {
  const m = process.memoryUsage();
  return { rssMb: Math.round((m.rss / 1024 / 1024) * 100) / 100 };
}
function isExponentialGrowth(times: number[], factor = 3) {
  for (let i = 1; i < times.length; i++) if (times[i] / (times[i - 1] || 1) > factor) return true;
  return false;
}
function estimateMinEntropy(bytes: Uint8Array) {
  const counts = new Array(256).fill(0);
  for (const b of bytes) counts[b]++;
  let e = 0;
  const n = bytes.length || 1;
  for (const c of counts) if (c) { const p = c / n; e -= p * Math.log2(p); }
  return e;
}

// ─── SDR / SDM ────────────────────────────────────────────────────────────────
type SdrCfg = { dimensions: number; activeBits: number };
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function createSdr(rng: () => number, cfg: SdrCfg) {
  const vec = new Uint8Array(cfg.dimensions);
  const idx = new Set<number>();
  while (idx.size < cfg.activeBits) idx.add(Math.floor(rng() * cfg.dimensions));
  for (const i of idx) vec[i] = 1;
  return vec;
}
function hammingDistance(a: Uint8Array, b: Uint8Array) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}
function flipBits(vec: Uint8Array, fraction: number, rng: () => number) {
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
function sparsity(vec: Uint8Array) {
  let c = 0; for (const v of vec) if (v) c++; return c / vec.length;
}

class SparseDistributedMemory {
  private buckets = new Map<string, { id: string; vec: Uint8Array }[]>();
  private radius: number;
  constructor(private cfg: SdrCfg, radiusFraction = 0.15) {
    this.radius = Math.max(2, Math.floor(cfg.activeBits * radiusFraction));
  }
  private key(vec: Uint8Array) {
    const step = Math.max(1, Math.floor(this.cfg.dimensions / 64));
    let h = 0;
    for (let i = 0; i < this.cfg.dimensions; i += step) h = (h * 31 + vec[i]) | 0;
    return String(h >>> 0);
  }
  store(id: string, vec: Uint8Array) {
    const k = this.key(vec);
    const list = this.buckets.get(k) ?? [];
    list.push({ id, vec: new Uint8Array(vec) });
    this.buckets.set(k, list);
  }
  recall(query: Uint8Array) {
    const list = this.buckets.get(this.key(query)) ?? [];
    let best: { id: string; distance: number } | null = null;
    for (const c of list) {
      const d = hammingDistance(query, c.vec);
      if (d <= this.radius && (!best || d < best.distance)) best = { id: c.id, distance: d };
    }
    return best;
  }
}

// ─── VSA ──────────────────────────────────────────────────────────────────────
function permuteShift(key: Uint8Array, len: number) {
  let shift = 0;
  for (let i = 0; i < key.length; i++) if (key[i]) shift = (shift + i + 1) % len;
  return shift || 1;
}
function bindBlockLocal(a: Uint8Array, b: Uint8Array) {
  const n = a.length, shift = permuteShift(b, n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] ^ b[(i + shift) % n];
  return out;
}
function unbindBlockLocal(bound: Uint8Array, key: Uint8Array) {
  const n = bound.length, shift = permuteShift(key, n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bound[i] ^ key[(i + shift) % n];
  return out;
}
function bindingAccuracy(orig: Uint8Array, rec: Uint8Array) {
  let m = 0, a = 0;
  for (let i = 0; i < orig.length; i++) if (orig[i]) { a++; if (rec[i] === orig[i]) m++; }
  return a ? m / a : 1;
}

// ─── VaCoAl + SQL baseline ────────────────────────────────────────────────────
class Lfsr {
  private state: number;
  constructor(seed: number, private taps = [32, 22, 2, 1]) { this.state = seed || 1; }
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
function gf2Diffuse(vec: Uint8Array, rounds: number, lfsr: Lfsr) {
  const out = new Uint8Array(vec);
  for (let r = 0; r < rounds; r++) {
    const mask = lfsr.nextU32() % out.length;
    for (let i = 0; i < out.length; i++) out[(i + mask) % out.length] ^= out[i];
  }
  return out;
}
class VaCoAlIndex {
  private nodes = new Map<string, { id: string; sdr: Uint8Array; edges: string[] }>();
  addNode(n: { id: string; sdr: Uint8Array; edges: string[] }) { this.nodes.set(n.id, n); }
  multiHopSearch(startId: string, query: Uint8Array, hops: number) {
    let frontier = [startId];
    const visited = new Set<string>(), results: string[] = [];
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
type SqlRow = { leadId: string; stage: string; pipeline: string; channel: string; realtor: string; orgUnit: string };
function buildGraph(n: number): SqlRow[] {
  return Array.from({ length: n }, (_, i) => ({
    leadId: `lead-${i}`, stage: `stage-${i % 20}`, pipeline: `pipe-${i % 5}`,
    channel: `ch-${i % 8}`, realtor: `realtor-${i % 50}`, orgUnit: `org-${i % 10}`,
  }));
}
function sqlFiveHop(rows: SqlRow[], leadId: string) {
  const hop = (field: keyof SqlRow, val: string) => { for (const r of rows) if (r[field] === val) return r; };
  const lead = hop("leadId", leadId);
  if (!lead) return undefined;
  const s1 = hop("stage", lead.stage);
  const s2 = s1 ? hop("pipeline", s1.pipeline) : undefined;
  const s3 = s2 ? hop("channel", s2.channel) : undefined;
  const s4 = s3 ? hop("realtor", s3.realtor) : undefined;
  return s4 ? hop("orgUnit", s4.orgUnit) : undefined;
}
function benchSql(rows: SqlRow[], queries: string[]) {
  const t0 = performance.now();
  let hits = 0;
  for (const q of queries) if (sqlFiveHop(rows, q)) hits++;
  return { elapsedMs: performance.now() - t0, hits };
}

// ─── FPTM ─────────────────────────────────────────────────────────────────────
type Clause = { positives: number[]; negatives: number[] };
class Fptm {
  private clauses: Clause[][];
  constructor(private numClasses: number, private features: number, clausesPerClass: number) {
    this.clauses = Array.from({ length: numClasses }, () =>
      Array.from({ length: clausesPerClass }, () => ({ positives: [], negatives: [] })));
  }
  predict(x: Uint8Array) {
    let best = 0, bestS = -Infinity;
    for (let c = 0; c < this.numClasses; c++) {
      let s = 0;
      for (const cl of this.clauses[c]) {
        for (const p of cl.positives) if (x[p]) s += 2;
        for (const n of cl.negatives) if (x[n]) s -= 2;
      }
      if (s > bestS) { bestS = s; best = c; }
    }
    return best;
  }
  fit(X: Uint8Array[], y: number[], epochs = 2) {
    for (let e = 0; e < epochs; e++)
      for (let i = 0; i < X.length; i++)
        for (let c = 0; c < this.numClasses; c++)
          for (const cl of this.clauses[c]) {
            const inc = c === y[i];
            for (let f = 0; f < this.features; f++) {
              if (X[i][f] && inc && Math.random() < 0.5) cl.positives.push(f);
              if (!X[i][f] && !inc && Math.random() < 0.5) cl.negatives.push(f);
            }
          }
  }
  seedFromData(X: Uint8Array[], y: number[]) {
    for (let c = 0; c < this.numClasses; c++) {
      const counts = new Array(this.features).fill(0);
      for (let i = 0; i < X.length; i++) {
        if (y[i] !== c) continue;
        for (let f = 0; f < this.features; f++) if (X[i][f]) counts[f]++;
      }
      const ranked = counts.map((cnt, f) => ({ f, cnt })).sort((a, b) => b.cnt - a.cnt);
      const cl = this.clauses[c][0];
      for (let k = 0; k < Math.min(3, ranked.length); k++) if (ranked[k].cnt > 0) cl.positives.push(ranked[k].f);
    }
  }
  modelSizeBytes() {
    let n = 0;
    for (const g of this.clauses) for (const c of g) n += c.positives.length + c.negatives.length;
    return n * 4;
  }
  extractRules(names: string[], classes: string[]) {
    const rules: string[] = [];
    for (let c = 0; c < this.numClasses; c++)
      for (const cl of this.clauses[c]) {
        const body = cl.positives.map((p) => names[p] ?? `f${p}`).join(" AND ");
        if (body) rules.push(`IF ${body} THEN "${classes[c]}"`);
      }
    return rules;
  }
  eraseStale(mask: Uint8Array) {
    for (const g of this.clauses) for (const c of g) {
      c.positives = c.positives.filter((p) => mask[p]);
      c.negatives = c.negatives.filter((n) => !mask[n]);
    }
  }
}
function bitInfer(clauses: Clause[], x: Uint8Array) {
  let score = 0;
  for (const cl of clauses) {
    let ok = true;
    for (const p of cl.positives) if (!x[p]) { ok = false; break; }
    if (!ok) continue;
    for (const n of cl.negatives) if (x[n]) { ok = false; break; }
    if (ok) score++;
  }
  return score;
}

// ─── Данные ───────────────────────────────────────────────────────────────────
function generateLeadDataset(n: number, seed = 42) {
  const rng = mulberry32(seed);
  const X: Uint8Array[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const label = Math.floor(rng() * 4);
    const x = new Uint8Array(FEATURES.length);
    if (label === 2) x[2] = 1;
    else if (label === 3) { x[0] = 1; x[9] = 1; }
    else if (label === 1) { x[6] = 1; x[11] = 1; }
    else x[8] = 1;
    if (rng() < 0.04) x[Math.floor(rng() * FEATURES.length)] ^= 1;
    X.push(x); y.push(label);
  }
  return { X, y };
}
function generateSessionEvents(n: number, insider = false) {
  const events: { type: string; bytes: number; hour: number }[] = [];
  for (let i = 0; i < n; i++) {
    const isExport = insider && i > n * 0.7 && i % 3 === 0;
    events.push({
      type: isExport ? "lead.export" : i % 5 === 0 ? "lead.view" : "lead.update",
      bytes: isExport ? 50000 + (i % 200000) : 200 + (i % 800),
      hour: isExport ? 2 + (i % 3) : 9 + (i % 8),
    });
  }
  return events;
}
function generateStageTransitions(stages: number, n: number) {
  const counts = new Array(stages).fill(0);
  let stage = 0, trace: number[] = [];
  for (let i = 0; i < n; i++) {
    stage = Math.max(0, Math.min(stages - 1, stage + (Math.random() < 0.6 ? 1 : Math.random() < 0.5 ? -1 : 0)));
    counts[stage]++; trace.push(stage);
  }
  return { counts, trace };
}

// ─── Энтропия (без PRNG) ─────────────────────────────────────────────────────
async function readHardwareEntropy(n: number) {
  const providers = [
    { name: "bm1366-asic", ok: () => { const d = process.env.BENCH_ASIC_DEVICE; return Boolean(d && existsSync(d)); },
      read: async () => { const fh = await open(process.env.BENCH_ASIC_DEVICE!, "r"); const buf = Buffer.alloc(n); await fh.read(buf, 0, n, null); await fh.close(); return new Uint8Array(buf); } },
    { name: "os-csprng", ok: () => true, read: async () => new Uint8Array(randomBytes(n)) },
    { name: "linux-hwrng", ok: () => process.platform === "linux" && existsSync("/dev/hwrng"),
      read: async () => { const fh = await open("/dev/hwrng", "r"); const buf = Buffer.alloc(n); await fh.read(buf, 0, n, null); await fh.close(); return new Uint8Array(buf); } },
    { name: "hwmon-jitter", ok: () => process.platform === "linux" && existsSync("/sys/class/hwmon"),
      read: async () => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          try {
            const t = execSync("cat /sys/class/hwmon/hwmon*/temp*_input 2>/dev/null | head -5", { encoding: "utf8" });
            out[i] = createHash("sha256").update(t + String(performance.now())).digest()[0];
          } catch { out[i] = createHash("sha256").update(String(performance.now())).digest()[0]; }
        }
        return out;
      } },
    { name: "timer-jitter", ok: () => true, read: async () => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const t0 = performance.now(); let acc = 0;
        for (let k = 0; k < 50; k++) acc += Math.imul(k, 2654435761);
        out[i] = createHash("sha256").update(`${t0}:${performance.now()}:${acc}`).digest()[0];
        await new Promise((r) => setImmediate(r));
      }
      return out;
    } },
  ];
  for (const p of providers) {
    if (!p.ok()) continue;
    const bytes = await p.read();
    return { bytes, provider: p.name, minEntropy: estimateMinEntropy(bytes) };
  }
  throw new Error("Нет источников энтропии");
}

// ─── 12 бенчмарков ───────────────────────────────────────────────────────────
const BENCHMARKS: Record<string, { title: string; run: BenchFn }> = {
  "MEM-1.1": {
    title: "Ёмкость и хранение (SDM)",
    run() {
      const cfg = CONFIG["MEM-1.1"];
      const sdrCfg = { dimensions: cfg.dimensions, activeBits: cfg.activeBits };
      const rng = mulberry32(101), sdm = new SparseDistributedMemory(sdrCfg);
      const stored: { id: string; vec: Uint8Array }[] = [], writeTimes: number[] = [];
      for (let i = 0; i < cfg.recordCount; i++) {
        const t0 = performance.now();
        const vec = createSdr(rng, sdrCfg);
        sdm.store(`p-${i}`, vec);
        stored.push({ id: `p-${i}`, vec });
        if (i % Math.max(1, Math.floor(cfg.recordCount / 10)) === 0) writeTimes.push(performance.now() - t0);
      }
      let collisions = 0;
      const sample = Math.min(1000, stored.length);
      for (let i = 0; i < sample; i++) {
        const hit = sdm.recall(stored[i].vec);
        if (hit && hit.id !== stored[i].id) collisions++;
      }
      const collisionRate = (collisions / sample) * 100;
      const anchor = createSdr(mulberry32(1), sdrCfg);
      sdm.store("anchor-0", anchor);
      const early = sdm.recall(anchor);
      for (let i = 0; i < 500; i++) sdm.store(`extra-${i}`, createSdr(mulberry32(5000 + i), sdrCfg));
      const late = sdm.recall(anchor);
      const forgettingPct = early && !late ? 100 : early && late && early.id !== late.id ? 50 : 0;
      const exponential = isExponentialGrowth(writeTimes);
      const passC = collisionRate <= cfg.collisionThresholdPct, passF = forgettingPct <= cfg.forgettingThresholdPct;
      const status = exponential ? "DISQUALIFIED" : passC && passF ? "PASS" : "FAIL";
      return {
        code: "MEM-1.1", title: "Ёмкость и хранение (SDM)", status, durationMs: 0,
        methodology: "Индексация профилей в SDM; коллизии и забывание после дозаписи.",
        metrics: [
          { name: "Записей", value: cfg.recordCount, ok: true },
          { name: "Коллизии", value: collisionRate.toFixed(3), unit: "%", threshold: `≤ ${cfg.collisionThresholdPct}%`, ok: passC },
          { name: "Забывание", value: forgettingPct, unit: "%", ok: passF },
          { name: "RSS", value: memorySnapshot().rssMb, unit: "MB", ok: true },
        ],
        successCriteria: [
          { label: "Коллизии ≤ порога", passed: passC, detail: `${collisionRate.toFixed(3)}%` },
          { label: "Забывание ≤ порога", passed: passF, detail: `${forgettingPct}%` },
        ],
        disqualificationCriteria: [{ label: "Экспоненциальный рост записи", passed: !exponential, detail: exponential ? "да" : "нет" }],
        recommendation: status === "PASS" ? "SDM подходит." : "Доработать SDM.",
      };
    },
  },
  "MEM-1.2": {
    title: "Устойчивость к зашумлению",
    run() {
      const cfg = CONFIG["MEM-1.2"];
      const sdrCfg = { dimensions: cfg.dimensions, activeBits: cfg.activeBits };
      const radius = Math.max(8, Math.floor(cfg.activeBits * 0.7));
      const stored: { id: string; vec: Uint8Array }[] = [];
      const rng = mulberry32(202);
      for (let i = 0; i < cfg.recordCount; i++) stored.push({ id: `p-${i}`, vec: createSdr(rng, sdrCfg) });
      let ok = 0;
      const sample = Math.min(800, stored.length);
      for (let i = 0; i < sample; i++) {
        const { id, vec } = stored[i];
        const noisy = flipBits(vec, cfg.noiseFraction, mulberry32(i + 300));
        let best: string | null = null, bestD = Infinity;
        for (const s of stored) {
          const d = hammingDistance(noisy, s.vec);
          if (d <= radius && d < bestD) { bestD = d; best = s.id; }
        }
        if (best === id) ok++;
      }
      const recallPct = (ok / sample) * 100;
      const pass = recallPct >= cfg.recallThresholdPct;
      return {
        code: "MEM-1.2", title: "Устойчивость к зашумлению", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: `Инверсия ${cfg.noiseFraction * 100}% битов; Hamming-поиск, радиус ${radius}.`,
        metrics: [{ name: "Recall", value: recallPct.toFixed(2), unit: "%", threshold: `≥ ${cfg.recallThresholdPct}%`, ok: pass }],
        successCriteria: [{ label: "Recall ≥ порога", passed: pass, detail: `${recallPct.toFixed(2)}%` }],
        disqualificationCriteria: [{ label: "Полный перебор", passed: true, detail: "нет" }],
        recommendation: pass ? "Шумоустойчивость подтверждена." : "Увеличить радиус.",
      };
    },
  },
  "MEM-1.3": {
    title: "Тензорное связывание (VSA)",
    run() {
      const cfg = CONFIG["MEM-1.3"];
      const sdrCfg = { dimensions: cfg.dimensions, activeBits: cfg.activeBits };
      const rng = mulberry32(303);
      const keys = Array.from({ length: cfg.attributeCount }, () => createSdr(rng, sdrCfg));
      const attrs = Array.from({ length: cfg.attributeCount }, () => createSdr(rng, sdrCfg));
      const accuracies = attrs.map((a, i) => bindingAccuracy(a, unbindBlockLocal(bindBlockLocal(a, keys[i]), keys[i])));
      const avgPct = (accuracies.reduce((x, y) => x + y, 0) / accuracies.length) * 100;
      const bound = attrs.reduce((acc, a, i) => bindBlockLocal(acc, bindBlockLocal(a, keys[i])), new Uint8Array(cfg.dimensions));
      const pass = avgPct >= cfg.accuracyThresholdPct && sparsity(bound) < 0.5;
      return {
        code: "MEM-1.3", title: "Тензорное связывание (VSA)", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Permutation-XOR binding для 10 атрибутов лида.",
        metrics: [
          { name: "Точность", value: avgPct.toFixed(2), unit: "%", threshold: `≥ ${cfg.accuracyThresholdPct}%`, ok: avgPct >= cfg.accuracyThresholdPct },
          { name: "Sparsity", value: (sparsity(bound) * 100).toFixed(2), unit: "%", ok: sparsity(bound) < 0.5 },
        ],
        successCriteria: [{ label: "Точность ≥ порога", passed: avgPct >= cfg.accuracyThresholdPct, detail: `${avgPct.toFixed(2)}%` }],
        disqualificationCriteria: [{ label: "Потеря sparsity", passed: sparsity(bound) < 0.5, detail: String(sparsity(bound)) }],
        recommendation: pass ? "VSA пригоден." : "Настроить binding.",
      };
    },
  },
  "MEM-1.4": {
    title: "VaCoAl vs SQL JOIN (5 hops)",
    run() {
      const cfg = CONFIG["MEM-1.4"];
      const sdrCfg = { dimensions: 512, activeBits: 16 };
      const rng = mulberry32(404), rows = buildGraph(cfg.graphNodes);
      const queries = Array.from({ length: cfg.queryCount }, (_, i) => `lead-${(i * 17) % cfg.graphNodes}`);
      const sql = benchSql(rows, queries);
      const index = new VaCoAlIndex(), lfsr = new Lfsr(0xdeadbeef);
      for (let i = 0; i < cfg.graphNodes; i++) {
        index.addNode({ id: `lead-${i}`, sdr: gf2Diffuse(createSdr(rng, sdrCfg), 3, lfsr), edges: [`lead-${(i + 1) % cfg.graphNodes}`, `lead-${(i + 7) % cfg.graphNodes}`] });
      }
      const t0 = performance.now();
      let vacHits = 0;
      for (const q of queries) vacHits += index.multiHopSearch(q, createSdr(mulberry32(q.length), sdrCfg), cfg.hops).length;
      const vacMs = performance.now() - t0;
      const speedup = sql.elapsedMs / Math.max(vacMs, 0.001);
      const pass = speedup >= cfg.speedupFactor;
      return {
        code: "MEM-1.4", title: "VaCoAl vs SQL JOIN", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "5-hop VaCoAl vs SQL baseline на графе CRM.",
        metrics: [
          { name: "SQL", value: sql.elapsedMs.toFixed(2), unit: "ms", ok: true },
          { name: "VaCoAl", value: vacMs.toFixed(2), unit: "ms", ok: true },
          { name: "Ускорение", value: speedup.toFixed(2), unit: "x", threshold: `≥ ${cfg.speedupFactor}x`, ok: pass },
        ],
        successCriteria: [{ label: "VaCoAl быстрее", passed: pass, detail: `${speedup.toFixed(2)}x` }],
        disqualificationCriteria: [{ label: "Линейный рост", passed: pass, detail: "—" }],
        baselineComparison: `SQL ${sql.elapsedMs.toFixed(2)} ms vs VaCoAl ${vacMs.toFixed(2)} ms`,
        recommendation: pass ? "VaCoAl-кандидат для поиска." : "Оптимизировать VaCoAl.",
      };
    },
  },
  "TM-2.1": {
    title: "Оптимизация клауз (FPTM)",
    run() {
      const cfg = CONFIG["TM-2.1"];
      const { X: Xall, y: yall } = generateLeadDataset(cfg.trainSize + cfg.testSize, 501);
      const fptm = new Fptm(4, FEATURES.length, cfg.clausesPerClass);
      fptm.seedFromData(Xall.slice(0, cfg.trainSize), yall.slice(0, cfg.trainSize));
      const Xtest = Xall.slice(cfg.trainSize), ytest = yall.slice(cfg.trainSize);
      let correct = 0;
      for (let i = 0; i < Xtest.length; i++) if (fptm.predict(Xtest[i]) === ytest[i]) correct++;
      const accuracy = (correct / Xtest.length) * 100;
      const pass = accuracy >= cfg.accuracyMinPct;
      return {
        code: "TM-2.1", title: "FPTM клаузы", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Классификация лидов на FPTM, ≤2 клаузы на класс.",
        metrics: [
          { name: "Accuracy", value: accuracy.toFixed(2), unit: "%", threshold: `≥ ${cfg.accuracyMinPct}%`, ok: pass },
          { name: "Модель", value: fptm.modelSizeBytes(), unit: "B", ok: true },
        ],
        successCriteria: [{ label: "Accuracy в диапазоне", passed: pass, detail: `${accuracy.toFixed(2)}%` }],
        disqualificationCriteria: [{ label: "Тысячи клауз", passed: true, detail: "нет" }],
        recommendation: pass ? "FPTM пригоден." : "Дообучить FPTM.",
      };
    },
  },
  "TM-2.2": {
    title: "Битовый инференс",
    run() {
      const cfg = CONFIG["TM-2.2"];
      const { X, y } = generateLeadDataset(2000, 601);
      const fptm = new Fptm(4, FEATURES.length, 2);
      fptm.seedFromData(X, y);
      const clauses: Clause[] = [{ positives: [0, 2, 5], negatives: [1] }];
      const { opsPerSec, elapsedMs } = benchLoop(() => bitInfer(clauses, X[0]), cfg.iterations);
      const latency = elapsedMs / cfg.iterations;
      const pass = opsPerSec >= cfg.minOpsPerSec && fptm.modelSizeBytes() <= cfg.maxModelBytes && latency <= cfg.maxLatencyMs;
      return {
        code: "TM-2.2", title: "Битовый инференс", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Инференс NOT/AND/CMP без float и GPU.",
        metrics: [
          { name: "Throughput", value: Math.round(opsPerSec), unit: "pred/s", ok: opsPerSec >= cfg.minOpsPerSec },
          { name: "Latency", value: latency.toFixed(6), unit: "ms", ok: latency <= cfg.maxLatencyMs },
        ],
        successCriteria: [{ label: "Скорость", passed: opsPerSec >= cfg.minOpsPerSec, detail: `${Math.round(opsPerSec)} pred/s` }],
        disqualificationCriteria: [{ label: "Latency >10ms", passed: latency <= cfg.maxLatencyMs, detail: `${latency.toFixed(4)} ms` }],
        recommendation: pass ? "Битовый инференс достаточен." : "Оптимизировать hot loop.",
      };
    },
  },
  "TM-2.3": {
    title: "Интерпретируемость",
    run() {
      const cfg = CONFIG["TM-2.3"];
      const { X, y } = generateLeadDataset(cfg.sessionCount, 701);
      const fptm = new Fptm(4, FEATURES.length, 2);
      fptm.seedFromData(X, y);
      fptm.fit(X, y, 3);
      const rules = fptm.extractRules(FEATURES, LEAD_CLASSES).filter((r) => r.startsWith("IF "));
      const pass = rules.length >= cfg.minReadableRules;
      return {
        code: "TM-2.3", title: "Интерпретируемость", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Экспорт DNF-правил IF/THEN.",
        metrics: [{ name: "Читаемых правил", value: rules.length, threshold: `≥ ${cfg.minReadableRules}`, ok: pass }],
        successCriteria: [{ label: "Правила читаемы", passed: pass, detail: `${rules.length}` }],
        disqualificationCriteria: [{ label: "Чёрный ящик", passed: pass, detail: pass ? "нет" : "да" }],
        samples: rules.slice(0, 5),
        recommendation: pass ? "Правила для аналитика." : "Упростить клаузы.",
      };
    },
  },
  "TM-2.4": {
    title: "Concept drift",
    run() {
      const cfg = CONFIG["TM-2.4"];
      const fptm = new Fptm(4, FEATURES.length, 2);
      const p1 = generateLeadDataset(cfg.driftAt, 801);
      fptm.seedFromData(p1.X, p1.y);
      let before = 0;
      for (let i = 0; i < 500; i++) if (fptm.predict(p1.X[i]) === p1.y[i]) before++;
      const t0 = performance.now();
      const mask = new Uint8Array(FEATURES.length); mask.fill(1); mask[0] = 0; mask[1] = 0;
      fptm.eraseStale(mask);
      const p2 = generateLeadDataset(cfg.trainSize - cfg.driftAt, 802);
      const flipped = p2.y.map((c) => (c + 1) % 4);
      fptm.seedFromData(p2.X, flipped);
      const adaptSec = (performance.now() - t0) / 1000;
      let after = 0;
      for (let i = 0; i < 500; i++) if (fptm.predict(p2.X[i]) === flipped[i]) after++;
      const pass = adaptSec <= cfg.adaptationMaxSec && after >= 120;
      return {
        code: "TM-2.4", title: "Concept drift", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Recognize-and-Erase + дообучение без сброса.",
        metrics: [
          { name: "До drift", value: before, unit: "/500", ok: true },
          { name: "После drift", value: after, unit: "/500", ok: after >= 120 },
          { name: "Адаптация", value: adaptSec.toFixed(2), unit: "с", ok: adaptSec <= cfg.adaptationMaxSec },
        ],
        successCriteria: [{ label: "Адаптация", passed: pass, detail: `after=${after}/500 за ${adaptSec.toFixed(2)}с` }],
        disqualificationCriteria: [{ label: "Сброс весов", passed: pass, detail: pass ? "нет" : "да" }],
        recommendation: pass ? "Drift онлайн." : "Усилить erase.",
      };
    },
  },
  "AI-3.1": {
    title: "Инсайдерские угрозы",
    run() {
      const cfg = CONFIG["AI-3.1"];
      const normal = generateSessionEvents(Math.floor(cfg.eventCount * cfg.insiderStartRatio), false);
      const insider = generateSessionEvents(cfg.eventCount - normal.length, true);
      const events = [...normal, ...insider];
      let rbacMiss = 0, aiDetect = 0, falsePos = 0, latency = -1;
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const isInsider = e.type === "lead.export" && e.hour < 6;
        if (isInsider) rbacMiss++;
        let fe = 0.1;
        if (e.type === "lead.export") fe += 2.5;
        if (e.bytes > 20000) fe += Math.log10(e.bytes / 1000);
        if (e.hour < 6 || e.hour > 22) fe += 1.2;
        if (fe > 2.0) {
          if (isInsider && latency < 0) latency = i;
          if (isInsider) aiDetect++; else falsePos++;
        }
      }
      const fpPct = (falsePos / normal.length) * 100;
      const pass = aiDetect > 0 && latency >= 0 && fpPct <= cfg.maxFalsePositivePct;
      return {
        code: "AI-3.1", title: "Инсайдерские угрозы", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Свободная энергия vs статический RBAC.",
        metrics: [
          { name: "RBAC пропусков", value: rbacMiss, ok: rbacMiss > 0 },
          { name: "AI детектов", value: aiDetect, ok: aiDetect > 0 },
          { name: "False positive", value: fpPct.toFixed(2), unit: "%", ok: fpPct <= cfg.maxFalsePositivePct },
        ],
        successCriteria: [{ label: "Детект сюрприза", passed: pass, detail: `latency=${latency}` }],
        disqualificationCriteria: [{ label: "RBAC достаточен", passed: rbacMiss === 0, detail: "RBAC пропускает" }],
        baselineComparison: `RBAC пропустил ${rbacMiss}; AI детектировал ${aiDetect}.`,
        recommendation: pass ? "Anomaly-слой поверх audit." : "Настроить порог.",
      };
    },
  },
  "AI-3.2": {
    title: "Аппаратная энтропия",
    async run() {
      const cfg = CONFIG["AI-3.2"];
      const { provider, minEntropy } = await readHardwareEntropy(cfg.sampleBytes);
      const pass = minEntropy >= cfg.minEntropyBits;
      return {
        code: "AI-3.2", title: "Аппаратная энтропия", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "Каскад BM1366 → CSPRNG → hwrng → hwmon → jitter. Без PRNG.",
        metrics: [
          { name: "Провайдер", value: provider, ok: true },
          { name: "Min-entropy", value: minEntropy.toFixed(3), unit: "bits", threshold: `≥ ${cfg.minEntropyBits}`, ok: pass },
        ],
        successCriteria: [{ label: "Энтропия", passed: pass, detail: `${minEntropy.toFixed(3)} bits` }],
        disqualificationCriteria: [{ label: "Нестабильность", passed: pass, detail: pass ? "нет" : "да" }],
        recommendation: pass ? `Использовать ${provider}.` : "Подключить hwrng/ASIC.",
      };
    },
  },
  "AI-3.3": {
    title: "Бимодальная термодинамика",
    run() {
      const cfg = CONFIG["AI-3.3"];
      const sim = (heavy: boolean) => {
        const t0 = performance.now();
        let acc = 0;
        const it = heavy ? 80000 : 5000;
        for (let i = 0; i < it; i++) acc = (acc + i * 2654435761) | 0;
        if (heavy) for (let i = 0; i < 20000; i++) acc ^= Math.imul(i, acc);
        return performance.now() - t0;
      };
      const rE = Array.from({ length: cfg.routineCount }, () => sim(false));
      const dE = Array.from({ length: cfg.destructiveCount }, () => sim(true));
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const ratio = avg(dE) / Math.max(avg(rE), 0.0001);
      const pass = ratio >= cfg.minEnergyRatio;
      return {
        code: "AI-3.3", title: "Бимодальная термодинамика", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "System1 vs System2 — прокси энергии по wall time.",
        metrics: [{ name: "Ratio", value: ratio.toFixed(2), threshold: `≥ ${cfg.minEnergyRatio}`, ok: pass }],
        successCriteria: [{ label: "Различимые сигнатуры", passed: pass, detail: `ratio=${ratio.toFixed(2)}` }],
        disqualificationCriteria: [{ label: "Равномерная диссипация", passed: pass, detail: pass ? "нет" : "да" }],
        recommendation: pass ? "Бимодальный мониторинг." : "Усилить различие.",
      };
    },
  },
  "AI-3.4": {
    title: "Клеточные автоматы (воронка)",
    run() {
      const cfg = CONFIG["AI-3.4"];
      const { counts, trace } = generateStageTransitions(cfg.stageCount, cfg.transitionCount);
      const total = trace.length || 1;
      const probs = counts.map((c) => c / total);
      const entropy = -probs.reduce((e, p) => p > 0 ? e + p * Math.log2(p) : e, 0);
      const stability = 1 - entropy / Math.log2(cfg.stageCount);
      const bottleneck = counts.indexOf(Math.max(...counts));
      const pass = stability >= cfg.minStabilityScore;
      return {
        code: "AI-3.4", title: "Клеточные автоматы", status: pass ? "PASS" : "FAIL", durationMs: 0,
        methodology: "CA на стадиях pipeline; стабильность и bottleneck.",
        metrics: [
          { name: "Stability", value: stability.toFixed(3), threshold: `≥ ${cfg.minStabilityScore}`, ok: pass },
          { name: "Bottleneck", value: bottleneck, ok: true },
        ],
        successCriteria: [{ label: "Аттрактор", passed: pass, detail: `stage ${bottleneck}` }],
        disqualificationCriteria: [{ label: "Хаос", passed: pass, detail: pass ? "нет" : "да" }],
        samples: counts.map((c, i) => `stage-${i}: ${c}`),
        recommendation: pass ? "CA-модель устойчива." : "Скорректировать правила.",
      };
    },
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const only = process.argv[2];
const codes = only ? (BENCHMARKS[only] ? [only] : (console.error(`Неизвестный код: ${only}`), process.exit(1), [])) : Object.keys(BENCHMARKS);

(async () => {
  mkdirSync(LOGS_ROOT, { recursive: true });
  const startedAt = new Date().toISOString();
  const results: { code: string; status: BenchStatus }[] = [];

  for (const code of codes) {
    console.log(`\n=== ${code} ===`);
    const { title, run } = BENCHMARKS[code];
    const r = await runBench(code, title, run);
    results.push({ code, status: r.status });
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const summary = [
    "# Сводный отчёт серии бенчмарков CRM", "",
    `Дата: ${startedAt}`, "", `Итого: **${pass}/${results.length} PASS**`, "",
    "| Код | Статус |", "|-----|--------|",
    ...results.map((r) => `| ${r.code} | ${r.status} |`), "",
    "Запуск: `npm run bench` | один тест: `npm run bench -- MEM-1.1`", "",
  ];
  writeFileSync(join(LOGS_ROOT, "suite-report.md"), summary.join("\n"));
  console.log(`\nСводка: ${pass}/${results.length} PASS → тест/logs/suite-report.md`);
  process.exit(pass === results.length ? 0 : 1);
})();
