import {
  REACTOR_COMPOSE_SYSTEM,
  REACTOR_MASK_COMPOSE_APPEND,
  buildComposeUserPrompt,
  autoLayoutV3,
  snapGraphToGrid,
  validateReactorGraph,
  preserveMaskStylesNode,
  mergeMaskStylesNode,
  applyGraphPatch,
  summarizeGraphForAi,
  diffGraphs,
  type ComposePlan,
  type ReactorGraph,
  type ReactorGraphKind,
  type GraphPatchInput,
} from "@sdr-crm/reactor-core";
import type { ComposeRequest } from "./compose-agent.js";
import { getProductBySlug } from "./product-service.js";
import { REACTOR_PRESETS } from "./presets.js";
import { getModuleProfile } from "@sdr-crm/reactor-core";
import { chatBlueprintPlain } from "../blueprint/ai-chat.js";
import { formatCrmContextForAi } from "@sdr-crm/blueprint-core";
import { db } from "../../db/index.js";
import { fields, pipelines, stages } from "../../db/schema.js";
import { loadCrmCardFieldsForAi } from "../crm-setup/service.js";

const INTENT_SLUGS: { pattern: RegExp; slug: string; title: string; component: string }[] = [
  { pattern: /задач|task/i, slug: "tasks", title: "Задачи", component: "list.entity" },
  { pattern: /агрегац|сведени|каноническ|источник.*данн|bi.?агрегац/i, slug: "aggregation", title: "BI-агрегация", component: "aggregation.canvas" },
  { pattern: /аналит|dashboard|отчёт|kpi|bi/i, slug: "analytics", title: "Аналитика", component: "kpi.metric" },
  { pattern: /сайт|лендинг|landing/i, slug: "site", title: "Сайт", component: "workspace.module" },
  { pattern: /документ|эдо|edo|подпис/i, slug: "edo", title: "Документы", component: "workspace.module" },
  { pattern: /почт|mail|письм/i, slug: "mail", title: "Почта", component: "workspace.module" },
  { pattern: /звонк|телефон|call/i, slug: "calls", title: "Звонки", component: "list.entity" },
  { pattern: /команд|сотрудник|team/i, slug: "team", title: "Команда", component: "list.entity" },
  { pattern: /юр|контрагент|entities/i, slug: "entities", title: "Юр. лица", component: "list.entity" },
  { pattern: /ресурс|актив/i, slug: "resources", title: "Ресурсы", component: "workspace.module" },
  { pattern: /crm|канбан|воронк|лид|сделк|ипотек/i, slug: "crm", title: "CRM", component: "workspace.module" },
];

function detectSlug(message: string, hint?: string) {
  if (hint) return { slug: hint, title: getModuleProfile(hint).label, component: "workspace.module" };
  for (const row of INTENT_SLUGS) {
    if (row.pattern.test(message)) return row;
  }
  return INTENT_SLUGS[INTENT_SLUGS.length - 1]!;
}

function mkId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

function normalizeGraph(g: ReactorGraph | undefined, kind: ReactorGraphKind): ReactorGraph | undefined {
  if (!g?.nodes?.length) return undefined;
  const laid = snapGraphToGrid(autoLayoutV3(g));
  const v = validateReactorGraph(laid, kind);
  return v.ok ? laid : undefined;
}

function emptyGraph(): ReactorGraph {
  return { nodes: [], edges: [] };
}

function asPatchInput(g: ReactorGraph & { remove?: string[] }): GraphPatchInput {
  const { nodes, edges, remove } = g;
  return { nodes, edges, remove };
}

function mergeAiGraph(
  kind: ReactorGraphKind,
  existing: ReactorGraph | undefined,
  incoming: (ReactorGraph & { remove?: string[] }) | undefined,
  action: "build" | "patch",
): ReactorGraph | undefined {
  if (!incoming?.nodes?.length && !incoming?.remove?.length) return undefined;
  const base = existing ?? emptyGraph();
  const merged = applyGraphPatch(base, asPatchInput(incoming), action);
  const normalized = normalizeGraph(merged, kind);
  if (!normalized) return undefined;
  if (kind !== "view") return normalized;
  return action === "build" ? preserveMaskStylesNode(existing, normalized) : mergeMaskStylesNode(existing, normalized);
}

function buildRuleBasedGraphs(message: string, slug: string, title: string, component: string) {
  const preset = REACTOR_PRESETS.find((p) => p.slug === slug);
  const notifyText = message.length > 100 ? message.slice(0, 97) + "…" : message;

  const flow: ReactorGraph = preset?.graphs.flow ? { ...preset.graphs.flow } : {
    nodes: [
      { id: "p1", type: "pulse", x: 40, y: 40, cfg: { mode: "event", event: "stage_changed", label: "Триггер" } },
      { id: "pr1", type: "probe", x: 240, y: 40, cfg: { op: "entity", entity: "lead", label: "Сделка" } },
      { id: "t1", type: "touch", x: 440, y: 40, cfg: { op: "notify", channel: "push", to: "ответственный", text: notifyText } },
    ],
    edges: [
      { id: "e1", from: { node: "p1", port: "then" }, to: { node: "pr1", port: "in" }, kind: "exec" },
      { id: "e2", from: { node: "pr1", port: "then" }, to: { node: "t1", port: "in" }, kind: "exec" },
      { id: "e3", from: { node: "pr1", port: "out" }, to: { node: "t1", port: "ctx" }, kind: "data" },
    ],
  };

  if (/согласован|approve|руководител/i.test(message)) {
    flow.nodes.push(
      { id: "g1", type: "gate", x: 240, y: 140, cfg: { op: "human", assignee: "Руководитель", sla: "2 дня", label: "Согласование" } },
    );
    flow.edges.push({ id: "e3a", from: { node: "pr1", port: "then" }, to: { node: "g1", port: "in" }, kind: "exec" });
    flow.edges.push({ id: "e3b", from: { node: "pr1", port: "out" }, to: { node: "g1", port: "cond" }, kind: "data" });
    flow.edges.push({ id: "e4", from: { node: "g1", port: "approved" }, to: { node: "t1", port: "in" }, kind: "exec" });
  }

  if (/sms/i.test(message)) {
    flow.nodes.push(
      { id: "t2", type: "touch", x: 440, y: 140, cfg: { op: "notify", channel: "sms", to: "ответственный", text: notifyText, label: "SMS" } },
    );
    const last = flow.nodes.find((n) => n.id === "g1") ?? flow.nodes.find((n) => n.id === "pr1");
    if (last) {
      flow.edges.push({
        id: "e-sms",
        from: { node: last.id, port: "then" },
        to: { node: "t2", port: "in" },
        kind: "exec",
      });
    }
  }

  if (/поля|field|обнов/i.test(message)) {
    flow.nodes.push(
      { id: "f1", type: "fold", x: 240, y: 240, cfg: { op: "map", label: "Маппинг полей" } },
      { id: "t3", type: "touch", x: 440, y: 240, cfg: { op: "patch", entity: "lead", label: "Обновить поля" } },
    );
    flow.edges.push(
      { id: "e-f1", from: { node: "pr1", port: "then" }, to: { node: "f1", port: "in" }, kind: "exec" },
      { id: "e-f1-data", from: { node: "pr1", port: "out" }, to: { node: "f1", port: "src" }, kind: "data" },
      { id: "e-f2", from: { node: "f1", port: "then" }, to: { node: "t3", port: "in" }, kind: "exec" },
      { id: "e-f2-data", from: { node: "f1", port: "out" }, to: { node: "t3", port: "ctx" }, kind: "data" },
    );
  }

  const view: ReactorGraph = preset?.graphs.view ?? {
    nodes: [
      {
        id: "v-wire",
        type: "wire",
        x: 40,
        y: 120,
        cfg: { op: "bind", target: "pipeline", label: "Воронка" },
      },
      {
        id: "v1",
        type: "face",
        x: 40,
        y: 40,
        cfg: {
          op: "component",
          component,
          label: title,
          props: JSON.stringify({ module: slug }),
        },
      },
    ],
    edges: [
      { id: "ev1", from: { node: "v-wire", port: "out" }, to: { node: "v1", port: "data" }, kind: "data" },
    ],
  };

  const data: ReactorGraph = preset?.graphs.data ?? {
    nodes: [
      { id: "d1", type: "probe", x: 40, y: 40, cfg: { op: "entity", entity: slug === "tasks" ? "task" : "lead", label: title } },
      { id: "d2", type: "fold", x: 240, y: 40, cfg: { op: "reduce", expression: "stage", label: "По этапам" } },
    ],
    edges: [
      { id: "ed1", from: { node: "d1", port: "out" }, to: { node: "d2", port: "src" }, kind: "data" },
    ],
  };

  return {
    flow: normalizeGraph(flow, "flow")!,
    view: normalizeGraph(view, "view")!,
    data: normalizeGraph(data, "data")!,
  };
}

/** Rule-based patch для существующего flow (SMS, согласование). */
function buildRuleBasedFlowPatch(message: string, existing: ReactorGraph | undefined): ReactorGraph | undefined {
  if (!existing?.nodes?.length) return undefined;
  const patch: GraphPatchInput = { nodes: [], edges: [] };
  const notifyText = message.length > 100 ? message.slice(0, 97) + "…" : message;
  const pr1 = existing.nodes.find((n) => n.type === "probe") ?? existing.nodes[0];

  if (/sms/i.test(message)) {
    const id = mkId("t-sms");
    patch.nodes!.push({
      id,
      type: "touch",
      x: 440,
      y: 140,
      cfg: { op: "notify", channel: "sms", to: "ответственный", text: notifyText, label: "SMS" },
    });
    if (pr1) {
      patch.edges!.push({
        id: mkId("e"),
        from: { node: pr1.id, port: "then" },
        to: { node: id, port: "in" },
        kind: "exec",
      });
    }
  }

  if (!patch.nodes?.length) return undefined;
  return mergeAiGraph("flow", existing, patch as ReactorGraph & { remove?: string[] }, "patch");
}

type AiComposePayload = {
  action?: "build" | "patch" | "clarify";
  reply?: string;
  reasoning?: string;
  productSlug?: string;
  productName?: string;
  productIcon?: string;
  graphs?: Partial<Record<ReactorGraphKind, ReactorGraph & { remove?: string[] }>>;
  steps?: ComposePlan["steps"];
};

function parseAiJson(text: string): AiComposePayload | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as AiComposePayload;
  } catch {
    return null;
  }
}

function buildExistingGraphContext(
  product: Awaited<ReturnType<typeof getProductBySlug>>,
  graphKind?: ReactorGraphKind,
): Partial<Record<ReactorGraphKind, string>> {
  if (!product?.graphs) return {};
  const out: Partial<Record<ReactorGraphKind, string>> = {};
  const kinds: ReactorGraphKind[] = graphKind
    ? [graphKind]
    : ["flow", "view", "data"];
  for (const k of kinds) {
    const g = product.graphs[k];
    if (g?.nodes?.length) out[k] = summarizeGraphForAi(g);
  }
  return out;
}

export async function composeReactorWithAi(req: ComposeRequest, opts?: { userId?: string }): Promise<ComposePlan> {
  const viewOnly = req.graphKind === "view";
  const flowOnly = req.graphKind === "flow";
  const dataOnly = req.graphKind === "data";
  const detected = detectSlug(req.message, req.productSlug);
  const product = req.productSlug ? await getProductBySlug(req.productSlug) : null;
  const existingView = product?.graphs.view;
  const existingGraphCtx = buildExistingGraphContext(product, req.graphKind);
  const hasExisting = Object.keys(existingGraphCtx).length > 0;

  let crmBlock = "";
  try {
    const [pipeRows, stageRows, fieldRows, cardFields] = await Promise.all([
      db.select().from(pipelines),
      db.select().from(stages),
      db.select().from(fields),
      loadCrmCardFieldsForAi(),
    ]);
    crmBlock = formatCrmContextForAi({
      spacePipelineId: null,
      spaceStageId: null,
      pipelines: pipeRows.map((p) => ({ id: p.id, name: p.name, pipelineType: p.pipelineType, isDefault: p.isDefault })),
      stages: stageRows.map((s) => ({ id: s.id, pipelineId: s.pipelineId, label: s.label })),
      fields: fieldRows.map((f) => ({ id: f.id, label: f.label })),
      cardFields,
    });
  } catch { /* CRM context optional */ }

  if (req.mode === "clarify") {
    return {
      intent: `product:${detected.slug}`,
      action: "clarify",
      reply: "Уточните: какой продукт, какой граф (flow/view/data) и что именно изменить?",
      steps: [],
    };
  }

  let aiPayload: AiComposePayload | null = null;
  let noModel = false;
  let aiError: string | undefined;

  const systemPrompt = viewOnly
    ? `${REACTOR_COMPOSE_SYSTEM}\n${REACTOR_MASK_COMPOSE_APPEND}`
    : REACTOR_COMPOSE_SYSTEM;

  let aiRawText: string | null = null;
  try {
    aiRawText = await chatBlueprintPlain([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: buildComposeUserPrompt(
          req.message,
          detected.slug,
          crmBlock,
          req.graphKind,
          hasExisting ? existingGraphCtx : undefined,
        ),
      },
    ], { userId: opts?.userId, skipGuards: false });
    aiPayload = parseAiJson(aiRawText);
    if (!aiPayload && aiRawText) {
      // Retry с уточняющим промптом
      const retryText = await chatBlueprintPlain([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildComposeUserPrompt(
            req.message,
            detected.slug,
            crmBlock,
            req.graphKind,
            hasExisting ? existingGraphCtx : undefined,
          ),
        },
        { role: "assistant", content: aiRawText },
        { role: "user", content: "Предыдущий ответ не является валидным JSON. Верни ТОЛЬКО JSON объект без markdown, без пояснений, без ```json блоков." },
      ], { userId: opts?.userId, skipGuards: false });
      aiPayload = parseAiJson(retryText);
      if (!aiPayload) {
        aiError = "AI вернул невалидный ответ дважды. Применён локальный сборщик.";
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/не настроен|не сконфигурир|no.*model|chain.*empty/i.test(msg) || msg.includes("AI не настроен")) {
      noModel = true;
      aiError = "AI-провайдер не настроен. Настройки → AI → добавьте модель (Ollama бесплатно).";
    } else {
      aiError = msg;
    }
  }

  if (noModel) {
    return {
      intent: `product:${detected.slug}`,
      reply: aiError!,
      steps: [],
      noModel: true,
    };
  }

  if (aiPayload?.action === "clarify") {
    return {
      intent: `product:${detected.slug}`,
      action: "clarify",
      reply: aiPayload.reply ?? "Уточните детали запроса.",
      steps: [],
    };
  }

  const slug = aiPayload?.productSlug || detected.slug;
  const action: "build" | "patch" = hasExisting
    ? (aiPayload?.action === "build" ? "build" : "patch")
    : "build";

  const graphs: Partial<Record<ReactorGraphKind, ReactorGraph>> = {};
  const kindsToParse: ReactorGraphKind[] = viewOnly
    ? ["view"]
    : flowOnly
      ? ["flow"]
      : dataOnly
        ? ["data"]
        : ["flow", "view", "data"];

  if (aiPayload?.graphs) {
    for (const kind of kindsToParse) {
      const incoming = aiPayload.graphs[kind];
      const existing = product?.graphs[kind];
      const merged = mergeAiGraph(kind, existing, incoming, action);
      if (merged) graphs[kind] = merged;
    }
  }

  if (viewOnly) {
    if (!graphs.view) {
      const rule = buildRuleBasedGraphs(req.message, slug, detected.title, detected.component);
      graphs.view = mergeMaskStylesNode(existingView, rule.view);
    }
  } else if (flowOnly) {
    if (!graphs.flow) {
      const patched = buildRuleBasedFlowPatch(req.message, product?.graphs.flow);
      if (patched) graphs.flow = patched;
    }
  } else if (!graphs.flow && !graphs.view) {
    const rule = buildRuleBasedGraphs(req.message, slug, detected.title, detected.component);
    if (!graphs.flow) {
      graphs.flow = hasExisting && product?.graphs.flow
        ? mergeAiGraph("flow", product.graphs.flow, rule.flow, "patch") ?? rule.flow
        : rule.flow;
    }
    if (!graphs.view) graphs.view = preserveMaskStylesNode(existingView, rule.view);
    if (!graphs.data) graphs.data = rule.data;
  }

  const steps: ComposePlan["steps"] = aiPayload?.steps?.length ? aiPayload.steps : viewOnly
    ? [{ id: mkId("s"), title: "Обновить маску (view)", action: "set_face", payload: { kind: "view", component: detected.component } }]
    : [
      { id: mkId("s"), title: "Экран продукта", action: "set_face", payload: { kind: "view", component: detected.component } },
      { id: mkId("s"), title: "Автоматизация flow", action: "add_node", payload: { kind: "flow", count: graphs.flow?.nodes.length ?? 0 } },
      { id: mkId("s"), title: "Модель данных", action: "add_node", payload: { kind: "data", count: graphs.data?.nodes.length ?? 0 } },
    ];

  const reply = aiPayload?.reply
    ?? (aiError
      ? viewOnly
        ? `Маска «${detected.title}» собрана локально (${aiError}).`
        : `Собрано локальным сборщиком (${aiError}). Продукт «${detected.title}»: ${graphs.flow?.nodes.length ?? 0} нод flow.`
      : viewOnly
        ? `Обновлю маску «${product?.name ?? detected.title}»: ${graphs.view?.nodes.length ?? 0} нод view.`
        : product
          ? `Обновлю «${product.name}» (${action}): ${graphs.flow?.nodes.length ?? 0} нод flow, ${graphs.view?.nodes.length ?? 0} view.`
          : `Создам модуль «${detected.title}»: flow + view + data из ${graphs.flow?.nodes.length ?? 0} нод.`);

  const beforeGraph = req.graphKind && product?.graphs[req.graphKind]
    ? product.graphs[req.graphKind]
    : product?.graphs.flow;
  const afterGraph = req.graphKind ? graphs[req.graphKind] : graphs.flow;
  const preview = (req.mode === "morph-preview" || req.mode === "plan")
    ? diffGraphs(beforeGraph, afterGraph)
    : undefined;

  return {
    intent: `product:${slug}`,
    reply,
    action,
    steps,
    preview,
    productName: aiPayload?.productName,
    productIcon: aiPayload?.productIcon,
    graphs: viewOnly ? { view: graphs.view } : flowOnly ? { flow: graphs.flow } : dataOnly ? { data: graphs.data } : graphs,
  };
}
