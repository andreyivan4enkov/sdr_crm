import {
  pgTable, text, timestamp, boolean, jsonb, integer, uuid, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("pending"),
  roleId: uuid("role_id").references(() => roles.id),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpBackupCodes: jsonb("totp_backup_codes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("users_status_idx").on(t.status),
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  region: text("region"),
  position: text("position"),
  avatar: text("avatar"),
  orgUnitId: uuid("org_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgUnits = pgTable("org_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  description: text("description"),
  defaultRoleId: uuid("default_role_id").references(() => roles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const realtors = pgTable("realtors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  phone: text("phone"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orgUnitId: uuid("org_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
  position: text("position"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "cascade" }).notNull(),
  label: text("label").notNull(),
  color: text("color").notNull().default("sky"),
  sortOrder: integer("sort_order").notNull().default(0),
  automations: jsonb("automations").$type<StageAutomation[]>().notNull().default([]),
});

export const fields = pgTable("fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"),
  sortOrder: integer("sort_order").notNull().default(0),
  gridCol: integer("grid_col").notNull().default(0),
  gridRow: integer("grid_row").notNull().default(0),
  gridSpan: integer("grid_span").notNull().default(2),
});

export const crmMeta = pgTable("crm_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
});

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  connected: boolean("connected").notNull().default(false),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  region: text("region"),
  preferredTime: text("preferred_time"),
  comment: text("comment"),
  source: text("source").notNull().default("form"),
  channelId: uuid("channel_id").references(() => channels.id),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id).notNull(),
  statusId: uuid("status_id").references(() => stages.id),
  assignedRealtorId: uuid("assigned_realtor_id").references(() => realtors.id),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  watchers: jsonb("watchers").$type<string[]>().notNull().default([]),
  custom: jsonb("custom").$type<Record<string, string>>().notNull().default({}),
  pdConsent: boolean("pd_consent").notNull().default(false),
  pdConsentAt: timestamp("pd_consent_at", { withTimezone: true }),
  pdConsentRevoked: boolean("pd_consent_revoked").notNull().default(false),
  pdConsentRevokedAt: timestamp("pd_consent_revoked_at", { withTimezone: true }),
  erasedAt: timestamp("erased_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("leads_phone_idx").on(t.phone),
  index("leads_status_idx").on(t.statusId),
  index("leads_created_idx").on(t.createdAt),
]);

export const leadSdrVectors = pgTable("lead_sdr_vectors", {
  leadId: uuid("lead_id").primaryKey().references(() => leads.id, { onDelete: "cascade" }),
  vector: text("vector").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadNotes = pgTable("lead_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  author: text("author").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  description: text("description"),
  assignee: text("assignee"),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
  author: text("author"),
  creatorUserId: uuid("creator_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  status: text("status").notNull().default("new"),
  priority: text("priority").notNull().default("normal"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  checklist: jsonb("checklist").$type<TaskChecklistItem[]>().notNull().default([]),
  statusSummary: text("status_summary"),
  requireSummary: boolean("require_summary").notNull().default(false),
  watchers: jsonb("watchers").$type<string[]>().notNull().default([]),
  coExecutors: jsonb("co_executors").$type<string[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  files: jsonb("files").$type<TaskFile[]>().notNull().default([]),
  comments: jsonb("comments").$type<TaskComment[]>().notNull().default([]),
  pinnedResult: jsonb("pinned_result").$type<TaskPinnedResult | null>(),
  notifyParticipants: boolean("notify_participants").notNull().default(true),
  dueNotifiedAt: timestamp("due_notified_at", { withTimezone: true }),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type TaskStatus = "new" | "in_progress" | "waiting" | "deferred" | "completed";
export type TaskPriority = "low" | "normal" | "high";
export type TaskChecklistItem = { id: string; text: string; done: boolean };
export type TaskFile = { id: string; name: string; mimeType?: string; dataUrl?: string; createdAt: string };
export type TaskComment = { id: string; text: string; author: string; authorUserId?: string; createdAt: string };
export type TaskPinnedResult = {
  text: string;
  commentId?: string;
  agreedByUserId: string;
  agreedByName: string;
  agreedAt: string;
};

export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id"),
  phone: text("phone").notNull(),
  direction: text("direction").notNull(),
  duration: integer("duration").default(0),
  recordingUrl: text("recording_url"),
  transcript: text("transcript"),
  transcriptStatus: text("transcript_status").default("none"),
  aiSummary: text("ai_summary"),
  aiSuggestions: jsonb("ai_suggestions").$type<Record<string, string>>().default({}),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  provider: text("provider"),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("calls_phone_idx").on(t.phone),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  userLogin: text("user_login"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_log_created_idx").on(t.createdAt),
  index("audit_log_user_idx").on(t.userId),
  index("audit_log_action_idx").on(t.action),
]);

export const notificationSettings = pgTable("notification_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<NotificationPrefs>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("push_subscriptions_user_endpoint_idx").on(t.userId, t.endpoint),
]);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("integrations_type_idx").on(t.type),
]);

export type Integration = typeof integrations.$inferSelect;

export type StageAutomationType =
  | "reply" | "task" | "notify"
  | "move" | "copy" | "assign" | "field";

export type StageAutomation = {
  id: string;
  type: StageAutomationType;
  channelId?: string | null;
  author?: string;
  recipient?: string;
  text?: string;
  targetStageId?: string | null;
  targetPipelineId?: string | null;
  assignUserId?: string | null;
  fieldKey?: string | null;
  fieldValue?: string | null;
};

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

export const analyticsDashboards = pgTable("analytics_dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  widgets: jsonb("widgets").$type<AnalyticsWidget[]>().notNull().default([]),
  goals: jsonb("goals").$type<AnalyticsGoal[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnalyticsDashboard = typeof analyticsDashboards.$inferSelect;

export type NotificationPrefs = {
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  incomingCall?: boolean;
  newLead?: boolean;
  stageNotify?: boolean;
  callTranscript?: boolean;
  callRecording?: boolean;
  taskAssigned?: boolean;
  taskUpdated?: boolean;
  taskDue?: boolean;
};

export type AuthUser = {
  id: string;
  login: string;
  email: string;
  status: string;
  roleId: string | null;
  roleName: string | null;
  roleLabel: string | null;
  permissions: string[];
  orgUnitName: string | null;
  profile: {
    name: string;
    phone: string | null;
    region: string | null;
    position: string | null;
    avatar: string | null;
    orgUnitId: string | null;
  } | null;
};
