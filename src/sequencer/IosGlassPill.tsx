import type { ReactNode } from "react";

type PillProps = {
  children: ReactNode;
  dark?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
};

export function IOSGlassPill({ children, dark, style, onClick }: PillProps) {
  const bg = dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.55)";
  const border = dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)";
  const shadow = dark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)";

  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        background: bg,
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: `1px solid ${border}`,
        boxShadow: shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
