import { useState } from "react";
import { GitBranch, Plus, Star, Trash2 } from "lucide-react";
import { api, type Pipeline, type PipelineType, type Stage } from "../api/client";
import { PIPELINE_TYPES } from "../lib/pipeline-types";

const newId = () => crypto.randomUUID();

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };
type TInputProps = { t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string };
type LabeledProps = { label: string; t: Record<string, string>; children: React.ReactNode };

type Props = {
  t: Record<string, string>;
  pipelines: Pipeline[];
  stages?: Stage[];
  updateData: (patch: { pipelines?: Pipeline[]; stages?: Stage[] }) => void | Promise<void>;
  reload?: () => void;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<TInputProps>;
  Labeled: React.FC<LabeledProps>;
};

export function PipelinesSettings({ t, pipelines, stages = [], updateData, reload, Btn, TInput, Labeled }: Props) {
  const [items, setItems] = useState(() => [...pipelines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function patch(id: string, patch: Partial<Pipeline>) {
    setItems(items.map((x) => x.id === id ? { ...x, ...patch } : x));
  }

  function addPipeline() {
    const sortOrder = items.length;
    setItems([
      ...items,
      { id: newId(), name: `Воронка ${sortOrder + 1}`, sortOrder, isDefault: items.length === 0, pipelineType: "sales" as PipelineType },
    ]);
  }

  function remove(id: string) {
    if (items.length <= 1) return;
    const next = items.filter((p) => p.id !== id);
    if (!next.some((p) => p.isDefault)) next[0] = { ...next[0], isDefault: true };
    setItems(next.map((p, i) => ({ ...p, sortOrder: i })));
  }

  function setDefault(id: string) {
    setItems(items.map((p) => ({ ...p, isDefault: p.id === id })));
  }

  async function save() {
    setErr("");
    const names = items.map((p) => p.name.trim()).filter(Boolean);
    if (names.length !== items.length) {
      setErr("Укажите название каждой воронки");
      return;
    }
    setSaving(true);
    try {
      const payload = items.map((p, i) => ({
        id: p.id,
        name: p.name.trim(),
        sortOrder: i,
        isDefault: !!p.isDefault,
        pipelineType: p.pipelineType || "sales",
        parentPipelineId: p.parentPipelineId ?? null,
        parentStageId: p.parentStageId ?? null,
        description: p.description ?? null,
      }));
      const { pipelines: saved } = await api.updatePipelines(payload);
      await updateData({ pipelines: saved });
      setItems([...saved].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      reload?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`bio-card bio-glass-panel p-5 space-y-4 ${t.surface} ${t.border}`}>
      <div className="flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-teal-600" />
        <h3 className="font-semibold">Воронки</h3>
      </div>
      <p className={`text-sm ${t.muted}`}>
        Типы: продажи, бизнес-процесс или подпроцесс (вложенная воронка на этапе родительской).
        Автоматизации этапов — в разделе «Реактор» (Настройки).
      </p>

      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.id} className={`rounded-lg border p-3 space-y-2 ${t.border}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Labeled label="Название" t={t}>
                <TInput t={t} value={p.name} onChange={(v) => patch(p.id, { name: v })} />
              </Labeled>
              <Labeled label="Тип" t={t}>
                <select value={p.pipelineType || "sales"} onChange={(e) => patch(p.id, { pipelineType: e.target.value as PipelineType })}
                  className={`text-sm rounded-md border px-2 py-1.5 ${t.border} ${t.surface}`}>
                  {PIPELINE_TYPES.map((pt) => <option key={pt.id} value={pt.id}>{pt.label}</option>)}
                </select>
              </Labeled>
              <button type="button" title="Воронка по умолчанию" onClick={() => setDefault(p.id)}
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border transition ${
                  p.isDefault ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : `${t.border} ${t.muted}`
                }`}>
                <Star className={`w-3.5 h-3.5 ${p.isDefault ? "fill-current" : ""}`} />
                {p.isDefault ? "По умолчанию" : "Основная"}
              </button>
              {items.length > 1 && (
                <button type="button" onClick={() => remove(p.id)} className="text-rose-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            {(p.pipelineType === "subprocess") && (
              <div className="flex flex-wrap gap-2">
                <Labeled label="Родительская воронка" t={t}>
                  <select value={p.parentPipelineId || ""} onChange={(e) => patch(p.id, { parentPipelineId: e.target.value || null })}
                    className={`text-sm rounded-md border px-2 py-1.5 ${t.border} ${t.surface}`}>
                    <option value="">—</option>
                    {items.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Активировать на этапе" t={t}>
                  <select value={p.parentStageId || ""} onChange={(e) => patch(p.id, { parentStageId: e.target.value || null })}
                    className={`text-sm rounded-md border px-2 py-1.5 ${t.border} ${t.surface}`}>
                    <option value="">—</option>
                    {stages.filter((s) => !p.parentPipelineId || s.pipelineId === p.parentPipelineId)
                      .map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Labeled>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn t={t} variant="soft" onClick={addPipeline}><Plus className="w-4 h-4" /> Новая воронка</Btn>
        <Btn t={t} onClick={save}>{saving ? "Сохранение…" : "Сохранить воронки"}</Btn>
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
    </div>
  );
}
