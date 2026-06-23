import "../env.js";
import type { Sql } from "postgres";
import * as schema from "./schema.js";
import {
  closePgliteGlobals,
  getPgliteGlobals,
  isPgliteAbortError,
  pgliteDataPath,
  probePglite,
  waitForStaleLock,
  wipePgliteData,
  writePgliteLock,
} from "./pglite-lifecycle.js";

const usePglite = process.env.USE_PGLITE === "1" || !process.env.DATABASE_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let pgClient: Sql | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let pgliteClient: any = null;

async function openPgliteConnection() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const path = pgliteDataPath();
  const { logger } = await import("../lib/logger.js");
  const g = getPgliteGlobals();

  await waitForStaleLock(path);
  writePgliteLock(path);

  if (g.__sdrPgliteClient && g.__sdrDb) {
    try {
      await probePglite(g.__sdrPgliteClient);
      logger.info("db.pglite.reuse", { path });
      return { client: g.__sdrPgliteClient, db: g.__sdrDb };
    } catch (e) {
      await g.__sdrPgliteClient.close().catch(() => {});
      g.__sdrPgliteClient = undefined;
      g.__sdrDb = undefined;
      if (process.env.NODE_ENV !== "production" && isPgliteAbortError(e)) {
        logger.warn("db.pglite.reuse_failed", {
          path,
          err: e instanceof Error ? e.message : String(e),
        });
        wipePgliteData(path);
        await sleep(400);
        writePgliteLock(path);
      }
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const client = new PGlite(path);
      await probePglite(client);
      const drizzleDb = drizzle(client, { schema });
      g.__sdrPgliteClient = client;
      g.__sdrDb = drizzleDb;
      logger.info(attempt > 0 ? "db.pglite.retry_ok" : "db.pglite", { path, attempt });
      return { client, db: drizzleDb };
    } catch (e) {
      lastErr = e;
      if (attempt < 4 && isPgliteAbortError(e)) {
        logger.warn("db.pglite.retry", { path, attempt, err: e instanceof Error ? e.message : String(e) });
        await closePgliteGlobals();
        await waitForStaleLock(path);
        await sleep(450 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (process.env.NODE_ENV !== "production" && isPgliteAbortError(lastErr)) {
    logger.warn("db.pglite.wipe", { path, err: lastErr instanceof Error ? lastErr.message : String(lastErr) });
    await closePgliteGlobals();
    wipePgliteData(path);
    await sleep(400);
    writePgliteLock(path);
    const client = new PGlite(path);
    await probePglite(client);
    const drizzleDb = drizzle(client, { schema });
    g.__sdrPgliteClient = client;
    g.__sdrDb = drizzleDb;
    logger.info("db.pglite.wipe_ok", { path });
    return { client, db: drizzleDb };
  }

  throw lastErr;
}

export async function reopenDb() {
  if (!usePglite) return;
  await closePgliteGlobals();
  pgliteClient = null;
  const opened = await openPgliteConnection();
  pgliteClient = opened.client;
  db = opened.db;
}

if (usePglite) {
  const opened = await openPgliteConnection();
  pgliteClient = opened.client;
  db = opened.db;
} else {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  pgClient = postgres(process.env.DATABASE_URL!, { max: 10 });
  db = drizzle(pgClient, { schema });
  const { logger } = await import("../lib/logger.js");
  logger.info("db.postgres");
}

export { db, usePglite as isPglite };

export async function closeDb() {
  if (pgliteClient) {
    await closePgliteGlobals();
    pgliteClient = null;
  }
  if (pgClient) await pgClient.end();
}
