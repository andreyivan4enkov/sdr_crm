import type { NotificationPrefs } from "../db/schema.js";

export const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefs> = {
  pushEnabled: false,
  inAppEnabled: true,
  incomingCall: true,
  newLead: true,
  stageNotify: true,
  callTranscript: true,
  callRecording: true,
  taskAssigned: true,
  taskUpdated: true,
  taskDue: true,
};

export type NotificationKind = keyof Pick<
  Required<NotificationPrefs>,
  "incomingCall" | "newLead" | "stageNotify" | "callTranscript" | "callRecording"
  | "taskAssigned" | "taskUpdated" | "taskDue"
>;

export function mergeNotificationPrefs(raw?: NotificationPrefs | null): Required<NotificationPrefs> {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(raw || {}) };
}

export function kindEnabled(prefs: Required<NotificationPrefs>, kind: NotificationKind): boolean {
  return prefs.inAppEnabled && prefs[kind];
}

export function pushKindEnabled(prefs: Required<NotificationPrefs>, kind: NotificationKind): boolean {
  return prefs.pushEnabled && prefs[kind];
}
