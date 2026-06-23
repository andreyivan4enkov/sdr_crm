import { useEffect, useState } from "react";
import { Check, X, User, Link2, Copy } from "lucide-react";
import { api, hasPermission, type AdminUser, type Role } from "../../api/client";

export function AdminUsers({ t, Btn, user }: {
  t: Record<string, string>;
  user: { permissions?: string[] };
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Record<string, string>; variant?: string; className?: string }>;
}) {
  const canManageUsers = hasPermission(user as import("../../api/client").AuthUser, "users.manage");
  const canInvite = hasPermission(user as import("../../api/client").AuthUser, "users.invite") || canManageUsers;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [inviteRoles, setInviteRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState("active");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [selectedInviteRoleId, setSelectedInviteRoleId] = useState("");

  async function load() {
    const inviteR = canInvite ? await api.getInviteRoles() : { roles: [] as Role[] };
    setInviteRoles(inviteR.roles);
    if (!selectedInviteRoleId && inviteR.roles[0]) setSelectedInviteRoleId(inviteR.roles[0].id);

    if (canManageUsers) {
      const [u, r] = await Promise.all([api.getUsers(filter), api.getRoles()]);
      setUsers(u.users);
      setRoles(r.roles);
    }
  }

  useEffect(() => { load(); }, [filter, canManageUsers, canInvite]);

  async function createInvite() {
    const r = await api.createInvite({ roleId: selectedInviteRoleId || undefined });
    setInviteUrl(r.url);
    setInviteRole(r.role);
  }

  function copyInvite() {
    if (inviteUrl) navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <div className="space-y-4">
      {canInvite && (
        <div className={`rounded-xl border p-4 ${t.surface} ${t.border}`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Link2 className="w-4 h-4 text-teal-600" /> Пригласить сотрудника</h3>
          <p className={`text-xs ${t.muted} mt-1`}>Сгенерируйте ссылку — сотрудник зарегистрируется без подтверждения</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <select
              value={selectedInviteRoleId}
              onChange={(e) => setSelectedInviteRoleId(e.target.value)}
              className={`text-sm border rounded-lg px-3 py-2 ${t.input}`}
            >
              {inviteRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <Btn t={t} onClick={createInvite}>Создать ссылку</Btn>
            {inviteUrl && (
              <button onClick={copyInvite} className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
                <Copy className="w-3.5 h-3.5" /> Копировать ({inviteRole})
              </button>
            )}
          </div>
          {inviteUrl && <code className={`block mt-2 text-xs break-all p-2 rounded ${t.soft}`}>{inviteUrl}</code>}
        </div>
      )}

      {canManageUsers && (
        <>
          <div className="flex gap-2">
            {["active", "pending", "rejected"].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${filter === s ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/15" : `${t.border} ${t.muted}`}`}>
                {s === "pending" ? "Ожидают" : s === "active" ? "Активные" : "Отклонённые"}
              </button>
            ))}
          </div>
          <div className={`rounded-xl border overflow-hidden ${t.surface} ${t.border}`}>
            {users.length === 0 ? <p className={`p-6 text-sm text-center ${t.muted}`}>Нет пользователей</p>
              : <div className={`divide-y ${t.divide}`}>
                  {users.map((u) => (
                    <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center"><User className="w-4 h-4 text-teal-600" /></span>
                        <div>
                          <div className="font-medium text-sm">{u.profileName || u.login}</div>
                          <div className={`text-xs ${t.muted}`}>{u.email} · {u.roleName || "без роли"}</div>
                        </div>
                      </div>
                      {filter === "pending" && (
                        <div className="flex gap-2">
                          <select className={`text-xs border rounded px-2 py-1 ${t.input}`} id={`role-${u.id}`} defaultValue={roles.find((r) => r.name === "operator")?.id}>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                          <Btn t={t} onClick={async () => {
                            const sel = document.getElementById(`role-${u.id}`) as HTMLSelectElement;
                            await api.approveUser(u.id, { roleId: sel?.value || undefined });
                            load();
                          }}><Check className="w-4 h-4" /> Подтвердить</Btn>
                          <Btn t={t} variant="ghost" onClick={async () => { await api.rejectUser(u.id); load(); }}><X className="w-4 h-4" /></Btn>
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
          </div>
        </>
      )}
    </div>
  );
}
