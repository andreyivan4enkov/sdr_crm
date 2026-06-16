import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { notificationSettings, users, roles } from "../db/schema.js";
import { broadcastToUsers } from "./events.js";
import {
  mergeNotificationPrefs, kindEnabled, pushKindEnabled, type NotificationKind,
} from "./notification-prefs.js";
import { sendPushToUsers, type PushPayload } from "./push.js";
import { hasPermission } from "./permissions.js";

type NotifyInput = {
  kind: NotificationKind;
  text: string;
  leadId?: string;
  callId?: string;
  taskId?: string;
  url?: string;
  event?: string;
  data?: Record<string, unknown>;
};

async function usersWithPermission(perm: string) {
  const rows = await db.select({
    id: users.id,
    permissions: roles.permissions,
  }).from(users).leftJoin(roles, eq(users.roleId, roles.id));
  return rows
    .filter((r: { id: string; permissions: string[] | null }) => hasPermission((r.permissions as string[]) || [], perm))
    .map((r: { id: string }) => r.id);
}

async function filterByPrefs(userIds: string[], kind: NotificationKind) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return { inAppUsers: [] as string[], pushUsers: [] as string[] };

  const prefRows = await db.select().from(notificationSettings).where(inArray(notificationSettings.userId, unique));
  const prefMap = new Map<string, ReturnType<typeof mergeNotificationPrefs>>();
  for (const row of prefRows) {
    prefMap.set(row.userId, mergeNotificationPrefs(row.settings));
  }

  const inAppUsers: string[] = [];
  const pushUsers: string[] = [];
  for (const id of unique) {
    const prefs = prefMap.get(id) ?? mergeNotificationPrefs(null);
    if (kindEnabled(prefs, kind)) inAppUsers.push(id);
    if (pushKindEnabled(prefs, kind)) pushUsers.push(id);
  }
  return { inAppUsers, pushUsers };
}

function resolveUrl(input: NotifyInput) {
  return input.url || (input.taskId ? `/crm?task=${input.taskId}` : input.leadId ? `/crm?lead=${input.leadId}` : "/crm");
}

async function deliver(userIds: string[], input: NotifyInput) {
  const { inAppUsers, pushUsers } = await filterByPrefs(userIds, input.kind);
  const url = resolveUrl(input);

  if (inAppUsers.length) {
    broadcastToUsers(inAppUsers, input.event || "notification", {
      text: input.text,
      leadId: input.leadId,
      callId: input.callId,
      taskId: input.taskId,
      kind: input.kind,
      ...input.data,
    });
  }

  if (pushUsers.length) {
    const payload: PushPayload = {
      title: "JBrealty CRM",
      body: input.text,
      url,
      tag: input.taskId || input.callId || input.leadId || input.kind,
    };
    await sendPushToUsers(pushUsers, payload);
  }
}

/** Уведомление конкретным пользователям (задачи, назначения) */
export async function dispatchUserNotification(userIds: string[], input: NotifyInput) {
  await deliver(userIds, input);
}

export async function dispatchNotification(input: NotifyInput) {
  const perm = input.kind === "incomingCall" || input.kind === "callTranscript" || input.kind === "callRecording"
    ? "calls.view"
    : "leads.read";
  const candidateIds = await usersWithPermission(perm);
  if (!candidateIds.length) return;
  await deliver(candidateIds, input);
}
