import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import { validateAvatarDataUrl } from "../../lib/avatar.js";
import { requireAuth, requirePermission, type AppEnv } from "../../middleware/auth.js";

export const adminProfileRoutes = new Hono<AppEnv>();

adminProfileRoutes.use("*", requireAuth, requirePermission("profiles.manage"));

adminProfileRoutes.get("/:userId", async (c) => {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, c.req.param("userId"))).limit(1);
  if (!profile) return c.json({ error: "Not found" }, 404);
  return c.json({ profile });
});

adminProfileRoutes.patch("/:userId", async (c) => {
  const body = z.object({
    name: z.string().optional(),
    phone: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    position: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  let avatar = body.data.avatar;
  if (avatar !== undefined && avatar !== null) {
    try {
      avatar = validateAvatarDataUrl(avatar);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  }

  const userId = c.req.param("userId");
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  if (existing) {
    const [profile] = await db.update(profiles).set({
      ...body.data,
      ...(avatar !== undefined ? { avatar } : {}),
      updatedAt: new Date(),
    }).where(eq(profiles.userId, userId)).returning();
    return c.json({ profile });
  }

  const [profile] = await db.insert(profiles).values({
    userId,
    name: body.data.name || "Сотрудник",
    phone: body.data.phone,
    region: body.data.region,
    position: body.data.position,
    avatar: avatar ?? body.data.avatar,
  }).returning();

  return c.json({ profile }, 201);
});
