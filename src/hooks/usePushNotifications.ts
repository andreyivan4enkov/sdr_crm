import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window,
    );
  }, []);

  const subscribe = useCallback(async () => {
    setError("");
    if (!supported) {
      setError("Браузер не поддерживает push-уведомления");
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setError("Разрешение на уведомления не выдано");
      return false;
    }
    const vapid = await api.getVapidPublicKey();
    if (!vapid.available || !vapid.publicKey) {
      setError("Push не настроен на сервере (VAPID-ключи)");
      return false;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    });
    const json = sub.toJSON();
    await api.subscribePush({
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
    });
    setSubscribed(true);
    return true;
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setError("");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }, []);

  useEffect(() => {
    if (!enabled || !supported) return;
    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      reg?.pushManager.getSubscription().then((sub) => setSubscribed(!!sub));
    }).catch(() => {});
  }, [enabled, supported]);

  return { supported, subscribed, error, subscribe, unsubscribe };
}
