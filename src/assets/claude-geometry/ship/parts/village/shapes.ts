import * as T from 'three';
import type { Vec3 } from '../../../core/vec.ts';
import type { Ctx, Role } from '../../kit.ts';

// Shared shapes for the village ship parts (docs/VILLAGE.md): smooth lofts and
// turned surfaces with shared vertex normals, so the stepped light reads them
// as rounded paint, and the superellipse hull section.


export type Groups = (j: number) => Role | null;

/**
 * Smooth skin through rings of equal length (closed rings): vertex normals from
 * the surface's own tangents, so neighbouring facets shade as one curve.
 * `role(j)` names the role of the strip from point j to j + 1, or null to skip it.
 */
export function smoothSkin(ctx: Ctx, rings: Vec3[][], role: Groups, caps: { start?: Role; end?: Role } = {}, closed = true) {
  const n = rings[0].length, m = rings.length;
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const centre = rings.map(r => r.reduce<Vec3>((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]));
  const normals = rings.map((ring, i) => ring.map((p, j) => {
    const along = sub(rings[Math.min(m - 1, i + 1)][j], rings[Math.max(0, i - 1)][j]);
    const around = closed ? sub(ring[(j + 1) % n], ring[(j + n - 1) % n]) : sub(ring[Math.min(n - 1, j + 1)], ring[Math.max(0, j - 1)]);
    const c = cross(around, along);
    // A ring shrunk to a point (a pole): the normal points along the axis, away from the neighbouring ring.
    if (Math.hypot(...c) < 1e-10) return norm(sub(centre[i], centre[i === 0 ? 1 : i - 1]));
    let v = norm(c);
    const out = sub(p, centre[i]);
    if (v[0] * out[0] + v[1] * out[1] + v[2] * out[2] < 0) v = [-v[0], -v[1], -v[2]];
    return v;
  }));
  const sinks = new Map<Role, { p: number[]; n: number[] }>();
  const sink = (r: Role) => { let s = sinks.get(r); if (!s) { s = { p: [], n: [] }; sinks.set(r, s); } return s; };
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const r = role(j);
    if (!r) continue;
    const k = (j + 1) % n, s = sink(r);
    const quad: [number, number][] = [[i, j], [i, k], [i + 1, k], [i + 1, j]];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const pts = tri.map(t => rings[quad[t][0]][quad[t][1]]), ns = tri.map(t => normals[quad[t][0]][quad[t][1]]);
      const face = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
      if (Math.hypot(...face) < 1e-12) continue;
      const avg = ns[0].map((_, a) => ns[0][a] + ns[1][a] + ns[2][a]) as Vec3;
      const order = face[0] * avg[0] + face[1] * avg[1] + face[2] * avg[2] >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const o of order) { s.p.push(...pts[o]); s.n.push(...ns[o]); }
    }
  }
  for (const [end, r] of [[0, caps.start], [m - 1, caps.end]] as const) {
    if (!r) continue;
    const ring = rings[end], c = centre[end], s = sink(r);
    const nrm = norm(sub(c, centre[end === 0 ? 1 : m - 2]));
    for (let j = 0; j < n; j++) {
      const a = ring[j], b = ring[(j + 1) % n];
      const face = cross(sub(a, c), sub(b, c));
      const tri = face[0] * nrm[0] + face[1] * nrm[1] + face[2] * nrm[2] >= 0 ? [c, a, b] : [c, b, a];
      for (const p of tri) { s.p.push(...p); s.n.push(...nrm); }
    }
  }
  for (const [r, s] of sinks) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(s.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(s.n, 3));
    ctx.b.geometry(ctx.mat(r), g);
  }
}

/** Smooth surface of revolution about local +Z from [radius, z] pairs, optionally a partial turn from `phase`. */
export function turn(ctx: Ctx, role: Role, profile: [number, number][], segments: number, placement: { position?: Vec3; scale?: Vec3; rotation?: Vec3 } = {}, arc = Math.PI * 2, phase = 0) {
  const closed = arc >= Math.PI * 2 - 1e-6, count = closed ? segments : segments + 1;
  const rings = profile.map(([r, z]) => Array.from({ length: count }, (_, i) => {
    const t = phase + arc * i / segments;
    return [r * Math.cos(t), r * Math.sin(t), z] as Vec3;
  }));
  ctx.within(placement, () => {
    if (closed) { smoothSkin(ctx, rings, () => role); return; }
    smoothSkin(ctx, rings, j => (j < count - 1 ? role : null), {}, false);
  });
}

export const segs = (ctx: Ctx, high: number, medium: number, low: number) => (ctx.detail === 2 ? high : ctx.detail === 1 ? medium : low);


// --------------------------------------------------------------- sections

/** Hull section: a superellipse (exponent p: 6 is a rounded box, 2 an ellipse) about the centre height yc. */
export interface Section { z: number; a: number; b: number; yc: number; p: number }

/** Cheat line: the band of section angles between these, on both sides. */
export const STRIPE = [0.084, 0.18] as const;

export function sectionRing(s: Section, angles: number[]): Vec3[] {
  return angles.map(t => {
    const c = Math.cos(t), sn = Math.sin(t), e = 2 / s.p;
    return [s.a * Math.sign(c) * Math.abs(c) ** e, s.yc + s.b * Math.sign(sn) * Math.abs(sn) ** e, s.z] as Vec3;
  });
}
