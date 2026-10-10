import { extrudeZY, STOREY, WALL_T } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { PARAPET_H, STAIR } from '../structure.ts';

// Village stair, parapet and rooftop unit, inside the reaches the slot rules
// rely on (STAIR, PLANT_REACH, the parapet's 0.387 m inner face) and with the
// stair's walking surfaces exactly where the industrial stair has them.

/** How far a village stair's handrail stops short of the landing edge: a shut door on the top exit, facing the stair, has its leaves out to 0.147 m (village/walls.ts LEAVES). */
export const RAIL_SHORT = 0.18;

/**
 * Steep timber stair over the industrial stair's 1×2 cells: two closed timber
 * strings 0.6 m apart, plank treads with open risers on the same eleven
 * 0.2 m rises and goings, a landing board at the top, and along each string
 * a square handrail on a square newel at the foot and two square posts (one
 * at low). The rail is cut plumb at both ends and ends in the air over the
 * landing, RAIL_SHORT before its edge, as the industrial rail ends in the
 * air: a post there would stand in a top-exit door's threshold. Everything
 * stays inside STAIR.reach (0.376 m) of the centre line, short of the landing
 * edge below 2.1 m, and the treads' tops are the industrial treads' tops, so
 * the main project's stair collider still fits.
 */
export function stair(k: Kit) {
  const { b } = k;
  const S = STAIR, beta = S.pitch, nose = S.nosingY;
  const string = 0.035, sx = 0.3 + string / 2, lip = 0.06, depth = 0.24, vDepth = depth / Math.cos(beta);
  // String profile in (z, y): its top edge runs `lip` above the nosing line, cut flat at the floor and square at the landing.
  const zb = S.foot + lip / S.slope, za = S.foot - (vDepth - lip) / S.slope, zc = S.foot - (STOREY - lip) / S.slope;
  const yBack = nose(S.top) + lip - vDepth;
  const profile: [number, number][] = [[zb, 0], [zc, STOREY], [S.top, STOREY], [S.top, yBack], [za, 0]];
  for (const side of [-1, 1]) extrudeZY(k, k.m('post'), profile, side * sx - string / 2, side * sx + string / 2);
  // Treads: a plank on each rise, its nosing on the industrial nosing line, lapping the one below; no risers.
  const width = 2 * (sx - string / 2), t = 0.035, over = 0.025;
  for (let i = 1; i < S.risers; i++) {
    const y = i * S.rise, z = S.foot - i * S.going, d = Math.min(S.going + over, z - S.top);
    b.box(k.m('tread'), [width, t, d], { position: [0, y - t / 2, z - d / 2] }, 0);
  }
  // Landing board from the top nosing to the slab edge, as the industrial landing plate.
  b.box(k.m('tread'), [width + 2 * string, 0.03, S.setback], { position: [0, STOREY - 0.016, (S.top + S.edge) / 2] }, 0);
  // Handrails: the rail's top 0.91 m over the nosing line, 45 mm deep square to the slope.
  const railTop = 0.91, railDeep = 0.045 / Math.cos(beta), rail = 0.05, newel = 0.07, post = 0.04;
  const zs = S.foot - newel / 2, ze = S.edge + RAIL_SHORT;
  const posts = k.low ? [6] : [4, 8];
  for (const side of [-1, 1]) {
    const x = side * sx;
    extrudeZY(k, k.m('post'), [[zs, nose(zs) + railTop - railDeep], [ze, nose(ze) + railTop - railDeep], [ze, nose(ze) + railTop], [zs, nose(zs) + railTop]], x - rail / 2, x + rail / 2);
    // Newel at the foot, standing 60 mm above the rail it takes; square posts on the string under the rail.
    const footTop = nose(S.foot - newel) + railTop + 0.06;
    b.box(k.m('post'), [newel, footTop, newel], { position: [x, footTop / 2, zs] }, 0);
    for (const i of posts) {
      const z = S.foot - i * S.going - 0.06, y0 = nose(z) + lip, y1 = nose(z) + railTop - railDeep;
      b.box(k.m('post'), [post, y1 - y0, post], { position: [x, (y0 + y1) / 2, z] }, 0);
    }
  }
}

/** The parapet's kawara coping: how far it overhangs the roof side (to the industrial termination bar, 0.387 m from the cell centre) and the outside, its eaves' depth and its height. */
export const COPING = { inner: 0.023, outer: 0.05, edge: 0.03, height: 0.09 };

/**
 * Plaster parapet in the industrial parapet's place and height: a solid
 * plaster upstand under a small kawara coping, a tile ridge over both faces
 * as a Japanese town's walls have, its roof-side eave no further in than the
 * industrial termination bar; outside (not at low) a little timber rainwater
 * spout.
 */
export function parapet(k: Kit) {
  const { b } = k;
  const H = PARAPET_H, face = WALL_T / 2, { inner, outer, edge, height } = COPING, under = H - height;
  b.box(k.m('skin'), [1.0, under, WALL_T], { position: [0, under / 2, 0] }, 0);
  const zi = -face - inner, zo = face + outer;
  extrudeZY(k, k.m('corrugated'), [[zi, under], [zo, under], [zo, under + edge], [(zi + zo) / 2, H], [zi, under + edge]], -0.5, 0.5);
  if (k.low) return;
  // A stubby spout through the outer face (inside the industrial parapet's depth), off centre.
  b.box(k.m('post'), [0.06, 0.05, 0.08], { position: [0.3, 0.07, face + 0.01] }, 0);
}

/** The rooftop water tank: its staves' radius and height, and the stand it sits on. */
export const TANK = { radius: 0.3, from: 0.26, to: 0.57, lid: 0.06, leg: 0.07, at: 0.24 };

/**
 * Rooftop water tank in the condenser's place: a round tank of boards with two
 * iron hoops (not at low) and a shallow timber lid, on a timber stand of four
 * square legs and two bearers. Within PLANT_REACH (0.38 m) of the cell centre
 * on both axes, and within 0.36 m above 0.55 m, under a parapet's coping.
 */
export function plantUnit(k: Kit) {
  const { b } = k;
  const { radius, from, to, lid, leg, at } = TANK, seg = k.low ? 8 : k.fine ? 16 : 12;
  for (const x of [-at, at]) for (const z of [-at, at]) b.box(k.m('post'), [leg, from - 0.06, leg], { position: [x, (from - 0.06) / 2, z] }, 0);
  for (const z of [-at, at]) b.box(k.m('post'), [2 * at + leg, 0.06, leg], { position: [0, from - 0.03, z] }, 0);
  b.cylinder(k.m('tread'), radius, radius, to - from, { position: [0, (from + to) / 2, 0] }, { segments: seg });
  b.cylinder(k.m('post'), 0.1, radius + 0.012, lid, { position: [0, to + lid / 2, 0] }, { segments: seg });
  if (k.low) return;
  for (const y of [from + 0.06, to - 0.06]) b.cylinder(k.m('steel'), radius + 0.008, radius + 0.008, 0.025, { position: [0, y, 0] }, { segments: seg, open: true });
}
