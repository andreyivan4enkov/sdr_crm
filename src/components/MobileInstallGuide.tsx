import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { useIsMobile } from "../hooks/useMediaQuery";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type Props = { t: { surface: string; border: string; muted: string } };

/** Компактная подсказка PWA — только мобильные, над нижним меню */
export function MobileInstallGuide({ t }: Props) {
  const isMobile = useIsMobile();
  const [hidden, setHidden] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isMobile || isStandalone()) return;
    try {
      if (localStorage.getItem("jbr:install-hint-dismiss") === "1") return;
    } catch { /* ignore */ }
    setHidden(false);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [isMobile]);

  if (!isMobile || hidden || isStandalone()) return null;

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem("jbr:install-hint-dismiss", "1"); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    dismiss();
  }

  return (
    <div className={`md:hidden fixed left-2 right-2 z-30 bottom-[calc(3.75rem+env(safe-area-inset-bottom))]`}>
      <div className={`rounded-xl border shadow-lg px-3 py-2.5 flex items-center gap-2.5 ${t.surface} ${t.border}`}>
        <Smartphone className="w-4 h-4 text-teal-600 shrink-0" />
        <p className={`flex-1 text-xs ${t.muted} leading-snug`}>
          {deferred ? "Установите CRM как приложение" : "Добавьте ярлык на главный экран"}
        </p>
        {deferred ? (
          <button type="button" onClick={() => void install()}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium">
            Установить
          </button>
        ) : (
          <button type="button" onClick={dismiss} className={`shrink-0 text-xs ${t.muted} underline`}>
            Ок
          </button>
        )}
        <button type="button" onClick={dismiss} className={t.muted} aria-label="Закрыть">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
