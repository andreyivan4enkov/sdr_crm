import { t, type Locale } from "@sdr-crm/i18n";
import { PERMISSION_GROUP_KEYS } from "@sdr-crm/i18n";

/** @deprecated Use permissionLabel(key, locale) */
export const PERMISSION_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_t, key: string) {
    return permissionLabel(key, "ru");
  },
});

export type PermissionGroup = { title: string; permissions: string[] };

export function permissionLabel(key: string, locale: Locale = "ru"): string {
  return t(key, locale, undefined, "permissions");
}

export function getPermissionGroups(locale: Locale = "ru"): PermissionGroup[] {
  return PERMISSION_GROUP_KEYS.map((g) => ({
    title: t(g.titleKey, locale, undefined, "permissions"),
    permissions: [...g.permissions],
  }));
}

/** Legacy export for backward compatibility */
export const PERMISSION_GROUPS: PermissionGroup[] = getPermissionGroups("ru");

export function isFullAccess(permissions: string[]): boolean {
  return permissions.includes("*");
}
