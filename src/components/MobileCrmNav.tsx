import type { ComponentType } from "react";
import { Columns, ListTodo, BarChart3, Menu } from "lucide-react";

type NavItem = { k: string; label: string; icon: ComponentType<{ className?: string }> };

const PRIMARY: NavItem[] = [
  { k: "crm", label: "CRM", icon: Columns },
  { k: "tasks", label: "Задачи", icon: ListTodo },
  { k: "analytics", label: "Аналитика", icon: BarChart3 },
];

type Props = {
  crmView: string;
  setCrmView: (view: string) => void;
  onMore: () => void;
  t: { muted: string; text: string; border: string; surface: string };
};

export function MobileCrmNav({ crmView, setCrmView, onMore, t }: Props) {
  const inMore = !PRIMARY.some((n) => n.k === crmView);

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 w-full max-w-full z-40 border-t backdrop-blur-md overflow-hidden ${t.border} ${t.surface}/95 pb-[env(safe-area-inset-bottom)]`}
      aria-label="Навигация CRM"
    >
      <div className="grid h-14 grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY.map((n) => {
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
      </div>
    </nav>
  );
}
