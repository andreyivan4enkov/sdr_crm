import { createApiClient, hasAnyPermission, hasPermission, normalizeLead, canEditLead, canAssignLead } from "@sdr-crm/api-client";
import type * as ApiTypes from "@sdr-crm/api-client";

export type {
  AiboardAggregationResult, AiboardGraph, PendingFieldMapping, AiboardDashboardQueryResult,
} from "@sdr-crm/api-client";

export type {
  AdminUser, AuditLog, AuthUser, Automation, Call, Channel, Field, Integration,
  Lead, Note, OrgUnit, Profile, DealManager, Role, Stage, Task, TaskStatus, TeamPayload, TeamUser, TeamMember,
  Pipeline, PipelineType,
  EdoDocument, EdoDocumentLine, EdoConfig, EdoSignature,
  LegalEntity, CrmContact, FnsLookup,
  SiteSpace, SiteDocument, SiteBlock, SiteBuildPlan, SiteAiMode, SiteEntityBinding,
  BlueprintSpace, BlueprintBuildPlan, BlueprintAiMode,
  ReactionBindingLink, ReactionBindingsConfig, ReactorOpenerContext, ReactionBindingMode, ReactionBindingTarget,
  ReactorProductSummary, ReactorComposePlan, ReactorProductNav, ReactorGraphPreview,
  LeadCardLayout, GridLayoutCell, LeadCardBlock, LeadCardBlockType,
  AnalyticsDashboard, AnalyticsGoal, AnalyticsWidget,
  IntegrationEndpoints, MailProviderId, MailAddress, MailAccount, MailMessage, MailProviderPreset,
  ReactionCatalog,
  ResourceGroup, ResourceItem, LeadResourceLine,
  CompanyAsset, AssetGroup, AssetMovement, AssetsSummary,
  TaskChecklistItem, TaskComment, TaskFile, TaskPriority,
} from "@sdr-crm/api-client";
export type { AiboardDashboardStreamChunk } from "@sdr-crm/api-client";

export { hasPermission, hasAnyPermission, normalizeLead, canEditLead, canAssignLead };
export {
  PERMISSION_LABELS, PERMISSION_GROUPS, permissionLabel, getPermissionGroups, isFullAccess,
} from "@sdr-crm/api-client";

const base = createApiClient();

export const api: ApiTypes.ApiClient & {
  exportLead: (id: string) => Promise<void>;
  /** @deprecated alias */
  listLeads: ApiTypes.ApiClient["getLeads"];
} = {
  ...base,
  listLeads: (params) => base.getLeads(params),
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
