import * as T from 'three';
import { add, cross, dot, sub } from '../../../core/vec.ts';
import type { Vec3 } from '../../../core/vec.ts';
import type { Ctx, Role } from '../../kit.ts';
import { segs, smoothSkin, turn } from './shapes.ts';

// Village engines: the industrial units' plugs, nozzle exits and exit radii kept.
// One rolled lip at each opening and painted bands flush with the cowls; the
// profiles turn in steps the lines either pass over (under about 50°) or draw
// as one clean ring (over about 68°), never in between, where they flicker.

/**
 * Smooth surface of revolution about local +Z that faces the way its profile
 * walks, as the industrial lathe does: outward while z grows, towards the axis
 * while it walks back. A lip rolled over into a bell and the bell's inside then
 * face the eye (a `turn` always faces away from the axis), and the normals are
 * shared along the profile as well as round it, so it still shades round.
 */
function spun(ctx: Ctx, role: Role, profile: [number, number][], segments: number) {
  const step = profile.slice(1).map(([r1, z1], k) => {
    const [r0, z0] = profile[k], l = Math.hypot(r1 - r0, z1 - z0) || 1;
    return [(z1 - z0) / l, -(r1 - r0) / l];
  });
  const normal = profile.map((_, k) => {
    const a = step[Math.max(0, k - 1)], b = step[Math.min(step.length - 1, k)], l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  });
  const at = (k: number, i: number) => {
    const t = (2 * Math.PI * i) / segments, c = Math.cos(t), s = Math.sin(t);
    return { p: [profile[k][0] * c, profile[k][0] * s, profile[k][1]] as Vec3, n: [normal[k][0] * c, normal[k][0] * s, normal[k][1]] as Vec3 };
  };
  const pos: number[] = [], nor: number[] = [];
  for (let k = 0; k < profile.length - 1; k++) for (let i = 0; i < segments; i++) {
    const quad = [at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)];
    for (const [a, b, c] of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]) {
      const face = cross(sub(b.p, a.p), sub(c.p, a.p));
      if (Math.hypot(...face) < 1e-12) continue;
      for (const v of dot(face, add(add(a.n, b.n), c.n)) >= 0 ? [a, b, c] : [a, c, b]) { pos.push(...v.p); nor.push(...v.n); }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  ctx.b.geometry(ctx.mat(role), g);
}

// ------------------------------------------------------------------ engines

/**
 * Round engine pod on a short pylon: a fat smooth cowl with a painted trim
 * band, one rounded intake lip round a dark fan face, and a plain exhaust
 * ring with the glowing liner set inside, its exit where the nacelle's is.
 * The pylon is a smooth lens-section strut (a box drew all twelve edges at
 * low and none at the other tiers, its chamfer collapsing at low only).
 */
function roundPods(ctx: Ctx) {
  const n = segs(ctx, 16, 12, 8), k = segs(ctx, 6, 4, 4);
  // Pylon from the hull side into the cowl: lens sections 0.72 long and 0.07 deep, centred at z 0.62.
  const strut = (x: number): Vec3[] => Array.from({ length: 2 * k }, (_, i) => {
    const a = (Math.PI * i) / k;
    return [x, 0.035 * Math.sin(a), 0.62 - 0.36 * Math.cos(a)] as Vec3;
  });
  smoothSkin(ctx, [strut(0), strut(0.12)], () => 'secondary');
  ctx.within({ position: [0.26, 0, 0] }, () => {
    // A teardrop that is 0.34 m at its widest, the tile's figure: narrow lip, full body, tapering tail; the band flush on it.
    turn(ctx, 'primary', [[0.128, -0.06], [0.148, 0.03], [0.165, 0.2], [0.1673, 0.3]], n);
    turn(ctx, 'trim', [[0.1673, 0.3], [0.17, 0.42]], n);
    turn(ctx, 'primary', [[0.17, 0.42], [0.165, 0.7], [0.153, 0.98], [0.141, 1.2], [0.136, 1.3]], n);
    // The intake lip rolls round from the throat to the cowl in 30° steps; the dark fan face is a shallow cone behind it.
    const lip: [number, number][] = [[0.1, -0.05]];
    for (let i = 0; i <= 6; i++) { const f = Math.PI + (Math.PI * i) / 6; lip.push([0.114 + 0.014 * Math.cos(f), -0.075 + 0.014 * Math.sin(f)]); }
    lip.push([0.128, -0.06]);
    spun(ctx, 'metal', lip, n);
    turn(ctx, 'dark', [[0.0, -0.058], [0.1, -0.05]], n);
    // The ring walks out to the lip and back into the throat, so its inner wall faces the axis (spun, not turn).
    spun(ctx, 'metal', [[0.136, 1.3], [0.14, 1.34], [0.135, 1.39], [0.126, 1.4], [0.1216, 1.4], [0.122, 1.34]], n);
    spun(ctx, 'liner', [[0.122, 1.34], [0.06, 1.32], [0.0, 1.31]], n);
    ctx.exhaust([0, 0, 1.4], 0.1216);
  });
}

/**
 * Bell engine: a round engine body like a ball on a short neck (the gimbal)
 * rising off the aft face, a trim band at its waist, then one big trumpet bell
 * flaring out to a fat rolled lip; dark inside, with the glowing liner deep in
 * the throat. The exit and its radius are the single heavy's, and the lip
 * makes the tile's 0.66 m.
 */
function bellEngine(ctx: Ctx) {
  const n = segs(ctx, 24, 14, 12), lo = ctx.detail === 0;
  // The body's underside meets the waist at about 70°, so the waist draws as one ring at every tier.
  turn(ctx, 'primary', lo
    ? [[0.19, 0.0], [0.265, 0.04], [0.283, 0.1], [0.25, 0.177], [0.214, 0.188]]
    : [[0.19, 0.0], [0.24, 0.018], [0.272, 0.05], [0.285, 0.095], [0.276, 0.14], [0.25, 0.177], [0.214, 0.188]], n);
  turn(ctx, 'trim', [[0.214, 0.188], [0.214, 0.232]], n);
  turn(ctx, 'secondary', lo
    ? [[0.214, 0.232], [0.24, 0.32], [0.296, 0.393], [0.322, 0.417]]
    : [[0.214, 0.232], [0.224, 0.29], [0.255, 0.345], [0.296, 0.393], [0.322, 0.417]], n);
  spun(ctx, 'metal', [[0.322, 0.417], [0.337, 0.429], [0.328, 0.442], [0.311, 0.437]], n);
  spun(ctx, 'dark', lo ? [[0.311, 0.437], [0.16, 0.27]] : [[0.311, 0.437], [0.235, 0.36], [0.16, 0.27]], n);
  spun(ctx, 'liner', [[0.16, 0.27], [0.0, 0.28]], n);
  ctx.exhaust([0, 0, 0.44], 0.31);
}

/**
 * Three little drop pods on a rounded plate: a soft three-lobed plate with a
 * painted rim, and on each lobe a pod that is round where it sits on the plate
 * and tapers aft to a rolled metal lip with the liner inside. The exits and
 * their radius are the pod cluster's.
 */
function dropPods(ctx: Ctx) {
  const k = segs(ctx, 36, 24, 15), n = segs(ctx, 18, 12, 10), lo = ctx.detail === 0;
  const lobes = (s: number, z: number): Vec3[] => Array.from({ length: k }, (_, i) => {
    const t = (2 * Math.PI * i) / k, r = s * (0.245 + 0.045 * Math.cos(3 * (t - Math.PI / 2)));
    return [r * Math.cos(t), r * Math.sin(t), z];
  });
  // A straight painted rim and a nearly flat top: one clean ring where they meet.
  smoothSkin(ctx, [lobes(1, 0), lobes(1, 0.046)], () => 'trim');
  smoothSkin(ctx, [lobes(1, 0.046), lobes(0.8, 0.058)], () => 'secondary', { end: 'secondary' });
  for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
    ctx.within({ position: [Math.cos(a) * 0.165, Math.sin(a) * 0.165, 0] }, () => {
      // A drop 0.24 m at its widest (the tile's 0.2 m pods): a round head off the plate, a tail tapering to the lip.
      turn(ctx, 'primary', lo
        ? [[0.0, 0.05], [0.07, 0.07], [0.112, 0.13], [0.117, 0.22], [0.092, 0.33], [0.08, 0.38]]
        : [[0.0, 0.05], [0.04, 0.055], [0.07, 0.07], [0.095, 0.095], [0.112, 0.13], [0.12, 0.175], [0.117, 0.22], [0.106, 0.275], [0.092, 0.33], [0.08, 0.38]], n);
      spun(ctx, 'metal', [[0.08, 0.38], [0.086, 0.405], [0.085, 0.43], [0.079, 0.44], [0.0745, 0.434], [0.074, 0.415]], n);
      spun(ctx, 'liner', [[0.074, 0.415], [0.0, 0.408]], n);
      ctx.exhaust([0, 0, 0.44], 0.092 * 0.8);
    });
  }
}

export const VILLAGE_ENGINES: Record<string, (ctx: Ctx) => void> = { 'twin-nacelle': roundPods, 'single-heavy': bellEngine, 'pod-cluster': dropPods };
