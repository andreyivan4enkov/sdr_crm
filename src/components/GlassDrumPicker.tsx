import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GlassCalendar } from "./GlassCalendar";

const ITEM_H = 30;
const TAP_MOVE_PX = 6;

type DrumField = "day" | "month" | "year" | "hour" | "minute";

type DrumProps = {
  values: (string | number)[];
  value: string | number;
  onChange: (v: string | number) => void;
  format?: (v: string | number) => string;
  className?: string;
  wide?: boolean;
  field?: DrumField;
  onTapEdit?: (field: DrumField, anchor: HTMLElement) => void;
};

function GlassDrum({ values, value, onChange, format, className = "", wide, field, onTapEdit }: DrumProps) {
  const capsuleRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const fmt = format ?? ((v: string | number) => String(v).padStart(2, "0"));

  const syncScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const idx = values.findIndex((v) => String(v) === String(value));
    if (idx < 0) return;
    scrolling.current = true;
    el.scrollTop = idx * ITEM_H;
    requestAnimationFrame(() => { scrolling.current = false; });
  }, [value, values]);

  useEffect(() => { syncScroll(); }, [syncScroll]);

  function onScroll() {
    if (scrolling.current || !ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const next = values[clamped];
    if (String(next) !== String(value)) onChange(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pointer.current;
    if (!p || p.moved) return;
    if (Math.abs(e.clientX - p.x) > TAP_MOVE_PX || Math.abs(e.clientY - p.y) > TAP_MOVE_PX) {
      p.moved = true;
    }
  }

  function onPointerUp() {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.moved || !field || !onTapEdit || !capsuleRef.current) return;
    onTapEdit(field, capsuleRef.current);
  }

  return (
    <div
      ref={capsuleRef}
      className={`glass-drum-capsule ${wide ? "glass-drum-capsule--wide" : ""} ${field ? "glass-drum-capsule--editable" : ""} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { pointer.current = null; }}
    >
      <div className="glass-drum-lens" aria-hidden />
      <div className="glass-drum-slot" aria-hidden />
      <div ref={ref} className="glass-drum-scroll" onScroll={onScroll}>
        {values.map((v) => (
          <div
            key={String(v)}
            className={`glass-drum-item crm-data ${String(v) === String(value) ? "glass-drum-item--active" : ""}`}
          >
            {fmt(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

function range(start: number, end: number) {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function daysInMonth(y: number, mo: number) {
  return new Date(y, mo, 0).getDate();
}

function parseDateParts(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3] };
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() };
  }
  const now = new Date();
  return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
}

function parseTimeParts(value: string) {
  const iso = value.match(/T(\d{2}):(\d{2})/);
  if (iso) return { h: +iso[1], min: +iso[2] };
  const hm = value.match(/(\d{1,2})[:\.](\d{2})/);
  if (hm) return { h: +hm[1], min: +hm[2] };
  return { h: 12, min: 0 };
}

const FIELD_LABELS: Record<DrumField, string> = {
  day: "День",
  month: "Месяц",
  year: "Год",
  hour: "Часы",
  minute: "Минуты",
};

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

type DrumEditPopoverProps = {
  field: DrumField;
  anchor: HTMLElement;
  date?: { y: number; mo: number; d: number };
  time?: { h: number; min: number };
  onDateChange?: (y: number, mo: number, d: number) => void;
  onTimeChange?: (h: number, min: number) => void;
  onClose: () => void;
};

function DrumEditPopover({ field, anchor, date, time, onDateChange, onTimeChange, onClose }: DrumEditPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const isDateField = field === "day" || field === "month" || field === "year";
  const initialText = useMemo(() => {
    if (isDateField && date) {
      if (field === "day") return String(date.d);
      if (field === "month") return String(date.mo);
      return String(date.y);
    }
    if (time) {
      if (field === "hour") return String(time.h).padStart(2, "0");
      return String(time.min).padStart(2, "0");
    }
    return "";
  }, [field, isDateField, date, time]);

  const [text, setText] = useState(initialText);

  useEffect(() => { setText(initialText); }, [initialText]);

  const reposition = useCallback(() => {
    if (isMobile) return;
    const r = anchor.getBoundingClientRect();
    const w = popoverRef.current?.offsetWidth ?? 280;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const top = Math.min(r.bottom + 8, window.innerHeight - (popoverRef.current?.offsetHeight ?? 320) - 8);
    setPos({ top: Math.max(8, top), left });
  }, [anchor, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [reposition, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [field]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchor, onClose]);

  function applyManual() {
    const raw = text.trim();
    if (!raw) return;

    if (isDateField && date && onDateChange) {
      let y = date.y;
      let mo = date.mo;
      let d = date.d;
      if (field === "day") {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return;
        d = Math.min(Math.max(1, n), daysInMonth(y, mo));
      } else if (field === "month") {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return;
        mo = Math.min(Math.max(1, n), 12);
        d = Math.min(d, daysInMonth(y, mo));
      } else {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return;
        y = n;
        d = Math.min(d, daysInMonth(y, mo));
      }
      onDateChange(y, mo, d);
      onClose();
      return;
    }

    if (time && onTimeChange) {
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      if (field === "hour") onTimeChange(Math.min(Math.max(0, n), 23), time.min);
      else onTimeChange(time.h, Math.min(Math.max(0, n), 59));
      onClose();
    }
  }

  const popover = (
    <div
      ref={popoverRef}
      className={`glass-drum-popover bio-card bio-glass-panel ${isMobile ? "glass-drum-popover--mobile" : ""}`}
      style={isMobile ? undefined : { top: pos.top, left: pos.left }}
      role="dialog"
      aria-modal="true"
      aria-label={`Редактирование: ${FIELD_LABELS[field]}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="glass-drum-popover-head crm-chrome">{FIELD_LABELS[field]}</div>
      <div className="glass-drum-popover-input-row">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="glass-drum-popover-input bio-glass-input crm-data"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); applyManual(); }
          }}
          placeholder={field === "year" ? "2026" : "00"}
        />
        <button type="button" className="glass-drum-popover-apply" onClick={applyManual}>
          OK
        </button>
      </div>
      {isDateField && date && onDateChange && (
        <>
          <div className="glass-drum-popover-hint crm-chrome">или выберите в календаре</div>
          <GlassCalendar
            value={date}
            onChange={(y, mo, d) => {
              onDateChange(y, mo, d);
              onClose();
            }}
          />
        </>
      )}
      {!isDateField && (
        <div className="glass-drum-popover-hint crm-chrome">
          {field === "hour" ? "0–23, Enter для применения" : "0–59, Enter для применения"}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="glass-drum-popover-layer" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="glass-drum-popover-backdrop"
          aria-label="Закрыть"
          onClick={onClose}
        />
        {popover}
      </div>,
      document.body,
    );
  }

  return createPortal(
    popover,
    document.body,
  );
}

type EditorState = { field: DrumField; anchor: HTMLElement } | null;

type DateDrumsProps = {
  value: string;
  onChange: (isoDate: string) => void;
};

function DateDrums({ value, onChange }: DateDrumsProps) {
  const parsed = useMemo(() => parseDateParts(value), [value]);
  const years = useMemo(() => range(new Date().getFullYear() - 1, new Date().getFullYear() + 3), []);
  const days = useMemo(() => range(1, 31), []);
  const months = useMemo(() => range(1, 12), []);
  const [editor, setEditor] = useState<EditorState>(null);

  function emit(y: number, mo: number, d: number) {
    const maxD = daysInMonth(y, mo);
    onChange(`${y}-${String(mo).padStart(2, "0")}-${String(Math.min(d, maxD)).padStart(2, "0")}`);
  }

  return (
    <>
      <GlassDrum
        field="day"
        values={days}
        value={parsed.d}
        onChange={(d) => emit(parsed.y, parsed.mo, +d)}
        onTapEdit={(f, a) => setEditor({ field: f, anchor: a })}
      />
      <span className="glass-drum-sep">·</span>
      <GlassDrum
        field="month"
        values={months}
        value={parsed.mo}
        onChange={(mo) => emit(parsed.y, +mo, parsed.d)}
        format={(v) => MONTHS[+v - 1] || String(v)}
        wide
        onTapEdit={(f, a) => setEditor({ field: f, anchor: a })}
      />
      <span className="glass-drum-sep">·</span>
      <GlassDrum
        field="year"
        values={years}
        value={parsed.y}
        onChange={(y) => emit(+y, parsed.mo, parsed.d)}
        format={(v) => String(v)}
        wide
        onTapEdit={(f, a) => setEditor({ field: f, anchor: a })}
      />
      {editor && (
        <DrumEditPopover
          field={editor.field}
          anchor={editor.anchor}
          date={parsed}
          onDateChange={(y, mo, d) => emit(y, mo, d)}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

type TimeDrumsProps = {
  value: string;
  onChange: (hhmm: string) => void;
};

function TimeDrums({ value, onChange }: TimeDrumsProps) {
  const { h, min } = useMemo(() => parseTimeParts(value), [value]);
  const hours = useMemo(() => range(0, 23), []);
  const minutes = useMemo(() => range(0, 59), []);
  const [editor, setEditor] = useState<EditorState>(null);

  function emit(hh: number, mm: number) {
    onChange(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }

  return (
    <>
      <GlassDrum
        field="hour"
        values={hours}
        value={h}
        onChange={(v) => emit(+v, min)}
        onTapEdit={(f, a) => setEditor({ field: f, anchor: a })}
      />
      <span className="glass-drum-sep glass-drum-colon">:</span>
      <GlassDrum
        field="minute"
        values={minutes}
        value={min}
        onChange={(v) => emit(h, +v)}
        onTapEdit={(f, a) => setEditor({ field: f, anchor: a })}
      />
      {editor && (
        <DrumEditPopover
          field={editor.field}
          anchor={editor.anchor}
          time={{ h, min }}
          onTimeChange={(hh, mm) => emit(hh, mm)}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

type DatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
};

export function GlassDatePicker({ value, onChange, className = "" }: DatePickerProps) {
  return (
    <div className={`glass-drum-row glass-drum--elegant ${className}`}>
      <DateDrums value={value} onChange={onChange} />
    </div>
  );
}

type DateTimePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  inline?: boolean;
};

export function GlassDateTimePicker({ value, onChange, className = "", inline = false }: DateTimePickerProps) {
  const datePart = value.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const timePart = value.includes("T") ? value.slice(11, 16) : `${String(parseTimeParts(value).h).padStart(2, "0")}:${String(parseTimeParts(value).min).padStart(2, "0")}`;

  if (inline) {
    return (
      <div className={`glass-drum-row glass-drum--elegant glass-drum-row--datetime ${className}`}>
        <DateDrums
          value={datePart}
          onChange={(d) => onChange(`${d}T${timePart}`)}
        />
        <span className="glass-drum-sep glass-drum-sep--gap" />
        <TimeDrums
          value={`2000-01-01T${timePart}`}
          onChange={(t) => onChange(`${datePart}T${t}`)}
        />
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <GlassDatePicker value={datePart} onChange={(d) => onChange(`${d}T${timePart}`)} />
      <div className="glass-drum-row glass-drum--elegant">
        <TimeDrums value={`2000-01-01T${timePart}`} onChange={(t) => onChange(`${datePart}T${t}`)} />
      </div>
    </div>
  );
}

type TimePickerProps = {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
};

export function GlassTimePicker({ value, onChange, className = "" }: TimePickerProps) {
  return (
    <div className={`glass-drum-row glass-drum--elegant ${className}`}>
      <TimeDrums value={value.includes("T") ? value : `2000-01-01T${value}`} onChange={onChange} />
    </div>
  );
}

/** Удобное время — дата и время в одной тонкой стеклянной строке */
export function GlassPreferredTimePicker({ value, onChange, className = "" }: TimePickerProps) {
  const iso = useMemo(() => {
    if (!value?.trim()) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16);
    const today = new Date().toISOString().slice(0, 10);
    const { h, min } = parseTimeParts(value);
    return `${today}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }, [value]);

  return (
    <GlassDateTimePicker
      inline
      className={className}
      value={iso || new Date().toISOString().slice(0, 16)}
      onChange={onChange}
    />
  );
}

/** Формат для отображения сохранённого ISO */
export function formatPreferredTimeDisplay(value?: string | null) {
  if (!value?.trim()) return "—";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("ru-RU", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    }
  }
  return value;
}
