import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, isPglite, pgliteClient } from "./index.js";
import { pipelines, leads, stages } from "./schema.js";
import { eq, sql } from "drizzle-orm";
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
  "0022_blueprints.sql",
  "0023_site_reactor.sql",
  "0024_edo.sql",
  "0025_crm_entities.sql",
  "0026_yandex_cloud_ai_channel.sql",
  "0027_legacy_timestamps.sql",
  "0028_task_files_storage.sql",
  "0029_user_locale.sql",
  "0030_mail.sql",
  "0031_resources_assets.sql",
  "0032_crm_fields_extended.sql",
  "0033_reaction_bindings.sql",
  "0034_reactor_v3.sql",
] as const;

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith("--");
    })
    .join("\n")
    .trim();
}

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
        const stmt = stripSqlComments(buf.trim());
        if (stmt.length > 0) statements.push(stmt);
        buf = "";
        inDoBlock = false;
      }
      continue;
    }

    if (trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      const stmt = stripSqlComments(buf.trim());
      if (stmt.length > 0) statements.push(stmt);
      buf = "";
    }
  }

  const tail = stripSqlComments(buf.trim());
  if (tail.length > 0) statements.push(tail);

  return statements;
}

async function runSqlFile(path: string) {
  const statements = splitSql(readFileSync(path, "utf8"));
  for (const stmt of statements) {
    if (isPglite && /^\s*GRANT\s/i.test(stmt)) continue;
    const sqlText = stmt.endsWith(";") ? stmt : `${stmt};`;
    if (isPglite && pgliteClient) {
      await pgliteClient.exec(sqlText);
    } else {
      const { sql } = await import("drizzle-orm");
      await db.execute(sql.raw(sqlText));
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

async function columnExists(table: string, column: string) {
  if (!pgliteClient) return false;
  const res = await pgliteClient.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1",
    [table, column],
  );
  return Boolean(res.rows?.length);
}

async function repairPgliteSchema() {
  if (!pgliteClient) return;
  if (await tableExists("pipelines") && !(await columnExists("pipelines", "pipeline_type"))) {
    logger.warn("db.repair", { msg: "adding missing pipelines.pipeline_type" });
    await pgliteClient.exec(`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS pipeline_type text NOT NULL DEFAULT 'sales';`);
  }
  await repairDuplicatePipelines();
}

async function repairDuplicatePipelines() {
  if (!pgliteClient || !(await tableExists("pipelines"))) return;
  type PipelineRow = typeof pipelines.$inferSelect;
  type StageRow = typeof stages.$inferSelect;
  const allPipelines: PipelineRow[] = await db.select().from(pipelines).orderBy(pipelines.sortOrder);
  const allStages: StageRow[] = await db.select().from(stages);
  const defaults = allPipelines.filter((p: PipelineRow) => p.isDefault);
  if (defaults.length <= 1 && allPipelines.every((p: PipelineRow) => !p.isDefault || allStages.some((s: StageRow) => s.pipelineId === p.id))) {
    return;
  }

  const score = (id: string) => allStages.filter((s: StageRow) => s.pipelineId === id).length;
  const ranked = [...allPipelines].sort((a, b) => score(b.id) - score(a.id));
  const keeper = ranked.find((p) => score(p.id) > 0) ?? ranked[0];
  if (!keeper) return;

  logger.warn("db.repair", { msg: "dedupe pipelines", keeper: keeper.id, count: allPipelines.length });

  for (const p of allPipelines) {
    if (p.id === keeper.id) {
      await db.update(pipelines).set({ isDefault: true }).where(eq(pipelines.id, p.id));
      continue;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads).where(eq(leads.pipelineId, p.id));
    if (score(p.id) === 0 && Number(count) === 0) {
      await db.delete(pipelines).where(eq(pipelines.id, p.id));
    } else {
      await db.update(pipelines).set({ isDefault: false }).where(eq(pipelines.id, p.id));
    }
  }
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

  await repairPgliteSchema();

  if (!(await tableExists("users"))) {
    logger.warn("db.repair", { msg: "schema incomplete, re-applying migrations" });
    await pgliteClient.exec("DELETE FROM _jb_migrations");
    await runSqlFile(resolve(drizzleDir, "0000_init.sql"));
    await markPgliteMigration("0000_init");
    for (const file of INCREMENTAL_MIGRATIONS) {
      await runPgliteMigration(file.replace(".sql", ""), file);
    }
    await repairPgliteSchema();
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
