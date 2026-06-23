import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { leads, dealManagers } from "../db/schema.js";
import type { AuthUser } from "../db/schema.js";
import { hasPermission } from "./permissions.js";

export type LeadScope =
  | { mode: "all" }
  | { mode: "limited"; userId: string; dealManagerId: string | null };

export function canReadAllLeads(permissions: string[]) {
  return hasPermission(permissions, "*") || hasPermission(permissions, "leads.read_all");
}

export async function getDealManagerIdForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: dealManagers.id })
    .from(dealManagers)
    .where(eq(dealManagers.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

export async function resolveLeadScope(user: AuthUser): Promise<LeadScope> {
  if (canReadAllLeads(user.permissions)) return { mode: "all" };
  const dealManagerId = await getDealManagerIdForUser(user.id);
  return { mode: "limited", userId: user.id, dealManagerId };
}

function watchersContain(userId: string) {
  return sql`${leads.watchers} @> ${JSON.stringify([userId])}::jsonb`;
}

export function leadScopeWhere(scope: LeadScope, extra?: SQL): SQL | undefined {
  let base: SQL | undefined;
  if (scope.mode === "limited") {
    const parts: SQL[] = [
      eq(leads.assignedUserId, scope.userId),
      watchersContain(scope.userId),
    ];
    if (scope.dealManagerId) parts.push(eq(leads.assignedDealManagerId, scope.dealManagerId));
    base = or(...parts);
  }
  if (base && extra) return and(base, extra);
  return base ?? extra;
}

export async function canAccessLead(
  user: AuthUser,
  lead: { assignedDealManagerId?: string | null; assignedUserId?: string | null; watchers?: string[] | null },
) {
  const scope = await resolveLeadScope(user);
  if (scope.mode === "all") return true;
  if (lead.assignedUserId === user.id) return true;
  if ((lead.watchers || []).includes(user.id)) return true;
  if (scope.dealManagerId && lead.assignedDealManagerId === scope.dealManagerId) return true;
  return false;
}

export async function accessibleLeadIds(scope: LeadScope): Promise<string[]> {
  if (scope.mode === "all") return [];
  const where = leadScopeWhere(scope);
  if (!where) return [];
  const rows = await db.select({ id: leads.id }).from(leads).where(where);
  return rows.map((r: { id: string }) => r.id);
}

export async function resolveAssigneeFromUser(userId: string | null | undefined) {
  if (!userId) return { assignedUserId: null, assignedDealManagerId: null };
  const dealManagerId = await getDealManagerIdForUser(userId);
  return { assignedUserId: userId, assignedDealManagerId: dealManagerId };
}

export async function canEditLead(
  user: AuthUser,
  lead: { assignedDealManagerId?: string | null; assignedUserId?: string | null; watchers?: string[] | null },
) {
  if (hasPermission(user.permissions, "leads.write")) return true;
  if ((lead.watchers || []).includes(user.id)) return true;
  if (lead.assignedUserId === user.id) return true;
  const dealManagerId = await getDealManagerIdForUser(user.id);
  if (dealManagerId && lead.assignedDealManagerId === dealManagerId) return true;
  return false;
}

export function canAssignLead(user: AuthUser) {
  return hasPermission(user.permissions, "leads.assign")
    || hasPermission(user.permissions, "leads.write");
}

const ASSIGN_PATCH_KEYS = ["assignedUserId", "assignedDealManagerId", "watchers"] as const;

export function sanitizeLeadPatchForUser<T extends Record<string, unknown>>(user: AuthUser, patch: T): T {
  if (canAssignLead(user)) return patch;
  const next = { ...patch };
  for (const key of ASSIGN_PATCH_KEYS) delete next[key];
  return next;
}

export async function resolveAssigneeFromDealManager(dealManagerId: string | null | undefined) {
  if (!dealManagerId) return { assignedUserId: null, assignedDealManagerId: null };
  const [row] = await db.select({ userId: dealManagers.userId }).from(dealManagers).where(eq(dealManagers.id, dealManagerId)).limit(1);
  return { assignedUserId: row?.userId ?? null, assignedDealManagerId: dealManagerId };
}
