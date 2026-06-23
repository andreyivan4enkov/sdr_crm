import { Hono, type Context } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { stages, fields, channels, crmMeta, pipelines, leads } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";
import { hasAnyPermission } from "../lib/permissions.js";
import { serializeFieldRow } from "../lib/crm-fields/service.js";
import { AI_PROVIDER_GUIDES } from "../lib/aiboard/ai-provider-guides.js";
import { INTEGRATION_MODEL_PRESETS, modelsForProvider } from "../lib/aiboard/integration-models.js";
import { loadAiConfigView, saveAiConfig } from "../lib/ai-config.js";
import { AI_PROVIDER_PRESETS } from "../lib/aiboard/ai-providers.js";
import { testAnalystAiConnection, fetchLocalModels } from "../lib/aiboard/ai-analyst.js";
import { isLocalProvider, resolveLocalBaseUrl } from "../lib/aiboard/local-ai.js";
import { readAiConfig } from "../lib/ai-config.js";
import { loadCardLayout, loadHiddenCardFields, loadLeadCardBlocks, saveLeadCardBlocks } from "../lib/crm-setup/service.js";

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

settingsRoutes.get("/", requirePermission("leads.read"), async (c) => {
  const [allPipelines, allStages, allFields, allChannels, cardLayout, hiddenSet, leadCardBlocks] = await Promise.all([
    db.select().from(pipelines).orderBy(pipelines.sortOrder),
    db.select().from(stages).orderBy(stages.sortOrder),
    db.select().from(fields).orderBy(fields.sortOrder),
    db.select().from(channels),
    loadCardLayout(),
    loadHiddenCardFields(),
    loadLeadCardBlocks(),
  ]);
  return c.json({
    pipelines: allPipelines,
    stages: allStages,
    fields: allFields.map(serializeFieldRow),
    channels: allChannels,
    cardLayout,
    hiddenCardFields: [...hiddenSet],
    leadCardBlocks,
  });
});

settingsRoutes.patch("/pipelines", requirePermission("stages.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    sortOrder: z.number().int(),
    isDefault: z.boolean().optional(),
    pipelineType: z.enum(["sales", "process", "subprocess"]).optional(),
    parentPipelineId: z.string().uuid().optional().nullable(),
    parentStageId: z.string().uuid().optional().nullable(),
    description: z.string().max(500).optional().nullable(),
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

  try {
    await db.transaction(async (tx: typeof db) => {
      for (const p of toDelete) {
        const deleted = await tx.delete(pipelines).where(and(
          eq(pipelines.id, p.id),
          sql`NOT EXISTS (SELECT 1 FROM ${leads} WHERE ${leads.pipelineId} = ${p.id})`,
        )).returning({ id: pipelines.id });
        if (!deleted.length) {
          throw new Error(`PIPELINE_HAS_LEADS:${p.name}`);
        }
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("PIPELINE_HAS_LEADS:")) {
      return c.json({ error: `Воронка «${msg.split(":")[1]}» содержит сделки — удаление невозможно` }, 400);
    }
    throw e;
  }

  const upserted = [];
  for (const [i, p] of incoming.entries()) {
    if (p.id && existing.some((row) => row.id === p.id)) {
      const [row] = await db.update(pipelines).set({
        name: p.name,
        sortOrder: p.sortOrder ?? i,
        isDefault: p.isDefault ?? false,
        pipelineType: p.pipelineType ?? "sales",
        parentPipelineId: p.parentPipelineId ?? null,
        parentStageId: p.parentStageId ?? null,
        description: p.description ?? null,
        updatedAt: new Date(),
      }).where(eq(pipelines.id, p.id)).returning();
      upserted.push(row);
    } else {
      const [row] = await db.insert(pipelines).values({
        id: p.id,
        name: p.name,
        sortOrder: p.sortOrder ?? i,
        isDefault: p.isDefault ?? false,
        pipelineType: p.pipelineType ?? "sales",
        parentPipelineId: p.parentPipelineId ?? null,
        parentStageId: p.parentStageId ?? null,
        description: p.description ?? null,
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
  const inserted = await db.transaction(async (tx: typeof db) => {
    for (const pid of pipelineIds) {
      await tx.delete(stages).where(eq(stages.pipelineId, pid));
    }
    return tx.insert(stages).values(
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
  });

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
    entityTypes: z.array(z.enum(["lead", "asset", "resource"])).optional(),
    meta: z.record(z.unknown()).optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  if (body.data.length === 0) {
    return c.json({ error: "Нельзя удалить все поля — передайте хотя бы одно" }, 400);
  }

  const inserted = await db.transaction(async (tx: typeof db) => {
    await tx.delete(fields);
    return tx.insert(fields).values(
      body.data.map((f, i) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        sortOrder: f.sortOrder ?? i,
        gridCol: f.gridCol ?? 0,
        gridRow: f.gridRow ?? i + 2,
        gridSpan: f.gridSpan ?? 2,
        entityTypes: f.entityTypes ?? ["lead"],
        meta: f.meta ?? {},
      })),
    ).returning();
  });

  await auditSettings(c, "fields");
  return c.json({ fields: inserted.map(serializeFieldRow) });
});

settingsRoutes.patch("/card-layout", requirePermission("fields.manage"), async (c) => {
  const body = z.record(gridCellSchema).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  await db.delete(crmMeta).where(eq(crmMeta.key, CARD_LAYOUT_KEY));
  await db.insert(crmMeta).values({ key: CARD_LAYOUT_KEY, value: body.data });

  await auditSettings(c, "card_layout");
  return c.json({ cardLayout: body.data });
});

settingsRoutes.patch("/lead-card-blocks", requirePermission("fields.manage"), async (c) => {
  const body = z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["tasks", "edo", "legal", "deal", "calls", "mail", "notes", "custom"]),
    column: z.enum(["main", "sidebar"]),
    title: z.string().max(120).optional(),
    moduleLink: z.string().max(200).optional(),
    code: z.string().max(8000).optional(),
  })).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  await saveLeadCardBlocks(body.data);
  await auditSettings(c, "lead_card_blocks");
  return c.json({ leadCardBlocks: body.data });
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
      await db.update(channels).set({ ...patch, updatedAt: new Date() }).where(eq(channels.id, ch.id));
    }
  }

  const all = await db.select().from(channels);
  await auditSettings(c, "channels");
  return c.json({ channels: all });
});

const aiModelProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  providerId: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  folderId: z.string().optional(),
  apiKey: z.string().optional(),
});

const aiModuleSchema = z.object({
  enabled: z.boolean().optional(),
  modelIds: z.array(z.string()).optional(),
  model: z.string().optional(),
  whisperModel: z.string().optional(),
  autoTranscribe: z.boolean().optional(),
  autoFillLead: z.boolean().optional(),
  providerId: z.string().optional(),
  baseUrl: z.string().optional(),
  folderId: z.string().optional(),
  apiKey: z.string().optional(),
  attachTo: z.array(z.enum(["analytics", "aggregation", "calls", "leads", "blueprint", "site"])).optional(),
  showScopes: z.array(z.enum([
    "crm_leads", "crm_pipelines", "crm_fields", "crm_tasks",
    "site_blocks", "site_theme", "site_entities",
    "analytics", "aggregation_graph", "blueprint_graph",
  ])).optional(),
  maxTokensPerRequest: z.number().int().min(32).max(128_000).optional(),
  dailyRequestLimit: z.number().int().min(0).optional(),
  monthlyTokenBudget: z.number().int().min(0).optional(),
});

const aiConfigSchema = z.object({
  enabled: z.boolean().optional(),
  providerId: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  folderId: z.string().optional(),
  models: z.array(aiModelProfileSchema).optional(),
  modules: z.object({
    analytics: aiModuleSchema.optional(),
    aggregation: aiModuleSchema.optional(),
    calls: aiModuleSchema.optional(),
    leads: aiModuleSchema.optional(),
    blueprint: aiModuleSchema.optional(),
    site: aiModuleSchema.optional(),
  }).optional(),
});

function canManageAi(user: { permissions: string[] }) {
  return hasAnyPermission(user.permissions, ["settings.manage", "integrations.manage", "analytics.manage"]);
}

settingsRoutes.get("/ai", requireAuth, async (c) => {
  const user = c.get("user");
  if (!canManageAi(user)) return c.json({ error: "Forbidden" }, 403);
  const config = await loadAiConfigView();
  return c.json({
    config,
    providers: AI_PROVIDER_PRESETS,
    guides: AI_PROVIDER_GUIDES,
    integrationModels: INTEGRATION_MODEL_PRESETS,
  });
});

settingsRoutes.put("/ai", requireAuth, async (c) => {
  const user = c.get("user");
  if (!canManageAi(user)) return c.json({ error: "Forbidden" }, 403);
  const body = aiConfigSchema.parse(await c.req.json());
  const config = await saveAiConfig(body);
  await auditSettings(c, "ai");
  return c.json({ ok: true, config });
});

settingsRoutes.get("/ai/models", requireAuth, async (c) => {
  const user = c.get("user");
  if (!canManageAi(user)) return c.json({ error: "Forbidden" }, 403);
  const providerId = c.req.query("providerId") || "ollama";
  const baseUrl = c.req.query("baseUrl") || "";
  const storedView = await loadAiConfigView();
  const stored = await readAiConfig();
  const url = resolveLocalBaseUrl(providerId, baseUrl || storedView.baseUrl);
  if (providerId === "yandex" || providerId === "yandex_lite" || providerId === "sber_gigachat") {
    const list = modelsForProvider(providerId).map((m) => m.model);
    return c.json({
      ok: true,
      local: false,
      models: list,
      message: list.length ? `${list.length} моделей в каталоге интеграций` : "Нет моделей",
    });
  }
  if (!isLocalProvider(providerId, url)) {
    return c.json({ ok: false, local: false, models: [], message: "Список моделей доступен только для локальных провайдеров (Ollama, LM Studio, localhost)" });
  }
  const apiKey = String(stored.apiKey || "").trim() || "ollama";
  const result = await fetchLocalModels(providerId, url, apiKey);
  return c.json({ ...result, local: true });
});

settingsRoutes.post("/ai/test", requireAuth, async (c) => {
  const user = c.get("user");
  if (!canManageAi(user)) return c.json({ error: "Forbidden" }, 403);
  const body = aiConfigSchema.partial().parse(await c.req.json().catch(() => ({})));
  const result = await testAnalystAiConnection(body);
  return c.json(result);
});

settingsRoutes.get("/ai/usage", requireAuth, async (c) => {
  const user = c.get("user");
  const module = (c.req.query("module") || "analytics") as import("../lib/ai-config.js").AiModuleId;
  const { getUsageSummary } = await import("../lib/ai/usage-ledger.js");
  const summary = await getUsageSummary(user.id, module);
  return c.json(summary);
});

const pipelineAiSchema = z.object({
  message: z.string().min(1).max(4000),
  pipelines: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    sortOrder: z.number().optional(),
    isDefault: z.boolean().optional(),
    pipelineType: z.enum(["sales", "process", "subprocess"]).optional(),
    parentPipelineId: z.string().uuid().nullable().optional(),
    parentStageId: z.string().uuid().nullable().optional(),
  })),
  stages: z.array(z.object({
    id: z.string().uuid(),
    pipelineId: z.string().uuid(),
    label: z.string(),
    color: z.string(),
    sortOrder: z.number().optional(),
  })),
});

settingsRoutes.post("/pipelines/ai", requirePermission("stages.manage"), async (c) => {
  const body = pipelineAiSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input", details: body.error.flatten() }, 400);
  const user = c.get("user");
  try {
    const { pipelineAi } = await import("../lib/pipeline/pipeline-ai.js");
    const result = await pipelineAi({
      message: body.data.message,
      pipelines: body.data.pipelines,
      stages: body.data.stages,
      userId: user.id,
      ip: getClientIp(c),
    });
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI error" }, 502);
  }
});
