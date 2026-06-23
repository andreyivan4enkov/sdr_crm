import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { leads, leadNotes, tasks } from "../db/schema.js";
import { dispatchNotification } from "./notify.js";
import { resolveAssigneeFromDealManager, resolveAssigneeFromUser } from "./lead-access.js";
import type { AutomationResult } from "./automations.js";

type LeadRow = typeof leads.$inferSelect;

const BUILTIN_FIELDS = new Set(["name", "phone", "email", "region", "preferredTime", "comment"]);

export async function persistAutomationSideEffects(
  leadId: string,
  existing: LeadRow,
  result: AutomationResult,
): Promise<Record<string, unknown>> {
  const leadPatch: Record<string, unknown> = {};

  for (const n of result.extraNotes) {
    await db.insert(leadNotes).values({ leadId, text: n.text, author: n.author });
  }
  for (const t of result.extraTasks) {
    await db.insert(tasks).values({
      text: t.text,
      assignee: t.assignee,
      author: t.author,
      leadId: t.leadId,
      status: t.status || "new",
      priority: t.priority || "normal",
    });
  }
  for (const m of result.messages) {
    await dispatchNotification({
      kind: "stageNotify",
      text: m.text,
      leadId: m.leadId,
      event: "notification",
    });
  }

  if (result.assignUserId !== undefined) {
    Object.assign(leadPatch, await resolveAssigneeFromUser(result.assignUserId));
  } else if (result.assignDealManagerId !== undefined) {
    Object.assign(leadPatch, await resolveAssigneeFromDealManager(result.assignDealManagerId));
  }

  if (result.fieldPatches) {
    const custom = { ...(existing.custom || {}) };
    for (const [key, value] of Object.entries(result.fieldPatches)) {
      if (BUILTIN_FIELDS.has(key)) {
        leadPatch[key] = value;
      } else {
        custom[key] = value;
      }
    }
    leadPatch.custom = custom;
  }

  if (result.moveToStageId) {
    leadPatch.statusId = result.moveToStageId;
  }

  if (result.copyTo) {
    const [src] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (src) {
      const [copy] = await db.insert(leads).values({
        name: src.name,
        phone: src.phone,
        email: src.email,
        region: src.region,
        preferredTime: src.preferredTime,
        comment: src.comment ? `${src.comment}\n\n[Копия сделки]` : "[Копия сделки]",
        source: src.source,
        channelId: src.channelId,
        pipelineId: result.copyTo.pipelineId,
        statusId: result.copyTo.stageId,
        assignedDealManagerId: src.assignedDealManagerId,
        assignedUserId: src.assignedUserId,
        watchers: src.watchers,
        custom: src.custom,
        pdConsent: src.pdConsent,
        pdConsentAt: src.pdConsentAt,
        createdBy: src.createdBy,
      }).returning();
      await db.insert(leadNotes).values({
        leadId: copy.id,
        text: `⚙ Копия сделки из воронки (исходная: ${src.name})`,
        author: "Автоматизация",
      });
      await dispatchNotification({
        kind: "newLead",
        text: `Копия сделки: ${copy.name || "Без имени"}`,
        leadId: copy.id,
        event: "notification",
      });
    }
  }

  return leadPatch;
}
