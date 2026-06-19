import type { EntityType } from "./types";
import { shade } from "./neomorphism";

type Props = { type: EntityType; px: number; color: string; dark?: boolean };

export function EntityShape({ type, px, color, dark }: Props) {
  const L = shade(color, 0.46);
  const M = color;
  const D = shade(color, -0.26);
  const DD = shade(color, -0.46);
  const ds = dark ? "rgba(0,0,0,0.55)" : "rgba(110,100,82,0.4)";
  const filter = `drop-shadow(3px 5px 6px ${ds})`;

  if (type === "deal") {
    return (
      <div
        style={{
          width: px,
          height: px,
          borderRadius: "50%",
          background: `radial-gradient(circle at 33% 27%, ${shade(color, 0.6)}, ${M} 50%, ${D} 88%)`,
          boxShadow: `inset -4px -5px 11px ${DD}, inset 3px 3px 9px ${shade(color, 0.55)}, 3px 5px 8px ${ds}`,
        }}
      />
    );
  }

  if (type === "task") {
    return (
      <svg width={px} height={px} viewBox="0 0 100 100" style={{ filter, overflow: "visible" }}>
        <polygon points="50,10 86,30 50,50 14,30" fill={L} />
        <polygon points="14,30 50,50 50,92 14,72" fill={D} />
        <polygon points="86,30 50,50 50,92 86,72" fill={M} />
        <polygon
          points="50,10 86,30 86,72 50,92 14,72 14,30"
          fill="none"
          stroke={DD}
          strokeWidth={1}
          strokeOpacity={0.35}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === "lead") {
    return (
      <svg width={px} height={px} viewBox="0 0 100 100" style={{ filter, overflow: "visible" }}>
        <ellipse cx={50} cy={90} rx={33} ry={5} fill={DD} opacity={0.22} />
        <polygon points="50,8 16,86 50,80" fill={M} />
        <polygon points="50,8 84,86 50,80" fill={D} />
        <line x1={50} y1={8} x2={50} y2={80} stroke={shade(color, 0.2)} strokeWidth={1} strokeOpacity={0.4} />
      </svg>
    );
  }

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      style={{ filter, overflow: "visible", transform: "rotate(-5deg)" }}
    >
      <rect x={24} y={12} width={52} height={78} rx={5} fill={L} />
      <polygon points="63,12 76,12 76,25" fill={shade(color, 0.08)} />
      <rect x={32} y={32} width={30} height={4} rx={2} fill={M} opacity={0.55} />
      <rect x={32} y={44} width={36} height={4} rx={2} fill={M} opacity={0.55} />
      <rect x={32} y={56} width={24} height={4} rx={2} fill={M} opacity={0.55} />
      <rect x={32} y={68} width={34} height={4} rx={2} fill={M} opacity={0.38} />
    </svg>
  );
}
