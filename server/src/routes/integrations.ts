import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { integrations, channels, type Integration } from "../db/schema.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";
import {
  beelineDoCall, beelineGetSubscription, beelineRecordingAuthHeader, beelineSubscribe, beelineUnsubscribe,
} from "../telephony/beeline-api.js";
import { getPublicBaseUrl, integrationEndpoints, maskSecret, telephonyWebhookUrl, webhookUrlWithSecret } from "../lib/integration-meta.js";
import {
  isMarketingType, marketingWebhookUrl, MARKETING_CHANNEL_BY_TYPE,
} from "../lib/marketing-meta.js";
import { hasAnyPermission, hasPermission } from "../lib/permissions.js";
import { invalidateYandexMarketingCache } from "../lib/yandex-cloud/marketing-context.js";

const uid = () => crypto.randomUUID();

const CHANNEL_BY_INTEGRATION: Record<string, string> = {
  tilda: "Tilda",
  telephony: "Телефония",
  ...MARKETING_CHANNEL_BY_TYPE,
};

function canReadIntegrations(user: { permissions: string[] }) {
  return hasAnyPermission(user.permissions, ["integrations.manage", "marketing.manage"]);
}

function canManageType(user: { permissions: string[] }, type: string) {
  if (hasPermission(user.permissions, "integrations.manage")) return true;
  if (isMarketingType(type) && hasPermission(user.permissions, "marketing.manage")) return true;
  return false;
}

async function syncChannelConnection(type: string, enabled: boolean) {
  const channelName = CHANNEL_BY_INTEGRATION[type];
  if (!channelName) return;
  await db.update(channels).set({ connected: enabled }).where(eq(channels.name, channelName));
}

function sanitizeConfig(type: string, config: Record<string, unknown>) {
  const out = { ...config };
  if (out.webhookSecret) out.webhookSecret = maskSecret(String(out.webhookSecret));
  if (out.apiKey) out.apiKey = maskSecret(String(out.apiKey));
  if (out.aiApiKey) out.aiApiKey = maskSecret(String(out.aiApiKey));
  if (out.accessToken) out.accessToken = maskSecret(String(out.accessToken));
  if (out.token) out.token = maskSecret(String(out.token));
  if (out.oauthToken) out.oauthToken = maskSecret(String(out.oauthToken));
  if (out.clientSecret) out.clientSecret = maskSecret(String(out.clientSecret));
  return out;
}

function buildIntegrationView(row: typeof integrations.$inferSelect, baseUrl: string) {
  const config = (row.config || {}) as Record<string, unknown>;
  const provider = String(config.provider || "generic");
  const secret = config.webhookSecret as string | undefined;
  const endpoints = integrationEndpoints(baseUrl);

  const view: Record<string, unknown> = {
    ...row,
    config: sanitizeConfig(row.type, config),
  };

  if (row.type === "tilda") {
    view.webhookUrl = endpoints.tildaWebhook;
    if (secret) view.webhookUrlWithSecret = webhookUrlWithSecret(endpoints.tildaWebhook, secret);
  }
  if (row.type === "telephony") {
    const webhookUrl = telephonyWebhookUrl(provider, baseUrl);
    view.webhookUrl = webhookUrl;
    if (secret) view.webhookUrlWithSecret = webhookUrlWithSecret(webhookUrl, secret);
    if (provider === "beeline" && secret) {
      view.beelineEventUrl = `${webhookUrl}/null?secret=${encodeURIComponent(secret)}`;
      view.beelineSubscriptionId = config.beelineSubscriptionId || null;
    }
  }
  if (isMarketingType(row.type) && row.type !== "yandex_metrica") {
    const url = marketingWebhookUrl(row.type, baseUrl);
    view.webhookUrl = url;
    if (secret) view.webhookUrlWithSecret = webhookUrlWithSecret(url, secret);
  }
  return view;
}

export const integrationRoutes = new Hono<AppEnv>();

integrationRoutes.use("*", requireAuth);

integrationRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!canReadIntegrations(user)) return c.json({ error: "Forbidden" }, 403);
  const baseUrl = getPublicBaseUrl();
  const rows = await db.select().from(integrations);
  const filtered = rows.filter((i: Integration) => canManageType(user, i.type));
  return c.json({
    baseUrl,
    endpoints: integrationEndpoints(baseUrl),
    integrations: filtered.map((i: Integration) => buildIntegrationView(i, baseUrl)),
  });
});

integrationRoutes.get("/:type", async (c) => {
  const user = c.get("user");
  const type = c.req.param("type");
  if (!canManageType(user, type)) return c.json({ error: "Forbidden" }, 403);
  const baseUrl = getPublicBaseUrl();
  const [row] = await db.select().from(integrations).where(eq(integrations.type, type)).limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ integration: buildIntegrationView(row, baseUrl) });
});

integrationRoutes.patch("/tilda", async (c) => {
  if (!canManageType(c.get("user"), "tilda")) return c.json({ error: "Forbidden" }, 403);
  const body = z.object({
    enabled: z.boolean().optional(),
    fieldMapping: z.record(z.string()).optional(),
    consentField: z.string().optional(),
    rotateSecret: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [existing] = await db.select().from(integrations).where(eq(integrations.type, "tilda")).limit(1);
  const prev = (existing?.config || {}) as Record<string, unknown>;
  const config = { ...prev };
  if (body.data.fieldMapping) config.fieldMapping = body.data.fieldMapping;
  if (body.data.consentField) config.consentField = body.data.consentField;
  if (body.data.rotateSecret || !config.webhookSecret) config.webhookSecret = uid();

  const enabled = body.data.enabled ?? existing?.enabled ?? false;

  const [row] = await db.update(integrations).set({
    enabled,
    config,
    updatedAt: new Date(),
  }).where(eq(integrations.type, "tilda")).returning();

  await syncChannelConnection("tilda", enabled);

  const baseUrl = getPublicBaseUrl();
  const endpoints = integrationEndpoints(baseUrl);
  const secret = config.webhookSecret as string;
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "integration.update",
    entityType: "integration", entityId: "tilda",
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { enabled },
  });

  return c.json({
    integration: buildIntegrationView(row!, baseUrl),
    webhookUrl: endpoints.tildaWebhook,
    ...(body.data.rotateSecret || !prev.webhookSecret ? {
      webhookUrlWithSecret: webhookUrlWithSecret(endpoints.tildaWebhook, secret),
      webhookSecret: secret,
    } : {}),
  });
});

integrationRoutes.patch("/telephony", async (c) => {
  if (!canManageType(c.get("user"), "telephony")) return c.json({ error: "Forbidden" }, 403);
  const body = z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(["generic", "mango", "zadarma", "uis", "asterisk", "beeline"]).optional(),
    sipGateway: z.string().optional(),
    apiKey: z.string().optional(),
    callerId: z.string().optional(),
    rotateSecret: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
    aiApiKey: z.string().optional(),
    aiBaseUrl: z.string().optional(),
    aiModel: z.string().optional(),
    whisperModel: z.string().optional(),
    autoTranscribe: z.boolean().optional(),
    autoFillLead: z.boolean().optional(),
    recordingAuthHeader: z.string().optional(),
    callAttachActiveDeal: z.boolean().optional(),
    createLeadOnUnknownCall: z.boolean().optional(),
    ignorePhones: z.array(z.string()).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [existing] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  const prev = (existing?.config || {}) as Record<string, unknown>;
  const config = { ...prev };

  if (body.data.provider) config.provider = body.data.provider;
  if (body.data.sipGateway !== undefined) config.sipGateway = body.data.sipGateway;
  if (body.data.callerId !== undefined) config.callerId = body.data.callerId;
  if (body.data.apiKey) config.apiKey = body.data.apiKey;
  if (body.data.aiEnabled !== undefined) config.aiEnabled = body.data.aiEnabled;
  if (body.data.aiApiKey !== undefined) config.aiApiKey = body.data.aiApiKey;
  if (body.data.aiBaseUrl !== undefined) config.aiBaseUrl = body.data.aiBaseUrl;
  if (body.data.aiModel !== undefined) config.aiModel = body.data.aiModel;
  if (body.data.whisperModel !== undefined) config.whisperModel = body.data.whisperModel;
  if (body.data.autoTranscribe !== undefined) config.autoTranscribe = body.data.autoTranscribe;
  if (body.data.autoFillLead !== undefined) config.autoFillLead = body.data.autoFillLead;
  if (body.data.recordingAuthHeader !== undefined) config.recordingAuthHeader = body.data.recordingAuthHeader;
  if (body.data.callAttachActiveDeal !== undefined) config.callAttachActiveDeal = body.data.callAttachActiveDeal;
  if (body.data.createLeadOnUnknownCall !== undefined) config.createLeadOnUnknownCall = body.data.createLeadOnUnknownCall;
  if (body.data.ignorePhones !== undefined) config.ignorePhones = body.data.ignorePhones;
  if (body.data.rotateSecret || !config.webhookSecret) config.webhookSecret = uid();

  const providerName = String(body.data.provider ?? config.provider ?? "generic");
  if (providerName === "beeline" && config.apiKey) {
    config.recordingAuthHeader = beelineRecordingAuthHeader(String(config.apiKey));
    config.sipGateway = config.sipGateway || "ip.beeline.ru";
  }

  const enabled = body.data.enabled ?? existing?.enabled ?? false;

  const [row] = await db.update(integrations).set({
    enabled,
    config,
    updatedAt: new Date(),
  }).where(eq(integrations.type, "telephony")).returning();

  await syncChannelConnection("telephony", enabled);

  const baseUrl = getPublicBaseUrl();
  const provider = String(config.provider || "generic");
  const endpoints = integrationEndpoints(baseUrl);
  const webhookUrl = telephonyWebhookUrl(provider, baseUrl);
  const secret = config.webhookSecret as string;
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "integration.update",
    entityType: "integration", entityId: "telephony",
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { enabled, provider },
  });

  return c.json({
    integration: buildIntegrationView(row!, baseUrl),
    webhookUrl,
    ...(body.data.rotateSecret || !prev.webhookSecret ? {
      webhookUrlWithSecret: webhookUrlWithSecret(webhookUrl, secret),
      webhookSecret: secret,
      beelineEventUrl: provider === "beeline" ? `${webhookUrl}/null?secret=${encodeURIComponent(secret)}` : undefined,
    } : {}),
    sipGateway: config.sipGateway,
    provider,
    beelineSubscriptionId: config.beelineSubscriptionId || null,
  });
});

integrationRoutes.post("/telephony/beeline/subscribe", async (c) => {
  if (!canManageType(c.get("user"), "telephony")) return c.json({ error: "Forbidden" }, 403);

  const [existing] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const config = (existing.config || {}) as Record<string, unknown>;
  const token = String(config.apiKey || "");
  if (!token) return c.json({ error: "Укажите API-токен Билайн и сохраните настройки" }, 400);

  const baseUrl = getPublicBaseUrl();
  const secret = String(config.webhookSecret || "");
  const webhookBase = telephonyWebhookUrl("beeline", baseUrl);
  const eventUrl = `${webhookBase}/null?secret=${encodeURIComponent(secret)}`;

  const oldSub = config.beelineSubscriptionId ? String(config.beelineSubscriptionId) : "";
  if (oldSub) {
    try { await beelineUnsubscribe(token, oldSub); } catch { /* ignore */ }
  }

  const pattern = String(config.callerId || "");
  const sub = await beelineSubscribe(token, {
    pattern,
    expires: 604800,
    subscriptionType: "ADVANCED_CALL",
    url: eventUrl,
  });

  const subscriptionId = sub.subscriptionId;
  if (!subscriptionId) return c.json({ error: "Билайн не вернул subscriptionId" }, 502);

  const nextConfig = {
    ...config,
    provider: "beeline",
    recordingAuthHeader: beelineRecordingAuthHeader(token),
    sipGateway: config.sipGateway || "ip.beeline.ru",
    beelineSubscriptionId: subscriptionId,
  };

  const [row] = await db.update(integrations).set({
    enabled: true,
    config: nextConfig,
    updatedAt: new Date(),
  }).where(eq(integrations.type, "telephony")).returning();

  await syncChannelConnection("telephony", true);

  let subscriptionStatus: unknown = null;
  try {
    subscriptionStatus = await beelineGetSubscription(token, subscriptionId);
  } catch { /* ignore */ }

  return c.json({
    ok: true,
    integration: row,
    subscriptionId,
    subscriptionStatus,
    webhookUrl: webhookBase,
    beelineEventUrl: `${webhookBase}/null?secret=${encodeURIComponent(secret)}`,
    message: "Подписка XSI-Events создана. Билайн шлёт события на URL …/beeline/null",
  });
});

async function patchMarketing(
  c: Context<AppEnv>,
  type: "vk" | "yandex_direct" | "yandex_metrica" | "avito",
  fields: Record<string, unknown>,
) {
  if (!canManageType(c.get("user"), type)) return c.json({ error: "Forbidden" }, 403);

  const [existing] = await db.select().from(integrations).where(eq(integrations.type, type)).limit(1);
  if (!existing) {
    return c.json({ error: "Интеграция не найдена. Выполните миграцию БД." }, 404);
  }

  const prev = (existing.config || {}) as Record<string, unknown>;
  const config = { ...prev, ...fields };
  if (fields.rotateSecret || (type !== "yandex_metrica" && !config.webhookSecret)) {
    config.webhookSecret = uid();
  }

  const enabled = fields.enabled !== undefined ? Boolean(fields.enabled) : existing.enabled;

  const [row] = await db.update(integrations).set({
    enabled,
    config,
    updatedAt: new Date(),
  }).where(eq(integrations.type, type)).returning();

  await syncChannelConnection(type, enabled);

  if (type === "yandex_metrica" || type === "yandex_direct") {
    invalidateYandexMarketingCache();
  }

  const baseUrl = getPublicBaseUrl();
  const secret = config.webhookSecret as string | undefined;
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "integration.update",
    entityType: "integration", entityId: type,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { enabled },
  });

  const res: Record<string, unknown> = { integration: buildIntegrationView(row!, baseUrl) };
  if (type !== "yandex_metrica") {
    const url = marketingWebhookUrl(type, baseUrl);
    res.webhookUrl = url;
    if (secret && (fields.rotateSecret || !prev.webhookSecret)) {
      res.webhookUrlWithSecret = webhookUrlWithSecret(url, secret);
      res.webhookSecret = secret;
    }
  }
  return c.json(res);
}

integrationRoutes.patch("/vk", async (c) => {
  const body = z.object({
    enabled: z.boolean().optional(),
    groupId: z.string().optional(),
    accessToken: z.string().optional(),
    rotateSecret: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  const fields: Record<string, unknown> = {};
  if (body.data.enabled !== undefined) fields.enabled = body.data.enabled;
  if (body.data.groupId !== undefined) fields.groupId = body.data.groupId;
  if (body.data.accessToken) fields.accessToken = body.data.accessToken;
  if (body.data.rotateSecret) fields.rotateSecret = true;
  return patchMarketing(c, "vk", fields);
});

integrationRoutes.patch("/yandex_direct", async (c) => {
  const body = z.object({
    enabled: z.boolean().optional(),
    clientLogin: z.string().optional(),
    token: z.string().optional(),
    accountId: z.string().optional(),
    rotateSecret: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  const fields: Record<string, unknown> = {};
  if (body.data.enabled !== undefined) fields.enabled = body.data.enabled;
  if (body.data.clientLogin !== undefined) fields.clientLogin = body.data.clientLogin;
  if (body.data.token) fields.token = body.data.token;
  if (body.data.accountId !== undefined) fields.accountId = body.data.accountId;
  if (body.data.rotateSecret) fields.rotateSecret = true;
  return patchMarketing(c, "yandex_direct", fields);
});

integrationRoutes.patch("/yandex_metrica", async (c) => {
  const body = z.object({
    enabled: z.boolean().optional(),
    counterId: z.string().optional(),
    oauthToken: z.string().optional(),
    siteUrl: z.string().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  const fields: Record<string, unknown> = {};
  if (body.data.enabled !== undefined) fields.enabled = body.data.enabled;
  if (body.data.counterId !== undefined) fields.counterId = body.data.counterId;
  if (body.data.oauthToken) fields.oauthToken = body.data.oauthToken;
  if (body.data.siteUrl !== undefined) fields.siteUrl = body.data.siteUrl;
  return patchMarketing(c, "yandex_metrica", fields);
});

integrationRoutes.patch("/avito", async (c) => {
  const body = z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    userId: z.string().optional(),
    rotateSecret: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  const fields: Record<string, unknown> = {};
  if (body.data.enabled !== undefined) fields.enabled = body.data.enabled;
  if (body.data.clientId !== undefined) fields.clientId = body.data.clientId;
  if (body.data.clientSecret) fields.clientSecret = body.data.clientSecret;
  if (body.data.userId !== undefined) fields.userId = body.data.userId;
  if (body.data.rotateSecret) fields.rotateSecret = true;
  return patchMarketing(c, "avito", fields);
});
