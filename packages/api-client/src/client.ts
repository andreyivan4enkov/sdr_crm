import type {
  AdminUser, AnalyticsDashboard, AuditLog, AuthUser, BackupConfig, BackupListItem, BackupStatus, Call, Channel, Field, Integration, Lead,
  LeadCardLayout, NotificationPrefs, OrgUnit, Pipeline, Profile, Realtor, Role, Stage, Task, TeamPayload,
} from "./types.js";

export type ApiClientConfig = {
  /** Базовый URL API, например `/api` или `https://crm.example.ru/api` */
  baseUrl?: string;
  credentials?: RequestCredentials;
};

export function createApiClient(config: ApiClientConfig = {}) {
  const BASE = (config.baseUrl ?? "/api").replace(/\/$/, "");
  const credentials = config.credentials ?? "include";

  async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      credentials,
      headers: { "Content-Type": "application/json", ...opts.headers as Record<string, string> },
      ...opts,
    });
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
    health: () => request<{ ok: boolean; db: string; version: string; ts: number }>("/health"),

    getAuthConfig: () => request<{ demoLogin: boolean; publicUrl?: string; demoUsers?: { login: string; password: string; name: string }[] }>("/auth/config"),

    getPrivacy: () => request<{ operator: string; operatorEmail: string; updatedAt: string; sections: { title: string; text: string }[] }>("/public/privacy"),

    publicRevoke: (body: { phone: string; email?: string }) =>
      request<{ ok: boolean; message: string }>("/public/revoke", { method: "POST", body: JSON.stringify(body) }),

    verifyInvite: (token: string) =>
      request<{ valid: boolean; role?: string; roleName?: string; isRealtor?: boolean; error?: string }>(`/auth/invite/verify?token=${encodeURIComponent(token)}`),

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
        throw new Error("API недоступен. Запустите: npm run dev:all");
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.requiresTotp) return { requiresTotp: true as const };
      if (!res.ok) {
        const msg = data.error
          || (res.status === 500 ? "Ошибка сервера. Попробуйте: npm run db:reset" : `HTTP ${res.status}`);
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
    }) => request<{ profile: import("./types.js").Profile; user: AuthUser }>("/auth/profile", { method: "PATCH", body: JSON.stringify(body) }),

    totpStatus: () => request<{ enabled: boolean; available: boolean }>("/auth/totp/status"),
    totpSetup: () => request<{ secret: string; uri: string }>("/auth/totp/setup", { method: "POST" }),
    totpEnable: (secret: string, code: string) =>
      request<{ ok: boolean; backupCodes: string[] }>("/auth/totp/enable", { method: "POST", body: JSON.stringify({ secret, code }) }),
    totpDisable: (password: string, code: string) =>
      request<{ ok: boolean }>("/auth/totp/disable", { method: "POST", body: JSON.stringify({ password, code }) }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),

    getSettings: () => request<{ pipelines: Pipeline[]; stages: Stage[]; fields: Field[]; channels: Channel[]; cardLayout?: LeadCardLayout }>("/settings"),

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

    createLead: (body: Partial<Lead> & { pdConsent?: boolean }) =>
      request<{ lead: Lead }>("/leads", { method: "POST", body: JSON.stringify(body) }),

    updateLead: (id: string, body: Partial<Lead>) =>
      request<{ lead: Lead }>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

    getLeadHistory: (id: string) =>
      request<import("./types.js").LeadHistoryPayload>(`/leads/${id}/history`),

    addNote: (id: string, text: string) =>
      request<{ note: import("./types.js").Note }>(`/leads/${id}/notes`, { method: "POST", body: JSON.stringify({ text }) }),

    deleteLead: (id: string) => request<{ ok: boolean }>(`/leads/${id}`, { method: "DELETE" }),

    publicLead: (body: { name: string; phone: string; region?: string; preferredTime?: string; comment?: string; pdConsent: true }) =>
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
    createRealtor: (body: Partial<Realtor>) => request<{ realtor: Realtor }>("/team", { method: "POST", body: JSON.stringify(body) }),
    updateRealtor: (id: string, body: Partial<Realtor>) => request<{ realtor: Realtor }>(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
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
    updateFields: (fields: Field[]) => request<{ fields: Field[] }>("/settings/fields", { method: "PATCH", body: JSON.stringify(fields) }),
    updateCardLayout: (cardLayout: LeadCardLayout) => request<{ cardLayout: LeadCardLayout }>("/settings/card-layout", { method: "PATCH", body: JSON.stringify(cardLayout) }),
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { NotificationPrefs } from "./types.js";
