import { sdrConfig } from "./config.js";
import { leadSdrIndex } from "./lead-index.js";
import { leadSdrGraph } from "./lead-graph.js";
import { leadFptmScoring } from "./fptm-scoring.js";
import { logger } from "../logger.js";

export { sdrConfig } from "./config.js";
export { leadSdrIndex, indexLeadAfterWrite } from "./lead-index.js";
export { leadSdrGraph } from "./lead-graph.js";
export { leadFptmScoring } from "./fptm-scoring.js";
export { computeFunnelCaMetric } from "./funnel-ca.js";
export { scoreAuditSurprisal } from "./audit-surprisal.js";

export async function initSdrLayer() {
  const enabled = sdrConfig.search || sdrConfig.audit || sdrConfig.scoring || sdrConfig.graph || sdrConfig.funnelCa;
  if (!enabled && !sdrConfig.indexOnStart) return;

  logger.info("sdr.init.start", {
    search: sdrConfig.search,
    audit: sdrConfig.audit,
    scoring: sdrConfig.scoring,
    graph: sdrConfig.graph,
    funnelCa: sdrConfig.funnelCa,
  });

  const tasks: Promise<void>[] = [];
  if (sdrConfig.search || sdrConfig.indexOnStart) tasks.push(leadSdrIndex.init());
  if (sdrConfig.graph) tasks.push(leadSdrGraph.init());
  if (sdrConfig.scoring) tasks.push(leadFptmScoring.init());
  await Promise.all(tasks);

  logger.info("sdr.init.done", { indexSize: leadSdrIndex.size() });
}
