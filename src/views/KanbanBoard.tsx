import { useState, useEffect, useMemo } from "react";
import { GripVertical, Plus, Pencil, SlidersHorizontal, Cpu, X, Trash2, Check } from "lucide-react";
import { stagesForPipeline, leadsForPipeline } from "../lib/crm-pipelines";
import { canEditLead } from "../api/client";
import { STAGE_COLORS, harmonyHint, recommendStageColor, stageHex, stagePillStyle, entityCardAccentVars } from "../lib/stage-colors";
import { useTheme } from "../context/ThemeProvider";
import { EmployeeAvatar } from "../components/EmployeeChip";
import { leadResponsibleMember } from "../lib/team-members";
import { isMaskPickBlocking } from "../lib/mask-edit-bridge";

const uid = () => Math.random().toString(36).slice(2, 10);

function TInput({ value, onChange, placeholder = "", t, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; t: Record<string, string>; className?: string;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full rounded-lg border px-3 py-2 text-sm ${t.input} ${className}`} />
  );
}

function Labeled({ label, children, t }: { label: string; children: import("react").ReactNode; t: Record<string, string> }) {
  return (
    <div>
      <label className={`text-xs font-medium ${t.muted}`}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", t, className = "" }: {
  children: import("react").ReactNode; onClick: () => void; variant?: "primary" | "danger"; t: Record<string, string>; className?: string;
}) {
  const base = variant === "danger"
    ? "bg-rose-600 hover:bg-rose-500 text-white"
    : "bg-teal-600 hover:bg-teal-500 text-white";
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${base} ${className}`}>
      {children}
    </button>
  );
}

function StageModal({ t, stage, data, pipelineId, onClose, onSave, onDelete, canDelete, onOpenReactor }: {
  t: Record<string, string>;
  stage: { id?: string; label: string; color: string; pipelineId?: string; automations?: unknown[] };
  data: { stages: import("../api/client").Stage[] };
  pipelineId: string;
  onClose: () => void;
  onSave: (s: typeof stage) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  onOpenReactor?: (stageId: string, pipelineId: string) => void;
}) {
  const [s, setS] = useState({ ...stage, automations: [] });
  const localStages = stagesForPipeline(data.stages, pipelineId || stage.pipelineId);
  const stageIndex = stage.id ? localStages.findIndex((x) => x.id === stage.id) : localStages.length;
  const totalStages = localStages.length + (stage.id ? 0 : 1);
  const recommended = recommendStageColor(stageIndex, totalStages);
  const hint = harmonyHint(stageIndex, totalStages);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-lg rounded-2xl border shadow-2xl ${t.surface} ${t.border} max-h-[88vh] overflow-y-auto nice-scroll`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.border} sticky top-0 ${t.surface}`}>
          <h3 className="font-semibold">{stage.id ? "Настройка этапа" : "Новый этап"}</h3>
          <button type="button" onClick={onClose} className={t.muted}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <Labeled label="Название этапа" t={t}><TInput t={t} value={s.label} onChange={(v) => setS({ ...s, label: v })} placeholder="Например, Назначен показ" /></Labeled>
          <div>
            <label className={`text-xs font-medium ${t.muted}`}>Цвет</label>
            <p className={`text-[11px] ${t.muted} mt-1`}>
              Рекомендация:{" "}
              <button type="button" onClick={() => setS({ ...s, color: recommended })}
                className="text-teal-600 dark:text-teal-400 underline underline-offset-2">
                {recommended}
              </button>
              {" "}— {hint.toLowerCase()}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {STAGE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setS({ ...s, color: c })}
                  title={c === recommended ? "Рекомендуемый" : c}
                  className={`w-7 h-7 rounded-full transition relative ${s.color === c ? "ring-2 ring-offset-2 ring-teal-500 dark:ring-offset-slate-800" : ""}`}
                  style={{ backgroundColor: stageHex(c) }}>
                  {c === recommended && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white border border-teal-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className={`rounded-lg border p-4 ${t.border} ${t.soft}`}>
            <p className={`text-sm font-medium ${t.text}`}>Реактор</p>
            <p className={`text-xs ${t.muted} mt-1`}>Роботы этапа заменены графом процесса. Привяжите Реактор к этому этапу — он запустится при входе сделки.</p>
            {stage.id && onOpenReactor && (
              <button type="button" onClick={() => { onOpenReactor(stage.id!, pipelineId || stage.pipelineId!); onClose(); }}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition">
                <Cpu className="w-4 h-4" /> Открыть Реактор
              </button>
            )}
          </div>
        </div>
        <div className={`flex items-center justify-between px-5 py-3 border-t ${t.border} sticky bottom-0 ${t.surface}`}>
          {stage.id && canDelete ? <Btn t={t} variant="danger" onClick={() => onDelete(stage.id!)}><Trash2 className="w-4 h-4" /> Удалить</Btn> : <span />}
          <Btn t={t} onClick={() => s.label.trim() && onSave(s)}><Check className="w-4 h-4" /> Сохранить</Btn>
        </div>
      </div>
    </div>
  );
}

export function KanbanBoard({ t, user, data, pipelineId, moveLead, updateData, onOpen, settingsMode, isMobile, onOpenReactor }: {
  t: Record<string, string>;
  user: { id?: string } | null;
  data: { stages: Parameters<typeof stagesForPipeline>[0]; leads: import("../api/client").Lead[]; dealManagers: { userId?: string; id: string }[]; employees?: Parameters<typeof leadResponsibleMember>[1] };
  pipelineId: string;
  moveLead: (leadId: string, stageId: string) => Promise<void>;
  updateData: (patch: Partial<{ stages: typeof data.stages; leads: typeof data.leads }>) => void;
  onOpen: (id: string) => void;
  settingsMode: boolean;
  isMobile: boolean;
  onOpenReactor?: (stageId: string, pipelineId: string) => void;
}) {
  const { theme } = useTheme();
  const [dragLead, setDragLead] = useState<string | null>(null);
  const [dragStage, setDragStage] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string; label: string; color: string; pipelineId?: string; automations: unknown[] } | null>(null);
  const pipelineStages = stagesForPipeline(data.stages, pipelineId);
  const [mobileStageId, setMobileStageId] = useState(pipelineStages[0]?.id ?? null);
  const userDealManagerId = data.dealManagers.find((r) => r.userId === user?.id)?.id ?? null;
  const stageIds = useMemo(() => new Set(pipelineStages.map((s) => s.id)), [pipelineStages]);
  const pipelineLeads = leadsForPipeline(data.leads, pipelineId, stageIds);
  const leadsOf = (sid: string) => pipelineLeads.filter((l) => l.statusId === sid);
  const canMoveLead = (lead: (typeof pipelineLeads)[0]) => canEditLead(user as Parameters<typeof canEditLead>[0], lead, userDealManagerId);

  useEffect(() => {
    if (!pipelineStages.some((s) => s.id === mobileStageId)) {
      setMobileStageId(pipelineStages[0]?.id ?? null);
    }
  }, [pipelineStages, mobileStageId]);

  function saveStage(s: NonNullable<typeof edit>) {
    const stage = { ...s, pipelineId: s.pipelineId || pipelineId };
    if (stage.id) updateData({ stages: data.stages.map((x) => x.id === stage.id ? stage as import("../api/client").Stage : x) });
    else updateData({ stages: [...data.stages, { ...stage, id: uid() } as import("../api/client").Stage] });
    setEdit(null);
  }
  function deleteStage(id: string) {
    if (pipelineStages.length <= 1) return;
    const rest = pipelineStages.filter((s) => s.id !== id);
    const otherStages = data.stages.filter((s) => s.pipelineId !== pipelineId);
    updateData({
      stages: [...otherStages, ...rest],
      leads: data.leads.map((l) => l.statusId === id ? { ...l, statusId: rest[0]!.id } : l),
    });
    setEdit(null);
  }
  function reorder(dragId: string, targetId: string) {
    const arr = [...pipelineStages];
    const from = arr.findIndex((s) => s.id === dragId), to = arr.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    const otherStages = data.stages.filter((s) => s.pipelineId !== pipelineId);
    updateData({ stages: [...otherStages, ...arr] });
  }
  function drop(targetId: string) {
    if (dragStage && dragStage !== targetId) reorder(dragStage, targetId);
    else if (dragLead) {
      const lead = data.leads.find((l) => l.id === dragLead);
      if (lead && canMoveLead(lead)) {
        void moveLead(dragLead, targetId);
      }
    }
    setDragLead(null); setDragStage(null); setOver(null);
  }

  function renderColumn(s: { id: string; label: string; color: string }, mobile = false) {
    const colW = mobile ? "w-full" : "w-72 shrink-0";
    const textStyle = { color: theme.colorMode === "dark" ? "#f1f5f9" : "#1e293b" };
    const mutedStyle = { color: theme.colorMode === "dark" ? "#94a3b8" : "#64748b" };
    return (
      <div key={s.id}
        onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
        onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
        onDrop={() => drop(s.id)}
        data-mask-id={`kanban.col.${s.id}`}
        data-mask-component="kanban.column"
        className={`${colW} rounded-2xl bio-status-panel ${over === s.id ? "ring-2 ring-teal-400/35" : "ring-0"} transition-[box-shadow,ring-color] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)]`}
        style={entityCardAccentVars(s.color, false, theme.colorMode)}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2 font-medium text-sm" style={textStyle}>
            {settingsMode && (
              <span draggable onDragStart={() => { setDragStage(s.id); setDragLead(null); }} className="cursor-grab" style={mutedStyle}><GripVertical className="w-4 h-4" /></span>
            )}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageHex(s.color) }} />
            <span style={textStyle}>{s.label}</span>
            <span className="text-xs" style={mutedStyle}>{leadsOf(s.id).length}</span>
          </div>
          {settingsMode && (
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => onOpenReactor?.(s.id, pipelineId)} title="Реактор этапа"
                className={`${t.muted} hover:text-teal-500 p-0.5`}>
                <Cpu className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setEdit({ id: s.id, label: s.label, color: s.color, pipelineId, automations: [] })} className={`${t.muted} hover:text-teal-500 p-0.5`}><Pencil className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        <div className="px-2 pb-2 space-y-2 min-h-12">
          {leadsOf(s.id).map((l) => {
            const responsible = leadResponsibleMember(l, data.employees || [], data.dealManagers as never);
            const editable = canMoveLead(l);
            return (
              <div key={l.id} draggable={!isMobile && editable && !isMaskPickBlocking()} onDragStart={(e) => { if (!editable || isMaskPickBlocking()) return; e.stopPropagation(); setDragLead(l.id); setDragStage(null); }} onDragEnd={() => setDragLead(null)}
                onClick={(e) => { if (isMaskPickBlocking()) { e.preventDefault(); e.stopPropagation(); return; } if (e.ctrlKey || e.metaKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent("crm:peek-lead", { detail: { id: l.id } })); } else { onOpen(l.id); } }}
                data-mask-id={`kanban.card.${l.id}`}
                data-mask-component="kanban.card"
                className={`bio-entity-card p-3 h-[5.75rem] flex flex-col cursor-pointer group ${dragLead === l.id ? "bio-entity-card--dragging" : ""}`}
                style={entityCardAccentVars(s.color, false, theme.colorMode)}>
                <div className="flex items-start gap-2 min-h-0 flex-1">
                  {!isMobile && <GripVertical className={`w-4 h-4 ${t.muted} mt-0.5 shrink-0 opacity-0 group-hover:opacity-100`} />}
                  <div className="min-w-0 flex-1 flex flex-col h-full crm-data">
                    <div className="font-medium text-sm truncate leading-snug" style={textStyle}>{l.name || "Без имени"}</div>
                    <div className="text-xs truncate mt-0.5 leading-4" style={mutedStyle}>{l.phone || "—"}</div>
                    <div className="mt-auto flex items-center gap-1 min-h-[1.375rem] pt-1.5 overflow-hidden">
                      {l.region ? (
                        <span className="bio-glass-chip text-xs px-1.5 py-0.5 rounded truncate max-w-[48%] shrink-0">{l.region}</span>
                      ) : (
                        <span className="flex-1 min-w-0" />
                      )}
                      {responsible && (
                        <span className="bio-entity-chip inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 ml-auto shrink-0 max-w-[52%]">
                          <EmployeeAvatar member={responsible} size="xs" />
                          <span className="truncate">{responsible.name.split(" ")[0]}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {settingsMode && <p className="text-xs md:text-sm text-teal-600 dark:text-teal-400 mb-3 flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Режим настройки этапов и Реактор — иконка процессора на колонке или в карточке этапа</p>}

      {isMobile && !settingsMode ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto nice-scroll pb-2 -mx-0.5 px-0.5">
            {pipelineStages.map((s) => (
              <button key={s.id} type="button" onClick={() => setMobileStageId(s.id)}
                className="bio-stage-pipeline shrink-0 px-3 py-2 rounded-full text-xs font-medium border"
                style={stagePillStyle(s.color, mobileStageId === s.id, theme.colorMode)}>
                {s.label}
                <span className="ml-1 opacity-80">{leadsOf(s.id).length}</span>
              </button>
            ))}
          </div>
          {pipelineStages.filter((s) => s.id === mobileStageId).map((s) => renderColumn(s, true))}
        </>
      ) : (
        <div className={`flex gap-3 md:gap-4 overflow-x-auto nice-scroll pb-3 ${isMobile ? "snap-x snap-mandatory" : ""}`}>
          {pipelineStages.map((s) => (
            <div key={s.id} className={isMobile ? "snap-center shrink-0 w-[min(85vw,24rem)]" : ""}>
              {renderColumn(s, false)}
            </div>
          ))}
          {settingsMode && (
            <button type="button" onClick={() => setEdit({ pipelineId, label: "", color: recommendStageColor(pipelineStages.length, pipelineStages.length + 1), automations: [] })}
              className={`${isMobile ? "w-[min(85vw,24rem)] shrink-0 snap-center" : "w-72 shrink-0"} rounded-xl border-2 border-dashed ${t.border} ${t.muted} hover:text-teal-500 hover:border-teal-400 flex items-center justify-center gap-2 text-sm py-6 transition`}>
              <Plus className="w-4 h-4" /> Добавить этап
            </button>
          )}
        </div>
      )}
      {edit && <StageModal t={t} stage={edit} data={data} pipelineId={pipelineId} onClose={() => setEdit(null)} onSave={saveStage} onDelete={deleteStage} canDelete={pipelineStages.length > 1} onOpenReactor={onOpenReactor} />}
    </div>
  );
}
