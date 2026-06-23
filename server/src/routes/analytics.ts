import { Hono } from "hono";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { analyticsDashboards, stages } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";
import { buildDefaultDashboard, serializeDashboard } from "../lib/analytics-defaults.js";

const metricEnum = z.enum([
  "leads_total", "stage_count", "channels_connected",
  "deals_signed", "money_sum",
  "calls_total", "calls_inbound", "calls_outbound",
  "tasks_total", "tasks_open", "tasks_done",
]);

const operatorEnum = z.enum(["gte", "gt", "lte", "lt", "eq", "neq"]);

const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  metric: metricEnum,
  stageId: z.string().uuid().optional().nullable(),
  fieldId: z.string().uuid().optional().nullable(),
  operator: operatorEnum.optional(),
  target: z.number().min(0).max(1_000_000_000),
  sortOrder: z.number().int(),
});

const widgetSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("kpi"),
    label: z.string().min(1).max(80),
    metric: metricEnum,
    stageId: z.string().uuid().optional().nullable(),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("goal"),
    goalId: z.string().min(1),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("funnel"),
    stageIds: z.array(z.string().uuid()).optional(),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("recent"),
    limit: z.number().int().min(1).max(20).optional(),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
  }),
]);

const dashboardSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int(),
  widgets: z.array(widgetSchema),
  goals: z.array(goalSchema),
});

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.use("*", requireAuth);

async function ensureDefaultDashboards() {
  const existing = await db.select().from(analyticsDashboards).limit(1);
  if (existing.length) return;
  const stageRows = await db.select().from(stages).orderBy(asc(stages.sortOrder));
  const def = buildDefaultDashboard(stageRows);
  await db.insert(analyticsDashboards).values(def);
}

analyticsRoutes.get("/", requirePermission("analytics.view"), async (c) => {
  await ensureDefaultDashboards();
  const rows = await db.select().from(analyticsDashboards).orderBy(asc(analyticsDashboards.sortOrder));
  return c.json({ dashboards: rows.map(serializeDashboard) });
});

analyticsRoutes.put("/dashboards", requirePermission("analytics.manage"), async (c) => {
  const body = z.array(dashboardSchema).min(1).max(20).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input", details: body.error.flatten() }, 400);

  await db.delete(analyticsDashboards);
  const inserted = await db.insert(analyticsDashboards).values(
    body.data.map((d) => ({
      id: d.id,
      name: d.name,
      sortOrder: d.sortOrder,
      widgets: d.widgets,
      goals: d.goals,
      updatedAt: new Date(),
    })),
  ).returning();

  const user = c.get("user");
  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: "settings.change",
    entityType: "analytics",
    entityId: "dashboards",
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent"),
    meta: { count: inserted.length },
  });

  return c.json({ dashboards: inserted.map(serializeDashboard) });
});

analyticsRoutes.get("/funnel-ca", requirePermission("analytics.view"), async (c) => {
  const { computeFunnelCaMetric } = await import("../lib/sdr/funnel-ca.js");
  const metric = await computeFunnelCaMetric();
  if (!metric) return c.json({ error: "Funnel CA metric disabled" }, 404);
  return c.json({ metric });
});
