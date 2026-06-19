import type {
  AnalyticsGoal, AnalyticsKpiMetric, Call, Channel, Field, GoalOperator, Lead, Stage, Task,
} from "@sdr-crm/api-client";

export type AnalyticsData = {
  leads: Lead[];
  stages: Stage[];
  channels: Channel[];
  fields?: Field[];
  tasks?: Task[];
  calls?: Call[];
};

export function resolveStageId(
  stageId: string | null | undefined,
  stages: Stage[],
  fallback?: "first" | "won",
): string | null {
  if (stageId) return stageId;
  if (fallback === "won") return stages.find((s) => /сделк/i.test(s.label))?.id ?? stages[0]?.id ?? null;
  if (fallback === "first") return stages[0]?.id ?? null;
  return null;
}

function leadsForStage(data: AnalyticsData, stageId?: string | null, fallback?: "first" | "won") {
  const id = resolveStageId(stageId, data.stages, fallback);
  if (!id) return data.leads;
  return data.leads.filter((l) => l.status === id);
}

export function computeMetric(
  metric: AnalyticsKpiMetric,
  data: AnalyticsData,
  stageId?: string | null,
  fieldId?: string | null,
): number {
  switch (metric) {
    case "leads_total":
      return data.leads.length;
    case "channels_connected":
      return data.channels.filter((c) => c.connected).length;
    case "stage_count": {
      const id = resolveStageId(stageId, data.stages, stageId ? undefined : "first");
      if (!id) return 0;
      return data.leads.filter((l) => l.status === id).length;
    }
    case "deals_signed": {
      const id = resolveStageId(stageId, data.stages, "won");
      if (!id) return 0;
      return data.leads.filter((l) => l.status === id).length;
    }
    case "money_sum": {
      if (!fieldId) return 0;
      return leadsForStage(data, stageId, stageId ? undefined : "won").reduce((sum, l) => {
        const raw = l.custom?.[fieldId] ?? "";
        const n = parseFloat(String(raw).replace(/[^\d.,-]/g, "").replace(",", "."));
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
    }
    case "calls_total":
      return data.calls?.length ?? 0;
    case "calls_inbound":
      return data.calls?.filter((c) => c.direction === "inbound").length ?? 0;
    case "calls_outbound":
      return data.calls?.filter((c) => c.direction === "outbound").length ?? 0;
    case "tasks_total":
      return data.tasks?.length ?? 0;
    case "tasks_open":
      return data.tasks?.filter((t) => !t.done && t.status !== "completed").length ?? 0;
    case "tasks_done":
      return data.tasks?.filter((t) => t.done || t.status === "completed").length ?? 0;
    default:
      return 0;
  }
}

export function checkGoalOperator(current: number, target: number, operator: GoalOperator = "gte"): boolean {
  switch (operator) {
    case "gte": return current >= target;
    case "gt": return current > target;
    case "lte": return current <= target;
    case "lt": return current < target;
    case "eq": return current === target;
    case "neq": return current !== target;
    default: return current >= target;
  }
}

export function evaluateGoal(goal: AnalyticsGoal, data: AnalyticsData): {
  current: number;
  target: number;
  met: boolean;
  pct: number;
  operator: GoalOperator;
} {
  const operator = goal.operator ?? "gte";
  const current = computeMetric(goal.metric, data, goal.stageId, goal.fieldId);
  const target = goal.target;
  const met = checkGoalOperator(current, target, operator);
  let pct = 0;
  if (operator === "gte" || operator === "gt") {
    pct = Math.min(100, (current / Math.max(target, 0.01)) * 100);
  } else if (operator === "lte" || operator === "lt") {
    pct = met ? 100 : (target > 0 ? Math.min(100, ((target - current) / target) * 100 + 50) : 0);
  } else {
    pct = met ? 100 : 15;
  }
  return { current, target, met, pct, operator };
}

/** @deprecated use evaluateGoal */
export function computeGoalProgress(goal: AnalyticsGoal, data: AnalyticsData) {
  const r = evaluateGoal(goal, data);
  return { current: r.current, target: r.target, pct: r.pct };
}

export function funnelStages(widgetStageIds: string[] | undefined, stages: Stage[]): Stage[] {
  const sorted = [...stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (!widgetStageIds?.length) return sorted;
  const order = new Map(widgetStageIds.map((id, i) => [id, i]));
  return sorted.filter((s) => order.has(s.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export const KPI_METRIC_LABELS: Record<AnalyticsKpiMetric, string> = {
  leads_total: "Всего лидов",
  stage_count: "Лидов на этапе",
  channels_connected: "Каналов подключено",
  deals_signed: "Подписанных продаж",
  money_sum: "Сумма (деньги)",
  calls_total: "Звонков всего",
  calls_inbound: "Входящих звонков",
  calls_outbound: "Исходящих звонков",
  tasks_total: "Задач всего",
  tasks_open: "Открытых задач",
  tasks_done: "Выполненных задач",
};

export const OPERATOR_LABELS: Record<GoalOperator, string> = {
  gte: "не меньше (≥)",
  gt: "больше (>)",
  lte: "не больше (≤)",
  lt: "меньше (<)",
  eq: "равно (=)",
  neq: "не равно (≠)",
};

export function formatMetricValue(metric: AnalyticsKpiMetric, value: number): string {
  if (metric === "money_sum") {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
  }
  return String(Math.round(value * 100) / 100);
}

export function metricNeedsStage(metric: AnalyticsKpiMetric) {
  return metric === "stage_count" || metric === "deals_signed" || metric === "money_sum";
}

export function metricNeedsField(metric: AnalyticsKpiMetric) {
  return metric === "money_sum";
}

export type FunnelCaMetric = {
  stability: number;
  density: number;
  bottleneck: number;
};

export function formatFunnelCaMetric(metric: FunnelCaMetric): string {
  return `Стабильность ${(metric.stability * 100).toFixed(0)}% · Плотность ${(metric.density * 100).toFixed(0)}%`;
}
