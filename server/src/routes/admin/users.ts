import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { users, roles, profiles, realtors, leads, orgUnits } from "../../db/schema.js";
import { requireAuth, requirePermission, requireAnyPermission, type AppEnv } from "../../middleware/auth.js";
import { createInviteToken, inviteUrl } from "../../lib/invites.js";
import { inviteableRoleNames } from "../../lib/permissions.js";
import { writeAudit } from "../../lib/audit.js";
import { getClientIp } from "../../lib/clientIp.js";

export const adminUserRoutes = new Hono<AppEnv>();

adminUserRoutes.use("*", requireAuth);

const inviteAccess = requireAnyPermission(["users.manage", "users.invite"]);

adminUserRoutes.get("/invite-roles", inviteAccess, async (c) => {
  const user = c.get("user");
  const allowed = inviteableRoleNames(user.roleName);
  if (allowed.length === 0) return c.json({ roles: [] });

  const rows = await db.select().from(roles).where(inArray(roles.name, allowed));
  return c.json({ roles: rows });
});

adminUserRoutes.post("/invite", inviteAccess, async (c) => {
  const user = c.get("user");
  const body = z.object({
    roleId: z.string().uuid().optional(),
    orgUnitId: z.string().uuid().optional().nullable(),
    days: z.number().min(1).max(30).optional(),
  }).safeParse(await c.req.json().catch(() => ({})));

  let roleId = body.success ? body.data.roleId : undefined;
  const orgUnitId = body.success ? body.data.orgUnitId : undefined;
  if (!roleId) {
    const [opRole] = await db.select().from(roles).where(eq(roles.name, "operator")).limit(1);
    roleId = opRole?.id;
  }
  if (!roleId) return c.json({ error: "Role not found" }, 400);

  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return c.json({ error: "Role not found" }, 404);

  if (orgUnitId) {
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, orgUnitId)).limit(1);
    if (!unit) return c.json({ error: "Подразделение не найдено" }, 404);
  }

  const allowed = inviteableRoleNames(user.roleName);
  if (!allowed.includes(role.name)) {
    return c.json({ error: "Нельзя пригласить пользователя с этой ролью" }, 403);
  }

  const token = await createInviteToken(role.id, role.name, orgUnitId, body.success ? body.data.days : 7);
  const url = inviteUrl(token);

  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: "user.invite",
    entityType: "role",
    entityId: role.id,
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent"),
    meta: { role: role.name },
  });

  return c.json({
    url,
    token,
    role: role.label,
    expiresInDays: body.success ? body.data.days ?? 7 : 7,
    message: "Отправьте ссылку сотруднику для регистрации",
  });
});

adminUserRoutes.get("/", requirePermission("users.manage"), async (c) => {
  const status = c.req.query("status");
  const rows = await db
    .select({
      id: users.id,
      login: users.login,
      email: users.email,
      status: users.status,
      roleId: users.roleId,
      roleName: roles.name,
      roleLabel: roles.label,
      createdAt: users.createdAt,
      profileName: profiles.name,
      profilePhone: profiles.phone,
      profileRegion: profiles.region,
      profilePosition: profiles.position,
      profileOrgUnitId: profiles.orgUnitId,
      orgUnitName: orgUnits.name,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(orgUnits, eq(profiles.orgUnitId, orgUnits.id));

  const filtered = status ? rows.filter((r: { status: string }) => r.status === status) : rows;
  return c.json({ users: filtered });
});

adminUserRoutes.patch("/:id", requirePermission("users.manage"), async (c) => {
  const body = z.object({
    status: z.enum(["pending", "active", "rejected"]).optional(),
    roleId: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [user] = await db.update(users).set({
    ...body.data,
    updatedAt: new Date(),
  }).where(eq(users.id, c.req.param("id"))).returning();

  if (!user) return c.json({ error: "Not found" }, 404);
  const actor = c.get("user");
  await writeAudit({
    userId: actor.id, userLogin: actor.login, action: "user.update",
    entityType: "user", entityId: user.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ user });
});

adminUserRoutes.post("/:id/approve", requirePermission("users.manage"), async (c) => {
  const body = z.object({
    roleId: z.string().uuid().optional(),
    orgUnitId: z.string().uuid().optional().nullable(),
  }).safeParse(await c.req.json().catch(() => ({})));
  const roleId = body.success ? body.data.roleId : undefined;
  const orgUnitId = body.success ? body.data.orgUnitId : undefined;

  let finalRoleId = roleId;
  if (!finalRoleId) {
    const [opRole] = await db.select().from(roles).where(eq(roles.name, "operator")).limit(1);
    finalRoleId = opRole?.id;
  }

  const userId = c.req.param("id");
  const [existing] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.status, "pending"))).limit(1);
  if (!existing) return c.json({ error: "Not found or not pending" }, 404);

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const finalOrgUnitId = orgUnitId !== undefined ? orgUnitId : profile?.orgUnitId ?? null;

  if (finalOrgUnitId) {
    await db.update(profiles).set({ orgUnitId: finalOrgUnitId, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  }

  const [user] = await db.update(users).set({
    status: "active",
    roleId: finalRoleId,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();

  if (!user) return c.json({ error: "Not found or not pending" }, 404);

  const [role] = await db.select().from(roles).where(eq(roles.id, finalRoleId!)).limit(1);
  const [updatedProfile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  if (updatedProfile && role) {
    const [existingRealtor] = await db.select().from(realtors).where(eq(realtors.userId, userId)).limit(1);
    if (!existingRealtor) {
      await db.insert(realtors).values({
        name: updatedProfile.name,
        region: updatedProfile.region?.trim() || "—",
        phone: updatedProfile.phone,
        userId,
        orgUnitId: finalOrgUnitId,
        position: updatedProfile.position,
        roleId: finalRoleId,
      });
    } else {
      await db.update(realtors).set({
        name: updatedProfile.name,
        region: updatedProfile.region?.trim() || existingRealtor.region,
        phone: updatedProfile.phone,
        orgUnitId: finalOrgUnitId,
        position: updatedProfile.position,
        roleId: finalRoleId,
      }).where(eq(realtors.id, existingRealtor.id));
    }
  }

  const actor = c.get("user");
  await writeAudit({
    userId: actor.id, userLogin: actor.login, action: "user.approve",
    entityType: "user", entityId: user.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ user, message: "Сотрудник подтверждён" });
});

adminUserRoutes.post("/:id/reject", requirePermission("users.manage"), async (c) => {
  const [user] = await db.update(users).set({
    status: "rejected",
    updatedAt: new Date(),
  }).where(eq(users.id, c.req.param("id"))).returning();

  if (!user) return c.json({ error: "Not found" }, 404);
  const actor = c.get("user");
  await writeAudit({
    userId: actor.id, userLogin: actor.login, action: "user.reject",
    entityType: "user", entityId: user.id,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
  });
  return c.json({ user, message: "Регистрация отклонена" });
});

adminUserRoutes.post("/:id/dismiss", requirePermission("users.manage"), async (c) => {
  const body = z.object({
    delegateToUserId: z.string().uuid().optional().nullable(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const userId = c.req.param("id");
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target || target.status !== "active") return c.json({ error: "Сотрудник не найден" }, 404);

  const [realtor] = await db.select().from(realtors).where(eq(realtors.userId, userId)).limit(1);
  let delegateRealtorId: string | null = null;

  if (body.data.delegateToUserId) {
    const [delegateUser] = await db.select().from(users).where(and(eq(users.id, body.data.delegateToUserId), eq(users.status, "active"))).limit(1);
    if (!delegateUser) return c.json({ error: "Сотрудник для делегирования не найден" }, 404);
    const [delegateRealtor] = await db.select().from(realtors).where(eq(realtors.userId, body.data.delegateToUserId)).limit(1);
    if (!delegateRealtor) return c.json({ error: "У выбранного сотрудника нет карточки в команде" }, 400);
    delegateRealtorId = delegateRealtor.id;
  }

  if (realtor) {
    if (delegateRealtorId) {
      await db.update(leads).set({ assignedRealtorId: delegateRealtorId, updatedAt: new Date() }).where(eq(leads.assignedRealtorId, realtor.id));
    } else {
      await db.update(leads).set({ assignedRealtorId: null, updatedAt: new Date() }).where(eq(leads.assignedRealtorId, realtor.id));
    }
    await db.delete(realtors).where(eq(realtors.id, realtor.id));
  }

  const [user] = await db.update(users).set({
    status: "rejected",
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();

  const actor = c.get("user");
  await writeAudit({
    userId: actor.id, userLogin: actor.login, action: "user.dismiss",
    entityType: "user", entityId: userId,
    ip: getClientIp(c), userAgent: c.req.header("user-agent"),
    meta: { delegateToUserId: body.data.delegateToUserId || null },
  });
  return c.json({ user, message: delegateRealtorId ? "Сотрудник уволен, сделки переданы" : "Сотрудник уволен" });
});
