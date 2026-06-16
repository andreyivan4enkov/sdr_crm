import { Hono, type Context } from "hono";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { z } from "zod";
import { requireAuth, requirePermission, type AppEnv } from "../../middleware/auth.js";
import { writeAudit } from "../../lib/audit.js";
import { getClientIp } from "../../lib/clientIp.js";
import {
  getBackupStatus, readBackupConfig, resolveBackupFile, runBackup, runBackupSync, writeBackupConfig,
} from "../../lib/backup-admin.js";

export const adminBackupRoutes = new Hono<AppEnv>();

adminBackupRoutes.use("*", requireAuth);
adminBackupRoutes.use("*", requirePermission("settings.manage"));

async function auditBackup(c: Context<AppEnv>, action: string, meta?: Record<string, unknown>) {
  const user = c.get("user");
  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: action as "settings.change",
    entityType: "backup",
    entityId: "system",
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent"),
    meta,
  });
}

adminBackupRoutes.get("/", async (c) => {
  return c.json(await getBackupStatus());
});

adminBackupRoutes.patch("/config", async (c) => {
  const body = z.object({
    remoteEnabled: z.boolean().optional(),
    remoteUrl: z.string().max(500).optional(),
    retentionDays: z.number().int().min(3).max(90).optional(),
    alertWebhook: z.string().max(500).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const current = await readBackupConfig();
  const saved = await writeBackupConfig({ ...current, ...body.data });
  await auditBackup(c, "settings.change", { section: "backup_config", config: saved });
  return c.json({ config: saved });
});

adminBackupRoutes.post("/run", async (c) => {
  try {
    const result = await runBackup();
    await auditBackup(c, "settings.change", { section: "backup_run", file: result.latest?.name });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backup failed";
    await auditBackup(c, "settings.change", { section: "backup_run_failed", error: msg });
    return c.json({ error: msg }, 500);
  }
});

adminBackupRoutes.post("/sync", async (c) => {
  try {
    const result = await runBackupSync();
    await auditBackup(c, "settings.change", { section: "backup_sync" });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return c.json({ error: msg }, 500);
  }
});

adminBackupRoutes.get("/download/:name", async (c) => {
  const name = c.req.param("name");
  const full = resolveBackupFile(name);
  if (!full) return c.json({ error: "Not found" }, 404);

  try {
    const info = await stat(full);
    await auditBackup(c, "settings.change", { section: "backup_download", file: name, size: info.size });
    const nodeStream = createReadStream(full);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});
