import "../env.js";
import { and, isNull, lt, eq, inArray } from "drizzle-orm";
import { db, closeDb } from "../db/index.js";
import { leads, blueprintInstances } from "../db/schema.js";
import { eraseLeadPersonalData } from "../lib/lead-pd.js";
import { writeAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";

const days = Number(process.env.PD_RETENTION_DAYS || 1095);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function run() {
  const stale = await db.select({ id: leads.id }).from(leads).where(
    and(
      isNull(leads.erasedAt),
      lt(leads.updatedAt, cutoff),
    ),
  );

  let count = 0;
  for (const row of stale) {
    await eraseLeadPersonalData(row.id);
    count++;
  }

  if (count > 0) {
    await writeAudit({
      action: "lead.retention_purge",
      meta: { count, cutoff: cutoff.toISOString(), retentionDays: days },
    });
  }

  logger.info("retention.purge_complete", { count, retentionDays: days });

  const bpCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await db.delete(blueprintInstances).where(
    and(
      inArray(blueprintInstances.state, ["COMPLETED", "FAILED"]),
      lt(blueprintInstances.updatedAt, bpCutoff),
    ),
  );
  logger.info("retention.blueprint_instances_purged", { cutoff: bpCutoff.toISOString() });

  await closeDb();
}

run().catch((e) => {
  logger.logError(e, "retention.purge_failed");
  process.exit(1);
});
