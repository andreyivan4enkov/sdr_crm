import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storageGet, storageSet } from "../storage";
import {
  getTokens,
  loadThemePrefs,
  type ColorMode,
  type ThemeState,
  type ThemeTokens,
  type UiSkin,
} from "../theme";

type ThemeContextValue = {
  theme: ThemeState;
  tokens: ThemeTokens;
  setColorMode: (mode: ColorMode) => void;
  toggleBrand: () => void;
  setUiSkin: (skin: UiSkin) => void;
  isNeomorphism: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeState>({ colorMode: "light", brandOn: false, uiSkin: "standard" });

  useEffect(() => {
    void loadThemePrefs(storageGet).then(setTheme);
  }, []);

  const setColorMode = useCallback((colorMode: ColorMode) => {
    setTheme((prev) => {
      const next = { ...prev, colorMode };
      void storageSet("jbr:colorMode", colorMode);
      return next;
    });
  }, []);

  const toggleBrand = useCallback(() => {
    setTheme((prev) => {
      const brandOn = !prev.brandOn;
      void storageSet("jbr:brand", brandOn ? "1" : "0");
      return { ...prev, brandOn };
    });
  }, []);

  const setUiSkin = useCallback((uiSkin: UiSkin) => {
    setTheme((prev) => {
      void storageSet("sdr:uiSkin", uiSkin);
      return { ...prev, uiSkin };
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      tokens: getTokens(theme),
      setColorMode,
      toggleBrand,
      setUiSkin,
      isNeomorphism: theme.uiSkin === "neomorphism",
    }),
    [theme, setColorMode, toggleBrand, setUiSkin],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme requires ThemeProvider");
  return ctx;
}
