/** Мост выбора элемента маски → AI Compose + ручной дизайн. */

import {
  maskComponentLabel,
  maskStyleKeyForTarget,
  normalizeMaskStylesMap,
  type MaskElementStyle,
  type MaskStylesMap,
} from "./mask-design";

export type MaskEditTarget = {
  /** id экземпляра в DOM (для AI и подсветки) */
  id: string;
  /** Ключ в mask-styles: component:… (инфоблок) или element:… */
  styleKey: string;
  label: string;
  /** data-mask-component — тип инфоблока */
  component?: string;
  slug: string;
};

type MaskEditState = {
  productSlug: string | null;
  target: MaskEditTarget | null;
  pickMode: boolean;
  styles: MaskStylesMap;
  stylesDirty: boolean;
  stylesSaving: boolean;
  viewGraphLoaded: boolean;
};

const state: MaskEditState = {
  productSlug: null,
  target: null,
  pickMode: false,
  styles: {},
  stylesDirty: false,
  stylesSaving: false,
  viewGraphLoaded: false,
};

const listeners = new Set<() => void>();

const MAX_STYLE_HISTORY = 5;
const styleUndo: MaskStylesMap[] = [];
const styleRedo: MaskStylesMap[] = [];

function snapshotStyles(): MaskStylesMap {
  return JSON.parse(JSON.stringify(state.styles)) as MaskStylesMap;
}

function pushStyleHistory() {
  styleUndo.push(snapshotStyles());
  if (styleUndo.length > MAX_STYLE_HISTORY) styleUndo.shift();
  styleRedo.length = 0;
}

function clearStyleHistory() {
  styleUndo.length = 0;
  styleRedo.length = 0;
}

export function canUndoMaskStyles(): boolean {
  return styleUndo.length > 0;
}

export function canRedoMaskStyles(): boolean {
  return styleRedo.length > 0;
}

export function undoMaskStyles(): boolean {
  if (!styleUndo.length) return false;
  styleRedo.push(snapshotStyles());
  if (styleRedo.length > MAX_STYLE_HISTORY) styleRedo.shift();
  state.styles = styleUndo.pop()!;
  state.stylesDirty = true;
  notify();
  return true;
}

export function redoMaskStyles(): boolean {
  if (!styleRedo.length) return false;
  styleUndo.push(snapshotStyles());
  if (styleUndo.length > MAX_STYLE_HISTORY) styleUndo.shift();
  state.styles = styleRedo.pop()!;
  state.stylesDirty = true;
  notify();
  return true;
}

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeMaskEdit(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMaskEditState(): Readonly<MaskEditState> {
  return state;
}

/** Блокировать клики по лидам/драг — только когда открыт редактор маски. */
export function isMaskPickBlocking(): boolean {
  return state.productSlug != null && state.pickMode;
}

export function setMaskEditProductSlug(slug: string | null) {
  state.productSlug = slug;
  if (slug) {
    state.pickMode = true;
    clearStyleHistory(); // сбрасывать историю при смене продукта
  } else {
    state.target = null;
    state.pickMode = false;
    state.styles = {};
    state.stylesDirty = false;
    state.viewGraphLoaded = false;
    clearStyleHistory();
  }
  notify();
}

export function setMaskEditPickMode(on: boolean) {
  state.pickMode = on;
  if (!on) state.target = null;
  notify();
}

export function setMaskEditTarget(target: MaskEditTarget | null) {
  state.target = target;
  notify();
}

export function setMaskStyles(styles: MaskStylesMap) {
  state.styles = styles;
  state.stylesDirty = false;
  state.viewGraphLoaded = true;
  clearStyleHistory();
  notify();
}

export function patchMaskElementStyle(styleKey: string, patch: Partial<MaskElementStyle>) {
  pushStyleHistory();
  const prev = state.styles[styleKey] ?? {};
  const next = { ...prev, ...patch };
  const cleaned = Object.fromEntries(
    Object.entries(next).filter(([, v]) => v != null && v !== ""),
  ) as MaskElementStyle;
  if (Object.keys(cleaned).length === 0) {
    const { [styleKey]: _, ...rest } = state.styles;
    state.styles = rest;
  } else {
    state.styles = { ...state.styles, [styleKey]: cleaned };
  }
  state.stylesDirty = true;
  notify();
}

export function resetMaskElementStyle(styleKey: string) {
  pushStyleHistory();
  const { [styleKey]: _, ...rest } = state.styles;
  state.styles = rest;
  state.stylesDirty = true;
  notify();
}

export function setMaskStylesSaving(saving: boolean) {
  state.stylesSaving = saving;
  notify();
}

export function setMaskStylesDirty(dirty: boolean) {
  state.stylesDirty = dirty;
  notify();
}

export function getMaskElementStyle(styleKey: string): MaskElementStyle {
  return state.styles[styleKey] ?? {};
}

/** Ближайший хост маски при подъёме от точки клика (не родительская колонка/воронка). */
export function findMaskHostElement(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.dataset.maskComponent) return cur;
    cur = cur.parentElement;
  }
  cur = el;
  while (cur) {
    if (cur.dataset.maskId) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function buildMaskTargetFromElement(
  el: HTMLElement,
  slug: string,
): MaskEditTarget | null {
  const node = findMaskHostElement(el);
  if (!node) return null;
  const component = node.dataset.maskComponent;
  const maskId = node.dataset.maskId;

  if (component) {
    return {
      id: component,
      styleKey: maskStyleKeyForTarget(component, component),
      label: maskComponentLabel(component),
      component,
      slug,
    };
  }

  if (!maskId) return null;
  return {
    id: maskId,
    styleKey: maskStyleKeyForTarget(maskId, undefined),
    label: node.dataset.maskLabel || maskId,
    slug,
  };
}

export function buildMaskComposeMessage(userText: string, target: MaskEditTarget): string {
  const base = userText.trim();
  const infoblock = target.component
    ? `Инфоблок «${maskComponentLabel(target.component)}» (component: ${target.component}, styleKey: ${target.styleKey})`
    : `Элемент UI (styleKey: ${target.styleKey})`;
  const scope = target.component
    ? " Стили — ко ВСЕМ экземплярам инфоблока (ключ component:), НЕ к данным конкретного лида."
    : "";
  if (!base) {
    return `Измени ${infoblock}.${scope} View-граф модуля «${target.slug}». mask-styles-root.`;
  }
  return `${infoblock}.${scope} Запрос: ${base}`;
}

/** Применить стили из compose-плана в живой UI (морфинг без ожидания apply). */
export function mergeMaskStylesFromMap(incoming: MaskStylesMap) {
  pushStyleHistory();
  const merged = { ...state.styles };
  for (const [key, patch] of Object.entries(normalizeMaskStylesMap(incoming))) {
    merged[key] = { ...(merged[key] ?? {}), ...patch };
  }
  state.styles = merged;
  state.stylesDirty = true;
  notify();
}
