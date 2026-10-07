import * as T from 'three';
import type { Vec3 } from '../../../core/vec.ts';
import type { Ctx, Role } from '../../kit.ts';
import { segs, smoothSkin, turn } from './shapes.ts';

// Village cockpits: inside the industrial cockpits' footprint on the deck.

// ------------------------------------------------------------------ cockpit

/** Bubble canopy: a half-ellipsoid of glass with a painted bow and a faired back, a seat and panel inside. */
function bubbleCanopy(ctx: Ctx) {
  const n = segs(ctx, 14, 10, 6), rows = segs(ctx, 9, 7, 4);
  // Glass from the windscreen foot at z −0.54 back to its joint with the fairing; a half turn over the top, taller than wide.
  const glass: [number, number][] = Array.from({ length: rows + 1 }, (_, i) => {
    const t = -Math.PI / 2 + (Math.PI / 2 + 1.05) * i / rows;
    return [Math.max(0.004, 0.25 * Math.cos(t)), -0.12 + 0.42 * Math.sin(t)];
  });
  const up = { position: [0, 0.03, 0] as Vec3, scale: [1, 1.36, 1] as Vec3 };
  turn(ctx, 'glass', glass, n, up, Math.PI, 0);
  // Faired back from the joint down to the deck, and a painted bow over the joint.
  turn(ctx, 'primary', [[0.13, 0.24], [0.12, 0.34], [0.09, 0.46], [0.05, 0.56], [0.006, 0.62]], n, up, Math.PI, 0);
  turn(ctx, 'trim', [[0.128, 0.215], [0.136, 0.23], [0.136, 0.26], [0.126, 0.275]], n, up, Math.PI, 0);
  for (const s of [-1, 1]) ctx.box('primary', [0.04, 0.035, 1.12], [s * 0.255, 0.0175, 0.02], undefined, 0.012);
  ctx.box('primary', [0.55, 0.035, 0.04], [0, 0.0175, -0.55], undefined, 0.012);
  // Inside: seat back and headrest, an instrument panel.
  ctx.box('dark', [0.24, 0.2, 0.06], [0, 0.13, 0.05], [-0.15, 0, 0], 0.02);
  ctx.box('dark', [0.14, 0.07, 0.05], [0, 0.255, 0.07], undefined, 0.02);
  ctx.box('dark', [0.32, 0.08, 0.1], [0, 0.12, -0.36], [0.4, 0, 0], 0.012);
}

// -------------------------------------------------------- deck-house plans

/**
 * Plan of a deck house seen from above: a superellipse of half width `a`,
 * reaching `bf` ahead of `zc` and `bb` behind it, with exponent `pf` on the
 * front half and `pb` on the back half (2 an ellipse, higher a squarer corner).
 */
interface Plan { a: number; bf: number; bb: number; zc: number; pf: number; pb: number }
/** One ring of a deck house: scale `s` of the plan, grown by `d` metres, at height `y`, its centre moved `dz`. */
type Station = [s: number, d: number, y: number, dz?: number];

/** The plan's point at angle t (0 = +X, −π/2 = straight ahead). */
function planPoint(p: Plan, t: number, [s, d, y, dz = 0]: Station): Vec3 {
  const c = Math.cos(t), sn = Math.sin(t), e = 2 / (sn < 0 ? p.pf : p.pb);
  const a = p.a * s + d, b = (sn < 0 ? p.bf : p.bb) * s + d;
  return [a * Math.sign(c) * Math.abs(c) ** e, y, p.zc + dz + b * Math.sign(sn) * Math.abs(sn) ** e];
}

/** A smooth band of a deck house through its stations, n points round; `role` may vary with the strip's mid angle. */
function house(ctx: Ctx, role: Role | ((t: number) => Role | null), p: Plan, stations: Station[], n: number, caps: { start?: Role; end?: Role } = {}) {
  const at = (j: number) => (2 * Math.PI * j) / n;
  const rings = stations.map(st => Array.from({ length: n }, (_, j) => planPoint(p, at(j), st)));
  smoothSkin(ctx, rings, j => (typeof role === 'string' ? role : role(at(j + 0.5))), caps);
}

// ------------------------------------------------------------- lookout dome

/** The lookout's plan: nearly round, a little ahead of the footprint's middle. */
const LOOKOUT: Plan = { a: 0.27, bf: 0.3, bb: 0.3, zc: -0.06, pf: 2, pb: 2 };

/**
 * Lookout dome (slit visor): a round lamp-room cupola instead of the
 * faceted armour. A flared, rounded collar at the deck, a short drum, the
 * 60 mm vision slit as a dark band all the way round between a brass ring
 * and a brass brow, then a domed cap with a ball finial, as on a lamp room's
 * vent. No plates, bolts or hatches.
 */
function lookoutDome(ctx: Ctx) {
  const n = segs(ctx, 14, 12, 10), hi = ctx.detail === 2;
  house(ctx, 'secondary', LOOKOUT, hi ? [[1.15, 0, 0], [1.13, 0, 0.03], [1.07, 0, 0.06], [1, 0, 0.085]] : [[1.15, 0, 0], [1.1, 0, 0.045], [1, 0, 0.085]], n);
  house(ctx, 'primary', LOOKOUT, [[1, 0, 0.085], [1, 0, 0.2]], n);
  // Brass ring, the 60 mm slit, and the brass brow over it.
  house(ctx, 'trim', LOOKOUT, [[1, 0, 0.2], [1.05, 0, 0.214], [1, 0, 0.228]], n);
  house(ctx, 'dark', LOOKOUT, [[1, 0, 0.228], [1, 0, 0.288]], n);
  house(ctx, 'trim', LOOKOUT, hi ? [[1, 0, 0.288], [1.09, 0, 0.296], [1.07, 0, 0.312], [1, 0, 0.322]] : [[1, 0, 0.288], [1.09, 0, 0.302], [1, 0, 0.322]], n);
  // Domed cap.
  const rows = segs(ctx, 5, 3, 2);
  house(ctx, 'primary', LOOKOUT, Array.from({ length: rows + 1 }, (_, i): Station => {
    const t = (Math.PI / 2) * (i / rows);
    return [Math.cos(t), 0, 0.322 + 0.18 * Math.sin(t)];
  }), n);
  // Ball finial.
  if (hi) ctx.cylinder('metal', 0.011, 0.016, 0.04, { position: [0, 0.505, LOOKOUT.zc] }, 8);
  ctx.b.geometry(ctx.mat('trim'), new T.IcosahedronGeometry(0.026, ctx.detail >= 1 ? 1 : 0), { position: [0, 0.535, LOOKOUT.zc] });
}

// ---------------------------------------------------------------- wheelhouse

/** The wheelhouse plan: a rounded front, squarer back corners. */
const HOUSE: Plan = { a: 0.285, bf: 0.52, bb: 0.5, zc: 0, pf: 2.8, pb: 4.5 };
/** The roof's plan, drawn a little forward so the brim shades the front windows. */
const ROOF: Plan = { ...HOUSE, zc: -0.015 };
/** Sill and head of the glazing; the glazing leans in 30 mm towards the roof. */
const SILL: Station = [1, 0, 0.182], HEAD: Station = [1, -0.03, 0.36];

/**
 * Wheelhouse (raised bridge): a small boat's wheelhouse on the deck. A
 * rounded painted lower house with a trim rubbing strake, a band of glass
 * round the front and sides between chunky painted posts, leaning in towards a
 * cambered roof whose brim overhangs all round; two seats and a console inside
 * (and the wheel at high detail), a porthole in the back wall.
 */
function wheelhouse(ctx: Ctx) {
  const n = segs(ctx, 24, 16, 12), hi = ctx.detail === 2;
  // The back wall runs between the ring points nearest the back corners (45° either side of straight aft).
  const corner = (2 * Math.PI * Math.round(n / 8)) / n, back = Math.sin(corner);
  house(ctx, 'primary', HOUSE, [[1, 0, 0], [1, 0, 0.15]], n);
  // Rubbing strake under the windows; its top is the cabin floor.
  house(ctx, 'trim', HOUSE, ctx.detail === 0 ? [[1, 0, 0.15], SILL] : [[1, 0, 0.15], [1, 0.016, 0.166], SILL], n, { end: 'dark' });
  house(ctx, t => (Math.sin(t) > back ? 'primary' : 'glass'), HOUSE, [SILL, HEAD], n);
  // Cambered roof with a rounded brim.
  house(ctx, 'secondary', ROOF, hi
    ? [[1, -0.04, 0.35], [1, 0.034, 0.374], [1, 0.042, 0.392], [0.9, 0.022, 0.43], [0.55, 0, 0.474], [0, 0, 0.49]]
    : [[1, -0.04, 0.35], [1, 0.04, 0.384], [0.85, 0.016, 0.44], [0, 0, 0.485]], n);

  // Chunky painted window posts, proud of the glass: the corners always, the front middle and side middles from medium.
  const post = (t: number) => {
    const a = planPoint(HOUSE, t, [1, 0.006, 0.18]), b = planPoint(HOUSE, t, [1, -0.024, 0.36]);
    ctx.strut('primary', a, b, 0.036, 0.024, 0, [a[0], 0, a[2] - HOUSE.zc]);
  };
  for (const t of [-Math.PI / 4, -3 * Math.PI / 4, corner, Math.PI - corner]) post(t);
  if (ctx.detail >= 1) for (const t of [-Math.PI / 2, 0, Math.PI]) post(t);

  // Inside: a console under the front windows, two seats, the wheel at the starboard seat.
  ctx.box('dark', [0.42, 0.07, 0.08], [0, 0.215, -0.34], [0.35, 0, 0], 0);
  for (const x of [-0.11, 0.11]) {
    ctx.box('dark', [0.15, 0.04, 0.14], [x, 0.2, 0.02], undefined, 0);
    ctx.box('dark', [0.15, 0.15, 0.035], [x, 0.275, 0.1], [0.15, 0, 0], 0);
  }
  if (hi) ctx.b.geometry(ctx.mat('trim'), new T.TorusGeometry(0.045, 0.008, 3, 10), { position: [0.11, 0.27, -0.27], rotation: [-0.5, 0, 0] });
  // Porthole in the back wall, square to the leaning glazing.
  if (ctx.detail >= 1) {
    const c = planPoint(HOUSE, Math.PI / 2, [1, -0.016, 0.27]), lean: Vec3 = [Math.PI / 2 - 0.166, 0, 0];
    ctx.cylinder('metal', 0.046, 0.046, 0.016, { position: c, rotation: lean }, segs(ctx, 12, 10, 8));
    ctx.cylinder('glass', 0.034, 0.034, 0.02, { position: c, rotation: lean }, segs(ctx, 12, 10, 8));
  }
}

export const VILLAGE_COCKPITS: Record<string, (ctx: Ctx) => void> = {
  'faceted-canopy': bubbleCanopy,
  'slit-visor': lookoutDome,
  'raised-bridge': wheelhouse,
};
