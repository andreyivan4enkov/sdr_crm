import type { CrmNavItem } from "../lib/crm-nav";
import { Menu } from "lucide-react";

const MOBILE_PRIMARY_COUNT = 3;

type Props = {
  crmView: string;
  setCrmView: (view: string) => void;
  nav: CrmNavItem[];
  onMore: () => void;
  t: { muted: string; text: string; border: string; surface: string };
};

export function MobileCrmNav({ crmView, setCrmView, nav, onMore, t }: Props) {
  const primary = nav.slice(0, MOBILE_PRIMARY_COUNT);
  const inMore = !primary.some((n) => n.k === crmView) && nav.some((n) => n.k === crmView);

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 w-full max-w-full z-40 border-t backdrop-blur-md overflow-hidden ${t.border} ${t.surface}/95 pb-[env(safe-area-inset-bottom)]`}
      aria-label="Навигация CRM"
    >
      <div className="grid h-14 pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
        {primary.map((n) => {
          const active = crmView === n.k;
          return (
            <button
              key={n.k}
              type="button"
              onClick={() => setCrmView(n.k)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition py-1 ${
                active ? "text-teal-600 dark:text-teal-400" : t.muted
              }`}
            >
              <n.icon className="w-5 h-5" />
              {n.label}
            </button>
          );
        })}
        {nav.length > MOBILE_PRIMARY_COUNT && (
          <button
            type="button"
            onClick={onMore}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
              inMore ? "text-teal-600 dark:text-teal-400" : t.muted
            }`}
          >
            <Menu className="w-5 h-5" />
            Ещё
          </button>
        )}
      </div>
    </nav>
  );
}

export { MOBILE_PRIMARY_COUNT };
