import { randomBytes } from "node:crypto";

type QrEntry = {
  userId: string;
  userLogin: string;
  expiresAt: number;
  used: boolean;
};

const TTL_MS = 3 * 60 * 1000;
const store = new Map<string, QrEntry>();

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now || v.used) store.delete(k);
  }
}

export function createQrLoginToken(userId: string, userLogin: string) {
  prune();
  const token = randomBytes(24).toString("base64url");
  store.set(token, { userId, userLogin, expiresAt: Date.now() + TTL_MS, used: false });
  return { token, expiresAt: Date.now() + TTL_MS };
}

export function consumeQrLoginToken(token: string): { userId: string; userLogin: string } | null {
  prune();
  const entry = store.get(token);
  if (!entry || entry.used || entry.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }
  entry.used = true;
  store.set(token, entry);
  return { userId: entry.userId, userLogin: entry.userLogin };
}

export function isAllowedQrBaseUrl(baseUrl: string, allowedOrigins: string[]) {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const origin = u.origin;
    if (allowedOrigins.includes(origin)) return true;
    if (process.env.NODE_ENV !== "production") {
      const host = u.hostname;
      if (host === "localhost" || host === "127.0.0.1" || /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
