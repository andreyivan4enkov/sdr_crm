import type { UiManifest, UiManifestComponent } from "@sdr-crm/site-core";
import type { ReactorGraph, V3Node } from "./types.js";

export type FaceHostKey =
  | "crm.kanban"
  | "crm.lead"
  | "tasks.list"
  | "analytics.hub"
  | "analytics.dashboard"
  | "site.editor"
  | "edo.hub"
  | "mail.hub"
  | "calls.list"
  | "team.list"
  | "entities.hub"
  | "resources.hub"
  | "settings.hub"
  | "profile.hub"
  | "reactor.sandbox"
  | "audit.log";

export const FACE_HOST_LABELS: Record<FaceHostKey, string> = {
  "crm.kanban": "CRM Канбан",
  "crm.lead": "Карточка лида",
  "tasks.list": "Задачи",
  "analytics.hub": "Аналитика",
  "analytics.dashboard": "AI-дашборды",
  "site.editor": "Конструктор сайта",
  "edo.hub": "Документы ЭДО",
  "mail.hub": "Почта",
  "calls.list": "Звонки",
  "team.list": "Команда",
  "entities.hub": "Юр. лица и контакты",
  "resources.hub": "Ресурсы и активы",
  "settings.hub": "Настройки",
  "profile.hub": "Профиль",
  "reactor.sandbox": "Песочница Реактора",
  "audit.log": "Журнал аудита",
};

function faceNodeToComponent(node: V3Node): UiManifestComponent | null {
  const cfg = node.cfg || {};
  const op = cfg.op || "host";
  if (op === "host" && cfg.host) {
    const hostKey = cfg.host as FaceHostKey;
    const hostToModule: Partial<Record<FaceHostKey, string>> = {
      "crm.kanban": "crm",
      "crm.lead": "crm",
      "tasks.list": "tasks",
      "analytics.hub": "analytics",
      "analytics.dashboard": "analytics",
      "site.editor": "site",
      "edo.hub": "edo",
      "mail.hub": "mail",
      "calls.list": "calls",
      "team.list": "team",
      "entities.hub": "entities",
      "resources.hub": "resources",
      "settings.hub": "settings",
      "profile.hub": "profile",
      "reactor.sandbox": "reactor",
      "audit.log": "audit",
    };
    const mod = hostToModule[hostKey] ?? cfg.host;
    return {
      id: node.id,
      component: "workspace.module",
      label: FACE_HOST_LABELS[hostKey] || cfg.host,
      props: { module: mod, ...parseProps(cfg.props) },
    };
  }
  if (op === "component" && cfg.component) {
    return {
      id: node.id,
      component: cfg.component as UiManifestComponent["component"],
      label: cfg.label,
      props: parseProps(cfg.props),
      bind: cfg.bind ? JSON.parse(cfg.bind) : undefined,
      actions: cfg.actions ? JSON.parse(cfg.actions) : undefined,
    };
  }
  if (op === "layout") {
    return {
      id: node.id,
      component: "dashboard.shell",
      props: { layout: cfg.layout || "stack", columns: Number(cfg.columns || 1) },
      children: cfg.children ? cfg.children.split(",") : undefined,
    };
  }
  if (op === "page") {
    return {
      id: node.id,
      component: "dashboard.shell",
      label: cfg.title || cfg.route,
      props: { route: cfg.route, title: cfg.title, host: cfg.host },
    };
  }
  return null;
}

function parseProps(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function resolveFaceGraph(
  graph: ReactorGraph,
  meta?: { title?: string; slug?: string },
): { manifest: UiManifest; host: FaceHostKey | null; route?: string; title: string } {
  const components: UiManifestComponent[] = [];
  let host: FaceHostKey | null = null;
  let route: string | undefined;
  let title = meta?.title || "Продукт";

  const root = graph.nodes.find((n) => n.type === "face" && (n.cfg.op === "page" || n.cfg.op === "host"))
    ?? graph.nodes.find((n) => n.type === "face");

  for (const node of graph.nodes) {
    if (node.type !== "face") continue;
    if (node.cfg?.op === "mask-styles") continue;
    const comp = faceNodeToComponent(node);
    if (comp) components.push(comp);
    if (node.cfg.host) host = node.cfg.host as FaceHostKey;
    if (node.cfg.route) route = node.cfg.route;
    if (node.cfg.title) title = node.cfg.title;
  }

  if (root?.cfg.host) host = root.cfg.host as FaceHostKey;
  if (root?.cfg.route) route = root.cfg.route;
  if (root?.cfg.title) title = root.cfg.title;

  const manifest: UiManifest = {
    version: "1",
    title,
    layout: "stack",
    components,
    context: meta?.slug ? { productSlug: meta.slug } : undefined,
  };

  return { manifest, host, route, title };
}