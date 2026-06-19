export type MotorGeom = {
  cx: number;
  py: number;
  r: number;
  fan: number;
  neut: number;
  arch: number;
  rmin: number;
  fig: number;
  width: number;
  height: number;
};

export const FALLBACK_MOTOR: MotorGeom = {
  width: 402,
  height: 340,
  cx: 201,
  py: 268,
  r: 118,
  fan: 76,
  neut: 14,
  arch: 88,
  rmin: 48,
  fig: 84,
};

export function layoutMotor(width: number, height: number): MotorGeom {
  const w = Math.max(width, 280);
  const h = Math.max(height, 260);
  const r = Math.min(w * 0.46, h * 0.55, 150);
  return {
    width: w,
    height: h,
    cx: w / 2,
    py: h - Math.max(28, h * 0.05),
    r,
    fan: 76,
    neut: 14,
    arch: r * 0.72,
    rmin: Math.max(42, r * 0.36),
    fig: Math.min(92, w * 0.22),
  };
}
