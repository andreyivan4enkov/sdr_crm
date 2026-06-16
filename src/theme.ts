/** Корпоративная палитра с https://jbrealty.ru/ */
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

export type ThemeState = {
  colorMode: ColorMode;
  brandOn: boolean;
};

/** @deprecated legacy single-key theme */
export type ThemePref = "light" | "dark" | "brand";

export function migrateLegacyTheme(stored: string | null | undefined): ThemeState {
  if (stored === "dark") return { colorMode: "dark", brandOn: false };
  if (stored === "brand" || stored === "auto") return { colorMode: "light", brandOn: true };
  return { colorMode: "light", brandOn: false };
}

export async function loadThemePrefs(
  get: (key: string) => Promise<string | null>,
): Promise<ThemeState> {
  const [colorMode, brand] = await Promise.all([get("jbr:colorMode"), get("jbr:brand")]);
  if (colorMode === "light" || colorMode === "dark") {
    return { colorMode, brandOn: brand === "1" || brand === "true" };
  }
  const legacy = await get("jbr:theme");
  return migrateLegacyTheme(legacy);
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

export function getTokens({ colorMode, brandOn }: ThemeState): ThemeTokens {
  if (colorMode === "dark") {
    return {
      app: "bg-slate-900",
      surface: "bg-slate-800",
      soft: "bg-slate-800",
      border: "border-slate-700",
      text: "text-slate-100",
      muted: "text-slate-400",
      subtle: "text-slate-300",
      input: "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500",
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
    muted: "text-slate-400",
    subtle: "text-slate-500",
    input: "bg-white border-stone-200 text-slate-700 placeholder-slate-400",
    hover: "hover:bg-stone-100",
    chip: "bg-stone-100 text-slate-600",
    board: "bg-stone-100/70",
    divide: "divide-stone-100",
  };
}

export function topBarBg({ colorMode, brandOn }: ThemeState, scrolled: boolean): string {
  if (colorMode === "dark") return scrolled ? "bg-slate-900/50" : "bg-slate-900/90";
  if (brandOn) return scrolled ? "bg-white/85" : "bg-white/95";
  return scrolled ? "bg-white/55" : "bg-white/90";
}
