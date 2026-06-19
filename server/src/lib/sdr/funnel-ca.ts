import { funnelCaDensity } from "@sdr-crm/sdr-core";
import { db } from "../../db/index.js";
import { leads, stages } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { sdrConfig } from "./config.js";

export async function computeFunnelCaMetric() {
  if (!sdrConfig.funnelCa) return null;
  const stageRows = await db.select({ id: stages.id, sortOrder: stages.sortOrder }).from(stages).orderBy(stages.sortOrder);
  const counts: number[] = [];
  for (const stage of stageRows) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.statusId, stage.id));
    counts.push(row?.count ?? 0);
  }
  return funnelCaDensity(counts);
}
