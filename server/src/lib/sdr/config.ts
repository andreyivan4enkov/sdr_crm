/** SDR hybrid feature flags (env). */
function envFlag(name: string, defaultOn = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultOn;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const sdrConfig = {
  search: envFlag("SDR_SEARCH"),
  audit: envFlag("SDR_AUDIT"),
  scoring: envFlag("SDR_SCORING"),
  graph: envFlag("SDR_GRAPH"),
  funnelCa: envFlag("SDR_FUNNEL_CA"),
  indexOnStart: envFlag("SDR_INDEX_ON_START", true),
  recallLimit: envInt("SDR_RECALL_LIMIT", 50),
  maxLeads: envInt("SDR_MAX_LEADS", 500_000),
  auditThreshold: Number(process.env.SDR_AUDIT_THRESHOLD) || 12,
  searchRadius: envInt("SDR_SEARCH_RADIUS", 22),
  dimensions: envInt("SDR_DIMENSIONS", 2048),
  activeBits: envInt("SDR_ACTIVE_BITS", 32),
};
