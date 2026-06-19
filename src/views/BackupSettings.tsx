import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Database, Download, HardDrive, RefreshCw, Save } from "lucide-react";
import type { BackupConfig, BackupStatus } from "@sdr-crm/api-client";
import { api } from "../api/client";

type BtnProps = {
  children: React.ReactNode;
  onClick: () => void;
  t: Record<string, string>;
  variant?: string;
  className?: string;
};

type LabeledProps = {
  label: string;
  t: Record<string, string>;
  children: React.ReactNode;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

export function BackupSettings({
  t,
  Btn,
  TInput,
  Labeled,
}: {
  t: Record<string, string>;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }>;
  Labeled: React.FC<LabeledProps>;
}) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [config, setConfig] = useState<BackupConfig>({
    remoteEnabled: false,
    remoteUrl: "",
    retentionDays: 14,
    alertWebhook: "",
  });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    const data = await api.getBackupStatus();
    setStatus(data);
    setConfig(data.config);
  }, []);

  useEffect(() => {
    reload()
      .catch((e) => setErr((e as Error).message || "Не удалось загрузить настройки бэкапа"))
      .finally(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return <p className={`text-sm ${t.muted}`}>Загрузка резервного копирования…</p>;
  }

  if (!status?.supported) {
    return (
      <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" /> Резервные копии
        </h3>
        <p className={`text-sm ${t.muted} mt-2`}>
          Доступно только на production-сервере с PostgreSQL. В локальной разработке используйте{" "}
          <code className="text-xs">npm run db:backup</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" /> Резервные копии БД
        </h3>
        <p className={`text-sm ${t.muted} mt-1`}>
          {status.schedule}. Каталог: <code className="text-xs">{status.backupDir}</code>
        </p>

        {err && <p className="text-sm text-rose-500 mt-3">{err}</p>}
        {msg && <p className="text-sm text-teal-600 mt-3">{msg}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            t={t}
            onClick={async () => {
              setBusy("run");
              setErr("");
              setMsg("");
              try {
                const r = await api.runBackup();
                setMsg(r.latest ? `Создан бэкап: ${r.latest.name}` : "Бэкап выполнен");
                await reload();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
            className={busy === "run" ? "opacity-60 pointer-events-none" : ""}
          >
            <RefreshCw className={`w-4 h-4 inline mr-1 ${busy === "run" ? "animate-spin" : ""}`} />
            Создать бэкап сейчас
          </Btn>
          <Btn
            t={t}
            variant="ghost"
            onClick={async () => {
              setBusy("sync");
              setErr("");
              setMsg("");
              try {
                await api.runBackupSync();
                setMsg("Выгрузка на удалённый сервер выполнена");
                await reload();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
            className={busy === "sync" ? "opacity-60 pointer-events-none" : ""}
          >
            <CloudUpload className="w-4 h-4 inline mr-1" /> Выгрузить off-site
          </Btn>
          <Btn t={t} variant="ghost" onClick={() => { setErr(""); reload().catch((e) => setErr((e as Error).message)); }}>
            Обновить список
          </Btn>
        </div>

        {status.latest && (
          <p className={`text-xs ${t.muted} mt-3`}>
            Последний: <strong>{status.latest.name}</strong> — {fmtBytes(status.latest.size)}, {fmtDate(status.latest.mtime)}
          </p>
        )}
      </div>

      <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-teal-600" /> Автовыгрузка и хранение
        </h3>
        <p className={`text-sm ${t.muted} mt-1`}>
          Настройки применяются к ежедневному бэкапу (03:00) и ручному запуску из CRM.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={config.remoteEnabled}
              onChange={(e) => setConfig({ ...config, remoteEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            Автовыгрузка на удалённый сервер (rsync)
          </label>

          <Labeled t={t} label="Адрес rsync">
            <p className={`text-xs ${t.muted} mb-1`}>
              Формат: user@host:/path/to/backups/crm — на сервере CRM должен быть SSH-ключ
            </p>
            <TInput
              t={t}
              value={config.remoteUrl}
              onChange={(v) => setConfig({ ...config, remoteUrl: v })}
              placeholder="backup@storage.example:/backups/crm"
            />
          </Labeled>

          <Labeled t={t} label="Хранить локально (дней)">
            <p className={`text-xs ${t.muted} mb-1`}>От 3 до 90 дней</p>
            <TInput
              t={t}
              value={String(config.retentionDays)}
              onChange={(v) => setConfig({ ...config, retentionDays: Math.min(90, Math.max(3, Number(v) || 14)) })}
            />
          </Labeled>

          <Labeled t={t} label="Webhook при ошибке (необязательно)">
            <p className={`text-xs ${t.muted} mb-1`}>Slack или Telegram bot URL</p>
            <TInput
              t={t}
              value={config.alertWebhook}
              onChange={(v) => setConfig({ ...config, alertWebhook: v })}
              placeholder="https://..."
            />
          </Labeled>

          <Btn
            t={t}
            onClick={async () => {
              setBusy("save");
              setErr("");
              setMsg("");
              try {
                const r = await api.updateBackupConfig(config);
                setConfig(r.config);
                setMsg("Настройки бэкапа сохранены");
                await reload();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
            className={busy === "save" ? "opacity-60 pointer-events-none" : ""}
          >
            <Save className="w-4 h-4 inline mr-1" /> Сохранить настройки
          </Btn>
        </div>
      </div>

      <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
        <h3 className="font-semibold text-sm">Архив бэкапов</h3>
        {status.backups.length === 0 ? (
          <p className={`text-sm ${t.muted} mt-2`}>Пока нет файлов. Запустите первый бэкап вручную.</p>
        ) : (
          <div className="mt-3 overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs ${t.muted} border-b ${t.border}`}>
                  <th className="py-2 pr-3">Файл</th>
                  <th className="py-2 pr-3">Размер</th>
                  <th className="py-2 pr-3">Дата</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {status.backups.map((b) => (
                  <tr key={b.name} className={`border-b ${t.border}`}>
                    <td className="py-2 pr-3 font-mono text-xs">{b.name}</td>
                    <td className="py-2 pr-3">{fmtBytes(b.size)}</td>
                    <td className="py-2 pr-3">{fmtDate(b.mtime)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-teal-600 hover:underline text-xs"
                        onClick={() => api.downloadBackup(b.name).catch((e) => setErr((e as Error).message))}
                      >
                        <Download className="w-3.5 h-3.5" /> Скачать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status.logTail.length > 0 && (
          <details className="mt-4">
            <summary className={`text-xs cursor-pointer ${t.muted}`}>Журнал бэкапов (последние строки)</summary>
            <pre className={`mt-2 p-2 rounded text-[10px] overflow-x-auto nice-scroll ${t.soft} font-mono`}>
              {status.logTail.join("\n")}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
