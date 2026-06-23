import { Hono, type Context } from "hono";
import { eq, desc, sql, like, or, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { leads, leadNotes, stages, channels, dealManagers, tasks, auditLog, profiles, pipelines } from "../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../middleware/auth.js";
import { listFieldsForEntity, validateRequiredFields, filterFieldsForContext } from "../lib/crm-fields/service.js";
import { triggerBlueprintsForLeadChange } from "../lib/blueprint/trigger-dispatch.js";
import { broadcastToAll } from "../lib/events.js";
import { dispatchNotification } from "../lib/notify.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";
import { buildLeadExport, eraseLeadPersonalData, revokeLeadConsent } from "../lib/lead-pd.js";
import { canAccessLead, canEditLead, leadScopeWhere, resolveLeadScope, resolveAssigneeFromDealManager, resolveAssigneeFromUser, sanitizeLeadPatchForUser } from "../lib/lead-access.js";
import { formatLeadHistoryEntry, summarizeLeadPatch } from "../lib/lead-history.js";
import { formatPhoneDisplay, isValidRuPhone } from "../lib/lead-phone.js";
import { sdrConfig } from "../lib/sdr/config.js";
import { leadSdrIndex, indexLeadAfterWrite } from "../lib/sdr/lead-index.js";
import { leadFptmScoring } from "../lib/sdr/fptm-scoring.js";
import { leadSdrGraph } from "../lib/sdr/lead-graph.js";
import { remapLegacyLeadInput, withLegacyLeadFields } from "../lib/api-legacy-fields.js";

const LEAD_HISTORY_HIDDEN = new Set(["lead.read", "lead.list"]);

async function leadAuditContext(): Promise<{ stages: Map<string, string>; users: Map<string, string> }> {
  const [stageRows, profileRows] = await Promise.all([
    db.select({ id: stages.id, label: stages.label }).from(stages),
    db.select({ userId: profiles.userId, name: profiles.name }).from(profiles),
  ]);
  return {
    stages: new Map(stageRows.map((s: { id: string; label: string }) => [s.id, s.label])),
    users: new Map(profileRows.map((p: { userId: string; name: string }) => [p.userId, p.name])),
  };
}

export const leadRoutes = new Hono<AppEnv>();

leadRoutes.use("*", requireAuth);

async function leadWithNotes(id: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return null;
  const notes = await db.select().from(leadNotes).where(eq(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt));
  return { ...lead, notes };
}

async function loadLeadForUser(c: Context<AppEnv>, id: string) {
  const [existing] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!existing) return { error: c.json({ error: "Not found" }, 404) as Response };
  const user = c.get("user");
  if (!(await canAccessLead(user, existing))) {
    return { error: c.json({ error: "Not found" }, 404) as Response };
  }
  return { lead: existing };
}

leadRoutes.get("/", requirePermission("leads.read"), async (c) => {
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  const offset = (page - 1) * limit;
  const search = c.req.query("search");
  const user = c.get("user");
  const scope = await resolveLeadScope(user);

  let rows: (typeof leads.$inferSelect)[] = [];
  let total = 0;
  let searchMode: "classic" | "sdr" | "sdr_fallback" = "classic";

  if (sdrConfig.search && search?.trim() && leadSdrIndex.isReady()) {
    const recalledIds = leadSdrIndex.search(search.trim());
    if (recalledIds.length) {
      searchMode = "sdr";
      const idOrder = new Map(recalledIds.map((id, i) => [id, i]));
      const searchCond = inArray(leads.id, recalledIds);
      const whereCond = leadScopeWhere(scope, searchCond);
      const matched = whereCond
        ? await db.select().from(leads).where(whereCond)
        : await db.select().from(leads).where(searchCond);
      matched.sort((a: typeof leads.$inferSelect, b: typeof leads.$inferSelect) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    }
  }

  if (!rows.length && search?.trim()) {
    if (searchMode === "sdr") searchMode = "sdr_fallback";
    const searchCond = or(like(leads.name, `%${search}%`), like(leads.phone, `%${search}%`));
    const whereCond = leadScopeWhere(scope, searchCond);
    rows = whereCond
      ? await db.select().from(leads).where(whereCond).orderBy(desc(leads.createdAt)).limit(limit).offset(offset)
      : await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit).offset(offset);
    const [countRow] = whereCond
      ? await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(whereCond)
      : await db.select({ count: sql<number>`count(*)::int` }).from(leads);
    total = countRow?.count ?? 0;
  } else if (!search?.trim()) {
    const whereCond = leadScopeWhere(scope, undefined);
    rows = whereCond
      ? await db.select().from(leads).where(whereCond).orderBy(desc(leads.createdAt)).limit(limit).offset(offset)
      : await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit).offset(offset);
    const [countRow] = whereCond
      ? await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(whereCond)
      : await db.select({ count: sql<number>`count(*)::int` }).from(leads);
    total = countRow?.count ?? 0;
  }

  const allNotes = rows.length
    ? await db.select().from(leadNotes).where(inArray(leadNotes.leadId, rows.map((r: typeof leads.$inferSelect) => r.id)))
    : [];

  const notesByLead = new Map<string, typeof allNotes>();
  for (const n of allNotes) {
    const arr = notesByLead.get(n.leadId) || [];
    arr.push(n);
    notesByLead.set(n.leadId, arr);
  }

  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.list",
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { page, limit, count: rows.length, searchMode },
  });

  return c.json({
    leads: rows.map((l: typeof leads.$inferSelect) =>
      withLegacyLeadFields({ ...l, notes: notesByLead.get(l.id) || [] }),
    ),
    total,
    page,
    limit,
  });
});

leadRoutes.get("/:id/export", requirePermission("leads.export"), async (c) => {
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const data = await buildLeadExport(id);
  if (!data) return c.json({ error: "Not found" }, 404);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.export",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });

  c.header("Content-Disposition", `attachment; filename="lead-${id.slice(0, 8)}.json"`);
  return c.json(data);
});

leadRoutes.get("/:id/history", requirePermission("leads.read"), async (c) => {
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const lead = access.lead;

  const rows = await db.select().from(auditLog)
    .where(and(eq(auditLog.entityType, "lead"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  const userIds = [...new Set(rows.map((r: typeof auditLog.$inferSelect) => r.userId).filter(Boolean))] as string[];
  const profileRows = userIds.length
    ? await db.select({ userId: profiles.userId, name: profiles.name }).from(profiles).where(inArray(profiles.userId, userIds))
    : [];
  const nameByUser = new Map<string, string>(profileRows.map((p: { userId: string; name: string }) => [p.userId, p.name]));

  const events = rows
    .filter((r: typeof auditLog.$inferSelect) => !LEAD_HISTORY_HIDDEN.has(r.action))
    .map((r: typeof auditLog.$inferSelect) => formatLeadHistoryEntry({
      action: r.action,
      userLogin: r.userLogin,
      userName: r.userId ? nameByUser.get(r.userId) ?? null : null,
      createdAt: r.createdAt,
      meta: (r.meta || {}) as Record<string, unknown>,
    }));

  if (!rows.some((r: typeof auditLog.$inferSelect) => r.action === "lead.create")) {
    events.push({
      action: "lead.create",
      label: "Создана сделка",
      actor: lead.createdBy || "Система",
      userLogin: null,
      at: lead.createdAt.toISOString(),
      details: [],
    });
  }

  events.sort((a: { at: string }, b: { at: string }) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return c.json({
    createdAt: lead.createdAt.toISOString(),
    createdBy: lead.createdBy,
    updatedAt: lead.updatedAt.toISOString(),
    events,
  });
});

leadRoutes.get("/:id/graph", requirePermission("leads.read"), async (c) => {
  if (!sdrConfig.graph || !leadSdrGraph.isReady()) {
    return c.json({ error: "Lead graph disabled" }, 404);
  }
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const hops = Math.min(5, Math.max(1, Number(c.req.query("hops") || 2)));
  const nodes = leadSdrGraph.multiHop(id, hops);
  return c.json({ leadId: id, hops, nodes });
});

leadRoutes.get("/:id/score", requirePermission("leads.read"), async (c) => {
  if (!sdrConfig.scoring || !leadFptmScoring.isReady()) {
    return c.json({ error: "Lead scoring disabled" }, 404);
  }
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const prediction = leadFptmScoring.predict(access.lead);
  if (!prediction) return c.json({ error: "No prediction" }, 404);
  return c.json({ prediction });
});

leadRoutes.get("/:id", requirePermission("leads.read"), async (c) => {
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const lead = await leadWithNotes(id);
  if (!lead) return c.json({ error: "Not found" }, 404);
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.read",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ lead: withLegacyLeadFields(lead) });
});

const leadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).refine((p) => isValidRuPhone(p), { message: "Телефон: +7 (XXX) XXX-XX-XX" }),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  region: z.string().optional(),
  preferredTime: z.string().optional(),
  comment: z.string().optional(),
  source: z.string().optional(),
  channelId: z.string().uuid().optional().nullable(),
  statusId: z.string().uuid().optional(),
  assignedDealManagerId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  watchers: z.array(z.string().uuid()).optional(),
  custom: z.record(z.string()).optional(),
  createdBy: z.string().optional(),
  pdConsent: z.boolean().optional(),
});

const leadPatchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  region: z.string().optional(),
  preferredTime: z.string().optional(),
  comment: z.string().optional(),
  source: z.string().optional(),
  channelId: z.string().uuid().optional().nullable(),
  statusId: z.string().uuid().optional(),
  assignedDealManagerId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  watchers: z.array(z.string().uuid()).optional(),
  custom: z.record(z.string()).optional(),
  pdConsent: z.boolean().optional(),
});

function normalizeLeadPhonePatch(phone: string | undefined) {
  if (phone === undefined) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (!isValidRuPhone(trimmed)) return { error: "Телефон в формате +7 (XXX) XXX-XX-XX" as const };
  return formatPhoneDisplay(trimmed);
}

leadRoutes.post("/", requirePermission("leads.write"), async (c) => {
  const body = leadSchema.safeParse(remapLegacyLeadInput(await c.req.json()));
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const user = c.get("user");
  const [defaultPipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  const [firstStage] = defaultPipeline
    ? await db.select().from(stages).where(eq(stages.pipelineId, defaultPipeline.id)).orderBy(stages.sortOrder).limit(1)
    : await db.select().from(stages).orderBy(stages.sortOrder).limit(1);
  if (!firstStage) return c.json({ error: "No stages configured" }, 500);

  const data = body.data;
  const statusId = data.statusId || firstStage.id;
  const [stageRow] = await db.select().from(stages).where(eq(stages.id, statusId)).limit(1);
  const consentNow = data.pdConsent ? new Date() : undefined;
  const [lead] = await db.insert(leads).values({
    name: data.name,
    phone: formatPhoneDisplay(data.phone),
    email: data.email,
    region: data.region,
    preferredTime: data.preferredTime,
    comment: data.comment,
    source: data.source || "form",
    channelId: data.channelId || null,
    pipelineId: stageRow?.pipelineId ?? firstStage.pipelineId,
    statusId,
    assignedDealManagerId: data.assignedDealManagerId || null,
    custom: data.custom || {},
    createdBy: data.createdBy || user.profile?.name || user.login,
    pdConsent: data.pdConsent ?? false,
    pdConsentAt: consentNow,
  }).returning();

  const stage = stageRow || firstStage;
  void triggerBlueprintsForLeadChange({
    leadId: lead.id,
    before: null,
    after: lead,
    isCreate: true,
    userId: user.id,
  }).catch(() => {});

  const full = await leadWithNotes(lead.id);
  void indexLeadAfterWrite({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    region: lead.region,
    comment: lead.comment,
  });
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.create",
    entityType: "lead", entityId: lead.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  broadcastToAll("lead_created", { lead: full });
  await dispatchNotification({
    kind: "newLead",
    text: `Новая заявка: ${full?.name || "Без имени"}`,
    leadId: lead.id,
    event: "notification",
  });
  return c.json({ lead: withLegacyLeadFields(full!) }, 201);
});

leadRoutes.patch("/:id", requirePermission("leads.write"), async (c) => {
  const body = leadPatchSchema.safeParse(remapLegacyLeadInput(await c.req.json()));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message || "Invalid input" }, 400);

  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  const existing = access.lead;
  const user = c.get("user");

  if (!(await canEditLead(user, existing))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const patch = sanitizeLeadPatchForUser(user, { ...body.data } as Record<string, unknown>);
  delete patch.createdAt;
  delete patch.updatedAt;

  if (patch.phone !== undefined) {
    const normalized = normalizeLeadPhonePatch(String(patch.phone ?? ""));
    if (normalized && typeof normalized === "object" && "error" in normalized) {
      return c.json({ error: normalized.error }, 400);
    }
    patch.phone = normalized ?? null;
  }
  if (patch.email === "") patch.email = null;

  if (patch.assignedUserId !== undefined) {
    Object.assign(patch, await resolveAssigneeFromUser(patch.assignedUserId as string | null));
  } else if (patch.assignedDealManagerId !== undefined) {
    Object.assign(patch, await resolveAssigneeFromDealManager(patch.assignedDealManagerId as string | null));
  }

  const assignedUserId = (patch.assignedUserId ?? existing.assignedUserId) as string | null | undefined;
  if (patch.watchers !== undefined && assignedUserId) {
    patch.watchers = (patch.watchers as string[]).filter((w) => w !== assignedUserId);
  }

  const newStatusId = patch.statusId as string | undefined;
  const stageChanged = Boolean(newStatusId && newStatusId !== existing.statusId);

  if (stageChanged && newStatusId) {
    const allFields = await listFieldsForEntity("lead");
    const pipelineId = (patch.pipelineId ?? existing.pipelineId) as string;
    const filtered = filterFieldsForContext(allFields, "lead", { pipelineId });
    const custom = {
      ...(existing.custom as Record<string, unknown> ?? {}),
      ...(patch.custom as Record<string, unknown> ?? {}),
    };
    const missing = validateRequiredFields(filtered, custom, { stageId: newStatusId });
    if (missing.length) {
      return c.json({ error: `Обязательные поля: ${missing.join(", ")}` }, 400);
    }
  }

  await db.update(leads).set({ ...patch, updatedAt: new Date() }).where(eq(leads.id, id));
  const full = await leadWithNotes(id);

  if (full) {
    void triggerBlueprintsForLeadChange({
      leadId: id,
      before: existing,
      after: full,
      userId: user.id,
    }).catch(() => {});
  }
  let sdrPrediction = null;
  if (full) {
    void indexLeadAfterWrite({
      id: full.id,
      name: full.name,
      phone: full.phone,
      email: full.email,
      region: full.region,
      comment: full.comment,
    });
    if (stageChanged && newStatusId) {
      sdrPrediction = leadFptmScoring.recordTransition(full, existing.statusId!, newStatusId);
    }
  }
  const auditCtx = await leadAuditContext();
  const changes = summarizeLeadPatch(patch, existing, auditCtx);
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.update",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: {
      ...(changes.length ? { changes } : {}),
      ...(sdrPrediction ? { sdrStagePrediction: sdrPrediction } : {}),
    },
  });
  broadcastToAll("lead_updated", { lead: full });
  return c.json({ lead: withLegacyLeadFields(full!) });
});

leadRoutes.post("/:id/revoke-consent", requirePermission("leads.erase"), async (c) => {
  const id = c.req.param("id");
  const body = z.object({ erase: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;

  await revokeLeadConsent(id, body.success && body.data.erase);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.consent_revoke",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { erase: body.success ? body.data.erase : false },
  });

  return c.json({ ok: true, message: body.success && body.data.erase
    ? "Согласие отозвано, данные обезличены"
    : "Согласие отозвано" });
});

leadRoutes.post("/:id/erase", requirePermission("leads.erase"), async (c) => {
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;

  await eraseLeadPersonalData(id);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.erase",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { reason: "152-FZ erasure" },
  });

  return c.json({ ok: true, message: "Персональные данные лида обезличены" });
});

leadRoutes.delete("/:id", requirePermission("leads.delete"), async (c) => {
  const id = c.req.param("id");
  const access = await loadLeadForUser(c, id);
  if ("error" in access) return access.error;
  await db.delete(leads).where(eq(leads.id, id));
  void leadSdrIndex.remove(id);
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.delete",
    entityType: "lead", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  broadcastToAll("lead_deleted", { id });
  return c.json({ ok: true });
});

leadRoutes.post("/:id/notes", requirePermission("leads.read"), async (c) => {
  const body = z.object({ text: z.string().min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const user = c.get("user");
  const leadId = c.req.param("id");
  const access = await loadLeadForUser(c, leadId);
  if ("error" in access) return access.error;
  if (!(await canEditLead(user, access.lead))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const [note] = await db.insert(leadNotes).values({
    leadId,
    text: body.data.text,
    author: user.profile?.name || user.login,
  }).returning();

  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "lead.note",
    entityType: "lead", entityId: leadId,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { text: body.data.text.slice(0, 500) },
  });
  return c.json({ note }, 201);
});
