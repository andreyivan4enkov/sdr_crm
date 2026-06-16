import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../api/client";

const PASSWORD_HINTS = [
  "Не менее 8 символов",
  "Буквы и цифры",
  "Не используйте простые пароли вроде 123456 или password",
];

function validateNewPassword(password: string): string | null {
  if (password.length < 8) return "Пароль не менее 8 символов";
  if (password.length > 128) return "Пароль слишком длинный";
  if (!/[a-zA-Zа-яА-Я]/.test(password)) return "Пароль должен содержать буквы";
  if (!/[0-9]/.test(password)) return "Пароль должен содержать цифры";
  const weak = new Set(["1234", "123456", "12345678", "password", "qwerty", "admin", "changeme", "changeme123"]);
  if (weak.has(password.toLowerCase())) return "Слишком простой пароль";
  return null;
}

export function PasswordSettings({ t, Btn, TInput, Labeled }: {
  t: Record<string, string>;
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string }>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setMsg("");
    if (!current.trim()) return setErr("Введите текущий пароль");
    if (!next.trim()) return setErr("Введите новый пароль");
    const pwdErr = validateNewPassword(next);
    if (pwdErr) return setErr(pwdErr);
    if (next === current) return setErr("Новый пароль должен отличаться от текущего");
    if (next !== confirm) return setErr("Пароли не совпадают");

    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg("Пароль успешно изменён");
    } catch (e) {
      setErr((e as Error).message || "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-xl border p-5 ${t.surface} ${t.border}`}>
      <h3 className="font-semibold flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-teal-600" /> Смена пароля
      </h3>
      <p className={`text-sm ${t.muted} mt-1`}>
        Усильте пароль для своего аккаунта. Изменение доступно только вам — администратор не видит новый пароль.
      </p>

      <ul className={`mt-3 text-xs space-y-1 ${t.muted}`}>
        {PASSWORD_HINTS.map((h) => (
          <li key={h}>· {h}</li>
        ))}
      </ul>

      {err && <p className="text-sm text-rose-500 mt-3">{err}</p>}
      {msg && <p className="text-sm text-teal-600 mt-3">{msg}</p>}

      <div className="mt-4 space-y-3 max-w-md">
        <Labeled t={t} label="Текущий пароль">
          <TInput t={t} type="password" value={current} onChange={setCurrent} placeholder="••••••••" />
        </Labeled>
        <Labeled t={t} label="Новый пароль">
          <TInput t={t} type="password" value={next} onChange={setNext} placeholder="Мин. 8 символов, буквы и цифры" />
        </Labeled>
        <Labeled t={t} label="Повторите новый пароль">
          <TInput t={t} type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" />
        </Labeled>
        <Btn
          t={t}
          onClick={() => void submit()}
          className={busy ? "opacity-60 pointer-events-none" : ""}
        >
          {busy ? "Сохранение…" : "Сменить пароль"}
        </Btn>
      </div>
    </div>
  );
}
