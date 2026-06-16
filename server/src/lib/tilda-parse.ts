/** Служебные поля Tilda — не данные клиента */
const META_KEYS = new Set([
  "formid", "tranid", "formname", "referer", "utm_source", "utm_medium", "utm_campaign",
  "utm_content", "utm_term", "cookies", "tildaspec-projectid", "tildaspec-version-lib",
  "tildaspec-formskey", "tildaspec-pageid", "tildaspec-lang", "tildaspec-referer",
]);

const CRM_STANDARD = new Set(["name", "phone", "email", "comment", "region", "preferredTime"]);

/** Варианты имён полей на jbrealty.ru и типичных форм Tilda */
const ALIASES: Record<string, string[]> = {
  name: ["name", "Name", "имя", "Имя", "fullname", "Fullname", "fio", "Fio", "your_name"],
  phone: ["phone", "Phone", "tel", "Tel", "телефон", "Телефон", "mobile", "Mobile"],
  email: ["email", "Email", "mail", "Mail", "почта", "Почта"],
  preferredTime: ["date", "Date", "дата", "Дата", "time", "Time", "время", "Время"],
  comment: ["comments", "Comments", "comment", "Comment", "message", "Message", "сообщение"],
};

function decodeValue(v: string) {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
}

function flattenJson(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const key = String(row.name ?? row.key ?? row.label ?? row.id ?? "");
        const val = row.value ?? row.val ?? row.text;
        if (key && val != null && val !== "") out[key] = String(val);
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[prefix ? `${prefix}.${k}` : k] = String(v);
    } else if (typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenJson(v, k));
    }
  }
  return out;
}

export async function readTildaWebhookBody(
  raw: string,
  contentType: string,
): Promise<Record<string, string>> {
  const body: Record<string, string> = {};
  const ct = contentType.toLowerCase();

  if (ct.includes("application/json") && raw.trim()) {
    try {
      Object.assign(body, flattenJson(JSON.parse(raw)));
    } catch { /* fall through */ }
  }

  if (Object.keys(body).length === 0 && raw.trim()) {
    for (const [k, v] of new URLSearchParams(raw)) {
      body[k] = decodeValue(v);
    }
  }

  return body;
}

function getField(body: Record<string, string>, key: string): string | undefined {
  if (body[key] !== undefined && body[key] !== "") return body[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(body)) {
    if (k.toLowerCase() === lower && v) return v;
  }
  return undefined;
}

function findByAliases(body: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const v = getField(body, alias);
    if (v) return v;
  }
  return undefined;
}

function findPhoneFallback(body: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(body)) {
    if (META_KEYS.has(k.toLowerCase())) continue;
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 10 && /phone|tel|тел|mobile|ph/i.test(k)) return v;
  }
  for (const v of Object.values(body)) {
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return v;
  }
  return undefined;
}

export function isTildaTestPing(body: Record<string, string>): boolean {
  const dataKeys = Object.keys(body).filter((k) => !META_KEYS.has(k.toLowerCase()));
  return dataKeys.every((k) => !body[k]?.trim());
}

export function mapTildaToLead(
  body: Record<string, string>,
  fieldMapping: Record<string, string>,
): { leadData: Record<string, string>; custom: Record<string, string> } {
  const leadData: Record<string, string> = {};
  const usedKeys = new Set<string>();

  for (const [crmField, tildaField] of Object.entries(fieldMapping)) {
    if (crmField === "pdConsent") continue;
    const val = getField(body, tildaField);
    if (val) {
      leadData[crmField] = val;
      usedKeys.add(tildaField.toLowerCase());
    }
  }

  for (const [crmField, aliases] of Object.entries(ALIASES)) {
    if (leadData[crmField]) continue;
    const val = findByAliases(body, aliases);
    if (val) leadData[crmField] = val;
  }

  if (!leadData.phone) {
    const phone = findPhoneFallback(body);
    if (phone) leadData.phone = phone;
  }

  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!v || META_KEYS.has(k.toLowerCase())) continue;
    if (usedKeys.has(k.toLowerCase())) continue;
    if ([...CRM_STANDARD].some((f) => leadData[f] === v)) continue;
    custom[k] = v;
  }

  for (const [k, v] of Object.entries(leadData)) {
    if (!CRM_STANDARD.has(k) && v) custom[k] = v;
  }

  return { leadData, custom };
}

export function bodyFieldKeys(body: Record<string, string>) {
  return Object.keys(body).filter((k) => !META_KEYS.has(k.toLowerCase()));
}
