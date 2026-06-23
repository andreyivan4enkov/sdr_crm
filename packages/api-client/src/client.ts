import type {
  AdminUser, AnalyticsDashboard, AuditLog, AuthUser, BackupConfig, BackupListItem, BackupStatus, Call, Channel, Field, Integration, Lead,
  LeadCardLayout, NotificationPrefs, OrgUnit, Pipeline, Profile, DealManager, Role, Stage, Task, TeamPayload,
  LeadCardBlock,
  BlueprintSpace, BlueprintGraph, BlueprintInstance, BlueprintBuildPlan, BlueprintAiMode, BlueprintAiResponse,
  ReactionSpace, ReactionCatalog, ReactionBindingLink, ReactionBindingsConfig, ReactorOpenerContext, UnifiedNodeCatalogEntry,
  PipelineAiResponse,
  BlueprintTestRunResponse,
  SiteSpace, SiteDocument, SiteBuildPlan, SiteAiMode, SiteAiResponse,
  EdoDocument, EdoConfig, EdoSignature,
  MailAccount, MailMessage, MailProviderPreset, MailProviderId, MailAddress,
  IntegrationEndpoints,
  LegalEntity, CrmContact, FnsLookup,
  ResourceGroup, ResourceGroupRoleAccess, ResourceItem, LeadResourceLine, EdoDocumentLine,
  AssetGroup, CompanyAsset, AssetMovement, AssetsSummary,
} from "./types.js";

export type ApiClientConfig = {
  /** Базовый URL API, например `/api` или `https://crm.example.ru/api` */
  baseUrl?: string;
  credentials?: RequestCredentials;
};

export function createApiClient(config: ApiClientConfig = {}) {
  const BASE = (config.baseUrl ?? "/api").replace(/\/$/, "");
  const credentials = config.credentials ?? "include";

  async function request<T>(path: string, opts: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
    let res: Response;
    const signal = opts.signal ?? AbortSignal.timeout(timeoutMs);
    try {
      res = await fetch(`${BASE}${path}`, {
        credentials,
        headers: { "Content-Type": "application/json", ...opts.headers as Record<string, string> },
        ...opts,
        signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error("Превышено время ожидания ответа API. Проверьте AI-провайдер и сеть.");
      }
      throw new Error("API недоступен. Запустите `npm run dev:all` (нужны API :3000 и Vite :5173)");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`) as Error & { status?: number; data?: unknown };
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data as T;
  }

  return {
    health: () => request<{ ok: boolean; db: string; version: string; ts: number; recoverable?: boolean }>("/health"),
    recoverDevDatabase: () =>
      request<{ ok: boolean; db: string; recovered?: boolean }>("/health/recover", { method: "POST" }),

    getAuthConfig: () => request<{ demoLogin: boolean }>("/auth/config"),

    getAuthRuntime: () => request<{ demoLogin: boolean; publicUrl: string; demoUsers: { login: string; name: string }[] }>("/auth/runtime"),

    demoLogin: (login: string) =>
      request<{ user: AuthUser }>("/auth/demo-login", { method: "POST", body: JSON.stringify({ login }) }),

    getPublicConfig: () => request<{ turnstileSiteKey: string | null }>("/public/config"),

    getPrivacy: () => request<{ operator: string; operatorEmail: string; updatedAt: string; sections: { title: string; text: string }[] }>("/public/privacy"),

    publicRevoke: (body: { phone: string; email?: string; turnstileToken?: string }) =>
      request<{ ok: boolean; message: string }>("/public/revoke", { method: "POST", body: JSON.stringify(body) }),

    publicRevokeConfirm: (body: { phone: string; otp: string }) =>
      request<{ ok: boolean; message: string }>("/public/revoke/confirm", { method: "POST", body: JSON.stringify(body) }),

    verifyInvite: (token: string) =>
      request<{ valid: boolean; role?: string; roleName?: string; isDealManager?: boolean; isRealtor?: boolean; error?: string }>(`/auth/invite/verify?token=${encodeURIComponent(token)}`),

    register: (body: {
      token: string; login: string; password: string; name: string; email: string;
      phone: string; position: string; avatar?: string | null; region?: string | null;
    }) =>
      request<{ ok: boolean; status: string; message: string }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

    login: async (login: string, password: string, totpCode?: string) => {
      let res: Response;
      try {
        res = await fetch(`${BASE}/auth/login`, {
          method: "POST",
          credentials,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password, totpCode }),
        });
      } catch {
        throw new Error("API недоступен. Запустите `npm run dev:all` (нужны API :3000 и Vite :5173)");
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.requiresTotp) return { requiresTotp: true as const };
      if (!res.ok) {
        const msg = data.error
          || (res.status >= 502 ? "API недоступен. Подождите — сервер перезапускается"
            : res.status === 500 && !data.error ? "База данных перезапускается — обновите страницу"
            : res.status === 500 ? "Ошибка сервера. Попробуйте обновить страницу"
            : `HTTP ${res.status}`);
        const err = new Error(msg) as Error & { status?: number; data?: unknown };
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return { user: data.user as AuthUser };
    },

    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

    createQrLogin: (baseUrl?: string) =>
      request<{ token: string; expiresAt: number; url: string }>("/auth/qr/create", {
        method: "POST",
        body: JSON.stringify(baseUrl ? { baseUrl } : {}),
      }),

    acceptQrLogin: (token: string) =>
      request<{ user: AuthUser }>("/auth/qr/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),

    me: () => request<{ user: AuthUser }>("/auth/me"),

    getMyProfile: () => request<import("./types.js").MyProfilePayload>("/auth/profile"),
    updateMyProfile: (body: {
      name?: string;
      phone?: string | null;
      position?: string | null;
      region?: string | null;
      email?: string;
      avatar?: string | null;
      locale?: "ru" | "en" | "zh" | "fr" | "de";
    }) => request<{ profile: import("./types.js").Profile; user: AuthUser }>("/auth/profile", { method: "PATCH", body: JSON.stringify(body) }),

    totpStatus: () => request<{ enabled: boolean; available: boolean }>("/auth/totp/status"),
    totpSetup: () => request<{ uri: string }>("/auth/totp/setup", { method: "POST" }),
    totpEnable: (code: string) =>
      request<{ ok: boolean; backupCodes: string[] }>("/auth/totp/enable", { method: "POST", body: JSON.stringify({ code }) }),
    totpDisable: (password: string, code: string) =>
      request<{ ok: boolean }>("/auth/totp/disable", { method: "POST", body: JSON.stringify({ password, code }) }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),

    getSettings: () => request<{ pipelines: Pipeline[]; stages: Stage[]; fields: Field[]; channels: Channel[]; cardLayout?: LeadCardLayout; hiddenCardFields?: string[]; leadCardBlocks?: LeadCardBlock[] }>("/settings"),

    getAnalytics: () => request<{ dashboards: AnalyticsDashboard[] }>("/analytics"),
    updateAnalyticsDashboards: (dashboards: AnalyticsDashboard[]) =>
      request<{ dashboards: AnalyticsDashboard[] }>("/analytics/dashboards", { method: "PUT", body: JSON.stringify(dashboards) }),

    getLeads: (params?: { page?: number; limit?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.search) q.set("search", params.search);
      return request<{ leads: Lead[]; total: number }>(`/leads?${q}`);
    },
    /** @deprecated alias — используйте getLeads */
    listLeads: (params?: { page?: number; limit?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.search) q.set("search", params.search);
      return request<{ leads: Lead[]; total: number }>(`/leads?${q}`);
    },

    createLead: (body: Partial<Lead> & { pdConsent?: boolean }) =>
      request<{ lead: Lead }>("/leads", { method: "POST", body: JSON.stringify(body) }),

    updateLead: (id: string, body: Partial<Lead>) =>
      request<{ lead: Lead }>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

    getLeadHistory: (id: string) =>
      request<import("./types.js").LeadHistoryPayload>(`/leads/${id}/history`),

    addNote: (id: string, text: string) =>
      request<{ note: import("./types.js").Note }>(`/leads/${id}/notes`, { method: "POST", body: JSON.stringify({ text }) }),

    deleteLead: (id: string) => request<{ ok: boolean }>(`/leads/${id}`, { method: "DELETE" }),

    publicLead: (body: { name: string; phone: string; region?: string; preferredTime?: string; comment?: string; pdConsent: true; turnstileToken?: string }) =>
      request<{ ok: boolean }>("/public/leads", { method: "POST", body: JSON.stringify(body) }),

    eraseLead: (id: string) => request<{ ok: boolean; message: string }>(`/leads/${id}/erase`, { method: "POST" }),

    revokeLeadConsent: (id: string, erase = false) =>
      request<{ ok: boolean; message: string }>(`/leads/${id}/revoke-consent`, { method: "POST", body: JSON.stringify({ erase }) }),

    exportLeadData: async (id: string) => {
      const res = await fetch(`${BASE}/leads/${id}/export`, { credentials });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },

    getAuditLogs: (params?: { limit?: number; offset?: number; action?: string; userLogin?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      if (params?.action) q.set("action", params.action);
      if (params?.userLogin) q.set("userLogin", params.userLogin);
      return request<{ logs: AuditLog[]; total: number; limit: number; offset: number }>(`/admin/audit?${q}`);
    },

    getBackupStatus: () => request<BackupStatus>("/admin/backup"),
    updateBackupConfig: (body: Partial<BackupConfig>) =>
      request<{ config: BackupConfig }>("/admin/backup/config", { method: "PATCH", body: JSON.stringify(body) }),
    runBackup: () =>
      request<{ ok: boolean; output: string; latest: BackupListItem | null }>("/admin/backup/run", { method: "POST" }),
    runBackupSync: () => request<{ ok: boolean; output: string }>("/admin/backup/sync", { method: "POST" }),
    downloadBackup: async (name: string) => {
      const res = await fetch(`${BASE}/admin/backup/download/${encodeURIComponent(name)}`, { credentials });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    },

    getTasks: () => request<{ tasks: Task[] }>("/tasks"),
    createTask: (body: Partial<Task>) => request<{ task: Task }>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    updateTask: (id: string, body: Partial<Task>) => request<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addTaskComment: (id: string, text: string) => request<{ task: Task; comment: import("./types.js").TaskComment }>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
    pinTaskResult: (id: string, body: { text: string; commentId?: string }) => request<{ task: Task }>(`/tasks/${id}/pin-result`, { method: "POST", body: JSON.stringify(body) }),
    deleteTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),

    getTeam: () => request<TeamPayload>("/team"),
    createDealManager: (body: Partial<DealManager>) =>
      request<{ dealManager: DealManager; realtor?: DealManager }>("/team", { method: "POST", body: JSON.stringify(body) }),
    updateDealManager: (id: string, body: Partial<DealManager>) =>
      request<{ dealManager: DealManager; realtor?: DealManager }>(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteDealManager: (id: string) => request<{ ok: boolean }>(`/team/${id}`, { method: "DELETE" }),

    /** @deprecated use createDealManager */
    createRealtor: async (body: Partial<DealManager>) => {
      const res = await request<{ dealManager: DealManager; realtor?: DealManager }>("/team", { method: "POST", body: JSON.stringify(body) });
      return { realtor: res.realtor ?? res.dealManager };
    },
    /** @deprecated use updateDealManager */
    updateRealtor: async (id: string, body: Partial<DealManager>) => {
      const res = await request<{ dealManager: DealManager; realtor?: DealManager }>(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      return { realtor: res.realtor ?? res.dealManager };
    },
    /** @deprecated use deleteDealManager */
    deleteRealtor: (id: string) => request<{ ok: boolean }>(`/team/${id}`, { method: "DELETE" }),

    createOrgUnit: (body: Partial<OrgUnit>) => request<{ unit: OrgUnit }>("/team/units", { method: "POST", body: JSON.stringify(body) }),
    updateOrgUnit: (id: string, body: Partial<OrgUnit>) => request<{ unit: OrgUnit }>(`/team/units/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteOrgUnit: (id: string) => request<{ ok: boolean }>(`/team/units/${id}`, { method: "DELETE" }),

    createTeamRole: (body: { name: string; label: string; permissions: string[] }) =>
      request<{ role: Role }>("/team/roles", { method: "POST", body: JSON.stringify(body) }),
    updateTeamRole: (id: string, body: { label?: string; permissions?: string[] }) =>
      request<{ role: Role }>(`/team/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteTeamRole: (id: string) => request<{ ok: boolean }>(`/team/roles/${id}`, { method: "DELETE" }),

    updateStages: (stages: Stage[]) => request<{ stages: Stage[] }>("/settings/stages", { method: "PATCH", body: JSON.stringify(stages) }),
    updatePipelines: (pipelines: Pipeline[]) => request<{ pipelines: Pipeline[] }>("/settings/pipelines", { method: "PATCH", body: JSON.stringify(pipelines) }),
    pipelineAi: (body: { message: string; pipelines: Pipeline[]; stages: Stage[] }) =>
      request<PipelineAiResponse>("/settings/pipelines/ai", { method: "POST", body: JSON.stringify(body) }),
    updateFields: (fields: Field[]) => request<{ fields: Field[] }>("/settings/fields", { method: "PATCH", body: JSON.stringify(fields) }),
    updateCardLayout: (cardLayout: LeadCardLayout) => request<{ cardLayout: LeadCardLayout }>("/settings/card-layout", { method: "PATCH", body: JSON.stringify(cardLayout) }),
    updateLeadCardBlocks: (blocks: LeadCardBlock[]) => request<{ leadCardBlocks: LeadCardBlock[] }>("/settings/lead-card-blocks", { method: "PATCH", body: JSON.stringify(blocks) }),
    updateChannels: (channels: Partial<Channel>[]) => request<{ channels: Channel[] }>("/settings/channels", { method: "PATCH", body: JSON.stringify(channels) }),

    getUsers: (status?: string) => request<{ users: AdminUser[] }>(`/admin/users${status ? `?status=${status}` : ""}`),
    createInvite: (opts?: { roleId?: string; orgUnitId?: string | null }) =>
      request<{ url: string; role: string; message: string }>("/admin/users/invite", { method: "POST", body: JSON.stringify(opts || {}) }),
    getInviteRoles: () => request<{ roles: Role[] }>("/admin/users/invite-roles"),
    approveUser: (id: string, opts?: { roleId?: string; orgUnitId?: string | null }) =>
      request<{ user: unknown }>(`/admin/users/${id}/approve`, { method: "POST", body: JSON.stringify(opts || {}) }),
    rejectUser: (id: string) => request<{ user: unknown }>(`/admin/users/${id}/reject`, { method: "POST" }),
    dismissUser: (id: string, opts?: { delegateToUserId?: string | null }) =>
      request<{ user: unknown; message: string }>(`/admin/users/${id}/dismiss`, { method: "POST", body: JSON.stringify(opts || {}) }),
    updateUser: (id: string, body: { status?: string; roleId?: string }) => request<{ user: unknown }>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

    getRoles: () => request<{ roles: Role[]; allPermissions: string[] }>("/admin/roles"),
    createRole: (body: { name: string; label: string; permissions: string[] }) => request<{ role: Role }>("/admin/roles", { method: "POST", body: JSON.stringify(body) }),
    updateRole: (id: string, body: Partial<Role>) => request<{ role: Role }>(`/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteRole: (id: string) => request<{ ok: boolean }>(`/admin/roles/${id}`, { method: "DELETE" }),

    updateProfile: (userId: string, body: Partial<Profile>) => request<{ profile: Profile }>(`/admin/profiles/${userId}`, { method: "PATCH", body: JSON.stringify(body) }),

    getIntegrations: () => request<{ integrations: Integration[]; baseUrl: string; endpoints: IntegrationEndpoints }>("/integrations"),
    updateTilda: (body: Record<string, unknown>) => request<{ integration: Integration; webhookUrl: string; webhookUrlWithSecret?: string; webhookSecret?: string }>("/integrations/tilda", { method: "PATCH", body: JSON.stringify(body) }),
    updateTelephony: (body: Record<string, unknown>) => request<{
      integration: Integration; webhookUrl: string; webhookUrlWithSecret?: string;
      beelineEventUrl?: string; webhookSecret?: string; sipGateway?: string;
      provider?: string; beelineSubscriptionId?: string | null;
    }>("/integrations/telephony", { method: "PATCH", body: JSON.stringify(body) }),

    listConnectors: () => request<{ connectors: import("./types.js").UniversalConnector[] }>("/connectors"),
    createConnector: (body: { name: string; slug: string; template: "generic_webhook" | "zapier" | "rest_outbound" | "oauth2_rest" }) =>
      request<{ connector: import("./types.js").UniversalConnector }>("/connectors", { method: "POST", body: JSON.stringify(body) }),
    updateConnector: (id: string, body: Record<string, unknown>) =>
      request<{ connector: import("./types.js").UniversalConnector }>(`/connectors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteConnector: (id: string) => request<{ ok: boolean }>(`/connectors/${id}`, { method: "DELETE" }),
    regenerateConnectorSecret: (id: string) =>
      request<{ webhookSecret: string }>(`/connectors/${id}/regenerate-secret`, { method: "POST" }),

    subscribeBeelineTelephony: () => request<{
      ok: boolean; subscriptionId: string; beelineEventUrl: string;
      webhookUrl: string; message: string; subscriptionStatus?: unknown;
    }>("/integrations/telephony/beeline/subscribe", { method: "POST", body: JSON.stringify({}) }),

    updateVk: (body: Record<string, unknown>) => request<{ integration: Integration; webhookUrl?: string; webhookUrlWithSecret?: string; webhookSecret?: string }>("/integrations/vk", { method: "PATCH", body: JSON.stringify(body) }),
    updateYandexDirect: (body: Record<string, unknown>) => request<{ integration: Integration; webhookUrl?: string; webhookUrlWithSecret?: string; webhookSecret?: string }>("/integrations/yandex_direct", { method: "PATCH", body: JSON.stringify(body) }),
    updateYandexMetrica: (body: Record<string, unknown>) => request<{ integration: Integration }>("/integrations/yandex_metrica", { method: "PATCH", body: JSON.stringify(body) }),
    updateAvito: (body: Record<string, unknown>) => request<{ integration: Integration; webhookUrl?: string; webhookUrlWithSecret?: string; webhookSecret?: string }>("/integrations/avito", { method: "PATCH", body: JSON.stringify(body) }),

    dial: (phone: string, leadId?: string) => request<{
      ok: boolean;
      phone: string;
      provider?: string;
      callId?: string;
      message?: string;
      sipUri?: string;
      telUri?: string;
    }>("/calls/dial", { method: "POST", body: JSON.stringify({ phone, leadId }) }),
    callRecordingUrl: (id: string) => `${BASE}/calls/${id}/recording`,
    getCalls: (params?: { phone?: string; leadId?: string }) => {
      const q = new URLSearchParams();
      if (params?.phone) q.set("phone", params.phone);
      if (params?.leadId) q.set("leadId", params.leadId);
      const qs = q.toString();
      return request<{ calls: Call[] }>(`/calls${qs ? `?${qs}` : ""}`);
    },
    transcribeCall: (id: string) => request<{ call: Call }>(`/calls/${id}/transcribe`, { method: "POST" }),
    applyCallAi: (id: string) => request<{ ok: boolean }>(`/calls/${id}/apply-ai`, { method: "POST" }),

    getNotificationSettings: () => request<{ settings: NotificationPrefs; pushAvailable: boolean }>("/notifications/settings"),
    updateNotificationSettings: (body: Partial<NotificationPrefs>) =>
      request<{ settings: NotificationPrefs }>("/notifications/settings", { method: "PATCH", body: JSON.stringify(body) }),
    getVapidPublicKey: () => request<{ available: boolean; publicKey?: string }>("/notifications/vapid-public-key"),
    subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ ok: boolean }>("/notifications/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
    unsubscribePush: (endpoint?: string) =>
      request<{ ok: boolean }>("/notifications/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) }),

    getSettingsAi: () => request<{ config: Record<string, unknown>; providers: unknown[]; guides?: unknown; integrationModels?: unknown[] }>("/settings/ai", {}, 20_000),
    saveSettingsAi: (body: Record<string, unknown>) =>
      request<{ ok: boolean; config: Record<string, unknown> }>("/settings/ai", { method: "PUT", body: JSON.stringify(body) }),
    testSettingsAi: (body?: Record<string, unknown>) =>
      request<{ ok: boolean; message: string; local?: boolean; serverUp?: boolean; models?: string[]; modelFound?: boolean; model?: string }>(
        "/settings/ai/test", { method: "POST", body: JSON.stringify(body ?? {}) }, 120_000,
      ),
    getSettingsAiModels: (params?: { providerId?: string; baseUrl?: string }) => {
      const q = new URLSearchParams();
      if (params?.providerId) q.set("providerId", params.providerId);
      if (params?.baseUrl) q.set("baseUrl", params.baseUrl);
      const qs = q.toString();
      return request<{ ok: boolean; local: boolean; serverUp?: boolean; models: string[]; message: string }>(
        `/settings/ai/models${qs ? `?${qs}` : ""}`,
      );
    },

    getAiboardMetrics: () => request<{ metrics: Record<string, unknown>; cached?: boolean }>("/aiboard/metrics"),
    runAiboardAggregation: (body: Record<string, unknown>) =>
      request<AiboardAggregationResult>("/aiboard/aggregation/run", { method: "POST", body: JSON.stringify(body) }),
    aiboardAggregationAi: (body: {
      mode?: "direct" | "plan" | "execute";
      message: string;
      nodes?: unknown[];
      wires?: unknown[];
      plan?: Record<string, unknown>;
      stepIndex?: number;
      nodeIds?: string;
    }) => request<{
      mode: string;
      reply: string;
      reasoning?: string;
      plan?: Record<string, unknown>;
      proposals?: unknown[];
      aiError?: string;
    }>("/aiboard/aggregation/ai", { method: "POST", body: JSON.stringify(body) }),
    getAiboardBiPrimitives: () => request<Record<string, unknown>>("/aiboard/primitives"),
    getAiboardConnectors: () =>
      request<{ categories: Record<string, string>; connectors: Record<string, unknown[]> }>("/aiboard/connectors"),
    getAiboardConnections: () =>
      request<{ connections: Record<string, unknown>[] }>("/aiboard/connections"),
    saveAiboardConnections: (connections: Record<string, unknown>[]) =>
      request<{ ok: boolean; connections: Record<string, unknown>[] }>("/aiboard/connections", {
        method: "PUT",
        body: JSON.stringify(connections),
      }),
    getAiboardDashboard: () =>
      request<{ graph: Record<string, unknown> | null; metrics: Record<string, unknown> }>("/aiboard/dashboard"),
    saveAiboardDashboardWidgets: (widgets: Record<string, unknown>[]) =>
      request<{ ok: boolean }>("/aiboard/dashboard", { method: "PUT", body: JSON.stringify({ widgets }) }),
    readAiboardAsset: (params: { path: string }) =>
      request<{ ok: boolean; path?: string; kind?: string; editable?: boolean; content?: string; message?: string }>(
        `/aiboard/assets?path=${encodeURIComponent(params.path)}`,
      ),
    writeAiboardAsset: (body: { path: string; content: string }) =>
      request<{ ok: boolean; message?: string }>("/aiboard/assets", { method: "PUT", body: JSON.stringify(body) }),
    previewAiboardSource: (body: Record<string, unknown>) =>
      request<{ ok: boolean; volume: number; message: string; fields: { name: string; role: string | null; state: string }[] }>(
        "/aiboard/sources/preview", { method: "POST", body: JSON.stringify(body) },
      ),
    getAiboardGraph: () => request<{ graph: AiboardGraph | null }>("/aiboard/graph"),
    saveAiboardGraph: (graph: AiboardGraph) =>
      request<{ ok: boolean }>("/aiboard/graph", { method: "PUT", body: JSON.stringify(graph) }),
    aiboardAiQuery: (body: { message: string; mode?: "analyst" | "query" | "aggregation"; nodeIds?: string }) =>
      request<{ reply: string; charts?: unknown[]; proposals?: unknown[]; intent?: string; dashboard?: AiboardDashboardQueryResult }>("/aiboard/ai/query", { method: "POST", body: JSON.stringify(body) }),
    aiboardAiRoute: (body: { message: string; module?: string }) =>
      request<{ intent: string; confidence: number; source: string; suggestedMode?: string; suggestedTask?: string }>("/aiboard/ai/route", { method: "POST", body: JSON.stringify(body) }),
    aiboardAiQueryStream: async (
      body: { message: string; mode?: "analyst" | "query" | "aggregation" },
      onChunk: (chunk: { type: string; text: string }) => void,
    ): Promise<void> => {
      const res = await fetch(`${BASE}/aiboard/ai/query/stream`, {
        method: "POST",
        credentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const chunk = JSON.parse(line.slice(5).trim()) as { type: string; text: string };
            onChunk(chunk);
          } catch { /* skip */ }
        }
      }
    },
    getSettingsAiUsage: (module = "analytics") =>
      request<{ day: { requests: number; promptTokens: number; completionTokens: number }; month: { requests: number; promptTokens: number; completionTokens: number }; limits: { maxTokensPerRequest?: number; dailyRequestLimit?: number; monthlyTokenBudget?: number } }>(
        `/settings/ai/usage?module=${encodeURIComponent(module)}`,
      ),
    aiboardDashboardQuery: (body: { message?: string; manifest?: Record<string, unknown> }) =>
      request<AiboardDashboardQueryResult>("/aiboard/dashboard/query", { method: "POST", body: JSON.stringify(body) }),
    aiboardDashboardQueryStream: async (
      body: { message: string },
      onChunk: (chunk: AiboardDashboardStreamChunk) => void,
    ): Promise<void> => {
      let res: Response;
      try {
        res = await fetch(`${BASE}/aiboard/dashboard/query/stream`, {
          method: "POST",
          credentials,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error("API недоступен. Запустите `npm run dev:all`");
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            onChunk(JSON.parse(line.slice(5).trim()) as AiboardDashboardStreamChunk);
          } catch { /* skip */ }
        }
      }
    },
    runAiboardAggregationAsync: (body: Record<string, unknown>) =>
      request<{ jobId: string; status: string }>("/aiboard/aggregation/run/async", { method: "POST", body: JSON.stringify(body) }),
    getAiboardAggregationJob: (id: string) =>
      request<AiboardAggregationJob>("/aiboard/aggregation/jobs/" + id),
    getAiboardPendingMappings: () =>
      request<{ pending: PendingFieldMapping[] }>("/aiboard/mappings/pending"),
    resolveAiboardPendingMapping: (body: { sourceField: string; targetRole: string; nodeId?: string }) =>
      request<{ ok: boolean; pending: PendingFieldMapping[] }>("/aiboard/mappings/pending/resolve", { method: "POST", body: JSON.stringify(body) }),
    getAiDocsIndex: (q?: string) =>
      request<{ version?: number; docs?: AiDocEntry[] }>(`/ai-docs${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    getAiDoc: (id: string) =>
      request<{ entry: AiDocEntry; content: string }>(`/ai-docs/${id}`),
    getAiboardProviders: () => request<{ providers: { id: string; label: string; protocol: string; baseUrl: string; model: string; requiresKey: boolean; free?: boolean; description?: string; authUrl?: string | null }[] }>("/aiboard/providers"),
    getAiboardAiConfig: () => request<{ config: { enabled: boolean; providerId: string; baseUrl: string; model: string; apiKeySet: boolean; apiKeyMasked?: string; configured: boolean; protocol?: string }; providers?: unknown[] }>("/aiboard/config"),
    saveAiboardAiConfig: (body: Record<string, unknown>) =>
      request<{ ok: boolean; config: { enabled: boolean; providerId: string; baseUrl: string; model: string; apiKeySet: boolean; configured: boolean } }>("/aiboard/config", { method: "PUT", body: JSON.stringify(body) }),
    testAiboardAi: (body?: Record<string, unknown>) =>
      request<{ ok: boolean; message: string }>("/aiboard/ai/test", { method: "POST", body: JSON.stringify(body ?? {}) }),

    listReactions: (q?: { pipelineId?: string; stageId?: string }) => {
      const params = new URLSearchParams();
      if (q?.pipelineId) params.set("pipelineId", q.pipelineId);
      if (q?.stageId) params.set("stageId", q.stageId);
      const qs = params.toString();
      return request<{ reactions: ReactionSpace[] }>(`/reactions${qs ? `?${qs}` : ""}`);
    },
    getReaction: (id: string) => request<{ reaction: ReactionSpace }>(`/reactions/${id}`),
    createReaction: (body: Partial<ReactionSpace> & { name: string }) =>
      request<{ reaction: ReactionSpace }>("/reactions", { method: "POST", body: JSON.stringify(body) }),
    updateReaction: (id: string, body: Partial<ReactionSpace>) =>
      request<{ reaction: ReactionSpace }>(`/reactions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteReaction: (id: string) => request<{ ok: boolean }>(`/reactions/${id}`, { method: "DELETE" }),
    duplicateReaction: (id: string) =>
      request<{ reaction: ReactionSpace }>(`/reactions/${id}/duplicate`, { method: "POST" }),
    runReaction: (id: string, body: { leadId: string; taskId?: string }) =>
      request<{ instanceId: string; outcome: { state: string; log: unknown[] }; space: ReactionSpace }>(
        `/reactions/${id}/run`, { method: "POST", body: JSON.stringify(body) },
      ),
    testReaction: (id: string, body?: {
      graph?: BlueprintGraph;
      instanceId?: string;
      choice?: "approved" | "rejected";
    }) =>
      request<BlueprintTestRunResponse>(
        `/reactions/${id}/test`, { method: "POST", body: JSON.stringify(body ?? {}) },
      ),
    resumeReaction: (instanceId: string, body: { choice: "approved" | "rejected"; leadId: string }) =>
      request<{ instanceId: string; outcome: { state: string } }>(
        `/reactions/instances/${instanceId}/resume`, { method: "POST", body: JSON.stringify(body) },
      ),
    reactionAi: (id: string, body: {
      mode?: BlueprintAiMode;
      message: string;
      history?: { role: "user" | "ai"; text: string }[];
      graph: BlueprintGraph;
      selection?: string[];
      plan?: BlueprintBuildPlan;
      stepIndex?: number;
      apply?: boolean;
    }) =>
      request<BlueprintAiResponse>(
        `/reactions/${id}/ai`, { method: "POST", body: JSON.stringify(body) },
      ),
    getReactionCatalog: () => request<ReactionCatalog>("/reactions/catalog"),
    getReactionBindings: (id: string) => request<{ bindings: ReactionBindingLink[]; bindingsConfig: ReactionBindingsConfig }>(`/reactions/${id}/bindings`),
    setReactionBindings: (id: string, config: ReactionBindingsConfig | ReactionBindingLink[]) =>
      request<{ bindings: ReactionBindingLink[]; bindingsConfig: ReactionBindingsConfig }>(`/reactions/${id}/bindings`, {
        method: "PUT", body: JSON.stringify(Array.isArray(config) ? { bindings: config } : config),
      }),
    autoBindReaction: (id: string, context: ReactorOpenerContext) =>
      request<{ bindings: ReactionBindingLink[]; bindingsConfig: ReactionBindingsConfig; added: number }>(
        `/reactions/${id}/bindings/auto`, { method: "POST", body: JSON.stringify(context) },
      ),
    getReactionNodeCatalog: () => request<{ nodes: UnifiedNodeCatalogEntry[]; hint: string }>("/reactions/node-catalog"),

    listReactorProducts: (q?: { pinned?: boolean; published?: boolean; includeGraphs?: boolean }) => {
      const params = new URLSearchParams();
      if (q?.pinned) params.set("pinned", "true");
      if (q?.published === false) params.set("published", "false");
      if (q?.includeGraphs) params.set("includeGraphs", "true");
      const qs = params.toString();
      return request<{ products: import("./types.js").ReactorProductSummary[] }>(`/reactor/products${qs ? `?${qs}` : ""}`);
    },
    getReactorProduct: (slug: string) =>
      request<{ product: import("./types.js").ReactorProductSummary & { graphs?: Record<string, unknown> } }>(`/reactor/products/${slug}`),
    getReactorProductGraph: (slug: string, kind: "flow" | "view" | "data", opts?: { expanded?: boolean }) => {
      const qs = opts?.expanded ? "?expanded=true" : "";
      return request<{
        kind: string;
        graph: import("./types.js").ReactorGraphPreview;
        expanded: import("./types.js").ReactorGraphPreview | null;
        meta: import("./types.js").ExpandedGraphMeta | null;
        compiled: import("./types.js").ReactorGraphPreview | null;
      }>(`/reactor/products/${slug}/graphs/${kind}${qs}`);
    },
    getReactorProductArchitecture: (slug: string) =>
      request<{
        slug: string;
        name: string;
        graphs: Partial<Record<"flow" | "view" | "data", import("./types.js").ReactorGraphPreview>>;
        meta: Partial<Record<"flow" | "view" | "data", import("./types.js").ExpandedGraphMeta>>;
        summary: { totalNodes: number; totalEdges: number; kinds: string[] };
      }>(`/reactor/v1/products/${slug}/architecture`),
    getReactorArchitectureBatch: (opts?: { metaOnly?: boolean }) => {
      const qs = opts?.metaOnly ? "?metaOnly=true" : "";
      return request<{
        products: {
          slug: string;
          name: string;
          kind: string;
          graph?: import("./types.js").ReactorGraphPreview;
          meta: import("./types.js").ExpandedGraphMeta;
          nodeCount: number;
          edgeCount: number;
        }[];
        summary: { count: number; totalNodes: number; totalEdges: number };
      }>(`/reactor/v1/products/architecture/batch${qs}`, {}, 15_000);
    },
    putReactorProductGraph: (slug: string, kind: "flow" | "view" | "data", graph: import("./types.js").ReactorGraphPreview) =>
      request<{ ok: boolean }>(`/reactor/products/${slug}/graphs/${kind}`, { method: "PUT", body: JSON.stringify(graph) }),
    publishReactorProduct: (slug: string) =>
      request<{ ok: boolean }>(`/reactor/products/${slug}/publish`, { method: "POST" }),
    getReactorProductView: (slug: string) =>
      request<{ product: unknown; manifest: unknown; host: string | null; route?: string; title: string }>(`/reactor/products/${slug}/view`),
    reactorCompose: (body: { message: string; mode?: "plan" | "apply" | "clarify"; productSlug?: string; graphKind?: string; plan?: import("./types.js").ReactorComposePlan }) =>
      request<{ mode: string; plan: import("./types.js").ReactorComposePlan }>("/reactor/ai/compose", { method: "POST", body: JSON.stringify(body) }),
    getReactorNodeSchema: () => request<{ nodes: unknown[] }>("/reactor/ai/node-schema"),
    seedReactorPresets: () => request<{ ok: boolean; count: number }>("/reactor/seed-presets", { method: "POST" }),

    getReactorRuntime: (slug: string, query = "") =>
      request<{ runtime: Record<string, unknown> }>(`/reactor/v1/products/${slug}/runtime${query}`, {}, 8_000),
    getReactorCatalogNodes: () => request<{ version: string; nodes: unknown[]; hint: string }>("/reactor/v1/catalog/nodes"),
    getReactorCatalogPorts: () => request<{ version: string; kinds: string[]; nodes: unknown[]; rules: string[] }>("/reactor/v1/catalog/ports"),
    getReactorCatalogFields: () => request<{ version: string; fieldTypes: string[]; nodes: unknown[] }>("/reactor/v1/catalog/fields"),
    getReactorCatalogAiProviders: () => request<{ version: string; providers: unknown[]; hint: string }>("/reactor/v1/catalog/ai-providers"),
    getReactorCatalogEvents: () => request<{ version: string; events: unknown[] }>("/reactor/v1/catalog/events"),
    getReactorCatalogComponents: () => request<{ version: string; components: unknown[] }>("/reactor/v1/catalog/components"),
    getReactorAgentCapabilities: () => request<{ apiVersion: string; permissions: string[]; tools: unknown[]; workflows: unknown[] }>("/reactor/v1/agent/capabilities"),
    getReactorAgentSchema: (prompt?: boolean) =>
      request<Record<string, unknown>>(`/reactor/v1/agent/schema${prompt ? "?prompt=1" : ""}`),
    validateReactorProductGraph: (slug: string, kind: "flow" | "view" | "data", graph?: import("./types.js").ReactorGraphPreview) =>
      request<{ validation: { ok: boolean; errors: unknown[]; warnings: unknown[] }; preview?: unknown }>(
        `/reactor/v1/products/${slug}/graphs/${kind}/validate`,
        { method: "POST", body: JSON.stringify(graph ?? {}) },
      ),
    reactorComposeProduct: (slug: string, body: { message: string; mode?: "plan" | "apply" | "clarify" | "morph-preview"; graphKind?: "flow" | "view" | "data"; plan?: import("./types.js").ReactorComposePlan }) =>
      request<{ mode: string; plan: import("./types.js").ReactorComposePlan }>(
        `/reactor/v1/products/${slug}/compose`, { method: "POST", body: JSON.stringify(body) },
      ),
    publishReactorProductV1: (slug: string) =>
      request<{ ok: boolean }>(`/reactor/v1/products/${slug}/publish`, { method: "POST" }),
    testReactorProductFlow: (slug: string, body: { leadId: string; taskId?: string }) =>
      request<{ ok: boolean; result?: unknown }>(`/reactor/v1/products/${slug}/flow/test`, { method: "POST", body: JSON.stringify(body) }),

    listSites: () => request<{ spaces: SiteSpace[] }>("/sites"),
    getSite: (id: string) => request<{ space: SiteSpace }>(`/sites/${id}`),
    createSite: (body: Partial<SiteSpace> & { name: string }) =>
      request<{ space: SiteSpace }>("/sites", { method: "POST", body: JSON.stringify(body) }),
    updateSite: (id: string, body: Partial<SiteSpace>) =>
      request<{ space: SiteSpace }>(`/sites/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteSite: (id: string) => request<{ ok: boolean }>(`/sites/${id}`, { method: "DELETE" }),
    siteAi: (id: string, body: {
      mode?: SiteAiMode;
      message: string;
      document: SiteDocument;
      selection?: string[];
      plan?: SiteBuildPlan;
      stepIndex?: number;
    }) =>
      request<SiteAiResponse>(`/sites/${id}/ai`, { method: "POST", body: JSON.stringify(body) }),

    getAgentSchema: (compact?: boolean) =>
      request<{ paradigm: string; entities: unknown[] }>(`/agent/schema${compact ? "?compact=1" : ""}`),
    getAgentCapabilities: () => request<{ permissions: string[]; actions: Record<string, boolean> }>("/agent/capabilities"),
    agentPatchFields: (
      entityType: "lead" | "task" | "contact" | "legal_entity",
      entityId: string,
      patches: { field: string; value: unknown }[],
    ) =>
      request<{ ok: boolean; errors?: { field: string; message: string }[] }>(
        `/agent/entities/${entityType}/${entityId}/fields`,
        { method: "PATCH", body: JSON.stringify({ patches }) },
      ),
    agentValidateFields: (
      entityType: "lead" | "task" | "contact" | "legal_entity",
      entityId: string,
      patches: { field: string; value: unknown }[],
    ) =>
      request<{ ok: boolean; errors?: { field: string; message: string }[] }>(
        "/agent/fields/validate",
        { method: "POST", body: JSON.stringify({ entityType, entityId, patches }) },
      ),

    listEdoDocuments: (params?: { leadId?: string; status?: string; taskId?: string }) => {
      const q = new URLSearchParams();
      if (params?.leadId) q.set("leadId", params.leadId);
      if (params?.status) q.set("status", params.status);
      if (params?.taskId) q.set("taskId", params.taskId);
      const qs = q.toString();
      return request<{ documents: EdoDocument[] }>(`/edo/documents${qs ? `?${qs}` : ""}`);
    },
    getEdoDocument: (id: string) => request<{ document: EdoDocument }>(`/edo/documents/${id}`),
    getEdoDocumentFileUrl: (id: string) => `${BASE}/edo/documents/${id}/file`,
    uploadEdoDocument: (form: FormData) =>
      fetch(`${BASE}/edo/documents`, { method: "POST", credentials, body: form }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
        return data as { document: EdoDocument };
      }),
    signEdoDocument: (id: string, body: { certThumbprint: string; certSubject: string; signatureBase64: string }) =>
      request<{ document: EdoDocument; signature: EdoSignature }>(`/edo/documents/${id}/signatures`, {
        method: "POST", body: JSON.stringify(body),
      }),
    sendEdoDocument: (id: string) =>
      request<{ document: EdoDocument }>(`/edo/documents/${id}/send`, { method: "POST" }),
    syncEdoDocumentStatus: (id: string) =>
      request<{ document: EdoDocument }>(`/edo/documents/${id}/status`),
    linkEdoDocument: (id: string, leadId: string | null) =>
      request<{ document: EdoDocument }>(`/edo/documents/${id}`, {
        method: "PATCH", body: JSON.stringify({ leadId }),
      }),
    getEdoConfig: () => request<{ config: EdoConfig }>("/edo/config"),
    saveEdoConfig: (body: Partial<EdoConfig> & { enabled?: boolean }) =>
      request<{ config: EdoConfig }>("/edo/config", { method: "PUT", body: JSON.stringify(body) }),
    testEdoConfig: (body?: Partial<EdoConfig> & { enabled?: boolean }) =>
      request<{ ok: boolean; mode: string; message: string; details?: string }>("/edo/config/test", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),

    getMailPresets: () => request<{ presets: MailProviderPreset[] }>("/mail/presets"),
    getMailConfig: () => request<{ config: { mode?: string; maxAccountsPerUser?: number } }>("/mail/config"),
    saveMailConfig: (body: { mode?: "mock" | "imap"; maxAccountsPerUser?: number }) =>
      request<{ config: Record<string, unknown> }>("/mail/config", { method: "PUT", body: JSON.stringify(body) }),
    listMailAccounts: () => request<{ accounts: MailAccount[] }>("/mail/accounts"),
    createMailAccount: (body: {
      email: string; displayName?: string; provider: MailProviderId; authType: string;
      password?: string; imapHost?: string; imapPort?: number; smtpHost?: string; smtpPort?: number; isShared?: boolean;
    }) => request<{ account: MailAccount }>("/mail/accounts", { method: "POST", body: JSON.stringify(body) }),
    deleteMailAccount: (id: string) => request<{ ok: boolean }>(`/mail/accounts/${id}`, { method: "DELETE" }),
    syncMailAccount: (id: string) => request<{ fetched: number; linked: number; inserted: number }>(`/mail/accounts/${id}/sync`, { method: "POST" }),
    testMailAccount: (id: string) => request<{ ok: boolean; imap: boolean; smtp: boolean; message: string }>(`/mail/accounts/${id}/test`, { method: "POST" }),
    listMailMessages: (params?: { accountId?: string; folder?: string; leadId?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.folder) q.set("folder", params.folder);
      if (params?.leadId) q.set("leadId", params.leadId);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return request<{ messages: MailMessage[] }>(`/mail/messages${qs ? `?${qs}` : ""}`);
    },
    getMailMessage: (id: string) => request<{ message: MailMessage }>(`/mail/messages/${id}`),
    patchMailMessage: (id: string, body: Partial<{ isRead: boolean; isStarred: boolean; leadId: string | null; edoDocumentId: string | null }>) =>
      request<{ message: MailMessage }>(`/mail/messages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    sendMail: (body: {
      accountId: string; to: MailAddress[]; cc?: MailAddress[]; subject: string;
      bodyText?: string; bodyHtml?: string; leadId?: string; edoDocumentId?: string;
    }) => request<{ message: MailMessage }>("/mail/send", { method: "POST", body: JSON.stringify(body) }),
    listLeadMail: (leadId: string) => request<{ messages: MailMessage[] }>(`/mail/leads/${leadId}`),

    listLegalEntities: (params?: { q?: string; leadId?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.leadId) q.set("leadId", params.leadId);
      const qs = q.toString();
      return request<{ entities: LegalEntity[] }>(`/legal-entities${qs ? `?${qs}` : ""}`);
    },
    lookupLegalInn: (inn: string) =>
      request<{ lookup: FnsLookup }>(`/legal-entities/lookup?inn=${encodeURIComponent(inn)}`),
    createLegalEntityFromInn: (body: { inn: string; refresh?: boolean; leadId?: string }) =>
      request<{ entity: LegalEntity }>("/legal-entities/from-inn", { method: "POST", body: JSON.stringify(body) }),
    getLegalEntity: (id: string) => request<{ entity: LegalEntity }>(`/legal-entities/${id}`),
    refreshLegalEntity: (id: string) =>
      request<{ entity: LegalEntity }>(`/legal-entities/${id}/refresh`, { method: "POST" }),
    linkLegalEntityToLead: (id: string, leadId: string) =>
      request<{ ok: boolean }>(`/legal-entities/${id}/link-lead`, { method: "POST", body: JSON.stringify({ leadId }) }),
    unlinkLegalEntityFromLead: (id: string, leadId: string) =>
      request<{ ok: boolean }>(`/legal-entities/${id}/link-lead/${leadId}`, { method: "DELETE" }),

    listContacts: (params?: { q?: string; leadId?: string; legalEntityId?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.leadId) q.set("leadId", params.leadId);
      if (params?.legalEntityId) q.set("legalEntityId", params.legalEntityId);
      const qs = q.toString();
      return request<{ contacts: CrmContact[] }>(`/contacts${qs ? `?${qs}` : ""}`);
    },
    createContact: (body: Partial<CrmContact> & { name: string; leadId?: string | null }) =>
      request<{ contact: CrmContact }>("/contacts", { method: "POST", body: JSON.stringify(body) }),
    getContact: (id: string) => request<{ contact: CrmContact }>(`/contacts/${id}`),
    updateContact: (id: string, body: Partial<CrmContact>) =>
      request<{ contact: CrmContact }>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    linkContactToLead: (id: string, leadId: string) =>
      request<{ ok: boolean }>(`/contacts/${id}/link-lead`, { method: "POST", body: JSON.stringify({ leadId }) }),
    unlinkContactFromLead: (id: string, leadId: string) =>
      request<{ ok: boolean }>(`/contacts/${id}/link-lead/${leadId}`, { method: "DELETE" }),

    listResourceGroups: () => request<{ groups: ResourceGroup[] }>("/resources/groups"),
    createResourceGroup: (body: Partial<ResourceGroup> & { name: string; pipelineIds?: string[]; roleAccess?: ResourceGroupRoleAccess[] }) =>
      request<{ group: ResourceGroup }>("/resources/groups", { method: "POST", body: JSON.stringify(body) }),
    updateResourceGroup: (id: string, body: Partial<ResourceGroup> & { pipelineIds?: string[]; roleAccess?: ResourceGroupRoleAccess[] }) =>
      request<{ group: ResourceGroup }>(`/resources/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteResourceGroup: (id: string) => request<{ ok: boolean }>(`/resources/groups/${id}`, { method: "DELETE" }),
    listResources: (params?: { q?: string; groupId?: string; pipelineId?: string; type?: string; leadId?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.groupId) q.set("groupId", params.groupId);
      if (params?.pipelineId) q.set("pipelineId", params.pipelineId);
      if (params?.type) q.set("type", params.type);
      if (params?.leadId) q.set("leadId", params.leadId);
      const qs = q.toString();
      return request<{ resources: ResourceItem[] }>(`/resources${qs ? `?${qs}` : ""}`);
    },
    createResource: (body: Partial<ResourceItem> & { name: string }) =>
      request<{ resource: ResourceItem }>("/resources", { method: "POST", body: JSON.stringify(body) }),
    updateResource: (id: string, body: Partial<ResourceItem>) =>
      request<{ resource: ResourceItem }>(`/resources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteResource: (id: string) => request<{ ok: boolean }>(`/resources/${id}`, { method: "DELETE" }),
    listLeadResourceLines: (leadId: string) =>
      request<{ lines: LeadResourceLine[] }>(`/resources/leads/${leadId}/lines`),
    setLeadResourceLines: (leadId: string, lines: Partial<LeadResourceLine>[]) =>
      request<{ lines: LeadResourceLine[] }>(`/resources/leads/${leadId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) }),
    listEdoDocumentLines: (documentId: string) =>
      request<{ lines: EdoDocumentLine[] }>(`/resources/documents/${documentId}/lines`),
    setEdoDocumentLines: (documentId: string, lines: Partial<EdoDocumentLine>[]) =>
      request<{ lines: EdoDocumentLine[] }>(`/resources/documents/${documentId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) }),
    copyLeadLinesToDocument: (documentId: string, leadId: string) =>
      request<{ lines: EdoDocumentLine[] }>(`/resources/documents/${documentId}/from-lead/${leadId}`, { method: "POST" }),

    getAssetsSummary: () => request<{ summary: AssetsSummary }>("/assets/summary"),
    listAssetGroups: (kind?: string) =>
      request<{ groups: AssetGroup[] }>(`/assets/groups${kind ? `?kind=${kind}` : ""}`),
    createAssetGroup: (body: Partial<AssetGroup> & { name: string }) =>
      request<{ group: AssetGroup }>("/assets/groups", { method: "POST", body: JSON.stringify(body) }),
    updateAssetGroup: (id: string, body: Partial<AssetGroup>) =>
      request<{ group: AssetGroup }>(`/assets/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteAssetGroup: (id: string) => request<{ ok: boolean }>(`/assets/groups/${id}`, { method: "DELETE" }),
    listAssets: (params?: { q?: string; groupId?: string; kind?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.groupId) q.set("groupId", params.groupId);
      if (params?.kind) q.set("kind", params.kind);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return request<{ assets: CompanyAsset[] }>(`/assets${qs ? `?${qs}` : ""}`);
    },
    createAsset: (body: Partial<CompanyAsset> & { name: string }) =>
      request<{ asset: CompanyAsset }>("/assets", { method: "POST", body: JSON.stringify(body) }),
    updateAsset: (id: string, body: Partial<CompanyAsset>) =>
      request<{ asset: CompanyAsset }>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteAsset: (id: string) => request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" }),
    listAssetMovements: (assetId: string) =>
      request<{ movements: AssetMovement[] }>(`/assets/${assetId}/movements`),
    addAssetMovement: (assetId: string, body: { movementType: string; amount?: number | null; notes?: string | null }) =>
      request<{ movement: AssetMovement }>(`/assets/${assetId}/movements`, { method: "POST", body: JSON.stringify(body) }),
    runAssetDepreciation: (assetId: string) =>
      request<{ movement: AssetMovement }>(`/assets/${assetId}/depreciate`, { method: "POST" }),

    listCrmFields: (entityType: string) =>
      request<{ fields: Field[] }>(`/crm-fields?entityType=${encodeURIComponent(entityType)}`),
    getEntityFieldValues: (entityType: string, entityId: string) =>
      request<{ fields: Field[]; values: Record<string, unknown> }>(`/crm-fields/values/${entityType}/${entityId}`),
    setEntityFieldValues: (entityType: string, entityId: string, body: { values: Record<string, unknown>; stageId?: string }) =>
      request<{ ok: boolean; values: Record<string, unknown> }>(`/crm-fields/values/${entityType}/${entityId}`, {
        method: "PUT", body: JSON.stringify(body),
      }),
  };
}

export type AiboardGraph = { nodes: Record<string, unknown>[]; wires: Record<string, unknown>[] };

export type AiboardAggregationResult = {
  stats: Record<string, unknown>;
  node_health: Record<string, string>;
  wire_health: Record<string, string>;
  conflicts: { key: string; role: string; status: string }[];
  canonical_preview: Record<string, unknown>[];
  aggregate_preview: Record<string, unknown>[];
  verdict: string;
  pending_mappings?: PendingFieldMapping[];
  mapping_threshold?: number;
};

export type PendingFieldMapping = {
  sourceField: string;
  targetRole: string;
  confidence: number;
  nodeId?: string;
};

export type AiboardAggregationJob = {
  id: string;
  status: "pending" | "running" | "done" | "error";
  createdAt: string;
  finishedAt?: string;
  error?: string;
  result?: AiboardAggregationResult;
};

export type AiboardDashboardQueryResult = {
  reply: string;
  manifest: {
    title: string;
    chartType: "bar" | "line" | "pie" | "kpi" | "table";
    measure: string;
    groupBy?: string | null;
    aggregate: string;
  };
  result: {
    rows: { name: string; value: number }[];
    kpi?: number;
    rowCount: number;
  };
  source?: "ai" | "rules";
  steps?: { id: string; kind: string; text: string; detail?: string }[];
};

export type AiboardDashboardStreamChunk =
  | { type: "step"; kind: string; text: string; detail?: string }
  | { type: "reasoning"; text: string }
  | { type: "result"; dashboard: AiboardDashboardQueryResult }
  | { type: "error"; text: string };

export type AiDocEntry = {
  id: string;
  path: string;
  title: string;
  tags: string[];
  summary: string;
};

export type ApiClient = ReturnType<typeof createApiClient>;
export type { NotificationPrefs } from "./types.js";
