import { SignJWT, jwtVerify } from "jose";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be at least 16 chars");
  return new TextEncoder().encode(s);
}

export async function createInviteToken(roleId: string, roleName: string, orgUnitId?: string | null, days = 7) {
  return new SignJWT({ type: "invite", roleId, roleName, orgUnitId: orgUnitId || null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

export async function verifyInviteToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (payload.type !== "invite" || !payload.roleId) return null;
  return {
    roleId: String(payload.roleId),
    roleName: payload.roleName ? String(payload.roleName) : null,
    orgUnitId: payload.orgUnitId ? String(payload.orgUnitId) : null,
  };
}

export function inviteUrl(token: string) {
  const base = process.env.PUBLIC_URL || "http://localhost:5173";
  return `${base}/register?token=${encodeURIComponent(token)}`;
}
