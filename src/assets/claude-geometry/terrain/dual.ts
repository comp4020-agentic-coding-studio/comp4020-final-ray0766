import { hash3 } from '../core/noise.ts';

// Forward-mode derivatives for terrain height functions.
//
// A `D` is a value plus its gradient with respect to the 3D point p the height
// is evaluated at. Every operation carries the gradient through the chain
// rule, so the terrain normal is analytic rather than a finite difference.
// Values are computed in exactly the same order as src/core/noise.ts, so
// `noiseAt(...).v === noise3(...)` bit for bit (checked in the unit tests);
// only basic arithmetic, Math.floor, Math.abs and Math.sqrt are used, which
// keeps results identical in every conforming JavaScript engine.

export interface D { v: number; x: number; y: number; z: number }
/** A point whose coordinates are themselves functions of p (warped or scaled). */
export interface P3 { x: D; y: D; z: D }

export const dc = (v: number): D => ({ v, x: 0, y: 0, z: 0 });
export const add = (a: D, b: D): D => ({ v: a.v + b.v, x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: D, b: D): D => ({ v: a.v - b.v, x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a: D, b: D): D => ({ v: a.v * b.v, x: a.x * b.v + a.v * b.x, y: a.y * b.v + a.v * b.y, z: a.z * b.v + a.v * b.z });
export const scale = (a: D, k: number): D => ({ v: a.v * k, x: a.x * k, y: a.y * k, z: a.z * k });
export const addK = (a: D, k: number): D => ({ v: a.v + k, x: a.x, y: a.y, z: a.z });
/** a + (b − a)·t with t a dual. */
export const lerp = (a: D, b: D, t: D): D => add(a, mul(sub(b, a), t));
/** a + (b − a)·t with a constant t. */
export const lerpK = (a: D, b: D, t: number): D => add(a, scale(sub(b, a), t));
/** Apply f with derivative f′ to a dual: (f(a), f′(a)·∇a). */
export const apply = (a: D, value: number, slope: number): D => ({ v: value, x: a.x * slope, y: a.y * slope, z: a.z * slope });
export const abs = (a: D): D => (a.v < 0 ? scale(a, -1) : a);
export const max = (a: D, b: D): D => (a.v >= b.v ? a : b);
export const min = (a: D, b: D): D => (a.v <= b.v ? a : b);
export function sqrtD(a: D): D {
  const s = Math.sqrt(Math.max(0, a.v));
  return apply(a, s, s > 1e-12 ? 0.5 / s : 0);
}

export function div(a: D, b: D): D {
  const inv = 1 / b.v, q = a.v * inv;
  return { v: q, x: (a.x - q * b.x) * inv, y: (a.y - q * b.y) * inv, z: (a.z - q * b.z) * inv };
}
/** Hermite smoothstep of a dual already scaled to [0, 1]. */
export function smooth01(t: D): D {
  if (t.v <= 0) return dc(0);
  if (t.v >= 1) return dc(1);
  return apply(t, t.v * t.v * (3 - 2 * t.v), 6 * t.v * (1 - t.v));
}
/** Hermite smoothstep of a dual between constant edges. */
export function smoothstep(e0: number, e1: number, a: D): D {
  const t = (a.v - e0) / (e1 - e0);
  if (t <= 0) return dc(0);
  if (t >= 1) return dc(1);
  return apply(a, t * t * (3 - 2 * t), 6 * t * (1 - t) / (e1 - e0));
}
/** Scalar smoothstep, for masks that need no gradient. */
export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth maximum: equals max(a, b) once they differ by more than k. */
export function smax(a: D, b: D, k: number): D {
  const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (a.v - b.v) / k));
  // value = b + (a − b)·h + k·h·(1 − h); dh/d(a − b) = 0.5/k inside the blend.
  const inside = h > 0 && h < 1;
  const dh = inside ? 0.5 / k : 0;
  const diff = sub(a, b);
  const v = b.v + diff.v * h + k * h * (1 - h);
  const coef = h + (diff.v + k * (1 - 2 * h)) * dh;
  return { v, x: b.x + diff.x * coef, y: b.y + diff.y * coef, z: b.z + diff.z * coef };
}
export const smin = (a: D, b: D, k: number): D => scale(smax(scale(a, -1), scale(b, -1), k), -1);

/**
 * Soft upper limit: identity below `knee`, then approaches `ceiling`
 * asymptotically with a continuous first derivative (x/(1+x) shape, no exp).
 */
export function softCeil(a: D, knee: number, ceiling: number): D {
  if (a.v <= knee) return a;
  const span = ceiling - knee, t = (a.v - knee) / span;
  return apply(a, knee + span * t / (1 + t), 1 / ((1 + t) * (1 + t)));
}
export const softFloor = (a: D, knee: number, floor: number): D => scale(softCeil(scale(a, -1), -knee, -floor), -1);

// ------------------------------------------------------------------ points

export const point = (x: number, y: number, z: number): P3 => ({ x: { v: x, x: 1, y: 0, z: 0 }, y: { v: y, x: 0, y: 1, z: 0 }, z: { v: z, x: 0, y: 0, z: 1 } });
export const pscale = (q: P3, k: number): P3 => ({ x: scale(q.x, k), y: scale(q.y, k), z: scale(q.z, k) });
export const poffset = (q: P3, ox: number, oy: number, oz: number): P3 => ({ x: addK(q.x, ox), y: addK(q.y, oy), z: addK(q.z, oz) });
export const padd = (q: P3, wx: D, wy: D, wz: D): P3 => ({ x: add(q.x, wx), y: add(q.y, wy), z: add(q.z, wz) });
export const pdot = (q: P3, k: readonly [number, number, number]): D => add(add(scale(q.x, k[0]), scale(q.y, k[1])), scale(q.z, k[2]));

/** Combine a gradient with respect to the noise input (gx, gy, gz) with the input's own Jacobian. */
function chain(q: P3, v: number, gx: number, gy: number, gz: number): D {
  return {
    v,
    x: gx * q.x.x + gy * q.y.x + gz * q.z.x,
    y: gx * q.x.y + gy * q.y.y + gz * q.z.y,
    z: gx * q.x.z + gy * q.y.z + gz * q.z.z,
  };
}

// ------------------------------------------------------------------ noise

const GRAD: [number, number, number][] = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const dfade = (t: number) => 30 * t * t * (t - 1) * (t - 1);
const L = (a: number, b: number, t: number) => a + (b - a) * t;

const out = { v: 0, gx: 0, gy: 0, gz: 0 };
/**
 * Gradient noise with its derivative, written to `out`. Same lattice, hash and
 * arithmetic as noise3 in src/core/noise.ts.
 */
function noiseGrad(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const du = dfade(fx), dv = dfade(fy), dw = dfade(fz);
  const g000 = GRAD[hash3(ix, iy, iz, seed) % 12], g100 = GRAD[hash3(ix + 1, iy, iz, seed) % 12];
  const g010 = GRAD[hash3(ix, iy + 1, iz, seed) % 12], g110 = GRAD[hash3(ix + 1, iy + 1, iz, seed) % 12];
  const g001 = GRAD[hash3(ix, iy, iz + 1, seed) % 12], g101 = GRAD[hash3(ix + 1, iy, iz + 1, seed) % 12];
  const g011 = GRAD[hash3(ix, iy + 1, iz + 1, seed) % 12], g111 = GRAD[hash3(ix + 1, iy + 1, iz + 1, seed) % 12];
  const n000 = g000[0] * fx + g000[1] * fy + g000[2] * fz;
  const n100 = g100[0] * (fx - 1) + g100[1] * fy + g100[2] * fz;
  const n010 = g010[0] * fx + g010[1] * (fy - 1) + g010[2] * fz;
  const n110 = g110[0] * (fx - 1) + g110[1] * (fy - 1) + g110[2] * fz;
  const n001 = g001[0] * fx + g001[1] * fy + g001[2] * (fz - 1);
  const n101 = g101[0] * (fx - 1) + g101[1] * fy + g101[2] * (fz - 1);
  const n011 = g011[0] * fx + g011[1] * (fy - 1) + g011[2] * (fz - 1);
  const n111 = g111[0] * (fx - 1) + g111[1] * (fy - 1) + g111[2] * (fz - 1);
  // Value: the exact lerp nesting of noise3.
  const x00 = L(n000, n100, u), x10 = L(n010, n110, u), x01 = L(n001, n101, u), x11 = L(n011, n111, u);
  const y0 = L(x00, x10, v), y1 = L(x01, x11, v);
  out.v = L(y0, y1, w);
  // Gradient of the trilinear blend: weights times corner gradients plus the
  // derivative of the weights times corner values.
  const iu = 1 - u, iv = 1 - v, iw = 1 - w;
  const w000 = iu * iv * iw, w100 = u * iv * iw, w010 = iu * v * iw, w110 = u * v * iw;
  const w001 = iu * iv * w, w101 = u * iv * w, w011 = iu * v * w, w111 = u * v * w;
  out.gx = w000 * g000[0] + w100 * g100[0] + w010 * g010[0] + w110 * g110[0] + w001 * g001[0] + w101 * g101[0] + w011 * g011[0] + w111 * g111[0]
    + du * (iv * iw * (n100 - n000) + v * iw * (n110 - n010) + iv * w * (n101 - n001) + v * w * (n111 - n011));
  out.gy = w000 * g000[1] + w100 * g100[1] + w010 * g010[1] + w110 * g110[1] + w001 * g001[1] + w101 * g101[1] + w011 * g011[1] + w111 * g111[1]
    + dv * (iu * iw * (n010 - n000) + u * iw * (n110 - n100) + iu * w * (n011 - n001) + u * w * (n111 - n101));
  out.gz = w000 * g000[2] + w100 * g100[2] + w010 * g010[2] + w110 * g110[2] + w001 * g001[2] + w101 * g101[2] + w011 * g011[2] + w111 * g111[2]
    + dw * (iu * iv * (n001 - n000) + u * iv * (n101 - n100) + iu * v * (n011 - n010) + u * v * (n111 - n110));
}

/** noise3 at a point that depends on p; value identical to noise3(q.x.v, q.y.v, q.z.v, seed). */
export function noiseAt(q: P3, seed: number): D {
  noiseGrad(q.x.v, q.y.v, q.z.v, seed);
  return chain(q, out.v, out.gx, out.gy, out.gz);
}

/** fbm3 at a point that depends on p; value identical to fbm3(...) in src/core/noise.ts. */
export function fbmAt(q: P3, seed: number, octaves = 5, lacunarity = 2, gain = 0.5): D {
  const x = q.x.v, y = q.y.v, z = q.z.v;
  let sum = 0, amp = 1, freq = 1, norm = 0, gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < octaves; i++) {
    noiseGrad(x * freq, y * freq, z * freq, (seed + i * 1013) >>> 0);
    sum += amp * out.v;
    gx += amp * freq * out.gx; gy += amp * freq * out.gy; gz += amp * freq * out.gz;
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return chain(q, sum / norm, gx / norm, gy / norm, gz / norm);
}

/** ridged3 at a point that depends on p; value identical to ridged3(...) in src/core/noise.ts. */
export function ridgedAt(q: P3, seed: number, octaves = 5): D {
  const x = q.x.v, y = q.y.v, z = q.z.v;
  let sum = 0, amp = 0.5, freq = 1, weight = 1, norm = 0;
  let gx = 0, gy = 0, gz = 0, wx = 0, wy = 0, wz = 0;
  for (let i = 0; i < octaves; i++) {
    noiseGrad(x * freq, y * freq, z * freq, (seed + i * 7919) >>> 0);
    const s = out.v < 0 ? -1 : 1;
    let n = 1 - Math.abs(out.v);
    const rx = -s * out.gx * freq, ry = -s * out.gy * freq, rz = -s * out.gz * freq;
    // n = r · (r · weight)
    const nx = 2 * n * weight * rx + n * n * wx, ny = 2 * n * weight * ry + n * n * wy, nz = 2 * n * weight * rz + n * n * wz;
    n *= n * weight;
    const w2 = n * 2;
    if (w2 > 0 && w2 < 1) { weight = w2; wx = 2 * nx; wy = 2 * ny; wz = 2 * nz; }
    else { weight = Math.min(1, Math.max(0, w2)); wx = wy = wz = 0; }
    sum += n * amp; gx += nx * amp; gy += ny * amp; gz += nz * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return chain(q, sum / norm, gx / norm, gy / norm, gz / norm);
}

export interface Cell { d: D; hash: number }
/**
 * Distance to the nearest jittered lattice point (Worley F1) and that point's
 * hash. Used for discrete features such as sea stacks; `jitter` keeps points
 * away from cell faces so neighbouring features never merge.
 */
export function cellAt(q: P3, seed: number, jitter = 0.7): Cell {
  const x = q.x.v, y = q.y.v, z = q.z.v;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = Infinity, bx = 0, by = 0, bz = 0, bh = 0;
  const lo = (1 - jitter) / 2;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = ix + i, cy = iy + j, cz = iz + k;
    const h = hash3(cx, cy, cz, seed);
    const px = cx + lo + jitter * ((h & 1023) / 1023);
    const py = cy + lo + jitter * (((h >>> 10) & 1023) / 1023);
    const pz = cz + lo + jitter * (((h >>> 20) & 1023) / 1023);
    const dx = x - px, dy = y - py, dz = z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bx = dx; by = dy; bz = dz; bh = h; }
  }
  const d = Math.sqrt(best);
  const inv = d > 1e-12 ? 1 / d : 0;
  return { d: chain(q, d, bx * inv, by * inv, bz * inv), hash: bh };
}

/** A float in [0, 1) from a hash and a salt; for per-feature randomness. */
export const hashUnit = (h: number, salt: number) => hash3(h | 0, salt, 0, 0x2545f491) / 4294967296;
