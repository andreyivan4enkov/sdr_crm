import { Hono } from "hono";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLog } from "../../db/schema.js";
import { requireAuth, requirePermission, type AppEnv } from "../../middleware/auth.js";

export const adminAuditRoutes = new Hono<AppEnv>();

adminAuditRoutes.use("*", requireAuth, requirePermission("audit.view"));

adminAuditRoutes.get("/", async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 50)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const action = c.req.query("action");
  const userId = c.req.query("userId");
  const userLogin = c.req.query("userLogin");
  const since = c.req.query("since");

  const conditions = [];
  if (action) conditions.push(eq(auditLog.action, action));
  if (userId) conditions.push(eq(auditLog.userId, userId));
  if (userLogin) conditions.push(eq(auditLog.userLogin, userLogin));
  if (since) conditions.push(gte(auditLog.createdAt, new Date(since)));

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(where);

  return c.json({ logs: rows, total: countRow?.count ?? 0, limit, offset });
});
