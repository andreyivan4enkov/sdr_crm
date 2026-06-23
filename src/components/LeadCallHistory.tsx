import { useCallback, useEffect, useState } from "react";
import {
  Phone, PhoneIncoming, PhoneOutgoing, Sparkles, Loader2, Check, FileText, PhoneCall,
} from "lucide-react";
import { api, hasPermission, type AuthUser, type Call } from "../api/client";
import { GlassAudioPlayer } from "./GlassAudioPlayer";

function formatDuration(sec?: number | null) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} сек`;
}

function recordingSrc(callId: string) {
  return `/api/calls/${callId}/recording`;
}

function GlassCallRow({
  call, t, user, onOpenLead, onRefresh,
}: {
  call: Call;
  t: Record<string, string>;
  user: AuthUser;
  onOpenLead?: (id: string) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState("");
  const canWrite = hasPermission(user, "leads.write");
  const hasAi = Object.keys(call.aiSuggestions || {}).length > 0;
  const isInbound = call.direction === "inbound";
  const DirIcon = isInbound ? PhoneIncoming : PhoneOutgoing;

  async function transcribe() {
    setBusy("tx");
    try {
      await api.transcribeCall(call.id);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function applyAi() {
    setBusy("ai");
    try {
      await api.applyCallAi(call.id);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const hasRecording = Boolean(call.recordingUrl || call.hasRecording);

  return (
    <article className={`glass-call-card bio-card bio-glass-panel ${t.surface}`}>
      <div className="flex items-start gap-2.5">
        <span className={`glass-call-icon ${isInbound ? "glass-call-icon--in" : "glass-call-icon--out"}`}>
          <DirIcon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 crm-data">
              <div className="font-semibold text-sm truncate">{call.phone}</div>
              <div className={`text-[11px] ${t.muted} mt-0.5`}>
                {isInbound ? "Входящий" : "Исходящий"}
                {call.duration ? ` · ${formatDuration(call.duration)}` : ""}
              </div>
            </div>
            <span className={`glass-call-badge ${call.status === "active" ? "glass-call-badge--live" : ""}`}>
              {call.status === "active" ? "Активен" : "Завершён"}
            </span>
          </div>
          <div className={`text-[10px] ${t.muted} mt-1 crm-data`}>
            {call.createdAt ? new Date(call.createdAt).toLocaleString("ru-RU") : ""}
            {call.provider ? ` · ${call.provider}` : ""}
          </div>
        </div>
      </div>

      {hasRecording && (
        <div className="mt-3">
          <p className="glass-call-label crm-chrome">Запись разговора</p>
          <GlassAudioPlayer src={recordingSrc(call.id)} />
        </div>
      )}

      {!hasRecording && call.status === "completed" && (
        <p className={`text-[11px] ${t.muted} mt-2 italic`}>Запись пока не поступила</p>
      )}

      {call.transcriptStatus === "processing" && (
        <p className={`text-xs ${t.muted} mt-2 flex items-center gap-1`}>
          <Loader2 className="w-3 h-3 animate-spin" /> Расшифровка…
        </p>
      )}

      {call.transcript && (
        <div className="glass-call-transcript mt-3">
          <p className="glass-call-label crm-chrome"><FileText className="w-3 h-3 inline" /> Расшифровка</p>
          <p className={`text-xs ${t.subtle} whitespace-pre-wrap crm-data leading-relaxed`}>{call.transcript}</p>
        </div>
      )}

      {call.aiSummary && (
        <div className="glass-call-ai mt-3">
          <p className="glass-call-label crm-chrome text-teal-600 dark:text-teal-300">
            <Sparkles className="w-3 h-3 inline" /> Резюме AI
          </p>
          <p className={`text-xs ${t.subtle}`}>{call.aiSummary}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        {hasRecording && call.transcriptStatus !== "processing" && call.transcriptStatus !== "done" && (
          <button type="button" onClick={transcribe} disabled={!!busy}
            className="glass-call-action glass-call-action--primary">
            {busy === "tx" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI
          </button>
        )}
        {hasAi && canWrite && call.leadId && (
          <button type="button" onClick={applyAi} disabled={!!busy} className="glass-call-action">
            {busy === "ai" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            В карточку
          </button>
        )}
        {call.leadId && onOpenLead && (
          <button type="button" onClick={() => onOpenLead(call.leadId!)} className="glass-call-action">
            Сделка →
          </button>
        )}
      </div>
    </article>
  );
}

export function LeadCallHistory({
  t, user, leadId, phone, onOpenLead, compact, sidebar, onDial, dialing,
}: {
  t: Record<string, string>;
  user: AuthUser;
  leadId: string;
  phone?: string;
  onOpenLead?: (id: string) => void;
  compact?: boolean;
  sidebar?: boolean;
  onDial?: () => void;
  dialing?: boolean;
}) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getCalls({ leadId, phone });
      setCalls(r.calls);
    } finally {
      setLoading(false);
    }
  }, [leadId, phone]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("crm:calls-refresh", refresh);
    return () => window.removeEventListener("crm:calls-refresh", refresh);
  }, [load]);

  if (!hasPermission(user, "calls.view")) return null;

  return (
    <div className={sidebar ? "space-y-3" : compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`font-semibold flex items-center gap-2 ${sidebar ? "text-sm" : ""}`}>
          <Phone className="w-4 h-4 text-teal-600" />
          {sidebar ? "Звонки" : compact ? "Звонки" : "Журнал звонков"}
        </h3>
        {onDial && hasPermission(user, "calls.dial") && phone && (
          <button
            type="button"
            onClick={onDial}
            disabled={dialing}
            className="bio-btn-primary glass-call-dial-btn"
          >
            {dialing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
            Позвонить
          </button>
        )}
      </div>

      {loading && <p className={`text-sm ${t.muted}`}>Загрузка…</p>}
      {!loading && calls.length === 0 && (
        <p className={`text-sm ${t.muted} bio-glass-panel rounded-xl px-3 py-4 text-center`}>
          Звонков пока нет. Исходящие и входящие появятся здесь автоматически.
        </p>
      )}
      <div className={`space-y-2.5 ${sidebar ? "max-h-[min(42vh,22rem)] overflow-y-auto nice-scroll pr-0.5" : ""}`}>
        {calls.map((c) => (
          <GlassCallRow key={c.id} call={c} t={t} user={user} onOpenLead={onOpenLead} onRefresh={load} />
        ))}
      </div>
    </div>
  );
}

export function CallsPage({
  t, user, onOpenLead,
}: {
  t: Record<string, string>;
  user: AuthUser;
  onOpenLead: (id: string) => void;
}) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getCalls(q.trim() ? { phone: q.trim() } : undefined);
      setCalls(r.calls);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-teal-600" />
          <h2 className="font-semibold">Журнал звонков</h2>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Фильтр по номеру…"
          className={`text-sm px-3 py-2 rounded-xl border bio-glass-input crm-data ${t.input}`}
        />
      </div>
      <p className={`text-sm ${t.muted}`}>
        Записи Билайн, расшифровки и подсказки AI. Настройка — «Настройки → Каналы → Телефония».
      </p>
      {loading && <p className={`text-sm ${t.muted}`}>Загрузка…</p>}
      {!loading && calls.length === 0 && <p className={`text-sm ${t.muted}`}>Звонков не найдено.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {calls.map((c) => (
          <GlassCallRow key={c.id} call={c} t={t} user={user} onOpenLead={onOpenLead} onRefresh={load} />
        ))}
      </div>
    </div>
  );
}
