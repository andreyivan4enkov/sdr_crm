import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Check, Copy, Link2, Phone, Plus, Shield, Trash2, User, Users, X, UserMinus, MapPin,
} from "lucide-react";
import {
  api, hasAnyPermission, hasPermission,
  type AdminUser, type AuthUser, type OrgUnit, type Role,
} from "../api/client";

type Theme = Record<string, string>;

type Props = {
  t: Theme;
  user: AuthUser;
  data: { leads: { assignedDealManagerId?: string | null }[]; dealManagers: { id: string; userId?: string | null }[] };
  reload: () => void;
  Btn: React.FC<{ children: React.ReactNode; onClick: () => void; t: Theme; variant?: string; className?: string }>;
  TInput: React.FC<{ t: Theme; value: string; onChange: (v: string) => void; placeholder?: string }>;
  Labeled: React.FC<{ label: string; children: React.ReactNode; t: Theme }>;
  Sel: React.FC<{ t: Theme; value: string; onChange: (v: string) => void; children: React.ReactNode }>;
};

type Tab = "employees" | "structure";

function buildTree(units: OrgUnit[]) {
  const byParent = new Map<string | null, OrgUnit[]>();
  for (const u of units) {
    const key = u.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(u);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return byParent;
}

function UnitTree({
  units, byParent, parentId, depth, t, canManage, roles, onEdit, onDelete, employeeCount,
}: {
  units: OrgUnit[];
  byParent: Map<string | null, OrgUnit[]>;
  parentId: string | null;
  depth: number;
  t: Theme;
  canManage: boolean;
  roles: Role[];
  onEdit: (u: OrgUnit) => void;
  onDelete: (id: string) => void;
  employeeCount: (id: string) => number;
}) {
  const list = byParent.get(parentId) ?? [];
  if (!list.length) return null;

  return (
    <ul className={depth === 0 ? "space-y-2" : "mt-2 space-y-2 border-l-2 border-teal-200 dark:border-teal-800 ml-3 pl-3"}>
      {list.map((u) => (
        <li key={u.id}>
          <div className={`bio-card bio-glass-panel p-3 flex items-start justify-between gap-2 ${t.surface} ${t.border}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="truncate">{u.name}</span>
              </div>
              {u.description && <p className={`text-xs ${t.muted} mt-1`}>{u.description}</p>}
              <div className={`flex flex-wrap gap-2 mt-2 text-xs ${t.muted}`}>
                <span>{employeeCount(u.id)} сотр.</span>
                {u.defaultRoleName && (
                  <span className={`px-1.5 py-0.5 rounded ${t.chip}`}>роль: {u.defaultRoleName}</span>
                )}
              </div>
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => onEdit(u)} className={`text-xs px-2 py-1 rounded ${t.chip} ${t.hover}`}>Изменить</button>
                <button type="button" onClick={() => onDelete(u.id)} className="text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          <UnitTree
            units={units} byParent={byParent} parentId={u.id} depth={depth + 1} t={t}
            canManage={canManage} roles={roles} onEdit={onEdit} onDelete={onDelete} employeeCount={employeeCount}
          />
        </li>
      ))}
    </ul>
  );
}

export function TeamPage({ t, user, data, reload, Btn, TInput, Labeled, Sel }: Props) {
  const canManage = hasAnyPermission(user, ["team.manage", "leads.write"]);
  const canManageUsers = hasPermission(user, "users.manage");
  const canInvite = hasAnyPermission(user, ["users.invite", "users.manage", "team.manage"]);

  const [tab, setTab] = useState<Tab>("employees");
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [crmUsers, setCrmUsers] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [unitForm, setUnitForm] = useState<Partial<OrgUnit> | null>(null);

  const [inviteRoles, setInviteRoles] = useState<Role[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [selectedInviteRoleId, setSelectedInviteRoleId] = useState("");
  const [selectedInviteOrgUnitId, setSelectedInviteOrgUnitId] = useState("");

  const [dismissTarget, setDismissTarget] = useState<AdminUser | null>(null);
  const [delegateToUserId, setDelegateToUserId] = useState("");

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTeam();
      setOrgUnits(res.orgUnits);
      setRoles(res.roles);

      if (canInvite) {
        const inviteR = await api.getInviteRoles();
        setInviteRoles(inviteR.roles);
        if (!selectedInviteRoleId && inviteR.roles[0]) setSelectedInviteRoleId(inviteR.roles[0].id);
      }

      if (canManageUsers) {
        const [active, pending] = await Promise.all([
          api.getUsers("active"),
          api.getUsers("pending"),
        ]);
        setCrmUsers(active.users);
        setPendingUsers(pending.users);
      }
    } finally {
      setLoading(false);
    }
  }, [canInvite, canManageUsers, selectedInviteRoleId]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  const byParent = useMemo(() => buildTree(orgUnits), [orgUnits]);
  const employeeCount = (unitId: string) => crmUsers.filter((u) => u.profileOrgUnitId === unitId).length;
  const leadCount = (userId: string) => {
    const dealManager = data.dealManagers.find((r) => r.userId === userId);
    if (!dealManager) return 0;
    return data.leads.filter((l) => l.assignedDealManagerId === dealManager.id).length;
  };

  const tabs: { k: Tab; label: string; icon: typeof Building2 }[] = [
    { k: "employees", label: "Сотрудники", icon: Users },
    { k: "structure", label: "Структура", icon: Building2 },
  ];

  async function saveUnit() {
    if (!unitForm?.name?.trim()) return;
    if (unitForm.id) await api.updateOrgUnit(unitForm.id, unitForm);
    else await api.createOrgUnit(unitForm);
    setUnitForm(null);
    await loadTeam();
    reload();
  }

  async function createInvite() {
    const r = await api.createInvite({
      roleId: selectedInviteRoleId || undefined,
      orgUnitId: selectedInviteOrgUnitId || null,
    });
    setInviteUrl(r.url);
    setInviteRole(r.role);
  }

  async function approvePending(u: AdminUser) {
    const roleSel = document.getElementById(`role-${u.id}`) as HTMLSelectElement;
    const unitSel = document.getElementById(`unit-${u.id}`) as HTMLSelectElement;
    await api.approveUser(u.id, {
      roleId: roleSel?.value || undefined,
      orgUnitId: unitSel?.value || u.profileOrgUnitId || null,
    });
    await loadTeam();
    reload();
  }

  async function dismissEmployee() {
    if (!dismissTarget) return;
    await api.dismissUser(dismissTarget.id, { delegateToUserId: delegateToUserId || null });
    setDismissTarget(null);
    setDelegateToUserId("");
    await loadTeam();
    reload();
  }

  if (loading) {
    return <p className={`text-sm ${t.muted} p-4`}>Загрузка…</p>;
  }

  return (
    <div className="space-y-4">
      <p className={`text-sm ${t.muted}`}>
        Сотрудники добавляются только по приглашению: выберите роль и отдел, отправьте ссылку. После анкеты — подтвердите доступ.
      </p>

      {canInvite && (
        <div className={`bio-card bio-glass-panel p-4 ${t.surface} ${t.border}`}>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Link2 className="w-4 h-4 text-teal-600" /> Пригласить сотрудника
          </h3>
          <p className={`text-xs ${t.muted} mt-1`}>Ссылка для регистрации и заполнения анкеты</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
            <select value={selectedInviteRoleId} onChange={(e) => setSelectedInviteRoleId(e.target.value)}
              className={`text-sm border rounded-lg px-3 py-2 ${t.input}`}>
              {inviteRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select value={selectedInviteOrgUnitId} onChange={(e) => setSelectedInviteOrgUnitId(e.target.value)}
              className={`text-sm border rounded-lg px-3 py-2 ${t.input}`}>
              <option value="">— Подразделение —</option>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <Btn t={t} onClick={() => void createInvite()}>Создать ссылку</Btn>
            {inviteUrl && (
              <button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="inline-flex items-center justify-center gap-1 text-sm text-teal-600 hover:underline">
                <Copy className="w-3.5 h-3.5" /> Копировать ({inviteRole})
              </button>
            )}
          </div>
          {inviteUrl && <code className={`block mt-2 text-xs break-all p-2 rounded ${t.soft}`}>{inviteUrl}</code>}
        </div>
      )}

      {canManageUsers && pendingUsers.length > 0 && (
        <div className={`bio-card bio-glass-panel overflow-hidden ${t.surface}`}>
          <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border}`}>
            Анкеты на подтверждение ({pendingUsers.length})
          </div>
          <div className={`divide-y ${t.divide}`}>
            {pendingUsers.map((u) => (
              <div key={u.id} className="px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-amber-600" />
                    </span>
                    <div className="min-w-0 crm-data">
                      <div className="font-medium text-sm truncate">{u.profileName || u.login}</div>
                      <div className={`text-xs ${t.muted} truncate`}>{u.email} · {u.login}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <select className={`text-xs border rounded px-2 py-1 ${t.input}`} id={`role-${u.id}`}
                      defaultValue={u.roleId || roles.find((r) => r.name === "operator")?.id}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <select className={`text-xs border rounded px-2 py-1 ${t.input}`} id={`unit-${u.id}`}
                      defaultValue={u.profileOrgUnitId || ""}>
                      <option value="">— Отдел —</option>
                      {orgUnits.map((ou) => <option key={ou.id} value={ou.id}>{ou.name}</option>)}
                    </select>
                    <Btn t={t} onClick={() => void approvePending(u)}><Check className="w-4 h-4" /> Подтвердить</Btn>
                    <Btn t={t} variant="ghost" onClick={async () => { await api.rejectUser(u.id); await loadTeam(); }}>
                      <X className="w-4 h-4" />
                    </Btn>
                  </div>
                </div>
                <div className={`grid sm:grid-cols-3 gap-2 text-xs ${t.muted}`}>
                  {u.profilePosition && <span>Должность: {u.profilePosition}</span>}
                  {u.profilePhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.profilePhone}</span>}
                  {u.profileRegion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{u.profileRegion}</span>}
                  {u.orgUnitName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{u.orgUnitName}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bio-glass-tabs flex gap-1 overflow-x-auto">
        {tabs.map((x) => (
          <button key={x.k} type="button" onClick={() => setTab(x.k)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition ${
              tab === x.k ? `${t.surface} shadow-sm font-medium ${t.text}` : t.muted
            }`}>
            <x.icon className="w-4 h-4" /> {x.label}
          </button>
        ))}
      </div>

      {tab === "employees" && (
        <div className={`bio-card bio-glass-panel overflow-hidden ${t.surface}`}>
          {crmUsers.length === 0 ? (
            <p className={`text-sm text-center py-10 ${t.muted}`}>Нет сотрудников. Создайте ссылку-приглашение выше.</p>
          ) : (
            <div className={`divide-y ${t.divide}`}>
              {crmUsers.map((u) => (
                <div key={u.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center font-semibold text-teal-700 shrink-0">
                      {(u.profileName || u.login).charAt(0)}
                    </span>
                    <div className="min-w-0 crm-data">
                      <div className="font-medium text-sm truncate">{u.profileName || u.login}</div>
                      <div className={`text-xs ${t.muted} flex flex-wrap gap-x-2 gap-y-0.5`}>
                        <span>{u.login}</span>
                        {u.roleName && <span className="text-teal-600 dark:text-teal-400 flex items-center gap-0.5"><Shield className="w-3 h-3" />{u.roleName}</span>}
                        {u.orgUnitName && <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{u.orgUnitName}</span>}
                      </div>
                      <div className={`text-xs ${t.muted} mt-0.5`}>
                        Клиентов: <span className={t.text}>{leadCount(u.id)}</span>
                        {u.profileRegion && <> · {u.profileRegion}</>}
                      </div>
                    </div>
                  </div>
                  {canManageUsers && u.id !== user.id && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setDismissTarget(u); setDelegateToUserId(""); }}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border ${t.border} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}>
                        <UserMinus className="w-3.5 h-3.5" /> Уволить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {dismissTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDismissTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-md bio-card bio-glass-panel p-4 space-y-3 ${t.surface} ${t.border}`}>
            <h4 className="font-semibold text-sm">Увольнение: {dismissTarget.profileName || dismissTarget.login}</h4>
            <p className={`text-xs ${t.muted}`}>Передайте сделки другому сотруднику или оставьте без ответственного</p>
            <select value={delegateToUserId} onChange={(e) => setDelegateToUserId(e.target.value)}
              className={`w-full text-sm border rounded-lg px-3 py-2 ${t.input}`}>
              <option value="">— Не передавать сделки —</option>
              {crmUsers.filter((u) => u.id !== dismissTarget.id && u.status === "active").map((u) => (
                <option key={u.id} value={u.id}>{u.profileName || u.login}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Btn t={t} variant="ghost" onClick={() => setDismissTarget(null)}>Отмена</Btn>
              <Btn t={t} onClick={() => void dismissEmployee()}>Уволить</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === "structure" && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Btn t={t} variant="soft" onClick={() => setUnitForm({ name: "", parentId: null, description: "", defaultRoleId: null })}>
                <Plus className="w-4 h-4" /> Подразделение
              </Btn>
            </div>
          )}

          {unitForm && (
            <div className={`bio-card bio-glass-panel p-4 space-y-3 ${t.surface} border-teal-300`}>
              <Labeled label="Название" t={t}>
                <TInput t={t} value={unitForm.name || ""} onChange={(v) => setUnitForm({ ...unitForm, name: v })} placeholder="Отдел продаж" />
              </Labeled>
              <Labeled label="Родительское подразделение" t={t}>
                <Sel t={t} value={unitForm.parentId || ""} onChange={(v) => setUnitForm({ ...unitForm, parentId: v || null })}>
                  <option value="">— Корень компании —</option>
                  {orgUnits.filter((u) => u.id !== unitForm.id).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Sel>
              </Labeled>
              <Labeled label="Роль по умолчанию" t={t}>
                <Sel t={t} value={unitForm.defaultRoleId || ""} onChange={(v) => setUnitForm({ ...unitForm, defaultRoleId: v || null })}>
                  <option value="">— Не задана —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Sel>
              </Labeled>
              <Labeled label="Описание" t={t}>
                <TInput t={t} value={unitForm.description || ""} onChange={(v) => setUnitForm({ ...unitForm, description: v })} />
              </Labeled>
              <div className="flex gap-2">
                <Btn t={t} onClick={() => void saveUnit()}>Сохранить</Btn>
                <Btn t={t} variant="ghost" onClick={() => setUnitForm(null)}>Отмена</Btn>
              </div>
            </div>
          )}

          {orgUnits.length === 0 ? (
            <p className={`text-sm ${t.muted} text-center py-8`}>Структура не задана. Добавьте головной офис или отдел.</p>
          ) : (
            <UnitTree
              units={orgUnits} byParent={byParent} parentId={null} depth={0} t={t}
              canManage={canManage} roles={roles}
              onEdit={(u) => setUnitForm({ ...u })}
              onDelete={async (id) => {
                if (!confirm("Удалить подразделение? Сотрудники будут отвязаны.")) return;
                await api.deleteOrgUnit(id);
                await loadTeam();
                reload();
              }}
              employeeCount={employeeCount}
            />
          )}
        </div>
      )}
    </div>
  );
}
