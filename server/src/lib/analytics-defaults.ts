import type { AnalyticsDashboard, AnalyticsGoal, AnalyticsWidget } from "../db/schema.js";

const uid = () => crypto.randomUUID();

export function buildDefaultDashboard(stages: { id: string; label: string }[]): {
  name: string;
  sortOrder: number;
  widgets: AnalyticsWidget[];
  goals: AnalyticsGoal[];
} {
  const first = stages[0]?.id ?? null;
  const won = stages.find((s) => /сделк/i.test(s.label))?.id ?? null;
  const goalId = uid();
  return {
    name: "Основной",
    sortOrder: 0,
    goals: [{
      id: goalId,
      title: "Первые 30 клиентов",
      metric: "leads_total",
      target: 30,
      sortOrder: 0,
    }],
    widgets: [
      { id: uid(), type: "kpi", label: "Всего лидов", metric: "leads_total", enabled: true, sortOrder: 0 },
      { id: uid(), type: "kpi", label: "Новых", metric: "stage_count", stageId: first, enabled: true, sortOrder: 1 },
      { id: uid(), type: "kpi", label: "Каналов подключено", metric: "channels_connected", enabled: true, sortOrder: 2 },
      { id: uid(), type: "kpi", label: "Сделок", metric: "stage_count", stageId: won, enabled: true, sortOrder: 3 },
      { id: uid(), type: "goal", goalId, enabled: true, sortOrder: 4 },
      { id: uid(), type: "funnel", stageIds: stages.map((s) => s.id), enabled: true, sortOrder: 5 },
      { id: uid(), type: "recent", limit: 5, enabled: true, sortOrder: 6 },
    ],
  };
}

export function serializeDashboard(row: AnalyticsDashboard) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    widgets: row.widgets,
    goals: row.goals,
  };
}
