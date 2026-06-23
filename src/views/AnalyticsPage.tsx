import { useEffect, useMemo, useState } from "react";
import {
  Users, TrendingUp, Plug, CheckCircle2, SlidersHorizontal, Plus, Trash2, Pencil,
  Target, BarChart3, X, Save, MessageSquare, Sparkles,
} from "lucide-react";
import {
  computeMetric, evaluateGoal, funnelStages, formatMetricValue, KPI_METRIC_LABELS,
  metricNeedsField, metricNeedsStage, OPERATOR_LABELS, leadStageId, type AnalyticsData,
} from "../lib/analytics-metrics";
import {
  api, hasPermission, type AnalyticsDashboard, type AnalyticsGoal, type AnalyticsWidget,
  type AuthUser, type Call, type Channel, type Field, type Lead, type Stage, type Task,
  type AiboardDashboardQueryResult,
} from "../api/client";
import { useUiT } from "../lib/i18n-labels";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import { NlDashboard } from "../components/analytics/NlDashboard";

const uid = () => Math.random().toString(36).slice(2, 10);

type CrmSlice = AnalyticsData;

type Props = {
  t: Record<string, string>;
  data: CrmSlice;
  user: AuthUser;
  StageBadge: React.FC<{ stage: Stage }>;
  onOpenAiChat?: () => void;
  onOpenAiDashboards?: () => void;
};

function kpiIcon(metric: string) {
  if (metric === "channels_connected") return Plug;
  if (metric === "stage_count") return TrendingUp;
  if (metric === "leads_total") return Users;
  return CheckCircle2;
}

function emptyDashboard(name: string, sortOrder: number, stages: Stage[]): AnalyticsDashboard {
  const goalId = uid();
  return {
    id: crypto.randomUUID(),
    name,
    sortOrder,
    goals: [],
    widgets: [
      { id: uid(), type: "kpi", label: "Всего лидов", metric: "leads_total", enabled: true, sortOrder: 0 },
      { id: uid(), type: "funnel", stageIds: stages.map((s) => s.id), enabled: true, sortOrder: 1 },
      { id: uid(), type: "recent", limit: 5, enabled: true, sortOrder: 2 },
    ],
  };
}

export function AnalyticsPage({ t, data, user, StageBadge, onOpenAiChat, onOpenAiDashboards }: Props) {
  const { tr } = useUiT();
  const canManage = hasPermission(user, "analytics.manage");
  const [dashboards, setDashboards] = useState<AnalyticsDashboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [draft, setDraft] = useState<AnalyticsDashboard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editWidget, setEditWidget] = useState<AnalyticsWidget | null>(null);
  const [editGoal, setEditGoal] = useState<AnalyticsGoal | null>(null);
  const canViewCalls = hasPermission(user, "calls.view");
  const callsLoad = useAsyncLoad(
    () => api.getCalls().then((r) => r.calls),
    [user],
    canViewCalls,
  );
  const aiDashLoad = useAsyncLoad(async () => {
    const r = await api.getAiboardDashboard();
    const widgets = (r.graph as { widgets?: (AiboardDashboardQueryResult & { id: string })[] } | null)?.widgets;
    return Array.isArray(widgets) ? widgets.map((w, i) => ({ ...w, id: w.id || `w_${i}` })) : [];
  }, []);
  const calls = callsLoad.data ?? [];
  const aiDashboards = aiDashLoad.data ?? [];

  const analyticsData: AnalyticsData = useMemo(() => ({
    ...data,
    calls: hasPermission(user, "calls.view") ? calls : [],
  }), [data, calls, user]);

  useEffect(() => {
    api.getAnalytics().then((r) => {
      setDashboards(r.dashboards);
      setActiveId(r.dashboards[0]?.id ?? null);
      setErr("");
    }).catch((e: unknown) => {
      const status = (e as Error & { status?: number }).status;
      if (status === 403) setErr("Нет права analytics.view — обратитесь к администратору.");
      else setErr(e instanceof Error ? e.message : "Не удалось загрузить дашборды");
    }).finally(() => setLoading(false));
  }, []);

  const working = draft ?? dashboards;
  const active = working.find((d) => d.id === activeId) ?? working[0] ?? null;

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(dashboards)));
    setSettingsMode(true);
  }

  function cancelEdit() {
    setDraft(null);
    setSettingsMode(false);
    setEditWidget(null);
    setEditGoal(null);
    setErr("");
  }

  async function save() {
    if (!draft?.length) return;
    setSaving(true);
    setErr("");
    try {
      const { dashboards: saved } = await api.updateAnalyticsDashboards(draft);
      setDashboards(saved);
      setActiveId((id) => saved.find((d) => d.id === id)?.id ?? saved[0]?.id ?? null);
      setDraft(null);
      setSettingsMode(false);
      setEditWidget(null);
      setEditGoal(null);
    } catch (e: unknown) {
      setErr((e as Error).message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function patchActive(patch: Partial<AnalyticsDashboard>) {
    if (!draft || !active) return;
    setDraft(draft.map((d) => (d.id === active.id ? { ...d, ...patch } : d)));
  }

  function addDashboard() {
    const list = draft ?? dashboards;
    const d = emptyDashboard(`Дашборд ${list.length + 1}`, list.length, data.stages);
    const next = [...list, d];
    setDraft(next);
    setActiveId(d.id);
    if (!settingsMode) { setSettingsMode(true); }
  }

  function removeDashboard(id: string) {
    if (!draft || draft.length < 2) return;
    const next = draft.filter((d) => d.id !== id).map((d, i) => ({ ...d, sortOrder: i }));
    setDraft(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  }

  const sortedWidgets = useMemo(
    () => [...(active?.widgets ?? [])].filter((w) => w.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [active?.widgets],
  );

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Загрузка аналитики…</div>;
  }

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" />
          <h2 className="font-semibold">{tr("analytics", undefined, "nav")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenAiChat && (
            <button type="button" onClick={onOpenAiChat}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-teal-500/40 text-teal-700 dark:text-teal-300 ${t.hover}`}>
              <MessageSquare className="w-4 h-4" /> {tr("openAiChat", undefined, "analytics")}
            </button>
          )}
          {onOpenAiDashboards && (
            <button type="button" onClick={onOpenAiDashboards}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700`}>
              <Sparkles className="w-4 h-4" /> {tr("openAiDashboards", undefined, "analytics")}
            </button>
          )}
          {canManage && (
            <>
            {settingsMode ? (
              <>
                <button type="button" onClick={cancelEdit} className={`px-3 py-2 rounded-lg text-sm border ${t.border} ${t.muted}`}>{tr("cancel", undefined, "common")}</button>
                <button type="button" onClick={save} disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60">
                  <Save className="w-4 h-4" /> {saving ? tr("saving", undefined, "analytics") : tr("save", undefined, "common")}
                </button>
              </>
            ) : (
              <button type="button" onClick={startEdit}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${t.border} ${t.muted} ${t.hover}`}>
                <SlidersHorizontal className="w-4 h-4" /> {tr("configureDashboards", undefined, "analytics")}
              </button>
            )}
            </>
          )}
        </div>
      </div>

      {working.length > 1 && (
        <div className="bio-glass-tabs flex gap-1 overflow-x-auto nice-scroll">
          {working.map((d) => (
            <button key={d.id} type="button" onClick={() => setActiveId(d.id)}
              className={`px-3 py-2 rounded-md text-sm whitespace-nowrap transition ${
                active?.id === d.id ? `${t.surface} shadow-sm font-medium` : t.muted
              }`}>
              {d.name}
            </button>
          ))}
        </div>
      )}

      {settingsMode && active && (
        <SettingsPanel
          t={t}
          dashboard={active}
          stages={data.stages}
          fields={data.fields ?? []}
          onPatch={patchActive}
          onAddDashboard={addDashboard}
          onRemoveDashboard={() => removeDashboard(active.id)}
          canRemove={working.length > 1}
          editWidget={editWidget}
          setEditWidget={setEditWidget}
          editGoal={editGoal}
          setEditGoal={setEditGoal}
        />
      )}

      {err && <p className="text-sm text-rose-500">{err}</p>}

      {active ? (
        <DashboardView t={t} data={analyticsData} dashboard={active} widgets={sortedWidgets} StageBadge={StageBadge}
          aiDashboards={aiDashboards} canManageAi={canManage} />
      ) : !err ? (
        <p className={`text-sm ${t.muted}`}>{tr("noDashboards", undefined, "analytics")} {canManage && tr("clickConfigure", undefined, "analytics")}</p>
      ) : null}
    </div>
  );
}

function DashboardView({ t, data, dashboard, widgets, StageBadge, aiDashboards = [], canManageAi }: {
  t: Record<string, string>;
  data: CrmSlice;
  dashboard: AnalyticsDashboard;
  widgets: AnalyticsWidget[];
  StageBadge: React.FC<{ stage: Stage }>;
  aiDashboards?: (AiboardDashboardQueryResult & { id: string })[];
  canManageAi?: boolean;
}) {
  const total = data.leads.length;
  const kpis = widgets.filter((w) => w.type === "kpi");
  const goals = widgets.filter((w) => w.type === "goal");
  const funnel = widgets.find((w) => w.type === "funnel");
  const recent = widgets.find((w) => w.type === "recent");

  const recentLeads = [...data.leads]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, recent?.type === "recent" ? (recent.limit ?? 5) : 5);

  const funnelList = funnel?.type === "funnel"
    ? funnelStages(funnel.stageIds, data.stages)
    : [];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full overflow-x-hidden">
      {aiDashboards.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-500" />
            <h3 className={`text-sm font-semibold ${t.text}`}>AI-дашборды из Реактора</h3>
            {canManageAi && (
              <span className={`text-xs ${t.muted}`}>Удаление — в Реакторе, фильтр «AI-дашборды»</span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {aiDashboards.map((d) => (
              <div key={d.id}>
                <NlDashboard
                  t={t as never}
                  title={d.manifest.title}
                  chartType={d.manifest.chartType}
                  rows={d.result.rows}
                  kpi={d.result.kpi}
                  measure={d.manifest.measure}
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {kpis.length > 0 && (
        <div className={`grid gap-4 grid-cols-2 ${kpis.length >= 4 ? "lg:grid-cols-4" : kpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {kpis.map((w) => {
            if (w.type !== "kpi") return null;
            const Icon = kpiIcon(w.metric);
            const value = computeMetric(w.metric, data, w.stageId, w.type === "kpi" && "fieldId" in w ? (w as { fieldId?: string }).fieldId : undefined);
            return (
              <div key={w.id} className={`bio-card bio-glass-panel p-4 ${t.surface} ${t.border}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${t.muted}`}>{w.label}</span>
                  <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold">{formatMetricValue(w.metric, value)}</div>
              </div>
            );
          })}
        </div>
      )}

      {goals.map((gw) => {
        if (gw.type !== "goal") return null;
        const goal = dashboard.goals.find((g) => g.id === gw.goalId);
        if (!goal) return null;
        const { current, target, pct, met, operator } = evaluateGoal(goal, data);
        const opShort = operator === "gte" ? "≥" : operator === "gt" ? ">" : operator === "lte" ? "≤" : operator === "lt" ? "<" : operator === "eq" ? "=" : "≠";
        return (
          <div key={gw.id} className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border} ${met ? "ring-2 ring-teal-400/40" : ""}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold flex items-center gap-2">
                <Target className={`w-4 h-4 ${met ? "text-teal-600" : "text-slate-400"}`} />
                {goal.title}
                {met && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
              </h3>
              <span className={`text-sm ${t.muted}`}>
                {formatMetricValue(goal.metric, current)} {opShort} {formatMetricValue(goal.metric, target)}
              </span>
            </div>
            <p className={`text-xs ${t.muted} mt-1`}>{KPI_METRIC_LABELS[goal.metric]} · {OPERATOR_LABELS[operator]}</p>
            <div className={`mt-3 h-3 rounded-full overflow-hidden ${t.chip}`}>
              <div className={`h-full transition-all ${met ? "bg-teal-500" : "bg-gradient-to-r from-teal-500 to-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      <div className="grid lg:grid-cols-2 gap-6">
        {funnel && funnelList.length > 0 && (
          <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
            <h3 className="font-semibold mb-3">Воронка по этапам</h3>
            <div className="space-y-2">
              {funnelList.map((s) => {
                const n = data.leads.filter((l) => leadStageId(l) === s.id).length;
                const pct = total ? (n / total) * 100 : 0;
                return (
                  <div key={s.id} className="flex items-center gap-2 min-w-0">
                    <div className={`w-[5.5rem] sm:w-36 text-sm ${t.subtle} flex items-center gap-1.5 min-w-0 shrink-0`}>
                      <span className={`w-2 h-2 rounded-full bg-${s.color}-500 shrink-0`} />
                      <span className="truncate">{s.label}</span>
                    </div>
                    <div className={`flex-1 min-w-0 h-2 rounded-full overflow-hidden ${t.chip}`}>
                      <div className={`h-full bg-${s.color}-500`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-6 text-right text-sm font-medium">{n}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recent && (
          <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
            <h3 className="font-semibold mb-3">Последние обновления</h3>
            <div className={`divide-y ${t.divide}`}>
              {recentLeads.map((l) => {
                const st = data.stages.find((s) => s.id === leadStageId(l));
                return (
                  <div key={l.id} className="py-2.5 flex items-center justify-between text-sm gap-2">
                    <span className="font-medium truncate">
                      {l.name}<span className={`${t.muted} font-normal`}> · {l.region || "—"}</span>
                    </span>
                    {st && <StageBadge stage={st} />}
                  </div>
                );
              })}
              {!recentLeads.length && <p className={`text-sm ${t.muted} py-2`}>Активности нет.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ t, dashboard, stages, fields, onPatch, onAddDashboard, onRemoveDashboard, canRemove,
  editWidget, setEditWidget, editGoal, setEditGoal }: {
  t: Record<string, string>;
  dashboard: AnalyticsDashboard;
  stages: Stage[];
  fields: Field[];
  onPatch: (p: Partial<AnalyticsDashboard>) => void;
  onAddDashboard: () => void;
  onRemoveDashboard: () => void;
  canRemove: boolean;
  editWidget: AnalyticsWidget | null;
  setEditWidget: (w: AnalyticsWidget | null) => void;
  editGoal: AnalyticsGoal | null;
  setEditGoal: (g: AnalyticsGoal | null) => void;
}) {
  const widgets = [...dashboard.widgets].sort((a, b) => a.sortOrder - b.sortOrder);
  const goals = [...dashboard.goals].sort((a, b) => a.sortOrder - b.sortOrder);

  function saveWidget(w: AnalyticsWidget) {
    const exists = dashboard.widgets.some((x) => x.id === w.id);
    const next = exists
      ? dashboard.widgets.map((x) => (x.id === w.id ? w : x))
      : [...dashboard.widgets, w];
    onPatch({ widgets: next });
    setEditWidget(null);
  }

  function removeWidget(id: string) {
    onPatch({ widgets: dashboard.widgets.filter((w) => w.id !== id) });
    setEditWidget(null);
  }

  function saveGoal(g: AnalyticsGoal) {
    const exists = dashboard.goals.some((x) => x.id === g.id);
    const nextGoals = exists
      ? dashboard.goals.map((x) => (x.id === g.id ? g : x))
      : [...dashboard.goals, g];
    let nextWidgets = dashboard.widgets;
    if (!exists && !dashboard.widgets.some((w) => w.type === "goal" && w.goalId === g.id)) {
      nextWidgets = [...dashboard.widgets, {
        id: uid(), type: "goal" as const, goalId: g.id, enabled: true, sortOrder: dashboard.widgets.length,
      }];
    }
    onPatch({ goals: nextGoals, widgets: nextWidgets });
    setEditGoal(null);
  }

  function removeGoal(id: string) {
    onPatch({
      goals: dashboard.goals.filter((g) => g.id !== id),
      widgets: dashboard.widgets.filter((w) => !(w.type === "goal" && w.goalId === id)),
    });
    setEditGoal(null);
  }

  function addWidget(type: AnalyticsWidget["type"]) {
    const sortOrder = dashboard.widgets.length;
    if (type === "kpi") {
      setEditWidget({
        id: uid(), type: "kpi", label: "Новый показатель", metric: "leads_total", enabled: true, sortOrder,
      });
    } else if (type === "goal") {
      setEditGoal({
        id: uid(), title: "Новая цель", metric: "leads_total", target: 10, sortOrder: dashboard.goals.length,
      });
    } else if (type === "funnel") {
      saveWidget({
        id: uid(), type: "funnel", stageIds: stages.map((s) => s.id), enabled: true, sortOrder,
      });
    } else {
      saveWidget({ id: uid(), type: "recent", limit: 5, enabled: true, sortOrder });
    }
  }

  return (
    <div className={`bio-card bio-glass-panel p-4 space-y-5 ${t.surface} ${t.border}`}>
      <p className="text-sm text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
        <SlidersHorizontal className="w-4 h-4" /> Режим настройки дашборда
      </p>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className={`text-xs font-medium ${t.muted}`}>Название дашборда</label>
          <input
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${t.border} ${t.surface}`}
            value={dashboard.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </div>
        <button type="button" onClick={onAddDashboard} className={`px-3 py-2 rounded-lg text-sm border ${t.border} ${t.muted}`}>
          <Plus className="w-4 h-4 inline" /> Дашборд
        </button>
        {canRemove && (
          <button type="button" onClick={onRemoveDashboard} className="px-3 py-2 rounded-lg text-sm text-rose-500 border border-rose-200">
            Удалить дашборд
          </button>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Виджеты</h4>
          <div className="flex flex-wrap gap-1">
            {(["kpi", "goal", "funnel", "recent"] as const).map((type) => (
              <button key={type} type="button" onClick={() => addWidget(type)}
                className={`text-xs px-2 py-1 rounded-md border ${t.border} ${t.muted}`}>
                + {type === "kpi" ? "KPI" : type === "goal" ? "Цель" : type === "funnel" ? "Воронка" : "Лента"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {widgets.map((w) => (
            <div key={w.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${t.border}`}>
              <input type="checkbox" checked={w.enabled} onChange={(e) => {
                saveWidget({ ...w, enabled: e.target.checked });
              }} />
              <span className="flex-1 truncate">
                {w.type === "kpi" && `KPI: ${w.label}`}
                {w.type === "goal" && `Цель: ${dashboard.goals.find((g) => g.id === w.goalId)?.title || "—"}`}
                {w.type === "funnel" && `Воронка (${w.stageIds?.length ?? "все"} этапов)`}
                {w.type === "recent" && `Лента (${w.limit ?? 5})`}
              </span>
              <button type="button" onClick={() => setEditWidget(w)} className={t.muted}><Pencil className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => removeWidget(w.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {!widgets.length && <p className={`text-sm ${t.muted}`}>Нет виджетов</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Цели</h4>
          <button type="button" onClick={() => addWidget("goal")} className={`text-xs px-2 py-1 rounded-md border ${t.border} ${t.muted}`}>
            + Цель
          </button>
        </div>
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${t.border}`}>
              <Target className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="flex-1 truncate">{g.title} — {g.target} ({KPI_METRIC_LABELS[g.metric]})</span>
              <button type="button" onClick={() => setEditGoal(g)} className={t.muted}><Pencil className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => removeGoal(g.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {!goals.length && <p className={`text-sm ${t.muted}`}>Нет целей — добавьте виджет «Цель»</p>}
        </div>
      </section>

      {editWidget && (
        <WidgetModal t={t} widget={editWidget} stages={stages} goals={dashboard.goals}
          onClose={() => setEditWidget(null)} onSave={saveWidget} />
      )}
      {editGoal && (
        <GoalModal t={t} goal={editGoal} stages={stages} fields={fields} onClose={() => setEditGoal(null)} onSave={saveGoal} />
      )}
    </div>
  );
}

function WidgetModal({ t, widget, stages, goals, onClose, onSave }: {
  t: Record<string, string>;
  widget: AnalyticsWidget;
  stages: Stage[];
  goals: AnalyticsGoal[];
  onClose: () => void;
  onSave: (w: AnalyticsWidget) => void;
}) {
  const [w, setW] = useState(widget);

  return (
    <Modal t={t} title="Виджет" onClose={onClose}>
      {w.type === "kpi" && (
        <div className="space-y-3">
          <Field label="Подпись" t={t}>
            <input className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={w.label}
              onChange={(e) => setW({ ...w, label: e.target.value })} />
          </Field>
          <Field label="Метрика" t={t}>
            <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={w.metric}
              onChange={(e) => setW({ ...w, metric: e.target.value as typeof w.metric })}>
              {(Object.keys(KPI_METRIC_LABELS) as Array<keyof typeof KPI_METRIC_LABELS>).map((k) => (
                <option key={k} value={k}>{KPI_METRIC_LABELS[k]}</option>
              ))}
            </select>
          </Field>
          {w.metric === "stage_count" && (
            <Field label="Этап воронки" t={t}>
              <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={w.stageId || ""}
                onChange={(e) => setW({ ...w, stageId: e.target.value || null })}>
                <option value="">Первый этап</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
          {(w.metric === "deals_signed" || w.metric === "money_sum") && (
            <Field label="Этап сделки" t={t}>
              <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={w.stageId || ""}
                onChange={(e) => setW({ ...w, stageId: e.target.value || null })}>
                <option value="">Этап «Сделка»</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
      {w.type === "goal" && (
        <Field label="Цель" t={t}>
          <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={w.goalId}
            onChange={(e) => setW({ ...w, goalId: e.target.value })}>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
      )}
      {w.type === "funnel" && (
        <div>
          <p className={`text-xs ${t.muted} mb-2`}>Этапы в воронке (порядок как в CRM)</p>
          <div className="space-y-1 max-h-48 overflow-y-auto nice-scroll">
            {stages.map((s) => {
              const ids = w.stageIds ?? stages.map((x) => x.id);
              const checked = ids.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm py-1">
                  <input type="checkbox" checked={checked} onChange={() => {
                    const next = checked ? ids.filter((id) => id !== s.id) : [...ids, s.id];
                    setW({ ...w, stageIds: next.length ? next : stages.map((x) => x.id) });
                  }} />
                  {s.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {w.type === "recent" && (
        <Field label="Количество записей" t={t}>
          <input type="number" min={1} max={20} className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`}
            value={w.limit ?? 5} onChange={(e) => setW({ ...w, limit: Number(e.target.value) })} />
        </Field>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className={`px-3 py-2 text-sm ${t.muted}`}>Отмена</button>
        <button type="button" onClick={() => onSave(w)} className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg">OK</button>
      </div>
    </Modal>
  );
}

function GoalModal({ t, goal, stages, fields, onClose, onSave }: {
  t: Record<string, string>;
  goal: AnalyticsGoal;
  stages: Stage[];
  fields: Field[];
  onClose: () => void;
  onSave: (g: AnalyticsGoal) => void;
}) {
  const [g, setG] = useState(goal);
  const moneyFields = fields.filter((f) => f.type === "money");
  return (
    <Modal t={t} title="Цель" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Название" t={t}>
          <input className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={g.title}
            onChange={(e) => setG({ ...g, title: e.target.value })} />
        </Field>
        <Field label="Метрика" t={t}>
          <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={g.metric}
            onChange={(e) => setG({ ...g, metric: e.target.value as typeof g.metric })}>
            {(Object.keys(KPI_METRIC_LABELS) as Array<keyof typeof KPI_METRIC_LABELS>).map((k) => (
              <option key={k} value={k}>{KPI_METRIC_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Условие" t={t}>
          <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={g.operator || "gte"}
            onChange={(e) => setG({ ...g, operator: e.target.value as typeof g.operator })}>
            {(Object.keys(OPERATOR_LABELS) as Array<keyof typeof OPERATOR_LABELS>).map((k) => (
              <option key={k} value={k}>{OPERATOR_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        {metricNeedsStage(g.metric) && (
          <Field label={g.metric === "money_sum" || g.metric === "deals_signed" ? "Этап сделки" : "Этап"} t={t}>
            <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={g.stageId || ""}
              onChange={(e) => setG({ ...g, stageId: e.target.value || null })}>
              <option value="">{g.metric === "stage_count" ? "Первый этап" : "Этап «Сделка»"}</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
        )}
        {metricNeedsField(g.metric) && (
          <Field label="Поле с суммой" t={t}>
            <select className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`} value={g.fieldId || ""}
              onChange={(e) => setG({ ...g, fieldId: e.target.value || null })}>
              <option value="">Бюджет / деньги</option>
              {moneyFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Целевое значение" t={t}>
          <input type="number" min={0} step={g.metric === "money_sum" ? "1000" : "1"}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border}`}
            value={g.target} onChange={(e) => setG({ ...g, target: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className={`px-3 py-2 text-sm ${t.muted}`}>Отмена</button>
        <button type="button" onClick={() => onSave(g)} className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg">OK</button>
      </div>
    </Modal>
  );
}

function Modal({ t, title, children, onClose }: { t: Record<string, string>; title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 ${t.surface} ${t.border}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className={t.muted}><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, t, children }: { label: string; t: Record<string, string>; children: React.ReactNode }) {
  return (
    <div>
      <label className={`text-xs font-medium ${t.muted}`}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
