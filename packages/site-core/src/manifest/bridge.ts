import type { SiteBlock, SiteDocument, SiteEntityBinding, SiteLink } from "../types.js";
import type { UiComponentKey, UiManifest, UiManifestComponent } from "./types.js";

const BLOCK_TO_COMPONENT: Partial<Record<SiteBlock["type"], UiComponentKey>> = {
  form: "form.lead",
  entity: "card.lead",
  blueprint: "blueprint.trigger",
  text: "text.block",
  cta: "button.action",
  hero: "text.block",
  section: "dashboard.shell",
};

const COMPONENT_TO_BLOCK: Partial<Record<UiComponentKey, SiteBlock["type"]>> = {
  "form.lead": "form",
  "card.lead": "entity",
  "blueprint.trigger": "blueprint",
  "text.block": "text",
  "button.action": "cta",
  "dashboard.shell": "section",
  "kanban.pipeline": "entity",
  "list.entity": "entity",
  "kpi.metric": "entity",
  "funnel.pipeline": "entity",
};

function siteEntityToBind(e?: SiteEntityBinding): UiManifestComponent["bind"] | undefined {
  if (!e?.kind) return undefined;
  const map: Record<string, UiManifestComponent["bind"]> = {
    lead: { entityType: "lead", entityId: e.ref },
    form: { entityType: "lead" },
    pipeline: { entityType: "lead", pipelineId: e.ref },
    stage: { entityType: "lead", stageId: e.ref },
    field: { entityType: "lead", field: e.field || e.ref },
    blueprint: { entityType: "lead", blueprintSpaceId: e.ref },
  };
  return map[e.kind];
}

function bindToSiteEntity(bind?: UiManifestComponent["bind"]): SiteEntityBinding | undefined {
  if (!bind) return undefined;
  if (bind.blueprintSpaceId) return { kind: "blueprint", ref: bind.blueprintSpaceId };
  if (bind.pipelineId) return { kind: "pipeline", ref: bind.pipelineId };
  if (bind.stageId) return { kind: "stage", ref: bind.stageId };
  if (bind.field) return { kind: "field", field: bind.field, ref: bind.field };
  if (bind.entityType === "lead") return { kind: "lead", ref: bind.entityId };
  return { kind: "lead", ref: bind.entityId };
}

/** SiteDocument → UiManifest (для preview / AI compact context) */
export function siteDocumentToManifest(doc: SiteDocument, title?: string): UiManifest {
  const components: UiManifestComponent[] = doc.blocks.map((b) => ({
    id: b.id,
    component: BLOCK_TO_COMPONENT[b.type] || "text.block",
    label: b.label || b.text?.slice(0, 80),
    props: {
      text: b.text,
      htmlHint: Boolean(b.html),
      pipelineId: b.entity?.kind === "pipeline" ? b.entity.ref : doc.uiManifest?.context?.pipelineId,
    },
    bind: siteEntityToBind(b.entity),
    actions: b.type === "cta" ? [{
      id: `${b.id}-cta`,
      kind: "navigate",
      label: b.text || "Действие",
      href: "#contact",
    }] : undefined,
  }));

  return {
    version: "1",
    title: title || doc.pages.find((p) => p.id === doc.activePageId)?.title || "Страница",
    layout: doc.uiManifest?.layout || "stack",
    theme: doc.uiManifest?.theme || "neomorphism",
    blueprintSpaceId: doc.blueprintSpaceId,
    context: doc.uiManifest?.context,
    components,
    links: (doc.links || []).map((l) => ({
      from: l.from,
      to: l.to,
      kind: l.kind === "flow" ? "flow" : l.kind === "entity" ? "entity" : l.kind === "nav" ? "nav" : "data",
      blueprintNodeId: l.blueprintNodeId,
    })),
  };
}

/** UiManifest → патч SiteDocument (сохраняет pages/theme, обновляет blocks/links) */
export function applyManifestToSiteDocument(doc: SiteDocument, manifest: UiManifest): SiteDocument {
  const blocks: SiteBlock[] = manifest.components.map((c, i) => {
    const blockType = COMPONENT_TO_BLOCK[c.component] || "div";
    const prev = doc.blocks.find((b) => b.id === c.id);
    return {
      id: c.id,
      type: blockType,
      x: prev?.x ?? 40,
      y: prev?.y ?? 40 + i * 200,
      w: prev?.w ?? (c.component === "kanban.pipeline" ? 720 : 640),
      h: prev?.h ?? 200,
      label: c.label,
      text: String(c.props?.text || c.label || ""),
      html: prev?.html || "",
      css: prev?.css || {},
      entity: bindToSiteEntity(c.bind),
    };
  });

  const links: SiteLink[] = (manifest.links || []).map((l, i) => ({
    id: `ml-${i}`,
    from: l.from,
    to: l.to,
    kind: l.kind === "flow" ? "flow" : l.kind === "entity" ? "entity" : l.kind === "nav" ? "nav" : "data",
    blueprintNodeId: l.blueprintNodeId,
  }));

  return {
    ...doc,
    blueprintSpaceId: manifest.blueprintSpaceId ?? doc.blueprintSpaceId,
    uiManifest: manifest,
    blocks,
    links,
  };
}

/** Пример манифеста «канбан сделок» для документации / seed */
export function demoKanbanManifest(pipelineId: string): UiManifest {
  return {
    version: "1",
    title: "Канбан · Сделки",
    intent: "kanban для лидов по стадиям воронки",
    layout: "stack",
    theme: "neomorphism",
    context: { pipelineId },
    components: [
      {
        id: "hdr",
        component: "text.block",
        label: "Заголовок",
        props: { body: "Сделки по воронке" },
      },
      {
        id: "kanban",
        component: "kanban.pipeline",
        label: "Канбан",
        bind: { entityType: "lead", pipelineId },
        props: { pipelineId, groupBy: "statusId" },
        actions: [{
          id: "move-stage",
          kind: "patch_fields",
          label: "Переместить сделку",
          entityType: "lead",
          entityId: "{{context.leadId}}",
          patches: [{ field: "statusId", value: "{{context.targetStageId}}" }],
        }],
      },
    ],
  };
}
