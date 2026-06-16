import type { AuthUser } from "./types.js";

export function hasPermission(user: AuthUser | null, perm: string) {
  if (!user) return false;
  if (user.permissions?.includes("*")) return true;
  return user.permissions?.includes(perm) ?? false;
}

export function hasAnyPermission(user: AuthUser | null, perms: string[]) {
  return perms.some((p) => hasPermission(user, p));
}

export function normalizeLead(l: import("./types.js").Lead) {
  return {
    ...l,
    status: l.statusId,
    watchers: l.watchers || [],
    notes: (l.notes || []).map((n) => ({ ...n, date: n.createdAt })),
  };
}

type LeadAssignee = {
  assignedUserId?: string | null;
  assignedRealtorId?: string | null;
};

export function canEditLead(
  user: AuthUser | null,
  lead: LeadAssignee & { watchers?: string[] | null },
  userRealtorId?: string | null,
) {
  if (!user) return false;
  if (hasPermission(user, "leads.write")) return true;
  if ((lead.watchers || []).includes(user.id)) return true;
  if (lead.assignedUserId === user.id) return true;
  if (userRealtorId && lead.assignedRealtorId === userRealtorId) return true;
  return false;
}

export function canAssignLead(user: AuthUser | null) {
  return hasPermission(user, "leads.assign") || hasPermission(user, "leads.write");
}
