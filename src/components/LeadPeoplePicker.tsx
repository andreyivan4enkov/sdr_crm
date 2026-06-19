import { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import type { TeamMember } from "@sdr-crm/api-client";
import { EmployeeAvatar, EmployeeChip } from "./EmployeeChip";

export function BioGlassAddButton({
  onClick,
  title = "Добавить",
}: {
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="bio-glass-add shrink-0 text-teal-600 hover:text-teal-500 hover:scale-105 active:scale-95 transition-transform"
    >
      <Plus className="w-5 h-5" strokeWidth={2.25} />
    </button>
  );
}

function AssignPopover({
  t,
  pool,
  onPick,
  onClose,
}: {
  t: Record<string, string>;
  pool: TeamMember[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = pool.filter((m) => !q || m.name.toLowerCase().includes(q));

  return (
    <div
      className={`absolute z-30 top-full left-0 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl bio-card p-2 shadow-xl ${t.surface}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${t.border}`}>
        <Search className={`w-3.5 h-3.5 shrink-0 ${t.muted}`} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск сотрудника…"
          className={`w-full bg-transparent text-sm outline-none ${t.subtle}`}
        />
      </div>
      <div className="mt-1.5 max-h-48 overflow-y-auto nice-scroll space-y-0.5">
        {filtered.length === 0 && (
          <p className={`px-2 py-3 text-xs text-center ${t.muted}`}>
            {pool.length === 0 ? "Нет доступных сотрудников" : "Никого не найдено"}
          </p>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => { onPick(m.id); onClose(); }}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${t.hover}`}
          >
            <EmployeeAvatar member={m} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium crm-data">{m.name}</span>
            {(m.position || m.roleName) && (
              <span className={`text-[10px] truncate max-w-[5rem] ${t.muted}`}>
                {m.position || m.roleName}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LeadAssignSection({
  t,
  label,
  icon: Icon,
  assignedMembers,
  pickPool,
  multiple = false,
  editable = false,
  hideLabel = false,
  onAdd,
  onRemove,
}: {
  t: Record<string, string>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  assignedMembers: TeamMember[];
  pickPool: TeamMember[];
  multiple?: boolean;
  editable?: boolean;
  hideLabel?: boolean;
  onAdd?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const assignedIds = new Set(assignedMembers.map((m) => m.id));
  const available = pickPool.filter((m) => !assignedIds.has(m.id));

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="min-w-0 flex-1">
      {!hideLabel && (
        <span className={`text-[10px] font-medium uppercase tracking-wide ${t.muted} flex items-center gap-1`}>
          <Icon className="w-3 h-3" /> {label}
        </span>
      )}

      <div className={`flex flex-wrap items-center gap-2 min-h-[2.75rem] ${hideLabel ? "" : "mt-2"}`}>
        {multiple ? (
          assignedMembers.map((m) => (
            <EmployeeChip
              key={m.id}
              member={m}
              selected
              t={t}
              onClick={editable && onRemove ? () => onRemove(m.id) : undefined}
            />
          ))
        ) : (
          assignedMembers.map((m) => (
            <LeadResponsibleCard
              key={m.id}
              t={t}
              member={m}
              onClear={editable && onRemove ? () => onRemove(m.id) : undefined}
            />
          ))
        )}

        {assignedMembers.length === 0 && !editable && (
          <p className={`text-xs ${t.muted}`}>{multiple ? "Нет наблюдателей" : "Не назначен"}</p>
        )}

        {editable && onAdd && (
          <div className="relative" ref={wrapRef}>
            <BioGlassAddButton
              title={
                multiple
                  ? "Добавить наблюдателя"
                  : assignedMembers.length
                    ? "Сменить ответственного"
                    : "Назначить ответственного"
              }
              onClick={() => setOpen((o) => !o)}
            />
            {open && (
              <AssignPopover
                t={t}
                pool={available}
                onPick={onAdd}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadResponsibleCard({
  t,
  member,
  onClear,
}: {
  t: Record<string, string>;
  member?: TeamMember | null;
  onClear?: () => void;
}) {
  if (!member) return null;
  return (
    <div className={`inline-flex items-center gap-2.5 rounded-2xl border px-3 py-2 bio-card ${t.border}`}>
      <EmployeeAvatar member={member} size="md" ring />
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{member.name}</div>
        {(member.position || member.roleName) && (
          <div className={`text-[10px] ${t.muted} truncate`}>
            {[member.position, member.roleName].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      {onClear && (
        <button type="button" onClick={onClear} className={`text-xs ${t.muted} hover:text-rose-500 shrink-0`}>
          Снять
        </button>
      )}
    </div>
  );
}

/** Компактный выбор исполнителя для быстрого создания задачи */
export function GlassAssigneeChip({
  t,
  member,
  pool,
  onChange,
}: {
  t: Record<string, string>;
  member: TeamMember | null;
  pool: TeamMember[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = member?.name?.split(/\s+/)[0] || "Кто";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={member ? `Исполнитель: ${member.name}` : "Выбрать исполнителя"}
        className={`bio-glass-chip inline-flex items-center gap-1.5 pl-1 pr-2 py-1 transition hover:border-teal-400/40 ${open ? "border-teal-400/50 ring-2 ring-teal-500/15" : ""}`}
      >
        <EmployeeAvatar member={member} size="xs" />
        <span className={`text-xs font-medium max-w-[4.25rem] truncate crm-data ${t.text}`}>{label}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 opacity-50 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <AssignPopover
          t={t}
          pool={pool}
          onPick={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
