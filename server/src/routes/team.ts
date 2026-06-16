import { Hono } from "hono";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { orgUnits, profiles, realtors, roles, users } from "../db/schema.js";
import { ALL_PERMISSIONS } from "../lib/permissions.js";
import { requireAuth, requireAnyPermission, requirePermission, type AppEnv } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getClientIp } from "../lib/clientIp.js";

export const teamRoutes = new Hono<AppEnv>();

teamRoutes.use("*", requireAuth, requireAnyPermission(["team.read", "team.manage", "leads.read"]));

async function loadTeamPayload() {
  const unitRows = await db
    .select({
      id: orgUnits.id,
      name: orgUnits.name,
      parentId: orgUnits.parentId,
      sortOrder: orgUnits.sortOrder,
      description: orgUnits.description,
      defaultRoleId: orgUnits.defaultRoleId,
      defaultRoleName: roles.label,
    })
    .from(orgUnits)
    .leftJoin(roles, eq(orgUnits.defaultRoleId, roles.id))
    .orderBy(asc(orgUnits.sortOrder));

  const realtorRows = await db
    .select({
      id: realtors.id,
      name: realtors.name,
      region: realtors.region,
      phone: realtors.phone,
      userId: realtors.userId,
      orgUnitId: realtors.orgUnitId,
      position: realtors.position,
      roleId: realtors.roleId,
      createdAt: realtors.createdAt,
      roleName: roles.label,
      orgUnitName: orgUnits.name,
      userLogin: users.login,
    })
    .from(realtors)
    .innerJoin(users, eq(realtors.userId, users.id))
    .leftJoin(roles, eq(realtors.roleId, roles.id))
    .leftJoin(orgUnits, eq(realtors.orgUnitId, orgUnits.id))
    .where(eq(users.status, "active"));

  const roleRows = await db.select().from(roles);

  const userRows = await db
    .select({
      id: users.id,
      login: users.login,
      name: profiles.name,
      roleId: users.roleId,
      roleName: roles.label,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.status, "active"));

  const employeeRows = await db
    .select({
      id: users.id,
      login: users.login,
      name: profiles.name,
      avatar: profiles.avatar,
      position: profiles.position,
      region: profiles.region,
      phone: profiles.phone,
      roleName: roles.label,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.status, "active"))
    .orderBy(asc(profiles.name));

  return {
    orgUnits: unitRows,
    realtors: realtorRows,
    roles: roleRows,
    linkableUsers: userRows,
    employees: employeeRows.map((e: typeof employeeRows[number]) => ({
      id: e.id,
      name: e.name || e.login,
      avatar: e.avatar,
      position: e.position,
      region: e.region,
      phone: e.phone,
      roleName: e.roleName,
    })),
    allPermissions: ALL_PERMISSIONS,
  };
}

async function syncUserRole(userId: string | null | undefined, roleId: string | null | undefined) {
  if (!userId || !roleId) return;
  await db.update(users).set({ roleId, updatedAt: new Date() }).where(eq(users.id, userId));
}

async function ensureUserLinkUnique(userId: string | null | undefined, realtorId?: string) {
  if (!userId) return null;
  const [existing] = await db.select().from(realtors).where(
    realtorId
      ? and(eq(realtors.userId, userId), ne(realtors.id, realtorId))
      : eq(realtors.userId, userId),
  ).limit(1);
  if (existing) return "Эта учётная запись уже привязана к другому сотруднику";
  return null;
}

teamRoutes.get("/", async (c) => {
  return c.json(await loadTeamPayload());
});

const unitSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  defaultRoleId: z.string().uuid().optional().nullable(),
});

teamRoutes.post("/units", requirePermission("team.manage"), async (c) => {
  const body = unitSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [unit] = await db.insert(orgUnits).values({
    name: body.data.name,
    parentId: body.data.parentId ?? null,
    sortOrder: body.data.sortOrder ?? 0,
    description: body.data.description ?? null,
    defaultRoleId: body.data.defaultRoleId ?? null,
  }).returning();

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "org_unit.create",
    entityType: "org_unit", entityId: unit.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { name: unit.name },
  });

  return c.json({ unit }, 201);
});

teamRoutes.patch("/units/:id", requirePermission("team.manage"), async (c) => {
  const body = unitSchema.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const id = c.req.param("id");
  if (body.data.parentId === id) return c.json({ error: "Подразделение не может быть родителем самого себя" }, 400);

  const [unit] = await db.update(orgUnits).set(body.data).where(eq(orgUnits.id, id)).returning();
  if (!unit) return c.json({ error: "Not found" }, 404);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "org_unit.update",
    entityType: "org_unit", entityId: unit.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });

  return c.json({ unit });
});

teamRoutes.delete("/units/:id", requirePermission("team.manage"), async (c) => {
  const id = c.req.param("id");
  const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  if (!unit) return c.json({ error: "Not found" }, 404);

  await db.update(orgUnits).set({ parentId: unit.parentId }).where(eq(orgUnits.parentId, id));
  await db.update(realtors).set({ orgUnitId: null }).where(eq(realtors.orgUnitId, id));
  await db.delete(orgUnits).where(eq(orgUnits.id, id));

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "org_unit.delete",
    entityType: "org_unit", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { name: unit.name },
  });

  return c.json({ ok: true });
});

const realtorSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  phone: z.string().optional(),
  userId: z.string().uuid().optional().nullable(),
  orgUnitId: z.string().uuid().optional().nullable(),
  position: z.string().max(120).optional().nullable(),
  roleId: z.string().uuid().optional().nullable(),
});

teamRoutes.post("/", requireAnyPermission(["team.manage", "leads.write"]), async (c) => {
  const body = realtorSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const linkErr = await ensureUserLinkUnique(body.data.userId);
  if (linkErr) return c.json({ error: linkErr }, 409);

  let roleId = body.data.roleId ?? null;
  if (!roleId && body.data.orgUnitId) {
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, body.data.orgUnitId)).limit(1);
    roleId = unit?.defaultRoleId ?? null;
  }

  const [realtor] = await db.insert(realtors).values({
    ...body.data,
    roleId,
  }).returning();

  await syncUserRole(realtor.userId, realtor.roleId);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "employee.create",
    entityType: "realtor", entityId: realtor.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { name: realtor.name },
  });

  return c.json({ realtor }, 201);
});

teamRoutes.patch("/:id", requireAnyPermission(["team.manage", "leads.write"]), async (c) => {
  const body = realtorSchema.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const id = c.req.param("id");
  const linkErr = await ensureUserLinkUnique(body.data.userId, id);
  if (linkErr) return c.json({ error: linkErr }, 409);

  const [realtor] = await db.update(realtors).set(body.data).where(eq(realtors.id, id)).returning();
  if (!realtor) return c.json({ error: "Not found" }, 404);

  await syncUserRole(realtor.userId, realtor.roleId);

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "employee.update",
    entityType: "realtor", entityId: realtor.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });

  return c.json({ realtor });
});

teamRoutes.delete("/:id", requireAnyPermission(["team.manage", "leads.write"]), async (c) => {
  const id = c.req.param("id");
  await db.delete(realtors).where(eq(realtors.id, id));

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "employee.delete",
    entityType: "realtor", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });

  return c.json({ ok: true });
});

const roleSchema = z.object({
  name: z.string().min(2).max(50),
  label: z.string().min(1),
  permissions: z.array(z.string()),
});

teamRoutes.post("/roles", requirePermission("roles.manage"), async (c) => {
  const body = roleSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [role] = await db.insert(roles).values(body.data).returning();
  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.create",
    entityType: "role", entityId: role.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ role }, 201);
});

teamRoutes.patch("/roles/:id", requirePermission("roles.manage"), async (c) => {
  const body = z.object({
    label: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [role] = await db.update(roles).set(body.data).where(eq(roles.id, c.req.param("id"))).returning();
  if (!role) return c.json({ error: "Not found" }, 404);

  const assigned = await db.select({ userId: realtors.userId }).from(realtors).where(eq(realtors.roleId, role.id));
  const userIds = assigned.map((row: { userId: string | null }) => row.userId).filter(Boolean) as string[];
  if (userIds.length) {
    await db.update(users).set({ roleId: role.id, updatedAt: new Date() }).where(inArray(users.id, userIds));
  }

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.update",
    entityType: "role", entityId: role.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ role });
});

teamRoutes.delete("/roles/:id", requirePermission("roles.manage"), async (c) => {
  const id = c.req.param("id");
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) return c.json({ error: "Not found" }, 404);
  if (role.name === "admin" || role.name === "integrator") {
    return c.json({ error: "Cannot delete system role" }, 400);
  }

  await db.update(orgUnits).set({ defaultRoleId: null }).where(eq(orgUnits.defaultRoleId, id));
  await db.update(realtors).set({ roleId: null }).where(eq(realtors.roleId, id));
  await db.delete(roles).where(eq(roles.id, id));

  const user = c.get("user");
  await writeAudit({
    userId: user.id, userLogin: user.login, action: "role.delete",
    entityType: "role", entityId: id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ ok: true });
});
