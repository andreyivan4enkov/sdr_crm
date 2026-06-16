import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { notificationSettings, pushSubscriptions } from "../db/schema.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { mergeNotificationPrefs } from "../lib/notification-prefs.js";
import { ensureVapid, getVapidPublicKey } from "../lib/push.js";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, user.id)).limit(1);
  return c.json({
    settings: mergeNotificationPrefs(row?.settings),
    pushAvailable: Boolean(getVapidPublicKey()),
  });
});

notificationRoutes.patch("/settings", async (c) => {
  const user = c.get("user");
  const body = z.object({
    pushEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    incomingCall: z.boolean().optional(),
    newLead: z.boolean().optional(),
    stageNotify: z.boolean().optional(),
    callTranscript: z.boolean().optional(),
    callRecording: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [existing] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, user.id)).limit(1);
  const merged = mergeNotificationPrefs({ ...(existing?.settings || {}), ...body.data });

  await db.insert(notificationSettings).values({
    userId: user.id,
    settings: merged,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: notificationSettings.userId,
    set: { settings: merged, updatedAt: new Date() },
  });

  return c.json({ settings: merged });
});

notificationRoutes.get("/vapid-public-key", async (c) => {
  const key = ensureVapid() || getVapidPublicKey();
  if (!key) return c.json({ available: false });
  return c.json({ available: true, publicKey: key });
});

notificationRoutes.post("/push/subscribe", async (c) => {
  const user = c.get("user");
  const body = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);
  if (!ensureVapid()) return c.json({ error: "Push не настроен на сервере (VAPID)" }, 503);

  await db.insert(pushSubscriptions).values({
    userId: user.id,
    endpoint: body.data.endpoint,
    p256dh: body.data.keys.p256dh,
    auth: body.data.keys.auth,
  }).onConflictDoUpdate({
    target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
    set: { p256dh: body.data.keys.p256dh, auth: body.data.keys.auth },
  });

  const prefs = mergeNotificationPrefs(null);
  prefs.pushEnabled = true;
  await db.insert(notificationSettings).values({
    userId: user.id,
    settings: prefs,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: notificationSettings.userId,
    set: { settings: prefs, updatedAt: new Date() },
  });

  return c.json({ ok: true });
});

notificationRoutes.delete("/push/subscribe", async (c) => {
  const user = c.get("user");
  const body = z.object({ endpoint: z.string().url().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (body.success && body.data.endpoint) {
    await db.delete(pushSubscriptions).where(
      and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, body.data.endpoint)),
    );
  } else {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  }
  return c.json({ ok: true });
});
