/** PWA отключён: service worker кэшировал index.html и ломал загрузку после деплоя. */
export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  void (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }
  })();
}
