import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, RefreshCw, X } from "lucide-react";
import { api } from "../api/client";
import type { ThemeTokens } from "../theme";

function qrBaseUrl(publicUrl?: string) {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return (publicUrl || window.location.origin).replace(/\/$/, "");
  }
  return window.location.origin.replace(/\/$/, "");
}

type Props = {
  open: boolean;
  onClose: () => void;
  t: ThemeTokens;
  userName?: string;
};

export function QrLoginShare({ open, onClose, t, userName }: Props) {
  const [dataUrl, setDataUrl] = useState("");
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const cfg = await api.getAuthRuntime();
      const base = qrBaseUrl(cfg.publicUrl);
      const res = await api.createQrLogin(base);
      setUrl(res.url);
      setExpiresAt(res.expiresAt);
      const png = await QRCode.toDataURL(res.url, { margin: 2, width: 280, color: { dark: "#1e293b", light: "#ffffff" } });
      setDataUrl(png);
    } catch (e) {
      setErr((e as Error).message || "Не удалось создать QR-код");
      setDataUrl("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const id = setInterval(() => void refresh(), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const secsLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/45 backdrop-blur-sm" role="dialog" aria-modal aria-label="Вход по QR-коду">
      <div className={`w-full max-w-sm rounded-2xl border shadow-xl p-5 ${t.surface} ${t.border}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <QrCode className="w-5 h-5 text-teal-600" />
              Вход на телефоне
            </div>
            <p className={`text-sm mt-1 ${t.muted}`}>
              {userName ? `Аккаунт: ${userName}` : "Отсканируйте камерой телефона"}
            </p>
          </div>
          <button type="button" onClick={onClose} className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.hover}`} aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          {dataUrl ? (
            <img src={dataUrl} alt="QR-код для входа" className="rounded-xl border border-stone-200 dark:border-slate-600 bg-white p-2 w-[min(280px,100%)]" />
          ) : (
            <div className="w-[280px] max-w-full aspect-square rounded-xl bg-stone-100 dark:bg-slate-700 animate-pulse" />
          )}
          {loading && <p className={`text-xs mt-2 ${t.muted}`}>Обновление…</p>}
          {err && <p className="text-sm text-rose-500 mt-2 text-center">{err}</p>}
          {!err && expiresAt > 0 && (
            <p className={`text-xs mt-3 ${t.muted}`}>
              Действует ещё {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
            </p>
          )}
        </div>

        <p className={`text-xs mt-4 leading-relaxed ${t.muted}`}>
          Телефон и компьютер должны быть в одной Wi‑Fi. QR одноразовый — после входа создайте новый при необходимости.
        </p>

        {url && (
          <p className={`text-[10px] mt-2 break-all ${t.muted}`}>{url}</p>
        )}

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border ${t.border} ${t.hover}`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Новый QR-код
        </button>
      </div>
    </div>
  );
}
