export const MARKETING_INTEGRATION_TYPES = [
  "vk",
  "yandex_direct",
  "yandex_metrica",
  "avito",
] as const;

export type MarketingIntegrationType = (typeof MARKETING_INTEGRATION_TYPES)[number];

export const MARKETING_CHANNEL_BY_TYPE: Partial<Record<MarketingIntegrationType, string>> = {
  vk: "VK",
  yandex_direct: "Яндекс Директ",
  avito: "Avito",
};

export const MARKETING_LABELS: Record<MarketingIntegrationType, string> = {
  vk: "ВКонтакте",
  yandex_direct: "Яндекс Директ",
  yandex_metrica: "Яндекс Метрика",
  avito: "Авито",
};

export function marketingWebhookUrl(type: MarketingIntegrationType, baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/marketing/${type}`;
}

export function isMarketingType(type: string): type is MarketingIntegrationType {
  return (MARKETING_INTEGRATION_TYPES as readonly string[]).includes(type);
}
