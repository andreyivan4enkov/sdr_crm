import "../env.js";
import { db } from "../src/db/index.js";
import { leads } from "../src/db/schema.js";
import { initSdrLayer, leadSdrIndex } from "../src/lib/sdr/index.js";
import { logger } from "../src/lib/logger.js";

await initSdrLayer();

const batchSize = 500;
let offset = 0;
let total = 0;

for (;;) {
  const batch = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      email: leads.email,
      region: leads.region,
      comment: leads.comment,
    })
    .from(leads)
    .limit(batchSize)
    .offset(offset);
  if (!batch.length) break;
  for (const lead of batch) {
    await leadSdrIndex.upsert(lead);
    total++;
  }
  offset += batchSize;
  if (batch.length < batchSize) break;
}

logger.info("sdr.reindex.done", { total });
process.exit(0);
