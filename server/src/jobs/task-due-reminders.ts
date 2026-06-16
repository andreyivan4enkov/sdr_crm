import { and, eq, isNull, lt, gt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { tasks } from "../db/schema.js";
import { notifyTaskDue } from "../lib/task-notify.js";
import { logger } from "../lib/logger.js";

const HOUR_MS = 60 * 60 * 1000;

/** Напоминания о сроках: за 1 час и при просрочке */
export async function runTaskDueReminders() {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + HOUR_MS);

  const upcoming = await db.select().from(tasks).where(
    and(
      eq(tasks.done, false),
      eq(tasks.notifyParticipants, true),
      isNull(tasks.dueNotifiedAt),
      gt(tasks.dueAt, now),
      lt(tasks.dueAt, inOneHour),
    ),
  );

  for (const task of upcoming) {
    await notifyTaskDue(task, false);
    await db.update(tasks).set({ dueNotifiedAt: now }).where(eq(tasks.id, task.id));
  }

  const overdue = await db.select().from(tasks).where(
    and(
      eq(tasks.done, false),
      eq(tasks.notifyParticipants, true),
      lt(tasks.dueAt, now),
      or(isNull(tasks.dueNotifiedAt), lt(tasks.dueNotifiedAt, tasks.dueAt)),
    ),
  );

  for (const task of overdue) {
    await notifyTaskDue(task, true);
    await db.update(tasks).set({ dueNotifiedAt: now }).where(eq(tasks.id, task.id));
  }

  if (upcoming.length || overdue.length) {
    logger.info("tasks.due_reminders", { upcoming: upcoming.length, overdue: overdue.length });
  }
}
