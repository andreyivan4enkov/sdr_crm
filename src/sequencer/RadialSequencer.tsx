import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ColorMode } from "../theme";
import {
  bassSound,
  chordSound,
  openSound,
  setSequencerSoundEnabled,
  sizzleSound,
  thunkSound,
  tickSound,
} from "./audio";
import { arcPath, clampDrag, detectSector, figureAt, pointerToLocal, polarPoint } from "./geometry";
import { FALLBACK_MOTOR, layoutMotor, type MotorGeom } from "./motor-geometry";
import { IOSGlassPill } from "./IosGlassPill";
import { getNeoTokens, inset, raised } from "./neomorphism";
import { sectorResonates, queueEntityTypes } from "./sdr-queue";
import { EntityShape } from "./shapes";
import {
  STATUS_COLORS,
  type DoneGlyph,
  type EntityType,
  type OverlayKind,
  type SectorKey,
  type SequencerItem,
} from "./types";

type OverlayState = {
  kind: OverlayKind;
  label: string;
  color: string;
  sector: SectorKey;
};

type CommitState = { type: "collapse" | "burn" | "archive"; color: string };

type InteractionState = { kind: string; label: string };

type Props = {
  colorMode: ColorMode;
  queue: SequencerItem[];
  sound?: boolean;
  showPriority?: boolean;
  onClose: () => void;
  onAdvance?: (item: SequencerItem, sector: SectorKey) => void;
};

const SECTOR_DEF = [
  { key: "delete" as const, a1: -76, a2: -42 },
  { key: "var1" as const, a1: -42, a2: -14 },
  { key: "var2" as const, a1: 14, a2: 42 },
  { key: "target" as const, a1: 42, a2: 76 },
];

function roleIcon(role: string, color: string) {
  const s = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2.3, strokeLinecap: "round" as const };
  if (role === "delete")
    return (
      <svg {...s}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  if (role === "go")
    return (
      <svg {...s}>
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
    );
  if (role === "archive")
    return (
      <svg {...s}>
        <path d="M12 3v10m0 0l-4-4m4 4l4-4M5 16v3h14v-3" />
      </svg>
    );
  return (
    <svg {...s}>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 8v4.3l2.8 1.7" />
    </svg>
  );
}

function interactIcon(kind: string, color: string) {
  const s = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2.3, strokeLinecap: "round" as const };
  if (kind === "call")
    return (
      <svg {...s}>
        <path d="M6.5 4h3l1.5 4-2 1.5a12 12 0 005.5 5.5L16 17l4 1.5V21a1.5 1.5 0 01-1.6 1.5A16.5 16.5 0 013.5 5.6 1.5 1.5 0 015 4z" />
      </svg>
    );
  if (kind === "camera")
    return (
      <svg {...s}>
        <path d="M4 8.5h3L8.5 6h7L17 8.5h3v11H4z" />
        <circle cx={12} cy={13.5} r={3.1} />
      </svg>
    );
  if (kind === "checklist")
    return (
      <svg {...s}>
        <path d="M10 6h10M10 12h10M10 18h10M4 6l1.4 1.4L8 4.6M4 12l1.4 1.4L8 10.6M4 18l1.4 1.4L8 16.6" />
      </svg>
    );
  return (
    <svg {...s}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

export function RadialSequencer({ colorMode, queue: initialQueue, sound = true, showPriority = true, onClose, onAdvance }: Props) {
  const T = useMemo(() => getNeoTokens(colorMode), [colorMode]);
  const dark = colorMode === "dark";

  const [queue, setQueue] = useState(initialQueue);
  const [doneStack, setDoneStack] = useState<DoneGlyph[]>([]);
  const [dragging, setDragging] = useState(false);
  const [angle, setAngle] = useState(0);
  const [radius, setRadius] = useState(FALLBACK_MOTOR.r);
  const [motorGeom, setMotorGeom] = useState<MotorGeom>(FALLBACK_MOTOR);
  const [activeSector, setActiveSector] = useState<SectorKey | null>(null);
  const [committing, setCommitting] = useState<CommitState | null>(null);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [recording, setRecording] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [dropPhase, setDropPhase] = useState<"in" | "pre">("in");
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [callSecs, setCallSecs] = useState(0);
  const [shots, setShots] = useState(0);
  const [checks, setChecks] = useState<boolean[]>([]);

  const screenRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const activeRef = useRef<SectorKey | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const geomRef = useRef<MotorGeom>(FALLBACK_MOTOR);
  const pointerIdRef = useRef<number | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    geomRef.current = motorGeom;
  }, [motorGeom]);

  useLayoutEffect(() => {
    const el = motorRef.current;
    if (!el) return;
    const measure = () => {
      const g = layoutMotor(el.clientWidth, el.clientHeight);
      setMotorGeom(g);
      setRadius((r) => (dragRef.current ? r : g.r));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSequencerSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const current = queue[0];

  const meta = useCallback(
    (key: SectorKey) => {
      const c = current ?? {
        var1: { label: "", input: "none" as const },
        var2: { label: "", input: "none" as const },
        target: { label: "", input: "none" as const },
        interact: { label: "Открыть", kind: "view" as const },
      };
      if (key === "delete") return { label: "Удалить", color: STATUS_COLORS.red, input: "reason" as const, role: "delete" };
      if (key === "interact") {
        const it = c.interact;
        return { label: it.label, color: STATUS_COLORS.interact, input: "none" as const, role: "interact" };
      }
      if (key === "var1") return { label: c.var1.label, color: STATUS_COLORS.amber, input: c.var1.input, role: "caution" };
      if (key === "var2") return { label: c.var2.label, color: STATUS_COLORS.amber, input: c.var2.input, role: "caution" };
      if (key === "target") return { label: c.target.label, color: STATUS_COLORS.green, input: c.target.input, role: "go" };
      return { label: "", color: "#888", input: "none" as const, role: "" };
    },
    [current],
  );

  const advance = useCallback(() => {
    setQueue((q) => {
      const next = q.slice();
      const cur = next.shift();
      if (cur) {
        setDoneStack((d) => [...d, { type: cur.type, color: cur.statusColor }]);
        onAdvance?.(cur, activeRef.current ?? "target");
      }
      if (next.length === 0) {
        chordSound();
        setInbox(true);
        setCommitting(null);
        setActiveSector(null);
        return next;
      }
      setCommitting(null);
      setActiveSector(null);
      setAngle(0);
      setRadius(geomRef.current.r);
      setDropPhase("pre");
      requestAnimationFrame(() => requestAnimationFrame(() => setDropPhase("in")));
      return next;
    });
  }, [onAdvance]);

  const runCommit = useCallback(
    (key: SectorKey, m: ReturnType<typeof meta>) => {
      setAngle(0);
      setRadius(geomRef.current.r);
      setActiveSector(null);
      if (key === "var2") {
        thunkSound();
        setCommitting({ type: "archive", color: m.color });
        setTimeout(advance, 460);
      } else {
        bassSound();
        setCommitting({ type: "collapse", color: m.color });
        setTimeout(advance, 480);
      }
    },
    [advance, meta],
  );

  const beginAction = useCallback(
    (key: SectorKey) => {
      if (!current || !sectorResonates(current, key)) return;
      const m = meta(key);
      if (key === "interact") {
        openSound();
        const it = current.interact;
        setInteraction({ kind: it.kind, label: m.label });
        setAngle(0);
        setRadius(geomRef.current.r);
        setActiveSector(null);
        if (it.kind === "checklist" && it.items) setChecks(it.items.map((_, i) => i < 3));
        if (it.kind === "call") {
          setCallSecs(0);
          if (callTimerRef.current) clearInterval(callTimerRef.current);
          callTimerRef.current = setInterval(() => setCallSecs((s) => s + 1), 1000);
        }
        return;
      }
      if (m.input !== "none") {
        setOverlay({ kind: m.input, label: m.label, color: m.color, sector: key });
        setOverlayText("");
        setRecording(false);
        setAngle(0);
        setRadius(geomRef.current.r);
      } else {
        runCommit(key, m);
      }
    },
    [current, meta, runCommit],
  );

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || !rectRef.current || !current) return;
      e.preventDefault();
      const geom = geomRef.current;
      const { x, y } = pointerToLocal(e, rectRef.current);
      const dx = x - geom.cx;
      const dy = y - geom.py;
      const { angle: ang, radius: rad } = clampDrag(dx, dy, geom);
      let key = detectSector(ang, rad, geom);
      if (key && !sectorResonates(current, key)) key = null;
      if (key !== activeRef.current) tickSound();
      activeRef.current = key;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setAngle(ang);
        setRadius(rad);
        setActiveSector(key);
      });
    },
    [current],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = false;
    const key = activeRef.current;
    setDragging(false);
    if (key) beginAction(key);
    else {
      setAngle(0);
      setRadius(geomRef.current.r);
      setActiveSector(null);
    }
    pointerIdRef.current = null;
  }, [beginAction]);

  useEffect(() => {
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [onMove, endDrag]);

  const onFigureDown = (e: ReactPointerEvent) => {
    if (committing || overlay || inbox || interaction) return;
    e.preventDefault();
    e.stopPropagation();
    const el = motorRef.current;
    rectRef.current = el ? el.getBoundingClientRect() : null;
    if (!rectRef.current) return;
    dragRef.current = true;
    activeRef.current = null;
    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDragging(true);
    setDropPhase("in");
    onMove(e.nativeEvent);
  };

  const onFigureUp = (e: ReactPointerEvent) => {
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    endDrag();
  };

  const closeInteraction = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setInteraction(null);
  };

  const figureStyle = useMemo((): CSSProperties => {
    const geom = motorGeom;
    let ang = dragging ? angle : 0;
    let rad = dragging ? radius : geom.r;
    let { left, top } = figureAt(ang, rad, geom);
    let tf = "translate(-50%,-50%)";
    let op = 1;
    let fil = "";
    let trans = dragging
      ? "none"
      : "left .45s cubic-bezier(.34,1.3,.5,1), top .45s cubic-bezier(.34,1.3,.5,1), transform .45s, filter .2s";
    const glow = dragging && activeSector ? meta(activeSector).color : null;
    if (glow) fil = `drop-shadow(0 0 16px ${glow})`;
    if (committing) {
      if (committing.type === "collapse") {
        tf = "translate(-50%,-50%) perspective(420px) rotateX(85deg) scale(0.08)";
        op = 0;
        fil = "blur(2px)";
        trans = "all .46s ease-in";
      } else if (committing.type === "burn") {
        tf = "translate(-50%,-50%) scale(1.42)";
        op = 0;
        fil = "blur(7px) brightness(1.7) saturate(1.5)";
        trans = "all .5s ease-out";
      } else {
        left = geom.cx;
        top = geom.py;
        tf = "translate(-50%,-50%) scale(0.16)";
        op = 0.2;
        fil = "blur(1px)";
        trans = "all .42s cubic-bezier(.5,0,.85,.3)";
      }
    } else if (dropPhase === "pre") {
      top -= 200;
      op = 0;
      trans = "none";
    } else if (dropPhase === "in" && !dragging) {
      trans = "top .6s cubic-bezier(.34,1.56,.64,1), opacity .35s, left .4s, transform .4s, filter .2s";
    }
    return {
      position: "absolute",
      left,
      top,
      width: geom.fig,
      height: geom.fig,
      transform: tf,
      transition: trans,
      opacity: op,
      filter: fil,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
      zIndex: 4,
    };
  }, [angle, radius, dragging, activeSector, committing, dropPhase, meta, motorGeom]);

  const interactShort =
    ({ call: "позвонить", view: "открыть", camera: "снять фото", checklist: "чек-лист" } as Record<string, string>)[
      current?.interact.kind ?? "view"
    ] ?? "открыть";

  let ctxText: string;
  let ctxColor: string;
  let ctxSub: string;
  if (dragging) {
    const k = activeSector;
    if (!k) {
      ctxText = "Отпустите, чтобы вернуть фигуру";
      ctxColor = T.dim;
      ctxSub = "Нейтральная зона · 12:00";
    } else {
      const m = meta(k);
      ctxText = m.label;
      ctxColor = m.color;
      ctxSub =
        k === "delete"
          ? "Запросим причину"
          : k === "interact"
            ? "Активное действие"
            : m.input === "dictation"
              ? "Голосовой ввод"
              : m.input === "comment"
                ? "С комментарием"
                : m.role === "go"
                  ? "Целевое действие"
                  : "Вариативное действие";
    }
  } else {
    ctxText = "Удерживайте фигуру и ведите по дуге";
    ctxColor = T.dim;
    ctxSub = `← удалить · → ${(current?.target.label ?? "").toLowerCase()} · ↓ ${interactShort}`;
  }

  const [hx, hy] = polarPoint(0, motorGeom.r + 15, motorGeom);

  const legendTypes: [EntityType, string][] = [
    ["lead", "Лид"],
    ["deal", "Сделка"],
    ["task", "Задача"],
    ["doc", "Документ"],
  ];
  const presentLegend = queueEntityTypes(queue).map((ty) => {
    const lb = legendTypes.find(([t]) => t === ty)?.[1] ?? ty;
    return [ty, lb] as [EntityType, string];
  });

  const onReset = () => {
    setQueue(initialQueue);
    setDoneStack([]);
    setInbox(false);
    setCommitting(null);
    setOverlay(null);
    setActiveSector(null);
    setAngle(0);
    setRadius(motorGeom.r);
    setDropPhase("pre");
    requestAnimationFrame(() => requestAnimationFrame(() => setDropPhase("in")));
  };

  const chipSets: Record<string, string[]> = {
    reason: ["Дубль", "Нерелевантно", "Спам", "Закрыто без сделки"],
    comment: ["Готово", "Нужны правки", "Согласовано", "Отклонено"],
    dictation: [],
  };

  return (
    <div
      ref={screenRef}
      className="sequencer-screen"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "100dvh",
        background: T.bg,
        overflow: "hidden",
        fontFamily: "'Manrope', system-ui, sans-serif",
        color: T.text,
        touchAction: "none",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: 12,
          border: "none",
          background: T.bg,
          boxShadow: raised(T, 3, 7),
          color: T.dim,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Закрыть режим потока"
      >
        ✕
      </button>

      {!inbox && !current && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 32, textAlign: "center" }}>
          <p style={{ fontSize: 22, fontWeight: 800 }}>Очередь пуста</p>
          <p style={{ fontSize: 14, color: T.dim, marginTop: 10, lineHeight: 1.5 }}>
            Нет лидов и открытых задач. Создайте сущности в CRM или выполните{" "}
            <code style={{ fontSize: 12 }}>npm run db:seed</code> для демо-набора.
          </p>
          <button type="button" onClick={onClose} style={{ marginTop: 24, padding: "12px 24px", borderRadius: 18, border: "none", background: T.bg, boxShadow: raised(T, 3, 8), fontWeight: 700, cursor: "pointer", color: T.text }}>
            Закрыть
          </button>
        </div>
      )}

      {!inbox && current && (
        <>
          <div style={{ position: "relative", padding: "68px 22px 0", zIndex: 2, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: T.dim }}>РЕЖИМ ПОТОКА</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.dim }}>{queue.length} в очереди</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: presentLegend.length < 4 ? "center" : undefined }}>
              {presentLegend.map(([ty, lb]) => {
                const active = ty === current.type;
                return (
                  <div
                    key={ty}
                    style={{
                      flex: presentLegend.length >= 4 ? 1 : undefined,
                      minWidth: presentLegend.length < 4 ? 72 : undefined,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 4px 8px",
                      borderRadius: 16,
                      background: T.bg,
                      boxShadow: active ? inset(T, 3, 7) : raised(T, 3, 7),
                      transition: "box-shadow .3s",
                    }}
                  >
                    <EntityShape type={ty} px={26} color={active ? current.statusColor : T.glyphOff} dark={dark} />
                    <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600, color: active ? current.statusColor : T.dim }}>
                      {lb}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 13px 6px 11px",
                borderRadius: 20,
                background: T.bg,
                boxShadow: raised(T, 3, 7),
                fontSize: 12.5,
                fontWeight: 700,
                color: current.statusColor,
                marginTop: 16,
                marginBottom: 13,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: current.statusColor, boxShadow: `0 0 8px ${current.statusColor}` }} />
              {current.statusLabel}
            </div>
            <h1 style={{ fontSize: 29, fontWeight: 800, lineHeight: "34px", letterSpacing: -0.4, margin: 0 }}>{current.title}</h1>
            <p style={{ fontSize: 16, fontWeight: 600, color: T.dim, marginTop: 6 }}>{current.company}</p>
            <p style={{ fontSize: 16.5, fontWeight: 700, marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {current.line1}
            </p>
            <p style={{ fontSize: 14.5, fontWeight: 500, color: T.dim, marginTop: 5 }}>{current.line2}</p>
            {showPriority && (
              <div style={{ marginTop: 18, padding: "13px 15px", borderRadius: 18, background: T.bg, boxShadow: inset(T, 3, 7) }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: T.dim }}>SDR-ПРИОРИТЕТ</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: current.statusColor }}>{current.priority}</span>
                </div>
                <div style={{ height: 7, borderRadius: 5, background: T.track, boxShadow: inset(T, 1, 3), overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${current.priority}%`,
                      borderRadius: 5,
                      background: `linear-gradient(90deg, ${current.statusColor}88, ${current.statusColor})`,
                      transition: "width .5s",
                    }}
                  />
                </div>
                <p style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginTop: 9, lineHeight: "17px", marginBottom: 0 }}>{current.reason}</p>
              </div>
            )}
          </div>

          <div style={{ position: "relative", marginTop: 16, padding: "16px 24px 0", textAlign: "center", zIndex: 2, flexShrink: 0 }}>
            <div
              style={{
                height: 3,
                borderRadius: 3,
                margin: "0 -24px 16px",
                background: T.track,
                boxShadow: `inset 0 1px 2px ${T.sD}, inset 0 -1px 2px ${T.sL}`,
              }}
            />
            <p style={{ fontSize: 19, fontWeight: 800, color: ctxColor, letterSpacing: -0.2, margin: 0, transition: "color .2s" }}>{ctxText}</p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: T.faint, marginTop: 4 }}>{ctxSub}</p>
          </div>

          <div
            ref={motorRef}
            className="sequencer-motor"
            style={{ position: "relative", flex: 1, minHeight: 280, width: "100%", zIndex: 3, touchAction: "none" }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${motorGeom.width} ${motorGeom.height}`}
              preserveAspectRatio="xMidYMax meet"
              style={{ overflow: "visible", display: "block" }}
            >
              <path d={arcPath(-motorGeom.fan, motorGeom.fan, motorGeom.r, motorGeom)} fill="none" stroke={T.track2} strokeWidth={28} strokeLinecap="round" />
              <path
                d={arcPath(-motorGeom.fan, motorGeom.fan, motorGeom.r, motorGeom)}
                fill="none"
                stroke={T.track}
                strokeWidth={22}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 3px 6px ${T.gShade})` }}
              />
              {SECTOR_DEF.map((d) => {
                const m = meta(d.key);
                const resonates = current ? sectorResonates(current, d.key) : false;
                if (!resonates) return null;
                const active = activeSector === d.key;
                const mid = (d.a1 + d.a2) / 2;
                const [dx, dy] = polarPoint(mid, motorGeom.r, motorGeom);
                return (
                  <g key={d.key}>
                    <path
                      d={arcPath(d.a1 + 3, d.a2 - 3, motorGeom.r + 15, motorGeom)}
                      fill="none"
                      stroke={m.color}
                      strokeWidth={6}
                      strokeLinecap="round"
                      opacity={active ? 1 : 0.5}
                    />
                    <foreignObject x={dx - 17} y={dy - 17} width={34} height={34}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: active ? m.color : T.bg,
                          boxShadow: active ? `0 0 14px ${m.color}, ${raised(T, 2, 5)}` : raised(T, 3, 6),
                          transition: "background .2s, box-shadow .2s",
                        }}
                      >
                        {roleIcon(m.role, active ? "#fff" : m.color)}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
              <circle cx={hx} cy={hy - 6.5} r={5} fill={T.gShade} opacity={0.5} />
            </svg>

            <div
              style={{
                position: "absolute",
                left: motorGeom.cx,
                top: motorGeom.py,
                transform: "translate(-50%,-50%)",
                width: 80,
                height: 80,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: activeSector === "interact" ? STATUS_COLORS.interact : T.bg,
                boxShadow:
                  activeSector === "interact"
                    ? `0 0 22px ${STATUS_COLORS.interact}, 0 8px 18px ${STATUS_COLORS.interact}66`
                    : inset(T, 4, 9),
                zIndex: 2,
                pointerEvents: "none",
                transition: "background .2s, box-shadow .2s",
              }}
            >
              {interactIcon(current.interact.kind, activeSector === "interact" ? "#fff" : T.faint)}
            </div>

            <div
              style={figureStyle}
              onPointerDown={onFigureDown}
              onPointerUp={onFigureUp}
              onPointerCancel={onFigureUp}
            >
              <EntityShape type={current.type} px={motorGeom.fig} color={current.statusColor} dark={dark} />
            </div>
          </div>
        </>
      )}

      {inbox && (
        <div className="sequencer-inbox" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div className="sequencer-burst" />
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.bg, boxShadow: raised(T, 4, 12), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: STATUS_COLORS.green }}>
            ✓
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginTop: 24 }}>Поток пуст</h2>
          <p style={{ fontSize: 15, color: T.dim, textAlign: "center", maxWidth: 300, marginTop: 8 }}>
            Дневной план выполнен. Вы обработали {doneStack.length}{" "}
            {doneStack.length % 10 === 1 && doneStack.length % 100 !== 11 ? "задачу" : doneStack.length % 10 >= 2 && doneStack.length % 10 <= 4 && (doneStack.length % 100 < 10 || doneStack.length % 100 >= 20) ? "задачи" : "задач"}.
          </p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", maxWidth: 300, margin: "26px 0 30px" }}>
            {doneStack.map((d, i) => (
              <div key={i} style={{ width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, boxShadow: raised(T, 3, 8), animation: "sequencer-pop .4s ease both" }}>
                <EntityShape type={d.type} px={30} color={d.color} dark={dark} />
              </div>
            ))}
          </div>
          <button type="button" onClick={onReset} style={{ padding: "12px 28px", borderRadius: 20, border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", background: T.bg, boxShadow: raised(T, 3, 8), color: T.text }}>
            Начать заново
          </button>
        </div>
      )}

      {overlay && (
        <div style={{ position: "absolute", inset: 0, zIndex: 15, background: dark ? "rgba(0,0,0,0.55)" : "rgba(233,229,223,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", padding: 16 }}>
          <div style={{ width: "100%", borderRadius: 24, padding: 20, background: T.card, boxShadow: raised(T, 6, 16) }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: overlay.color, marginBottom: 8 }}>{overlay.label}</p>
            {(chipSets[overlay.kind] ?? []).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setOverlayText(chip)}
                style={{ marginRight: 8, marginBottom: 8, padding: "9px 15px", borderRadius: 20, fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: T.text, background: T.bg, boxShadow: raised(T, 3, 7), border: "none" }}
              >
                {chip}
              </button>
            ))}
            {overlayText && !recording && (
              <p style={{ fontSize: 15, lineHeight: 1.5, margin: "12px 0" }}>{overlayText}</p>
            )}
            {!overlayText && !recording && (overlay.kind === "dictation" || overlay.kind === "comment") && (
              <p style={{ fontSize: 14, color: T.dim }}>Нажмите микрофон для голосового ввода</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setOverlay(null)} style={{ flex: 1, padding: 12, borderRadius: 16, border: "none", background: T.bg, boxShadow: inset(T, 2, 5), cursor: "pointer", fontWeight: 600 }}>
                Отмена
              </button>
              {(overlay.kind === "dictation" || overlay.kind === "comment") && (
                <button
                  type="button"
                  onClick={() => {
                    setRecording(true);
                    setTimeout(() => {
                      setRecording(false);
                      setOverlayText(overlay.kind === "dictation" ? "Голосовая заметка записана." : "Комментарий добавлен.");
                    }, 1300);
                  }}
                  style={{ padding: "12px 20px", borderRadius: 16, border: "none", background: overlay.color, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  🎤
                </button>
              )}
              <button
                type="button"
                disabled={overlay.kind === "reason" && !overlayText.trim()}
                onClick={() => {
                  sizzleSound();
                  setOverlay(null);
                  setCommitting({ type: "burn", color: overlay.color });
                  setTimeout(advance, 520);
                }}
                style={{ flex: 1, padding: 12, borderRadius: 16, border: "none", background: overlay.color, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: overlay.kind === "reason" && !overlayText.trim() ? 0.5 : 1 }}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {interaction && (
        <div style={{ position: "absolute", inset: 0, zIndex: 12, background: dark ? "#1c1c1e" : T.bg, display: "flex", flexDirection: "column", padding: 24 }}>
          <IOSGlassPill dark={dark} style={{ alignSelf: "flex-start", marginBottom: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{interaction.label}</span>
          </IOSGlassPill>
          {interaction.kind === "call" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 88, height: 88, borderRadius: "50%", background: STATUS_COLORS.interact, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 28, fontWeight: 800, boxShadow: `0 0 30px ${STATUS_COLORS.interact}88` }}>
                {(current?.title.replace(/^Звонок:\s*/, "") ?? "")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <p style={{ marginTop: 20, fontSize: 22, fontWeight: 800 }}>{current?.title.replace(/^Звонок:\s*/, "")}</p>
              <p style={{ color: T.dim, marginTop: 8 }}>{callSecs < 2 ? "Идёт вызов…" : `Соединено · ${String(Math.floor(callSecs / 60)).padStart(2, "0")}:${String(callSecs % 60).padStart(2, "0")}`}</p>
            </div>
          )}
          {interaction.kind === "view" && current && (
            <div style={{ flex: 1, overflow: "auto" }}>
              {[
                ["Статус", current.statusLabel],
                ["Контрагент", current.company],
                ["Данные", current.line1],
                ["Срок", current.line2],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${T.track}` }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: T.dim }}>{k}</span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, textAlign: "right" }}>{v}</span>
                </div>
              ))}
              <p style={{ marginTop: 16, lineHeight: 1.5, color: T.dim }}>{current.reason}</p>
            </div>
          )}
          {interaction.kind === "checklist" && current?.interact.items && (
            <div style={{ flex: 1, overflow: "auto" }}>
              {current.interact.items.map((lb, i) => (
                <button
                  key={lb}
                  type="button"
                  onClick={() => setChecks((ch) => ch.map((v, j) => (j === i ? !v : v)))}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "15px 16px", borderRadius: 16, background: T.bg, boxShadow: raised(T, 3, 7), marginBottom: 10, border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: checks[i] ? STATUS_COLORS.interact : T.bg, boxShadow: checks[i] ? "none" : inset(T, 2, 4), color: "#fff" }}>
                    {checks[i] ? "✓" : ""}
                  </span>
                  <span style={{ fontSize: 15.5, fontWeight: checks[i] ? 600 : 700, color: checks[i] ? T.dim : T.text, textDecoration: checks[i] ? "line-through" : "none" }}>{lb}</span>
                </button>
              ))}
            </div>
          )}
          {interaction.kind === "camera" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: 280, aspectRatio: "3/4", borderRadius: 20, border: `2px dashed ${T.dim}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.dim }}>
                Рамка съёмки
              </div>
              <p style={{ marginTop: 16, color: T.dim }}>{shots > 0 ? `${shots} фото` : "Нет фото"}</p>
              <button type="button" onClick={() => setShots((s) => s + 1)} style={{ marginTop: 20, width: 64, height: 64, borderRadius: "50%", border: `4px solid ${T.text}`, background: "transparent", cursor: "pointer" }} aria-label="Снимок" />
            </div>
          )}
          <button type="button" onClick={closeInteraction} style={{ marginTop: 16, padding: 14, borderRadius: 18, border: "none", background: T.bg, boxShadow: raised(T, 3, 8), fontWeight: 700, cursor: "pointer" }}>
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
