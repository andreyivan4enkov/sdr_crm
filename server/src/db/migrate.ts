import "../env.js";
import { pgliteDataPath, waitForStaleLock } from "./pglite-lifecycle.js";

await waitForStaleLock(pgliteDataPath());
const { closeDb } = await import("./index.js");
const { runMigrations } = await import("./migrations-run.js");

await runMigrations();
await closeDb();
console.log("Migrations complete");
