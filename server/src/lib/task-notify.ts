import type { tasks } from "../db/schema.js";
import { dispatchUserNotification } from "./notify.js";

type TaskRow = typeof tasks.$inferSelect;

export function taskParticipantIds(task: {
  assigneeUserId?: string | null;
  coExecutors?: string[] | null;
  watchers?: string[] | null;
}, excludeUserId?: string) {
  const ids = new Set<string>();
  if (task.assigneeUserId) ids.add(task.assigneeUserId);
  for (const id of task.coExecutors || []) ids.add(id);
  for (const id of task.watchers || []) ids.add(id);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

function dueLabel(dueAt: Date | null | undefined) {
  if (!dueAt) return "";
  return dueAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export async function notifyTaskCreated(task: TaskRow, actorUserId?: string) {
  if (!task.notifyParticipants) return;
  const recipients = taskParticipantIds(task, actorUserId);
  if (!recipients.length) return;
  const due = task.dueAt ? ` · срок ${dueLabel(task.dueAt)}` : "";
  await dispatchUserNotification(recipients, {
    kind: "taskAssigned",
    text: `Новая задача: ${task.text}${due}`,
    leadId: task.leadId || undefined,
    taskId: task.id,
  });
}

export async function notifyTaskUpdated(
  task: TaskRow,
  opts: { actorUserId?: string; reassigned?: boolean; completed?: boolean; comment?: boolean; pinned?: boolean },
) {
  if (!task.notifyParticipants) return;
  const recipients = taskParticipantIds(task, opts.actorUserId);
  if (!recipients.length) return;

  let text = `Задача обновлена: ${task.text}`;
  if (opts.completed) text = `Задача завершена: ${task.text}`;
  else if (opts.reassigned) text = `Вам назначена задача: ${task.text}`;
  else if (opts.comment) text = `Комментарий в задаче: ${task.text}`;
  else if (opts.pinned) text = `Согласован результат по задаче: ${task.text}`;

  await dispatchUserNotification(recipients, {
    kind: opts.reassigned ? "taskAssigned" : "taskUpdated",
    text,
    leadId: task.leadId || undefined,
    taskId: task.id,
  });
}

export async function notifyTaskDue(task: TaskRow, overdue: boolean) {
  if (!task.notifyParticipants) return;
  const recipients = taskParticipantIds(task);
  if (!recipients.length) return;
  const due = dueLabel(task.dueAt);
  await dispatchUserNotification(recipients, {
    kind: "taskDue",
    text: overdue
      ? `Просрочена задача: ${task.text}${due ? ` (срок ${due})` : ""}`
      : `Скоро срок задачи: ${task.text}${due ? ` — ${due}` : ""}`,
    leadId: task.leadId || undefined,
    taskId: task.id,
  });
}
