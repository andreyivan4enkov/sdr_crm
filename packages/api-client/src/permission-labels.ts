/** Человекочитаемые названия прав (в стиле Битрикс24) */
export const PERMISSION_LABELS: Record<string, string> = {
  "leads.read": "Просмотр сделок",
  "leads.read_all": "Просмотр всех сделок",
  "leads.write": "Создание и изменение сделок",
  "leads.assign": "Назначение ответственного",
  "leads.delete": "Удаление сделок",
  "leads.erase": "Обезличивание персональных данных",
  "leads.export": "Выгрузка персональных данных",
  "stages.manage": "Управление этапами воронки",
  "fields.manage": "Управление полями карточки",
  "channels.manage": "Управление каналами",
  "users.manage": "Управление пользователями",
  "users.invite": "Приглашение пользователей",
  "roles.manage": "Управление ролями и правами",
  "profiles.manage": "Редактирование профилей сотрудников",
  "team.read": "Просмотр команды",
  "team.manage": "Управление командой и структурой",
  "analytics.view": "Просмотр аналитики",
  "analytics.manage": "Настройка дашбордов, этапов и целей",
  "settings.manage": "Общий доступ к разделу «Настройки»",
  "audit.view": "Просмотр журнала действий",
  "calls.view": "Просмотр журнала звонков",
  "calls.dial": "Исходящие звонки",
  "integrations.manage": "Управление интеграциями (сайт, телефония)",
  "marketing.manage": "Рекламные интеграции (ВК, Директ, Метрика, Авито)",
  "*": "Полный доступ",
};

export type PermissionGroup = { title: string; permissions: string[] };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Сделки",
    permissions: [
      "leads.read", "leads.read_all", "leads.write", "leads.assign",
      "leads.delete", "leads.erase", "leads.export",
    ],
  },
  {
    title: "Воронка и карточка",
    permissions: ["stages.manage"],
  },
  {
    title: "Настройки CRM",
    permissions: ["fields.manage", "channels.manage", "integrations.manage", "marketing.manage", "roles.manage", "settings.manage"],
  },
  {
    title: "Пользователи",
    permissions: ["users.manage", "users.invite", "profiles.manage"],
  },
  {
    title: "Команда",
    permissions: ["team.read", "team.manage"],
  },
  {
    title: "Аналитика и аудит",
    permissions: ["analytics.view", "analytics.manage", "audit.view"],
  },
  {
    title: "Телефония",
    permissions: ["calls.view", "calls.dial"],
  },
];

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key] || key;
}

export function isFullAccess(permissions: string[]): boolean {
  return permissions.includes("*");
}
