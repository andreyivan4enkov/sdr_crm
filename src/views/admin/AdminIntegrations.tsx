import { useCallback, useEffect, useState } from "react";
import { Globe, Phone, Copy, RefreshCw, Shield, Code, Check, Link2, Power, Sparkles } from "lucide-react";
import { api } from "../../api/client";
import type { Integration, IntegrationEndpoints } from "@jbrealty/api-client";

const PROVIDERS = [
  { id: "beeline", label: "Билайн бизнес", hint: "Облачная АТС cloudpbx.beeline.ru — XSI Events, записи, исходящие" },
  { id: "generic", label: "Универсальный", hint: "JSON/form: phone, event, direction, call_id, recording_url" },
  { id: "mango", label: "Mango Office", hint: "События ВАТС Mango (call.start / call.finish)" },
  { id: "zadarma", label: "Zadarma", hint: "Webhook входящих/исходящих звонков Zadarma" },
  { id: "uis", label: "UIS / CoMagic", hint: "Webhook звонков UIS" },
  { id: "asterisk", label: "Asterisk / FreePBX", hint: "AMI/AGI webhook или generic payload" },
] as const;

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
    <div className={`mt-4 rounded-xl border-2 border-teal-400/60 bg-teal-50/80 dark:bg-teal-500/10 p-4 ${t.border}`}>
      <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">{title}</p>
      <p className={`text-xs ${t.muted} mt-1`}>{hint}</p>
      {value ? (
        <>
          <code className="block mt-3 text-xs break-all leading-relaxed select-all">{value}</code>
          <button type="button" onClick={copy}
            className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition">
            {ok ? <><Check className="w-4 h-4" /> Скопировано</> : <><Copy className="w-4 h-4" /> Скопировать</>}
          </button>
        </>
      ) : (
        <p className={`text-xs ${t.muted} mt-2`}>Нажмите «Включить» — URL сформируется автоматически</p>
      )}
    </div>
  );
}

function CopyRow({ label, value, muted }: { label: string; value: string; muted: string }) {
  const [ok, setOk] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  }
  return (
    <div className="mt-2">
      <span className={muted}>{label}</span>
      <div className="flex items-start gap-2 mt-0.5">
        <code className="text-xs break-all flex-1">{value}</code>
        <button type="button" onClick={copy} className="text-teal-600 shrink-0" title="Копировать">
          {ok ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
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

export function AdminIntegrations({ t, Btn, onSaved }: { t: Record<string, string>; Btn: React.FC<BtnProps>; onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [endpoints, setEndpoints] = useState<IntegrationEndpoints | null>(null);

  const [tildaEnabled, setTildaEnabled] = useState(false);
  const [tildaUrl, setTildaUrl] = useState("");
  const [tildaUrlSecret, setTildaUrlSecret] = useState("");
  const [mapping, setMapping] = useState("Name=name\nPhone=phone\nDate=preferredTime\nEmail=email\nComments=comment\npd_consent=pdConsent");

  const [telEnabled, setTelEnabled] = useState(false);
  const [telProvider, setTelProvider] = useState("generic");
  const [sipGateway, setSipGateway] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [callerId, setCallerId] = useState("");
  const [telUrl, setTelUrl] = useState("");
  const [telUrlSecret, setTelUrlSecret] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.openai.com/v1");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [autoFillLead, setAutoFillLead] = useState(false);
  const [recordingAuthHeader, setRecordingAuthHeader] = useState("");
  const [attachActiveDeal, setAttachActiveDeal] = useState(true);
  const [createOnUnknown, setCreateOnUnknown] = useState(true);
  const [ignorePhones, setIgnorePhones] = useState("");
  const [beelineEventUrl, setBeelineEventUrl] = useState("");
  const [beelineSubId, setBeelineSubId] = useState("");
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await api.getIntegrations();
      setBaseUrl(r.baseUrl);
      setEndpoints(r.endpoints);
      const ti = r.integrations.find((i) => i.type === "tilda");
      const tel = r.integrations.find((i) => i.type === "telephony");
      if (ti) {
        setTildaEnabled(ti.enabled);
        setTildaUrl(ti.webhookUrl || r.endpoints.tildaWebhook);
        setTildaUrlSecret(ti.webhookUrlWithSecret || "");
        const fm = ti.config?.fieldMapping as Record<string, string> | undefined;
        if (fm) setMapping(Object.entries(fm).map(([crm, tilda]) => `${tilda}=${crm}`).join("\n"));
      }
      if (tel) {
        setTelEnabled(tel.enabled);
        setTelProvider(String(tel.config?.provider || "beeline"));
        setSipGateway(String(tel.config?.sipGateway || ""));
        setCallerId(String(tel.config?.callerId || ""));
        setTelUrl(tel.webhookUrl || `${r.endpoints.telephonyWebhookPrefix}${tel.config?.provider || "beeline"}`);
        setTelUrlSecret(tel.webhookUrlWithSecret || "");
        setBeelineEventUrl(String((tel as { beelineEventUrl?: string }).beelineEventUrl || ""));
        setBeelineSubId(String(tel.config?.beelineSubscriptionId || ""));
        setAttachActiveDeal(tel.config?.callAttachActiveDeal !== false);
        setCreateOnUnknown(tel.config?.createLeadOnUnknownCall !== false);
        setIgnorePhones(Array.isArray(tel.config?.ignorePhones) ? (tel.config?.ignorePhones as string[]).join("\n") : "");
        setAiEnabled(Boolean(tel.config?.aiEnabled));
        setAiBaseUrl(String(tel.config?.aiBaseUrl || "https://api.openai.com/v1"));
        setAiModel(String(tel.config?.aiModel || "gpt-4o-mini"));
        setAutoTranscribe(tel.config?.autoTranscribe !== false);
        setAutoFillLead(Boolean(tel.config?.autoFillLead));
        setRecordingAuthHeader(String(tel.config?.recordingAuthHeader || ""));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function parseMapping() {
    const obj: Record<string, string> = {};
    for (const line of mapping.split("\n")) {
      const [from, to] = line.split("=").map((s) => s.trim());
      if (from && to) obj[to] = from;
    }
    return obj;
  }

  async function saveTilda(enable?: boolean) {
    setSaving("tilda"); setErr("");
    try {
      const r = await api.updateTilda({
        enabled: enable ?? tildaEnabled,
        fieldMapping: parseMapping(),
        consentField: "pd_consent",
      });
      setTildaEnabled(r.integration.enabled);
      setTildaUrl(r.webhookUrl);
      if (r.webhookUrlWithSecret) setTildaUrlSecret(r.webhookUrlWithSecret);
      onSaved?.();
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function rotateTildaSecret() {
    setSaving("tilda-rotate"); setErr("");
    try {
      const r = await api.updateTilda({ rotateSecret: true, fieldMapping: parseMapping(), enabled: tildaEnabled });
      if (r.webhookUrlWithSecret) setTildaUrlSecret(r.webhookUrlWithSecret);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function saveTelephony(enable?: boolean, provider?: string) {
    setSaving("tel"); setErr("");
    try {
      const p = provider ?? telProvider;
      const body: Record<string, unknown> = {
        enabled: enable ?? telEnabled,
        provider: p,
        sipGateway,
        callerId,
        aiEnabled,
        aiBaseUrl,
        aiModel,
        autoTranscribe,
        autoFillLead,
        recordingAuthHeader,
        callAttachActiveDeal: attachActiveDeal,
        createLeadOnUnknownCall: createOnUnknown,
        ignorePhones: ignorePhones.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (aiApiKey.trim()) body.aiApiKey = aiApiKey.trim();
      const r = await api.updateTelephony(body);
      setTelEnabled(r.integration.enabled);
      setTelProvider(r.provider || p);
      setTelUrl(r.webhookUrl);
      if (r.webhookUrlWithSecret) setTelUrlSecret(r.webhookUrlWithSecret);
      if (r.beelineEventUrl) setBeelineEventUrl(r.beelineEventUrl);
      if (r.beelineSubscriptionId) setBeelineSubId(r.beelineSubscriptionId);
      setApiKey("");
      setAiApiKey("");
      onSaved?.();
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function rotateTelSecret() {
    setSaving("tel-rotate"); setErr("");
    try {
      const r = await api.updateTelephony({ rotateSecret: true, enabled: telEnabled, provider: telProvider, sipGateway, callerId });
      if (r.webhookUrlWithSecret) setTelUrlSecret(r.webhookUrlWithSecret);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  async function subscribeBeeline() {
    setSaving("beeline-sub"); setErr("");
    try {
      await saveTelephony(true, "beeline");
      const r = await api.subscribeBeelineTelephony();
      setBeelineSubId(r.subscriptionId);
      setBeelineEventUrl(r.beelineEventUrl);
      setTelEnabled(true);
      onSaved?.();
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(""); }
  }

  const providerHint = PROVIDERS.find((p) => p.id === telProvider)?.hint || "";

  if (loading) return <p className={`text-sm ${t.muted}`}>Загрузка настроек…</p>;

  return (
    <div className="space-y-6">
      {err && <p className="text-sm text-rose-500 rounded-lg border border-rose-200 dark:border-rose-500/30 px-3 py-2">{err}</p>}

      <div className={`bio-card bio-glass-panel p-4 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Link2 className="w-4 h-4 text-teal-600" /> Базовый адрес CRM</h3>
        <p className={`text-xs ${t.muted} mt-1`}>Используется в webhook URL и публичном API</p>
        <code className="text-xs break-all block mt-2">{baseUrl}</code>
      </div>

      <div className={`bio-card bio-glass-panel p-4 ${t.surface} border-amber-300/50`}>
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Shield className="w-4 h-4 text-amber-600" /> 152-ФЗ</h3>
        <ul className={`text-xs ${t.subtle} mt-2 space-y-1 list-disc pl-4`}>
          <li>Tilda: чекбокс <code>pd_consent</code> в форме jbrealty.ru</li>
          <li>Запись звонков — отдельное согласие в политике</li>
          <li>Договор поручения с Tilda и оператором связи</li>
        </ul>
      </div>

      {/* TILDA */}
      <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-teal-600" /> Tilda · jbrealty.ru</h3>
          <StatusBadge enabled={tildaEnabled} />
        </div>
        <p className={`text-sm ${t.muted} mt-1`}>Скопируйте ссылку ниже → Tilda → <strong>Настройки сайта → Формы → Webhook</strong> → вставьте → опубликуйте сайт</p>

        <CopyBlock
          title="Вставьте в Tilda (готовая ссылка)"
          hint="Секрет уже внутри — собирать ничего не нужно"
          value={tildaUrlSecret}
          t={t}
        />

        <div className="flex flex-wrap gap-2 mt-4">
          <Btn t={t} onClick={() => saveTilda(true)} className="text-sm">
            <Power className="w-4 h-4" /> {saving === "tilda" ? "…" : tildaEnabled ? "Сохранить" : "Включить"}
          </Btn>
          {tildaEnabled && (
            <Btn t={t} variant="soft" onClick={() => saveTilda(false)} className="text-sm">Выключить</Btn>
          )}
          <Btn t={t} variant="soft" onClick={rotateTildaSecret} className="text-sm">
            <RefreshCw className="w-4 h-4" /> {saving === "tilda-rotate" ? "…" : "Новый секрет"}
          </Btn>
        </div>

        <details className="mt-4">
          <summary className={`text-xs ${t.muted} cursor-pointer hover:text-teal-600`}>Маппинг полей (обычно менять не нужно)</summary>
          <textarea value={mapping} onChange={(e) => setMapping(e.target.value)} rows={6}
            className={`w-full mt-2 rounded-lg border px-3 py-2 text-sm font-mono ${t.input}`} />
          <p className={`text-xs ${t.muted} mt-1`}>Поля jbrealty.ru: Name, Phone, Date. Согласие: pd_consent</p>
        </details>
      </div>

      {/* TELEPHONY */}
      <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2"><Phone className="w-4 h-4 text-teal-600" /> Телефония / SIP</h3>
          <StatusBadge enabled={telEnabled} />
        </div>
        <p className={`text-sm ${t.muted} mt-1`}>Входящие звонки, записи, расшифровка AI, журнал в CRM</p>

        <label className={`text-xs ${t.muted} block mt-4 mb-2`}>Провайдер ВАТС</label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" onClick={() => { setTelProvider(p.id); setTelUrl(`${endpoints?.telephonyWebhookPrefix || ""}${p.id}`); }}
              className={`text-left px-3 py-2 rounded-lg border text-sm transition ${telProvider === p.id ? "border-teal-400 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.hover}`}`}>
              <div className="font-medium">{p.label}</div>
              <div className={`text-xs ${t.muted} mt-0.5`}>{p.hint}</div>
            </button>
          ))}
        </div>

        <p className={`text-xs ${t.muted} mt-2`}>{providerHint}</p>

        {telProvider === "beeline" && (
          <div className={`mt-4 rounded-xl border-2 border-amber-300/60 bg-amber-50/50 dark:bg-amber-500/5 p-4 ${t.border}`}>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Подключение Билайн за 3 шага</p>
            <ol className={`text-xs ${t.subtle} mt-2 space-y-1.5 list-decimal pl-4`}>
              <li>В <a className="text-teal-600 hover:underline" href="https://cloudpbx.beeline.ru/" target="_blank" rel="noreferrer">cloudpbx.beeline.ru</a> → Настройки → API → включите «Интеграция по API» → создайте токен</li>
              <li>Вставьте токен и внутренний номер сотрудника ниже → «Сохранить»</li>
              <li>Нажмите «Подключить события» — CRM сам создаст подписку XSI-Events на входящие/исходящие</li>
            </ol>
            {beelineSubId && (
              <p className={`text-xs mt-2 text-teal-700 dark:text-teal-300`}>Подписка активна: <code>{beelineSubId}</code></p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <Btn t={t} onClick={subscribeBeeline} className="text-sm">
                <Power className="w-4 h-4" /> {saving === "beeline-sub" ? "Подключение…" : "Подключить события Билайн"}
              </Btn>
            </div>
            {beelineEventUrl && (
              <p className={`text-xs ${t.muted} mt-2`}>Билайн шлёт события на: <code className="break-all">{beelineEventUrl}</code></p>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`text-xs ${t.muted}`}>{telProvider === "beeline" ? "SIP-шлюз Билайн" : "SIP-шлюз (для софтфона)"}</label>
            <input value={sipGateway} onChange={(e) => setSipGateway(e.target.value)} placeholder={telProvider === "beeline" ? "ip.beeline.ru" : "sip.mango-office.ru"}
              className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
            <p className={`text-xs ${t.muted} mt-1`}>Для софтфона: <code>sip:номер@шлюз</code></p>
          </div>
          <div>
            <label className={`text-xs ${t.muted}`}>{telProvider === "beeline" ? "Внутренний номер / ID абонента" : "Caller ID / внутренний номер"}</label>
            <input value={callerId} onChange={(e) => setCallerId(e.target.value)} placeholder={telProvider === "beeline" ? "101 или userId из АТС" : "101"}
              className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
          </div>
          <div className="sm:col-span-2">
            <label className={`text-xs ${t.muted}`}>{telProvider === "beeline" ? "API-токен Билайн (X-MPBX-API-AUTH-TOKEN)" : "API-ключ провайдера"}</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={telEnabled ? "•••••••• (оставьте пустым, чтобы не менять)" : "Токен из личного кабинета АТС"}
              className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
          </div>
        </div>

        <div className={`mt-5 pt-5 border-t ${t.border}`}>
          <h4 className="font-medium text-sm">Привязка звонков к карточкам</h4>
          <p className={`text-xs ${t.muted} mt-1`}>Без дублей: повторные звонки с одного номера попадают в ту же сделку</p>
          <div className="flex flex-col gap-2 mt-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={attachActiveDeal} onChange={(e) => setAttachActiveDeal(e.target.checked)} className="accent-teal-600 mt-0.5" />
              <span>Цеплять к <strong>активной</strong> сделке (не на этапах «Сделка» / «Отказ»)</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={!attachActiveDeal} onChange={(e) => setAttachActiveDeal(!e.target.checked)} className="accent-teal-600 mt-0.5" />
              <span>Обратная настройка: всегда к последней карточке по номеру (даже если закрыта)</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={createOnUnknown} onChange={(e) => setCreateOnUnknown(e.target.checked)} className="accent-teal-600 mt-0.5" />
              <span>Создавать карточку, если номера ещё нет в CRM</span>
            </label>
          </div>
          <div className="mt-3">
            <label className={`text-xs ${t.muted}`}>Игнорировать номера (по одному в строке)</label>
            <textarea value={ignorePhones} onChange={(e) => setIgnorePhones(e.target.value)} rows={2} placeholder="88007007335 — служебные"
              className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm font-mono ${t.input}`} />
          </div>
        </div>

        <div className={`mt-5 pt-5 border-t ${t.border}`}>
          <h4 className="font-medium text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" /> AI: расшифровка и автозаполнение</h4>
          <p className={`text-xs ${t.muted} mt-1`}>OpenAI-совместимый API (Whisper + GPT). Ключ можно задать в <code>OPENAI_API_KEY</code> на сервере.</p>
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="accent-teal-600" />
            Включить AI для записей звонков
          </label>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className={`text-xs ${t.muted}`}>API-ключ AI</label>
              <input value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} placeholder={aiEnabled ? "sk-… (оставьте пустым, чтобы не менять)" : "sk-…"}
                className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
            </div>
            <div>
              <label className={`text-xs ${t.muted}`}>Base URL API</label>
              <input value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1"
                className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
            </div>
            <div>
              <label className={`text-xs ${t.muted}`}>Модель для извлечения полей</label>
              <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o-mini"
                className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
            </div>
            <div>
              <label className={`text-xs ${t.muted}`}>Заголовок для скачивания записи</label>
              <input value={recordingAuthHeader} onChange={(e) => setRecordingAuthHeader(e.target.value)} placeholder="Authorization: Bearer …"
                className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoTranscribe} onChange={(e) => setAutoTranscribe(e.target.checked)} className="accent-teal-600" />
              Авто-расшифровка после звонка
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoFillLead} onChange={(e) => setAutoFillLead(e.target.checked)} className="accent-teal-600" />
              Авто-заполнение карточки (без подтверждения)
            </label>
          </div>
        </div>

        <CopyBlock
          title={telProvider === "beeline" ? "Webhook CRM (для справки)" : "Вставьте в личный кабинет ВАТС"}
          hint={telProvider === "beeline" ? "Для Билайн используйте кнопку «Подключить события» — подписка создаётся автоматически" : "Секрет уже внутри ссылки"}
          value={telProvider === "beeline" ? (beelineEventUrl || telUrlSecret) : telUrlSecret}
          t={t}
        />

        <div className="flex flex-wrap gap-2 mt-4">
          <Btn t={t} onClick={() => saveTelephony(true)} className="text-sm">
            <Power className="w-4 h-4" /> {saving === "tel" ? "…" : telEnabled ? "Сохранить" : "Включить и сохранить"}
          </Btn>
          {telEnabled && <Btn t={t} variant="soft" onClick={() => saveTelephony(false)} className="text-sm">Выключить</Btn>}
          <Btn t={t} variant="soft" onClick={rotateTelSecret} className="text-sm">
            <RefreshCw className="w-4 h-4" /> {saving === "tel-rotate" ? "…" : "Новый секрет"}
          </Btn>
        </div>
      </div>

      {/* PUBLIC API */}
      <div className={`bio-card bio-glass-panel p-5 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold flex items-center gap-2"><Code className="w-4 h-4 text-teal-600" /> Публичное API</h3>
        <p className={`text-sm ${t.muted} mt-1`}>Для кастомных форм и внешних сервисов (без Tilda)</p>
        {endpoints && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${t.soft}`}>
            <CopyRow label="Создать лид (POST JSON):" value={endpoints.publicLeads} muted={t.muted} />
            <CopyRow label="Отзыв согласия ПДн:" value={endpoints.publicRevoke} muted={t.muted} />
            <CopyRow label="Политика конфиденциальности:" value={endpoints.privacy} muted={t.muted} />
            <CopyRow label="SSE-события (входящие звонки):" value={endpoints.eventsStream} muted={t.muted} />
          </div>
        )}
        <pre className={`mt-3 p-3 rounded-lg text-xs overflow-x-auto ${t.chip}`}>{`curl -X POST '${endpoints?.publicLeads || ""}' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Иван","phone":"+79001234567","pdConsent":true}'`}</pre>
        <p className={`text-xs ${t.muted} mt-2`}>Поля: name, phone, region, preferredTime, comment, pdConsent (обязательно true)</p>
      </div>
    </div>
  );
}
