export const ALL_PERMISSIONS = [
  "leads.read", "leads.read_all", "leads.write", "leads.assign", "leads.delete", "leads.erase", "leads.export",
  "stages.manage", "fields.manage", "channels.manage",
  "users.manage", "users.invite", "roles.manage", "profiles.manage",
  "team.read", "team.manage",
  "analytics.view", "analytics.manage", "settings.manage", "audit.view",
  "calls.view", "calls.dial", "integrations.manage", "marketing.manage",
  "edo.view", "edo.sign", "edo.manage",
  "mail.view", "mail.send", "mail.manage",
  "legal.view", "legal.manage",
  "contacts.view", "contacts.manage",
  "resources.view", "resources.manage", "resources.link",
  "assets.view", "assets.manage",
  "reactor.view", "reactor.edit", "reactor.publish", "reactor.ai", "reactor.fork",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Полный доступ к CRM без управления ролями и учётными записями */
export const INTEGRATOR_PERMISSIONS: Permission[] = [
  "leads.read", "leads.read_all", "leads.write", "leads.assign", "leads.delete", "leads.erase", "leads.export",
  "stages.manage", "fields.manage", "channels.manage", "profiles.manage",
  "team.read", "team.manage",
  "analytics.view", "analytics.manage", "settings.manage", "audit.view",
  "calls.view", "calls.dial", "integrations.manage",
  "edo.view", "edo.sign", "edo.manage",
  "mail.view", "mail.send", "mail.manage",
  "legal.view", "legal.manage", "contacts.view", "contacts.manage",
  "resources.view", "resources.manage", "resources.link",
  "assets.view", "assets.manage",
  "users.invite",
  "reactor.view", "reactor.edit", "reactor.publish", "reactor.ai", "reactor.fork",
];

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
}

export function hasAnyPermission(permissions: string[], required: string[]): boolean {
  return required.some((p) => hasPermission(permissions, p));
}

/** Какие роли можно назначить при создании invite-ссылки */
/** Права маркетолога: рекламные каналы, аналитика, заявки */
export const MARKETER_PERMISSIONS: Permission[] = [
  "leads.read", "leads.read_all", "leads.write",
  "analytics.view", "channels.manage", "marketing.manage", "settings.manage", "team.read",
];

export function inviteableRoleNames(inviterRoleName: string | null | undefined): string[] {
  if (inviterRoleName === "admin") return ["operator", "deal_manager", "integrator", "manager", "marketer"];
  if (inviterRoleName === "integrator") return ["operator", "deal_manager", "manager", "marketer"];
  if (inviterRoleName === "manager") return ["marketer"];
  return [];
}

/** Может ли актор назначить целевую роль существующему пользователю (approve / PATCH). */
export function canAssignRole(actorRoleName: string | null | undefined, targetRoleName: string): boolean {
  if (!actorRoleName) return false;
  if (actorRoleName === "admin") return true;
  if (actorRoleName === "integrator") {
    return targetRoleName !== "admin" && targetRoleName !== "integrator";
  }
  if (actorRoleName === "manager") return targetRoleName === "marketer";
  return false;
}

export function sanitizeRolePermissions(permissions: string[]): string[] {
  const allowed = new Set<string>(ALL_PERMISSIONS);
  allowed.add("*");
  return [...new Set(permissions.filter((p) => allowed.has(p)))];
}

export function normalizePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((p): p is string => typeof p === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizePermissions(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

export const DEFAULT_ROLES: { name: string; label: string; permissions: string[] }[] = [
  { name: "admin", label: "Администратор", permissions: ["*"] },
  { name: "integrator", label: "Интегратор", permissions: [...INTEGRATOR_PERMISSIONS] },
  {
    name: "manager",
    label: "Руководитель",
    permissions: [
      "leads.read", "leads.read_all", "leads.write", "leads.assign", "leads.export",
      "team.read", "team.manage",
      "analytics.view", "analytics.manage", "calls.view", "calls.dial",
      "edo.view", "edo.sign", "edo.manage",
      "mail.view", "mail.send", "mail.manage",
      "legal.view", "legal.manage", "contacts.view", "contacts.manage",
      "resources.view", "resources.manage", "resources.link",
      "assets.view", "assets.manage",
      "users.invite",
      "reactor.view", "reactor.edit", "reactor.ai",
    ],
  },
  {
    name: "operator",
    label: "Оператор",
    permissions: ["leads.read", "leads.write", "leads.assign", "team.read", "analytics.view", "calls.view", "calls.dial", "edo.view", "edo.sign", "mail.view", "mail.send", "legal.view", "contacts.view", "resources.view", "resources.link", "assets.view", "reactor.view"],
  },
  {
    name: "deal_manager",
    label: "Менеджер по сделкам",
    permissions: ["leads.read", "leads.write", "team.read", "analytics.view", "calls.view"],
  },
  {
    name: "marketer",
    label: "Маркетолог",
    permissions: [...MARKETER_PERMISSIONS],
  },
];
