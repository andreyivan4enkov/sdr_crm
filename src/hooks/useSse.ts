import { useEffect, useRef } from "react";

type SseHandler = (event: string, data: unknown) => void;

const EVENTS = ["notification", "incoming_call", "lead_created", "lead_updated", "lead_deleted", "connected", "ping"];

export function useSse(enabled: boolean, onEvent: SseHandler) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let retryMs = 2000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function dispatch(event: string, data: unknown) {
      if (event === "ping" || event === "connected") return;
      handlerRef.current(event, data);
    }

    function parsePayload(raw: string, fallbackEvent: string) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "event" in parsed) {
          return { event: String(parsed.event), data: parsed.data ?? parsed };
        }
        return { event: fallbackEvent, data: parsed };
      } catch {
        return null;
      }
    }

    function connect() {
      if (closed) return;
      es?.close();
      es = new EventSource("/api/events/stream", { withCredentials: true });

      es.onopen = () => { retryMs = 2000; };

      es.onmessage = (e) => {
        const p = parsePayload(e.data, "message");
        if (p) dispatch(p.event, p.data);
      };

      for (const ev of EVENTS) {
        es.addEventListener(ev, (e) => {
          const p = parsePayload((e as MessageEvent).data, ev);
          if (p) dispatch(p.event, p.data);
        });
      }

      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 1.5, 30000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [enabled]);
}
