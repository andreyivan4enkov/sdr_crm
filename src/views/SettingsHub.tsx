import { useEffect, useMemo, useState } from "react";
import { Settings, Shield, Plug, ListTree, Lock, Bell, Database, User, GitBranch } from "lucide-react";
import { hasAnyPermission, hasPermission, type AuthUser } from "../api/client";
import { AdminRoles } from "./admin/AdminRoles";
import { ChannelsSettings } from "./ChannelsSettings";
import { FieldsSettings } from "./FieldsSettings";
import { TotpSettings } from "./TotpSettings";
import { PasswordSettings } from "./PasswordSettings";
import { ProfileSettings } from "./ProfileSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { NotificationSettings } from "./NotificationSettings";
import { BackupSettings } from "./BackupSettings";
import { PipelinesSettings } from "./PipelinesSettings";

export const SETTINGS_ACCESS_PERMS = [
  "fields.manage", "settings.manage", "channels.manage", "integrations.manage", "marketing.manage", "roles.manage",
] as const;

export function canAccessSettings(user: AuthUser | null) {
  return hasAnyPermission(user, [...SETTINGS_ACCESS_PERMS]);
}

type Tab = "profile" | "pipelines" | "fields" | "channels" | "roles" | "notifications" | "security" | "backup";

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

type Props = {
  t: Record<string, string>;
  user: AuthUser;
  data: {
    fields: { id: string; label: string; type: string }[];
    channels: import("@sdr-crm/api-client").Channel[];
    pipelines?: import("@sdr-crm/api-client").Pipeline[];
  };
  updateData: (patch: Record<string, unknown>) => void;
  reload?: () => void;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
  initialTab?: Tab;
};

function tabAllowed(user: AuthUser, tab: Tab): boolean {
  if (tab === "profile") return true;
  if (tab === "pipelines") return hasPermission(user, "stages.manage");
  if (tab === "fields") return hasAnyPermission(user, ["fields.manage", "settings.manage"]);
  if (tab === "channels") return hasAnyPermission(user, ["channels.manage", "integrations.manage", "marketing.manage"]);
  if (tab === "roles") return hasPermission(user, "roles.manage");
  if (tab === "notifications" || tab === "security") return true;
  if (tab === "backup") return hasPermission(user, "settings.manage");
  return false;
}

export function SettingsHub({ t, user, data, updateData, reload, Btn, TInput, Labeled, initialTab }: Props) {
  const tabs = useMemo(() => {
    const list: { k: Tab; label: string; icon: typeof Settings }[] = [];
    list.push({ k: "profile", label: "Мой профиль", icon: User });
    if (tabAllowed(user, "channels")) list.push({ k: "channels", label: "Каналы и интеграции", icon: Plug });
    if (tabAllowed(user, "roles")) list.push({ k: "roles", label: "Роли и права", icon: Shield });
    if (tabAllowed(user, "pipelines")) list.push({ k: "pipelines", label: "Воронки", icon: GitBranch });
    if (tabAllowed(user, "fields")) list.push({ k: "fields", label: "Поля карточки", icon: ListTree });
    if (tabAllowed(user, "backup")) list.push({ k: "backup", label: "Резервные копии", icon: Database });
    list.push({ k: "notifications", label: "Уведомления", icon: Bell });
    list.push({ k: "security", label: "Безопасность", icon: Lock });
    return list;
  }, [user]);

  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab && tabAllowed(user, initialTab)) return initialTab;
    return tabs[0]?.k ?? "profile";
  });

  useEffect(() => {
    if (initialTab && tabAllowed(user, initialTab)) setTab(initialTab);
    else if (initialTab === undefined) setTab(tabs[0]?.k ?? "profile");
  }, [initialTab, user, tabs]);

  useEffect(() => {
    if (!tabs.some((x) => x.k === tab)) setTab(tabs[0]?.k ?? "profile");
  }, [tabs, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-teal-600" />
        <h2 className="font-semibold">Настройки CRM</h2>
      </div>

      <div className="bio-glass-tabs flex gap-1 overflow-x-auto nice-scroll">
        {tabs.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => setTab(x.k)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition ${
              tab === x.k ? `${t.surface} shadow-sm font-medium ${t.text}` : t.muted
            }`}
          >
            <x.icon className="w-4 h-4" /> {x.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-6">
          <AppearanceSettings t={t} />
          <ProfileSettings t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />
        </div>
      )}
      {tab === "pipelines" && tabAllowed(user, "pipelines") && (
        <PipelinesSettings
          t={t}
          pipelines={data.pipelines || []}
          updateData={updateData}
          reload={reload}
          Btn={Btn}
          TInput={TInput}
          Labeled={Labeled}
        />
      )}
      {tab === "fields" && tabAllowed(user, "fields") && (
        <FieldsSettings t={t} data={data} updateData={updateData} Btn={Btn} TInput={TInput} Labeled={Labeled} />
      )}
      {tab === "channels" && tabAllowed(user, "channels") && (
        <ChannelsSettings t={t} user={user} channels={data.channels} updateData={updateData} Btn={Btn} onSaved={reload} />
      )}
      {tab === "roles" && tabAllowed(user, "roles") && (
        <AdminRoles t={t} Btn={Btn} TInput={TInput} />
      )}
      {tab === "notifications" && (
        <NotificationSettings t={t} Btn={Btn} />
      )}
      {tab === "security" && (
        <div className="space-y-4">
          <PasswordSettings t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />
          <TotpSettings t={t} Btn={Btn} TInput={TInput} />
        </div>
      )}
      {tab === "backup" && tabAllowed(user, "backup") && (
        <BackupSettings t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />
      )}
    </div>
  );
}
