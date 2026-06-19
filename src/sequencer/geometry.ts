import type { SectorKey } from "./types";
import type { MotorGeom } from "./motor-geometry";

export function polarPoint(deg: number, rad: number, geom: MotorGeom): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [geom.cx + rad * Math.sin(t), geom.py - rad * Math.cos(t)];
}

export function arcPath(a1: number, a2: number, r: number, geom: MotorGeom): string {
  const [x1, y1] = polarPoint(a1, r, geom);
  const [x2, y2] = polarPoint(a2, r, geom);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function detectSector(angle: number, radius: number, geom: MotorGeom): SectorKey | null {
  if (radius < geom.arch) return "interact";
  if (Math.abs(angle) < geom.neut) return null;
  if (angle <= -42) return "delete";
  if (angle < -geom.neut) return "var1";
  if (angle >= 42) return "target";
  if (angle > geom.neut) return "var2";
  return null;
}

export function clampDrag(dx: number, dy: number, geom: MotorGeom) {
  let rad = Math.hypot(dx, dy);
  let ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
  ang = Math.max(-geom.fan, Math.min(geom.fan, ang));
  rad = Math.max(geom.rmin, Math.min(geom.r + 44, rad));
  return { angle: ang, radius: rad };
}

export function pointerToLocal(e: { clientX: number; clientY: number }, rect: DOMRect) {
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function figureAt(angle: number, radius: number, geom: MotorGeom) {
  const t = (angle * Math.PI) / 180;
  return {
    left: geom.cx + radius * Math.sin(t),
    top: geom.py - radius * Math.cos(t),
  };
}
