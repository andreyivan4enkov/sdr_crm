import type { SiteBlockType } from "./types.js";

export const SITE_BLOCK_DEFS: Record<SiteBlockType, { label: string; color: string; defaultH: number }> = {
  hero: { label: "Hero", color: "#a78bfa", defaultH: 220 },
  section: { label: "Секция", color: "#38bdf8", defaultH: 160 },
  text: { label: "Текст", color: "#34d399", defaultH: 120 },
  cta: { label: "Кнопка / CTA", color: "#fbbf24", defaultH: 80 },
  gallery: { label: "Галерея", color: "#fb7185", defaultH: 180 },
  form: { label: "Форма", color: "#22d3ee", defaultH: 200 },
  entity: { label: "Сущность CRM", color: "#2dd4bf", defaultH: 120 },
  blueprint: { label: "Процесс Реактора", color: "#818cf8", defaultH: 120 },
  div: { label: "Div-блок", color: "#94a3b8", defaultH: 100 },
};

export const SITE_BLOCK_GROUPS: Record<string, { name: string; color: string; types: SiteBlockType[] }> = {
  layout: { name: "Вёрстка", color: "#a78bfa", types: ["hero", "section", "div"] },
  content: { name: "Контент", color: "#34d399", types: ["text", "cta", "gallery"] },
  crm: { name: "CRM и потоки", color: "#818cf8", types: ["form", "entity", "blueprint"] },
};

const CANVAS_W = 260;

export function defaultBlock(type: SiteBlockType, id: string, x: number, y: number): import("./types.js").SiteBlock {
  const d = SITE_BLOCK_DEFS[type];
  const w = CANVAS_W;
  const base = {
    id,
    type,
    x,
    y,
    w,
    h: d.defaultH,
    tag: type === "section" || type === "hero" ? "section" as const : "div" as const,
    label: d.label,
    text: "",
    html: "",
    css: {} as Record<string, string>,
  };

  switch (type) {
    case "hero":
      return {
        ...base,
        h: 150,
        text: "CRM для вашего бизнеса",
        html: `<div class="hero-inner"><p class="hero-kicker">Универсальная CRM</p><h1>Управляйте сделками в одном месте</h1><p class="hero-sub">Лиды, воронки, задачи и автоматизация для любой отрасли</p><a href="#contact" class="btn btn-primary">Получить консультацию</a></div>`,
        css: { background: "linear-gradient(135deg,#0f766e 0%,#134e4a 100%)", color: "#fff", padding: "64px 32px", borderRadius: "0" },
      };
    case "text":
      return {
        ...base,
        text: "Почему выбирают нас",
        html: `<div class="prose"><h2>Почему выбирают нас</h2><p>Гибкая воронка, роли и права, интеграции с формами и телефонией. Персональный менеджер и прозрачная аналитика.</p></div>`,
        css: { padding: "48px 32px", background: "#fff" },
      };
    case "cta":
      return {
        ...base,
        h: 100,
        text: "Бесплатная консультация",
        html: `<a href="#contact" class="btn btn-cta">Бесплатная консультация</a>`,
        css: { padding: "32px", background: "#f8fafc", textAlign: "center" },
      };
    case "form":
      return {
        ...base,
        h: 130,
        entity: { kind: "form", ref: "lead" },
        html: `<h2 id="contact" style="margin:0 0 8px;font-size:14px">Оставьте заявку</h2>`,
        css: { padding: "16px", background: "#fff" },
      };
    case "blueprint":
      return {
        ...base,
        h: 110,
        entity: { kind: "blueprint", ref: "" },
        text: "Автоматизация",
        html: `<div class="site-bp-ref"><strong>Реактор</strong><p style="margin:4px 0 0;font-size:11px;opacity:.85">Поток данных и автоматизации</p></div>`,
        css: { padding: "14px", background: "linear-gradient(135deg,#312e81,#1e1b4b)", color: "#e0e7ff", borderRadius: "10px", border: "1px dashed #818cf8" },
      };
    default:
      return {
        ...base,
        css: { padding: "24px", background: "#f8fafc", borderRadius: "12px" },
      };
  }
}

export function blockPreviewText(block: import("./types.js").SiteBlock): string {
  if (block.text?.trim()) return block.text.trim().slice(0, 80);
  if (block.html?.trim()) return block.html.replace(/<[^>]+>/g, " ").trim().slice(0, 80);
  if (block.entity?.kind) return `CRM: ${block.entity.kind}${block.entity.field ? ` · ${block.entity.field}` : ""}`;
  return SITE_BLOCK_DEFS[block.type]?.label || block.type;
}
