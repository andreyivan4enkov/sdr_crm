import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, roles, profiles, orgUnits } from "../db/schema.js";
import { verifyToken, getCookieName } from "../lib/auth.js";
import { hasPermission, hasAnyPermission } from "../lib/permissions.js";
import type { AuthUser } from "../db/schema.js";

export type AppEnv = {
  Variables: {
    requestId: string;
    user: AuthUser;
  };
};

async function loadUser(userId: string): Promise<AuthUser | null> {
  const rows = await db
    .select({
      id: users.id,
      login: users.login,
      email: users.email,
      status: users.status,
      roleId: users.roleId,
      roleName: roles.name,
      roleLabel: roles.label,
      permissions: roles.permissions,
      profileName: profiles.name,
      profilePhone: profiles.phone,
      profileRegion: profiles.region,
      profilePosition: profiles.position,
      profileAvatar: profiles.avatar,
      profileOrgUnitId: profiles.orgUnitId,
      orgUnitName: orgUnits.name,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(orgUnits, eq(profiles.orgUnitId, orgUnits.id))
    .where(eq(users.id, userId))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    login: r.login,
    email: r.email,
    status: r.status,
    roleId: r.roleId,
    roleName: r.roleName,
    roleLabel: r.roleLabel,
    permissions: (r.permissions as string[]) || [],
    orgUnitName: r.orgUnitName,
    profile: r.profileName
      ? {
        name: r.profileName,
        phone: r.profilePhone,
        region: r.profileRegion,
        position: r.profilePosition,
        avatar: r.profileAvatar,
        orgUnitId: r.profileOrgUnitId,
      }
      : null,
  };
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, getCookieName());
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verifyToken(token);
    if (payload.status !== "active") return c.json({ error: "Account not active" }, 403);
    const user = await loadUser(payload.sub);
    if (!user) return c.json({ error: "User not found" }, 401);
    c.set("user", user);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, getCookieName());
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload.status === "active") {
        const user = await loadUser(payload.sub);
        if (user) c.set("user", user);
      }
    } catch { /* ignore */ }
  }
  await next();
});

export function requirePermission(permission: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!hasPermission(user.permissions, permission)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}

export function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!hasAnyPermission(user.permissions, permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}

export { loadUser };
