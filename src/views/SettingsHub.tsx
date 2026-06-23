import { useEffect, useMemo, useState } from "react";
import { Settings, Shield, Plug, ListTree, Database, Sparkles } from "lucide-react";
import { hasAnyPermission, hasPermission, type AuthUser } from "../api/client";
import { useUiT } from "../lib/i18n-labels";
import { canAccessSettings } from "../lib/crm-nav";
import { AiSettings } from "./AiSettings";
import { AdminRoles } from "./admin/AdminRoles";
import { ChannelsSettings } from "./ChannelsSettings";
import { FieldsSettings } from "./FieldsSettings";
import { BackupSettings } from "./BackupSettings";

export { canAccessSettings } from "../lib/crm-nav";

export type SettingsTab = "fields" | "channels" | "roles" | "backup" | "ai";
type Tab = SettingsTab;

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

type Props = {
  t: Record<string, string>;
  user: AuthUser;
  data: {
    fields: import("@sdr-crm/api-client").Field[];
    channels: import("@sdr-crm/api-client").Channel[];
    pipelines?: import("@sdr-crm/api-client").Pipeline[];
    stages?: import("@sdr-crm/api-client").Stage[];
  };
  updateData: (patch: Record<string, unknown>) => void;
  reload?: () => void;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
  initialTab?: Tab;
};

function tabAllowed(user: AuthUser, tab: Tab): boolean {
  if (tab === "fields") return hasAnyPermission(user, ["fields.manage", "settings.manage"]);
  if (tab === "channels") return hasAnyPermission(user, ["channels.manage", "integrations.manage", "marketing.manage", "analytics.manage"]);
  if (tab === "roles") return hasPermission(user, "roles.manage");
  if (tab === "backup") return hasPermission(user, "settings.manage");
  if (tab === "ai") return hasAnyPermission(user, ["settings.manage", "integrations.manage", "analytics.manage"]);
  return false;
}

export function SettingsHub({ t, user, data, updateData, reload, Btn, TInput, Labeled, initialTab }: Props) {
  const { tr } = useUiT();
  const tabs = useMemo(() => {
    const list: { k: Tab; label: string; icon: typeof Settings }[] = [];
    if (tabAllowed(user, "channels")) list.push({ k: "channels", label: tr("tabChannelsIntegrations", undefined, "settings"), icon: Plug });
    if (tabAllowed(user, "ai")) list.push({ k: "ai", label: tr("tabAiShort", undefined, "settings"), icon: Sparkles });
    if (tabAllowed(user, "roles")) list.push({ k: "roles", label: tr("tabRolesRights", undefined, "settings"), icon: Shield });
    if (tabAllowed(user, "fields")) list.push({ k: "fields", label: tr("tabCardFields", undefined, "settings"), icon: ListTree });
    if (tabAllowed(user, "backup")) list.push({ k: "backup", label: tr("tabBackup", undefined, "settings"), icon: Database });
    return list;
  }, [user, tr]);

  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab && tabAllowed(user, initialTab)) return initialTab;
    return tabs[0]?.k ?? "channels";
  });

  useEffect(() => {
    if (initialTab && tabAllowed(user, initialTab)) setTab(initialTab);
    else if (initialTab === undefined && tabs[0]) setTab(tabs[0].k);
  }, [initialTab, user, tabs]);

  useEffect(() => {
    if (!tabs.some((x) => x.k === tab)) setTab(tabs[0]?.k ?? "channels");
  }, [tabs, tab]);

  if (!tabs.length) {
    return (
      <p className={`text-sm p-6 ${t.muted}`}>
        Нет доступа к настройкам организации. Личный профиль — по аватарке в шапке.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-teal-600" />
        <h2 className="font-semibold">{tr("settingsTitle", undefined, "settings")}</h2>
      </div>
      <p className={`text-xs ${t.muted}`}>Каналы, роли, поля и интеграции организации. Профиль и почта — по аватарке; конструкторы — в разделе «Реактор».</p>

      <div className="bio-glass-tabs flex gap-1 overflow-x-auto nice-scroll">
        {tabs.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => setTab(x.k)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
              tab === x.k ? "bio-tab-active" : t.muted
            }`}
          >
            <x.icon className="w-4 h-4" /> {x.label}
          </button>
        ))}
      </div>

      {tab === "fields" && tabAllowed(user, "fields") && (
        <FieldsSettings t={t} data={data} updateData={updateData} Btn={Btn} TInput={TInput} Labeled={Labeled} />
      )}
      {tab === "channels" && tabAllowed(user, "channels") && (
        <ChannelsSettings t={t} user={user} channels={data.channels} updateData={updateData} Btn={Btn} onSaved={reload}
          onOpenAiTab={() => setTab("ai")} />
      )}
      {tab === "ai" && tabAllowed(user, "ai") && (
        <AiSettings t={t} user={user} Btn={Btn} />
      )}
      {tab === "roles" && tabAllowed(user, "roles") && (
        <AdminRoles t={t} Btn={Btn} TInput={TInput} />
      )}
      {tab === "backup" && tabAllowed(user, "backup") && (
        <BackupSettings t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />
      )}
    </div>
  );
}
