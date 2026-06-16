import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { leads, leadNotes, calls, tasks } from "../db/schema.js";

export async function eraseLeadPersonalData(leadId: string) {
  const now = new Date();
  await db.update(leads).set({
    name: "Удалён по запросу",
    phone: null,
    email: null,
    region: null,
    preferredTime: null,
    comment: null,
    custom: {},
    pdConsent: false,
    erasedAt: now,
    updatedAt: now,
  }).where(eq(leads.id, leadId));

  await db.delete(leadNotes).where(eq(leadNotes.leadId, leadId));

  await db.update(calls).set({
    phone: "скрыт",
    recordingUrl: null,
    transcript: null,
    aiSummary: null,
    aiSuggestions: {},
    transcriptStatus: "none",
  }).where(eq(calls.leadId, leadId));

  await db.update(tasks).set({
    text: "[обезличено]",
  }).where(eq(tasks.leadId, leadId));

  return now;
}

export async function revokeLeadConsent(leadId: string, erase = false) {
  const now = new Date();
  await db.update(leads).set({
    pdConsentRevoked: true,
    pdConsentRevokedAt: now,
    updatedAt: now,
  }).where(eq(leads.id, leadId));

  if (erase) await eraseLeadPersonalData(leadId);
  return now;
}

export async function buildLeadExport(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return null;

  const notes = await db.select().from(leadNotes).where(eq(leadNotes.leadId, leadId));
  const leadCalls = await db.select().from(calls).where(eq(calls.leadId, leadId));
  const leadTasks = await db.select().from(tasks).where(eq(tasks.leadId, leadId));

  return {
    exportedAt: new Date().toISOString(),
    subject: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      region: lead.region,
      preferredTime: lead.preferredTime,
      comment: lead.comment,
      custom: lead.custom,
      source: lead.source,
      pdConsent: lead.pdConsent,
      pdConsentAt: lead.pdConsentAt,
      pdConsentRevoked: lead.pdConsentRevoked,
      pdConsentRevokedAt: lead.pdConsentRevokedAt,
      erasedAt: lead.erasedAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    },
    notes: notes.map((n: typeof leadNotes.$inferSelect) => ({
      text: n.text,
      author: n.author,
      createdAt: n.createdAt,
    })),
    calls: leadCalls.map((c: typeof calls.$inferSelect) => ({
      phone: c.phone,
      direction: c.direction,
      duration: c.duration,
      createdAt: c.createdAt,
    })),
    tasks: leadTasks.map((t: typeof tasks.$inferSelect) => ({
      text: t.text,
      assignee: t.assignee,
      done: t.done,
      createdAt: t.createdAt,
    })),
  };
}
