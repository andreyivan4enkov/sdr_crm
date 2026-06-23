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

export type PipelineType = "sales" | "process" | "subprocess";

export type Pipeline = {
  id: string;
  name: string;
  sortOrder?: number;
  isDefault?: boolean;
  pipelineType?: PipelineType;
  parentPipelineId?: string | null;
  parentStageId?: string | null;
  description?: string | null;
};

export type BlueprintNodeBinding = {
  entity?: string;
  pipelineId?: string | null;
  stageId?: string | null;
  taskStatus?: string | null;
  tags?: string[];
  fieldId?: string | null;
  fieldKey?: string | null;
};

export type BlueprintNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  cfg: Record<string, string>;
  bindings?: BlueprintNodeBinding;
  ports?: { in: unknown[]; out: unknown[] };
};

export type BlueprintEdge = {
  id: string;
  from: { node: string; port: string };
  to: { node: string; port: string };
  kind: "exec" | "data";
  status?: string;
};

export type BlueprintGraph = { nodes: BlueprintNode[]; edges: BlueprintEdge[] };

export type BlueprintPlanStep = {
  id: string;
  title: string;
  goal: string;
  detail: string;
  primitives?: string[];
  status?: "pending" | "running" | "done" | "skipped" | "error";
  summary?: string;
  nodeIds?: string[];
};

export type PipelinePlanStep = {
  title: string;
  detail?: string;
  action: "create_pipeline" | "add_stage" | "rename_pipeline" | "rename_stage" | "set_type" | "link_subprocess";
  pipelineId?: string;
  stageId?: string;
  parentPipelineId?: string;
  parentStageId?: string;
  label?: string;
  pipelineType?: PipelineType;
};

export type PipelineBuildPlan = {
  goal: string;
  reply: string;
  reasoning: string;
  originalMessage: string;
  steps: PipelinePlanStep[];
};

export type PipelineAiResponse = {
  mode: "plan";
  reply: string;
  reasoning: string;
  plan: PipelineBuildPlan;
  source: "ai" | "planner";
  aiError?: string;
};

export type BlueprintBuildPlan = {
  goal: string;
  reply: string;
  reasoning?: string;
  steps: BlueprintPlanStep[];
  aggregatedContext: string;
  originalMessage: string;
};

export type BlueprintAiMode = "direct" | "plan" | "execute";

export type BlueprintAiResponse = {
  mode: BlueprintAiMode;
  reply: string;
  reasoning?: string;
  graph: BlueprintGraph;
  plan?: BlueprintBuildPlan;
  stepIndex?: number;
  stepDone?: boolean;
  allDone?: boolean;
  applied?: boolean;
  source?: string;
  aiError?: string;
  nodeCount?: number;
  edgeCount?: number;
  bindingCount?: number;
  dataEdgeCount?: number;
  aggregatedContext?: string;
  action?: string;
};

export type BlueprintTestRunResponse = {
  instanceId: string;
  outcome: {
    state: string;
    log: { msg: string; at: string; nodeId?: string }[];
    currentNodeId?: string | null;
    awaiting?: boolean;
  };
  testLead: { id: string; name: string; pipelineId: string; stageId: string | null };
  testMode: true;
};

export type ReactionBindingTarget =
  | "pipeline" | "stage" | "task_status" | "edo_status" | "mail" | "team" | "resource_group" | "resource" | "site";

export type ReactionBindingMode = "parallel" | "chain";

export type ReactionBindingLink = {
  target: ReactionBindingTarget;
  id: string;
  label?: string;
  order?: number;
};

export type ReactorOpenerContext = {
  module: "pipeline" | "blueprint" | "site" | "bi" | "dashboard" | "kanban" | "map";
  pipelineId?: string;
  stageId?: string;
  siteId?: string;
  reactionId?: string;
  label?: string;
};

export type ReactionBindingsConfig = {
  mode: ReactionBindingMode;
  links: ReactionBindingLink[];
  originContext?: ReactorOpenerContext | null;
};

export type BlueprintSpace = {
  id: string;
  name: string;
  description?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  graph: BlueprintGraph;
  bindings?: ReactionBindingLink[];
  bindingsConfig?: ReactionBindingsConfig;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ReactionSpace = BlueprintSpace;

export type ReactorProductNav = {
  label: string;
  route: string;
  order: number;
  permissions: string[];
  pinned?: boolean;
  icon?: string;
};

export type ReactorGraphPreview = {
  nodes: { id: string; type: string; x?: number; y?: number; cfg?: Record<string, string> }[];
  edges: { id: string; from: { node: string; port?: string }; to: { node: string; port?: string }; kind?: string }[];
};

export type ExpandedGraphMeta = {
  nodeCount: number;
  edgeCount: number;
  layers: Record<string, number>;
  containers: { id: string; layer: string; label: string; childCount: number }[];
  expanded: true;
  sourceNodeCount: number;
  sourceEdgeCount: number;
};

export type ReactorProductSummary = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  kind: "preset" | "custom";
  published: boolean;
  updatedAt?: string;
  nav?: ReactorProductNav;
  hasFlow: boolean;
  hasView: boolean;
  hasData: boolean;
  graphs?: Partial<Record<"flow" | "view" | "data", ReactorGraphPreview>>;
};

export type ReactorComposePlan = {
  intent: string;
  reply: string;
  steps: { id: string; title: string; action: string; payload?: Record<string, unknown> }[];
  graphs?: Partial<Record<"flow" | "view" | "data", ReactorGraphPreview>>;
};

export type ReactionCatalog = {
  targets: Record<ReactionBindingTarget, string>;
  bindingModes?: Record<ReactionBindingMode, string>;
  pipelines: { id: string; name: string }[];
  stages: { id: string; label: string; pipelineId: string }[];
  sites?: { id: string; name: string }[];
  taskStatuses: { id: string; label: string }[];
  edoStatuses: { id: string; label: string }[];
  mail: { id: string; label: string }[];
  team: { id: string; label: string }[];
  resourceGroups: { id: string; name: string }[];
  resources: { id: string; label: string }[];
};

export type UnifiedNodeCatalogEntry = {
  id: string;
  label: string;
  hint: string;
  group: string;
  primitive: string;
  covers: string[];
  actions?: string[];
  presetCfg?: Record<string, string>;
};

export type SiteBlockType =
  | "hero" | "section" | "text" | "cta" | "gallery" | "form" | "entity" | "blueprint" | "div";

export type SiteEntityBinding = {
  kind: "lead" | "pipeline" | "stage" | "field" | "form" | "blueprint";
  ref?: string;
  field?: string;
  filter?: string;
};

export type SiteBlock = {
  id: string;
  type: SiteBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: string;
  label?: string;
  html?: string;
  text?: string;
  css?: Record<string, string>;
  entity?: SiteEntityBinding;
};

export type SiteLink = {
  id: string;
  from: string;
  to: string;
  kind: "data" | "nav" | "entity" | "flow";
  label?: string;
  blueprintNodeId?: string;
};

export type SiteDocument = {
  pages: { id: string; slug: string; title: string }[];
  activePageId: string;
  blocks: SiteBlock[];
  links: SiteLink[];
  theme: Record<string, string>;
  blueprintSpaceId?: string;
  uiManifest?: Record<string, unknown>;
};

export type SitePlanStep = {
  id: string;
  title: string;
  goal: string;
  detail: string;
  blockTypes?: string[];
  status?: "pending" | "running" | "done" | "skipped" | "error";
  summary?: string;
  blockIds?: string[];
};

export type SiteBuildPlan = {
  goal: string;
  reply: string;
  reasoning?: string;
  steps: SitePlanStep[];
  originalMessage: string;
};

export type SiteAiMode = "direct" | "plan" | "execute";

export type SiteAiResponse = {
  mode: SiteAiMode;
  reply: string;
  reasoning?: string;
  document: SiteDocument;
  plan?: SiteBuildPlan;
  stepIndex?: number;
  stepDone?: boolean;
  allDone?: boolean;
  applied?: boolean;
  source?: string;
  aiError?: string;
};

export type SiteSpace = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  document: SiteDocument;
  published: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type BlueprintInstance = {
  id: string;
  spaceId: string;
  state: string;
  currentNodeId?: string | null;
  context?: Record<string, unknown>;
  log?: { msg: string; at: string; nodeId?: string }[];
  leadId?: string | null;
};

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
export type CrmFieldMeta = {
  bindings?: {
    pipelineIds?: string[];
    reactorIds?: string[];
    siteIds?: string[];
    assetGroupIds?: string[];
  };
  required?: {
    always?: boolean;
    stageIds?: string[];
    automationTriggers?: string[];
  };
  multiple?: boolean;
  code?: { html?: string; css?: string; js?: string };
};

export type Field = {
  id: string;
  label: string;
  type: string;
  sortOrder?: number;
  gridCol?: number;
  gridRow?: number;
  gridSpan?: number;
  entityTypes?: ("lead" | "asset" | "resource")[];
  meta?: CrmFieldMeta;
};

export type LeadCardBuiltinKey = "region" | "preferredTime" | "channel" | "email";
export type GridLayoutCell = { gridCol: number; gridRow: number; gridSpan: number };
export type LeadCardLayout = Partial<Record<LeadCardBuiltinKey, GridLayoutCell>>;

export type LeadCardBlockType =
  | "tasks" | "edo" | "legal" | "deal" | "calls" | "mail" | "notes" | "custom";

export type LeadCardBlock = {
  id: string;
  type: LeadCardBlockType;
  column: "main" | "sidebar";
  title?: string;
  moduleLink?: string;
  code?: string;
};
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

export type TaskFile = {
  id: string;
  name: string;
  mimeType?: string;
  dataUrl?: string;
  storagePath?: string;
  downloadUrl?: string;
  createdAt: string;
};

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
  locale?: "ru" | "en" | "zh" | "fr" | "de";
};

export type UniversalConnector = {
  id: string;
  name: string;
  slug: string;
  template: string;
  enabled: boolean;
  webhookUrl?: string;
  fieldMapping?: { source: string; target: string }[];
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

export type EdoDocumentStatus = "draft" | "signed" | "sent" | "delivered" | "rejected";
export type EdoDocumentType = "contract" | "act" | "invoice" | "other";

export type EdoSignature = {
  id: string;
  documentId: string;
  certThumbprint: string;
  certSubject: string;
  signedAt: string;
  isValid?: boolean;
};

export type EdoDocument = {
  id: string;
  title: string;
  type: string;
  mimeType: string;
  fileName: string;
  status: EdoDocumentStatus;
  direction: "outgoing" | "incoming";
  leadId?: string | null;
  taskId?: string | null;
  counterpartyInn?: string | null;
  counterpartyName?: string | null;
  legalEntityId?: string | null;
  provider: string;
  externalId?: string | null;
  meta?: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  signatures?: EdoSignature[];
};

export type EdoConfig = {
  provider: string;
  apiBaseUrl?: string;
  orgInn?: string;
  clientId?: string;
  clientSecret?: string;
  mode?: "mock" | "live";
  portalUrl?: string;
};

export type MailProviderId = "gmail" | "microsoft" | "yandex" | "mailru" | "local" | "custom";
export type MailFolder = "inbox" | "sent" | "drafts" | "trash" | "archive" | "spam";

export type MailAccount = {
  id: string;
  email: string;
  displayName?: string | null;
  provider: MailProviderId;
  authType: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  userId?: string | null;
  isShared?: boolean;
  status: string;
  syncEnabled?: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
  hasCredentials?: boolean;
};

export type MailAddress = { email: string; name?: string | null };

export type MailMessage = {
  id: string;
  accountId: string;
  threadId?: string | null;
  folder: MailFolder | string;
  direction: "incoming" | "outgoing";
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  hasAttachments?: boolean;
  sentAt?: string | null;
  receivedAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  leadId?: string | null;
  legalEntityId?: string | null;
  edoDocumentId?: string | null;
  managerUserId?: string | null;
};

export type MailProviderPreset = {
  id: MailProviderId;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  authTypes: string[];
  oauth?: boolean;
};

export type LegalEntity = {
  id: string;
  inn: string;
  kpp?: string | null;
  ogrn?: string | null;
  entityType: "ul" | "ip";
  fullName: string;
  shortName?: string | null;
  legalAddress?: string | null;
  directorName?: string | null;
  status: "active" | "liquidated" | "unknown";
  registrationDate?: string | null;
  okved?: string | null;
  fnsFetchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FnsLookup = {
  inn: string;
  kpp?: string;
  ogrn?: string;
  entityType: "ul" | "ip";
  fullName: string;
  shortName?: string;
  legalAddress?: string;
  directorName?: string;
  status: "active" | "liquidated" | "unknown";
  registrationDate?: string;
  okved?: string;
};

export type CrmContact = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  comment?: string | null;
  legalEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceGroupRoleAccess = { roleId: string; canView: boolean; canManage: boolean };

export type ResourceGroup = {
  id: string;
  name: string;
  parentId?: string | null;
  description?: string | null;
  sortOrder: number;
  pipelineIds: string[];
  roleAccess: ResourceGroupRoleAccess[];
  createdAt: string;
  updatedAt: string;
};

export type ResourceItem = {
  id: string;
  groupId?: string | null;
  sku?: string | null;
  name: string;
  resourceType: "product" | "service" | "bundle";
  unit: string;
  price: number;
  currency: string;
  vatRate: number;
  costPrice: number;
  trackInventory: boolean;
  stockQty: number;
  status: "active" | "archived";
  description?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LeadResourceLine = {
  id: string;
  leadId: string;
  resourceId?: string | null;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  amount: number;
  sortOrder: number;
  createdAt: string;
};

export type EdoDocumentLine = {
  id: string;
  documentId: string;
  resourceId?: string | null;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  amount: number;
  sortOrder: number;
};

export type AssetGroup = {
  id: string;
  name: string;
  parentId?: string | null;
  kind: "tangible" | "intangible" | "mixed";
  description?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CompanyAsset = {
  id: string;
  groupId?: string | null;
  inventoryNumber?: string | null;
  name: string;
  assetClass: string;
  assetKind: "tangible" | "intangible";
  status: string;
  serialNumber?: string | null;
  location?: string | null;
  responsibleUserId?: string | null;
  purchaseDate?: string | null;
  purchaseCost: number;
  currentValue: number;
  salvageValue: number;
  usefulLifeMonths?: number | null;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  currency: string;
  warrantyUntil?: string | null;
  licenseKey?: string | null;
  expiryDate?: string | null;
  intangibleType?: string | null;
  description?: string | null;
  meta?: Record<string, unknown>;
  bookValue: number;
  createdAt: string;
  updatedAt: string;
};

export type AssetMovement = {
  id: string;
  assetId: string;
  movementType: string;
  amount?: number | null;
  notes?: string | null;
  at: string;
  createdBy?: string | null;
};

export type AssetsSummary = {
  totalCount: number;
  activeCount: number;
  tangibleCount: number;
  intangibleCount: number;
  tangibleBookValue: number;
  intangibleBookValue: number;
  totalBookValue: number;
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
