import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getClientIp } from "../../lib/clientIp.js";
import { db } from "../../db/index.js";
import { integrations } from "../../db/schema.js";
import { getAdapter } from "../../telephony/adapters/index.js";
import { processCallEvent } from "../../telephony/service.js";
import type { Context } from "hono";

async function ingest(c: Context, provider: string) {
  const ip = getClientIp(c);
  if (!rateLimit(`webhook-tel:${ip}`, 120, 60_000)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const [integration] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  if (!integration?.enabled) return c.json({ error: "Telephony integration disabled" }, 403);

  const config = (integration.config || {}) as { webhookSecret?: string };
  const secret = c.req.header("X-Webhook-Secret") || c.req.query("secret");
  const prod = process.env.NODE_ENV === "production";
  if (prod && !config.webhookSecret) {
    return c.json({ error: "Telephony webhook secret not configured" }, 503);
  }
  if (config.webhookSecret) {
    if (secret !== config.webhookSecret) return c.json({ error: "Invalid webhook secret" }, 401);
  } else if (prod) {
    return c.json({ error: "Invalid webhook secret" }, 401);
  }

  const adapter = getAdapter(provider);
  let body: unknown = {};
  try {
    const ct = c.req.header("content-type") || "";
    if (ct.includes("xml")) {
      body = await c.req.text();
    } else if (ct.includes("json")) {
      body = await c.req.json();
    } else {
      const form = await c.req.parseBody();
      const textField = form.payload || form.data;
      if (typeof textField === "string" && (textField.trim().startsWith("<") || textField.trim().startsWith("{"))) {
        body = textField;
      } else {
        body = Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === "string"));
      }
    }
  } catch {
    try { body = await c.req.text(); } catch { body = {}; }
  }

  const query = c.req.query();
  const parsed = adapter.parse(body, query);
  if (!parsed) {
    if (provider === "beeline") return c.json({ ok: true, ignored: true });
    return c.json({ error: "Unrecognized payload" }, 400);
  }

  const events = Array.isArray(parsed) ? parsed : [parsed];
  const results = [];
  for (const ev of events) {
    results.push(await processCallEvent(ev, provider));
  }

  return c.json({ ok: true, processed: results.length, results });
}

export const telephonyWebhook = new Hono();

telephonyWebhook.post("/beeline/null", (c) => ingest(c, "beeline"));
telephonyWebhook.post("/:provider", (c) => ingest(c, c.req.param("provider")));
