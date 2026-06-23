import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { crmMeta } from "../db/schema.js";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be at least 16 chars");
  return new TextEncoder().encode(s);
}

function inviteMetaKey(jti: string) {
  return `invite_jti:${jti}`;
}

function inviteHashKey(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return `invite_used:${hash}`;
}

export async function createInviteToken(roleId: string, roleName: string, orgUnitId?: string | null, days = 7) {
  const jti = crypto.randomUUID();
  await db.insert(crmMeta).values({
    key: inviteMetaKey(jti),
    value: { used: false, createdAt: new Date().toISOString() },
  }).onConflictDoNothing();

  return new SignJWT({ type: "invite", roleId, roleName, orgUnitId: orgUnitId || null, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

export async function verifyInviteToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (payload.type !== "invite" || !payload.roleId) return null;

  const jti = payload.jti ? String(payload.jti) : null;
  if (jti) {
    const [row] = await db.select().from(crmMeta).where(eq(crmMeta.key, inviteMetaKey(jti))).limit(1);
    if (!row) return null;
    if ((row.value as { used?: boolean }).used) return null;
  } else {
    const [row] = await db.select().from(crmMeta).where(eq(crmMeta.key, inviteHashKey(token))).limit(1);
    if (row) return null;
  }

  return {
    roleId: String(payload.roleId),
    roleName: payload.roleName ? String(payload.roleName) : null,
    orgUnitId: payload.orgUnitId ? String(payload.orgUnitId) : null,
    jti,
  };
}

/** Помечает invite-токен использованным после успешной регистрации. */
export async function consumeInviteToken(token: string, jti: string | null) {
  if (jti) {
    const key = inviteMetaKey(jti);
    const [row] = await db.select().from(crmMeta).where(eq(crmMeta.key, key)).limit(1);
    if (!row || (row.value as { used?: boolean }).used) return false;
    await db.update(crmMeta).set({
      value: { ...(row.value as Record<string, unknown>), used: true, usedAt: new Date().toISOString() },
    }).where(eq(crmMeta.key, key));
    return true;
  }
  await db.insert(crmMeta).values({
    key: inviteHashKey(token),
    value: { used: true, usedAt: new Date().toISOString() },
  }).onConflictDoNothing();
  return true;
}

export function inviteUrl(token: string) {
  const base = process.env.PUBLIC_URL || "http://localhost:5173";
  return `${base}/register?token=${encodeURIComponent(token)}`;
}
