import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, leads, stages } from "../db/schema.js";

export type CallLinkConfig = {
  /** По умолчанию true: цеплять к активной сделке, не создавать дубль */
  attachActiveDeal?: boolean;
  /** Создавать карточку, если номера нет в CRM */
  createOnUnknown?: boolean;
  /** Метки этапов, считающихся закрытыми (по умолчанию «отказ», «сделка») */
  closedStageLabels?: string[];
};

export function normalizePhoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  else if (d.length === 10) d = `7${d}`;
  return d;
}

export function formatPhoneDisplay(phone: string): string {
  const d = normalizePhoneDigits(phone);
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return phone.trim();
}

export function isValidRuPhone(phone: string): boolean {
  const d = normalizePhoneDigits(phone);
  return d.length === 11 && d.startsWith("7");
}

export function normalizePhoneForStorage(phone: string | undefined | null): string | undefined {
  if (!phone?.trim()) return undefined;
  if (!isValidRuPhone(phone)) return undefined;
  return formatPhoneDisplay(phone);
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  return da.slice(-10) === db.slice(-10);
}

export async function findLeadsByPhone(phone: string) {
  const tail = normalizePhoneDigits(phone).slice(-10);
  if (tail.length < 10) return [];
  return db.select().from(leads).where(
    sql`right(regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g'), 10) = ${tail}`,
  ).orderBy(desc(leads.updatedAt));
}

export async function getClosedStageIds(customLabels?: string[]): Promise<Set<string>> {
  const labels = (customLabels?.length ? customLabels : ["отказ", "сделка"]).map((l) => l.toLowerCase());
  const stageRows = await db.select().from(stages);
  const closed = new Set<string>();
  for (const s of stageRows) {
    const l = s.label.toLowerCase();
    if (labels.some((pat) => l.includes(pat))) closed.add(s.id);
  }
  return closed;
}

function isActiveLead(lead: { statusId: string | null }, closedIds: Set<string>) {
  if (!lead.statusId) return true;
  return !closedIds.has(lead.statusId);
}

export async function createLeadFromCall(phone: string, createdBy = "Телефония") {
  const [firstStage] = await db.select().from(stages).orderBy(asc(stages.sortOrder)).limit(1);
  const [telCh] = await db.select().from(channels).where(eq(channels.name, "Телефония")).limit(1);
  const display = formatPhoneDisplay(phone);
  const [lead] = await db.insert(leads).values({
    name: `Звонок ${display}`,
    phone: display,
    source: "phone",
    channelId: telCh?.id,
    statusId: firstStage?.id,
    createdBy,
  }).returning();
  return lead;
}

/** Выбор сделки для звонка без дублей */
export async function resolveLeadForCall(phone: string, config: CallLinkConfig = {}) {
  const attachActive = config.attachActiveDeal !== false;
  const createOnUnknown = config.createOnUnknown !== false;
  const candidates = await findLeadsByPhone(phone);
  const closedIds = await getClosedStageIds(config.closedStageLabels);

  if (!candidates.length) {
    return createOnUnknown ? createLeadFromCall(phone) : null;
  }

  if (attachActive) {
    const active = candidates.find((l: typeof leads.$inferSelect) => isActiveLead(l, closedIds));
    if (active) return active;
  }

  return candidates[0];
}

export function parseCallLinkConfig(raw: Record<string, unknown> | undefined): CallLinkConfig {
  return {
    attachActiveDeal: raw?.callAttachActiveDeal !== false,
    createOnUnknown: raw?.createLeadOnUnknownCall !== false,
    closedStageLabels: Array.isArray(raw?.closedStageLabels)
      ? raw.closedStageLabels.map(String)
      : undefined,
  };
}
