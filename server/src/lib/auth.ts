import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser } from "../db/schema.js";

const COOKIE_NAME = "jbr_token";
const TOKEN_TTL = "7d";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be at least 16 chars");
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(user: AuthUser) {
  return new SignJWT({
    sub: user.id,
    login: user.login,
    role: user.roleName,
    status: user.status,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return payload as { sub: string; login: string; role: string | null; status: string };
}

export function getCookieName() {
  return COOKIE_NAME;
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
