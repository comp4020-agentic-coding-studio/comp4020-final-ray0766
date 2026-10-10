import * as T from 'three';
import type { Vec3 } from '../../../core/vec.ts';
import type { Ctx, Role } from '../../kit.ts';
import { ball, segs, turn } from './shapes.ts';

// Village dorsal equipment: under the industrial parts' height on the deck socket.
// Every round piece has eight or more sides and balls four or more rows, so
// they draw their outlines only (six-sided poles and detail-0 balls creased
// half-way and flickered).

// ------------------------------------------------------------------- dorsal

/** Mast with a ball top and a little pennant (a painted plate thick enough to draw as one shape), under the sensor mast's height. */
function ballMast(ctx: Ctx) {
  const n = segs(ctx, 14, 10, 8);
  turn(ctx, 'metal', [[0.0, 0.03], [0.06, 0.03], [0.065, 0.0]], n, { rotation: [-Math.PI / 2, 0, 0] });
  ctx.cylinder('dark', 0.012, 0.016, 0.28, { position: [0, 0.17, 0] }, 8);
  ball(ctx, 'trim', 0.035, 8, 4, [0, 0.33, 0]);
  if (ctx.detail >= 1) ctx.box('trim', [0.016, 0.06, 0.1], [0, 0.26, 0.059], undefined, 0);
}

/**
 * Smooth surface of revolution about local +Z that faces the way the profile
 * walks (walking +z, the solid is on the axis side), with normals shared along
 * the profile as well as around it. Unlike `turn`, which faces away from the
 * axis, it draws concave faces such as the inside of a bowl.
 */
function smoothLathe(ctx: Ctx, role: Role, profile: [number, number][], n: number) {
  const seg = profile.slice(1).map(([r1, z1], k) => {
    const [r0, z0] = profile[k], l = Math.hypot(r1 - r0, z1 - z0) || 1;
    return [(z1 - z0) / l, -(r1 - r0) / l];
  });
  const pn = profile.map((_, k) => {
    const a = seg[Math.max(0, k - 1)], b = seg[Math.min(seg.length - 1, k)], l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  });
  const p: number[] = [], nm: number[] = [];
  const at = (k: number, t: number): [Vec3, Vec3] => [
    [profile[k][0] * Math.cos(t), profile[k][0] * Math.sin(t), profile[k][1]], [pn[k][0] * Math.cos(t), pn[k][0] * Math.sin(t), pn[k][1]],
  ];
  for (let k = 0; k < profile.length - 1; k++) for (let i = 0; i < n; i++) {
    const t0 = 2 * Math.PI * i / n, t1 = 2 * Math.PI * (i + 1) / n;
    const quad = [at(k, t0), at(k, t1), at(k + 1, t1), at(k + 1, t0)];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const [a, b, c] = tri.map(j => quad[j]);
      const e1 = [b[0][0] - a[0][0], b[0][1] - a[0][1], b[0][2] - a[0][2]], e2 = [c[0][0] - a[0][0], c[0][1] - a[0][1], c[0][2] - a[0][2]];
      const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.hypot(f[0], f[1], f[2]) < 1e-12) continue;
      const s = [0, 1, 2].reduce((sum, ax) => sum + f[ax] * (a[1][ax] + b[1][ax] + c[1][ax]), 0);
      for (const v of s >= 0 ? [a, b, c] : [a, c, b]) { p.push(...v[0]); nm.push(...v[1]); }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nm, 3));
  ctx.b.geometry(ctx.mat(role), g);
}

/**
 * Dish on a fork: a smooth turned bowl with a rounded trim rim and a ball feed
 * on a slim stalk at its focus, held at the rim's sides by a round-tubed U
 * fork with ball pivots, on a rounded pedestal. It looks up and aft as the
 * comms dish does and stays under its height.
 */
function forkDish(ctx: Ctx) {
  const n = segs(ctx, 14, 11, 8), R = 0.152, depth = 0.052;
  // Pedestal: a low rounded dome.
  turn(ctx, 'metal', [[0.085, 0], [0.08, 0.03], [0.052, 0.062], [0, 0.074]], segs(ctx, 12, 12, 8), { rotation: [-Math.PI / 2, 0, 0] });
  // The elevation axis lies in the rim's plane; the fork holds the rim at its sides.
  const pivot: Vec3 = [0, 0.228, 0], fork = 0.175;
  ctx.b.geometry(ctx.mat('secondary'), new T.TorusGeometry(fork, 0.013, 8, segs(ctx, 8, 6, 6), Math.PI), { position: pivot, rotation: [0, 0, Math.PI] });
  // Ball pivots, left out at low LOD (4 cm across).
  if (ctx.detail >= 1) for (const s of [-1, 1]) ball(ctx, 'metal', 0.022, 8, 4, [s * fork, pivot[1], 0]);
  // The bowl opens towards local +Z with its rim plane at z 0, then tilts to look up and aft.
  ctx.within({ position: pivot, rotation: [-0.93, 0, 0] }, () => {
    const z0 = -depth;
    smoothLathe(ctx, 'primary', [[R - 0.006, -0.004], [R * 0.55, z0 + depth * 0.3], [0, z0]], n);
    smoothLathe(ctx, 'secondary', [[0, z0 - 0.014], [R * 0.55, z0 + depth * 0.3 - 0.012], [R - 0.004, -0.016]], n);
    smoothLathe(ctx, 'trim', [[R - 0.004, -0.016], [R + 0.01, -0.006], [R - 0.006, -0.004]], n);
    // Ball feed on a slim stalk from the bowl's centre.
    turn(ctx, 'metal', [[0.007, z0], [0.006, 0.052]], 8);
    ball(ctx, 'trim', 0.026, 8, 4, [0, 0, 0.07]);
  });
}

export const VILLAGE_DORSALS: Record<string, (ctx: Ctx) => void> = { 'sensor-mast': ballMast, 'comms-dish': forkDish };
