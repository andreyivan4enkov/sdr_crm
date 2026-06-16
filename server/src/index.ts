import "./env.js";
import { isPglite } from "./db/index.js";
import { runMigrations } from "./db/migrations-run.js";
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
import { logger, installProcessErrorHandlers } from "./lib/logger.js";
import { requestContext, requestLog } from "./middleware/requestLog.js";
import type { AppEnv } from "./middleware/auth.js";

installProcessErrorHandlers();

if (isPglite && process.env.NODE_ENV !== "production") {
  await runMigrations();
}

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

app.onError((err, c) => {
  const requestId = c.get("requestId");
  const status = err instanceof HTTPException ? err.status : 500;
  logger.logError(err, "api.unhandled", { requestId, path: c.req.path, status });

  const raw = err.message || "Internal Server Error";
  const isWasmAbort = /Aborted\(\)/.test(raw);
  const isDbSchema = /relation .* does not exist/i.test(raw);
  const clientMessage = status === 500 && process.env.NODE_ENV === "production"
    ? "Internal Server Error"
    : isWasmAbort || isDbSchema
      ? "Ошибка базы данных. Выполните: npm run db:reset"
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
    return allowedOrigins[0];
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
  } catch { /* ignore */ }
  if (prod) return c.json({ ok: dbOk }, dbOk ? 200 : 503);
  return c.json({
    ok: dbOk,
    db: dbOk ? "up" : "down",
    version: "1.0.0",
    ts: Date.now(),
  }, dbOk ? 200 : 503);
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
app.route("/api/events", eventRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/analytics", analyticsRoutes);

const port = Number(process.env.PORT || 3000);
logger.info("server.starting", { port, nodeEnv: process.env.NODE_ENV || "development" });
serve({ fetch: app.fetch, port });

if (process.env.NODE_ENV === "production") {
  const { runTaskDueReminders } = await import("./jobs/task-due-reminders.js");
  const tick = () => { void runTaskDueReminders().catch((e) => logger.logError(e, "tasks.due_reminders_failed")); };
  setInterval(tick, 15 * 60 * 1000);
  setTimeout(tick, 30_000);
}
