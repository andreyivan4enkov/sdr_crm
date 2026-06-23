import type { Context } from "hono";

function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function getClientIp(c: Context): string {
  const hops = trustedProxyHops();
  const xff = c.req.header("x-forwarded-for");
  if (xff && hops > 0) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const idx = Math.max(0, parts.length - hops);
    const ip = parts[idx];
    if (ip) return ip;
  }
  return c.req.header("x-real-ip") || "unknown";
}
