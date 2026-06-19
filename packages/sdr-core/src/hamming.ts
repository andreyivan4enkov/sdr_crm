export const POP8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let x = i;
  let c = 0;
  while (x) {
    c += x & 1;
    x >>>= 1;
  }
  POP8[i] = c;
}

export function popcount32(w: number) {
  w >>>= 0;
  return POP8[w & 255] + POP8[(w >>> 8) & 255] + POP8[(w >>> 16) & 255] + POP8[(w >>> 24) & 255];
}

export function packSdr(vec: Uint8Array): Uint32Array {
  const out = new Uint32Array((vec.length + 31) >>> 5);
  for (let i = 0; i < vec.length; i++) if (vec[i]) out[i >>> 5] |= 1 << (i & 31);
  return out;
}

export function unpackSdr(packed: Uint32Array, dimensions: number): Uint8Array {
  const vec = new Uint8Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    if (packed[i >>> 5]! & (1 << (i & 31))) vec[i] = 1;
  }
  return vec;
}

export function packedToBytes(packed: Uint32Array): Buffer {
  return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
}

export function bytesToPacked(buf: Buffer, wordCount: number): Uint32Array {
  const arr = new Uint32Array(wordCount);
  for (let i = 0; i < wordCount; i++) {
    arr[i] = buf.readUInt32LE(i * 4);
  }
  return arr;
}

export function hammingPacked(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += popcount32(a[i]! ^ b[i]!);
  return d;
}

export function hammingDistance(a: Uint8Array, b: Uint8Array) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

export function activeIndices(vec: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < vec.length; i++) if (vec[i]) out.push(i);
  return out;
}
