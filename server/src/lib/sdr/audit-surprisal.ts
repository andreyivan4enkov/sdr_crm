import {
  buildEventModel,
  eventSurprisalBits,
  type SessionEvent,
  type EventModel,
} from "@sdr-crm/sdr-core";
import { sdrConfig } from "./config.js";

const MAX_WINDOW = 5000;
const eventWindow: SessionEvent[] = [];
let model: EventModel | null = null;

function auditToSessionEvent(action: string, meta?: Record<string, unknown>): SessionEvent {
  const bytes = meta ? JSON.stringify(meta).length : 0;
  const hour = new Date().getHours();
  return { type: action, bytes, hour };
}

export function scoreAuditSurprisal(action: string, meta?: Record<string, unknown>) {
  if (!sdrConfig.audit) return null;
  const ev = auditToSessionEvent(action, meta);
  if (!model) model = buildEventModel(eventWindow);
  const bits = eventSurprisalBits(ev, model);
  const anomaly = bits > sdrConfig.auditThreshold;
  eventWindow.push(ev);
  if (eventWindow.length > MAX_WINDOW) {
    eventWindow.splice(0, eventWindow.length - MAX_WINDOW);
    model = buildEventModel(eventWindow);
  }
  return { surprisalBits: Math.round(bits * 100) / 100, anomaly };
}
