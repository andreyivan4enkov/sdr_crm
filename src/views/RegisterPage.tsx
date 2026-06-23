import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Camera, User } from "lucide-react";
import { api } from "../api/client";

const MAX_PHOTO_BYTES = 400_000;

type FormState = {
  name: string;
  phone: string;
  position: string;
  email: string;
  region: string;
  login: string;
  password: string;
  avatar: string | null;
};

export function RegisterPage({ t, Btn, TInput, Labeled }: {
  t: Record<string, string>;
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Record<string, string>; className?: string }>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }>;
  Labeled: React.FC<{ label: string; children: React.ReactNode; t: Record<string, string> }>;
}) {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [role, setRole] = useState("");
  const [isDealManager, setIsDealManager] = useState(false);
  const [f, setF] = useState<FormState>({
    name: "", phone: "", position: "", email: "", region: "", login: "", password: "", avatar: null,
  });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setValid(false); return; }
    api.verifyInvite(token).then((r) => {
      setValid(r.valid);
      if (r.role) setRole(r.role);
      setIsDealManager(Boolean(r.isDealManager));
    }).catch(() => setValid(false));
  }, [token]);

  function onPhoto(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Выберите изображение (JPG, PNG, WebP)");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErr("Фото не больше 400 КБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setF((prev) => ({ ...prev, avatar: String(reader.result) }));
      setErr("");
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    setErr("");
    if (!f.name.trim()) return setErr("Укажите ФИО");
    if (!f.phone.trim()) return setErr("Укажите телефон");
    if (!f.position.trim()) return setErr("Укажите должность");
    if (!f.email.trim()) return setErr("Укажите email");
    if (isDealManager && !f.region.trim()) return setErr("Укажите регион работы");
    if (!f.login.trim()) return setErr("Придумайте логин");
    if (!f.password.trim()) return setErr("Придумайте пароль");

    setSubmitting(true);
    try {
      await api.register({
        token,
        login: f.login.trim(),
        password: f.password,
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        position: f.position.trim(),
        region: f.region.trim() || null,
        avatar: f.avatar,
      });
      setDone(true);
    } catch (e: unknown) {
      setErr((e as Error).message || "Ошибка регистрации");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || valid === false) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className={`rounded-2xl border p-7 ${t.surface} ${t.border}`}>
          <h2 className="text-lg font-bold">Ссылка недействительна</h2>
          <p className={`mt-2 text-sm ${t.muted}`}>Регистрация только по приглашению от администратора.</p>
          <Link to="/login" className="inline-block mt-4 text-teal-600 text-sm font-medium">Ко входу</Link>
        </div>
      </div>
    );
  }

  if (valid === null) {
    return <div className="max-w-lg mx-auto px-4 py-12 text-center text-sm text-slate-400">Проверка ссылки…</div>;
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className={`rounded-2xl border p-7 ${t.surface} ${t.border}`}>
          <h2 className="text-lg font-bold">Анкета отправлена</h2>
          <p className={`mt-2 text-sm ${t.muted}`}>Дождитесь подтверждения администратором. После одобрения вы сможете войти в CRM.</p>
          <Link to="/login" className="inline-block mt-4 text-teal-600 text-sm font-medium">Ко входу</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${t.surface} ${t.border}`}>
        <div className="px-6 pt-6 pb-4 border-b border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Building2 className="w-5 h-5 text-teal-600 shrink-0" />
            Анкета сотрудника
          </div>
          {role && (
            <p className={`text-sm ${t.muted} mt-1`}>
              Роль: <span className="text-teal-600 font-medium">{role}</span>
            </p>
          )}
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Личные данные</h3>
            <div className="flex gap-4 items-start">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`relative shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${t.border} hover:border-teal-500/60`}
                title="Загрузить фото"
              >
                {f.avatar ? (
                  <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-300" />
                )}
                <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] py-0.5 flex items-center justify-center gap-0.5">
                  <Camera className="w-3 h-3" /> фото
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
              <div className="flex-1 space-y-3 min-w-0">
                <Labeled label="ФИО" t={t}>
                  <TInput t={t} value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Иванов Иван Иванович" />
                </Labeled>
                <Labeled label="Телефон" t={t}>
                  <TInput t={t} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} placeholder="+7 (900) 000-00-00" />
                </Labeled>
              </div>
            </div>
            {f.avatar && (
              <button type="button" onClick={() => setF({ ...f, avatar: null })} className="mt-2 text-xs text-slate-400 hover:text-rose-500">
                Убрать фото
              </button>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Работа</h3>
            <div className="space-y-3">
              <Labeled label="Должность" t={t}>
                <TInput t={t} value={f.position} onChange={(v) => setF({ ...f, position: v })} placeholder="Менеджер по сделкам, оператор…" />
              </Labeled>
              <Labeled label="Email" t={t}>
                <TInput t={t} type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder="name@company.ru" />
              </Labeled>
              {isDealManager && (
                <Labeled label="Регион работы" t={t}>
                  <TInput t={t} value={f.region} onChange={(v) => setF({ ...f, region: v })} placeholder="Москва, СПб…" />
                </Labeled>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Доступ в CRM</h3>
            <div className="space-y-3">
              <Labeled label="Логин" t={t}>
                <TInput t={t} value={f.login} onChange={(v) => setF({ ...f, login: v })} placeholder="ivanov" />
              </Labeled>
              <Labeled label="Пароль" t={t}>
                <TInput t={t} type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} placeholder="Мин. 8 символов, буквы и цифры" />
              </Labeled>
            </div>
          </section>

          {err && <p className="text-sm text-rose-500">{err}</p>}
          <Btn t={t} onClick={submitting ? () => {} : submit} className={`w-full ${submitting ? "opacity-60" : ""}`}>
            {submitting ? "Сохранение…" : "Отправить анкету"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
