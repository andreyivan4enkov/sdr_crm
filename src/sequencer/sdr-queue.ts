import type { Lead, Stage, Task } from "@sdr-crm/api-client";
import type { CrmData } from "../hooks/useCrmData";
import {
  STATUS_COLORS,
  type EntityType,
  type SectorKey,
  type SequencerItem,
} from "./types";

const VEC_SIZE = 512;

function hashBits(seed: string, count = 12): number[] {
  const bits: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223 + i) | 0;
    bits.push(Math.abs(h) % VEC_SIZE);
  }
  return [...new Set(bits)];
}

function vecFromSeeds(...seeds: string[]): Uint8Array {
  const v = new Uint8Array(VEC_SIZE);
  for (const s of seeds) for (const b of hashBits(s)) v[b] = 1;
  return v;
}

function overlap(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++;
  return n;
}

const URGENCY_QUERY = vecFromSeeds("urgent", "now", "new", "overdue", "deadline");
const ADMIN_QUERY = vecFromSeeds("admin", "paperwork", "document", "report");

function stageLabel(stages: Stage[], id: string) {
  return stages.find((s) => s.id === id)?.label ?? "";
}

function inferLeadEntityType(lead: Lead & { status?: string }, stages: Stage[]): EntityType {
  const stageId = lead.status ?? lead.statusId ?? "";
  const label = stageLabel(stages, stageId).toLowerCase();
  const text = `${lead.name} ${lead.comment ?? ""}`.toLowerCase();
  if (/документ|акт|сверк|договор|счёт|счет/.test(text)) return "doc";
  if (/\bсделка\b/.test(label) || label === "в работе") return "deal";
  return "lead";
}

function statusColorForLead(type: EntityType, stageId: string, stages: Stage[]): { label: string; color: string } {
  const label = stageLabel(stages, stageId);
  const ll = label.toLowerCase();
  if (/отказ|проигр|закрыт/.test(ll)) return { label, color: STATUS_COLORS.red };
  if (/нов|перв|вход/.test(ll) || type === "lead") return { label: label || "Новый", color: STATUS_COLORS.blue };
  if (/успех|выигр|сделк/.test(ll)) return { label, color: STATUS_COLORS.green };
  return { label: label || "В работе", color: STATUS_COLORS.amber };
}

function statusColorForTask(task: Task): { label: string; color: string } {
  if (task.status === "new") return { label: "Новая", color: STATUS_COLORS.blue };
  if (task.status === "waiting") return { label: "Ожидание", color: STATUS_COLORS.amber };
  if (task.status === "deferred") return { label: "Отложена", color: STATUS_COLORS.slate };
  if (task.priority === "high") return { label: "В работе", color: STATUS_COLORS.amber };
  return { label: "В работе", color: STATUS_COLORS.amber };
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Поступила ${Math.max(1, mins)} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDue(iso?: string): string {
  if (!iso) return "Без срока";
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  if (d.getTime() < now.getTime()) return `Срок истёк ${d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  if (today) return `Срок: сегодня в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  return `Срок: ${d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

function mapLead(lead: Lead & { status?: string }, stages: Stage[], channels: CrmData["channels"]): SequencerItem {
  const type = inferLeadEntityType(lead, stages);
  const stageId = lead.status ?? lead.statusId ?? "";
  const st = statusColorForLead(type, stageId, stages);
  const channel = channels.find((c) => c.id === lead.channelId)?.name ?? "Канал не указан";
  const sdrBits = vecFromSeeds(
    `lead:${lead.id}`,
    `stage:${stageId}`,
    `type:${type}`,
    lead.phone ?? "",
    lead.name,
  );

  const isNew = st.color === STATUS_COLORS.blue;
  const interact =
    type === "doc"
      ? { label: "Открыть документ", kind: "view" as const }
      : type === "lead"
        ? { label: "Позвонить", kind: "call" as const }
        : { label: "Открыть сделку", kind: "view" as const };

  return {
    id: `lead-${lead.id}`,
    type,
    title: type === "lead" ? `Звонок: ${lead.name}` : lead.name,
    company: `${channel}${lead.region ? ` · ${lead.region}` : ""}`,
    line1: lead.phone || lead.email || "Контакт не указан",
    line2: formatRelative(lead.createdAt),
    statusLabel: st.label,
    statusColor: st.color,
    priority: 0,
    reason: "",
    interact,
    var1: { label: type === "lead" ? "Написать" : "Передать", input: type === "lead" ? "dictation" : "none" },
    var2: { label: "Отложить", input: "none" },
    target:
      type === "doc"
        ? { label: "Подписать", input: "none" }
        : type === "lead"
          ? { label: "Перезвонить", input: "dictation" }
          : { label: "На согласование", input: "comment" },
    sdrBits,
    sourceKind: "lead",
    sourceId: lead.id,
  };
}

function mapTask(task: Task, leads: Lead[], stages: Stage[]): SequencerItem {
  const linked = task.leadId ? leads.find((l) => l.id === task.leadId) : undefined;
  const textL = task.text.toLowerCase();
  const isDoc = /документ|акт|сверк|подпис/.test(textL);
  const type: EntityType = isDoc ? "doc" : "task";
  const st = statusColorForTask(task);
  const sdrBits = vecFromSeeds(`task:${task.id}`, `status:${task.status}`, `prio:${task.priority}`, task.text);

  const checklistItems = task.checklist?.length ? task.checklist.map((c) => c.text) : undefined;
  const interact = isDoc
    ? { label: "Открыть документ", kind: "view" as const }
    : checklistItems?.length
      ? { label: "Открыть чек-лист", kind: "checklist" as const, items: checklistItems }
      : /фото|сним|приёмк|приемк/.test(textL)
        ? { label: "Сфотографировать", kind: "camera" as const }
        : { label: "Открыть задачу", kind: "view" as const };

  return {
    id: `task-${task.id}`,
    type,
    title: task.text,
    company: linked ? `Сделка «${linked.name}»` : task.assignee ? `Исполнитель: ${task.assignee}` : "Задача",
    line1: task.checklist?.length ? `Чек-лист: ${task.checklist.filter((c) => c.done).length} из ${task.checklist.length}` : task.priority === "high" ? "Высокий приоритет" : "Плановая задача",
    line2: formatDue(task.dueAt),
    statusLabel: st.label,
    statusColor: st.color,
    priority: 0,
    reason: "",
    interact,
    var1: { label: "Делегировать", input: "none" },
    var2: { label: "Отложить", input: "none" },
    target: { label: "Завершить", input: task.requireSummary ? "comment" : "none" },
    sdrBits,
    sourceKind: "task",
    sourceId: task.id,
  };
}

function scoreItem(item: SequencerItem, stages: Stage[]): { priority: number; reason: string } {
  const urg = overlap(item.sdrBits, URGENCY_QUERY);
  const admin = overlap(item.sdrBits, ADMIN_QUERY);
  let priority = 30 + urg * 4 - admin * 2;

  if (item.type === "lead") {
    priority += 45;
    return { priority: Math.min(99, priority), reason: "Новый лид — мгновенный приоритет над администрированием" };
  }
  if (item.type === "doc") {
    priority += 35;
    if (item.line2.includes("истёк")) {
      return { priority: Math.min(99, priority + 25), reason: "Просрочено — вытолкнут в начало очереди" };
    }
    return { priority: Math.min(99, priority), reason: "Документ ожидает согласования" };
  }
  if (item.type === "deal") {
    priority += 28;
    return { priority: Math.min(99, priority), reason: "В работе — дедлайн этапа сегодня" };
  }
  if (item.line2.includes("истёк") || item.line2.includes("сегодня")) {
    priority += 22;
    return { priority: Math.min(99, priority), reason: item.line2.includes("истёк") ? "Просроченная задача" : "Срок задачи сегодня" };
  }
  if (item.sourceKind === "task" && stages.length) {
    return { priority: Math.min(99, priority + 10), reason: "Привязана к активной воронке" };
  }
  return { priority: Math.min(99, priority), reason: "Плановая активность в потоке" };
}

/** Router: сектор резонирует только если совпадает с вектором сущности */
export function sectorResonates(item: SequencerItem, sector: SectorKey): boolean {
  if (sector === "interact") {
    if (item.type === "doc") return item.interact.kind === "view";
    if (item.type === "task") return item.interact.kind !== "call";
    return true;
  }
  if (sector === "delete") {
    return item.type === "lead" || item.type === "doc";
  }
  if (sector === "target" && item.type === "doc") {
    return overlap(item.sdrBits, vecFromSeeds("sign", "approve", "document")) > 0 || true;
  }
  return true;
}

export function buildSequencerQueue(data: CrmData): SequencerItem[] {
  const openTasks = data.tasks.filter((t) => !t.done && t.status !== "completed");
  const items: SequencerItem[] = [
    ...data.leads.map((l) => mapLead(l, data.stages, data.channels)),
    ...openTasks.map((t) => mapTask(t, data.leads, data.stages)),
  ];

  const scored = items.map((item) => {
    const { priority, reason } = scoreItem(item, data.stages);
    return { ...item, priority, reason };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored;
}

export function queueEntityTypes(queue: SequencerItem[]): EntityType[] {
  const order: EntityType[] = ["lead", "deal", "task", "doc"];
  const present = new Set(queue.map((i) => i.type));
  return order.filter((t) => present.has(t));
}
