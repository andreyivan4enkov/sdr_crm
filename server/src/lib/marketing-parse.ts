export function readMarketingBody(raw: string, contentType: string): Record<string, string> {
  if (contentType.includes("application/json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) {
        if (v != null && typeof v !== "object") out[k] = String(v);
      }
      return out;
    } catch { /* fall through */ }
  }
  const out: Record<string, string> = {};
  for (const part of raw.split("&")) {
    const [k, v] = part.split("=").map((s) => decodeURIComponent(s.replace(/\+/g, " ")));
    if (k) out[k] = v || "";
  }
  return out;
}

function pick(body: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    if (body[k]) return body[k];
    const lower = k.toLowerCase();
    for (const [bk, bv] of Object.entries(body)) {
      if (bk.toLowerCase() === lower && bv) return bv;
    }
  }
  return undefined;
}

export function parseMarketingLead(body: Record<string, string>, source: string) {
  const phone = pick(body, ["phone", "Phone", "tel", "client_phone", "user_phone", "contact_phone"]);
  const name = pick(body, ["name", "Name", "client_name", "user_name", "full_name", "fio"]) || `Лид ${source}`;
  const email = pick(body, ["email", "Email", "mail"]);
  const comment = pick(body, ["comment", "Comments", "message", "text", "question", "description"]);
  const region = pick(body, ["region", "city", "geo"]);
  const campaign = pick(body, ["campaign", "utm_campaign", "campaign_id", "ad_id"]);
  const consentRaw = pick(body, ["pd_consent", "consent", "agree"]);
  const hasConsent = consentRaw === "yes" || consentRaw === "1" || consentRaw === "true"
    || consentRaw === "on" || consentRaw === "да";

  const noteParts: string[] = [`Источник: ${source}`];
  if (campaign) noteParts.push(`Кампания: ${campaign}`);
  const utm = ["utm_source", "utm_medium", "utm_content", "utm_term"]
    .map((k) => body[k] ? `${k}=${body[k]}` : "")
    .filter(Boolean);
  if (utm.length) noteParts.push(utm.join(", "));

  return {
    name,
    phone,
    email,
    comment: [comment, noteParts.join(" · ")].filter(Boolean).join("\n"),
    region,
    pdConsent: hasConsent,
    custom: campaign ? { campaign } : {},
  };
}
