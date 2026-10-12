import { anchorFrame, localToDir, normalizeYaw } from '../../assets/claude-geometry/core/anchor.ts';

/** Small, allocation-light unit-sphere helpers for the planet plan. Plain
 * arrays keep client, server and authoring scripts bit-for-bit identical. */
export type V3 = [number, number, number];
export type V2 = [number, number];

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const madd = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Latitude/longitude in degrees to a unit direction (+Y north, longitude 0 on +Z, 90 on +X). */
export function dirOf(lat: number, lon: number): V3 {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}
export function latLonOf(p: V3): V2 {
  const u = unit(p);
  return [Math.asin(Math.max(-1, Math.min(1, u[1]))) * 180 / Math.PI, ((Math.atan2(u[0], u[2]) * 180 / Math.PI) + 360) % 360];
}
/** Angle between two unit directions, radians. */
export const angle = (a: V3, b: V3) => Math.atan2(length(cross(a, b)), dot(a, b));
/** Great-circle distance in metres on a sphere of radius r. */
export const arc = (a: V3, b: V3, r: number) => angle(a, b) * r;
/** Remove the radial part of v at p and normalise. */
export function tangent(p: V3, v: V3): V3 { return unit(madd(v, p, -dot(v, p))); }
/** Unit tangent at a pointing along the great circle towards b. */
export function heading(a: V3, b: V3): V3 {
  const t = madd(b, a, -dot(a, b));
  return length(t) < 1e-12 ? tangent(a, [1, 0, 0]) : unit(t);
}
/** Walk d metres from p along the unit tangent t (exponential map). */
export function walk(p: V3, t: V3, d: number, r: number): V3 {
  const a = d / r;
  return unit(madd(scale(p, Math.cos(a)), t, Math.sin(a)));
}
/** Spherical interpolation between unit directions. */
export function slerp(a: V3, b: V3, t: number): V3 {
  const w = angle(a, b);
  if (w < 1e-9) return [...a];
  const s = Math.sin(w), ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
  return unit([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
}
/** A stable east/north frame at p (falls back to +X near the poles). */
export function frameAt(p: V3): { up: V3; east: V3; north: V3 } {
  let east = cross([0, 1, 0], p);
  if (length(east) < 1e-6) east = [1, 0, 0];
  east = tangent(p, east);
  return { up: p, east, north: cross(p, east) };
}
/** Local 2D (east, north) metres of q in the tangent plane at origin o (log map). */
export function toLocal(o: V3, q: V3, r: number, f = frameAt(o)): V2 {
  const w = angle(o, q);
  if (w < 1e-12) return [0, 0];
  const t = unit(madd(q, o, -dot(o, q)));
  return [dot(t, f.east) * w * r, dot(t, f.north) * w * r];
}
/** Inverse of toLocal. */
export function fromLocal(o: V3, v: V2, r: number, f = frameAt(o)): V3 {
  const d = Math.hypot(v[0], v[1]);
  if (d < 1e-12) return [...o];
  return walk(o, unit(madd(scale(f.east, v[0]), f.north, v[1])), d, r);
}
/** Tangent at a 2D local direction. */
export const localDir = (f: { east: V3; north: V3 }, v: V2): V3 => unit(madd(scale(f.east, v[0]), f.north, v[1]));
/** Closest distance (metres) from p to the great-circle arc a→b, with the arc parameter. */
export function segmentDistance(p: V3, a: V3, b: V3, r: number): { distance: number; t: number } {
  const n = cross(a, b), ln = length(n);
  if (ln < 1e-12) return { distance: arc(p, a, r), t: 0 };
  const nn = scale(n, 1 / ln), off = dot(p, nn), proj = madd(p, nn, -off);
  const lp = length(proj);
  if (lp > 1e-12) {
    const q = scale(proj, 1 / lp), total = angle(a, b), ta = angle(a, q), tb = angle(q, b);
    if (Math.abs(ta + tb - total) < 1e-9) return { distance: Math.asin(Math.min(1, Math.abs(off))) * r, t: ta / total };
  }
  const da = arc(p, a, r), db = arc(p, b, r);
  return da < db ? { distance: da, t: 0 } : { distance: db, t: 1 };
}
/** Yaw for a placed object at p whose local +Z front faces along `toward`,
 * using the vendor anchor convention (shortest-arc base, then rotateY). */
export function yawFacing(p: V3, toward: V3): number {
  const base = anchorFrame({ dir: p, yaw: 0 }), t = tangent(p, toward);
  const yaw = Math.atan2(dot(t, base.right as V3), dot(t, base.front as V3));
  return normalizeYaw(yaw);
}
/** Local metres (x right, z front) of an anchored object to a unit direction on a sphere of radius r. */
export function anchorPoint(p: V3, yaw: number, x: number, z: number, r: number): V3 {
  return localToDir({ dir: p, yaw }, r, [x, 0, z]) as V3;
}
/** Deterministic hash-based random in [0, 1). */
export function seeded(seed: number, ...keys: (number | string)[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const key of keys) {
    const text = String(key);
    for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b); h ^= h >>> 13; }
    h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
