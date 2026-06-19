import type { ColorMode } from "../theme";

export type NeoTokens = {
  bg: string;
  sL: string;
  sD: string;
  text: string;
  dim: string;
  faint: string;
  track: string;
  track2: string;
  gShade: string;
  glyphOff: string;
  card: string;
};

export function getNeoTokens(colorMode: ColorMode): NeoTokens {
  if (colorMode === "dark") {
    return {
      bg: "#25272C",
      sL: "#33363D",
      sD: "#1A1B1F",
      text: "#ECEAE5",
      dim: "#8E919A",
      faint: "#5C606A",
      track: "#2C2E34",
      track2: "#43464E",
      gShade: "#17181C",
      glyphOff: "#5A5E68",
      card: "#2B2D33",
    };
  }
  return {
    bg: "#E9E5DF",
    sL: "#FFFFFF",
    sD: "#C8C2B7",
    text: "#36322B",
    dim: "#8C857A",
    faint: "#B7AFA3",
    track: "#DCD7CE",
    track2: "#C2BCB1",
    gShade: "#BDB6AA",
    glyphOff: "#C0B9AC",
    card: "#ECE8E2",
  };
}

export function raised(T: NeoTokens, d: number, bl: number) {
  return `${d}px ${d}px ${bl}px ${T.sD}, -${d}px -${d}px ${bl}px ${T.sL}`;
}

export function inset(T: NeoTokens, d: number, bl: number) {
  return `inset ${d}px ${d}px ${bl}px ${T.sD}, inset -${d}px -${d}px ${bl}px ${T.sL}`;
}

export function shade(hex: string, p: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => {
    const tgt = p < 0 ? 0 : 255;
    const a = Math.abs(p);
    return Math.round((tgt - c) * a) + c;
  };
  return (
    "#" +
    [f(r), f(g), f(b)]
      .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"))
      .join("")
  );
}
