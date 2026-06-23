import { Fptm } from "@sdr-crm/sdr-core";
import { db } from "../../db/index.js";
import { leads, stages } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { sdrConfig } from "./config.js";

const FEATURES = [
  "has_phone", "has_email", "has_comment", "has_region", "pd_consent",
  "assigned", "watchers", "source_form", "source_api", "source_webhook",
  "stage_early", "stage_mid", "stage_late", "stage_won", "stage_lost",
];

export type StagePrediction = {
  leadId: string;
  fromStageId: string;
  predictedClass: number;
  probabilities: number[];
  stageLabels: string[];
};

class LeadFptmScoring {
  private fptm = new Fptm(8, FEATURES.length, 2);
  private stageOrder: string[] = [];
  private ready = false;
  /** Precision-gated ensemble: rolling error variance per signal channel */
  private signalErrors: Record<string, number[]> = {
    rules: [], fptm: [], ai: [],
  };

  private encodeLeadFeatures(lead: typeof leads.$inferSelect, stageIdx: number): Uint8Array {
    const x = new Uint8Array(FEATURES.length);
    if (lead.phone) x[0] = 1;
    if (lead.email) x[1] = 1;
    if (lead.comment) x[2] = 1;
    if (lead.region) x[3] = 1;
    if (lead.pdConsent) x[4] = 1;
    if (lead.assignedUserId || lead.assignedDealManagerId) x[5] = 1;
    if ((lead.watchers?.length ?? 0) > 0) x[6] = 1;
    if (lead.source === "form") x[7] = 1;
    else if (lead.source === "api") x[8] = 1;
    else x[9] = 1;
    const bucket = Math.min(4, Math.floor((stageIdx / Math.max(1, this.stageOrder.length - 1)) * 4));
    x[10 + bucket] = 1;
    return x;
  }

  async init() {
    if (!sdrConfig.scoring) {
      this.ready = true;
      return;
    }
    const stageRows = await db.select().from(stages).orderBy(stages.sortOrder);
    this.stageOrder = stageRows.map((s: { id: string }) => s.id);
    const leadRows = await db.select().from(leads).limit(10_000);
    const X: Uint8Array[] = [];
    const y: number[] = [];
    for (const lead of leadRows) {
      const idx = this.stageOrder.indexOf(lead.statusId ?? "");
      if (idx < 0) continue;
      X.push(this.encodeLeadFeatures(lead, idx));
      y.push(Math.min(idx, 7));
    }
    if (X.length > 50) {
      this.fptm.seedFromData(X, y);
      this.fptm.fit(X, y, 2);
    }
    this.ready = true;
    logger.info("sdr.fptm.ready", { samples: X.length, stages: this.stageOrder.length });
  }

  isReady() {
    return this.ready;
  }

  predict(lead: typeof leads.$inferSelect): StagePrediction | null {
    if (!sdrConfig.scoring || !this.ready) return null;
    const fromIdx = this.stageOrder.indexOf(lead.statusId ?? "");
    if (fromIdx < 0) return null;
    const x = this.encodeLeadFeatures(lead, fromIdx);
    const probabilities = this.fptm.predictProba(x);
    const predictedClass = probabilities.indexOf(Math.max(...probabilities));
    return {
      leadId: lead.id,
      fromStageId: lead.statusId!,
      predictedClass,
      probabilities,
      stageLabels: this.stageOrder.slice(0, 8).map((_, i) => `stage-${i}`),
    };
  }

  recordTransition(lead: typeof leads.$inferSelect, _fromStageId: string, toStageId: string) {
    if (!sdrConfig.scoring) return null;
    const toIdx = this.stageOrder.indexOf(toStageId);
    const fromIdx = this.stageOrder.indexOf(lead.statusId ?? "");
    if (toIdx < 0 || fromIdx < 0) return null;
    const pred = this.predict(lead);
    if (pred) {
      const err = pred.predictedClass === toIdx ? 0 : 1;
      this.pushError("fptm", err);
    }
    const x = this.encodeLeadFeatures({ ...lead, statusId: toStageId }, toIdx);
    const y = Math.min(toIdx, 7);
    this.fptm.fit([x], [y], 1);
    return this.predict({ ...lead, statusId: toStageId });
  }

  private pushError(channel: string, err: number) {
    const arr = this.signalErrors[channel] ?? [];
    arr.push(err);
    if (arr.length > 32) arr.shift();
    this.signalErrors[channel] = arr;
  }

  /** Precision weight: w_i ∝ 1/var(error_i); guard ≥66% real signal via min samples */
  precisionWeights(): Record<string, number> {
    const weights: Record<string, number> = {};
    let total = 0;
    for (const [ch, errs] of Object.entries(this.signalErrors)) {
      if (errs.length < 5) {
        weights[ch] = 1;
        total += 1;
        continue;
      }
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      const variance = errs.reduce((a, e) => a + (e - mean) ** 2, 0) / errs.length;
      const w = 1 / Math.max(variance, 0.01);
      weights[ch] = w;
      total += w;
    }
    if (total <= 0) return { rules: 0.34, fptm: 0.33, ai: 0.33 };
    for (const k of Object.keys(weights)) weights[k]! /= total;
    return weights;
  }

  ensembleScore(lead: typeof leads.$inferSelect, ruleScore: number, aiScore?: number): number {
    const fptmPred = this.predict(lead);
    const fptmScore = fptmPred ? fptmPred.probabilities[fptmPred.predictedClass] ?? 0.5 : 0.5;
    const w = this.precisionWeights();
    const ai = aiScore ?? 0.5;
    return w.rules! * ruleScore + w.fptm! * fptmScore + w.ai! * ai;
  }
}

export const leadFptmScoring = new LeadFptmScoring();
