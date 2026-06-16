import { useState } from "react";
import {
  Plus, Trash2, Settings, Type, Hash, Banknote, Phone, Link2, MapPinned, Calendar, CalendarClock, User,
} from "lucide-react";

const FIELD_TYPES = [
  { key: "text", label: "Текст", icon: Type },
  { key: "number", label: "Число", icon: Hash },
  { key: "money", label: "Деньги", icon: Banknote },
  { key: "phone", label: "Телефон", icon: Phone },
  { key: "link", label: "Ссылка", icon: Link2 },
  { key: "address", label: "Адрес", icon: MapPinned },
  { key: "date", label: "Дата", icon: Calendar },
  { key: "datetime", label: "Дата и время", icon: CalendarClock },
  { key: "employee", label: "Сотрудник", icon: User },
];

const uid = () => Math.random().toString(36).slice(2, 10);

type Field = { id: string; label: string; type: string; gridCol?: number; gridRow?: number; gridSpan?: number };
type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

export function FieldsSettings({
  t, data, updateData, Btn, TInput, Labeled,
}: {
  t: Record<string, string>;
  data: { fields: Field[] };
  updateData: (patch: { fields: Field[] }) => void;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");

  function add() {
    if (!label.trim()) return;
    const maxRow = data.fields.reduce((m, f) => Math.max(m, f.gridRow ?? 0), 1);
    updateData({
      fields: [...data.fields, {
        id: uid(), label: label.trim(), type,
        gridCol: (data.fields.length % 2) * 2,
        gridRow: maxRow + 1,
        gridSpan: 2,
      }],
    });
    setLabel("");
    setType("text");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-teal-600" />
        <h2 className="font-semibold">Поля карточки клиента</h2>
      </div>
      <p className={`text-sm ${t.muted}`}>Дополнительные поля в карточке сделки. Тип выбирается нажатием.</p>
      <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
        <Labeled label="Название поля" t={t}>
          <TInput t={t} value={label} onChange={setLabel} placeholder="Например, Ссылка на объект" />
        </Labeled>
        <label className={`text-xs font-medium ${t.muted} block mt-4 mb-2`}>Тип поля</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FIELD_TYPES.map((ft) => (
            <button key={ft.key} type="button" onClick={() => setType(ft.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition ${type === ft.key ? "border-teal-400 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.hover}`}`}>
              <ft.icon className="w-4 h-4" /> {ft.label}
            </button>
          ))}
        </div>
        <Btn t={t} onClick={add} className="mt-4"><Plus className="w-4 h-4" /> Добавить поле</Btn>
      </div>
      <div className={`rounded-xl border overflow-hidden ${t.surface} ${t.border}`}>
        <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border}`}>Поля ({data.fields.length})</div>
        {data.fields.length === 0 ? <p className={`p-6 text-sm text-center ${t.muted}`}>Полей пока нет.</p>
          : <div className={`divide-y ${t.divide}`}>
              {data.fields.map((f) => {
                const ft = FIELD_TYPES.find((x) => x.key === f.type);
                return (
                  <div key={f.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 flex items-center justify-center">{ft && <ft.icon className="w-4 h-4" />}</span>
                      <div><div className="text-sm font-medium">{f.label}</div><div className={`text-xs ${t.muted}`}>{ft?.label}</div></div>
                    </div>
                    <button type="button" onClick={() => updateData({ fields: data.fields.filter((x) => x.id !== f.id) })} className={`${t.muted} hover:text-rose-500`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>}
      </div>
    </div>
  );
}
