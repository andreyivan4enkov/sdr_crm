import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { roles } from "../../db/schema.js";
import { ALL_PERMISSIONS, sanitizeRolePermissions } from "../../lib/permissions.js";
import { requireAuth, requirePermission, type AppEnv } from "../../middleware/auth.js";
import { writeAudit } from "../../lib/audit.js";
import { getClientIp } from "../../lib/clientIp.js";

export const adminRoleRoutes = new Hono<AppEnv>();

adminRoleRoutes.use("*", requireAuth, requirePermission("roles.manage"));

adminRoleRoutes.get("/", async (c) => {
  const rows = await db.select().from(roles);
  return c.json({ roles: rows, allPermissions: ALL_PERMISSIONS });
});

adminRoleRoutes.post("/", async (c) => {
  const body = z.object({
    name: z.string().min(2).max(50),
    label: z.string().min(1),
    permissions: z.array(z.string()),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const permissions = sanitizeRolePermissions(body.data.permissions);
  const [role] = await db.insert(roles).values({ ...body.data, permissions }).returning();
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.create",
    entityType: "role", entityId: role.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ role }, 201);
});

adminRoleRoutes.patch("/:id", async (c) => {
  const body = z.object({
    label: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const patch = {
    ...body.data,
    ...(body.data.permissions ? { permissions: sanitizeRolePermissions(body.data.permissions) } : {}),
    updatedAt: new Date(),
  };
  const [role] = await db.update(roles).set(patch).where(eq(roles.id, c.req.param("id"))).returning();
  if (!role) return c.json({ error: "Not found" }, 404);
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.update",
    entityType: "role", entityId: role.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ role });
});

adminRoleRoutes.delete("/:id", async (c) => {
  const [role] = await db.select().from(roles).where(eq(roles.id, c.req.param("id"))).limit(1);
  if (!role) return c.json({ error: "Not found" }, 404);
  if (role.name === "admin" || role.name === "integrator") {
    return c.json({ error: "Cannot delete system role" }, 400);
  }
  await db.delete(roles).where(eq(roles.id, c.req.param("id")));
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.delete",
    entityType: "role", entityId: c.req.param("id"),
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ ok: true });
});
