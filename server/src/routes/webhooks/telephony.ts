import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getClientIp } from "../../lib/clientIp.js";
import { db } from "../../db/index.js";
import { integrations } from "../../db/schema.js";
import { getAdapter } from "../../telephony/adapters/index.js";
import { processCallEvent } from "../../telephony/service.js";
import { verifyWebhookAuth } from "../../lib/webhook-secret.js";
import type { Context } from "hono";

const ALLOWED_TELEPHONY_PROVIDERS = new Set([
  "generic", "mango", "zadarma", "uis", "asterisk", "beeline",
]);

async function ingest(c: Context, provider: string) {
  if (!ALLOWED_TELEPHONY_PROVIDERS.has(provider)) {
    return c.json({ error: "Unknown provider" }, 400);
  }
  const ip = getClientIp(c);
  if (!rateLimit(`webhook-tel:${ip}`, 120, 60_000)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const [integration] = await db.select().from(integrations).where(eq(integrations.type, "telephony")).limit(1);
  if (!integration?.enabled) return c.json({ error: "Telephony integration disabled" }, 403);

  const config = (integration.config || {}) as { webhookSecret?: string };
  const secret = c.req.header("X-Webhook-Secret");
  const raw = await c.req.text();
  const check = verifyWebhookAuth(secret, raw, c.req.header("X-Webhook-Signature"), config.webhookSecret);
  if (!check.ok) {
    return c.json({ error: check.error }, check.status);
  }

  const adapter = getAdapter(provider);
  let body: unknown = {};
  try {
    const ct = c.req.header("content-type") || "";
    if (ct.includes("xml")) {
      body = raw;
    } else if (ct.includes("json")) {
      body = raw ? JSON.parse(raw) : {};
    } else {
      const params = new URLSearchParams(raw);
      const form: Record<string, string> = {};
      for (const [k, v] of params.entries()) form[k] = v;
      const textField = form.payload || form.data;
      if (typeof textField === "string" && (textField.trim().startsWith("<") || textField.trim().startsWith("{"))) {
        body = textField;
      } else if (Object.keys(form).length) {
        body = form;
      }
    }
  } catch {
    body = raw || {};
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
