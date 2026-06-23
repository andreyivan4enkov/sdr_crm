import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, FileText, Globe, Link2, Megaphone, MessageCircle, Phone, Sparkles, Code, type LucideIcon,
} from "lucide-react";
import { api, hasAnyPermission, hasPermission, type AuthUser, type Channel } from "../api/client";
import { AdminIntegrations } from "./admin/AdminIntegrations";
import { MarketingIntegrations } from "./admin/MarketingIntegrations";
import { YandexCloudAiSettings } from "./admin/YandexCloudAiSettings";
import { SberGigaChatSettings } from "./admin/SberGigaChatSettings";
import { EdoSettings } from "./edo/EdoSettings";

const MANAGED_CHANNELS: Record<string, string> = {
  Tilda: "tilda",
  Телефония: "telephony",
  VK: "vk",
  Avito: "avito",
  "Яндекс Директ": "yandex_direct",
  "Яндекс Метрика": "yandex_metrica",
  "Яндекс Cloud AI": "yandex_cloud_ai",
};

export type ChannelModuleId =
  | "site_form"
  | "tilda"
  | "telephony"
  | "vk"
  | "telegram"
  | "whatsapp"
  | "instagram"
  | "avito"
  | "yandex_direct"
  | "yandex_metrica"
  | "yandex_cloud"
  | "sber_ai"
  | "edo"
  | "connectors"
  | "public_api";

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

type Props = {
  t: Record<string, string>;
  user: AuthUser;
  channels: Channel[];
  updateData: (patch: { channels: Channel[] }) => void;
  Btn: React.FC<BtnProps>;
  onSaved?: () => void;
  onOpenAiTab?: () => void;
};

type TileDef = {
  id: ChannelModuleId;
  title: string;
  hint: string;
  icon: LucideIcon;
  group: string;
  live: boolean;
  open: boolean;
  channelId?: string;
};

const MODULE_ICONS: Partial<Record<ChannelModuleId, LucideIcon>> = {
  site_form: Globe,
  tilda: Globe,
  telephony: Phone,
  yandex_cloud: Sparkles,
  sber_ai: Sparkles,
  edo: FileText,
  connectors: Link2,
  public_api: Code,
};

function tileIcon(mod: ChannelModuleId, chType: Channel["type"]): LucideIcon {
  return MODULE_ICONS[mod] ?? (chType === "messenger" ? MessageCircle : chType === "ad" ? Megaphone : Globe);
}

const GROUP_LABELS: Record<string, string> = {
  site: "Сайт и звонки",
  messenger: "Мессенджеры",
  ad: "Реклама и аналитика",
  ai: "Облачный AI",
  docs: "Документы и API",
};

const CHANNEL_TO_MODULE: Record<string, ChannelModuleId> = {
  "Форма на сайте": "site_form",
  Tilda: "tilda",
  Телефония: "telephony",
  VK: "vk",
  Telegram: "telegram",
  WhatsApp: "whatsapp",
  "Instagram Direct": "instagram",
  Avito: "avito",
  "Яндекс Директ": "yandex_direct",
  "Яндекс Метрика": "yandex_metrica",
  "Яндекс Cloud AI": "yandex_cloud",
};

function DetailHeader({ title, onBack, t }: { title: string; onBack: () => void; t: Record<string, string> }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button type="button" onClick={onBack}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm ${t.muted} hover:bg-black/5 dark:hover:bg-white/5`}>
        <ArrowLeft className="w-4 h-4" /> К каналам
      </button>
      <span className={`text-sm font-semibold ${t.text}`}>{title}</span>
    </div>
  );
}

function ComingSoonPanel({ title, t }: { title: string; t: Record<string, string> }) {
  return (
    <div className={`rounded-2xl border p-6 text-center ${t.border} ${t.surface}`}>
      <p className="font-medium">{title}</p>
      <p className={`text-sm mt-2 ${t.muted}`}>Интеграция в разработке. Пока используйте webhook или универсальные коннекторы.</p>
    </div>
  );
}

export function ChannelsSettings({ t, user, channels, updateData, Btn, onSaved, onOpenAiTab }: Props) {
  const [active, setActive] = useState<ChannelModuleId | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, boolean>>({});
  const [edoLive, setEdoLive] = useState(false);
  const [statusErr, setStatusErr] = useState("");

  const canChannels = hasPermission(user, "channels.manage");
  const canIntegrate = hasPermission(user, "integrations.manage");
  const canMarketing = hasPermission(user, "marketing.manage");
  const canAiCloud = hasAnyPermission(user, ["integrations.manage", "analytics.manage", "settings.manage"]);

  useEffect(() => {
    if (!canIntegrate && !canMarketing && !canAiCloud) return;
    Promise.all([
      api.getIntegrations().catch(() => ({ integrations: [] as { type: string; enabled: boolean }[] })),
      canAiCloud ? api.getSettingsAi().catch(() => null) : Promise.resolve(null),
      canIntegrate ? api.getEdoConfig().catch(() => null) : Promise.resolve(null),
    ]).then(([r, ai, edo]) => {
      const map: Record<string, boolean> = { "Форма на сайте": true };
      for (const i of r.integrations) {
        for (const [chName, type] of Object.entries(MANAGED_CHANNELS)) {
          if (i.type === type) map[chName] = i.enabled;
        }
      }
      if (ai) {
        const cfg = ai.config as { enabled?: boolean; providerId?: string; configured?: boolean; folderId?: string };
        const yandex = cfg.providerId === "yandex" || cfg.providerId === "yandex_lite";
        map["Яндекс Cloud AI"] = Boolean(cfg.enabled && yandex && cfg.configured && cfg.folderId);
      }
      setIntegrationStatus(map);
      setEdoLive(edo?.config?.mode === "live");
      setStatusErr("");
    }).catch((e) => setStatusErr(e instanceof Error ? e.message : "Не удалось загрузить статус"));
  }, [canIntegrate, canMarketing, canAiCloud, channels]);

  const tiles = useMemo(() => {
    const list: TileDef[] = [];

    for (const ch of channels) {
      const mod = CHANNEL_TO_MODULE[ch.name];
      if (!mod) continue;
      const managed = Boolean(MANAGED_CHANNELS[ch.name]);
      const live = managed ? (integrationStatus[ch.name] ?? false) : ch.connected;
      let open = canChannels;
      if (mod === "tilda" || mod === "telephony" || mod === "connectors" || mod === "public_api" || mod === "edo") {
        open = canIntegrate;
      } else if (["vk", "avito", "yandex_direct", "yandex_metrica"].includes(mod)) {
        open = canMarketing;
      } else if (mod === "yandex_cloud" || mod === "sber_ai") {
        open = canAiCloud;
      } else if (["telegram", "whatsapp", "instagram"].includes(mod)) {
        open = false;
      }
      const hints: Partial<Record<ChannelModuleId, string>> = {
        site_form: "Встроенная форма CRM",
        tilda: "Webhook с Tilda",
        telephony: "SIP / ВАТС, записи",
        vk: "Лид-формы VK",
        avito: "Сообщения Авито",
        yandex_direct: "Заявки с лендингов",
        yandex_metrica: "Счётчик и API",
        yandex_cloud: "YandexGPT, SpeechKit",
      };
      list.push({
        id: mod,
        title: ch.name,
        hint: hints[mod] ?? "Канал лидов",
        icon: tileIcon(mod, ch.type),
        group: ch.type === "site" ? "site" : ch.type === "messenger" ? "messenger" : mod === "yandex_cloud" ? "ai" : "ad",
        live,
        open,
        channelId: ch.id,
      });
    }

    if (canIntegrate) {
      list.push({
        id: "edo",
        title: "ЭДО · Астрал",
        hint: "Электронные документы",
        icon: FileText,
        group: "docs",
        live: edoLive,
        open: true,
      });
      list.push({
        id: "connectors",
        title: "Коннекторы",
        hint: "GitHub, Miro, Figma…",
        icon: Link2,
        group: "docs",
        live: false,
        open: true,
      });
      list.push({
        id: "public_api",
        title: "Публичное API",
        hint: "POST /public/leads",
        icon: Code,
        group: "docs",
        live: false,
        open: true,
      });
    }

    if (canAiCloud) {
      const hasSber = !list.some((x) => x.id === "sber_ai");
      if (hasSber) {
        list.push({
          id: "sber_ai",
          title: "Сбер GigaChat",
          hint: "Облачный LLM",
          icon: Sparkles,
          group: "ai",
          live: false,
          open: true,
        });
      }
    }

    return list;
  }, [channels, integrationStatus, edoLive, canChannels, canIntegrate, canMarketing, canAiCloud]);

  const grouped = useMemo(() => {
    const order = ["site", "messenger", "ad", "ai", "docs"];
    return order
      .map((g) => ({ key: g, label: GROUP_LABELS[g] ?? g, items: tiles.filter((x) => x.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [tiles]);

  const activeTile = tiles.find((x) => x.id === active);

  function toggleSiteForm(channelId: string) {
    const ch = channels.map((c) => c.id === channelId ? { ...c, connected: !c.connected } : c);
    updateData({ channels: ch });
  }

  function renderDetail() {
    if (!active || !activeTile) return null;

    const header = <DetailHeader title={activeTile.title} onBack={() => setActive(null)} t={t} />;

    if (active === "site_form" && activeTile.channelId) {
      const ch = channels.find((c) => c.id === activeTile.channelId);
      return (
        <>
          {header}
          <div className={`rounded-2xl border p-5 ${t.surface} ${t.border}`}>
            <p className={`text-sm ${t.muted}`}>Встроенная форма на сайте CRM. Включённый канал доступен в авто-ответах на этапах воронки.</p>
            <div className="flex items-center gap-3 mt-4">
              <button type="button" onClick={() => toggleSiteForm(activeTile.channelId!)}
                className={`w-11 h-6 rounded-full transition relative ${ch?.connected ? "bg-teal-500" : t.chip}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${ch?.connected ? "left-5" : "left-0.5"}`} />
              </button>
              <span className="text-sm">{ch?.connected ? "Канал активен" : "Канал выключен"}</span>
            </div>
          </div>
        </>
      );
    }

    if (active === "telegram" || active === "whatsapp" || active === "instagram") {
      return <>{header}<ComingSoonPanel title={activeTile.title} t={t} /></>;
    }

    if (active === "tilda") {
      return <>{header}<AdminIntegrations t={t} Btn={Btn} onSaved={onSaved} section="tilda" /></>;
    }
    if (active === "telephony") {
      return <>{header}<AdminIntegrations t={t} Btn={Btn} onSaved={onSaved} section="telephony" /></>;
    }
    if (active === "connectors") {
      return <>{header}<AdminIntegrations t={t} Btn={Btn} onSaved={onSaved} section="connectors" /></>;
    }
    if (active === "public_api") {
      return <>{header}<AdminIntegrations t={t} Btn={Btn} onSaved={onSaved} section="public_api" /></>;
    }
    if (active === "edo") {
      return <>{header}<EdoSettings t={t} Btn={Btn} onSaved={onSaved} /></>;
    }
    if (active === "yandex_cloud") {
      return <>{header}<YandexCloudAiSettings t={t} Btn={Btn} onSaved={onSaved} onOpenAiTab={onOpenAiTab} /></>;
    }
    if (active === "sber_ai") {
      return <>{header}<SberGigaChatSettings t={t} Btn={Btn} onSaved={onSaved} onOpenAiTab={onOpenAiTab} /></>;
    }
    if (active === "vk") {
      return <>{header}<MarketingIntegrations t={t} Btn={Btn} onSaved={onSaved} section="vk" /></>;
    }
    if (active === "yandex_direct") {
      return <>{header}<MarketingIntegrations t={t} Btn={Btn} onSaved={onSaved} section="yandex_direct" /></>;
    }
    if (active === "yandex_metrica") {
      return <>{header}<MarketingIntegrations t={t} Btn={Btn} onSaved={onSaved} section="yandex_metrica" /></>;
    }
    if (active === "avito") {
      return <>{header}<MarketingIntegrations t={t} Btn={Btn} onSaved={onSaved} section="avito" /></>;
    }

    return null;
  }

  if (!canChannels && !canIntegrate && !canMarketing && !canAiCloud) {
    return <p className={`text-sm ${t.muted}`}>Нет прав на настройку каналов и интеграций.</p>;
  }

  if (active) {
    return <div className="space-y-2">{renderDetail()}</div>;
  }

  return (
    <div className="space-y-5">
      <p className={`text-sm ${t.muted}`}>
        Источники лидов и интеграции. Выберите плитку — откроются настройки модуля.
      </p>
      {statusErr && <p className="text-sm text-rose-500">{statusErr}</p>}

      {grouped.map((g) => (
        <section key={g.key}>
          <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.muted}`}>{g.label}</h3>
          <div className="channel-tiles-grid">
            {g.items.map((tile) => {
              const Icon = tile.icon;
              const iconCls = tile.id === "yandex_metrica" ? "text-red-500"
                : tile.id === "yandex_direct" ? "text-amber-500"
                : tile.id === "avito" ? "text-emerald-500"
                : tile.id === "vk" ? "text-sky-500"
                : tile.id === "telephony" ? "text-violet-500"
                : tile.id === "edo" ? "text-indigo-500"
                : tile.id === "yandex_cloud" || tile.id === "sber_ai" ? "text-violet-500"
                : "text-teal-600";
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={!tile.open}
                  onClick={() => tile.open && setActive(tile.id)}
                  className={`channel-tile ${t.border} ${tile.open ? "" : "channel-tile--disabled"}`}
                >
                  <span className={`channel-tile-icon ${tile.live ? "is-live" : ""}`}>
                    <Icon className={`w-5 h-5 ${iconCls}`} />
                  </span>
                  <span className="channel-tile-title">{tile.title}</span>
                  <span className={`channel-tile-hint ${t.muted}`}>{tile.hint}</span>
                  <span className={`channel-tile-status ${tile.live ? "is-live" : t.muted}`}>
                    {!tile.open ? "Скоро" : tile.live ? "Подключено" : "Настроить"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
