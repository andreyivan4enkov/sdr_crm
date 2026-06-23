import { V3_NODE_DEFS } from "./nodes.js";
import { REACTOR_EVENTS } from "./events.js";

export const REACTOR_MASK_COMPOSE_APPEND = `
Режим МАСКА (graphKind=view): редактируй ТОЛЬКО view-граф.
- НЕ меняй flow и data.
- ОБЯЗАТЕЛЬНО включи ноду mask-styles-root — без неё изменения дизайна не применятся.
- Формат ноды mask-styles-root:
  {"id":"mask-styles-root","type":"face","x":0,"y":0,"cfg":{"op":"mask-styles","role":"design","styles":"{\"component:kanban.card\":{\"backgroundColor\":\"#c0c0c0\",\"borderRadius\":\"0px\"}}"}}
- styles — JSON-строка (JSON внутри JSON), ключи: component:<data-mask-component> или element:<data-mask-id>.
- Повторяющиеся UI (карточки лидов, колонки этапов) — ключи component:<data-mask-component>, напр. component:kanban.card.
- НЕ используй kanban.card.{leadId} или kanban.col.{stageId} в mask-styles — это id экземпляров, не шаблон.
- НЕ подмешивай ФИО лидов, телефоны и другие пользовательские данные в контекст или стили.
- Глобальный редизайн (Win98, Star Trek, тёмная тема): обнови mask-styles сразу для component:kanban.card, component:kanban.column, component:kanban.pipeline, element:crm.shell, element:crm.kanban и др.
- Одиночные элементы (crm.kanban, crm.shell) — ключи element:<data-mask-id>.
- Элементы UI помечены data-mask-id + data-mask-component; face.component — layout/props.
- Для точечных правок UI: face.op=component + props JSON; не используй face.op=host.
- При patch-режиме: сохрани существующие стили из mask-styles-root, добавь/измени только затронутые ключи.`;

// ─── Port reference (compact, hardcoded — ports are stable across versions) ────
const PORT_MATRIX = `ПОРТЫ (from.port и to.port обязательны в каждом edge):
Актор     │ exec-вход      │ data-вход  │ exec-выход                  │ data-выход
──────────┼────────────────┼────────────┼─────────────────────────────┼───────────
pulse     │ —              │ —          │ then                        │ event
probe     │ in             │ —          │ then                        │ out
fold      │ in             │ src        │ then                        │ out
gate(if)  │ in             │ cond       │ then / else                 │ —
gate(human│ in             │ cond       │ approved / rejected         │ —
gate(loop)│ in             │ —          │ each / done                 │ item
touch     │ in             │ ctx        │ then                        │ result
face      │ in             │ data       │ —                           │ out
wire      │ —              │ in         │ then                        │ out
Правило: exec→exec ТОЛЬКО, data→data ТОЛЬКО. dtype "any" совместим с любым data.`;

// ─── Component registry for face.op=component ──────────────────────────────
const COMPONENT_REGISTRY = `КОМПОНЕНТЫ (face.op=component, cfg.component=ключ, cfg.props=JSON):
workspace.module   props: { module: "crm|tasks|mail|edo|calls|team|entities|resources|<custom-slug>" }
kanban.pipeline    props: { pipelineId: "uuid" }   entity=lead, drag/drop → patch statusId
list.entity        props: { limit: N, sort: "field" }  таблица lead/task/contact
kpi.metric         props: { metricKey: "ключ", unit: "%|₽" }  KPI-карточка с трендом
funnel.pipeline    props: { pipelineId: "uuid" }  воронка-диаграмма
aggregation.canvas props: { sources: ["crm","tasks"], layout: "grid|flow" }  BI-канвас
dashboard.shell    props: { columns: N }  контейнер для children KPI/канбан
form.lead          props: { submitLabel: "Отправить" }  публичная форма → create lead
button.action      props: { variant: "primary|soft|danger" }  RISC action
blueprint.trigger  props: { event: "событие" }  запуск реактора из UI
text.block         props: { body: "Markdown" }  заголовок/описание
ЗАПРЕЩЕНО: face.op=host. Только face.op=component + registry key.`;

// ─── Canonical flow patterns ────────────────────────────────────────────────
const FLOW_PATTERNS = `ПАТТЕРНЫ FLOW (стандартные соединения):

УВЕДОМЛЕНИЕ (3 ноды):
pulse.then→probe.in [exec]  probe.then→touch.in [exec]  probe.out→touch.ctx [data]

СОГЛАСОВАНИЕ (4 ноды):
pulse.then→probe.in→gate(human).in [exec]  probe.out→gate.cond [data]
gate.approved→touch(patch).in  gate.rejected→touch(notify).in [exec]

ПО РАСПИСАНИЮ (4 ноды):
pulse(schedule,cron).then→probe(list).in [exec]
probe.then→gate(for_each).in [exec]  gate.each→touch.in [exec]  gate.item→touch.ctx [data]

AI-ОБРАБОТКА (4 ноды):
pulse.then→probe.in [exec]  probe.then→fold(ai).in [exec]  probe.out→fold.src [data]
fold.then→touch.in [exec]  fold.out→touch.ctx [data]`;

// ─── Working example (canonical 3-node notification flow) ───────────────────
const EXAMPLE_GRAPH = `ВАЛИДНЫЙ ПРИМЕР ГРАФА (скопируй структуру, измени cfg):
flow: {
  "nodes": [
    {"id":"p1","type":"pulse","x":40,"y":40,"cfg":{"mode":"event","event":"lead_created","label":"Создан лид"}},
    {"id":"pr1","type":"probe","x":340,"y":40,"cfg":{"op":"entity","entity":"lead","label":"Читать лид"}},
    {"id":"t1","type":"touch","x":640,"y":40,"cfg":{"op":"notify","channel":"push","to":"ответственный","text":"Новый лид поступил","label":"Push"}}
  ],
  "edges": [
    {"id":"e1","from":{"node":"p1","port":"then"},"to":{"node":"pr1","port":"in"},"kind":"exec"},
    {"id":"e2","from":{"node":"pr1","port":"then"},"to":{"node":"t1","port":"in"},"kind":"exec"},
    {"id":"e3","from":{"node":"pr1","port":"out"},"to":{"node":"t1","port":"ctx"},"kind":"data"}
  ]
}
view: {
  "nodes": [
    {"id":"w1","type":"wire","x":40,"y":160,"cfg":{"op":"bind","target":"pipeline","label":"Воронка"}},
    {"id":"v1","type":"face","x":40,"y":40,"cfg":{"op":"component","component":"workspace.module","props":"{\"module\":\"crm\"}","label":"CRM UI"}},
    {"id":"mask-styles-root","type":"face","x":0,"y":0,"cfg":{"op":"mask-styles","role":"design","styles":"{\"component:kanban.card\":{\"backgroundColor\":\"#ffffff\",\"borderRadius\":\"8px\",\"borderColor\":\"#e2e8f0\"},\"component:kanban.column\":{\"backgroundColor\":\"#f8fafc\"}}"}}
  ],
  "edges": [{"id":"ev1","from":{"node":"w1","port":"out"},"to":{"node":"v1","port":"data"},"kind":"data"}]
}
data: {
  "nodes": [
    {"id":"d1","type":"probe","x":40,"y":40,"cfg":{"op":"entity","entity":"lead","label":"Лиды"}},
    {"id":"d2","type":"fold","x":340,"y":40,"cfg":{"op":"reduce","expression":"stage","label":"По этапам"}}
  ],
  "edges": [{"id":"ed1","from":{"node":"d1","port":"out"},"to":{"node":"d2","port":"src"},"kind":"data"}]
}`;

// ─── Pulse modes for custom (non-CRM) products ─────────────────────────────
const PULSE_MODES_GUIDE = `СОБЫТИЯ pulse для КАСТОМНЫХ продуктов:
- mode=event + event=entity_created   → при создании любой записи
- mode=event + event=entity_updated   → при изменении любой записи
- mode=event + event=entity_stage_changed → при смене этапа любой воронки
- mode=event + event=webhook_received → входящий внешний вебхук
- mode=schedule + schedule="0 9 * * 1-5" → по расписанию (cron)
- mode=webhook + webhookPath="/hooks/<slug>" → кастомный вебхук-эндпоинт
- mode=manual → ручной запуск из UI`;

export const REACTOR_COMPOSE_SYSTEM = `Ты — инженер Реактора v3.2. Ты создаёшь ЛЮБЫЕ бизнес-инструменты из 7 нод.

ВОЗМОЖНОСТИ:
- Создавать совершенно новые продукты с любым slug (не только crm/tasks — любой бизнес-инструмент!)
- Настраивать существующие модули (crm, tasks, mail, analytics, site, edo, calls, team, entities, resources)
- Строить автоматизации (flow), интерфейсы (view), модели данных (data)

ПРИМЕРЫ НОВЫХ ПРОДУКТОВ (productSlug — ЛЮБОЕ латинское слово):
"управление складом"        → warehouse  📦
"тикет-система"             → tickets    🎫
"согласование договоров"    → contracts  📝
"воронка рекрутинга"        → hr-funnel  👥
"управление проектами"      → projects   🗂️
"аренда оборудования"       → equipment  🔧
"заявки на ТО/ремонт"       → maintenance 🛠️
"учёт рабочего времени"     → timesheets  ⏱️
"база знаний"               → knowledge   📚
"управление поставщиками"   → suppliers   🏭
"обработка претензий"       → complaints  ⚠️
"планирование смен"         → shifts      📅
"управление активами"       → assets      🏗️
"лояльность клиентов"       → loyalty     🎁
"объекты недвижимости"      → realty      🏠

ПРАВИЛА ПОРТОВ (exec→exec ТОЛЬКО, data→data ТОЛЬКО):
pulse.out=[then,event] | probe.in=[in] probe.out=[then,out]
fold.in=[in,src] fold.out=[then,out]
gate(if).out=[then,else] gate(human).out=[approved,rejected] gate(for_each).out=[each,done,item]
touch.in=[in,ctx] touch.out=[then,result] | face.in=[in,data] face.out=[out] | wire.in=[in] wire.out=[out,then]
from.port и to.port ОБЯЗАТЕЛЬНЫ в каждом edge.

4 СТАНДАРТНЫХ ПАТТЕРНА:
1. УВЕДОМЛЕНИЕ: pulse→probe→touch(notify) — pulse.then→probe.in, probe.then→touch.in, probe.out→touch.ctx
2. СОГЛАСОВАНИЕ: probe→gate(human); gate.approved→touch(patch); gate.rejected→touch(notify)
3. РАСПИСАНИЕ: pulse(schedule)→probe(list); probe.then→gate(for_each).in; gate.each→touch.in; gate.item→touch.ctx
4. AI-АНАЛИЗ: pulse→probe→fold(ai,aiProvider,prompt); probe.out→fold.src; fold.out→touch.ctx

ЗАПРЕЩЕНО:
- face.op=host → используй face.op=component + registry key
- Произвольные текстовые поля вместо typed cfg fields
- Edges без from.port и to.port
- Координаты не кратные 20 (сетка 20px, шаг колонки 300px, строки 120px)

РЕЖИМЫ action:
- build — новый продукт или полная пересборка графа (нет текущего графа в контексте)
- patch — инкремент: добавь/измени только нужные ноды; сохрани существующие id; remove — массив id для удаления
- clarify — только reply с вопросом; graphs пустой или отсутствует

Ответ — ТОЛЬКО JSON без markdown:
{
  "action": "build" | "patch" | "clarify",
  "reply": "краткое описание что создаю",
  "reasoning": "логика выбора нод и slug",
  "productSlug": "ЛЮБОЙ slug латинскими буквами (может быть новым!)",
  "productName": "Название продукта по-русски",
  "productIcon": "Одна эмодзи иконка",
  "graphs": {
    "flow": { "nodes": [...], "edges": [...], "remove": ["id-to-delete"] },
    "view": { "nodes": [...], "edges": [...] },
    "data": { "nodes": [...], "edges": [] }
  },
  "steps": [{ "id": "s1", "title": "...", "action": "add_node|set_face|add_edge", "payload": {} }]
}`;

export function buildComposeUserPrompt(
  message: string,
  productSlug?: string,
  crmBlock?: string,
  graphKind?: "flow" | "view" | "data",
  existingGraphs?: Partial<Record<"flow" | "view" | "data", string>>,
): string {
  const nodeCatalog = Object.entries(V3_NODE_DEFS).map(([type, d]) =>
    `${type}: ${d.label} — ${d.hint}\n  ops: ${d.ops.join(", ")}`,
  ).join("\n");

  const events = REACTOR_EVENTS.map((e) => `${e.id} (${e.entity}): ${e.label}`).join("\n  ");
  const maskMode = graphKind === "view";

  const sections: string[] = [
    `Запрос пользователя: ${message}`,
    productSlug ? `Целевой продукт: ${productSlug}` : "",
    graphKind ? `Целевой граф: ${graphKind}` : "",
    maskMode ? "Режим: МАСКА — только view-граф, сохрани mask-styles-root." : "",

    `КАТАЛОГ НОД:\n${nodeCatalog}`,

    PORT_MATRIX,

    COMPONENT_REGISTRY,

    `СОБЫТИЯ для pulse.mode=event:\n  ${events}`,

    PULSE_MODES_GUIDE,

    FLOW_PATTERNS,

    EXAMPLE_GRAPH,

    crmBlock ? `КОНТЕКСТ CRM:\n${crmBlock}` : "",

    existingGraphs?.flow ? `ТЕКУЩИЙ FLOW-ГРАФ (patch, не перезаписывай целиком):\n${existingGraphs.flow}` : "",
    existingGraphs?.view ? `ТЕКУЩИЙ VIEW-ГРАФ (patch, сохрани mask-styles-root):\n${existingGraphs.view}` : "",
    existingGraphs?.data ? `ТЕКУЩИЙ DATA-ГРАФ (patch):\n${existingGraphs.data}` : "",

    (existingGraphs?.flow || existingGraphs?.view || existingGraphs?.data)
      ? "Используй action=patch: добавь/измени только нужные ноды и edges; remove — id для удаления."
      : "",

    maskMode
      ? "Верни graphs.view с face/wire нодами. ОБЯЗАТЕЛЬНО включи ноду mask-styles-root (type=face, id=mask-styles-root, cfg.op=mask-styles, cfg.role=design, cfg.styles=JSON-строка с картой стилей). Не включай flow и data."
      : "Собери три графа: flow (автоматизация, минимум 3 ноды), view (UI face+wire), data (probe+fold агрегации).\nИспользуй паттерны и пример выше как шаблон.",
  ];

  return sections.filter(Boolean).join("\n\n");
}
