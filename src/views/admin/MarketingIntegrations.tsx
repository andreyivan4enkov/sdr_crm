import { useCallback, useEffect, useState } from "react";
import { BarChart3, Copy, Megaphone, MessageCircle, Power, RefreshCw, ShoppingBag, Check } from "lucide-react";
import { api } from "../../api/client";
import type { Integration } from "@sdr-crm/api-client";

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

function CopyBlock({ title, hint, value, t }: { title: string; hint: string; value: string; t: Record<string, string> }) {
  const [ok, setOk] = useState(false);
  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <div className={`mt-3 rounded-xl border p-3 ${t.border} ${t.surface}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className={`text-xs ${t.muted} mt-0.5`}>{hint}</p>
      {value ? (
        <>
          <code className="block mt-2 text-xs break-all select-all">{value}</code>
          <button type="button" onClick={copy}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline">
            {ok ? <><Check className="w-3.5 h-3.5" /> Скопировано</> : <><Copy className="w-3.5 h-3.5" /> Копировать URL</>}
          </button>
        </>
      ) : (
        <p className={`text-xs ${t.muted} mt-2`}>Включите интеграцию — URL появится автоматически</p>
      )}
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
      {enabled ? "Включено" : "Выключено"}
    </span>
  );
}

type CardState = {
  enabled: boolean;
  webhookUrlSecret: string;
  [key: string]: string | boolean;
};

const DEFAULTS: Record<string, CardState> = {
  vk: { enabled: false, webhookUrlSecret: "", groupId: "", accessToken: "" },
  yandex_direct: { enabled: false, webhookUrlSecret: "", clientLogin: "", token: "", accountId: "" },
  yandex_metrica: { enabled: false, counterId: "", oauthToken: "", siteUrl: "" },
  avito: { enabled: false, webhookUrlSecret: "", clientId: "", clientSecret: "", userId: "" },
};

export function MarketingIntegrations({ t, Btn, onSaved }: { t: Record<string, string>; Btn: React.FC<BtnProps>; onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState("");
  const [state, setState] = useState(DEFAULTS);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await api.getIntegrations();
      const next = { ...DEFAULTS };
      for (const i of r.integrations) {
        if (!(i.type in next)) continue;
        const cfg = i.config || {};
        next[i.type] = {
          enabled: i.enabled,
          webhookUrlSecret: i.webhookUrlWithSecret || "",
          groupId: String(cfg.groupId || ""),
          accessToken: "",
          clientLogin: String(cfg.clientLogin || ""),
          token: "",
          accountId: String(cfg.accountId || ""),
          counterId: String(cfg.counterId || ""),
          oauthToken: "",
          siteUrl: String(cfg.siteUrl || ""),
          clientId: String(cfg.clientId || ""),
          clientSecret: "",
          userId: String(cfg.userId || ""),
        };
      }
      setState(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveVk(enable?: boolean) {
    setSaving("vk"); setErr("");
    try {
      const s = state.vk;
      const r = await api.updateVk({
        enabled: enable ?? s.enabled,
        groupId: s.groupId,
        ...(String(s.accessToken).trim() ? { accessToken: s.accessToken } : {}),
      });
      applyResult("vk", r);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function saveDirect(enable?: boolean) {
    setSaving("direct"); setErr("");
    try {
      const s = state.yandex_direct;
      const r = await api.updateYandexDirect({
        enabled: enable ?? s.enabled,
        clientLogin: s.clientLogin,
        accountId: s.accountId,
        ...(String(s.token).trim() ? { token: s.token } : {}),
      });
      applyResult("yandex_direct", r);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function saveMetrica(enable?: boolean) {
    setSaving("metrica"); setErr("");
    try {
      const s = state.yandex_metrica;
      const r = await api.updateYandexMetrica({
        enabled: enable ?? s.enabled,
        counterId: s.counterId,
        siteUrl: s.siteUrl,
        ...(String(s.oauthToken).trim() ? { oauthToken: s.oauthToken } : {}),
      });
      setState((prev) => ({
        ...prev,
        yandex_metrica: { ...prev.yandex_metrica, enabled: r.integration.enabled },
      }));
      onSaved?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function saveAvito(enable?: boolean) {
    setSaving("avito"); setErr("");
    try {
      const s = state.avito;
      const r = await api.updateAvito({
        enabled: enable ?? s.enabled,
        clientId: s.clientId,
        userId: s.userId,
        ...(String(s.clientSecret).trim() ? { clientSecret: s.clientSecret } : {}),
      });
      applyResult("avito", r);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  function applyResult(key: string, r: { integration: Integration; webhookUrlWithSecret?: string }) {
    setState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled: r.integration.enabled,
        webhookUrlSecret: r.webhookUrlWithSecret || prev[key].webhookUrlSecret,
      },
    }));
    onSaved?.();
  }

  async function rotate(type: "vk" | "yandex_direct" | "avito") {
    setSaving(`rotate-${type}`);
    try {
      const fn = type === "vk" ? api.updateVk : type === "avito" ? api.updateAvito : api.updateYandexDirect;
      const r = await fn({ rotateSecret: true, enabled: state[type].enabled });
      applyResult(type, r);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  function field(type: keyof typeof state, key: string, label: string, placeholder?: string) {
    return (
      <div>
        <label className={`text-xs ${t.muted}`}>{label}</label>
        <input
          value={String(state[type][key] || "")}
          onChange={(e) => setState((prev) => ({ ...prev, [type]: { ...prev[type], [key]: e.target.value } }))}
          placeholder={placeholder}
          className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`}
        />
      </div>
    );
  }

  if (loading) return <p className={`text-sm ${t.muted}`}>Загрузка…</p>;

  return (
    <div className="space-y-5">
      {err && <p className="text-sm text-rose-500 rounded-lg border border-rose-200 px-3 py-2">{err}</p>}
      <p className={`text-sm ${t.muted}`}>
        Подключение рекламных каналов. Webhook принимает заявки в формате JSON: <code>name</code>, <code>phone</code>, <code>email</code>, <code>comment</code>, <code>pd_consent</code>.
      </p>

      {/* VK */}
      <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm"><MessageCircle className="w-4 h-4 text-sky-600" /> ВКонтакте</h3>
          <StatusBadge enabled={state.vk.enabled} />
        </div>
        <p className={`text-xs ${t.muted} mt-1`}>Лид-формы, сообщения сообщества. Укажите ID группы и ключ доступа.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {field("vk", "groupId", "ID сообщества VK")}
          {field("vk", "accessToken", "Ключ доступа (оставьте пустым, чтобы не менять)", "vk1.a…")}
        </div>
        <CopyBlock title="Webhook для VK" hint="Вставьте в Callback API → Адрес сервера" value={state.vk.webhookUrlSecret} t={t} />
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn t={t} onClick={() => saveVk(true)} className="text-sm"><Power className="w-4 h-4" /> {saving === "vk" ? "…" : "Сохранить"}</Btn>
          {state.vk.enabled && <Btn t={t} variant="soft" onClick={() => saveVk(false)} className="text-sm">Выключить</Btn>}
          <Btn t={t} variant="ghost" onClick={() => rotate("vk")} className="text-sm"><RefreshCw className="w-4 h-4" /> Новый секрет</Btn>
        </div>
      </div>

      {/* Yandex Direct */}
      <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm"><Megaphone className="w-4 h-4 text-amber-600" /> Яндекс Директ</h3>
          <StatusBadge enabled={state.yandex_direct.enabled} />
        </div>
        <p className={`text-xs ${t.muted} mt-1`}>OAuth-токен и логин рекламодателя. Webhook — для заявок с лендингов Директа.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {field("yandex_direct", "clientLogin", "Логин в Директе")}
          {field("yandex_direct", "accountId", "ID рекламного кабинета")}
          {field("yandex_direct", "token", "OAuth-токен", "y0_…")}
        </div>
        <CopyBlock title="Webhook для заявок" hint="Подключите в настройках формы / внешнего сервиса" value={state.yandex_direct.webhookUrlSecret} t={t} />
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn t={t} onClick={() => saveDirect(true)} className="text-sm"><Power className="w-4 h-4" /> Сохранить</Btn>
          {state.yandex_direct.enabled && <Btn t={t} variant="soft" onClick={() => saveDirect(false)} className="text-sm">Выключить</Btn>}
          <Btn t={t} variant="ghost" onClick={() => rotate("yandex_direct")} className="text-sm"><RefreshCw className="w-4 h-4" /> Новый секрет</Btn>
        </div>
      </div>

      {/* Yandex Metrica */}
      <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-red-600" /> Яндекс Метрика</h3>
          <StatusBadge enabled={state.yandex_metrica.enabled} />
        </div>
        <p className={`text-xs ${t.muted} mt-1`}>Счётчик на example.com. OAuth-токен — для API отчётов (опционально).</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {field("yandex_metrica", "counterId", "Номер счётчика")}
          {field("yandex_metrica", "siteUrl", "Сайт", "https://example.com")}
          {field("yandex_metrica", "oauthToken", "OAuth-токен API", "y0_…")}
        </div>
        {state.yandex_metrica.counterId && (
          <p className={`text-xs mt-3 ${t.muted}`}>
            Отчёты: <a className="text-teal-600 hover:underline" href={`https://metrika.yandex.ru/dashboard?id=${state.yandex_metrica.counterId}`} target="_blank" rel="noreferrer">открыть в Метрике ↗</a>
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn t={t} onClick={() => saveMetrica(true)} className="text-sm"><Power className="w-4 h-4" /> Сохранить</Btn>
          {state.yandex_metrica.enabled && <Btn t={t} variant="soft" onClick={() => saveMetrica(false)} className="text-sm">Выключить</Btn>}
        </div>
      </div>

      {/* Avito */}
      <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm"><ShoppingBag className="w-4 h-4 text-emerald-600" /> Авито</h3>
          <StatusBadge enabled={state.avito.enabled} />
        </div>
        <p className={`text-xs ${t.muted} mt-1`}>Client ID и Secret из кабинета разработчика Авито. Webhook — для входящих обращений.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {field("avito", "clientId", "Client ID")}
          {field("avito", "userId", "User ID профиля")}
          {field("avito", "clientSecret", "Client Secret", "оставьте пустым, чтобы не менять")}
        </div>
        <CopyBlock title="Webhook для Авито" hint="URL для уведомлений о сообщениях / звонках" value={state.avito.webhookUrlSecret} t={t} />
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn t={t} onClick={() => saveAvito(true)} className="text-sm"><Power className="w-4 h-4" /> Сохранить</Btn>
          {state.avito.enabled && <Btn t={t} variant="soft" onClick={() => saveAvito(false)} className="text-sm">Выключить</Btn>}
          <Btn t={t} variant="ghost" onClick={() => rotate("avito")} className="text-sm"><RefreshCw className="w-4 h-4" /> Новый секрет</Btn>
        </div>
      </div>
    </div>
  );
}
