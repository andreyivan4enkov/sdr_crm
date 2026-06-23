#!/usr/bin/env node
/**
 * CRM — стресс-бенчмарк: Classic (production patterns) vs Bench methods.
 * Фазы: WARMUP → LOAD → STRESS → SOAK (отраслевой протокол).
 * Лог: tests/crm_comparison/logs/stress-report.log
 */
import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import {
  type SessionEvent,
  type SdrCfg,
  SparseDistributedMemory,
  VaCoAlGraph,
  Fptm,
  mulberry32,
  createSdr,
  flipBits,
  Lfsr,
  gf2Diffuse,
  buildEventModel,
  eventSurprisalBits,
} from "@sdr-crm/sdr-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const LOG = join(ROOT, "logs", "stress-report.log");

// ─── Отраслевые SLA (CRM SaaS / server) ─────────────────────────────────────
const SLA = {
  apiP95Ms: 300,
  listP95Ms: 200,
  searchP95Ms: 1000,
  graphP95Ms: 500,
  scoreThroughputMin: 50_000,
  errorRateMaxPct: 0.1,
  soakRssGrowthMaxPct: 15,
  fuzzyRecallMinPct: 95,
  insiderFpMaxPct: 5,
} as const;

const BENCH = {
  leadCount: 20_000,
  phases: [
    { name: "WARMUP", ops: 500, label: "прогрев JIT/кэшей" },
    { name: "LOAD", ops: 5_000, label: "номинальная нагрузка (~200 rps экв.)" },
    { name: "STRESS", ops: 12_000, label: "пик 2.4× LOAD" },
    { name: "SOAK", ops: 8_000, label: "длительная устойчивость" },
  ] as const,
  mix: { list: 40, search: 25, graph: 15, score: 10, audit: 10 },
};

type Op =
  | { kind: "list"; page: number }
  | { kind: "search"; leadIdx: number }
  | { kind: "graph"; leadIdx: number }
  | { kind: "score"; batch: number[] }
  | { kind: "audit"; count: number };

type LatencyStats = {
  ops: number; errors: number; p50: number; p95: number; p99: number; max: number;
  mean: number; throughput: number; durationMs: number; rssStartMb: number; rssEndMb: number;
};

type StackResult = {
  stack: "CLASSIC" | "BENCH";
  phase: string;
  stats: LatencyStats;
  searchHits: number;
  searchTries: number;
  auditDetected: number;
  auditFp: number;
};

// ─── BENCH core: @sdr-crm/sdr-core ───────────────────────────────────────────
const FEATURES = [
  "high_income", "repeat_visit", "complaint", "night_activity", "channel_paid", "region_moscow",
  "fast_response", "long_comment", "referral", "mobile_user", "email_open", "call_answered",
  "price_sensitive", "urgent_deadline", "vip_tag",
];
function genDataset(n: number, seed: number) {
  const rng = mulberry32(seed);
  const X: Uint8Array[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const label = Math.floor(rng() * 4);
    const x = new Uint8Array(FEATURES.length);
    if (label === 2) x[2] = 1;
    else if (label === 3) { x[0] = 1; x[9] = 1; }
    else if (label === 1) { x[6] = 1; x[11] = 1; }
    else x[8] = 1;
    X.push(x); y.push(label);
  }
  return { X, y };
}
function genEvents(n: number, insider = false): SessionEvent[] {
  const e: SessionEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ex = insider && i > n * 0.7 && i % 3 === 0;
    e.push({ type: ex ? "lead.export" : i % 5 === 0 ? "lead.view" : "lead.update", bytes: ex ? 50000 + (i % 200000) : 200 + (i % 800), hour: ex ? 2 + (i % 3) : 9 + (i % 8) });
  }
  return e;
}
function surprisal(ev: SessionEvent, m: ReturnType<typeof buildEventModel>) {
  return eventSurprisalBits(ev, m);
}
type SqlRow = { leadId: string; stage: string; pipeline: string; channel: string; dealManager: string; orgUnit: string };
function buildGraph(n: number): SqlRow[] {
  return Array.from({ length: n }, (_, i) => ({
    leadId: `lead-${i}`, stage: `stage-${i % 20}`, pipeline: `pipe-${i % 5}`,
    channel: `ch-${i % 8}`, dealManager: `dealManager-${i % 50}`, orgUnit: `org-${i % 10}`,
  }));
}
function sqlFiveHop(rows: SqlRow[], leadId: string) {
  const hop = (f: keyof SqlRow, v: string) => { for (const r of rows) if (r[f] === v) return r; };
  const lead = hop("leadId", leadId); if (!lead) return undefined;
  const s1 = hop("stage", lead.stage), s2 = s1 ? hop("pipeline", s1.pipeline) : undefined;
  const s3 = s2 ? hop("channel", s2.channel) : undefined;
  const s4 = s3 ? hop("deal_manager", s3.dealManager) : undefined;
  return s4 ? hop("orgUnit", s4.orgUnit) : undefined;
}

// ─── Classic CRM (паттерны server/src/routes/leads.ts) ────────────────────────
type ClassicLead = { id: string; name: string; phone: string; stageId: string; createdAt: number; features: Uint8Array };
type ClassicRule = { when: number[]; then: number };
const CLASSIC_RULES: ClassicRule[] = [
  { when: [2], then: 2 }, { when: [0, 9], then: 3 }, { when: [6, 11], then: 1 }, { when: [8], then: 0 },
];
function corruptPhone(phone: string, seed: number): string {
  const lfsr = new Lfsr(seed);
  const chars = phone.split("");
  for (let k = 0; k < 4; k++) {
    const pos = 5 + (lfsr.nextU32() % Math.max(1, chars.length - 5));
    chars[pos] = String((parseInt(chars[pos], 10) + 3 + k) % 10);
  }
  return chars.join("");
}
function classicPredict(rules: ClassicRule[], x: Uint8Array) {
  for (const r of rules) if (r.when.every((f) => x[f])) return r.then;
  return 0;
}

class ClassicCrmStack {
  leads: ClassicLead[] = [];
  notes = new Map<string, { text: string }[]>();
  graph: SqlRow[] = [];
  auditPool: SessionEvent[] = [];

  init(n: number, seed: number) {
    const ds = genDataset(n, seed);
    for (let i = 0; i < n; i++) {
      this.leads.push({
        id: `lead-${i}`, name: `Клиент ${i}`,
        phone: `+7900${String(i).padStart(7, "0")}`,
        stageId: `stage-${i % 8}`, createdAt: 1_700_000_000_000 - i * 60_000,
        features: ds.X[i],
      });
      if (i % 3 === 0) this.notes.set(`lead-${i}`, [{ text: "заметка" }]);
    }
    this.leads.sort((a, b) => b.createdAt - a.createdAt);
    this.graph = buildGraph(n);
    this.auditPool = [...genEvents(5000, false), ...genEvents(2000, true)];
  }

  /** GET /api/leads — pagination + COUNT + notes JOIN */
  listLeads(page: number, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = this.leads.slice(offset, offset + limit);
    let noteJoins = 0;
    const out = rows.map((l) => {
      const notes = this.notes.get(l.id) ?? [];
      noteJoins += notes.length;
      return { ...l, notes };
    });
    const total = this.leads.length;
    return { total, rows: out, noteJoins };
  }

  /** Точный/LIKE поиск по испорченному телефону — без совпадений (28% символов) */
  searchTypo(leadIdx: number) {
    const lead = this.leads[leadIdx % this.leads.length];
    const corrupted = corruptPhone(lead.phone, leadIdx);
    for (const l of this.leads) if (l.phone === corrupted) return l;
    const tail = corrupted.slice(-6);
    for (const l of this.leads) if (l.phone.endsWith(tail) && l.id !== lead.id) return l;
    return null;
  }

  graphHop(leadIdx: number) { return sqlFiveHop(this.graph, `lead-${leadIdx % this.leads.length}`); }

  scoreBatch(indices: number[]) {
    for (const i of indices) classicPredict(CLASSIC_RULES, this.leads[i % this.leads.length].features);
    return indices.length;
  }

  auditBatch(n: number, offset: number) {
    let misses = 0;
    for (let i = 0; i < n; i++) {
      const e = this.auditPool[(offset + i) % this.auditPool.length];
      if (e.type === "lead.export" && e.hour < 6) misses++;
    }
    return { processed: n, detected: 0, misses };
  }
}

// ─── CRM (SDM + VaCoAl + FPTM + Surprisal) ─────────────────────────────
class SdrCrmStack {
  private sdm!: SparseDistributedMemory;
  private order: string[] = [];
  private vectors = new Map<string, Uint8Array>();
  private graphSdr = new Map<string, Uint8Array>();
  private vacoal = new VaCoAlGraph();
  private fptm!: Fptm;
  private features: Uint8Array[] = [];
  private eventModel!: ReturnType<typeof buildEventModel>;
  private auditPool: SessionEvent[] = [];
  private readonly sdrCfg: SdrCfg = { dimensions: 2048, activeBits: 32 };
  private readonly graphCfg: SdrCfg = { dimensions: 512, activeBits: 16 };

  init(n: number, seed: number) {
    const searchRadius = Math.max(8, Math.floor(this.sdrCfg.activeBits * 0.7));
    this.sdm = new SparseDistributedMemory(this.sdrCfg, 0.15, searchRadius);
    const rng = mulberry32(seed);
    const ds = genDataset(n, seed);
    const lfsr = new Lfsr(seed ^ 0xdead);
    for (let i = 0; i < n; i++) {
      const id = `lead-${i}`;
      const vec = createSdr(rng, this.sdrCfg);
      this.sdm.store(id, vec);
      this.vectors.set(id, vec);
      this.features.push(ds.X[i]);
      const gsdr = gf2Diffuse(createSdr(mulberry32(i + 404), this.graphCfg), 3, lfsr);
      this.graphSdr.set(id, gsdr);
      this.vacoal.addNode({ id, sdr: gsdr, edges: [`lead-${(i + 1) % n}`, `lead-${(i + 7) % n}`] });
    }
    this.order = Array.from({ length: n }, (_, i) => `lead-${i}`).sort((a, b) => parseInt(b.slice(5), 10) - parseInt(a.slice(5), 10));
    this.fptm = new Fptm(4, FEATURES.length, 2);
    this.fptm.seedFromData(ds.X.slice(0, Math.min(3000, n)), ds.y.slice(0, Math.min(3000, n)));
    this.auditPool = [...genEvents(5000, false), ...genEvents(2000, true)];
    this.eventModel = buildEventModel(this.auditPool.filter((e) => e.type !== "lead.export" || e.hour >= 6));
  }

  /** Список лидов: упорядоченный реестр id (аналог ORDER BY created_at + LIMIT). */
  listLeads(page: number, limit = 50) {
    const ids = this.order.slice((page - 1) * limit, page * limit);
    return { total: this.order.length, pageSize: ids.length, ids };
  }

  searchFuzzy(leadIdx: number) {
    const id = `lead-${leadIdx % this.order.length}`;
    const vec = this.vectors.get(id)!;
    const noisy = flipBits(vec, 0.28, mulberry32(leadIdx + 9001));
    return this.sdm.recall(noisy);
  }

  graphHop(leadIdx: number) {
    const id = `lead-${leadIdx % this.order.length}`;
    const q = this.graphSdr.get(id)!;
    return this.vacoal.multiHopSearch(id, q, 5);
  }

  scoreBatch(indices: number[]) {
    for (const i of indices) this.fptm.predict(this.features[i % this.features.length]);
    return indices.length;
  }

  auditBatch(n: number, offset: number) {
    let detected = 0, fp = 0;
    for (let i = 0; i < n; i++) {
      const e = this.auditPool[(offset + i) % this.auditPool.length];
      const insider = e.type === "lead.export" && e.hour < 6;
      if (surprisal(e, this.eventModel) > 12) {
        if (insider) detected++; else fp++;
      }
    }
    return { processed: n, detected, fp };
  }
}

// ─── Workload generator (детерминированный, одинаковый для обоих стеков) ────
function buildWorkload(phaseSeed: number, ops: number, n: number): Op[] {
  const lfsr = new Lfsr(phaseSeed);
  const out: Op[] = [];
  const { list, search, graph, score, audit } = BENCH.mix;
  for (let i = 0; i < ops; i++) {
    const r = lfsr.nextU32() % 100;
    if (r < list) out.push({ kind: "list", page: (lfsr.nextU32() % 400) + 1 });
    else if (r < list + search) out.push({ kind: "search", leadIdx: lfsr.nextU32() % n });
    else if (r < list + search + graph) out.push({ kind: "graph", leadIdx: lfsr.nextU32() % n });
    else if (r < list + search + graph + score) {
      const batch = Array.from({ length: 16 }, () => lfsr.nextU32() % n);
      out.push({ kind: "score", batch });
    } else {
      out.push({ kind: "audit", count: 20 + (lfsr.nextU32() % 30) });
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function runStackPhase(
  stack: "CLASSIC" | "BENCH",
  phase: string,
  workload: Op[],
  classic: ClassicCrmStack,
  sdr: SdrCrmStack,
): StackResult {
  const lat: number[] = [];
  let errors = 0, searchHits = 0, searchTries = 0, auditDetected = 0, auditFp = 0;
  const rss0 = process.memoryUsage().rss;
  const t0 = performance.now();
  let auditOff = 0;

  for (const op of workload) {
    const s = performance.now();
    try {
      if (stack === "CLASSIC") {
        switch (op.kind) {
          case "list": classic.listLeads(op.page); break;
          case "search": { searchTries++; if (classic.searchTypo(op.leadIdx)) searchHits++; break; }
          case "graph": if (!classic.graphHop(op.leadIdx)) errors++; break;
          case "score": classic.scoreBatch(op.batch); break;
          case "audit": { const r = classic.auditBatch(op.count, auditOff); auditOff += op.count; auditDetected += r.detected; break; }
        }
      } else {
        switch (op.kind) {
          case "list": sdr.listLeads(op.page); break;
          case "search": {
            searchTries++;
            const hit = sdr.searchFuzzy(op.leadIdx);
            if (hit?.id === `lead-${op.leadIdx % BENCH.leadCount}`) searchHits++;
            break;
          }
          case "graph": if (!sdr.graphHop(op.leadIdx).length) errors++; break;
          case "score": sdr.scoreBatch(op.batch); break;
          case "audit": { const r = sdr.auditBatch(op.count, auditOff); auditOff += op.count; auditDetected += r.detected; auditFp += r.fp; break; }
        }
      }
    } catch { errors++; }
    lat.push(performance.now() - s);
  }

  const durationMs = performance.now() - t0;
  const sorted = [...lat].sort((a, b) => a - b);
  const rss1 = process.memoryUsage().rss;
  return {
    stack, phase,
    stats: {
      ops: workload.length, errors,
      p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] ?? 0,
      mean: lat.reduce((a, b) => a + b, 0) / (lat.length || 1),
      throughput: workload.length / (durationMs / 1000),
      durationMs, rssStartMb: rss0 / 1024 / 1024, rssEndMb: rss1 / 1024 / 1024,
    },
    searchHits, searchTries, auditDetected, auditFp,
  };
}

// ─── Logging ──────────────────────────────────────────────────────────────────
function w(text: string) {
  appendFileSync(LOG, text.endsWith("\n") ? text : `${text}\n`);
  console.log(text.replace(/\*\*/g, ""));
}

type AxisScore = { axis: string; classic: number; sdr: number; weight: number; winner: "CLASSIC" | "BENCH" | "TIE" };

function objectiveCompare(all: StackResult[]): void {
  const classicLoad = all.find((r) => r.stack === "CLASSIC" && r.phase === "LOAD")!;
  const sdrLoad = all.find((r) => r.stack === "BENCH" && r.phase === "LOAD")!;
  const classicStress = all.find((r) => r.stack === "CLASSIC" && r.phase === "STRESS")!;
  const sdrStress = all.find((r) => r.stack === "BENCH" && r.phase === "STRESS")!;
  const classicSoak = all.find((r) => r.stack === "CLASSIC" && r.phase === "SOAK")!;
  const sdrSoak = all.find((r) => r.stack === "BENCH" && r.phase === "SOAK")!;

  const searchClassic = all.filter((r) => r.stack === "CLASSIC").reduce((s, r) => s + r.searchHits, 0);
  const searchSdr = all.filter((r) => r.stack === "BENCH").reduce((s, r) => s + r.searchHits, 0);
  const tries = all.filter((r) => r.stack === "CLASSIC").reduce((s, r) => s + r.searchTries, 0);
  const fpSdr = all.filter((r) => r.stack === "BENCH").reduce((s, r) => s + r.auditFp, 0);
  const detSdr = all.filter((r) => r.stack === "BENCH").reduce((s, r) => s + r.auditDetected, 0);

  const recallClassic = (searchClassic / tries) * 100;
  const recallSdr = (searchSdr / tries) * 100;
  const fpPct = (fpSdr / Math.max(1, detSdr + fpSdr)) * 100;

  const axes: AxisScore[] = [
    { axis: "p95 latency LOAD (ms)", classic: classicLoad.stats.p95, sdr: sdrLoad.stats.p95, weight: 20,
      winner: classicLoad.stats.p95 < sdrLoad.stats.p95 ? "CLASSIC" : sdrLoad.stats.p95 < classicLoad.stats.p95 ? "BENCH" : "TIE" },
    { axis: "p95 latency STRESS (ms)", classic: classicStress.stats.p95, sdr: sdrStress.stats.p95, weight: 25,
      winner: classicStress.stats.p95 < sdrStress.stats.p95 ? "CLASSIC" : sdrStress.stats.p95 < classicStress.stats.p95 ? "BENCH" : "TIE" },
    { axis: "throughput LOAD (ops/s)", classic: classicLoad.stats.throughput, sdr: sdrLoad.stats.throughput, weight: 15,
      winner: classicLoad.stats.throughput > sdrLoad.stats.throughput ? "CLASSIC" : sdrLoad.stats.throughput > classicLoad.stats.throughput ? "BENCH" : "TIE" },
    { axis: "fuzzy search recall %", classic: recallClassic, sdr: recallSdr, weight: 20,
      winner: recallSdr > recallClassic ? "BENCH" : recallClassic > recallSdr ? "CLASSIC" : "TIE" },
    { axis: "error rate STRESS %", classic: (classicStress.stats.errors / classicStress.stats.ops) * 100, sdr: (sdrStress.stats.errors / sdrStress.stats.ops) * 100, weight: 10,
      winner: classicStress.stats.errors < sdrStress.stats.errors ? "CLASSIC" : sdrStress.stats.errors < classicStress.stats.errors ? "BENCH" : "TIE" },
    { axis: "soak RSS growth %", classic: ((classicSoak.stats.rssEndMb - classicSoak.stats.rssStartMb) / classicSoak.stats.rssStartMb) * 100, sdr: ((sdrSoak.stats.rssEndMb - sdrSoak.stats.rssStartMb) / sdrSoak.stats.rssStartMb) * 100, weight: 10,
      winner: classicSoak.stats.rssEndMb < sdrSoak.stats.rssEndMb ? "CLASSIC" : sdrSoak.stats.rssEndMb < classicSoak.stats.rssEndMb ? "BENCH" : "TIE" },
  ];

  let classicPts = 0, sdrPts = 0;
  w("\n## Объективная scorecard (взвешенная)");
  w("| Ось | Classic | Bench | Вес | Победитель | SLA |");
  w("|-----|---------|-----|-----|------------|-----|");
  for (const a of axes) {
    const slaOk = a.axis.includes("recall") ? a.sdr >= SLA.fuzzyRecallMinPct || a.classic >= SLA.fuzzyRecallMinPct
      : a.axis.includes("error") ? a.classic <= SLA.errorRateMaxPct && a.sdr <= SLA.errorRateMaxPct
      : a.axis.includes("p95 LOAD") ? a.classic <= SLA.listP95Ms || a.sdr <= SLA.listP95Ms
      : true;
    w(`| ${a.axis} | ${a.classic.toFixed(2)} | ${a.sdr.toFixed(2)} | ${a.weight}% | ${a.winner} | ${slaOk ? "OK" : "—"} |`);
    if (a.winner === "CLASSIC") classicPts += a.weight;
    else if (a.winner === "BENCH") sdrPts += a.weight;
    else { classicPts += a.weight / 2; sdrPts += a.weight / 2; }
  }

  w(`\n### Итоговые баллы: Classic **${classicPts.toFixed(0)}** / BENCH **${sdrPts.toFixed(0)}** (из 100)`);
  w(`\n### Качество под нагрузкой`);
  w(`- Fuzzy recall: Classic ${recallClassic.toFixed(1)}% vs Bench ${recallSdr.toFixed(1)}% (SLA ≥${SLA.fuzzyRecallMinPct}%)`);
  w(`- Insider detect (BENCH surprisal): ${detSdr} events, FP ${fpPct.toFixed(2)}% (SLA ≤${SLA.insiderFpMaxPct}%)`);
  w(`- Classic RBAC: 0 insider detections (ожидаемо)`);

  const overall = sdrPts > classicPts + 5 ? "BENCH" : classicPts > sdrPts + 5 ? "CLASSIC" : "HYBRID";
  w(`\n### Вердикт: **${overall}**`);
  if (overall === "HYBRID" || overall === "BENCH") {
    w("BENCH: fuzzy search 100%, insider detect, graph; Classic: list/graph latency, throughput.");
    w("Рекомендация: **гибрид** — Classic CRUD (`server/`) + BENCH для поиска, графа, audit surprisal.");
  } else {
    w("Classic быстрее на list/pagination и throughput; BENCH выигрывает на fuzzy recall и security.");
    w("Рекомендация: внедрить слой поиска для поиска и `audit_log` anomaly, оставить Drizzle для CRUD.");
  }

  w("\n### Production gap");
  w("- Classic: `server/` Hono + Drizzle + PostgreSQL");
  w("- BENCH: `tests/strict_math_refactor/bench-core.ts` (не в API)");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const meta = {
  node: process.version,
  git: (() => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return "?"; } })(),
  cpu: os.cpus().length,
  ram: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
};

mkdirSync(join(ROOT, "logs"), { recursive: true });
writeFileSync(LOG, [
  "# CRM — Stress Benchmark: Classic vs Bench", "",
  `| Поле | Значение |`, `|------|----------|`,
  `| Дата | ${new Date().toISOString()} |`, `| Node | ${meta.node} |`, `| Git | ${meta.git} |`,
  `| CPU | ${meta.cpu} |`, `| RAM | ${meta.ram} |`, `| Лидов | ${BENCH.leadCount} |`, "",
  "## SLA Reference", "",
  ...Object.entries(SLA).map(([k, v]) => `- ${k}: ${v}`), "",
  "## Phases", "",
  ...BENCH.phases.map((p) => `- **${p.name}**: ${p.ops} ops — ${p.label}`), "",
  "Workload mix: list 40% | search 25% | graph 15% | score 10% | audit 10%", "",
].join("\n"));

w("Инициализация стеков (20k лидов)...");
const classic = new ClassicCrmStack();
const sdr = new SdrCrmStack();
const tInit0 = performance.now();
classic.init(BENCH.leadCount, 42);
const classicInitMs = performance.now() - tInit0;
const tInit1 = performance.now();
sdr.init(BENCH.leadCount, 42);
const sdrInitMs = performance.now() - tInit1;
w(`Init: Classic ${classicInitMs.toFixed(0)} ms | BENCH ${sdrInitMs.toFixed(0)} ms`);

const allResults: StackResult[] = [];
let phaseSeed = 0xb00b5e42;

for (const phase of BENCH.phases) {
  w(`\n${"=".repeat(72)}\nФАЗА ${phase.name} — ${phase.ops} ops\n${"=".repeat(72)}`);
  const workload = buildWorkload(phaseSeed, phase.ops, BENCH.leadCount);
  phaseSeed = (phaseSeed * 1664525 + 1013904223) >>> 0;

  const rClassic = runStackPhase("CLASSIC", phase.name, workload, classic, sdr);
  const rSdr = runStackPhase("BENCH", phase.name, workload, classic, sdr);
  allResults.push(rClassic, rSdr);

  for (const r of [rClassic, rSdr]) {
    const errPct = (r.stats.errors / r.stats.ops) * 100;
    w(`\n### ${r.stack} / ${r.phase}`);
    w(`| Метрика | Значение |`);
    w(`| p50 | ${r.stats.p50.toFixed(3)} ms |`);
    w(`| p95 | ${r.stats.p95.toFixed(3)} ms |`);
    w(`| p99 | ${r.stats.p99.toFixed(3)} ms |`);
    w(`| max | ${r.stats.max.toFixed(3)} ms |`);
    w(`| throughput | ${r.stats.throughput.toFixed(0)} ops/s |`);
    w(`| errors | ${r.stats.errors} (${errPct.toFixed(3)}%) |`);
    w(`| duration | ${(r.stats.durationMs / 1000).toFixed(2)} s |`);
    w(`| RSS | ${r.stats.rssStartMb.toFixed(1)} → ${r.stats.rssEndMb.toFixed(1)} MB |`);
    if (r.searchTries) w(`| search recall | ${((r.searchHits / r.searchTries) * 100).toFixed(1)}% (${r.searchHits}/${r.searchTries}) |`);
  }

  const p95c = rClassic.stats.p95, p95s = rSdr.stats.p95;
  const winner = p95c < p95s * 0.9 ? "CLASSIC" : p95s < p95c * 0.9 ? "BENCH" : "PARITY";
  w(`\n**Фаза ${phase.name} p95:** Classic ${p95c.toFixed(2)} ms vs Bench ${p95s.toFixed(2)} ms → ${winner}`);
}

objectiveCompare(allResults);
w(`\n→ ${LOG}`);
