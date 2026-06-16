export type AuthUser = {
  id: string;
  login: string;
  email: string;
  status: string;
  role: string | null;
  roleLabel?: string | null;
  permissions: string[];
  name: string;
  phone?: string;
  region?: string;
  position?: string;
  avatar?: string | null;
  orgUnitId?: string | null;
  orgUnitName?: string | null;
};

export type Pipeline = { id: string; name: string; sortOrder?: number; isDefault?: boolean };

export type Stage = { id: string; pipelineId: string; label: string; color: string; sortOrder?: number; automations?: Automation[] };

export type AnalyticsKpiMetric =
  | "leads_total" | "stage_count" | "channels_connected"
  | "deals_signed" | "money_sum"
  | "calls_total" | "calls_inbound" | "calls_outbound"
  | "tasks_total" | "tasks_open" | "tasks_done";

export type GoalOperator = "gte" | "gt" | "lte" | "lt" | "eq" | "neq";

export type AnalyticsGoal = {
  id: string;
  title: string;
  metric: AnalyticsKpiMetric;
  stageId?: string | null;
  fieldId?: string | null;
  operator?: GoalOperator;
  target: number;
  sortOrder: number;
};

export type AnalyticsWidget =
  | { id: string; type: "kpi"; label: string; metric: AnalyticsKpiMetric; stageId?: string | null; enabled: boolean; sortOrder: number }
  | { id: string; type: "goal"; goalId: string; enabled: boolean; sortOrder: number }
  | { id: string; type: "funnel"; stageIds?: string[]; enabled: boolean; sortOrder: number }
  | { id: string; type: "recent"; limit?: number; enabled: boolean; sortOrder: number };

export type AnalyticsDashboard = {
  id: string;
  name: string;
  sortOrder: number;
  widgets: AnalyticsWidget[];
  goals: AnalyticsGoal[];
};
export type Field = { id: string; label: string; type: string; sortOrder?: number; gridCol?: number; gridRow?: number; gridSpan?: number };

export type LeadCardBuiltinKey = "region" | "preferredTime" | "channel" | "email";
export type GridLayoutCell = { gridCol: number; gridRow: number; gridSpan: number };
export type LeadCardLayout = Partial<Record<LeadCardBuiltinKey, GridLayoutCell>>;
export type Channel = { id: string; name: string; type: string; connected: boolean; config?: Record<string, unknown> };
export type OrgUnit = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  description?: string | null;
  defaultRoleId?: string | null;
  defaultRoleName?: string | null;
};

export type TeamMember = {
  id: string;
  name: string;
  avatar?: string | null;
  position?: string | null;
  region?: string | null;
  phone?: string | null;
  roleName?: string | null;
};

export type TeamUser = {
  id: string;
  login: string;
  name: string | null;
  roleId: string | null;
  roleName: string | null;
};

export type Realtor = {
  id: string;
  name: string;
  region: string;
  phone?: string | null;
  userId?: string | null;
  orgUnitId?: string | null;
  position?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  orgUnitName?: string | null;
  userLogin?: string | null;
  createdAt?: string;
};

export type TeamPayload = {
  orgUnits: OrgUnit[];
  realtors: Realtor[];
  roles: Role[];
  linkableUsers: TeamUser[];
  employees: TeamMember[];
  allPermissions: string[];
};
export type Note = { id: string; text: string; author: string; createdAt: string };
export type Lead = {
  id: string; name: string; phone?: string; email?: string; region?: string;
  preferredTime?: string; comment?: string; source: string;
  channelId?: string | null; pipelineId?: string; statusId?: string; assignedRealtorId?: string | null;
  assignedUserId?: string | null;
  watchers?: string[];
  custom?: Record<string, string>; notes?: Note[]; createdBy?: string;
  pdConsent?: boolean; pdConsentAt?: string | null;
  pdConsentRevoked?: boolean; pdConsentRevokedAt?: string | null;
  erasedAt?: string | null;
  createdAt: string; updatedAt: string;
};
export type TaskChecklistItem = { id: string; text: string; done: boolean };
export type TaskComment = { id: string; text: string; author: string; authorUserId?: string; createdAt: string };
export type TaskPinnedResult = {
  text: string;
  commentId?: string;
  agreedByUserId: string;
  agreedByName: string;
  agreedAt: string;
};
export type TaskStatus = "new" | "in_progress" | "waiting" | "deferred" | "completed";
export type TaskPriority = "low" | "normal" | "high";

export type TaskFile = { id: string; name: string; mimeType?: string; dataUrl?: string; createdAt: string };

export type Task = {
  id: string;
  text: string;
  description?: string;
  assignee?: string;
  assigneeUserId?: string;
  author?: string;
  creatorUserId?: string;
  reviewerUserId?: string;
  leadId?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string;
  checklist: TaskChecklistItem[];
  statusSummary?: string;
  requireSummary?: boolean;
  watchers?: string[];
  coExecutors?: string[];
  tags?: string[];
  files?: TaskFile[];
  comments?: TaskComment[];
  pinnedResult?: TaskPinnedResult;
  notifyParticipants?: boolean;
  done: boolean;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
};
export type Automation = {
  id: string;
  type: string;
  channelId?: string;
  author?: string;
  recipient?: string;
  text?: string;
  targetStageId?: string;
  targetPipelineId?: string;
  assignUserId?: string;
  fieldKey?: string;
  fieldValue?: string;
};
export type AdminUser = {
  id: string; login: string; email: string; status: string; roleId?: string; roleName?: string;
  profileName?: string; profilePhone?: string; profileRegion?: string; profilePosition?: string;
  profileOrgUnitId?: string | null; orgUnitName?: string | null;
};
export type Role = { id: string; name: string; label: string; permissions: string[] };
export type Profile = {
  id: string;
  userId: string;
  name: string;
  phone?: string | null;
  region?: string | null;
  position?: string | null;
  avatar?: string | null;
  orgUnitId?: string | null;
};

export type MyProfilePayload = {
  profile: Profile | null;
  account: {
    login: string;
    email: string;
    role: string | null;
    roleLabel: string | null;
    status: string;
    orgUnitName: string | null;
    isRealtor: boolean;
  };
};
export type Integration = {
  id: string; type: string; enabled: boolean; config: Record<string, unknown>;
  webhookUrl?: string; webhookUrlWithSecret?: string;
  beelineEventUrl?: string; beelineSubscriptionId?: string | null;
};
export type IntegrationEndpoints = {
  health: string; tildaWebhook: string; telephonyWebhookPrefix: string;
  marketingWebhookPrefix: string;
  publicLeads: string; publicRevoke: string; privacy: string; eventsStream: string;
};
export type Call = {
  id: string;
  externalId?: string | null;
  phone: string;
  direction: string;
  duration?: number | null;
  recordingUrl?: string | null;
  hasRecording?: boolean;
  transcript?: string | null;
  transcriptStatus?: string | null;
  aiSummary?: string | null;
  aiSuggestions?: Record<string, string>;
  leadId?: string | null;
  provider?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type NotificationPrefs = {
  pushEnabled: boolean;
  inAppEnabled: boolean;
  incomingCall: boolean;
  newLead: boolean;
  stageNotify: boolean;
  callTranscript: boolean;
  callRecording: boolean;
  taskAssigned: boolean;
  taskUpdated: boolean;
  taskDue: boolean;
};
export type AuditLog = { id: string; action: string; userLogin?: string; ip?: string; entityType?: string; entityId?: string; createdAt: string };

export type LeadHistoryEvent = {
  action: string;
  label: string;
  actor: string;
  userLogin: string | null;
  at: string;
  details: string[];
};

export type LeadHistoryPayload = {
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  events: LeadHistoryEvent[];
};

export type BackupConfig = {
  remoteEnabled: boolean;
  remoteUrl: string;
  retentionDays: number;
  alertWebhook: string;
};

export type BackupListItem = {
  name: string;
  size: number;
  mtime: string;
  sha256?: string;
  pgVersion?: string;
};

export type BackupStatus = {
  supported: boolean;
  backupDir: string;
  schedule: string;
  config: BackupConfig;
  backups: BackupListItem[];
  latest: BackupListItem | null;
  logTail: string[];
};
