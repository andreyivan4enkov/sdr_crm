import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { ThemeTokens } from "../theme";

export function AuthQrPage({ t }: { t: ThemeTokens }) {
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const navigate = useNavigate();
  const { refresh, user } = useAuth();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (user) {
      navigate("/crm", { replace: true });
      return;
    }
    if (!token) {
      setErr("Нет кода в ссылке");
      setBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api.acceptQrLogin(token);
        await refresh();
        if (!cancelled) navigate("/crm", { replace: true });
      } catch (e) {
        if (!cancelled) {
          setErr((e as Error).message || "Не удалось войти по QR-коду");
          setBusy(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token, user, refresh, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className={`max-w-sm w-full rounded-2xl border p-6 text-center ${t.surface} ${t.border}`}>
        {busy && !err ? (
          <>
            <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className={`mt-4 text-sm ${t.muted}`}>Вход по QR-коду…</p>
          </>
        ) : (
          <>
            <p className="text-rose-500 text-sm">{err}</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-4 text-sm text-teal-600 font-medium"
            >
              Перейти ко входу
            </button>
          </>
        )}
      </div>
    </div>
  );
}
