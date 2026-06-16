const BASE = "https://cloudpbx.beeline.ru/apis/portal";

export type BeelineSubscriptionRequest = {
  pattern?: string;
  expires?: number;
  subscriptionType?: "BASIC_CALL" | "ADVANCED_CALL";
  url: string;
};

export type BeelineSubscriptionResult = {
  subscriptionId?: string;
  expires?: number;
};

async function beelineFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "X-MPBX-API-AUTH-TOKEN": token,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = data as { description?: string; error?: string };
    throw new Error(err.description || err.error || `Beeline API HTTP ${res.status}`);
  }
  return data;
}

export async function beelineSubscribe(token: string, req: BeelineSubscriptionRequest): Promise<BeelineSubscriptionResult> {
  const data = await beelineFetch(token, "PUT", "/subscription", {
    pattern: req.pattern || "",
    expires: req.expires ?? 604800,
    subscriptionType: req.subscriptionType ?? "ADVANCED_CALL",
    url: req.url,
  });
  return data as BeelineSubscriptionResult;
}

export async function beelineUnsubscribe(token: string, subscriptionId: string) {
  await beelineFetch(token, "DELETE", `/subscription?subscriptionId=${encodeURIComponent(subscriptionId)}`);
}

export async function beelineGetSubscription(token: string, subscriptionId: string) {
  return beelineFetch(token, "GET", `/subscription?subscriptionId=${encodeURIComponent(subscriptionId)}`);
}

/** Исходящий звонок: id — внутренний номер или userId абонента, phone — 10 цифр */
export async function beelineDoCall(token: string, abonentId: string, phone10: string) {
  const digits = phone10.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) throw new Error("Номер должен содержать 10 цифр (без +7)");
  return beelineFetch(token, "POST", `/abonents/${encodeURIComponent(abonentId)}/call`, { phone: digits });
}

export function beelineRecordDownloadUrl(recordId: string) {
  return `${BASE}/v2/records/${encodeURIComponent(recordId)}/download`;
}

export function beelineRecordingAuthHeader(token: string) {
  return `X-MPBX-API-AUTH-TOKEN: ${token}`;
}
