import { Lfsr } from "./prng.js";

export function permuteShift(key: Uint8Array, len: number) {
  let shift = 0;
  for (let i = 0; i < key.length; i++) if (key[i]) shift = (shift + i + 1) % len;
  return shift || 1;
}

export function bindBlockLocal(a: Uint8Array, b: Uint8Array) {
  const n = a.length;
  const shift = permuteShift(b, n);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i]! ^ b[(i + shift) % n]!;
  return out;
}

export function unbindBlockLocal(bound: Uint8Array, key: Uint8Array) {
  const n = bound.length;
  const shift = permuteShift(key, n);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bound[i]! ^ key[(i + shift) % n]!;
  return out;
}

export function bindingAccuracy(orig: Uint8Array, rec: Uint8Array) {
  let m = 0;
  let a = 0;
  for (let i = 0; i < orig.length; i++) {
    if (orig[i]) {
      a++;
      if (rec[i] === orig[i]) m++;
    }
  }
  return a ? m / a : 1;
}

export function gf2Diffuse(vec: Uint8Array, rounds: number, lfsr: Lfsr) {
  const out = new Uint8Array(vec);
  for (let r = 0; r < rounds; r++) {
    const mask = lfsr.nextU32() % out.length;
    for (let i = 0; i < out.length; i++) out[(i + mask) % out.length]! ^= out[i]!;
  }
  return out;
}
