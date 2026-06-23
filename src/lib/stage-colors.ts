import type { CSSProperties } from "react";
import type { TaskStatus } from "../api/client";
import type { ColorMode, UiSkin } from "../theme";
import { getNeoTokens, inset, raised } from "../sequencer/neomorphism";

function accentAlpha(colorMode: ColorMode, strong: boolean) {
  if (colorMode === "dark") {
    return { soft: strong ? "58" : "48", tint: strong ? "38" : "28", blip: strong ? "58" : "46" };
  }
  return { soft: strong ? "30" : "22", tint: strong ? "14" : "0c", blip: strong ? "2a" : "1e" };
}

/** Tailwind 500 — для inline-теней (не зависят от JIT) */
export const STAGE_COLOR_HEX: Record<string, string> = {
  sky: "#0ea5e9",
  cyan: "#06b6d4",
  teal: "#14b8a6",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  violet: "#8b5cf6",
  indigo: "#6366f1",
  rose: "#f43f5e",
  slate: "#64748b",
};

export const STAGE_COLORS = Object.keys(STAGE_COLOR_HEX);

/** Палитра воронки: холодные → нейтральные → тёплые (аналоговая гармония) */
const FUNNEL_HARMONY = ["sky", "cyan", "teal", "emerald", "amber", "orange", "violet", "rose"] as const;

export function stageHex(color?: string | null) {
  if (!color) return STAGE_COLOR_HEX.teal;
  return STAGE_COLOR_HEX[color] ?? STAGE_COLOR_HEX.teal;
}

/** CSS-переменные акцента этапа для .bio-entity-card и панелей */
export function entityCardAccentVars(
  colorKey: string,
  strong = false,
  colorMode: ColorMode = "light",
): CSSProperties {
  const hex = stageHex(colorKey);
  const { soft, tint, blip } = accentAlpha(colorMode, strong);
  return {
    "--entity-accent": hex,
    "--entity-accent-soft": `${hex}${soft}`,
    "--entity-blip": `${hex}${blip}`,
    "--entity-tint": `${hex}${tint}`,
  } as CSSProperties;
}

function bioInnerBlipShadow(hex: string, strong = false, lightBlip = false): string {
  const blip = strong ? "2a" : "1e";
  const innerLight = lightBlip
    ? "inset 0 14px 32px -16px rgba(255,255,255,0.22)"
    : `inset 0 16px 36px -28px ${hex}${blip}`;
  return [
    `inset 0 1px 0 rgba(255,255,255,${strong ? "0.18" : "0.12"})`,
    innerLight,
    "inset 0 -10px 22px -20px rgba(0,0,0,0.12)",
  ].join(", ");
}

function bioTintBg(hex: string, strong = false): string {
  const blip = strong ? "2a" : "1e";
  const tint = strong ? "14" : "0a";
  return [
    `linear-gradient(165deg, rgba(255,255,255,${strong ? "0.18" : "0.12"}) 0%, transparent 44%)`,
    `radial-gradient(ellipse 88% 68% at 14% -10%, ${hex}${blip} 0%, transparent 70%)`,
    `linear-gradient(155deg, ${hex}${tint} 0%, transparent 54%)`,
  ].join(", ");
}

function bioFilledBg(hex: string): string {
  return [
    "linear-gradient(165deg, rgba(255,255,255,0.32) 0%, transparent 46%)",
    `linear-gradient(145deg, ${hex}ee 0%, ${hex}c0 100%)`,
  ].join(", ");
}

/** Контур + внутренний блик (биоморфизм) */
export function statusContourStyle(
  colorKey: string,
  strong = false,
  colorMode: ColorMode = "light",
): CSSProperties {
  const hex = stageHex(colorKey);
  const { soft } = accentAlpha(colorMode, strong);
  return {
    borderColor: `${hex}${soft}`,
    borderWidth: 1,
    borderStyle: "solid",
    backgroundImage: bioTintBg(hex, strong || colorMode === "dark"),
    boxShadow: bioInnerBlipShadow(hex, strong || colorMode === "dark"),
  };
}

/** @deprecated используйте statusContourStyle */
export function statusGlowStyle(colorKey: string, strong = false): CSSProperties {
  return statusContourStyle(colorKey, strong);
}

export function stagePillStyle(
  colorKey: string,
  active: boolean,
  colorMode: ColorMode = "light",
): CSSProperties {
  const hex = stageHex(colorKey);
  const strong = colorMode === "dark";
  if (active) {
    return {
      backgroundImage: bioFilledBg(hex),
      borderColor: `${hex}${strong ? "66" : "44"}`,
      color: "#fff",
      boxShadow: bioInnerBlipShadow(hex, true, true),
    };
  }
  return {
    borderColor: `${hex}${strong ? "42" : "28"}`,
    color: strong ? hex : hex,
    backgroundImage: bioTintBg(hex, strong),
    boxShadow: bioInnerBlipShadow(hex, strong),
  };
}

/** Ступени воронки в карточке лида — мягкие «капсулы» с внутренним бликом */
export function stagePipelineStyle(
  colorKey: string,
  active: boolean,
  done: boolean,
  colorMode: ColorMode = "light",
): CSSProperties {
  const hex = stageHex(colorKey);
  const strong = colorMode === "dark";
  if (active) {
    return {
      backgroundImage: bioFilledBg(hex),
      color: "#fff",
      border: `1px solid ${hex}${strong ? "55" : "40"}`,
      boxShadow: bioInnerBlipShadow(hex, true, true),
    };
  }
  if (done) {
    return {
      backgroundImage: bioTintBg(hex, true),
      color: hex,
      border: `1px solid ${hex}${strong ? "48" : "30"}`,
      boxShadow: bioInnerBlipShadow(hex, strong),
    };
  }
  return {
    backgroundImage: bioTintBg(hex, strong),
    color: strong ? hex : `${hex}aa`,
    border: `1px solid ${hex}${strong ? "32" : "18"}`,
    boxShadow: [
      `inset 0 1px 0 rgba(255, 255, 255, ${strong ? "0.1" : "0.06"})`,
      `inset 0 12px 28px -24px ${hex}${strong ? "22" : "12"}`,
    ].join(", "),
  };
}

/** Запись журнала — мягкий блок с внутренним бликом */
export function bioNoteStyle(colorKey?: string | null): CSSProperties {
  const hex = stageHex(colorKey);
  return {
    borderRadius: 14,
    padding: "12px 14px",
    backgroundImage: bioTintBg(hex, false),
    boxShadow: [
      `inset 4px 0 16px -8px ${hex}28`,
      bioInnerBlipShadow(hex, false),
    ].join(", "),
  };
}

/** Рекомендация цвета по позиции в воронке */
export function recommendStageColor(index: number, total: number): string {
  if (total <= 1) return "teal";
  const t = Math.max(0, Math.min(1, index / Math.max(1, total - 1)));
  const idx = Math.round(t * (FUNNEL_HARMONY.length - 1));
  return FUNNEL_HARMONY[idx];
}

export function harmonyHint(index: number, total: number): string {
  const ratio = index / Math.max(1, total - 1);
  if (ratio < 0.34) return "Холодный тон — начало воронки";
  if (ratio < 0.67) return "Нейтральный тон — середина воронки";
  return "Тёплый тон — завершение воронки";
}

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  new: "sky",
  in_progress: "teal",
  waiting: "amber",
  deferred: "slate",
  completed: "emerald",
};

/** Тёмный текст для бейджей на светлом фоне */
const TASK_STATUS_TEXT: Record<string, string> = {
  sky: "#075985",
  teal: "#115e59",
  amber: "#92400e",
  slate: "#334155",
  emerald: "#065f46",
};

/** Светлый текст для бейджей на тёмном фоне */
const TASK_STATUS_TEXT_DARK: Record<string, string> = {
  sky: "#bae6fd",
  teal: "#99f6e4",
  amber: "#fde68a",
  slate: "#cbd5e1",
  emerald: "#a7f3d0",
};

function taskStatusTextColor(key: string, colorMode: ColorMode): string {
  if (colorMode === "dark") return TASK_STATUS_TEXT_DARK[key] ?? stageHex(key);
  return TASK_STATUS_TEXT[key] ?? stageHex(key);
}

export function taskStatusContourStyle(status: TaskStatus, strong = false): CSSProperties {
  return statusContourStyle(TASK_STATUS_COLOR[status] ?? "teal", strong);
}

export function taskStatusGlowStyle(status: TaskStatus, strong = false): CSSProperties {
  return taskStatusContourStyle(status, strong);
}

export function taskStatusColorKey(status: TaskStatus): string {
  return TASK_STATUS_COLOR[status] ?? "teal";
}

/** Кнопки статуса в карточке задачи */
export function taskStatusPillStyle(
  status: TaskStatus,
  active: boolean,
  colorMode: ColorMode = "light",
  uiSkin: UiSkin = "standard",
): CSSProperties {
  const key = taskStatusColorKey(status);
  const hex = stageHex(key);

  if (uiSkin === "neomorphism") {
    const T = getNeoTokens(colorMode);
    if (active) {
      return {
        background: `color-mix(in srgb, ${hex} ${colorMode === "dark" ? "24%" : "16%"}, ${T.bg})`,
        border: "none",
        color: hex,
        fontWeight: 600,
        boxShadow: inset(T, 3, 8),
      };
    }
    return {
      background: T.bg,
      border: "none",
      color: taskStatusTextColor(key, colorMode),
      fontWeight: 500,
      boxShadow: raised(T, 4, 10),
    };
  }

  if (active) {
    return {
      backgroundImage: bioFilledBg(hex),
      border: `1px solid ${hex}66`,
      color: "#ffffff",
      fontWeight: 600,
      boxShadow: bioInnerBlipShadow(hex, true, true),
    };
  }
  const text = taskStatusTextColor(key, colorMode);
  const border = colorMode === "dark" ? `${hex}58` : `${hex}30`;
  return {
    backgroundImage: bioTintBg(hex, colorMode === "dark"),
    border: `1px solid ${border}`,
    color: text,
    fontWeight: 500,
    boxShadow: bioInnerBlipShadow(hex, false),
  };
}

/** Бейдж статуса задачи */
export function taskStatusBadgeStyle(
  status: TaskStatus,
  colorMode: ColorMode = "light",
  uiSkin: UiSkin = "standard",
): CSSProperties {
  const key = taskStatusColorKey(status);
  const hex = stageHex(key);

  if (uiSkin === "neomorphism") {
    const T = getNeoTokens(colorMode);
    return {
      background: T.bg,
      border: "none",
      color: hex,
      fontWeight: 600,
      boxShadow: raised(T, 3, 8),
    };
  }

  const text = taskStatusTextColor(key, colorMode);
  const border = colorMode === "dark" ? `${hex}62` : `${hex}45`;
  return {
    backgroundImage: bioTintBg(hex, colorMode === "dark"),
    color: text,
    border: `1px solid ${border}`,
    fontWeight: 600,
    boxShadow: bioInnerBlipShadow(hex, false),
  };
}
