import "../env.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";
import * as schema from "./schema.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const usePglite = process.env.USE_PGLITE === "1" || !process.env.DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let pgClient: Sql | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let pgliteClient: any = null;

if (usePglite) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const rawPath = process.env.PGLITE_PATH || "data/jbrealty";
  const path = rawPath.startsWith("/")
    ? rawPath
    : resolve(serverRoot, rawPath.replace(/^\.\//, ""));
  mkdirSync(dirname(path), { recursive: true });
  const client = new PGlite(path);
  pgliteClient = client;
  db = drizzle(client, { schema });
  const { logger } = await import("../lib/logger.js");
  logger.info("db.pglite", { path });
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
  if (pgClient) await pgClient.end();
}
