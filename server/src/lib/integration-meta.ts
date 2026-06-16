export function getPublicBaseUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function telephonyWebhookUrl(provider: string, baseUrl = getPublicBaseUrl()) {
  return `${baseUrl}/api/webhooks/telephony/${provider}`;
}

export function integrationEndpoints(baseUrl = getPublicBaseUrl()) {
  return {
    health: `${baseUrl}/api/health`,
    tildaWebhook: `${baseUrl}/api/webhooks/tilda`,
    telephonyWebhookPrefix: `${baseUrl}/api/webhooks/telephony/`,
    publicLeads: `${baseUrl}/api/public/leads`,
    publicRevoke: `${baseUrl}/api/public/revoke`,
    privacy: `${baseUrl}/api/public/privacy`,
    eventsStream: `${baseUrl}/api/events/stream`,
    marketingWebhookPrefix: `${baseUrl}/api/webhooks/marketing/`,
  };
}

export function webhookUrlWithSecret(url: string, secret: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}secret=${encodeURIComponent(secret)}`;
}

export function maskSecret(value?: string) {
  if (!value) return undefined;
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}
