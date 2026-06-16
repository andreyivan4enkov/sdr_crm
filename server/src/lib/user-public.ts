import type { AuthUser } from "../db/schema.js";

/** Публичное представление пользователя для фронтенда */
export function toApiUser(user: AuthUser) {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    status: user.status,
    role: user.roleName,
    roleLabel: user.roleLabel ?? user.roleName,
    permissions: user.permissions,
    name: user.profile?.name || user.login,
    phone: user.profile?.phone ?? undefined,
    region: user.profile?.region ?? undefined,
    position: user.profile?.position ?? undefined,
    avatar: user.profile?.avatar ?? undefined,
    orgUnitId: user.profile?.orgUnitId ?? undefined,
    orgUnitName: user.orgUnitName ?? undefined,
  };
}
