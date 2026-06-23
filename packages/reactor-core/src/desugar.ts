import type { BlueprintGraph, BlueprintNode, BlueprintEdge, BlueprintPrimitiveType } from "@sdr-crm/blueprint-core";
import type { ReactorGraph, V3Node, V3Edge } from "./types.js";
import { isV3NodeType } from "./nodes.js";

type DesugarRule = {
  v2Type: BlueprintPrimitiveType;
  cfgMap: (cfg: Record<string, string>) => Record<string, string>;
};

const TOUCH_OPS: Record<string, DesugarRule> = {
  setfield: {
    v2Type: "setfield",
    cfgMap: (c) => ({
      Действие: c.op === "patch" ? (c.action || c.Действие || "поле") : "поле",
      Сущность: c.entity === "lead" ? "Сделка" : c.entity === "task" ? "Задача" : (c.Сущность || "Сделка"),
      Поле: c.field || c.Поле || "",
      Тип: c.fieldType || c.Тип || "системное",
      Значение: c.value || c.Значение || "",
    }),
  },
  persist: {
    v2Type: "persist",
    cfgMap: (c) => ({
      Сущность: c.entity === "task" ? "Задача" : c.entity === "lead" ? "Лид" : (c.Сущность || "Задача"),
      Текст: c.text || c.Текст || "",
      Статус: c.status || c.Статус || "new",
      Приоритет: c.priority || c.Приоритет || "normal",
    }),
  },
  create: {
    v2Type: "persist",
    cfgMap: (c) => ({
      Сущность: c.entity === "task" ? "Задача" : c.entity === "lead" ? "Лид" : (c.Сущность || "Задача"),
      Текст: c.text || c.Текст || "",
    }),
  },
  notify: {
    v2Type: "emit",
    cfgMap: (c) => ({
      Канал: c.channel || c.Канал || "push",
      Кому: c.to || c.Кому || "ответственный",
      Текст: c.text || c.Текст || "",
    }),
  },
  email: { v2Type: "email", cfgMap: (c) => ({ Тема: c.subject || c.Тема || "", Текст: c.text || c.Текст || "" }) },
  document: { v2Type: "document", cfgMap: (c) => ({ Шаблон: c.template || c.Шаблон || "", Формат: c.format || c.Формат || "pdf" }) },
  link: { v2Type: "link", cfgMap: (c) => ({ A: c.a || c.A || "", B: c.b || c.B || "" }) },
  spawn: { v2Type: "subprocess", cfgMap: (c) => ({ Воронка: c.pipelineId || c.Воронка || "", Этап: c.stageId || c.Этап || "" }) },
  patch: { v2Type: "setfield", cfgMap: (c) => TOUCH_OPS.setfield.cfgMap(c) },
};

const GATE_OPS: Record<string, DesugarRule> = {
  if: { v2Type: "branch", cfgMap: (c) => ({ Условие: c.condition || c.Условие || "true" }) },
  for_each: { v2Type: "loop", cfgMap: (c) => ({ По: c.over || c.По || "items" }) },
  merge: { v2Type: "merge", cfgMap: (c) => ({ Стратегия: c.strategy || c.Стратегия || "любая" }) },
  delay: { v2Type: "wait", cfgMap: (c) => ({ Часов: c.hours || c.duration || c.Длительность || "1" }) },
  human: { v2Type: "approve", cfgMap: (c) => ({ Согласующий: c.assignee || c.Согласующий || "Руководитель", SLA: c.sla || c.SLA || "2 дня" }) },
};

const FOLD_OPS: Record<string, DesugarRule> = {
  map: { v2Type: "transform", cfgMap: (c) => ({ Маппинг: c.expression || c.Маппинг || "{}" }) },
  reduce: { v2Type: "aggregate", cfgMap: (c) => ({ Группировка: c.expression || c.Группировка || "id" }) },
  ai: { v2Type: "enrich", cfgMap: (c) => ({ Промпт: c.prompt || c.Промпт || "", Модуль: c.module || c.Модуль || "blueprint" }) },
  script: { v2Type: "code", cfgMap: (c) => ({ script: c.script || c.Скрипт || "return input;", lang: c.lang || "javascript" }) },
  filter: { v2Type: "transform", cfgMap: (c) => ({ Маппинг: c.expression || "{}" }) },
  join: { v2Type: "aggregate", cfgMap: (c) => ({ Группировка: c.leftKey || "id" }) },
};

const PROBE_OPS: Record<string, DesugarRule> = {
  entity: {
    v2Type: "query",
    cfgMap: (c) => ({
      Сущность: entityToV2(c.entity || c.Сущность || "lead"),
      ID: c.id || c.ID || "",
    }),
  },
  list: {
    v2Type: "query",
    cfgMap: (c) => ({
      Сущность: "Список лидов",
      Воронка: c.pipelineId || c.Воронка || "",
      Этап: c.stageId || c.Этап || "",
    }),
  },
  metric: { v2Type: "query", cfgMap: (c) => ({ Сущность: "Метрика", ID: c.metricKey || "" }) },
};

function entityToV2(e: string): string {
  const m: Record<string, string> = {
    lead: "Сделка", task: "Задача", call: "Звонок", document: "Документ",
    contact: "Контакт", legal_entity: "ЮрЛицо", mail: "Почта",
  };
  return m[e] || e;
}

/** v3 pulse event → blueprint trigger «Событие» */
export const V3_PULSE_EVENT_MAP: Record<string, string> = {
  stage_changed: "смена этапа",
  lead_created: "создание",
  lead_updated: "изменение поля",
  task_created: "создание",
  task_updated: "изменение поля",
  mail_received: "получение письма",
  edo_signed: "подписание документа",
  call_completed: "завершение звонка",
  site_form_submitted: "создание",
};

function pulseEntityFromEvent(event: string): string {
  if (event.startsWith("task_")) return "Задача";
  return "Сделка";
}

export function mapV3PulseEvent(event: string): string {
  return V3_PULSE_EVENT_MAP[event] || event;
}

export function desugarV3Node(node: V3Node): BlueprintNode | null {
  const cfg = node.cfg || {};
  switch (node.type) {
    case "pulse": {
      const rawEvent = cfg.event || cfg.Событие || "lead_created";
      return { id: node.id, type: "trigger", x: node.x ?? 0, y: node.y ?? 0, cfg: {
        Запуск: cfg.mode === "schedule" ? "расписание" : cfg.mode === "manual" ? "ручной" : "событие",
        Событие: mapV3PulseEvent(rawEvent),
        Сущность: cfg.entity ? entityToV2(cfg.entity) : pulseEntityFromEvent(rawEvent),
      } };
    }
    case "probe": {
      const rule = PROBE_OPS[cfg.op || "entity"] ?? PROBE_OPS.entity;
      return { id: node.id, type: rule.v2Type, x: node.x ?? 0, y: node.y ?? 0, cfg: rule.cfgMap(cfg) };
    }
    case "fold": {
      const rule = FOLD_OPS[cfg.op || "map"] ?? FOLD_OPS.map;
      return { id: node.id, type: rule.v2Type, x: node.x ?? 0, y: node.y ?? 0, cfg: rule.cfgMap(cfg) };
    }
    case "gate": {
      const rule = GATE_OPS[cfg.op || "if"] ?? GATE_OPS.if;
      return { id: node.id, type: rule.v2Type, x: node.x ?? 0, y: node.y ?? 0, cfg: rule.cfgMap(cfg) };
    }
    case "touch": {
      const rule = TOUCH_OPS[cfg.op || "patch"] ?? TOUCH_OPS.patch;
      return { id: node.id, type: rule.v2Type, x: node.x ?? 0, y: node.y ?? 0, cfg: rule.cfgMap(cfg) };
    }
    case "face":
    case "wire":
      return null;
    default:
      return null;
  }
}

export function desugarV3Graph(graph: ReactorGraph): BlueprintGraph {
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  for (const n of graph.nodes) {
    if (!isV3NodeType(n.type)) continue;
    if (n.type === "face" || n.type === "wire") continue;
    const v2 = desugarV3Node(n);
    if (v2) nodes.push(v2);
  }
  for (const e of graph.edges) {
    const from = graph.nodes.find((n) => n.id === e.from.node);
    const to = graph.nodes.find((n) => n.id === e.to.node);
    if (!from || !to || from.type === "face" || from.type === "wire" || to.type === "face" || to.type === "wire") continue;
    edges.push({
      id: e.id,
      from: { node: e.from.node, port: e.from.port || "then" },
      to: { node: e.to.node, port: e.to.port || "in" },
      kind: e.kind || "exec",
    });
  }
  return { nodes, edges };
}

export function graphHasExecutableNodes(graph: ReactorGraph): boolean {
  return graph.nodes.some((n) => n.type !== "face" && n.type !== "wire");
}