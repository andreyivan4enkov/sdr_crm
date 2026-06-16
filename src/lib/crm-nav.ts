import type { ComponentType } from "react";
import {
  BarChart3, Columns, ListTodo, PhoneCall, ScrollText, Settings, Users,
} from "lucide-react";
import type { AuthUser } from "@jbrealty/api-client";
import { hasPermission } from "@jbrealty/api-client";

export type CrmNavItem = {
  k: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavLayout = "horizontal" | "vertical";

export const NAV_LAYOUT_KEY = "jbr:navLayout";

export const CRM_NAV_LABELS: Record<string, string> = {
  crm: "CRM",
  analytics: "Аналитика",
  tasks: "Задачи",
  team: "Сотрудники",
  settings: "Настройки",
  calls: "Звонки",
  audit: "Журнал",
};

export function buildCrmNav(user: AuthUser | null): CrmNavItem[] {
  if (!user) return [];
  const nav: CrmNavItem[] = [
    { k: "crm", label: "CRM", icon: Columns },
    { k: "analytics", label: "Аналитика", icon: BarChart3 },
    { k: "tasks", label: "Задачи", icon: ListTodo },
    { k: "team", label: "Сотрудники", icon: Users },
    { k: "settings", label: "Настройки", icon: Settings },
  ];
  if (hasPermission(user, "calls.view")) nav.push({ k: "calls", label: "Звонки", icon: PhoneCall });
  if (hasPermission(user, "audit.view")) nav.push({ k: "audit", label: "Журнал", icon: ScrollText });
  return nav;
}
