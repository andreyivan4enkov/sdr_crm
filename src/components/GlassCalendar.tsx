import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function daysInMonth(y: number, mo: number) {
  return new Date(y, mo, 0).getDate();
}

function sameDay(a: { y: number; mo: number; d: number }, b: { y: number; mo: number; d: number }) {
  return a.y === b.y && a.mo === b.mo && a.d === b.d;
}

type GlassCalendarProps = {
  value: { y: number; mo: number; d: number };
  onChange: (y: number, mo: number, d: number) => void;
  className?: string;
};

export function GlassCalendar({ value, onChange, className = "" }: GlassCalendarProps) {
  const [viewY, setViewY] = useState(value.y);
  const [viewMo, setViewMo] = useState(value.mo);

  useEffect(() => {
    setViewY(value.y);
    setViewMo(value.mo);
  }, [value.y, value.mo]);

  const today = useMemo(() => {
    const n = new Date();
    return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() };
  }, []);

  const cells = useMemo(() => {
    const first = new Date(viewY, viewMo - 1, 1);
    const startPad = (first.getDay() + 6) % 7;
    const total = daysInMonth(viewY, viewMo);
    const out: Array<{ d: number; inMonth: boolean } | null> = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= total; d++) out.push({ d, inMonth: true });
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [viewY, viewMo]);

  function prevMonth() {
    if (viewMo === 1) { setViewMo(12); setViewY((y) => y - 1); }
    else setViewMo((m) => m - 1);
  }

  function nextMonth() {
    if (viewMo === 12) { setViewMo(1); setViewY((y) => y + 1); }
    else setViewMo((m) => m + 1);
  }

  return (
    <div className={`glass-calendar ${className}`}>
      <div className="glass-calendar-head">
        <button type="button" className="glass-calendar-nav" onClick={prevMonth} aria-label="Предыдущий месяц">
          <ChevronLeft size={15} />
        </button>
        <div className="glass-calendar-title crm-data">
          {MONTHS_FULL[viewMo - 1]} {viewY}
        </div>
        <button type="button" className="glass-calendar-nav" onClick={nextMonth} aria-label="Следующий месяц">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="glass-calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w} className="glass-calendar-weekday crm-chrome">{w}</span>
        ))}
      </div>
      <div className="glass-calendar-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} className="glass-calendar-day glass-calendar-day--empty" />;
          const picked = sameDay(value, { y: viewY, mo: viewMo, d: cell.d });
          const isToday = sameDay(today, { y: viewY, mo: viewMo, d: cell.d });
          return (
            <button
              key={`${viewY}-${viewMo}-${cell.d}`}
              type="button"
              className={[
                "glass-calendar-day crm-data",
                picked ? "glass-calendar-day--picked" : "",
                isToday && !picked ? "glass-calendar-day--today" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onChange(viewY, viewMo, cell.d)}
            >
              {cell.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
