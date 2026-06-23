import { Hono } from "hono";
import { eq, desc, or, isNull, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { tasks, leads, profiles, type TaskChecklistItem, type TaskComment, type TaskStatus, type TaskPriority, type TaskFile } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { accessibleLeadIds, canAccessLead, resolveLeadScope } from "../lib/lead-access.js";
import { canAccessTask } from "../lib/task-access.js";
import { randomUUID } from "node:crypto";
import { normalizeTaskFilesInput, readTaskFile, MAX_TASK_FILE_DATAURL_CHARS } from "../lib/task-file-storage.js";
import { notifyTaskCreated, notifyTaskUpdated } from "../lib/task-notify.js";
import { triggerBlueprintsForTaskChange } from "../lib/blueprint/trigger-dispatch.js";

const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  done: z.boolean(),
});

const taskStatusSchema = z.enum(["new", "in_progress", "waiting", "deferred", "completed"]);
const taskPrioritySchema = z.enum(["low", "normal", "high"]);

function serializeTask(row: typeof tasks.$inferSelect) {
  const files = (row.files || []).map((f) => ({
    ...f,
    downloadUrl: f.storagePath ? `/api/tasks/${row.id}/files/${f.id}` : undefined,
  }));
  return {
    id: row.id,
    text: row.text,
    description: row.description ?? undefined,
    assignee: row.assignee ?? undefined,
    assigneeUserId: row.assigneeUserId ?? undefined,
    author: row.author ?? undefined,
    creatorUserId: row.creatorUserId ?? undefined,
    reviewerUserId: row.reviewerUserId ?? undefined,
    leadId: row.leadId,
    status: (row.status || "new") as TaskStatus,
    priority: (row.priority || "normal") as TaskPriority,
    dueAt: row.dueAt?.toISOString() ?? undefined,
    checklist: (row.checklist || []) as TaskChecklistItem[],
    statusSummary: row.statusSummary ?? undefined,
    requireSummary: row.requireSummary ?? false,
    watchers: (row.watchers || []) as string[],
    coExecutors: (row.coExecutors || []) as string[],
    tags: (row.tags || []) as string[],
    files: files as import("../db/schema.js").TaskFile[],
    comments: (row.comments || []) as TaskComment[],
    pinnedResult: row.pinnedResult ?? undefined,
    notifyParticipants: row.notifyParticipants ?? true,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? undefined,
  };
}

function applyStatusPatch(patch: { status?: TaskStatus; done?: boolean }) {
  const out: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.status !== undefined) {
    out.status = patch.status;
    out.done = patch.status === "completed";
    out.completedAt = patch.status === "completed" ? new Date() : null;
  } else if (patch.done !== undefined) {
    out.done = patch.done;
    out.status = patch.done ? "completed" : "new";
    out.completedAt = patch.done ? new Date() : null;
  }
  return out;
}

async function resolveAssigneeName(userId: string | null | undefined, fallback?: string) {
  if (!userId) return fallback;
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return p?.name || fallback;
}

function isParticipant(user: import("../db/schema.js").AuthUser, task: {
  assignee?: string | null;
  assigneeUserId?: string | null;
  coExecutors?: string[] | null;
  watchers?: string[] | null;
}) {
  if (task.assigneeUserId === user.id) return true;
  if (Array.isArray(task.coExecutors) && task.coExecutors.includes(user.id)) return true;
  if (Array.isArray(task.watchers) && task.watchers.includes(user.id)) return true;
  const name = user.profile?.name || user.login;
  return task.assignee === name;
}

export const taskRoutes = new Hono<AppEnv>();

taskRoutes.use("*", requireAuth, requirePermission("leads.read"));

taskRoutes.get("/", async (c) => {
  const user = c.get("user");
  const scope = await resolveLeadScope(user);
  const filter = c.req.query("filter");

  let rows: typeof tasks.$inferSelect[];
  if (scope.mode === "all") {
    rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  } else {
    const leadIds = await accessibleLeadIds(scope);
    const leadCond = leadIds.length
      ? inArray(tasks.leadId, leadIds)
      : eq(tasks.leadId, "00000000-0000-0000-0000-000000000000");

    const allRows = await db.select().from(tasks).where(
      or(leadCond, isNull(tasks.leadId)),
    ).orderBy(desc(tasks.createdAt));

    rows = [];
    for (const t of allRows) {
      if (await canAccessTask(user, t)) rows.push(t);
    }
  }

  const now = Date.now();
  let filtered = rows;
  if (filter === "mine") {
    filtered = rows.filter((t) => isParticipant(user, t));
  } else if (filter === "overdue") {
    filtered = rows.filter((t) => t.dueAt && !t.done && t.dueAt.getTime() < now);
  } else if (filter === "open") {
    filtered = rows.filter((t) => !t.done && t.status !== "completed");
  }

  filtered.sort((a, b) => {
    const aOver = a.dueAt && !a.done && a.dueAt.getTime() < now ? 0 : 1;
    const bOver = b.dueAt && !b.done && b.dueAt.getTime() < now ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const limit = Math.min(Math.max(Number(c.req.query("limit") || 200), 1), 500);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  return c.json({
    tasks: filtered.slice(offset, offset + limit).map(serializeTask),
    total: filtered.length,
    limit,
    offset,
  });
});

const taskFileInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128).optional(),
  dataUrl: z.string().max(MAX_TASK_FILE_DATAURL_CHARS).optional(),
  storagePath: z.string().max(512).optional(),
  createdAt: z.string(),
});

const createBodySchema = z.object({
  text: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  assigneeUserId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: z.string().datetime().optional().nullable(),
  checklist: z.array(checklistItemSchema).optional(),
  requireSummary: z.boolean().optional(),
  watchers: z.array(z.string().uuid()).optional(),
  coExecutors: z.array(z.string().uuid()).optional(),
  creatorUserId: z.string().uuid().optional().nullable(),
  reviewerUserId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  files: z.array(taskFileInputSchema).max(20).optional(),
  notifyParticipants: z.boolean().optional(),
});

taskRoutes.post("/", requirePermission("leads.write"), async (c) => {
  const user = c.get("user");
  const body = createBodySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  if (body.data.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, body.data.leadId)).limit(1);
    if (!lead || !(await canAccessLead(user, lead))) return c.json({ error: "Not found" }, 404);
  }

  const assigneeName = await resolveAssigneeName(
    body.data.assigneeUserId,
    body.data.assignee || user.profile?.name || user.login,
  );

  const taskId = randomUUID();
  const files = body.data.files?.length
    ? await normalizeTaskFilesInput(taskId, body.data.files)
    : [];

  const [task] = await db.insert(tasks).values({
    id: taskId,
    text: body.data.text,
    description: body.data.description,
    assignee: assigneeName,
    assigneeUserId: body.data.assigneeUserId || null,
    author: user.profile?.name || user.login,
    creatorUserId: user.id,
    leadId: body.data.leadId || null,
    status: body.data.status || "new",
    priority: body.data.priority || "normal",
    dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null,
    checklist: body.data.checklist || [],
    requireSummary: body.data.requireSummary ?? false,
    watchers: body.data.watchers || [],
    coExecutors: body.data.coExecutors || [],
    reviewerUserId: body.data.reviewerUserId || null,
    tags: body.data.tags || [],
    files,
    notifyParticipants: body.data.notifyParticipants ?? true,
    done: false,
  }).returning();

  void notifyTaskCreated(task, user.id);
  void triggerBlueprintsForTaskChange({
    taskId: task.id,
    before: null,
    after: task,
    isCreate: true,
    userId: user.id,
  }).catch(() => {});

  return c.json({ task: serializeTask(task) }, 201);
});

taskRoutes.patch("/:id", requirePermission("leads.write"), async (c) => {
  const user = c.get("user");
  const body = createBodySchema.partial().extend({
    statusSummary: z.string().optional().nullable(),
    done: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, c.req.param("id"))).limit(1);
  if (!existing || !(await canAccessTask(user, existing))) return c.json({ error: "Not found" }, 404);

  if (body.data.status === "completed" || body.data.done === true) {
    if (existing.requireSummary && !body.data.statusSummary && !existing.statusSummary) {
      return c.json({ error: "Добавьте статус-отчёт перед завершением задачи" }, 400);
    }
  }

  const reassigned = body.data.assigneeUserId !== undefined
    && body.data.assigneeUserId !== existing.assigneeUserId
    && body.data.assigneeUserId !== user.id;

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (body.data.text !== undefined) patch.text = body.data.text;
  if (body.data.description !== undefined) patch.description = body.data.description;
  if (body.data.leadId !== undefined) patch.leadId = body.data.leadId;
  if (body.data.priority !== undefined) patch.priority = body.data.priority;
  if (body.data.dueAt !== undefined) {
    patch.dueAt = body.data.dueAt ? new Date(body.data.dueAt) : null;
    patch.dueNotifiedAt = null;
  }
  if (body.data.checklist !== undefined) patch.checklist = body.data.checklist;
  if (body.data.statusSummary !== undefined) patch.statusSummary = body.data.statusSummary;
  if (body.data.requireSummary !== undefined) patch.requireSummary = body.data.requireSummary;
  if (body.data.watchers !== undefined) patch.watchers = body.data.watchers;
  if (body.data.coExecutors !== undefined) patch.coExecutors = body.data.coExecutors;
  if (body.data.creatorUserId !== undefined) patch.creatorUserId = body.data.creatorUserId;
  if (body.data.reviewerUserId !== undefined) patch.reviewerUserId = body.data.reviewerUserId;
  if (body.data.tags !== undefined) patch.tags = body.data.tags;
  if (body.data.files !== undefined) {
    patch.files = await normalizeTaskFilesInput(c.req.param("id"), body.data.files);
  }
  if (body.data.notifyParticipants !== undefined) patch.notifyParticipants = body.data.notifyParticipants;
  if (body.data.assigneeUserId !== undefined) {
    patch.assigneeUserId = body.data.assigneeUserId;
    patch.assignee = await resolveAssigneeName(body.data.assigneeUserId, body.data.assignee);
  } else if (body.data.assignee !== undefined) {
    patch.assignee = body.data.assignee;
  }
  Object.assign(patch, applyStatusPatch({ status: body.data.status, done: body.data.done }));

  const [task] = await db.update(tasks).set(patch).where(eq(tasks.id, c.req.param("id"))).returning();
  if (!task) return c.json({ error: "Not found" }, 404);

  const completed = task.status === "completed" || task.done;
  void notifyTaskUpdated(task, {
    actorUserId: user.id,
    reassigned,
    completed,
  });

  void triggerBlueprintsForTaskChange({
    taskId: task.id,
    before: existing,
    after: task,
    userId: user.id,
  }).catch(() => {});

  return c.json({ task: serializeTask(task) });
});

taskRoutes.delete("/:id", requirePermission("leads.write"), async (c) => {
  const user = c.get("user");
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, c.req.param("id"))).limit(1);
  if (!existing || !(await canAccessTask(user, existing))) return c.json({ error: "Not found" }, 404);
  await db.delete(tasks).where(eq(tasks.id, c.req.param("id")));
  return c.json({ ok: true });
});

taskRoutes.post("/:id/comments", requirePermission("leads.write"), async (c) => {
  const user = c.get("user");
  const body = z.object({ text: z.string().min(1).max(4000) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const taskId = c.req.param("id");
  const newComment: TaskComment = {
    id: crypto.randomUUID(),
    text: body.data.text.trim(),
    author: user.profile?.name || user.login,
    authorUserId: user.id,
    createdAt: new Date().toISOString(),
  };
  const [task] = await db.transaction(async (tx: typeof db) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing || !(await canAccessTask(user, existing))) return [null];
    const comments = [...(existing.comments || []), newComment];
    return tx.update(tasks).set({ comments, updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning();
  });
  if (!task) return c.json({ error: "Not found" }, 404);
  void notifyTaskUpdated(task, { actorUserId: user.id, comment: true });

  return c.json({ task: serializeTask(task), comment: newComment });
});

taskRoutes.post("/:id/pin-result", requirePermission("leads.write"), async (c) => {
  const user = c.get("user");
  const body = z.object({
    text: z.string().min(1).max(4000),
    commentId: z.string().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, c.req.param("id"))).limit(1);
  if (!existing || !(await canAccessTask(user, existing))) return c.json({ error: "Not found" }, 404);

  const watchers = (existing.watchers || []) as string[];
  if (!watchers.includes(user.id)) {
    return c.json({ error: "Закрепить результат может только наблюдатель" }, 403);
  }

  const pinnedResult = {
    text: body.data.text.trim(),
    commentId: body.data.commentId,
    agreedByUserId: user.id,
    agreedByName: user.profile?.name || user.login,
    agreedAt: new Date().toISOString(),
  };

  const [task] = await db.update(tasks).set({
    pinnedResult,
    statusSummary: body.data.text.trim(),
    updatedAt: new Date(),
  }).where(eq(tasks.id, c.req.param("id"))).returning();

  void notifyTaskUpdated(task, { actorUserId: user.id, pinned: true });

  return c.json({ task: serializeTask(task) });
});

taskRoutes.get("/:id/files/:fileId", requirePermission("leads.read"), async (c) => {
  const user = c.get("user");
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, c.req.param("id"))).limit(1);
  if (!existing || !(await canAccessTask(user, existing))) return c.json({ error: "Not found" }, 404);

  const fileId = c.req.param("fileId");
  const file = (existing.files || []).find((f: TaskFile) => f.id === fileId);
  if (!file?.storagePath) return c.json({ error: "Not found" }, 404);

  try {
    const { buf } = await readTaskFile(file.storagePath);
    return new Response(buf, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});
