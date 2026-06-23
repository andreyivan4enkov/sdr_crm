import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { TurnstileWidget } from "../components/TurnstileWidget";

export function PrivacyPage({ t }: { t: Record<string, string> }) {
  const [policy, setPolicy] = useState<{ operator: string; operatorEmail: string; updatedAt: string; sections: { title: string; text: string }[] } | null>(null);

  useEffect(() => {
    api.getPrivacy().then(setPolicy).catch(() => {});
  }, []);

  if (!policy) return <div className="max-w-3xl mx-auto px-4 py-12 text-sm text-slate-400">Загрузка…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/login" className={`text-sm ${t.muted} hover:text-teal-600`}>← Ко входу</Link>
      <h1 className="text-2xl font-bold mt-4">Политика обработки персональных данных</h1>
      <p className={`text-sm ${t.muted} mt-2`}>Оператор: {policy.operator} · Обновлено: {policy.updatedAt}</p>
      <div className="mt-8 space-y-6">
        {policy.sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-semibold text-lg">{s.title}</h2>
            <p className={`mt-2 text-sm leading-relaxed ${t.subtle}`}>{s.text}</p>
          </section>
        ))}
      </div>
      <p className={`mt-8 text-sm ${t.muted}`}>Контакт: {policy.operatorEmail}</p>

      <RevokeForm t={t} />
    </div>
  );
}

function RevokeForm({ t }: { t: Record<string, string> }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getPublicConfig().then((c) => setTurnstileSiteKey(c.turnstileSiteKey)).catch(() => {});
  }, []);

  const onTurnstile = useCallback((token: string) => setTurnstileToken(token), []);

  async function requestOtp() {
    setErr(""); setMsg("");
    if (turnstileSiteKey && !turnstileToken) {
      setErr("Подтвердите, что вы не робот");
      return;
    }
    try {
      const r = await api.publicRevoke({
        phone,
        email: email.trim() || undefined,
        turnstileToken: turnstileToken || undefined,
      });
      setMsg(r.message);
      setStep("confirm");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function confirmRevoke() {
    setErr(""); setMsg("");
    try {
      const r = await api.publicRevokeConfirm({ phone, otp });
      setMsg(r.message);
      setPhone("");
      setEmail("");
      setOtp("");
      setTurnstileToken("");
      setStep("request");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className={`mt-10 rounded-xl border p-5 ${t.surface} ${t.border}`}>
      <h2 className="font-semibold">Отзыв согласия на обработку ПДн</h2>
      <p className={`text-sm ${t.muted} mt-1`}>Укажите телефон, который вы оставляли в заявке</p>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..."
        className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm ${t.input}`} disabled={step === "confirm"} />
      {step === "request" && (
        <>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (необязательно)"
            className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${t.input}`} />
          {turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstile} />
          )}
        </>
      )}
      {step === "confirm" && (
        <>
          <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Код из SMS или email"
            className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${t.input}`} inputMode="numeric" />
          <button type="button" onClick={() => { setStep("request"); setOtp(""); setMsg(""); setTurnstileToken(""); }}
            className={`mt-2 text-xs ${t.muted} hover:text-teal-600`}>
            Запросить код заново
          </button>
        </>
      )}
      {err && <p className="text-sm text-rose-500 mt-2">{err}</p>}
      {msg && <p className="text-sm text-teal-600 mt-2">{msg}</p>}
      <button
        onClick={step === "request" ? requestOtp : confirmRevoke}
        className="mt-3 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
        {step === "request" ? "Получить код" : "Подтвердить отзыв"}
      </button>
    </div>
  );
}
