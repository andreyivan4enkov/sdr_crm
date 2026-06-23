import type { Pipeline, Stage } from "../api/client";

const LS_KEY = "crm_pipeline_id";

export function getStoredPipelineId(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function setStoredPipelineId(id: string) {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch { /* private mode */ }
}

export function resolveActivePipeline(
  pipelines: Pipeline[],
  stored?: string | null,
  stages: Stage[] = [],
): string | null {
  if (!pipelines.length) return null;

  const stageCount = (id: string) => stages.filter((s) => s.pipelineId === id).length;
  const pickBest = () => {
    const withStages = pipelines
      .map((p) => ({ p, n: stageCount(p.id) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    if (withStages.length) return withStages[0]!.p.id;
    return pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? null;
  };

  if (stored && pipelines.some((p) => p.id === stored)) {
    if (stageCount(stored) > 0 || stages.length === 0) return stored;
  }

  const defaults = pipelines.filter((p) => p.isDefault);
  if (defaults.length > 1) return pickBest();

  const singleDefault = defaults[0];
  if (singleDefault && stageCount(singleDefault.id) > 0) return singleDefault.id;

  return pickBest();
}

export function stagesForPipeline(stages: Stage[], pipelineId: string | null) {
  if (!pipelineId) return stages;
  return stages
    .filter((s) => s.pipelineId === pipelineId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function leadsForPipeline<T extends { pipelineId?: string; statusId?: string }>(
  leads: T[],
  pipelineId: string | null,
  stageIds?: Set<string>,
) {
  if (!pipelineId) return leads;
  return leads.filter((l) => {
    if (l.pipelineId === pipelineId) return true;
    if (!l.pipelineId && stageIds?.has(l.statusId || "")) return true;
    return false;
  });
}
