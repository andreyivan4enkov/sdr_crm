import { useEffect, useState } from "react";
import { Globe, Megaphone, MessageCircle } from "lucide-react";
import { api, hasAnyPermission, hasPermission, type AuthUser, type Channel } from "../api/client";
import { AdminIntegrations } from "./admin/AdminIntegrations";
import { MarketingIntegrations } from "./admin/MarketingIntegrations";

const CHANNEL_ICONS = { site: Globe, messenger: MessageCircle, ad: Megaphone };

const MANAGED_CHANNELS: Record<string, string> = {
  Tilda: "tilda",
  Телефония: "telephony",
  VK: "vk",
  Avito: "avito",
  "Яндекс Директ": "yandex_direct",
  "Яндекс Метрика": "yandex_metrica",
};

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

type Props = {
  t: Record<string, string>;
  user: AuthUser;
  channels: Channel[];
  updateData: (patch: { channels: Channel[] }) => void;
  Btn: React.FC<BtnProps>;
  onSaved?: () => void;
};

export function ChannelsSettings({ t, user, channels, updateData, Btn, onSaved }: Props) {
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, boolean>>({});
  const canChannels = hasPermission(user, "channels.manage");
  const canIntegrate = hasPermission(user, "integrations.manage");
  const canMarketing = hasPermission(user, "marketing.manage");

  useEffect(() => {
    if (!canIntegrate && !canMarketing) return;
    api.getIntegrations().then((r) => {
      const map: Record<string, boolean> = { "Форма на сайте": true };
      for (const i of r.integrations) {
        for (const [chName, type] of Object.entries(MANAGED_CHANNELS)) {
          if (i.type === type) map[chName] = i.enabled;
        }
      }
      setIntegrationStatus(map);
    }).catch(() => {});
  }, [canIntegrate, canMarketing, channels]);

  function toggleSiteForm(id: string, name: string) {
    if (!canChannels || MANAGED_CHANNELS[name]) return;
    const ch = channels.map((c) => c.id === id ? { ...c, connected: !c.connected } : c);
    updateData({ channels: ch });
  }

  const groups = [{ key: "site" as const, title: "Сайт и телефония" }, { key: "messenger" as const, title: "Мессенджеры" }, { key: "ad" as const, title: "Реклама и аналитика" }];

  return (
    <div className="space-y-6">
      {!canChannels && !canIntegrate && !canMarketing && (
        <p className={`text-sm ${t.muted}`}>Нет прав на настройку каналов и интеграций.</p>
      )}

      {canChannels && (
        <>
          <p className={`text-sm ${t.muted}`}>Источники лидов. Подключённые каналы доступны в авто-ответах на этапах воронки.</p>
          {groups.map((g) => {
            const list = channels.filter((c) => c.type === g.key);
            const Icon = CHANNEL_ICONS[g.key];
            return (
              <div key={g.key}>
                <h3 className={`text-sm font-medium ${t.subtle} mb-2 flex items-center gap-2`}><Icon className="w-4 h-4 text-teal-600" /> {g.title}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((c) => {
                    const managed = Boolean(MANAGED_CHANNELS[c.name]);
                    const live = managed ? (integrationStatus[c.name] ?? false) : (integrationStatus[c.name] ?? c.connected);
                    const canConfigure = managed && (
                      (["Tilda", "Телефония"].includes(c.name) && canIntegrate)
                      || (["VK", "Avito", "Яндекс Директ", "Яндекс Метрика"].includes(c.name) && canMarketing)
                    );
                    return (
                      <div key={c.id} className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${live ? "bg-teal-50 dark:bg-teal-500/15 text-teal-600" : t.chip}`}><Icon className="w-4 h-4" /></span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className={`text-xs ${live ? "text-teal-600" : t.muted}`}>
                              {managed ? (live ? "Интеграция включена" : "Настройте ниже") : live ? "Активен" : "Выключен"}
                            </div>
                          </div>
                        </div>
                        {c.name === "Форма на сайте" && (
                          <button type="button" onClick={() => toggleSiteForm(c.id, c.name)}
                            className={`mt-3 w-11 h-6 rounded-full transition relative ${c.connected ? "bg-teal-500" : t.chip}`}>
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${c.connected ? "left-5" : "left-0.5"}`} />
                          </button>
                        )}
                        {canConfigure && (
                          <p className={`text-xs ${t.muted} mt-2`}>Настройка — в блоке ниже ↓</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {canMarketing && (
        <div className={canChannels || canIntegrate ? `pt-4 border-t ${t.border}` : ""}>
          <h2 className="font-semibold text-sm mb-4">Рекламные интеграции</h2>
          <MarketingIntegrations t={t} Btn={Btn} onSaved={onSaved} />
        </div>
      )}

      {canIntegrate && (
        <div className={(canChannels || canMarketing) ? `pt-4 border-t ${t.border}` : ""}>
          <h2 className="font-semibold text-sm mb-4">Сайт и телефония (Tilda, SIP)</h2>
          <AdminIntegrations t={t} Btn={Btn} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}
