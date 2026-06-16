export type CrmNavFrame = {
  view: string;
  leadId?: string | null;
  taskId?: string | null;
  crmSub?: "kanban" | "list";
  settingsTab?: string;
};

export function framesEqual(a: CrmNavFrame, b: CrmNavFrame) {
  return a.view === b.view
    && (a.leadId ?? null) === (b.leadId ?? null)
    && (a.taskId ?? null) === (b.taskId ?? null)
    && (a.crmSub ?? "kanban") === (b.crmSub ?? "kanban")
    && (a.settingsTab ?? "") === (b.settingsTab ?? "");
}

/** Нужно ли сохранить текущий экран в стеке перед переходом */
export function shouldPushNav(cur: CrmNavFrame, next: CrmNavFrame) {
  if (framesEqual(cur, next)) return false;
  if (cur.view !== next.view) return true;
  if ((cur.leadId ?? null) && (next.leadId ?? null) && cur.leadId !== next.leadId) return true;
  if ((cur.taskId ?? null) && (next.taskId ?? null) && cur.taskId !== next.taskId) return true;
  if (cur.view === "crm" && cur.leadId && (next.taskId || next.view === "tasks")) return true;
  if (cur.view === "tasks" && cur.taskId && (next.leadId || next.view === "crm")) return true;
  if (cur.view === "calls" && next.leadId) return true;
  if ((cur.leadId || cur.taskId) && (next.leadId || next.taskId)) return true;
  return false;
}
