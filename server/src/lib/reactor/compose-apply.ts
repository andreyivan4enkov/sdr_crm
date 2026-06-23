import type { ComposePlan, ReactorGraph, ReactorGraphKind } from "@sdr-crm/reactor-core";
import { desugarV3Graph, validateReactorGraph } from "@sdr-crm/reactor-core";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reactorGraphs } from "../../db/schema.js";
import type { ReactorProduct } from "./product-service.js";

export type ComposeApplyResult =
  | { ok: true }
  | { ok: false; kind: ReactorGraphKind; validation: ReturnType<typeof validateReactorGraph> };

/** Записывает графы из compose-плана; graphKind ограничивает запись одним kind (режим Маска). */
export async function applyComposePlanGraphs(
  product: ReactorProduct,
  plan: ComposePlan,
  graphKind?: ReactorGraphKind,
): Promise<ComposeApplyResult> {
  if (!plan.graphs) return { ok: true };

  const kinds = graphKind
    ? [graphKind]
    : (Object.keys(plan.graphs) as ReactorGraphKind[]);

  return await db.transaction(async (tx) => {
    const rows = await tx.select().from(reactorGraphs).where(eq(reactorGraphs.productId, product.id));

    for (const kind of kinds) {
      const graph = plan.graphs[kind];
      if (!graph) continue;
      const v = validateReactorGraph(graph, kind);
      if (!v.ok) return { ok: false, kind, validation: v } as ComposeApplyResult;
      const row = rows.find((r) => r.kind === kind);
      const compiled = kind === "flow" ? desugarV3Graph(graph) : null;
      if (row) {
        await tx.update(reactorGraphs).set({
          graph,
          compiled,
          revision: row.revision + 1,
          updatedAt: new Date(),
        }).where(eq(reactorGraphs.id, row.id));
      } else {
        await tx.insert(reactorGraphs).values({
          productId: product.id,
          kind,
          graph,
          compiled,
        });
      }
    }
    return { ok: true } as ComposeApplyResult;
  });
}