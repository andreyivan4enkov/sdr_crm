import { useEffect, useRef } from "react";

type Options = {
  enabled?: boolean;
  minDistance?: number;
  maxVertical?: number;
  edgeOnly?: boolean;
};

/**
 * Свайп слева направо — «назад» (iOS-style).
 * edgeOnly: жест только от левого края экрана.
 */
export function useSwipeBack(onBack: () => void, options: Options = {}) {
  const {
    enabled = true,
    minDistance = 72,
    maxVertical = 48,
    edgeOnly = false,
  } = options;
  const onBackRef = useRef(onBack);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return;

    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      if (edgeOnly && t.clientX > 28) return;
      startRef.current = { x: t.clientX, y: t.clientY };
    }

    function onEnd(e: TouchEvent) {
      if (!startRef.current) return;
      const t = e.changedTouches[0];
      if (!t) {
        startRef.current = null;
        return;
      }
      const dx = t.clientX - startRef.current.x;
      const dy = Math.abs(t.clientY - startRef.current.y);
      startRef.current = null;
      if (dx >= minDistance && dy <= maxVertical) onBackRef.current();
    }

    function onCancel() {
      startRef.current = null;
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, minDistance, maxVertical, edgeOnly]);
}
