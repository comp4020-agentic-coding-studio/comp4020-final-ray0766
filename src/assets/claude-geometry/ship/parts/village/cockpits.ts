import type { Vec3 } from '../../../core/vec.ts';
import type { Ctx, Role } from '../../kit.ts';
import { ball, flushDisc, segs, smoothSkin, turn } from './shapes.ts';

// Village cockpits: inside the industrial cockpits' footprint on the deck.
// The village look draws ship glass as an opaque tone (factory.ts
// villageShipMaterials), so nothing is built behind it: no seats, consoles or
// wheel. Bands of colour lie flush on the shape (no proud rings), so the lines
// draw each cockpit's outline and its few real edges.

// ------------------------------------------------------------------ cockpit

/**
 * Bubble canopy: a half-ellipsoid of glass on a low sill, a painted band where
 * it meets the faired back, the fairing running down to the deck. The band
 * and the fairing continue the glass's own curve, so the joint is a change of
 * colour, not a ring standing proud.
 */
function bubbleCanopy(ctx: Ctx) {
  const n = segs(ctx, 14, 10, 8), rows = segs(ctx, 9, 7, 4);
  // Glass from the windscreen foot at z −0.54 back to its joint with the fairing; a half turn over the top, taller than wide.
  const end = 1.05;
  const glass: [number, number][] = Array.from({ length: rows + 1 }, (_, i) => {
    const t = -Math.PI / 2 + (Math.PI / 2 + end) * i / rows;
    return [Math.max(0.004, 0.25 * Math.cos(t)), -0.12 + 0.42 * Math.sin(t)];
  });
  const up = { position: [0, 0.03, 0] as Vec3, scale: [1, 1.36, 1] as Vec3 };
  turn(ctx, 'glass', glass, n, up, Math.PI, 0);
  const joint = glass[glass.length - 1];
  turn(ctx, 'trim', [joint, [0.125, 0.29]], n, up, Math.PI, 0);
  turn(ctx, 'primary', [[0.125, 0.29], [0.12, 0.34], [0.09, 0.46], [0.05, 0.56], [0.006, 0.62]], n, up, Math.PI, 0);
  // The sill: square rails along both sides and across the front, hard-edged at every tier.
  for (const s of [-1, 1]) ctx.box('primary', [0.04, 0.035, 1.12], [s * 0.255, 0.0175, 0.02], undefined, 0);
  ctx.box('primary', [0.55, 0.035, 0.04], [0, 0.0175, -0.55], undefined, 0);
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
 * 60 mm vision slit as a dark band all the way round between two painted
 * brass bands, then a domed cap with a ball finial sitting on it, as on a
 * lamp room's vent. The bands lie flush on the drum. No plates, bolts or hatches.
 */
function lookoutDome(ctx: Ctx) {
  const n = segs(ctx, 14, 12, 10), hi = ctx.detail === 2;
  house(ctx, 'secondary', LOOKOUT, hi ? [[1.15, 0, 0], [1.13, 0, 0.03], [1.07, 0, 0.06], [1, 0, 0.085]] : [[1.15, 0, 0], [1.1, 0, 0.045], [1, 0, 0.085]], n);
  house(ctx, 'primary', LOOKOUT, [[1, 0, 0.085], [1, 0, 0.2]], n);
  // Brass band, the 60 mm slit, brass band.
  house(ctx, 'trim', LOOKOUT, [[1, 0, 0.2], [1, 0, 0.228]], n);
  house(ctx, 'dark', LOOKOUT, [[1, 0, 0.228], [1, 0, 0.288]], n);
  house(ctx, 'trim', LOOKOUT, [[1, 0, 0.288], [1, 0, 0.322]], n);
  // Domed cap.
  const rows = segs(ctx, 5, 3, 2);
  house(ctx, 'primary', LOOKOUT, Array.from({ length: rows + 1 }, (_, i): Station => {
    const t = (Math.PI / 2) * (i / rows);
    return [Math.cos(t), 0, 0.322 + 0.18 * Math.sin(t)];
  }), n);
  // Ball finial, sunk a little into the top of the cap.
  ball(ctx, 'trim', 0.026, 8, 4, [0, 0.518, LOOKOUT.zc]);
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
 * rounded painted lower house with a trim band under the windows, a band of
 * glass round the front and sides between chunky painted posts, leaning in
 * towards a cambered roof whose brim overhangs all round, a porthole painted
 * on the back wall.
 */
function wheelhouse(ctx: Ctx) {
  const n = segs(ctx, 24, 16, 12), hi = ctx.detail === 2;
  // The back wall runs between the ring points nearest the back corners (45° either side of straight aft).
  const corner = (2 * Math.PI * Math.round(n / 8)) / n, back = Math.sin(corner);
  house(ctx, 'primary', HOUSE, [[1, 0, 0], [1, 0, 0.15]], n);
  // A painted band under the windows, flush with the house.
  house(ctx, 'trim', HOUSE, [[1, 0, 0.15], SILL], n);
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

  // Porthole painted on the back wall, which leans in with the glazing (30 mm over its height).
  if (ctx.detail >= 1) {
    const y = 0.27, d = (HEAD[1] * (y - SILL[2])) / (HEAD[2] - SILL[2]);
    const c = planPoint(HOUSE, Math.PI / 2, [1, d, y]), wall: Vec3 = [0, -HEAD[1], HEAD[2] - SILL[2]];
    const k = segs(ctx, 12, 12, 10);
    flushDisc(ctx, 'metal', c, wall, 0.046, 0.034, k);
    flushDisc(ctx, 'glass', c, wall, 0.034, 0, k);
  }
}

export const VILLAGE_COCKPITS: Record<string, (ctx: Ctx) => void> = {
  'faceted-canopy': bubbleCanopy,
  'slit-visor': lookoutDome,
  'raised-bridge': wheelhouse,
};
