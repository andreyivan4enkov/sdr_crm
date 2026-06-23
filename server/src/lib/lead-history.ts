import type { AuthUser } from "../db/schema.js";

const ACTION_LABELS: Record<string, string> = {
  "lead.create": "Создана сделка",
  "lead.read": "Просмотр сделки",
  "lead.update": "Изменена сделка",
  "lead.delete": "Удалена сделка",
  "lead.note": "Добавлена запись в журнал",
  "lead.export": "Выгрузка персональных данных",
  "lead.erase": "Обезличены персональные данные",
  "lead.consent_revoke": "Отозвано согласие на обработку ПДн",
  "lead.public_create": "Создана с формы / webhook",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Имя",
  phone: "Телефон",
  email: "Email",
  region: "Регион",
  preferredTime: "Удобное время",
  comment: "Комментарий",
  statusId: "Этап",
  channelId: "Канал",
  assignedUserId: "Ответственный",
  assignedDealManagerId: "Менеджер по сделкам",
  watchers: "Наблюдатели",
  custom: "Доп. поля",
  pdConsent: "Согласие на ПДн",
};

export function leadAuditActionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

type LeadRow = {
  name?: string | null;
  phone?: string | null;
  statusId?: string | null;
  assignedUserId?: string | null;
  assignedDealManagerId?: string | null;
  watchers?: string[] | null;
};

type ResolveCtx = {
  stages?: Map<string, string>;
  users?: Map<string, string>;
};

function resolveValue(key: string, value: unknown, ctx: ResolveCtx): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "statusId" && typeof value === "string") return ctx.stages?.get(value) || value;
  if ((key === "assignedUserId" || key === "assignedDealManagerId") && typeof value === "string") {
    return ctx.users?.get(value) || value;
  }
  if (key === "watchers" && Array.isArray(value)) {
    return value.map((id) => ctx.users?.get(id) || id).join(", ") || "—";
  }
  if (key === "custom" && value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, string>);
    return entries.length ? `${entries.length} пол.` : "—";
  }
  if (typeof value === "boolean") return value ? "да" : "нет";
  return String(value);
}

export function summarizeLeadPatch(
  patch: Record<string, unknown>,
  existing: LeadRow,
  ctx: ResolveCtx = {},
): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(patch)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const label = FIELD_LABELS[key] || key;
    const prev = (existing as Record<string, unknown>)[key];
    const next = patch[key];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    if (key === "statusId" || key === "assignedUserId" || key === "watchers") {
      lines.push(`${label}: ${resolveValue(key, prev, ctx)} → ${resolveValue(key, next, ctx)}`);
    } else {
      lines.push(`${label}: ${resolveValue(key, next, ctx)}`);
    }
  }
  return lines;
}

export function formatLeadHistoryEntry(
  row: {
    action: string;
    userLogin?: string | null;
    userName?: string | null;
    createdAt: Date | string;
    meta?: Record<string, unknown> | null;
  },
) {
  const actor = row.userName || row.userLogin || "Система";
  const at = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  const meta = row.meta || {};
  const changes = Array.isArray(meta.changes) ? (meta.changes as string[]) : [];
  const notePreview = typeof meta.text === "string" ? meta.text : undefined;

  return {
    action: row.action,
    label: leadAuditActionLabel(row.action),
    actor,
    userLogin: row.userLogin || null,
    at,
    details: changes.length ? changes : notePreview ? [notePreview] : [],
  };
}

export function leadHistoryActor(user: AuthUser) {
  return user.profile?.name || user.login;
}
