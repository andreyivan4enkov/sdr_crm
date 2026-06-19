import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import type { LeadHistoryEvent } from "@sdr-crm/api-client";
import { api } from "../api/client";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadHistoryTab({
  t,
  leadId,
  createdAt,
  createdBy,
}: {
  t: Record<string, string>;
  leadId: string;
  createdAt?: string;
  createdBy?: string | null;
}) {
  const [events, setEvents] = useState<LeadHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api.getLeadHistory(leadId)
      .then((data) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message || "Не удалось загрузить историю");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leadId]);

  return (
    <div className={`rounded-2xl bio-card p-4 md:p-5 ${t.surface}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-teal-600" /> История действий
        </h3>
        {createdAt && (
          <p className={`text-xs ${t.muted} crm-data`}>
            Создана {formatWhen(createdAt)}
            {createdBy ? ` · ${createdBy}` : ""}
          </p>
        )}
      </div>

      {loading && (
        <div className={`flex items-center gap-2 text-sm ${t.muted} py-8 justify-center`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-rose-500 py-4">{error}</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className={`text-sm ${t.muted} py-4`}>Пока нет записей о действиях с этой сделкой.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-0">
          {events.map((ev, i) => (
            <div key={`${ev.action}-${ev.at}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0 pt-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                {i < events.length - 1 && <span className={`w-px flex-1 min-h-[2rem] mt-1 ${t.border} bg-current opacity-20`} />}
              </div>
              <div className={`pb-5 min-w-0 flex-1 crm-data ${i === events.length - 1 ? "pb-0" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{ev.label}</span>
                  <span className={`text-xs ${t.muted}`}>{formatWhen(ev.at)}</span>
                </div>
                <p className={`text-xs mt-0.5 ${t.muted}`}>
                  {ev.actor}
                  {ev.userLogin && ev.userLogin !== ev.actor ? ` (${ev.userLogin})` : ""}
                </p>
                {ev.details.length > 0 && (
                  <ul className={`mt-2 space-y-1 text-sm ${t.subtle}`}>
                    {ev.details.map((line, j) => (
                      <li key={j} className={`rounded-xl px-3 py-2 ${t.soft}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
