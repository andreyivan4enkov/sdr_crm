import type { TeamMember } from "@sdr-crm/api-client";

export function memberById(members: TeamMember[], id?: string | null) {
  if (!id) return undefined;
  return members.find((m) => m.id === id);
}

export function leadResponsibleMember(
  lead: { assignedUserId?: string | null; assignedDealManagerId?: string | null },
  members: TeamMember[],
  dealManagers: { id: string; name: string; userId?: string | null }[],
) {
  const byUser = memberById(members, lead.assignedUserId);
  if (byUser) return byUser;
  const dealManager = dealManagers.find((r) => r.id === lead.assignedDealManagerId);
  if (dealManager?.userId) return memberById(members, dealManager.userId);
  if (dealManager) return { id: dealManager.userId || dealManager.id, name: dealManager.name, avatar: null };
  return undefined;
}

export function uniqueWatcherMembers(members: TeamMember[], ids?: string[]) {
  const seen = new Set<string>();
  const result: TeamMember[] = [];
  for (const id of ids || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = memberById(members, id);
    if (m) result.push(m);
  }
  return result;
}

export function watcherMembers(members: TeamMember[], ids?: string[]) {
  return uniqueWatcherMembers(members, ids);
}

export function memberInitial(name: string) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}
