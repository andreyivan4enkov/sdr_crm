import type { ComponentType } from "react";
import {
  BarChart3, Columns, Cpu, ListTodo, Mail, PhoneCall, ScrollText, Settings, Users, FileText, Building2, Package,
  Box, Layers, LayoutDashboard, MessageSquare, ShoppingCart, Ticket, Database, Globe, BookOpen, Briefcase,
  ClipboardList, Folder, PieChart, Activity, Bell, Star,
} from "lucide-react";
import type { AuthUser, ReactorProductSummary } from "@sdr-crm/api-client";
import { hasAnyPermission, hasPermission } from "@sdr-crm/api-client";
import { t, type Locale } from "@sdr-crm/i18n";

export function canAccessReactor(user: AuthUser | null): boolean {
  if (!user) return false;
  return hasPermission(user, "reactor.view")
    || hasPermission(user, "stages.manage")
    || hasPermission(user, "settings.manage")
    || hasPermission(user, "analytics.manage");
}

export function canAccessSettings(user: AuthUser | null): boolean {
  if (!user) return false;
  return hasAnyPermission(user, [
    "fields.manage", "settings.manage", "channels.manage", "integrations.manage",
    "marketing.manage", "roles.manage", "analytics.manage",
  ]);
}

export type CrmNavItem = {
  k: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavLayout = "horizontal" | "vertical";

export const NAV_LAYOUT_KEY = "jbr:navLayout";
export const NAV_PREFS_KEY = "jbr:crmNavPrefs";
export const NAV_PREFS_CHANGED_EVENT = "crm-nav-prefs-changed";

export type CrmNavPrefs = {
  order: string[];
  hidden: string[];
};

/** @deprecated use navLabel(k, locale) */
export const CRM_NAV_LABELS: Record<string, string> = {
  crm: "CRM",
  analytics: "Аналитика",
  tasks: "Задачи",
  team: "Сотрудники",
  settings: "Настройки",
  calls: "Звонки",
  audit: "Журнал",
  edo: "Документы",
  mail: "Почта",
  entities: "Юр. лица",
  resources: "Ресурсы",
  assets: "Активы",
  reactor: "Реактор",
};

export function navLabel(key: string, locale: Locale = "ru"): string {
  return t(key, locale, undefined, "nav");
}

export function buildCrmNav(user: AuthUser | null, locale: Locale = "ru"): CrmNavItem[] {
  if (!user) return [];
  const nav: CrmNavItem[] = [
    { k: "crm", label: navLabel("crm", locale), icon: Columns },
    { k: "analytics", label: navLabel("analytics", locale), icon: BarChart3 },
    { k: "tasks", label: navLabel("tasks", locale), icon: ListTodo },
    { k: "team", label: navLabel("team", locale), icon: Users },
  ];
  if (canAccessReactor(user)) nav.push({ k: "reactor", label: navLabel("reactor", locale), icon: Cpu });
  if (canAccessSettings(user)) nav.push({ k: "settings", label: navLabel("settings", locale), icon: Settings });
  if (hasPermission(user, "calls.view")) nav.push({ k: "calls", label: navLabel("calls", locale), icon: PhoneCall });
  if (hasPermission(user, "edo.view")) nav.push({ k: "edo", label: navLabel("edo", locale), icon: FileText });
  if (hasPermission(user, "mail.view")) nav.push({ k: "mail", label: navLabel("mail", locale), icon: Mail });
  if (hasPermission(user, "legal.view")) nav.push({ k: "entities", label: navLabel("entities", locale), icon: Building2 });
  if (hasPermission(user, "resources.view") || hasPermission(user, "assets.view")) {
    nav.push({ k: "resources", label: navLabel("resources", locale), icon: Package });
  }
  if (hasPermission(user, "audit.view")) nav.push({ k: "audit", label: navLabel("audit", locale), icon: ScrollText });
  return nav;
}

export function parseCrmNavPrefs(raw: string | null): CrmNavPrefs | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<CrmNavPrefs>;
    if (!Array.isArray(data.order) || !Array.isArray(data.hidden)) return null;
    return {
      order: data.order.filter((k): k is string => typeof k === "string"),
      hidden: data.hidden.filter((k): k is string => typeof k === "string"),
    };
  } catch {
    return null;
  }
}

export function serializeCrmNavPrefs(prefs: CrmNavPrefs): string {
  return JSON.stringify(prefs);
}

/** Согласовать сохранённые настройки с текущими правами пользователя.
 *  extraKeys — дополнительные slug-ключи из reactor_products (кастомные и пресет-продукты) */
export function reconcileNavPrefs(
  user: AuthUser,
  prefs: CrmNavPrefs | null,
  locale: Locale = "ru",
  extraKeys: string[] = [],
): CrmNavPrefs {
  const staticAllowed = buildCrmNav(user, locale).map((n) => n.k);
  const allowed = [...new Set([...staticAllowed, ...extraKeys])];
  const order = (prefs?.order ?? []).filter((k) => allowed.includes(k));
  for (const k of allowed) {
    if (!order.includes(k)) order.push(k);
  }
  const hidden = (prefs?.hidden ?? []).filter((k) => allowed.includes(k));
  const visible = order.filter((k) => !hidden.includes(k));
  if (visible.length === 0 && order.length > 0) {
    return { order, hidden: hidden.filter((k) => k !== order[0]) };
  }
  return { order, hidden };
}

export function applyCrmNavPrefs(nav: CrmNavItem[], prefs: CrmNavPrefs | null): CrmNavItem[] {
  if (!prefs?.order?.length) return nav.filter((n) => !prefs?.hidden?.includes(n.k));
  const byKey = Object.fromEntries(nav.map((n) => [n.k, n]));
  const ordered = prefs.order.map((k) => byKey[k]).filter(Boolean) as CrmNavItem[];
  for (const n of nav) {
    if (!ordered.some((o) => o.k === n.k)) ordered.push(n);
  }
  return ordered.filter((n) => !prefs.hidden.includes(n.k));
}

export function reorderNavKeys(order: string[], fromIndex: number, toIndex: number): string[] {
  const arr = [...order];
  const [m] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, m);
  return arr;
}

export function toggleNavHidden(prefs: CrmNavPrefs, key: string): CrmNavPrefs {
  const hidden = new Set(prefs.hidden);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);
  const visible = prefs.order.filter((k) => !hidden.has(k));
  if (visible.length === 0) return prefs;
  return { ...prefs, hidden: [...hidden] };
}

const PRODUCT_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Columns, BarChart3, ListTodo, Users, Settings, PhoneCall, FileText, Mail,
  Building2, Package, Cpu, ScrollText, Box, Layers, LayoutDashboard, MessageSquare,
  ShoppingCart, Ticket, Database, Globe, BookOpen, Briefcase, ClipboardList, Folder,
  PieChart, Activity, Bell, Star,
};

function resolveProductIcon(iconName: string): ComponentType<{ className?: string }> {
  return PRODUCT_ICON_MAP[iconName] ?? Cpu;
}

/** Известные встроенные slugs — не дублировать в nav из пресетов */
const BUILT_IN_SLUGS = new Set([
  "crm", "analytics", "tasks", "team", "reactor", "settings",
  "calls", "edo", "mail", "entities", "resources", "audit", "profile",
]);

/**
 * Дополняет статический nav пинованными reactor products.
 * Пресеты с теми же slug что и встроенные — заменяют встроенные если navLabel задан.
 * Кастомные продукты добавляются в конец с ключом p:slug.
 */
export function mergeReactorProductsIntoNav(
  staticNav: CrmNavItem[],
  products: ReactorProductSummary[],
): CrmNavItem[] {
  if (!products.length) return staticNav;

  const overrides = new Map<string, CrmNavItem>();
  const custom: CrmNavItem[] = [];

  for (const p of products) {
    const label = p.nav?.label ?? p.name;
    const icon = resolveProductIcon(p.icon ?? "Cpu");
    if (BUILT_IN_SLUGS.has(p.slug)) {
      overrides.set(p.slug, { k: p.slug, label, icon });
    } else {
      custom.push({ k: `p:${p.slug}`, label, icon });
    }
  }

  const merged = staticNav.map((item) => overrides.get(item.k) ?? item);
  return [...merged, ...custom];
}
