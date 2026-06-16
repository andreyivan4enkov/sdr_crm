import { Hono, type Context } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { stages, fields, channels, crmMeta, pipelines, leads } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";

async function auditSettings(c: Context<AppEnv>, section: string) {
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "settings.change",
    entityType: "settings", entityId: section,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { section },
  });
}

export const settingsRoutes = new Hono<AppEnv>();

const CARD_LAYOUT_KEY = "lead_card_layout";

const automationSchema = z.object({
  id: z.string(),
  type: z.enum(["reply", "task", "notify", "move", "copy", "assign", "field"]),
  channelId: z.string().optional().nullable(),
  author: z.string().optional(),
  recipient: z.string().optional(),
  text: z.string().optional(),
  targetStageId: z.string().uuid().optional().nullable(),
  targetPipelineId: z.string().uuid().optional().nullable(),
  assignUserId: z.string().uuid().optional().nullable(),
  fieldKey: z.string().optional().nullable(),
  fieldValue: z.string().optional().nullable(),
});

const gridCellSchema = z.object({
  gridCol: z.number().int().min(0).max(3),
  gridRow: z.number().int().min(0),
  gridSpan: z.number().int().min(1).max(4),
});

settingsRoutes.use("*", requireAuth);

async function loadCardLayout() {
  try {
    const [row] = await db.select().from(crmMeta).where(eq(crmMeta.key, CARD_LAYOUT_KEY)).limit(1);
    return (row?.value || {}) as Record<string, { gridCol: number; gridRow: number; gridSpan: number }>;
  } catch {
    return {};
  }
}

settingsRoutes.get("/", requirePermission("leads.read"), async (c) => {
  const [allPipelines, allStages, allFields, allChannels, cardLayout] = await Promise.all([
    db.select().from(pipelines).orderBy(pipelines.sortOrder),
    db.select().from(stages).orderBy(stages.sortOrder),
    db.select().from(fields).orderBy(fields.sortOrder),
    db.select().from(channels),
    loadCardLayout(),
  ]);
  return c.json({
    pipelines: allPipelines,
    stages: allStages,
    fields: allFields,
    channels: allChannels,
    cardLayout,
  });
});

settingsRoutes.patch("/pipelines", requirePermission("stages.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    sortOrder: z.number().int(),
    isDefault: z.boolean().optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const incoming = body.data;
  if (incoming.length === 0) return c.json({ error: "At least one pipeline required" }, 400);
  const defaultCount = incoming.filter((p) => p.isDefault).length;
  if (defaultCount !== 1) {
    return c.json({ error: "Exactly one pipeline must be default" }, 400);
  }

  const existing: (typeof pipelines.$inferSelect)[] = await db.select().from(pipelines);
  const incomingIds = new Set(incoming.filter((p) => p.id).map((p) => p.id!));
  const toDelete = existing.filter((row) => !incomingIds.has(row.id));

  for (const p of toDelete) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads).where(eq(leads.pipelineId, p.id));
    if (count > 0) {
      return c.json({ error: `Воронка «${p.name}» содержит сделки — удаление невозможно` }, 400);
    }
    await db.delete(pipelines).where(eq(pipelines.id, p.id));
  }

  const upserted = [];
  for (const [i, p] of incoming.entries()) {
    if (p.id && existing.some((row) => row.id === p.id)) {
      const [row] = await db.update(pipelines).set({
        name: p.name,
        sortOrder: p.sortOrder ?? i,
        isDefault: p.isDefault ?? false,
      }).where(eq(pipelines.id, p.id)).returning();
      upserted.push(row);
    } else {
      const [row] = await db.insert(pipelines).values({
        id: p.id,
        name: p.name,
        sortOrder: p.sortOrder ?? i,
        isDefault: p.isDefault ?? false,
      }).returning();
      upserted.push(row);
      const defaultStage = { label: "Новый лид", color: "sky", sortOrder: 0, automations: [] as const };
      await db.insert(stages).values({
        pipelineId: row.id,
        label: defaultStage.label,
        color: defaultStage.color,
        sortOrder: defaultStage.sortOrder,
        automations: [],
      });
    }
  }

  await auditSettings(c, "pipelines");
  const all = await db.select().from(pipelines).orderBy(pipelines.sortOrder);
  return c.json({ pipelines: all });
});

settingsRoutes.patch("/stages", requirePermission("stages.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().uuid().optional(),
    pipelineId: z.string().uuid(),
    label: z.string(),
    color: z.string(),
    sortOrder: z.number(),
    automations: z.array(automationSchema).optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const pipelineIds = [...new Set(body.data.map((s) => s.pipelineId))];
  for (const pid of pipelineIds) {
    await db.delete(stages).where(eq(stages.pipelineId, pid));
  }

  const inserted = await db.insert(stages).values(
    body.data.map((s, i) => ({
      id: s.id,
      pipelineId: s.pipelineId,
      label: s.label,
      color: s.color,
      sortOrder: s.sortOrder ?? i,
      automations: (s.automations || []).map((a) => ({
        ...a,
        channelId: a.channelId ?? undefined,
        targetStageId: a.targetStageId ?? undefined,
        targetPipelineId: a.targetPipelineId ?? undefined,
        assignUserId: a.assignUserId ?? undefined,
        fieldKey: a.fieldKey ?? undefined,
        fieldValue: a.fieldValue ?? undefined,
      })),
    })),
  ).returning();

  await auditSettings(c, "stages");
  return c.json({ stages: inserted });
});

settingsRoutes.patch("/fields", requirePermission("fields.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().uuid().optional(),
    label: z.string(),
    type: z.string(),
    sortOrder: z.number().optional(),
    gridCol: z.number().int().min(0).max(3).optional(),
    gridRow: z.number().int().min(0).optional(),
    gridSpan: z.number().int().min(1).max(4).optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  await db.delete(fields);
  const inserted = await db.insert(fields).values(
    body.data.map((f, i) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      sortOrder: f.sortOrder ?? i,
      gridCol: f.gridCol ?? 0,
      gridRow: f.gridRow ?? i + 2,
      gridSpan: f.gridSpan ?? 2,
    })),
  ).returning();

  await auditSettings(c, "fields");
  return c.json({ fields: inserted });
});

settingsRoutes.patch("/card-layout", requirePermission("fields.manage"), async (c) => {
  const body = z.record(gridCellSchema).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  await db.delete(crmMeta).where(eq(crmMeta.key, CARD_LAYOUT_KEY));
  await db.insert(crmMeta).values({ key: CARD_LAYOUT_KEY, value: body.data });

  await auditSettings(c, "card_layout");
  return c.json({ cardLayout: body.data });
});

settingsRoutes.patch("/channels", requirePermission("channels.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().uuid(),
    connected: z.boolean().optional(),
    name: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  for (const ch of body.data) {
    const patch: Record<string, unknown> = {};
    if (ch.connected !== undefined) patch.connected = ch.connected;
    if (ch.name) patch.name = ch.name;
    if (ch.config) patch.config = ch.config;
    if (Object.keys(patch).length) {
      await db.update(channels).set(patch).where(eq(channels.id, ch.id));
    }
  }

  const all = await db.select().from(channels);
  await auditSettings(c, "channels");
  return c.json({ channels: all });
});
