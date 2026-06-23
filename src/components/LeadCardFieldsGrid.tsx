import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Maximize2, Minimize2 } from "lucide-react";
import type { Field, LeadCardLayout, GridLayoutCell } from "../api/client";

export const GRID_COLS = 4;
const ROW_HEIGHT = 72;
const GRID_GAP = 12;

export const DEFAULT_BUILTIN_LAYOUT: LeadCardLayout = {
  email: { gridCol: 0, gridRow: 0, gridSpan: 2 },
  region: { gridCol: 2, gridRow: 0, gridSpan: 2 },
  preferredTime: { gridCol: 0, gridRow: 1, gridSpan: 2 },
  channel: { gridCol: 2, gridRow: 1, gridSpan: 2 },
};

export type BuiltinFieldKey = keyof LeadCardLayout;

export type GridFieldItem = {
  id: string;
  kind: "builtin" | "custom";
  builtinKey?: BuiltinFieldKey;
  field?: Field;
  layout: GridLayoutCell;
};

function normalizeSpan(span: number) {
  return Math.min(GRID_COLS, Math.max(1, span));
}

function normalizeCol(col: number, span: number) {
  const s = normalizeSpan(span);
  return Math.min(GRID_COLS - s, Math.max(0, col));
}

function cellsOverlap(a: GridLayoutCell, b: GridLayoutCell) {
  if (a.gridRow !== b.gridRow) return false;
  return a.gridCol < b.gridCol + b.gridSpan && b.gridCol < a.gridCol + a.gridSpan;
}

function defaultCustomLayout(index: number, baseRow: number): GridLayoutCell {
  const col = (index % 2) * 2;
  const row = baseRow + Math.floor(index / 2);
  return { gridCol: col, gridRow: row, gridSpan: 2 };
}

function isUnsetGrid(f: Field) {
  return (f.gridRow ?? 0) === 0 && (f.gridCol ?? 0) === 0;
}

export function buildGridItems(fields: Field[], cardLayout?: LeadCardLayout, hiddenKeys?: string[]): GridFieldItem[] {
  const hidden = new Set(hiddenKeys || []);
  const builtins: GridFieldItem[] = (Object.keys(DEFAULT_BUILTIN_LAYOUT) as BuiltinFieldKey[])
    .filter((key) => !hidden.has(key))
    .map((key) => ({
    id: `builtin:${key}`,
    kind: "builtin" as const,
    builtinKey: key,
    layout: {
      ...DEFAULT_BUILTIN_LAYOUT[key]!,
      ...(cardLayout?.[key] || {}),
    },
  }));

  const maxBuiltinRow = builtins.length ? Math.max(...builtins.map((b) => b.layout.gridRow), 1) : 1;
  const baseRow = maxBuiltinRow + 1;

  const customs = fields
    .filter((f) => !hidden.has(f.id))
    .map((f, i) => {
    const fallback = defaultCustomLayout(i, baseRow);
    const unset = isUnsetGrid(f);
    return {
      id: f.id,
      kind: "custom" as const,
      field: f,
      layout: {
        gridCol: unset ? fallback.gridCol : normalizeCol(f.gridCol ?? fallback.gridCol, f.gridSpan ?? 2),
        gridRow: unset ? fallback.gridRow : (f.gridRow ?? fallback.gridRow),
        gridSpan: normalizeSpan(f.gridSpan ?? 2),
      },
    };
  });

  return [...builtins, ...customs];
}

function sortItems(items: GridFieldItem[]) {
  return [...items].sort((a, b) =>
    a.layout.gridRow - b.layout.gridRow || a.layout.gridCol - b.layout.gridCol,
  );
}

function placeItem(items: GridFieldItem[], itemId: string, target: GridLayoutCell): GridFieldItem[] {
  const next = items.map((it) => ({ ...it, layout: { ...it.layout } }));
  const moving = next.find((it) => it.id === itemId);
  if (!moving) return items;

  const snapped: GridLayoutCell = {
    gridCol: normalizeCol(target.gridCol, moving.layout.gridSpan),
    gridRow: Math.max(0, target.gridRow),
    gridSpan: moving.layout.gridSpan,
  };

  const bump = (excludeId: string) => {
    for (const it of next) {
      if (it.id === excludeId) continue;
      if (cellsOverlap(snapped, it.layout)) {
        it.layout.gridRow = snapped.gridRow + 1;
        bump(it.id);
      }
    }
  };

  moving.layout = snapped;
  bump(itemId);
  return next;
}

function cellFromPointer(gridEl: HTMLElement, clientX: number, clientY: number) {
  const rect = gridEl.getBoundingClientRect();
  const innerW = rect.width;
  const colW = (innerW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const relX = Math.max(0, clientX - rect.left);
  const relY = Math.max(0, clientY - rect.top);
  const col = Math.min(GRID_COLS - 1, Math.floor(relX / (colW + GRID_GAP)));
  const row = Math.floor(relY / (ROW_HEIGHT + GRID_GAP));
  return { gridCol: col, gridRow: row, gridSpan: 2 };
}

export function layoutsFromItems(items: GridFieldItem[]) {
  const cardLayout: LeadCardLayout = {};
  const fields: Field[] = [];
  for (const it of items) {
    if (it.kind === "builtin" && it.builtinKey) {
      cardLayout[it.builtinKey] = { ...it.layout };
    } else if (it.kind === "custom" && it.field) {
      fields.push({
        ...it.field,
        gridCol: it.layout.gridCol,
        gridRow: it.layout.gridRow,
        gridSpan: it.layout.gridSpan,
      });
    }
  }
  return { cardLayout, fields };
}

type LeadCardFieldsGridProps = {
  t: Record<string, string>;
  fields: Field[];
  cardLayout?: LeadCardLayout;
  hiddenCardFields?: string[];
  editable: boolean;
  onSaveLayout: (cardLayout: LeadCardLayout, fields: Field[]) => void | Promise<void>;
  renderBuiltin: (key: BuiltinFieldKey) => React.ReactNode;
  renderCustom: (field: Field) => React.ReactNode;
};

export function LeadCardFieldsGrid({
  t, fields, cardLayout, hiddenCardFields, editable, onSaveLayout, renderBuiltin, renderCustom,
}: LeadCardFieldsGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<GridFieldItem[]>(() => buildGridItems(fields, cardLayout, hiddenCardFields));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<GridLayoutCell | null>(null);
  const [layoutMode, setLayoutMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(buildGridItems(fields, cardLayout, hiddenCardFields));
  }, [fields, cardLayout, hiddenCardFields]);

  const maxRow = useMemo(
    () => Math.max(2, ...items.map((it) => it.layout.gridRow)) + 1,
    [items],
  );

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const persist = useCallback(async (next: GridFieldItem[]) => {
    setItems(next);
    if (!editable) return;
    setSaving(true);
    try {
      const { cardLayout: cl, fields: fs } = layoutsFromItems(next);
      await onSaveLayout(cl, fs);
    } finally {
      setSaving(false);
    }
  }, [editable, onSaveLayout]);

  function onDragStart(id: string) {
    if (!editable || !layoutMode) return;
    setDraggingId(id);
  }

  function onDragMove(e: PointerEvent) {
    if (!draggingId || !gridRef.current) return;
    setHoverCell(cellFromPointer(gridRef.current, e.clientX, e.clientY));
  }

  function onDragEnd() {
    if (!draggingId || !hoverCell) {
      setDraggingId(null);
      setHoverCell(null);
      return;
    }
    const moving = itemsRef.current.find((it) => it.id === draggingId);
    if (moving) {
      void persist(placeItem(itemsRef.current, draggingId, {
        gridCol: hoverCell.gridCol,
        gridRow: hoverCell.gridRow,
        gridSpan: moving.layout.gridSpan,
      }));
    }
    setDraggingId(null);
    setHoverCell(null);
  }

  useEffect(() => {
    if (!draggingId) return;
    const move = (e: PointerEvent) => onDragMove(e);
    const up = () => onDragEnd();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  function toggleSpan(id: string) {
    const next = items.map((it) => {
      if (it.id !== id) return it;
      const span = it.layout.gridSpan >= 4 ? 2 : 4;
      return {
        ...it,
        layout: {
          ...it.layout,
          gridSpan: span,
          gridCol: normalizeCol(it.layout.gridCol, span),
        },
      };
    });
    void persist(next);
  }

  const showGrid = editable && layoutMode;
  const sorted = sortItems(items);

  return (
    <div className="mt-4 text-sm">
      {editable && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className={`text-xs font-medium ${t.muted}`}>Поля карточки</p>
          <button
            type="button"
            onClick={() => setLayoutMode((v) => !v)}
            className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${
              layoutMode ? "bg-teal-600 text-white border-teal-500/40" : `${t.border} ${t.muted} ${t.hover}`
            }`}
          >
            {layoutMode ? "Готово" : "Раскладка"}
          </button>
        </div>
      )}

      {!showGrid ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map((it) => (
            <div key={it.id} className={it.layout.gridSpan >= 4 ? "sm:col-span-2" : ""}>
              {it.kind === "builtin" && it.builtinKey ? renderBuiltin(it.builtinKey) : it.field ? renderCustom(it.field) : null}
            </div>
          ))}
        </div>
      ) : (
      <div ref={gridRef} className="relative" style={{ minHeight: (maxRow + 1) * (ROW_HEIGHT + GRID_GAP) }}>
        {showGrid && (
          <div
            className="absolute inset-0 grid pointer-events-none"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
              gridAutoRows: `minmax(${ROW_HEIGHT}px, auto)`,
              gap: GRID_GAP,
            }}
          >
            {Array.from({ length: (maxRow + 1) * GRID_COLS }).map((_, idx) => {
              const col = idx % GRID_COLS;
              const row = Math.floor(idx / GRID_COLS);
              const active = hoverCell && hoverCell.gridCol === col && hoverCell.gridRow === row;
              return (
                <div
                  key={`cell-${col}-${row}`}
                  className="rounded-2xl border border-dashed transition-colors"
                  style={{
                    borderColor: active ? "rgba(20,184,166,0.45)" : "rgba(148,163,184,0.18)",
                    backgroundColor: active ? "rgba(20,184,166,0.08)" : "transparent",
                  }}
                />
              );
            })}
          </div>
        )}

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridAutoRows: `minmax(${ROW_HEIGHT}px, auto)`,
            gap: GRID_GAP,
          }}
        >
        {items.map((it) => (
          <div
            key={it.id}
            className={`relative rounded-2xl transition-shadow ${
              showGrid ? "ring-1 ring-slate-200/60 dark:ring-slate-600/40 bg-white/50 dark:bg-slate-800/40" : ""
            } ${draggingId === it.id ? "opacity-60 scale-[0.98] z-20" : "z-10"}`}
            style={{
              gridColumn: `${it.layout.gridCol + 1} / span ${it.layout.gridSpan}`,
              gridRow: it.layout.gridRow + 1,
            }}
          >
            {showGrid && (
              <div className="absolute -top-1 left-2 right-2 flex items-center justify-between gap-1 z-30">
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); onDragStart(it.id); }}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border shadow-sm cursor-grab active:cursor-grabbing ${t.surface} ${t.border} ${t.muted}`}
                  title="Перетащить"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleSpan(it.id)}
                  className={`p-1 rounded-full border shadow-sm ${t.surface} ${t.border} ${t.muted} ${t.hover}`}
                  title={it.layout.gridSpan >= 4 ? "Уменьшить" : "На всю ширину"}
                >
                  {it.layout.gridSpan >= 4 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
              </div>
            )}
            <div className={showGrid ? "pt-5 px-1 pb-1" : ""}>
              {it.kind === "builtin" && it.builtinKey ? renderBuiltin(it.builtinKey) : it.field ? renderCustom(it.field) : null}
            </div>
          </div>
        ))}
        </div>
      </div>
      )}

      {saving && <p className={`text-[10px] ${t.muted} mt-1`}>Сохранение раскладки…</p>}
      {showGrid && (
        <p className={`text-[10px] ${t.muted} mt-2`}>
          Перетащите поле на ячейку сетки. Кнопка справа — ширина (½ или вся строка).
        </p>
      )}
    </div>
  );
}
