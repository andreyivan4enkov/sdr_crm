import { useEffect } from "react";

/** Подстраховка, если SSE оборвался — тихое обновление раз в N секунд */
export function useAutoRefresh(enabled: boolean, onRefresh: () => void, intervalMs = 20000) {
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      if (el?.matches("input, textarea, select, [contenteditable='true']")) return;
      onRefresh();
    };

    const id = setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      if (el?.matches("input, textarea, select, [contenteditable='true']")) return;
      onRefresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, onRefresh, intervalMs]);
}
