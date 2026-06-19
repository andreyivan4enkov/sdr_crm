import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, isPglite, pgliteClient } from "./index.js";
import { logger } from "../lib/logger.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const drizzleDir = resolve(serverRoot, "drizzle");

const INCREMENTAL_MIGRATIONS = [
  "0001_security.sql",
  "0002_integrator_role.sql",
  "0003_consent_revoke.sql",
  "0004_totp_2fa.sql",
  "0005_org_structure.sql",
  "0006_manager_role.sql",
  "0007_telephony_ai_notifications.sql",
  "0008_marketer_role.sql",
  "0009_profile_position.sql",
  "0010_analytics_dashboards.sql",
  "0011_analytics_grants.sql",
  "0012_tasks_v2.sql",
  "0013_tasks_participants.sql",
  "0014_task_chat.sql",
  "0015_team_invite_task_meta.sql",
  "0016_lead_watchers.sql",
  "0017_field_grid.sql",
  "0018_lead_assigned_user.sql",
  "0019_audit_entity_idx.sql",
  "0020_pipelines.sql",
  "0021_lead_sdr_vectors.sql",
] as const;

function splitSql(sql: string) {
  const statements: string[] = [];
  let buf = "";
  let inDoBlock = false;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!inDoBlock && /^DO\s+\$\$/i.test(trimmed)) inDoBlock = true;

    buf += `${line}\n`;

    if (inDoBlock) {
      if (/END\s+\$\$\s*;?\s*$/i.test(trimmed)) {
        statements.push(buf.trim());
        buf = "";
        inDoBlock = false;
      }
      continue;
    }

    if (trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      const stmt = buf.trim();
      if (stmt.length > 0 && !stmt.startsWith("--")) statements.push(stmt);
      buf = "";
    }
  }

  const tail = buf.trim();
  if (tail.length > 0 && !tail.startsWith("--")) statements.push(tail);

  return statements;
}

async function runSqlFile(path: string) {
  const statements = splitSql(readFileSync(path, "utf8"));
  for (const stmt of statements) {
    if (isPglite && /^\s*GRANT\s/i.test(stmt)) continue;
    if (isPglite && pgliteClient) {
      await pgliteClient.exec(`${stmt};`);
    } else {
      const { sql } = await import("drizzle-orm");
      await db.execute(sql.raw(`${stmt};`));
    }
  }
}

async function ensurePgliteMigrationsTable() {
  if (!pgliteClient) return;
  await pgliteClient.exec(`
    CREATE TABLE IF NOT EXISTS _jb_migrations (
      tag text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function pgliteMigrationApplied(tag: string) {
  if (!pgliteClient) return false;
  const res = await pgliteClient.query(
    "SELECT 1 FROM _jb_migrations WHERE tag = $1 LIMIT 1",
    [tag],
  );
  return Boolean(res.rows?.length);
}

async function markPgliteMigration(tag: string) {
  if (!pgliteClient) return;
  await pgliteClient.query(
    "INSERT INTO _jb_migrations (tag) VALUES ($1) ON CONFLICT DO NOTHING",
    [tag],
  );
}

async function runPgliteMigration(tag: string, file: string) {
  if (await pgliteMigrationApplied(tag)) return;
  await runSqlFile(resolve(drizzleDir, file));
  await markPgliteMigration(tag);
}

async function tableExists(name: string) {
  if (!pgliteClient) return false;
  const res = await pgliteClient.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1",
    [name],
  );
  return Boolean(res.rows?.length);
}

async function runPgliteMigrations() {
  if (!pgliteClient) return;

  await ensurePgliteMigrationsTable();

  if (!(await tableExists("roles"))) {
    await runSqlFile(resolve(drizzleDir, "0000_init.sql"));
    await markPgliteMigration("0000_init");
  }

  for (const file of INCREMENTAL_MIGRATIONS) {
    await runPgliteMigration(file.replace(".sql", ""), file);
  }

  if (!(await tableExists("users"))) {
    logger.warn("db.repair", { msg: "schema incomplete, re-applying migrations" });
    await pgliteClient.exec("DELETE FROM _jb_migrations");
    await runSqlFile(resolve(drizzleDir, "0000_init.sql"));
    await markPgliteMigration("0000_init");
    for (const file of INCREMENTAL_MIGRATIONS) {
      await runPgliteMigration(file.replace(".sql", ""), file);
    }
  }
}

export async function runMigrations() {
  if (isPglite && pgliteClient) {
    await runPgliteMigrations();
    return;
  }
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await migrate(db, { migrationsFolder: drizzleDir });
}
