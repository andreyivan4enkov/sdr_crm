import type { CSSProperties } from "react";
import type { TaskStatus } from "../api/client";

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

/** Контур + мягкое свечение (биоморфизм: без резких колец) */
export function statusContourStyle(colorKey: string, strong = false): CSSProperties {
  const hex = stageHex(colorKey);
  const soft = strong ? "30" : "1c";
  const glow1 = strong ? "24" : "14";
  const glow2 = strong ? "38" : "22";
  return {
    borderColor: `${hex}${soft}`,
    borderWidth: 1,
    borderStyle: "solid",
    backgroundImage: `linear-gradient(145deg, ${hex}${strong ? "12" : "08"} 0%, transparent 58%)`,
    boxShadow: [
      `0 2px 10px -3px ${hex}${glow1}`,
      `0 14px 32px -12px ${hex}${glow2}`,
      "inset 0 1px 0 rgba(255,255,255,0.45)",
    ].join(", "),
  };
}

/** @deprecated используйте statusContourStyle */
export function statusGlowStyle(colorKey: string, strong = false): CSSProperties {
  return statusContourStyle(colorKey, strong);
}

export function stagePillStyle(colorKey: string, active: boolean): CSSProperties {
  const hex = stageHex(colorKey);
  if (active) {
    return {
      background: `linear-gradient(145deg, ${hex}ee, ${hex}c8)`,
      borderColor: `${hex}44`,
      color: "#fff",
      boxShadow: `0 4px 14px -4px ${hex}50, inset 0 1px 0 rgba(255,255,255,0.28)`,
    };
  }
  return {
    borderColor: `${hex}28`,
    color: hex,
    background: `linear-gradient(145deg, ${hex}14, ${hex}06)`,
    boxShadow: `0 2px 8px -4px ${hex}18`,
  };
}

/** Ступени воронки в карточке лида — мягкие «капсулы» вместо острых шевронов */
export function stagePipelineStyle(colorKey: string, active: boolean, done: boolean): CSSProperties {
  const hex = stageHex(colorKey);
  if (active) {
    return {
      background: `linear-gradient(145deg, ${hex}ee, ${hex}b8)`,
      color: "#fff",
      border: `1px solid ${hex}40`,
      boxShadow: `0 6px 18px -6px ${hex}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
    };
  }
  if (done) {
    return {
      background: `linear-gradient(145deg, ${hex}1a, ${hex}08)`,
      color: hex,
      border: `1px solid ${hex}30`,
      boxShadow: `0 3px 10px -5px ${hex}28`,
    };
  }
  return {
    background: `linear-gradient(145deg, ${hex}08, transparent)`,
    color: `${hex}aa`,
    border: `1px solid ${hex}18`,
  };
}

/** Запись журнала — мягкий «выпуклый» блок без резкой левой линии */
export function bioNoteStyle(colorKey?: string | null): CSSProperties {
  const hex = stageHex(colorKey);
  return {
    borderRadius: 14,
    padding: "12px 14px",
    background: `linear-gradient(135deg, ${hex}12 0%, ${hex}05 100%)`,
    boxShadow: `inset 3px 0 14px -6px ${hex}35, 0 2px 10px -5px rgba(0,0,0,0.06)`,
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
export function taskStatusPillStyle(status: TaskStatus, active: boolean): CSSProperties {
  const key = taskStatusColorKey(status);
  const hex = stageHex(key);
  if (active) {
    return {
      background: `linear-gradient(145deg, ${hex} 0%, ${hex}d8 100%)`,
      border: `1px solid ${hex}66`,
      color: "#ffffff",
      fontWeight: 600,
      boxShadow: `0 3px 12px -4px ${hex}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
    };
  }
  const text = TASK_STATUS_TEXT[key] ?? hex;
  return {
    background: `linear-gradient(145deg, ${hex}18 0%, ${hex}08 100%)`,
    border: `1px solid ${hex}30`,
    color: text,
    fontWeight: 500,
  };
}

/** Бейдж статуса задачи */
export function taskStatusBadgeStyle(status: TaskStatus): CSSProperties {
  const key = taskStatusColorKey(status);
  const hex = stageHex(key);
  const text = TASK_STATUS_TEXT[key] ?? hex;
  return {
    background: `linear-gradient(145deg, ${hex}22 0%, ${hex}12 100%)`,
    color: text,
    border: `1px solid ${hex}45`,
    fontWeight: 600,
  };
}
