/** Legacy API field aliases (realtor → deal_manager). Remove after v3.4. */

export function remapLegacyLeadInput(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const src = body as Record<string, unknown>;
  if (!("assignedRealtorId" in src)) return body;
  const next = { ...src };
  if (next.assignedDealManagerId === undefined) next.assignedDealManagerId = next.assignedRealtorId;
  delete next.assignedRealtorId;
  return next;
}

export function withLegacyLeadFields<T extends { assignedDealManagerId?: string | null }>(lead: T) {
  return { ...lead, assignedRealtorId: lead.assignedDealManagerId ?? null };
}

export function withLegacyTeamPayload<T extends { dealManagers: unknown[] }>(payload: T) {
  return { ...payload, realtors: payload.dealManagers };
}

export function withLegacyDealManagerResponse<T>(dealManager: T) {
  return { dealManager, realtor: dealManager };
}

export function withLegacyInviteFlags(flags: { isDealManager: boolean }) {
  return { ...flags, isRealtor: flags.isDealManager };
}

export function withLegacyProfileAccount<T extends { isDealManager: boolean }>(account: T) {
  return { ...account, isRealtor: account.isDealManager };
}