import "./env.js";
import { runStartupSecurityChecks } from "./lib/startup-check.js";
import { count } from "drizzle-orm";
import { isPglite, db } from "./db/index.js";
import { runMigrations } from "./db/migrations-run.js";
import { users } from "./db/schema.js";
import { isPgliteAbortError } from "./db/pglite-lifecycle.js";
import { recoverDevDatabase } from "./db/recover-dev.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodySizeLimit, globalApiRateLimit, securityHeaders } from "./middleware/security.js";
import { getClientIp } from "./lib/clientIp.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { authRoutes } from "./routes/auth.js";
import { leadRoutes } from "./routes/leads.js";
import { settingsRoutes } from "./routes/settings.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/team.js";
import { adminUserRoutes } from "./routes/admin/users.js";
import { adminRoleRoutes } from "./routes/admin/roles.js";
import { adminProfileRoutes } from "./routes/admin/profiles.js";
import { tildaWebhook } from "./routes/webhooks/tilda.js";
import { telephonyWebhook } from "./routes/webhooks/telephony.js";
import { callRoutes } from "./routes/calls.js";
import { integrationRoutes } from "./routes/integrations.js";
import { eventRoutes } from "./routes/events.js";
import { publicRoutes } from "./routes/public.js";
import { marketingWebhook } from "./routes/webhooks/marketing.js";
import { adminAuditRoutes } from "./routes/admin/audit.js";
import { adminBackupRoutes } from "./routes/admin/backup.js";
import { notificationRoutes } from "./routes/notifications.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { aiboardRoutes } from "./routes/aiboard.js";
import { reactionRoutes } from "./routes/reactions.js";
import { reactorRoutes } from "./routes/reactor.js";
import { siteRoutes } from "./routes/sites.js";
import { edoRoutes } from "./routes/edo.js";
import { mailRoutes } from "./routes/mail.js";
import { connectorRoutes } from "./routes/connectors.js";
import { connectorWebhook } from "./routes/webhooks/connectors.js";
import { edoAstralWebhook } from "./routes/webhooks/edo.js";
import { legalEntityRoutes, contactRoutes } from "./routes/crm-entities.js";
import { crmFieldRoutes } from "./routes/crm-fields.js";
import { resourceRoutes } from "./routes/resources.js";
import { assetRoutes } from "./routes/assets.js";
import { agentRoutes } from "./routes/agent.js";
import { aiDocsRoutes } from "./routes/ai-docs.js";
import { openapiRoutes } from "./routes/openapi.js";
import { logger, installProcessErrorHandlers } from "./lib/logger.js";
import { requestContext, requestLog } from "./middleware/requestLog.js";
import { dbRecoveryMiddleware } from "./middleware/db-recovery.js";
import type { AppEnv } from "./middleware/auth.js";

installProcessErrorHandlers();
runStartupSecurityChecks();

async function bootstrapDatabase() {
  if (!isPglite || process.env.NODE_ENV === "production") return;
  try {
    await runMigrations();
    const [{ n: userCount }] = await db.select({ n: count() }).from(users);
    if (Number(userCount) === 0) {
      const { runSeed } = await import("./db/seed.js");
      logger.info("db.seed.auto", { reason: "no_users" });
      await runSeed({ closeDb: false });
    } else {
      const { ensureResourcesAssetsDemo } = await import("./db/seed-resources-assets.js");
      await ensureResourcesAssetsDemo();
    }
  } catch (e) {
    if (!isPgliteAbortError(e)) throw e;
    logger.warn("db.bootstrap.recover", { err: e instanceof Error ? e.message : String(e) });
    const ok = await recoverDevDatabase();
    if (!ok) throw e;
  }
}

await bootstrapDatabase();

try {
  const { seedReactorPresets } = await import("./lib/reactor/product-service.js");
  const synced = await seedReactorPresets();
  logger.info("reactor.presets.sync", { count: synced });
} catch (e) {
  logger.warn("reactor.presets.sync_skip", { error: e instanceof Error ? e.message : String(e) });
}

const { initSdrLayer } = await import("./lib/sdr/index.js");
await initSdrLayer();

const app = new Hono<AppEnv>();

app.use("*", secureHeaders({
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  xContentTypeOptions: "nosniff",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
}));
app.use("*", securityHeaders);
app.use("/api/*", bodySizeLimit);
app.use("/api/*", globalApiRateLimit);
app.use("*", requestContext);
app.use("/api/*", requestLog);
app.use("/api/*", dbRecoveryMiddleware);

app.onError((err, c) => {
  const requestId = c.get("requestId");
  const status = err instanceof HTTPException ? err.status : 500;
  logger.logError(err, "api.unhandled", { requestId, path: c.req.path, status });

  const raw = err.message || "Internal Server Error";
  const isWasmAbort = /Aborted\(\)/.test(raw);
  const isDbCorrupt = /could not seek|base\/\d+\/\d+|pg_attribute catalog|missing \d+ attribute\(s\) for relation/i.test(raw);
  const isDbSchema = /relation .* does not exist/i.test(raw);
  const isFkViolation = /violates foreign key constraint/i.test(raw);
  const dev = process.env.NODE_ENV !== "production";
  const clientMessage = status === 500 && process.env.NODE_ENV === "production"
    ? "Internal Server Error"
    : isFkViolation
      ? dev
        ? "Устаревшие id воронки после сброса БД — обновите страницу (Ctrl+F5)"
        : "Ошибка связи данных"
    : isWasmAbort || isDbCorrupt || isDbSchema
      ? dev
        ? isDbCorrupt
          ? "База данных повреждена — выполните npm run dev:recover и обновите страницу"
          : "База данных перезапускается — обновите страницу"
        : "Ошибка базы данных"
      : raw;

  return c.json({ error: clientMessage, requestId }, status);
});

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use("/api/*", cors({
  origin: (reqOrigin) => {
    if (!reqOrigin) return allowedOrigins[0];
    if (allowedOrigins.includes(reqOrigin)) return reqOrigin;
    return null;
  },
  credentials: true,
}));

app.get("/api/health", async (c) => {
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
    const ip = getClientIp(c);
    if (!rateLimit(`health:${ip}`, 30, 60_000)) {
      return c.json({ ok: true }, 200);
    }
  }
  let dbOk = false;
  try {
    const { db } = await import("./db/index.js");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    if (!prod && isPglite) {
      const { recoverDevDatabase } = await import("./db/recover-dev.js");
      if (await recoverDevDatabase()) {
        try {
          const { db } = await import("./db/index.js");
          const { sql } = await import("drizzle-orm");
          await db.execute(sql`SELECT 1`);
          dbOk = true;
        } catch { /* ignore */ }
      }
    }
  }
  if (prod) return c.json({ ok: dbOk }, dbOk ? 200 : 503);
  return c.json({
    ok: dbOk,
    db: dbOk ? "up" : "down",
    version: "1.0.0",
    ts: Date.now(),
    recoverable: !prod && isPglite && !dbOk,
  }, dbOk ? 200 : 503);
});

/** Dev-only: восстановить PGlite после повреждения (без ручного dev:recover). */
app.post("/api/health/recover", async (c) => {
  if (process.env.NODE_ENV === "production") return c.json({ error: "Forbidden" }, 403);
  if (!isPglite) return c.json({ ok: true, db: "postgres" });
  const ok = await recoverDevDatabase();
  let dbOk = false;
  if (ok) {
    try {
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch { /* ignore */ }
  }
  return c.json({ ok: dbOk, db: dbOk ? "up" : "down", recovered: ok }, dbOk ? 200 : 503);
});
app.route("/api/public", publicRoutes);

app.route("/api/auth", authRoutes);
app.route("/api/leads", leadRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/admin/users", adminUserRoutes);
app.route("/api/admin/roles", adminRoleRoutes);
app.route("/api/admin/profiles", adminProfileRoutes);
app.route("/api/admin/audit", adminAuditRoutes);
app.route("/api/admin/backup", adminBackupRoutes);
app.route("/api/webhooks/tilda", tildaWebhook);
app.route("/api/webhooks/telephony", telephonyWebhook);
app.route("/api/webhooks/marketing", marketingWebhook);
app.route("/api/calls", callRoutes);
app.route("/api/integrations", integrationRoutes);
app.route("/api/connectors", connectorRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/aiboard", aiboardRoutes);
app.route("/api/reactions", reactionRoutes);
app.route("/api/reactor", reactorRoutes);
app.route("/api/agent", agentRoutes);
app.route("/api/ai-docs", aiDocsRoutes);
app.route("/api", openapiRoutes);
app.route("/api/sites", siteRoutes);
app.route("/api/edo", edoRoutes);
app.route("/api/mail", mailRoutes);
app.route("/api/legal-entities", legalEntityRoutes);
app.route("/api/contacts", contactRoutes);
app.route("/api/resources", resourceRoutes);
app.route("/api/crm-fields", crmFieldRoutes);
app.route("/api/assets", assetRoutes);
app.route("/api/webhooks/edo", edoAstralWebhook);
app.route("/api/webhooks/connectors", connectorWebhook);

const port = Number(process.env.PORT || 3000);
logger.info("server.starting", { port, nodeEnv: process.env.NODE_ENV || "development" });
const server = serve({ fetch: app.fetch, port });

async function shutdown(signal: string) {
  logger.info("server.shutdown", { signal });
  const { closeDb } = await import("./db/index.js");
  await closeDb().catch(() => {});
  server.close?.();
  setTimeout(() => process.exit(0), 100);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGHUP", () => void shutdown("SIGHUP"));

if (process.env.NODE_ENV === "production") {
  const { runTaskDueReminders } = await import("./jobs/task-due-reminders.js");
  const tick = () => { void runTaskDueReminders().catch((e) => logger.logError(e, "tasks.due_reminders_failed")); };
  setInterval(tick, 15 * 60 * 1000);
  setTimeout(tick, 30_000);

  const { resumeDueBlueprintWaits } = await import("./lib/blueprint/wait-resume.js");
  const waitTick = () => { void resumeDueBlueprintWaits().catch((e) => logger.logError(e, "blueprint.wait_resume_failed")); };
  setInterval(waitTick, 60_000);
  setTimeout(waitTick, 45_000);
}
