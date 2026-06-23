import { X, Smartphone } from "lucide-react";
import type { CrmNavItem } from "../lib/crm-nav";
import { MOBILE_PRIMARY_COUNT } from "./MobileCrmNav";

type Props = {
  open: boolean;
  onClose: () => void;
  crmView: string;
  setCrmView: (view: string) => void;
  nav: CrmNavItem[];
  t: { surface: string; border: string; text: string; muted: string; hover: string; divide: string };
};

export function MobileMoreSheet({ open, onClose, crmView, setCrmView, nav, t }: Props) {
  if (!open) return null;

  const items = nav.slice(MOBILE_PRIMARY_COUNT);

  function pick(k: string) {
    setCrmView(k);
    onClose();
  }

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Дополнительные разделы">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрыть" />
      <div className={`absolute bottom-0 inset-x-0 rounded-t-2xl border-t shadow-2xl ${t.surface} ${t.border} pb-[env(safe-area-inset-bottom)]`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${t.border}`}>
          <span className="font-semibold text-sm">Разделы</span>
          <button type="button" onClick={onClose} className={t.muted} aria-label="Закрыть"><X className="w-5 h-5" /></button>
        </div>
        <div className={`divide-y ${t.divide} max-h-[60vh] overflow-y-auto`}>
          <div className={`px-4 py-3 ${t.muted}`}>
            <p className="text-xs font-medium text-teal-600 dark:text-teal-400 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Приложение на телефоне</p>
            <p className="text-xs mt-1 leading-relaxed">
              iPhone (Safari): Поделиться → «На экран Домой» → Добавить.
              Android (Chrome): меню ⋮ → «Установить приложение».
            </p>
          </div>
          {items.length === 0 && (
            <p className={`px-4 py-6 text-sm text-center ${t.muted}`}>Все разделы уже в нижней панели.</p>
          )}
          {items.map((n) => (
            <button
              key={n.k}
              type="button"
              onClick={() => pick(n.k)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm transition ${t.hover} ${
                crmView === n.k ? "text-teal-600 dark:text-teal-400 font-medium" : t.text
              }`}
            >
              <n.icon className="w-5 h-5 shrink-0" />
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
