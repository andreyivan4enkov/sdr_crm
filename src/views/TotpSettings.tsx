import { useEffect, useState } from "react";
import { Shield, Smartphone } from "lucide-react";
import { api } from "../api/client";

const AUTH_APPS = [
  { name: "Google Authenticator", hint: "App Store / Google Play" },
  { name: "Яндекс Ключ", hint: "App Store / Google Play / RuStore" },
];

export function TotpSettings({ t, Btn, TInput }: {
  t: Record<string, string>;
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string }>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }>;
}) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ enabled: false, available: true });
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.totpStatus()
      .then(setStatus)
      .catch((e) => setErr((e as Error).message || "Не удалось загрузить статус 2FA"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className={`text-sm ${t.muted}`}>Загрузка настроек 2FA…</p>;
  }

  return (
    <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
      <h3 className="font-semibold flex items-center gap-2">
        <Shield className="w-4 h-4 text-teal-600" /> Двухфакторная аутентификация
      </h3>
      <p className={`text-sm ${t.muted} mt-1`}>
        Подключите приложение-аутентификатор — код понадобится при каждом входе в CRM.
      </p>

      <div className={`mt-3 grid sm:grid-cols-2 gap-2`}>
        {AUTH_APPS.map((app) => (
          <div key={app.name} className={`rounded-lg border px-3 py-2 text-sm ${t.border}`}>
            <div className="font-medium flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-teal-600" /> {app.name}
            </div>
            <div className={`text-xs ${t.muted}`}>{app.hint}</div>
          </div>
        ))}
      </div>

      {err && <p className="text-sm text-rose-500 mt-3">{err}</p>}
      {msg && <p className="text-sm text-teal-600 mt-3">{msg}</p>}

      {status.enabled ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-teal-600 font-medium">2FA включена для вашего аккаунта</p>
          {backupCodes.length > 0 && (
            <div className={`p-3 rounded ${t.soft} text-xs font-mono`}>
              Резервные коды (сохраните): {backupCodes.join(", ")}
            </div>
          )}
          <div className={`pt-3 border-t ${t.border} space-y-2`}>
            <p className={`text-xs ${t.muted}`}>Чтобы отключить 2FA, введите пароль и текущий код:</p>
            <Labeled t={t} label="Пароль">
              <TInput t={t} type="password" value={disablePassword} onChange={setDisablePassword} />
            </Labeled>
            <Labeled t={t} label="Код из приложения">
              <TInput t={t} value={disableCode} onChange={setDisableCode} placeholder="000000" />
            </Labeled>
            <Btn t={t} variant="ghost" onClick={async () => {
              setErr("");
              try {
                await api.totpDisable(disablePassword, disableCode);
                setStatus({ ...status, enabled: false });
                setUri("");
                setSecret("");
                setMsg("2FA отключена");
              } catch (e) {
                setErr((e as Error).message);
              }
            }}>Отключить 2FA</Btn>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!uri ? (
            <Btn t={t} onClick={async () => {
              setErr("");
              try {
                const r = await api.totpSetup();
                setUri(r.uri);
                setSecret(r.secret);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}>Подключить 2FA</Btn>
          ) : (
            <>
              <p className={`text-xs ${t.muted}`}>
                Отсканируйте QR-код в Google Authenticator или Яндекс Ключе, либо введите секрет вручную:
              </p>
              <div className="flex flex-wrap gap-4 items-start">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`}
                  alt="QR-код для 2FA"
                  className="rounded-lg border border-stone-200 dark:border-slate-600"
                  width={180}
                  height={180}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium ${t.muted}`}>Секрет (вручную)</p>
                  <code className={`block text-xs break-all p-2 rounded mt-1 ${t.soft}`}>{secret}</code>
                </div>
              </div>
              <Labeled t={t} label="Код из приложения">
                <TInput t={t} value={code} onChange={setCode} placeholder="000000" />
              </Labeled>
              <Btn t={t} onClick={async () => {
                setErr("");
                try {
                  const r = await api.totpEnable(secret, code);
                  setBackupCodes(r.backupCodes);
                  setStatus({ ...status, enabled: true });
                  setMsg("2FA включена. Сохраните резервные коды — они показываются один раз.");
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}>Подтвердить и включить</Btn>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children, t }: { label: string; children: React.ReactNode; t: Record<string, string> }) {
  return <div><label className={`text-xs font-medium ${t.muted}`}>{label}</label><div className="mt-1">{children}</div></div>;
}
