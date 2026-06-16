import { useEffect, useRef, useState } from "react";
import { Building2, Camera, MapPin, Phone, Save, User } from "lucide-react";
import type { MyProfilePayload } from "@jbrealty/api-client";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { readAvatarFile } from "../lib/avatar-upload";

type FormState = {
  name: string;
  phone: string;
  position: string;
  email: string;
  region: string;
  avatar: string | null;
};

export function ProfileSettings({ t, Btn, TInput, Labeled }: {
  t: Record<string, string>;
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string }>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }>;
  Labeled: React.FC<{ label: string; t: Record<string, string>; children: React.ReactNode }>;
}) {
  const { refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<MyProfilePayload["account"] | null>(null);
  const [f, setF] = useState<FormState>({
    name: "", phone: "", position: "", email: "", region: "", avatar: null,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getMyProfile()
      .then((data) => {
        setAccount(data.account);
        const p = data.profile;
        setF({
          name: p?.name || "",
          phone: p?.phone || "",
          position: p?.position || "",
          email: data.account.email || "",
          region: p?.region || "",
          avatar: p?.avatar || null,
        });
      })
      .catch((e) => setErr((e as Error).message || "Не удалось загрузить профиль"))
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    setErr("");
    setMsg("");
    if (!f.name.trim()) return setErr("Укажите ФИО");
    if (!f.phone.trim()) return setErr("Укажите телефон");
    if (!f.position.trim()) return setErr("Укажите должность");
    if (!f.email.trim()) return setErr("Укажите email");
    if (account?.isRealtor && !f.region.trim()) return setErr("Укажите регион работы");

    setBusy(true);
    try {
      const r = await api.updateMyProfile({
        name: f.name.trim(),
        phone: f.phone.trim(),
        position: f.position.trim(),
        email: f.email.trim(),
        region: f.region.trim() || null,
        avatar: f.avatar,
      });
      if (r.user) await refresh();
      setMsg("Профиль сохранён");
    } catch (e) {
      setErr((e as Error).message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className={`text-sm ${t.muted}`}>Загрузка профиля…</p>;
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${t.surface} ${t.border}`}>
      <div className={`px-5 sm:px-6 pt-5 pb-4 border-b ${t.border}`}>
        <div className="flex items-center gap-2 text-lg font-bold">
          <User className="w-5 h-5 text-teal-600 shrink-0" />
          Мой профиль
        </div>
        {account?.roleLabel && (
          <p className={`text-sm ${t.muted} mt-1`}>
            Роль: <span className="text-teal-600 font-medium">{account.roleLabel}</span>
            {account.orgUnitName && (
              <span className={`${t.muted}`}> · {account.orgUnitName}</span>
            )}
          </p>
        )}
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-6">
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => readAvatarFile(
                e.target.files?.[0],
                (dataUrl) => { setF((prev) => ({ ...prev, avatar: dataUrl })); setErr(""); },
                setErr,
              )}
            />
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
              <TInput t={t} value={f.position} onChange={(v) => setF({ ...f, position: v })} placeholder="Риэлтор, оператор…" />
            </Labeled>
            <Labeled label="Email" t={t}>
              <TInput t={t} type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder="name@company.ru" />
            </Labeled>
            {(account?.isRealtor || f.region) && (
              <Labeled label="Регион работы" t={t}>
                <TInput t={t} value={f.region} onChange={(v) => setF({ ...f, region: v })} placeholder="Москва, СПб…" />
              </Labeled>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Аккаунт</h3>
          <div className={`grid sm:grid-cols-2 gap-3 text-sm bio-card bio-glass-panel p-3 ${t.border} ${t.soft}`}>
            <div>
              <div className={`text-xs ${t.muted}`}>Логин</div>
              <div className="font-medium mt-0.5">{account?.login}</div>
            </div>
            <div>
              <div className={`text-xs ${t.muted}`}>Отдел</div>
              <div className="font-medium mt-0.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                {account?.orgUnitName || "Не назначен"}
              </div>
            </div>
            {f.phone && (
              <div className="sm:col-span-2 flex items-center gap-1 text-xs text-teal-600">
                <Phone className="w-3.5 h-3.5" />
                Контактный телефон виден коллегам в задачах и карточках
              </div>
            )}
            {f.region && (
              <div className="sm:col-span-2 flex items-center gap-1 text-xs text-teal-600">
                <MapPin className="w-3.5 h-3.5" />
                Регион используется при распределении заявок
              </div>
            )}
          </div>
          <p className={`text-xs ${t.muted} mt-2`}>
            Логин, роль и отдел меняет администратор. Остальные поля — ваша анкета, как при регистрации.
          </p>
        </section>

        {err && <p className="text-sm text-rose-500">{err}</p>}
        {msg && <p className="text-sm text-teal-600">{msg}</p>}

        <Btn t={t} onClick={() => void submit()} className={`w-full sm:w-auto ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          <Save className="w-4 h-4 inline mr-1" />
          {busy ? "Сохранение…" : "Сохранить профиль"}
        </Btn>
      </div>
    </div>
  );
}
