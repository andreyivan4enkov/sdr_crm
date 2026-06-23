import {
  pgTable, text, timestamp, boolean, jsonb, integer, uuid, index, uniqueIndex, primaryKey, real,
} from "drizzle-orm/pg-core";
import type { ReactorGraph } from "@sdr-crm/reactor-core";

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  locale: text("locale").notNull().default("ru"),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealManagers = pgTable("deal_managers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  phone: text("phone"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orgUnitId: uuid("org_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
  position: text("position"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  pipelineType: text("pipeline_type").notNull().default("sales"),
  parentPipelineId: uuid("parent_pipeline_id"),
  parentStageId: uuid("parent_stage_id"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PipelineType = "sales" | "process" | "subprocess";

export type BlueprintGraph = {
  nodes: {
    id: string;
    type: string;
    x: number;
    y: number;
    cfg: Record<string, string>;
    bindings?: {
      entity?: string;
      pipelineId?: string | null;
      stageId?: string | null;
      taskStatus?: string | null;
      tags?: string[];
      fieldId?: string | null;
      fieldKey?: string | null;
    };
    ports?: { in: unknown[]; out: unknown[] };
  }[];
  edges: {
    id: string;
    from: { node: string; port: string };
    to: { node: string; port: string };
    kind: "exec" | "data";
    status?: string;
  }[];
};

export type ReactionBindingLink = {
  target: "pipeline" | "stage" | "task_status" | "edo_status" | "mail" | "team" | "resource_group" | "resource";
  id: string;
  label?: string;
};

export const blueprintSpaces = pgTable("blueprint_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "set null" }),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
  graph: jsonb("graph").$type<BlueprintGraph>().notNull().default({ nodes: [], edges: [] }),
  bindings: jsonb("bindings").$type<ReactionBindingLink[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("blueprint_spaces_pipeline_idx").on(t.pipelineId),
  index("blueprint_spaces_stage_idx").on(t.stageId),
]);

export const blueprintInstances = pgTable("blueprint_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull().references(() => blueprintSpaces.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("RUNNING"),
  currentNodeId: text("current_node_id"),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  log: jsonb("log").$type<{ msg: string; at: string; nodeId?: string }[]>().notNull().default([]),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("blueprint_instances_space_idx").on(t.spaceId),
  index("blueprint_instances_lead_idx").on(t.leadId),
  index("blueprint_instances_state_idx").on(t.state),
]);

export type BlueprintSpace = typeof blueprintSpaces.$inferSelect;
export type BlueprintInstance = typeof blueprintInstances.$inferSelect;

export type SiteDocument = import("@sdr-crm/site-core").SiteDocument;

export const siteSpaces = pgTable("site_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().default("home"),
  description: text("description"),
  document: jsonb("document").$type<SiteDocument>().notNull().default({
    pages: [{ id: "page-home", slug: "home", title: "Главная" }],
    activePageId: "page-home",
    blocks: [],
    links: [],
    theme: {},
  }),
  published: boolean("published").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("site_spaces_slug_idx").on(t.slug),
]);

export type SiteSpace = typeof siteSpaces.$inferSelect;

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "cascade" }).notNull(),
  label: text("label").notNull(),
  color: text("color").notNull().default("sky"),
  sortOrder: integer("sort_order").notNull().default(0),
  automations: jsonb("automations").$type<StageAutomation[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fields = pgTable("fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"),
  sortOrder: integer("sort_order").notNull().default(0),
  gridCol: integer("grid_col").notNull().default(0),
  gridRow: integer("grid_row").notNull().default(0),
  gridSpan: integer("grid_span").notNull().default(2),
  entityTypes: jsonb("entity_types").$type<string[]>().notNull().default(["lead"]),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entityFieldValues = pgTable("entity_field_values", {
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  fieldId: uuid("field_id").notNull().references(() => fields.id, { onDelete: "cascade" }),
  value: jsonb("value").notNull().default(null),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.entityType, t.entityId, t.fieldId], name: "entity_field_values_pk" }),
  index("entity_field_values_entity_idx").on(t.entityType, t.entityId),
]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  assignedDealManagerId: uuid("assigned_deal_manager_id").references(() => dealManagers.id),
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
  index("leads_assigned_user_idx").on(t.assignedUserId),
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
}, (t) => [
  index("tasks_assignee_user_idx").on(t.assigneeUserId),
  index("tasks_status_idx").on(t.status),
  index("tasks_due_at_idx").on(t.dueAt),
]);

export type TaskStatus = "new" | "in_progress" | "waiting" | "deferred" | "completed";
export type TaskPriority = "low" | "normal" | "high";
export type TaskChecklistItem = { id: string; text: string; done: boolean };
export type TaskFile = { id: string; name: string; mimeType?: string; storagePath?: string; createdAt: string };
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
  uniqueIndex("calls_provider_external_idx").on(t.provider, t.externalId),
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
  index("audit_log_entity_idx").on(t.entityType, t.entityId),
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

export type LegalEntityType = "ul" | "ip";
export type LegalEntityStatus = "active" | "liquidated" | "unknown";

export const legalEntities = pgTable("legal_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  inn: text("inn").notNull(),
  kpp: text("kpp"),
  ogrn: text("ogrn"),
  entityType: text("entity_type").notNull().default("ul"),
  fullName: text("full_name").notNull(),
  shortName: text("short_name"),
  legalAddress: text("legal_address"),
  directorName: text("director_name"),
  status: text("status").notNull().default("active"),
  registrationDate: text("registration_date"),
  okved: text("okved"),
  fnsData: jsonb("fns_data").$type<Record<string, unknown>>().notNull().default({}),
  fnsFetchedAt: timestamp("fns_fetched_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("legal_entities_inn_idx").on(t.inn),
  index("legal_entities_name_idx").on(t.fullName),
]);

export const crmContacts = pgTable("crm_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  comment: text("comment"),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("crm_contacts_legal_idx").on(t.legalEntityId),
  index("crm_contacts_name_idx").on(t.name),
]);

export const leadLegalEntities = pgTable("lead_legal_entities", {
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  legalEntityId: uuid("legal_entity_id").notNull().references(() => legalEntities.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.leadId, t.legalEntityId], name: "lead_legal_entities_pk" }),
]);

export const leadCrmContacts = pgTable("lead_crm_contacts", {
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => crmContacts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.leadId, t.contactId], name: "lead_crm_contacts_pk" }),
]);

export type LegalEntityRow = typeof legalEntities.$inferSelect;
export type CrmContactRow = typeof crmContacts.$inferSelect;

export type EdoDocumentStatus = "draft" | "signed" | "sent" | "delivered" | "rejected";
export type EdoDocumentType = "contract" | "act" | "invoice" | "other";

export const edoDocuments = pgTable("edo_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: text("type").notNull().default("other"),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  status: text("status").notNull().default("draft"),
  direction: text("direction").notNull().default("outgoing"),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  counterpartyInn: text("counterparty_inn"),
  counterpartyName: text("counterparty_name"),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("mock"),
  externalId: text("external_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("edo_documents_lead_idx").on(t.leadId),
  index("edo_documents_status_idx").on(t.status),
  index("edo_documents_external_idx").on(t.externalId),
  index("edo_documents_legal_entity_idx").on(t.legalEntityId),
]);

export const edoSignatures = pgTable("edo_signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => edoDocuments.id, { onDelete: "cascade" }),
  certThumbprint: text("cert_thumbprint").notNull(),
  certSubject: text("cert_subject").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  sigPath: text("sig_path").notNull(),
  isValid: boolean("is_valid").notNull().default(true),
}, (t) => [
  index("edo_signatures_document_idx").on(t.documentId),
]);

export type EdoDocumentRow = typeof edoDocuments.$inferSelect;
export type EdoSignatureRow = typeof edoSignatures.$inferSelect;

export type ResourceType = "product" | "service" | "bundle";
export type ResourceStatus = "active" | "archived";
export type AssetKind = "tangible" | "intangible";
export type AssetClass = "furniture" | "equipment" | "vehicle" | "real_estate" | "it" | "software" | "license" | "patent" | "trademark" | "domain" | "goodwill" | "other";
export type AssetStatus = "active" | "in_repair" | "reserved" | "written_off" | "sold";

export const resourceGroups = pgTable("resource_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("resource_groups_parent_idx").on(t.parentId),
]);

export const resourceGroupPipelines = pgTable("resource_group_pipelines", {
  groupId: uuid("group_id").notNull().references(() => resourceGroups.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.pipelineId], name: "resource_group_pipelines_pk" }),
]);

export const resourceGroupRoleAccess = pgTable("resource_group_role_access", {
  groupId: uuid("group_id").notNull().references(() => resourceGroups.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  canView: boolean("can_view").notNull().default(true),
  canManage: boolean("can_manage").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.roleId], name: "resource_group_role_access_pk" }),
]);

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").references(() => resourceGroups.id, { onDelete: "set null" }),
  sku: text("sku"),
  name: text("name").notNull(),
  resourceType: text("resource_type").notNull().default("product"),
  unit: text("unit").notNull().default("шт"),
  price: real("price").notNull().default(0),
  currency: text("currency").notNull().default("RUB"),
  vatRate: real("vat_rate").notNull().default(0),
  costPrice: real("cost_price").notNull().default(0),
  trackInventory: boolean("track_inventory").notNull().default(false),
  stockQty: real("stock_qty").notNull().default(0),
  status: text("status").notNull().default("active"),
  description: text("description"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("resources_group_idx").on(t.groupId),
  index("resources_sku_idx").on(t.sku),
  index("resources_name_idx").on(t.name),
]);

export const leadResourceLines = pgTable("lead_resource_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  qty: real("qty").notNull().default(1),
  unit: text("unit").notNull().default("шт"),
  unitPrice: real("unit_price").notNull().default(0),
  discountPct: real("discount_pct").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(0),
  amount: real("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lead_resource_lines_lead_idx").on(t.leadId),
]);

export const edoDocumentLines = pgTable("edo_document_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => edoDocuments.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  qty: real("qty").notNull().default(1),
  unit: text("unit").notNull().default("шт"),
  unitPrice: real("unit_price").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(0),
  amount: real("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  index("edo_document_lines_doc_idx").on(t.documentId),
]);

export const assetGroups = pgTable("asset_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  kind: text("kind").notNull().default("tangible"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("asset_groups_parent_idx").on(t.parentId),
]);

export const companyAssets = pgTable("company_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").references(() => assetGroups.id, { onDelete: "set null" }),
  inventoryNumber: text("inventory_number"),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull().default("equipment"),
  assetKind: text("asset_kind").notNull().default("tangible"),
  status: text("status").notNull().default("active"),
  serialNumber: text("serial_number"),
  location: text("location"),
  responsibleUserId: uuid("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
  purchaseDate: text("purchase_date"),
  purchaseCost: real("purchase_cost").notNull().default(0),
  currentValue: real("current_value").notNull().default(0),
  salvageValue: real("salvage_value").notNull().default(0),
  usefulLifeMonths: integer("useful_life_months"),
  depreciationMethod: text("depreciation_method").notNull().default("linear"),
  accumulatedDepreciation: real("accumulated_depreciation").notNull().default(0),
  currency: text("currency").notNull().default("RUB"),
  warrantyUntil: text("warranty_until"),
  licenseKey: text("license_key"),
  expiryDate: text("expiry_date"),
  intangibleType: text("intangible_type"),
  description: text("description"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("company_assets_group_idx").on(t.groupId),
  index("company_assets_inv_idx").on(t.inventoryNumber),
]);

export const assetMovements = pgTable("asset_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => companyAssets.id, { onDelete: "cascade" }),
  movementType: text("movement_type").notNull(),
  amount: real("amount"),
  notes: text("notes"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  index("asset_movements_asset_idx").on(t.assetId),
]);

export type ResourceGroupRow = typeof resourceGroups.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type LeadResourceLineRow = typeof leadResourceLines.$inferSelect;
export type EdoDocumentLineRow = typeof edoDocumentLines.$inferSelect;
export type AssetGroupRow = typeof assetGroups.$inferSelect;
export type CompanyAssetRow = typeof companyAssets.$inferSelect;
export type AssetMovementRow = typeof assetMovements.$inferSelect;

export const mailAccounts = pgTable("mail_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  displayName: text("display_name"),
  provider: text("provider").notNull().default("custom"),
  authType: text("auth_type").notNull().default("password"),
  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  imapSecure: boolean("imap_secure").notNull().default(true),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpSecure: boolean("smtp_secure").notNull().default(true),
  authSecretEnc: text("auth_secret_enc"),
  oauthRefreshEnc: text("oauth_refresh_enc"),
  oauthExpiresAt: timestamp("oauth_expires_at", { withTimezone: true }),
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  syncCursor: jsonb("sync_cursor").$type<Record<string, unknown>>().notNull().default({}),
  isShared: boolean("is_shared").notNull().default(false),
  status: text("status").notNull().default("active"),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mail_accounts_user_idx").on(t.userId),
  index("mail_accounts_email_idx").on(t.email),
]);

export const mailMessages = pgTable("mail_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => mailAccounts.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  threadId: text("thread_id"),
  folder: text("folder").notNull().default("inbox"),
  direction: text("direction").notNull().default("incoming"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toAddrs: jsonb("to_addrs").$type<{ email: string; name?: string | null }[]>().notNull().default([]),
  ccAddrs: jsonb("cc_addrs").$type<{ email: string; name?: string | null }[]>().notNull().default([]),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  attachmentMeta: jsonb("attachment_meta").$type<unknown[]>().notNull().default([]),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
  edoDocumentId: uuid("edo_document_id").references(() => edoDocuments.id, { onDelete: "set null" }),
  managerUserId: uuid("manager_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mail_messages_account_folder_idx").on(t.accountId, t.folder),
  index("mail_messages_lead_idx").on(t.leadId),
  index("mail_messages_received_idx").on(t.receivedAt),
]);

export type MailAccountRow = typeof mailAccounts.$inferSelect;
export type MailMessageRow = typeof mailMessages.$inferSelect;

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

export const reactorProducts = pgTable("reactor_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("Box"),
  kind: text("kind").notNull().default("custom"),
  version: integer("version").notNull().default(1),
  published: boolean("published").notNull().default(false),
  navLabel: text("nav_label"),
  navRoute: text("nav_route"),
  navOrder: integer("nav_order").notNull().default(0),
  navPermissions: jsonb("nav_permissions").$type<string[]>().notNull().default([]),
  navPinned: boolean("nav_pinned").notNull().default(false),
  forkedFrom: uuid("forked_from"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reactor_products_published_idx").on(t.published),
  index("reactor_products_pinned_idx").on(t.navPinned),
]);

export const reactorGraphs = pgTable("reactor_graphs", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => reactorProducts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  graph: jsonb("graph").$type<ReactorGraph>().notNull().default({ nodes: [], edges: [] }),
  compiled: jsonb("compiled"),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reactor_graphs_product_idx").on(t.productId),
]);

export const reactorSandboxSessions = pgTable("reactor_sandbox_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  baseProductId: uuid("base_product_id").references(() => reactorProducts.id, { onDelete: "set null" }),
  draftGraphs: jsonb("draft_graphs").$type<Record<string, ReactorGraph>>().notNull().default({}),
  chatHistory: jsonb("chat_history").$type<{ role: string; text: string }[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReactorProductRow = typeof reactorProducts.$inferSelect;
export type ReactorGraphRow = typeof reactorGraphs.$inferSelect;

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
