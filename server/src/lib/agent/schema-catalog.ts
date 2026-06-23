import { DEFS, LEAD_SYSTEM_FIELDS, TASK_SYSTEM_FIELDS } from "@sdr-crm/blueprint-core";
import { db } from "../../db/index.js";
import { fields, pipelines, stages } from "../../db/schema.js";
import { BUILTIN_CARD_KEYS } from "../crm-setup/types.js";
import { loadCardLayout, loadHiddenCardFields, loadCrmCardFieldsForAi } from "../crm-setup/service.js";
import type { AgentSchemaEntity } from "./types.js";

const LEAD_FIELD_LABELS: Record<string, string> = {
  name: "Имя",
  phone: "Телефон",
  email: "Email",
  region: "Регион",
  comment: "Комментарий",
  preferredTime: "Удобное время",
  statusId: "Этап",
  pipelineId: "Воронка",
  assignedUserId: "Ответственный (user)",
  assignedDealManagerId: "Менеджер по сделкам",
  source: "Источник",
  channelId: "Канал",
};

const TASK_FIELD_LABELS: Record<string, string> = {
  text: "Текст",
  description: "Описание",
  status: "Статус",
  priority: "Приоритет",
  assignee: "Исполнитель",
  assigneeUserId: "Исполнитель (user)",
  leadId: "Лид",
  tags: "Теги",
  dueAt: "Срок",
};

const CONTACT_FIELDS = [
  { key: "name", label: "ФИО", type: "text" },
  { key: "phone", label: "Телефон", type: "phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "position", label: "Должность", type: "text" },
  { key: "comment", label: "Комментарий", type: "text" },
  { key: "legalEntityId", label: "Юр. лицо", type: "uuid" },
];

const LEGAL_ENTITY_FIELDS = [
  { key: "inn", label: "ИНН", type: "text" },
  { key: "fullName", label: "Полное наименование", type: "text" },
  { key: "shortName", label: "Краткое наименование", type: "text" },
  { key: "legalAddress", label: "Юр. адрес", type: "text" },
  { key: "directorName", label: "Директор", type: "text" },
];

export async function loadAgentSchema(opts?: { includeCard?: boolean }) {
  const [fieldRows, pipeRows, stageRows, cardFields, hidden] = await Promise.all([
    db.select().from(fields).orderBy(fields.sortOrder),
    db.select().from(pipelines).orderBy(pipelines.sortOrder),
    db.select().from(stages).orderBy(stages.sortOrder),
    opts?.includeCard !== false ? loadCrmCardFieldsForAi() : Promise.resolve([]),
    loadHiddenCardFields(),
  ]);

  const entities: AgentSchemaEntity[] = [
    {
      type: "lead",
      label: "Лид / Сделка",
      valuePath: "custom[fieldId] | systemColumn",
      systemFields: LEAD_SYSTEM_FIELDS.map((k) => ({
        key: k,
        label: LEAD_FIELD_LABELS[k] || k,
        type: k.includes("Id") ? "uuid" : "text",
      })),
    },
    {
      type: "task",
      label: "Задача",
      valuePath: "column",
      systemFields: TASK_SYSTEM_FIELDS.map((k) => ({
        key: k,
        label: TASK_FIELD_LABELS[k] || k,
        type: k === "tags" ? "tags" : "text",
      })),
    },
    {
      type: "contact",
      label: "Контакт CRM",
      valuePath: "column",
      systemFields: CONTACT_FIELDS,
    },
    {
      type: "legal_entity",
      label: "Юр. лицо",
      valuePath: "column",
      systemFields: LEGAL_ENTITY_FIELDS,
    },
  ];

  return {
    paradigm: "Entity -> Field -> Value",
    entities,
    customFields: fieldRows.map((f: typeof fields.$inferSelect) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      entityTypes: ["lead"],
      grid: { col: f.gridCol, row: f.gridRow, span: f.gridSpan },
    })),
    builtinCardKeys: [...BUILTIN_CARD_KEYS],
    pipelines: pipeRows.map((p: typeof pipelines.$inferSelect) => ({
      id: p.id,
      name: p.name,
      pipelineType: p.pipelineType,
      isDefault: p.isDefault,
    })),
    stages: stageRows.map((s: typeof stages.$inferSelect) => ({
      id: s.id,
      pipelineId: s.pipelineId,
      label: s.label,
      color: s.color,
      automationCount: Array.isArray(s.automations) ? s.automations.length : 0,
    })),
    cardFields: cardFields.length ? cardFields : undefined,
    hiddenCardFields: [...hidden],
    cardLayout: opts?.includeCard !== false ? await loadCardLayout() : undefined,
  };
}

export async function loadAgentPrimitives() {
  return Object.entries(DEFS).map(([id, def]) => ({
    id,
    label: def.label,
    group: def.group,
    hint: def.hint,
    cfgKeys: Object.keys(def.cfg),
    ports: {
      in: def.in.map((p) => ({ id: p.id, kind: p.kind })),
      out: def.out.map((p) => ({ id: p.id, kind: p.kind })),
    },
  }));
}

export async function resolveCustomFieldId(key: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(key)) return key;
  const rows: typeof fields.$inferSelect[] = await db.select().from(fields);
  const match = rows.find((f) => f.label.toLowerCase() === key.toLowerCase());
  return match?.id ?? null;
}
