import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { api, type AuditLog } from "../../api/client";

const ACTIONS = [
  "", "auth.login", "auth.login_failed", "auth.logout", "auth.register",
  "lead.list", "lead.read", "lead.create", "lead.update", "lead.erase", "lead.export",
  "lead.consent_revoke", "lead.public_create", "lead.retention_purge",
  "user.invite", "user.approve", "user.reject", "user.dismiss", "settings.change", "integration.update",
];

export function AdminAudit({ t }: { t: Record<string, string> }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [userLogin, setUserLogin] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  async function load(off = 0, append = false) {
    const r = await api.getAuditLogs({
      limit,
      offset: off,
      action: action || undefined,
      userLogin: userLogin || undefined,
    });
    setLogs(append ? (x) => [...x, ...r.logs] : r.logs);
    setTotal(r.total);
    setOffset(off);
  }

  useEffect(() => { load(0); }, [action, userLogin]);

  return (
    <div className="space-y-4">
      <p className={`text-sm ${t.muted} flex items-center gap-2`}>
        <ScrollText className="w-4 h-4" /> Журнал действий (152-ФЗ)
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className={`text-sm border rounded-lg px-2 py-1.5 ${t.input}`}>
          <option value="">Все действия</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={userLogin} onChange={(e) => setUserLogin(e.target.value)} placeholder="Логин"
          className={`text-sm border rounded-lg px-2 py-1.5 ${t.input}`} />
      </div>
      <div className={`rounded-xl border overflow-hidden ${t.surface} ${t.border}`}>
        {logs.length === 0 ? <p className={`p-6 text-sm text-center ${t.muted}`}>Записей нет</p>
          : <div className={`divide-y ${t.divide} max-h-[32rem] overflow-y-auto nice-scroll`}>
              {logs.map((l) => (
                <div key={l.id} className="px-4 py-2.5 text-sm crm-data">
                  <div className="flex justify-between gap-2 items-center">
                    <span className="font-medium flex items-center gap-2">
                      {l.action}
                      {((l as unknown as Record<string, unknown>).meta as Record<string, unknown> | undefined)?.anomaly === true && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          anomaly
                        </span>
                      )}
                    </span>
                    <span className={`text-xs ${t.muted}`}>{new Date(l.createdAt).toLocaleString("ru-RU")}</span>
                  </div>
                  <div className={`text-xs ${t.muted} mt-0.5`}>
                    {l.userLogin || "—"} · {l.ip || "—"}
                    {l.entityId ? ` · ${l.entityType}:${l.entityId.slice(0, 8)}…` : ""}
                  </div>
                </div>
              ))}
            </div>}
      </div>
      {logs.length < total && (
        <button onClick={() => load(offset + limit, true)}
          className={`text-sm text-teal-600 hover:underline`}>
          Загрузить ещё ({logs.length} / {total})
        </button>
      )}
    </div>
  );
}
