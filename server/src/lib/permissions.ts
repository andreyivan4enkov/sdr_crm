export const ALL_PERMISSIONS = [
  "leads.read", "leads.read_all", "leads.write", "leads.assign", "leads.delete", "leads.erase", "leads.export",
  "stages.manage", "fields.manage", "channels.manage",
  "users.manage", "users.invite", "roles.manage", "profiles.manage",
  "team.read", "team.manage",
  "analytics.view", "analytics.manage", "settings.manage", "audit.view",
  "calls.view", "calls.dial", "integrations.manage", "marketing.manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Полный доступ к CRM без управления ролями и учётными записями */
export const INTEGRATOR_PERMISSIONS: Permission[] = [
  "leads.read", "leads.read_all", "leads.write", "leads.assign", "leads.delete", "leads.erase", "leads.export",
  "stages.manage", "fields.manage", "channels.manage", "profiles.manage",
  "team.read", "team.manage",
  "analytics.view", "analytics.manage", "settings.manage", "audit.view",
  "calls.view", "calls.dial", "integrations.manage",
  "users.invite",
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
  if (inviterRoleName === "admin") return ["operator", "realtor", "integrator", "manager", "marketer"];
  if (inviterRoleName === "integrator") return ["operator", "realtor", "manager", "marketer"];
  if (inviterRoleName === "manager") return ["marketer"];
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
      "users.invite",
    ],
  },
  {
    name: "operator",
    label: "Оператор",
    permissions: ["leads.read", "leads.write", "leads.assign", "team.read", "analytics.view", "calls.view", "calls.dial"],
  },
  {
    name: "realtor",
    label: "Риэлтор",
    permissions: ["leads.read", "leads.write", "team.read", "analytics.view", "calls.view"],
  },
  {
    name: "marketer",
    label: "Маркетолог",
    permissions: [...MARKETER_PERMISSIONS],
  },
];
