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

export function resolveActivePipeline(pipelines: Pipeline[], stored?: string | null): string | null {
  if (!pipelines.length) return null;
  if (stored && pipelines.some((p) => p.id === stored)) return stored;
  return pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? null;
}

export function stagesForPipeline(stages: Stage[], pipelineId: string | null) {
  if (!pipelineId) return stages;
  return stages
    .filter((s) => s.pipelineId === pipelineId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function leadsForPipeline<T extends { pipelineId?: string; status?: string }>(
  leads: T[],
  pipelineId: string | null,
  stageIds?: Set<string>,
) {
  if (!pipelineId) return leads;
  return leads.filter((l) => {
    if (l.pipelineId === pipelineId) return true;
    if (!l.pipelineId && stageIds?.has(l.status || "")) return true;
    return false;
  });
}
