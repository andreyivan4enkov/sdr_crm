/** Корпоративная палитра с https://example.com/ */
export const JB_BRAND = {
  accent: "#ff8b6a",
  accentHover: "#f07858",
  accentLight: "#fff0eb",
  accentMuted: "#ffb89e",
  dark: "#303030",
  muted: "#838383",
  subtle: "#9c9c9c",
  border: "#e8e8e8",
  surface: "#ffffff",
  app: "#fafaf9",
} as const;

export type ColorMode = "light" | "dark";
export type UiSkin = "standard" | "neomorphism" | "glass";

export type ThemeState = {
  colorMode: ColorMode;
  brandOn: boolean;
  uiSkin: UiSkin;
};

/** @deprecated legacy single-key theme */
export type ThemePref = "light" | "dark" | "brand";

export function migrateLegacyTheme(stored: string | null | undefined): ThemeState {
  if (stored === "dark") return { colorMode: "dark", brandOn: false, uiSkin: "standard" };
  if (stored === "brand" || stored === "auto") return { colorMode: "light", brandOn: true, uiSkin: "standard" };
  return { colorMode: "light", brandOn: false, uiSkin: "standard" };
}

export async function loadThemePrefs(
  get: (key: string) => Promise<string | null>,
): Promise<ThemeState> {
  const [colorMode, brand, uiSkin] = await Promise.all([
    get("jbr:colorMode"),
    get("jbr:brand"),
    get("sdr:uiSkin"),
  ]);
  const skin: UiSkin =
    uiSkin === "neomorphism" ? "neomorphism"
      : uiSkin === "glass" ? "glass"
        : "standard";
  if (colorMode === "light" || colorMode === "dark") {
    return { colorMode, brandOn: brand === "1" || brand === "true", uiSkin: skin };
  }
  const legacy = await get("jbr:theme");
  return { ...migrateLegacyTheme(legacy), uiSkin: skin };
}

export type ThemeTokens = {
  app: string;
  surface: string;
  soft: string;
  border: string;
  text: string;
  muted: string;
  subtle: string;
  input: string;
  hover: string;
  chip: string;
  board: string;
  divide: string;
};

export function getTokens({ colorMode, brandOn, uiSkin }: ThemeState): ThemeTokens {
  if (uiSkin === "glass") {
    return {
      app: "glass-app",
      surface: "glass-surface",
      soft: "glass-soft",
      border: "glass-border",
      text: "glass-text",
      muted: "glass-muted",
      subtle: "glass-subtle",
      input: "glass-input",
      hover: "glass-hover",
      chip: "glass-chip",
      board: "glass-board",
      divide: "glass-divide",
    };
  }
  if (uiSkin === "neomorphism") {
    if (colorMode === "dark") {
      return {
        app: "neo-app",
        surface: "neo-surface",
        soft: "neo-soft",
        border: "neo-border",
        text: "neo-text",
        muted: "neo-muted",
        subtle: "neo-subtle",
        input: "neo-input",
        hover: "neo-hover",
        chip: "neo-chip",
        board: "neo-board",
        divide: "neo-divide",
      };
    }
    return {
      app: "neo-app",
      surface: "neo-surface",
      soft: "neo-soft",
      border: "neo-border",
      text: "neo-text",
      muted: "neo-muted",
      subtle: "neo-subtle",
      input: "neo-input",
      hover: "neo-hover",
      chip: "neo-chip",
      board: "neo-board",
      divide: "neo-divide",
    };
  }
  if (colorMode === "dark") {
    return {
      app: "bg-slate-900",
      surface: "bg-slate-800",
      soft: "bg-slate-800",
      border: "border-slate-700",
      text: "text-slate-100",
      muted: "text-slate-300",
      subtle: "text-slate-200",
      input: "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-400",
      hover: "hover:bg-slate-700",
      chip: "bg-slate-700 text-slate-200",
      board: "bg-slate-800/50",
      divide: "divide-slate-700",
    };
  }
  if (brandOn) {
    return {
      app: "bg-[#fafaf9]",
      surface: "bg-white",
      soft: "bg-[#fff8f6]",
      border: "border-[#e8e8e8]",
      text: "text-[#303030]",
      muted: "text-[#838383]",
      subtle: "text-[#9c9c9c]",
      input: "bg-white border-[#e0e0e0] text-[#303030] placeholder-[#9c9c9c]",
      hover: "hover:bg-[#fff0eb]",
      chip: "bg-[#f5f5f4] text-[#303030]",
      board: "bg-[#fff8f6]/80",
      divide: "divide-[#ececec]",
    };
  }
  return {
    app: "bg-stone-50",
    surface: "bg-white",
    soft: "bg-stone-50",
    border: "border-stone-200",
    text: "text-slate-700",
    muted: "text-slate-500",
    subtle: "text-slate-600",
    input: "bg-white border-stone-200 text-slate-700 placeholder-slate-400",
    hover: "hover:bg-stone-100",
    chip: "bg-stone-100 text-slate-600",
    board: "bg-stone-100/70",
    divide: "divide-stone-100",
  };
}

export function topBarBg(theme: ThemeState, scrolled: boolean): string {
  if (theme.uiSkin === "glass") {
    return scrolled ? "glass-topbar glass-topbar--scrolled" : "glass-topbar";
  }
  if (theme.uiSkin === "neomorphism") {
    return scrolled ? "neo-topbar neo-topbar--scrolled" : "neo-topbar";
  }
  const { colorMode, brandOn } = theme;
  if (colorMode === "dark") return scrolled ? "bg-slate-900/50" : "bg-slate-900/90";
  if (brandOn) return scrolled ? "bg-white/85" : "bg-white/95";
  return scrolled ? "bg-white/55" : "bg-white/90";
}
