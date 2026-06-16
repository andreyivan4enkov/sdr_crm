import "../env.js";
import { closeDb } from "./index.js";
import { runMigrations } from "./migrations-run.js";

await runMigrations();
await closeDb();
console.log("Migrations complete");
