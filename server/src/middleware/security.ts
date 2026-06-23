import type { Context, Next } from "hono";
import { getClientIp } from "../lib/clientIp.js";
import { rateLimitAsync } from "./rateLimit.js";

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1_048_576);

/** Глобальный лимит запросов к API (защита от флуда и брутфорса) */
export async function globalApiRateLimit(c: Context, next: Next) {
  if (process.env.NODE_ENV !== "production") return next();
  const ip = getClientIp(c);
  const max = Number(process.env.API_RATE_LIMIT_PER_MIN || 400);
  if (!(await rateLimitAsync(`api-global:${ip}`, max, 60_000))) {
    return c.json({ error: "Слишком много запросов. Попробуйте позже." }, 429);
  }
  return next();
}

/** Ограничение размера тела запроса (проверка Content-Length и фактического размера). */
export async function bodySizeLimit(c: Context, next: Next) {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const cl = c.req.header("content-length");
  if (cl && Number(cl) > MAX_BODY_BYTES) {
    return c.json({ error: "Слишком большой запрос" }, 413);
  }
  const raw = c.req.raw;
  if (raw.body) {
    const buf = await raw.clone().arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      return c.json({ error: "Слишком большой запрос" }, 413);
    }
  }
  return next();
}

/** Заголовки: закрытие от индексации + усиление защиты */
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  if (!c.res.headers.get("X-Frame-Options")) {
    c.header("X-Frame-Options", "DENY");
  }
  if (!c.res.headers.get("Permissions-Policy")) {
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  }
}
