import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Shield, Check } from "lucide-react";
import {
  api, type Role,
  getPermissionGroups, permissionLabel, isFullAccess,
} from "../../api/client";
import { useI18n } from "@sdr-crm/i18n/react";
import { useAuth } from "../../context/AuthContext";

type BtnProps = {
  children: React.ReactNode;
  onClick: () => void;
  t: Record<string, string>;
  variant?: string;
  className?: string;
};

function roleHasPerm(rolePerms: string[], perm: string): boolean {
  if (isFullAccess(rolePerms)) return true;
  return rolePerms.includes(perm);
}

export function AdminRoles({
  t, Btn, TInput,
}: {
  t: Record<string, string>;
  Btn: React.FC<BtnProps>;
  TInput: React.FC<{ t: Record<string, string>; value: string; onChange: (v: string) => void; placeholder?: string }>;
}) {
  const { locale } = useI18n();
  const { refresh } = useAuth();
  const permissionGroups = useMemo(() => getPermissionGroups(locale), [locale]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [f, setF] = useState({ name: "", label: "", permissions: [] as string[] });

  const load = useCallback(async () => {
    const r = await api.getRoles();
    setRoles(r.roles);
    const next: Record<string, string[]> = {};
    for (const role of r.roles) next[role.id] = [...(role.permissions || [])];
    setDraft(next);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => {
    return roles.some((r) => {
      const a = [...(draft[r.id] || [])].sort().join(",");
      const b = [...(r.permissions || [])].sort().join(",");
      return a !== b;
    });
  }, [roles, draft]);

  function setPerm(roleId: string, perm: string, on: boolean) {
    setDraft((prev) => {
      const cur = [...(prev[roleId] || [])].filter((p) => p !== "*");
      const next = on ? [...cur, perm] : cur.filter((p) => p !== perm);
      return { ...prev, [roleId]: next };
    });
  }

  function toggleNewPerm(perm: string) {
    setF((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((x) => x !== perm)
        : [...prev.permissions, perm],
    }));
  }

  async function saveAll() {
    setSaving(true);
    setSaveError("");
    try {
      for (const role of roles) {
        if (isFullAccess(role.permissions || [])) continue;
        const perms = draft[role.id];
        const orig = [...(role.permissions || [])].sort().join(",");
        if ([...perms].sort().join(",") === orig) continue;
        await api.updateRole(role.id, { permissions: perms });
      }
      await load();
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Не удалось сохранить права");
    } finally {
      setSaving(false);
    }
  }

  const systemRole = (name: string) => name === "admin" || name === "integrator";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className={`text-sm ${t.muted}`}>Матрица прав по ролям — отметьте нужные действия и нажмите «Сохранить»</p>
        {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <Btn t={t} onClick={saveAll} className="text-sm">
              {saving ? "Сохранение…" : "Сохранить"}
            </Btn>
          )}
          <Btn t={t} variant="soft" onClick={() => setAdding((v) => !v)}>
            <Plus className="w-4 h-4" /> Новая роль
          </Btn>
        </div>
      </div>

      {adding && (
        <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
          <p className="text-sm font-medium mb-3">Новая роль</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={`text-xs ${t.muted}`}>Системное имя (латиница)</label>
              <TInput t={t} value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="custom_role" />
            </div>
            <div>
              <label className={`text-xs ${t.muted}`}>Название в интерфейсе</label>
              <TInput t={t} value={f.label} onChange={(v) => setF({ ...f, label: v })} placeholder="Моя роль" />
            </div>
          </div>
          <div className={`mt-4 overflow-x-auto rounded-lg border ${t.border}`}>
            <table className="w-full text-sm min-w-[320px]">
              <tbody>
                {permissionGroups.map((g) => (
                  <Fragment key={g.title}>
                    <tr className={t.soft}>
                      <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{g.title}</td>
                    </tr>
                    {g.permissions.map((p) => (
                      <tr key={p} className={`border-t ${t.border}`}>
                        <td className="px-3 py-2 text-xs">{permissionLabel(p, locale)}</td>
                        <td className="px-3 py-2 text-center w-16">
                          <input
                            type="checkbox"
                            checked={f.permissions.includes(p)}
                            onChange={() => toggleNewPerm(p)}
                            className="w-4 h-4 accent-teal-600"
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Btn t={t} className="mt-3" onClick={async () => {
            await api.createRole(f);
            setAdding(false);
            setF({ name: "", label: "", permissions: [] });
            load();
          }}>Создать роль</Btn>
        </div>
      )}

      <div className={`rounded-xl border overflow-hidden ${t.surface} ${t.border}`}>
        <div className="overflow-x-auto nice-scroll">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className={`border-b ${t.border} ${t.soft}`}>
                <th className={`text-left px-3 py-3 font-medium sticky left-0 z-10 min-w-[220px] ${t.soft}`}>Право доступа</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-2 py-3 text-center font-medium min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Shield className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        {r.label}
                      </span>
                      <span className={`text-[10px] font-normal ${t.muted}`}>{r.name}</span>
                      {!systemRole(r.name) && (
                        <button
                          type="button"
                          onClick={async () => { if (confirm(`Удалить роль «${r.label}»?`)) { await api.deleteRole(r.id); load(); } }}
                          className="text-rose-500 hover:text-rose-600 p-0.5"
                          title="Удалить роль"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionGroups.map((g) => (
                <Fragment key={g.title}>
                  <tr className="bg-teal-50/80 dark:bg-teal-500/10">
                    <td
                      colSpan={roles.length + 1}
                      className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200 sticky left-0"
                    >
                      {g.title}
                    </td>
                  </tr>
                  {g.permissions.map((perm) => (
                    <tr key={perm} className={`border-t ${t.border} hover:bg-stone-50/50 dark:hover:bg-slate-800/40`}>
                      <td className={`px-3 py-2.5 text-xs sticky left-0 z-[1] ${t.surface}`}>
                        {permissionLabel(perm, locale)}
                      </td>
                      {roles.map((r) => {
                        const full = isFullAccess(draft[r.id] || r.permissions || []);
                        const checked = roleHasPerm(draft[r.id] || [], perm);
                        const locked = r.name === "admin";
                        return (
                          <td key={r.id} className="px-2 py-2.5 text-center">
                            {full && locked ? (
                              <span className="inline-flex text-teal-600" title="Полный доступ">
                                <Check className="w-4 h-4 mx-auto" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={(e) => setPerm(r.id, perm, e.target.checked)}
                                className="w-4 h-4 accent-teal-600 disabled:opacity-50"
                                aria-label={`${r.label}: ${permissionLabel(perm, locale)}`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className={`border-t-2 ${t.border} ${t.soft}`}>
                <td className="px-3 py-2 text-xs font-semibold sticky left-0">Полный доступ</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 py-2 text-center">
                    {isFullAccess(draft[r.id] || r.permissions || []) ? (
                      <span className="text-xs text-teal-600 font-medium">Да</span>
                    ) : (
                      <span className={`text-xs ${t.muted}`}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Btn t={t} onClick={saveAll}>{saving ? "Сохранение…" : "Сохранить изменения"}</Btn>
        </div>
      )}
    </div>
  );
}
