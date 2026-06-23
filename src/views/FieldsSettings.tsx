import { useEffect, useState } from "react";
import {
  Plus, Trash2, Settings, Type, Hash, Banknote, Phone, Link2, MapPinned, Calendar, CalendarClock,
  User, Image, Code2, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, type Field, type Pipeline, type Stage } from "../api/client";
import {
  CRM_FIELD_TYPE_KEYS, type CrmEntityType, type CrmFieldMeta, type CrmFieldDef,
} from "../lib/crm-field-types";

const FIELD_TYPE_META: Record<string, { label: string; icon: typeof Type }> = {
  text: { label: "Текст", icon: Type },
  number: { label: "Число", icon: Hash },
  money: { label: "Деньги", icon: Banknote },
  phone: { label: "Телефон", icon: Phone },
  link: { label: "Ссылка", icon: Link2 },
  address: { label: "Адрес", icon: MapPinned },
  date: { label: "Дата", icon: Calendar },
  datetime: { label: "Дата и время", icon: CalendarClock },
  employee: { label: "Сотрудник", icon: User },
  image: { label: "Изображение", icon: Image },
  code: { label: "Код", icon: Code2 },
};

const ENTITY_LABELS: Record<CrmEntityType, string> = {
  lead: "Сделки",
  asset: "Активы",
  resource: "Ресурсы",
};

const AUTOMATION_TRIGGERS = [
  { key: "stage_enter", label: "Вход на стадию" },
  { key: "stage_leave", label: "Выход со стадии" },
  { key: "blueprint_run", label: "Запуск реактора" },
  { key: "form_submit", label: "Отправка формы" },
];

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

function emptyMeta(): CrmFieldMeta {
  return { bindings: {}, required: {}, multiple: false, code: { html: "", css: "", js: "" } };
}

function toggleId(list: string[] | undefined, id: string): string[] {
  const cur = list ?? [];
  return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

function FieldEditor({
  field, onChange, onDelete, t, pipelines, stages, reactors, sites, assetGroups, expanded, onToggle,
}: {
  field: CrmFieldDef;
  onChange: (f: CrmFieldDef) => void;
  onDelete: () => void;
  t: Record<string, string>;
  pipelines: Pipeline[];
  stages: Stage[];
  reactors: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  assetGroups: { id: string; name: string }[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const ft = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
  const meta = field.meta ?? emptyMeta();
  const types = field.entityTypes?.length ? field.entityTypes : (["lead"] as CrmEntityType[]);

  function patchMeta(p: Partial<CrmFieldMeta>) {
    onChange({ ...field, meta: { ...meta, ...p } });
  }

  return (
    <div className={`border-b ${t.divide}`}>
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-3 flex-1 text-left min-w-0">
          <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 flex items-center justify-center shrink-0">
            <ft.icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{field.label}</div>
            <div className={`text-xs ${t.muted}`}>
              {ft.label}
              {types.map((e) => ENTITY_LABELS[e]).join(" · ")}
              {meta.required?.always ? " · обяз." : ""}
              {meta.multiple ? " · множ." : ""}
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
        </button>
        <button type="button" onClick={onDelete} className={`${t.muted} hover:text-rose-500 shrink-0`}><Trash2 className="w-4 h-4" /></button>
      </div>

      {expanded && (
        <div className={`px-4 pb-4 space-y-4 text-sm ${t.muted}`}>
          <div>
            <label className="text-xs font-medium block mb-1">Название</label>
            <input className={`w-full rounded-lg border px-3 py-2 text-sm ${t.border} ${t.surface}`}
              value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-2">Сущности</label>
            <div className="flex flex-wrap gap-2">
              {(["lead", "asset", "resource"] as CrmEntityType[]).map((et) => {
                const on = types.includes(et);
                return (
                  <button key={et} type="button"
                    className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-teal-600 text-white border-teal-600" : t.border}`}
                    onClick={() => {
                      const next = on ? types.filter((x) => x !== et) : [...types, et];
                      onChange({ ...field, entityTypes: next.length ? next : ["lead"] });
                    }}>
                    {ENTITY_LABELS[et]}
                  </button>
                );
              })}
            </div>
          </div>

          {types.includes("lead") && pipelines.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-2">Воронки (пусто = все)</label>
              <div className="flex flex-wrap gap-2">
                {pipelines.map((p) => {
                  const on = meta.bindings?.pipelineIds?.includes(p.id);
                  return (
                    <button key={p.id} type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-teal-600 text-white border-teal-600" : t.border}`}
                      onClick={() => patchMeta({ bindings: { ...meta.bindings, pipelineIds: toggleId(meta.bindings?.pipelineIds, p.id) } })}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {types.includes("lead") && reactors.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-2">Реакторы</label>
              <div className="flex flex-wrap gap-2">
                {reactors.map((r) => {
                  const on = meta.bindings?.reactorIds?.includes(r.id);
                  return (
                    <button key={r.id} type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-violet-600 text-white border-violet-600" : t.border}`}
                      onClick={() => patchMeta({ bindings: { ...meta.bindings, reactorIds: toggleId(meta.bindings?.reactorIds, r.id) } })}>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {types.includes("lead") && sites.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-2">Сайты</label>
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => {
                  const on = meta.bindings?.siteIds?.includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-sky-600 text-white border-sky-600" : t.border}`}
                      onClick={() => patchMeta({ bindings: { ...meta.bindings, siteIds: toggleId(meta.bindings?.siteIds, s.id) } })}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {types.includes("asset") && assetGroups.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-2">Группы активов</label>
              <div className="flex flex-wrap gap-2">
                {assetGroups.map((g) => {
                  const on = meta.bindings?.assetGroupIds?.includes(g.id);
                  return (
                    <button key={g.id} type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-amber-600 text-white border-amber-600" : t.border}`}
                      onClick={() => patchMeta({ bindings: { ...meta.bindings, assetGroupIds: toggleId(meta.bindings?.assetGroupIds, g.id) } })}>
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(meta.required?.always)}
                onChange={(e) => patchMeta({ required: { ...meta.required, always: e.target.checked } })} />
              Обязательное всегда
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(meta.multiple)}
                onChange={(e) => patchMeta({ multiple: e.target.checked })} />
              Множественное значение
            </label>
          </div>

          {stages.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-2">Обязательно на стадиях</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {stages.map((s) => {
                  const on = meta.required?.stageIds?.includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-rose-600 text-white border-rose-600" : t.border}`}
                      onClick={() => patchMeta({ required: { ...meta.required, stageIds: toggleId(meta.required?.stageIds, s.id) } })}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-2">Обязательно при автоматизациях</label>
            <div className="flex flex-wrap gap-2">
              {AUTOMATION_TRIGGERS.map((tr) => {
                const on = meta.required?.automationTriggers?.includes(tr.key);
                return (
                  <button key={tr.key} type="button"
                    className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-orange-600 text-white border-orange-600" : t.border}`}
                    onClick={() => patchMeta({
                      required: { ...meta.required, automationTriggers: toggleId(meta.required?.automationTriggers, tr.key) },
                    })}>
                    {tr.label}
                  </button>
                );
              })}
            </div>
          </div>

          {field.type === "code" && (
            <div className="space-y-2">
              <label className="text-xs font-medium">HTML</label>
              <textarea className={`w-full rounded-lg border px-3 py-2 text-xs font-mono min-h-[60px] ${t.border}`}
                value={meta.code?.html ?? ""} onChange={(e) => patchMeta({ code: { ...meta.code, html: e.target.value } })} />
              <label className="text-xs font-medium">CSS</label>
              <textarea className={`w-full rounded-lg border px-3 py-2 text-xs font-mono min-h-[40px] ${t.border}`}
                value={meta.code?.css ?? ""} onChange={(e) => patchMeta({ code: { ...meta.code, css: e.target.value } })} />
              <label className="text-xs font-medium">JavaScript (доступны window.fieldValue, window.setFieldValue)</label>
              <textarea className={`w-full rounded-lg border px-3 py-2 text-xs font-mono min-h-[80px] ${t.border}`}
                value={meta.code?.js ?? ""} onChange={(e) => patchMeta({ code: { ...meta.code, js: e.target.value } })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FieldsSettings({
  t, data, updateData, Btn, TInput, Labeled,
}: {
  t: Record<string, string>;
  data: { fields: Field[]; pipelines?: Pipeline[]; stages?: Stage[] };
  updateData: (patch: { fields: Field[] }) => void;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [entityTypes, setEntityTypes] = useState<CrmEntityType[]>(["lead"]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reactors, setReactors] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [assetGroups, setAssetGroups] = useState<{ id: string; name: string }[]>([]);

  const fields = data.fields.map((f) => ({
    ...f,
    entityTypes: (f.entityTypes ?? ["lead"]) as CrmEntityType[],
    meta: f.meta ?? {},
  }));

  const pipelines = data.pipelines ?? [];
  const stages = data.stages ?? [];

  useEffect(() => {
    void Promise.all([
      api.listReactions().then((r) => setReactors(r.reactions.map((b) => ({ id: b.id, name: b.name })))).catch(() => {}),
      api.listSites().then((r) => setSites(r.spaces.map((s) => ({ id: s.id, name: s.name })))).catch(() => {}),
      api.listAssetGroups().then((r) => setAssetGroups(r.groups.map((g) => ({ id: g.id, name: g.name })))).catch(() => {}),
    ]);
  }, []);

  function add() {
    if (!label.trim()) return;
    const maxRow = fields.reduce((m, f) => Math.max(m, f.gridRow ?? 0), 1);
    const newField: CrmFieldDef = {
      id: crypto.randomUUID(),
      label: label.trim(),
      type,
      gridCol: (fields.length % 2) * 2,
      gridRow: maxRow + 1,
      gridSpan: 2,
      entityTypes: entityTypes.length ? entityTypes : ["lead"],
      meta: type === "code" ? { ...emptyMeta(), code: { html: "<div id=\"app\"></div>", css: "", js: "" } } : emptyMeta(),
    };
    updateData({ fields: [...data.fields, newField] });
    setLabel("");
    setType("text");
    setExpandedId(newField.id);
  }

  function updateField(id: string, next: CrmFieldDef) {
    updateData({ fields: data.fields.map((f) => (f.id === id ? next : f)) });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-teal-600" />
        <h2 className="font-semibold">Поля CRM</h2>
      </div>
      <p className={`text-sm ${t.muted}`}>
        Дополнительные поля для сделок, активов и ресурсов. Привязка к воронкам, реакторам, сайтам и группам активов.
      </p>

      <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
        <Labeled label="Название поля" t={t}>
          <TInput t={t} value={label} onChange={setLabel} placeholder="Например, Серийный номер" />
        </Labeled>

        <label className={`text-xs font-medium ${t.muted} block mt-4 mb-2`}>Сущности</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["lead", "asset", "resource"] as CrmEntityType[]).map((et) => {
            const on = entityTypes.includes(et);
            return (
              <button key={et} type="button"
                className={`text-xs px-3 py-1.5 rounded-lg border ${on ? "border-teal-400 bg-teal-50 dark:bg-teal-500/10 text-teal-700" : t.border}`}
                onClick={() => setEntityTypes(on ? entityTypes.filter((x) => x !== et) : [...entityTypes, et])}>
                {ENTITY_LABELS[et]}
              </button>
            );
          })}
        </div>

        <label className={`text-xs font-medium ${t.muted} block mb-2`}>Тип поля</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {CRM_FIELD_TYPE_KEYS.map((key) => {
            const ft = FIELD_TYPE_META[key];
            if (!ft) return null;
            return (
              <button key={key} type="button" onClick={() => setType(key)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition ${type === key ? "border-teal-400 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.hover}`}`}>
                <ft.icon className="w-4 h-4" /> {ft.label}
              </button>
            );
          })}
        </div>
        <Btn t={t} onClick={add} className="mt-4"><Plus className="w-4 h-4" /> Добавить поле</Btn>
      </div>

      <div className={`rounded-xl border overflow-hidden ${t.surface} ${t.border}`}>
        <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border}`}>Поля ({fields.length})</div>
        {fields.length === 0 ? (
          <p className={`p-6 text-sm text-center ${t.muted}`}>Полей пока нет.</p>
        ) : (
          <div>
            {fields.map((f) => (
              <FieldEditor
                key={f.id}
                field={f}
                t={t}
                pipelines={pipelines}
                stages={stages}
                reactors={reactors}
                sites={sites}
                assetGroups={assetGroups}
                expanded={expandedId === f.id}
                onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
                onChange={(next) => updateField(f.id, next)}
                onDelete={() => updateData({ fields: data.fields.filter((x) => x.id !== f.id) })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
