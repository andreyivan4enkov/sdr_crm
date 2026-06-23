import { useTheme } from "../context/ThemeProvider";
import type { AuthUser } from "@sdr-crm/api-client";
import type { ThemeTokens } from "../theme";
import { CrmNavMenuSettings } from "../components/CrmNavMenuSettings";
import { LanguageSettings } from "../components/LanguageSettings";
import { useCrmNavPrefs } from "../hooks/useCrmNavPrefs";

export function AppearanceSettings({ t, user }: { t: ThemeTokens; user: AuthUser }) {
  const { theme, setUiSkin, setColorMode } = useTheme();
  const { prefs, setPrefs } = useCrmNavPrefs(user);

  return (
    <div className="space-y-6">
      <LanguageSettings theme={t} userId={user.id} />
      <CrmNavMenuSettings t={t} user={user} prefs={prefs} setPrefs={setPrefs} />
      <section className={`rounded-2xl border p-5 space-y-5 ${t.border} ${t.surface}`}>
      <div>
        <h3 className="font-semibold text-base">Оформление интерфейса</h3>
        <p className={`text-sm mt-1 ${t.muted}`}>Стандартный, неоморфный стиль секвенсора или AIboard Glass.</p>
      </div>

      <div className="space-y-2">
        <p className={`text-sm font-medium ${t.text}`}>Стиль UI</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setUiSkin("standard")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              theme.uiSkin === "standard" ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.muted}`
            }`}
          >
            Стандартный
          </button>
          <button
            type="button"
            onClick={() => setUiSkin("neomorphism")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              theme.uiSkin === "neomorphism" ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.muted}`
            }`}
          >
            ЦРМ Неоморфизм
          </button>
          <button
            type="button"
            onClick={() => setUiSkin("glass")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              theme.uiSkin === "glass" ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : `${t.border} ${t.muted}`
            }`}
          >
            AIboard Glass
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className={`text-sm font-medium ${t.text}`}>Тема</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setColorMode("light")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              theme.colorMode === "light" ? "border-teal-500 bg-teal-500/10 text-teal-700" : `${t.border} ${t.muted}`
            }`}
          >
            Светлая
          </button>
          <button
            type="button"
            onClick={() => setColorMode("dark")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              theme.colorMode === "dark" ? "border-teal-500 bg-teal-500/10 text-teal-300" : `${t.border} ${t.muted}`
            }`}
          >
            Тёмная
          </button>
        </div>
      </div>
      </section>
    </div>
  );
}
