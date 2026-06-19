import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, RefreshCw, Smartphone } from "lucide-react";
import type { NotificationPrefs } from "@sdr-crm/api-client";
import { api } from "../api/client";
import { usePushNotifications } from "../hooks/usePushNotifications";

type BtnProps = { children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string };

const DEFAULT_SETTINGS: NotificationPrefs = {
  pushEnabled: false,
  inAppEnabled: true,
  incomingCall: true,
  newLead: true,
  stageNotify: true,
  callTranscript: true,
  callRecording: true,
  taskAssigned: true,
  taskUpdated: true,
  taskDue: true,
};

const TOGGLES: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "inAppEnabled", label: "Уведомления в CRM", hint: "Колокольчик и всплывающие тосты" },
  { key: "incomingCall", label: "Входящие и исходящие звонки", hint: "Когда ВАТС присылает событие звонка" },
  { key: "callRecording", label: "Записи разговоров", hint: "Когда доступна ссылка на запись" },
  { key: "callTranscript", label: "Готовая расшифровка", hint: "После AI-обработки записи" },
  { key: "newLead", label: "Новые заявки", hint: "Форма, Tilda, публичный API" },
  { key: "stageNotify", label: "Автоматизации этапов", hint: "Уведомления из воронки" },
  { key: "taskAssigned", label: "Назначение задач", hint: "Когда вас ставят исполнителем или соисполнителем" },
  { key: "taskUpdated", label: "Изменения в задачах", hint: "Обновления по вашим задачам" },
  { key: "taskDue", label: "Сроки задач", hint: "Напоминание за час и при просрочке" },
];

export function NotificationSettings({ t, Btn }: { t: Record<string, string>; Btn: React.FC<BtnProps> }) {
  const [settings, setSettings] = useState<NotificationPrefs | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const push = usePushNotifications(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.getNotificationSettings();
      setSettings(r.settings);
      setPushAvailable(r.pushAvailable);
    } catch (e) {
      setErr((e as Error).message || "Не удалось загрузить настройки");
      setSettings(DEFAULT_SETTINGS);
      setPushAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<NotificationPrefs>) {
    if (!settings) return;
    setSaving(true);
    setErr("");
    try {
      const r = await api.updateNotificationSettings(patch);
      setSettings(r.settings);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePush() {
    if (push.subscribed) {
      await push.unsubscribe();
      await save({ pushEnabled: false });
    } else {
      const ok = await push.subscribe();
      if (ok) await save({ pushEnabled: true });
    }
  }

  if (loading || !settings) {
    return <p className={`text-sm ${t.muted}`}>Загрузка…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-teal-600" />
          <h2 className="font-semibold">Уведомления</h2>
        </div>
        {err && (
          <button type="button" onClick={load} className={`text-xs flex items-center gap-1 ${t.muted} hover:text-teal-600`}>
            <RefreshCw className="w-3.5 h-3.5" /> Повторить
          </button>
        )}
      </div>

      {err && (
        <p className="text-sm text-amber-600 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-500/30 px-3 py-2">
          {err}. Показаны настройки по умолчанию — сохранение может не сработать до исправления на сервере.
        </p>
      )}

      <p className={`text-sm ${t.muted}`}>
        Выберите, о чём сообщать в CRM и на телефон (push), даже когда вкладка закрыта.
      </p>

      <div className={`bio-card bio-glass-panel p-4 ${t.surface} ${t.border}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm flex items-center gap-2"><Smartphone className="w-4 h-4 text-teal-600" /> Push на устройство</p>
            <p className={`text-xs ${t.muted} mt-1`}>
              {pushAvailable
                ? "Работает в Chrome/Safari после добавления CRM на экран «Домой»"
                : "На сервере не заданы VAPID-ключи — push недоступен"}
            </p>
            {push.error && <p className="text-xs text-rose-500 mt-1">{push.error}</p>}
          </div>
          {pushAvailable && push.supported && (
            <Btn t={t} variant={push.subscribed ? "ghost" : "soft"} onClick={togglePush}>
              {push.subscribed ? <><BellOff className="w-4 h-4" /> Отключить</> : <><Bell className="w-4 h-4" /> Включить push</>}
            </Btn>
          )}
        </div>
      </div>

      <div className={`rounded-xl border divide-y ${t.surface} ${t.border} ${t.divide}`}>
        {TOGGLES.map((row) => (
          <label key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-medium">{row.label}</div>
              <div className={`text-xs ${t.muted}`}>{row.hint}</div>
            </div>
            <input
              type="checkbox"
              checked={settings[row.key]}
              disabled={saving || (row.key !== "inAppEnabled" && !settings.inAppEnabled)}
              onChange={(e) => save({ [row.key]: e.target.checked })}
              className="w-5 h-5 rounded accent-teal-600"
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Push-уведомления</div>
            <div className={`text-xs ${t.muted}`}>Дублировать выбранные события на телефон</div>
          </div>
          <input
            type="checkbox"
            checked={settings.pushEnabled}
            disabled={saving || !push.subscribed}
            onChange={(e) => save({ pushEnabled: e.target.checked })}
            className="w-5 h-5 rounded accent-teal-600"
          />
        </label>
      </div>
    </div>
  );
}
