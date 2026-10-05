// Deterministic noise for textures and terrain. Only integer hashing and basic
// arithmetic (no Math.sin/cos), so the same seed gives the same numbers in any
// conforming JavaScript engine; that is what makes generated planets and
// textures reproducible from a saved config.

/** 32-bit seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string (e.g. a config field) into a 32-bit seed. FNV-1a. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 12 edge-midpoint gradients of a cube, as in improved Perlin noise.
const GRAD: [number, number, number][] = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

function gradDot(ix: number, iy: number, iz: number, x: number, y: number, z: number, seed: number) {
  const g = GRAD[hash3(ix, iy, iz, seed) % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}

/** 3D gradient noise in roughly [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const n000 = gradDot(ix, iy, iz, fx, fy, fz, seed), n100 = gradDot(ix + 1, iy, iz, fx - 1, fy, fz, seed);
  const n010 = gradDot(ix, iy + 1, iz, fx, fy - 1, fz, seed), n110 = gradDot(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz, seed);
  const n001 = gradDot(ix, iy, iz + 1, fx, fy, fz - 1, seed), n101 = gradDot(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1, seed);
  const n011 = gradDot(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1, seed), n111 = gradDot(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1, seed);
  return lerp(lerp(lerp(n000, n100, u), lerp(n010, n110, u), v), lerp(lerp(n001, n101, u), lerp(n011, n111, u), v), w);
}

/** Fractal sum of noise3 octaves, normalised to roughly [-1, 1]. */
export function fbm3(x: number, y: number, z: number, seed: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, (seed + i * 1013) >>> 0);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal (sharp crests), in [0, 1]. */
export function ridged3(x: number, y: number, z: number, seed: number, octaves = 5): number {
  let sum = 0, amp = 0.5, freq = 1, weight = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq, (seed + i * 7919) >>> 0));
    n *= n * weight;
    weight = Math.min(1, Math.max(0, n * 2));
    sum += n * amp; norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

/** Tileable 2D value noise in [0, 1] with integer `period` cells per tile. */
export function tileNoise2(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const p = Math.max(1, period | 0);
  const at = (a: number, b: number) => hash3(((a % p) + p) % p, ((b % p) + p) % p, 0, seed) / 4294967296;
  const u = fade(fx), v = fade(fy);
  return lerp(lerp(at(ix, iy), at(ix + 1, iy), u), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), v);
}

/** Tileable 2D fbm in [0, 1]; `period` is the base cell count across the tile. */
export function tileFbm2(u: number, v: number, period: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 1, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise2(u * p, v * p, p, (seed + i * 131) >>> 0);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}
