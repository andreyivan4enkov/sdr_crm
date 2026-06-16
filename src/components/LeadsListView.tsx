import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Search, Settings2, X } from "lucide-react";
import type { CrmData } from "../hooks/useCrmData";
import { useLeadsListPrefs } from "../hooks/useLeadsListPrefs";
import {
  formatLeadCell,
  leadCellText,
  sortLeadsByColumn,
  type LeadColumnId,
} from "../lib/leads-list-columns";
import { stageHex, statusContourStyle } from "../lib/stage-colors";
import { leadResponsibleMember } from "../lib/team-members";
import { stagesForPipeline, leadsForPipeline } from "../lib/crm-pipelines";

type Props = {
  t: Record<string, string>;
  data: CrmData;
  pipelineId?: string | null;
  onOpen: (id: string) => void;
};

export function LeadsListView({ t, data, pipelineId, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  const {
    allColumns,
    visibleColumns,
    visibleIds,
    sortCol,
    sortDir,
    toggleColumn,
    resetColumns,
    toggleSort,
  } = useLeadsListPrefs(data.fields);

  useEffect(() => {
    if (!colsOpen) return;
    function onDoc(e: MouseEvent) {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colsOpen]);

  const pipelineStages = useMemo(() => stagesForPipeline(data.stages, pipelineId ?? null), [data.stages, pipelineId]);
  const stageIds = useMemo(() => new Set(pipelineStages.map((s) => s.id)), [pipelineStages]);
  const pipelineLeads = useMemo(
    () => leadsForPipeline(data.leads, pipelineId ?? null, stageIds),
    [data.leads, pipelineId, stageIds],
  );

  const ctx = useMemo(() => ({
    stages: pipelineStages,
    channels: data.channels,
    employees: data.employees || [],
    realtors: data.realtors,
    fields: data.fields,
  }), [pipelineStages, data.channels, data.employees, data.realtors, data.fields]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = pipelineLeads.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (!query) return true;
      const hay = [
        l.name, l.phone, l.region, l.email, l.comment,
        ...visibleColumns.map((c) => leadCellText(l, c.id, ctx)),
      ].join(" ").toLowerCase();
      return hay.includes(query);
    });
    return sortLeadsByColumn(list, sortCol, sortDir, ctx);
  }, [pipelineLeads, filter, q, sortCol, sortDir, ctx, visibleColumns]);

  const stageOf = (id?: string | null) => pipelineStages.find((s) => s.id === id);

  const gridCols = useMemo(
    () => visibleColumns.map((c) => `minmax(${c.minWidth || "6rem"}, 1fr)`).join(" "),
    [visibleColumns],
  );

  return (
    <div className="flex flex-col min-h-0 gap-3">
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
          <div className="relative flex-1 min-w-0 sm:max-w-md">
            <Search className={`w-4 h-4 ${t.muted} absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск сделок…"
              className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-500 ${t.input}`}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`min-w-[9.5rem] rounded-lg border px-3 py-2 text-sm outline-none focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20 ${t.input}`}
            >
              <option value="all">Все этапы</option>
              {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <div className="relative" ref={colsRef}>
            <button
              type="button"
              onClick={() => setColsOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition ${t.border} ${t.hover} ${colsOpen ? "border-teal-500/60" : ""}`}
              title="Настройка полей списка"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Поля</span>
              <ChevronDown className={`w-3.5 h-3.5 transition ${colsOpen ? "rotate-180" : ""}`} />
            </button>
            {colsOpen && (
              <div className={`absolute right-0 top-full mt-1.5 z-30 w-64 rounded-2xl border shadow-xl p-3 ${t.surface} ${t.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${t.muted}`}>Колонки списка</span>
                  <button type="button" onClick={() => setColsOpen(false)} className={t.muted}><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="max-h-64 overflow-y-auto nice-scroll space-y-0.5">
                  {allColumns.map((col) => {
                    const checked = visibleIds.includes(col.id);
                    const locked = col.id === "name";
                    return (
                      <label
                        key={col.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer ${locked ? "opacity-60" : t.hover}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleColumn(col.id)}
                          className="accent-teal-600"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={resetColumns}
                  className={`mt-2 w-full text-xs py-1.5 rounded-lg ${t.muted} ${t.hover}`}
                >
                  Сбросить по умолчанию
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-2xl bio-card overflow-hidden flex flex-col min-h-0 ${t.surface}`}>
        <div className={`px-3 py-2 border-b text-xs ${t.border} ${t.muted} flex items-center justify-between shrink-0`}>
          <span>{rows.length} {rows.length === 1 ? "сделка" : rows.length < 5 ? "сделки" : "сделок"}</span>
          <span className="hidden sm:inline">Нажмите на заголовок колонки для сортировки</span>
        </div>
        <div className="overflow-x-auto nice-scroll flex-1 min-h-0 p-2 sm:p-3">
          <div className="min-w-[640px]">
            <div
              className={`grid gap-x-3 px-4 py-2.5 rounded-xl mb-2 text-sm font-medium ${t.chip}`}
              style={{ gridTemplateColumns: gridCols }}
            >
              {visibleColumns.map((col) => (
                <div key={col.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => col.sortable && toggleSort(col.id)}
                    className={`inline-flex items-center gap-1 max-w-full crm-chrome ${col.sortable ? `${t.text} hover:text-teal-600` : t.muted}`}
                    disabled={!col.sortable}
                  >
                    <span className="truncate">{col.label}</span>
                    {col.sortable && <SortIcon active={sortCol === col.id} dir={sortDir} muted={t.muted} />}
                  </button>
                </div>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className={`px-4 py-10 text-center text-sm ${t.muted}`}>Ничего не найдено</p>
            ) : (
              <div className="space-y-2">
                {rows.map((lead) => {
                  const stage = stageOf(lead.status);
                  const responsible = leadResponsibleMember(lead, data.employees || [], data.realtors);
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => onOpen(lead.id)}
                      className={`w-full grid gap-x-3 items-center rounded-2xl border text-left px-4 py-3 transition-all duration-200 ${t.surface} hover:shadow-md active:scale-[0.998]`}
                      style={{ gridTemplateColumns: gridCols, ...(stage ? statusContourStyle(stage.color) : {}) }}
                    >
                      {visibleColumns.map((col) => (
                        <div key={col.id} className="min-w-0 max-w-[16rem] crm-data">
                          <Cell
                            t={t}
                            lead={lead}
                            col={col.id}
                            ctx={ctx}
                            stage={stage}
                            responsible={responsible}
                          />
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ active, dir, muted }: { active: boolean; dir: "asc" | "desc"; muted: string }) {
  if (!active) return <span className={`w-3.5 h-3.5 opacity-30 ${muted}`}>↕</span>;
  return dir === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 text-teal-600 shrink-0" />
    : <ArrowDown className="w-3.5 h-3.5 text-teal-600 shrink-0" />;
}

function Cell({
  t, lead, col, ctx, stage, responsible,
}: {
  t: Record<string, string>;
  lead: CrmData["leads"][number];
  col: LeadColumnId;
  ctx: Parameters<typeof formatLeadCell>[2];
  stage?: { id: string; label: string; color: string };
  responsible?: { name: string } | null;
}) {
  if (col === "name") {
    return <span className="font-medium text-teal-700 dark:text-teal-300 truncate block">{lead.name || "—"}</span>;
  }
  if (col === "stage" && stage) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageHex(stage.color) }} />
        {stage.label}
      </span>
    );
  }
  if (col === "responsible" && responsible) {
    return <span className={`truncate block ${t.text}`}>{responsible.name}</span>;
  }
  if (col === "phone") {
    return <span className={`truncate block tabular-nums ${t.muted}`}>{lead.phone || "—"}</span>;
  }
  return (
    <span className={`truncate block ${col === "comment" ? t.muted : t.text}`}>
      {formatLeadCell(lead, col, ctx)}
    </span>
  );
}
