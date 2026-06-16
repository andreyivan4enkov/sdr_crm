import { PanelLeftClose, PanelTop } from "lucide-react";
import type { ThemeTokens } from "../theme";
import type { CrmNavItem, NavLayout } from "../lib/crm-nav";

type Props = {
  nav: CrmNavItem[];
  crmView: string;
  setCrmView: (view: string) => void;
  t: ThemeTokens;
  layout: NavLayout;
  onLayoutChange: (layout: NavLayout) => void;
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
};

export function CrmNavSidebar({
  nav, crmView, setCrmView, t, layout, onLayoutChange, mobile, open, onClose,
}: Props) {
  function pick(k: string) {
    setCrmView(k);
    onClose?.();
  }

  const inner = (
    <>
      <nav className="flex-1 overflow-y-auto nice-scroll py-2 px-2 space-y-0.5" aria-label="Разделы CRM">
        {nav.map((n) => {
          const active = crmView === n.k;
          return (
            <button
              key={n.k}
              type="button"
              onClick={() => pick(n.k)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                active
                  ? "bg-teal-600 text-white shadow-sm dark:bg-teal-600"
                  : `${t.muted} ${t.hover}`
              }`}
            >
              <n.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{n.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={`shrink-0 p-2 border-t ${t.border}`}>
        <button
          type="button"
          title="Горизонтальное меню сверху"
          onClick={() => onLayoutChange("horizontal")}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition ${t.muted} ${t.hover}`}
        >
          <PanelTop className="w-4 h-4 shrink-0" />
          Меню сверху
        </button>
      </div>
    </>
  );

  if (mobile) {
    if (!open) return null;
    return (
      <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Меню CRM">
        <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрыть" />
        <aside className={`absolute left-0 top-0 bottom-0 w-[min(17rem,85vw)] flex flex-col border-r shadow-2xl ${t.surface} ${t.border}`}>
          <div className={`flex items-center justify-between px-4 h-12 border-b shrink-0 ${t.border}`}>
            <span className="font-semibold text-sm">Разделы</span>
            <button type="button" onClick={onClose} className={t.muted} aria-label="Закрыть">
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>
          {inner}
        </aside>
      </div>
    );
  }

  if (layout !== "vertical") return null;

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-14 bottom-0 w-56 flex-col border-r z-30 ${t.border} ${t.surface}`}
      aria-label="Боковое меню CRM"
    >
      {inner}
    </aside>
  );
}
