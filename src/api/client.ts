import { createApiClient, hasAnyPermission, hasPermission, normalizeLead, canEditLead, canAssignLead } from "@jbrealty/api-client";
import type * as ApiTypes from "@jbrealty/api-client";

export type {
  AdminUser, AuditLog, AuthUser, Automation, Call, Channel, Field, Integration,
  Lead, Note, OrgUnit, Profile, Realtor, Role, Stage, Task, TeamPayload, TeamUser,
} from "@jbrealty/api-client";

export { hasPermission, hasAnyPermission, normalizeLead, canEditLead, canAssignLead };
export {
  PERMISSION_LABELS, PERMISSION_GROUPS, permissionLabel, isFullAccess,
} from "@jbrealty/api-client";

const base = createApiClient();

export const api: ApiTypes.ApiClient & {
  exportLead: (id: string) => Promise<void>;
} = {
  ...base,
  exportLead: async (id: string) => {
    const data = await base.exportLeadData(id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lead-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
