import { useEffect } from "react";

/** Подстраховка, если SSE оборвался — тихое обновление раз в N секунд */
export function useAutoRefresh(enabled: boolean, onRefresh: () => void, intervalMs = 20000) {
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === "visible") onRefresh();
    };

    const id = setInterval(tick, intervalMs);
    const onVis = () => { if (document.visibilityState === "visible") onRefresh(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, onRefresh, intervalMs]);
}
