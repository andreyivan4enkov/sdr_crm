import type { Channel, Field, Lead, Stage, TeamMember } from "../api/client";
import { leadResponsibleMember } from "./team-members";

export type SortDir = "asc" | "desc";

export type BuiltinLeadColumnId =
  | "name"
  | "phone"
  | "email"
  | "stage"
  | "responsible"
  | "region"
  | "preferredTime"
  | "channel"
  | "source"
  | "comment"
  | "createdAt"
  | "updatedAt";

export type LeadColumnId = BuiltinLeadColumnId | `custom:${string}`;

export type LeadListColumn = {
  id: LeadColumnId;
  label: string;
  sortable: boolean;
  minWidth?: string;
  builtin?: boolean;
};

export const BUILTIN_LEAD_COLUMNS: LeadListColumn[] = [
  { id: "name", label: "Сделка", sortable: true, minWidth: "10rem", builtin: true },
  { id: "phone", label: "Телефон", sortable: true, minWidth: "8rem", builtin: true },
  { id: "stage", label: "Этап", sortable: true, minWidth: "8rem", builtin: true },
  { id: "responsible", label: "Ответственный", sortable: true, minWidth: "9rem", builtin: true },
  { id: "region", label: "Регион", sortable: true, minWidth: "7rem", builtin: true },
  { id: "email", label: "E-mail", sortable: true, minWidth: "8rem", builtin: true },
  { id: "preferredTime", label: "Удобное время", sortable: true, minWidth: "7rem", builtin: true },
  { id: "channel", label: "Канал", sortable: true, minWidth: "7rem", builtin: true },
  { id: "source", label: "Источник", sortable: true, minWidth: "7rem", builtin: true },
  { id: "comment", label: "Комментарий", sortable: true, minWidth: "10rem", builtin: true },
  { id: "createdAt", label: "Создана", sortable: true, minWidth: "8rem", builtin: true },
  { id: "updatedAt", label: "Изменена", sortable: true, minWidth: "8rem", builtin: true },
];

export const DEFAULT_VISIBLE_COLUMNS: LeadColumnId[] = [
  "name", "phone", "stage", "responsible", "updatedAt",
];

type LeadRow = Lead & { status?: string };

type Ctx = {
  stages: Stage[];
  channels: Channel[];
  employees: TeamMember[];
  dealManagers: { id: string; name: string; userId?: string | null }[];
  fields: Field[];
};

export function buildLeadColumns(fields: Field[]): LeadListColumn[] {
  const customs = fields.map((f) => ({
    id: `custom:${f.id}` as LeadColumnId,
    label: f.label,
    sortable: true,
    minWidth: "8rem",
    builtin: false,
  }));
  return [...BUILTIN_LEAD_COLUMNS, ...customs];
}

export function resolveVisibleColumns(all: LeadListColumn[], stored: LeadColumnId[]): LeadListColumn[] {
  const map = new Map(all.map((c) => [c.id, c]));
  const ids = stored.filter((id) => map.has(id));
  if (!ids.includes("name")) ids.unshift("name");
  return ids.map((id) => map.get(id)!);
}

function cmpNum(a: number, b: number, dir: SortDir) {
  return dir === "asc" ? a - b : b - a;
}

function cmpStr(a: string, b: string, dir: SortDir) {
  return cmpNum(a.localeCompare(b, "ru", { sensitivity: "base" }), 0, dir);
}

function cmpDate(a?: string | null, b?: string | null, dir: SortDir = "desc") {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return cmpNum(ta, tb, dir);
}

function channelName(lead: LeadRow, channels: Channel[]) {
  return channels.find((c) => c.id === lead.channelId)?.name || "";
}

function customFieldId(col: LeadColumnId): string | null {
  return col.startsWith("custom:") ? col.slice(7) : null;
}

function customField(fields: Field[], col: LeadColumnId) {
  const id = customFieldId(col);
  return id ? fields.find((f) => f.id === id) : undefined;
}

export function leadCellText(lead: LeadRow, col: LeadColumnId, ctx: Ctx): string {
  switch (col) {
    case "name": return lead.name || "";
    case "phone": return lead.phone || "";
    case "email": return lead.email || "";
    case "region": return lead.region || "";
    case "preferredTime": return lead.preferredTime || "";
    case "source": return lead.source || "";
    case "comment": return lead.comment || "";
    case "stage": return ctx.stages.find((s) => s.id === (lead.status || lead.statusId))?.label || "";
    case "responsible": return leadResponsibleMember(lead, ctx.employees, ctx.dealManagers)?.name || "";
    case "channel": return channelName(lead, ctx.channels);
    case "createdAt": return lead.createdAt || "";
    case "updatedAt": return lead.updatedAt || "";
    default: {
      const f = customField(ctx.fields, col);
      if (!f) return "";
      const raw = (lead.custom || {})[f.id] || "";
      if (f.type === "employee") {
        return ctx.dealManagers.find((r) => r.id === raw)?.name || raw;
      }
      if (f.type === "money" && raw) return `${raw} ₽`;
      return raw;
    }
  }
}

export function formatLeadCell(lead: LeadRow, col: LeadColumnId, ctx: Ctx): string {
  const text = leadCellText(lead, col, ctx);
  if (col === "createdAt" || col === "updatedAt") return formatListDate(text);
  if (col === "comment" && text.length > 80) return `${text.slice(0, 77)}…`;
  return text || "—";
}

export function formatListDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sortLeadsByColumn<T extends LeadRow>(
  leads: T[],
  col: LeadColumnId,
  dir: SortDir,
  ctx: Ctx,
): T[] {
  const stageIndex = new Map(ctx.stages.map((s, i) => [s.id, i]));
  return [...leads].sort((a, b) => {
    let r = 0;
    if (col === "stage") {
      const sa = stageIndex.get(a.status || a.statusId || "") ?? 999;
      const sb = stageIndex.get(b.status || b.statusId || "") ?? 999;
      r = cmpNum(sa, sb, dir);
    } else if (col === "createdAt" || col === "updatedAt") {
      r = cmpDate(leadCellText(a, col, ctx), leadCellText(b, col, ctx), dir);
    } else {
      r = cmpStr(leadCellText(a, col, ctx), leadCellText(b, col, ctx), dir);
    }
    if (r !== 0) return r;
    return cmpDate(a.createdAt, b.createdAt, "desc");
  });
}
