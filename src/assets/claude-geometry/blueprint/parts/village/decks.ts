import type { Material } from 'three';
import { extrudeZY, SLAB } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Village floors and the pitched roof, on the industrial cell frames: origin
// at the cell centre, y = 0 on the walking surface, the slab below down to
// −0.16 m.

/** Boards across a village floor cell, on a third of a metre each, so runs of cells read as one wide-plank floor. */
export const FLOOR_BOARDS = 3;

/**
 * Wide-plank floor on a stone slab: three boards running along z,
 * 6 mm apart and 3 mm in from the cell's sides, so the joints fall every
 * third of a metre across a whole floor and are its only lines but the slab's
 * edge, which is the plinth band outside. One sheet at low.
 */
export function floorDeck(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  const boards = k.low ? 1 : FLOOR_BOARDS, w = 1.0 / boards, gap = k.low ? 0 : 0.006;
  for (let i = 0; i < boards; i++) b.box(k.m('tread'), [w - gap, 0.03, 1.0], { position: [-0.5 + (i + 0.5) * w, -0.015, 0] }, 0);
}

/**
 * Rise of the village roof panel over its 1 m cell: 0.5 m, 26.6°, a kawara
 * roof's pitch, against the industrial panel's 0.36 m (20°). The 35° of the
 * b98e0ce cottages left no room for a deep eave above the wall below.
 */
export const VILLAGE_SLOPE_RISE = 0.5;
/**
 * The eave past the cell edge: 0.45 m out (0.35 m past the face of the wall
 * below) on a flatter fall, 0.25 in 1 (14°), so the roof line kicks up at
 * the eave as a kawara roof's does and the eave never drops to y −0.16, the
 * top of that wall. docs/restyle/parts.md has the profile for the main
 * project's collider.
 */
export const VILLAGE_EAVE = { reach: 0.45, fall: 0.25 };
/** Tile bands: how thick each is, and how far its lip stands over the band below. */
export const VILLAGE_TILE = { thick: 0.05, lip: 0.04 };
/**
 * The ridge, half of it on each panel so two panels back to back make it
 * whole: a block 0.09 m out from the ridge line standing 0.1 m over the gable's
 * apex, and on it a cap 0.05 m out, 0.05 m higher.
 */
export const VILLAGE_RIDGE = { half: 0.09, block: 0.1, capHalf: 0.05, cap: 0.05 };
/** Top of the ridge cap over the panel's walking level: the panel's highest point. */
export const VILLAGE_RIDGE_TOP = VILLAGE_SLOPE_RISE + VILLAGE_RIDGE.block + VILLAGE_RIDGE.cap;

type ZY = [number, number];

/** The line the tile bands lie on, y at z in the panel's frame: the pitch from the ridge to the cell edge, then the eave's flatter fall. */
export function villageFoot(z: number): number {
  return z <= 0.5 ? VILLAGE_SLOPE_RISE * (0.5 - z) : -VILLAGE_EAVE.fall * (z - 0.5);
}

/**
 * The three tile bands, the same at every LOD, each a quadrilateral in (z, y)
 * extruded across the panel: [foot at the back, foot at the front, lip, top at
 * the back]. Two bands share the pitch, ridge to cell edge; the third is the
 * eave. Each lies on the foot line, VILLAGE_TILE.thick deep at its back and
 * deeper by the lip at its front, so its lip stands over the next band's back
 * and no gap opens under a lip.
 */
export const VILLAGE_BANDS: ZY[][] = (() => {
  const R = VILLAGE_SLOPE_RISE, a = Math.atan2(R, 1), e = Math.atan(VILLAGE_EAVE.fall);
  const { thick, lip } = VILLAGE_TILE;
  const up = (p: ZY, n: number, d: number): ZY => [p[0] + d * Math.sin(n), p[1] + d * Math.cos(n)];
  const at = (z: number): ZY => [z, villageFoot(z)];
  const ridge = at(-0.5), mid = at(0), edge = at(0.5), tip = at(0.5 + VILLAGE_EAVE.reach);
  return [
    [ridge, mid, up(mid, a, thick + lip), up(ridge, a, thick)],
    [mid, edge, up(edge, a, thick + lip), up(mid, a, thick)],
    [edge, tip, up(tip, e, thick), up(edge, e, thick)],
  ];
})();

/** How far the village roof panel reaches past its cell centre (+Z), and its eave's lowest point: the listed size change. */
export const VILLAGE_EAVE_REACH = (() => {
  const eave = VILLAGE_BANDS[2];
  return { z: Math.max(...eave.map(p => p[0])), y: Math.min(...eave.map(p => p[1])) };
})();

/** Rafter tails under the eave on the 0.25 m module, so they line up across panels; local x of each. */
export const RAFTERS = [-0.375, -0.125, 0.125, 0.375];
/** The eave's rafter tails: from the frieze's face to `end` (z), `deep` under the eave band, run along its fall. */
export const RAFTER = { from: 0.61, end: 0.86, deep: 0.045, wide: 0.045 };

/** The frieze over the outer half of the wall below, up to the eave band's underside: a (z, y) profile. */
export const FRIEZE: ZY[] = [[0.5, -SLAB], [RAFTER.from, -SLAB], [RAFTER.from, villageFoot(RAFTER.from)], [0.5, 0]];

/**
 * Kawara roof panel: a timber ceiling slab, a plaster wedge whose ends
 * are the gable, and the three wide tile bands laid from the ridge (−Z) down
 * past the eave (+Z), each lip standing over the band below: a few creases on
 * the roof and a stepped edge at the gable. Half the ridge on the high edge,
 * so two panels back to back make a whole raised ridge; under the eave a
 * frieze over the wall and (not at low) four rafter tails.
 */
export function slopeRoof(k: Kit) {
  const { b } = k;
  const R = VILLAGE_SLOPE_RISE, timber = k.m('post'), tiles = k.m('corrugated');
  b.box(timber, [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  extrudeZY(k, k.m('skin'), [[0.5, -0.03], [-0.5, -0.03], [-0.5, R], [0.5, 0]], -0.5, 0.5);
  for (const band of VILLAGE_BANDS) extrudeZY(k, tiles, band, -0.5, 0.5);
  ridge(k, tiles, -0.5, 0.5);
  extrudeZY(k, timber, FRIEZE, -0.5, 0.5);
  if (k.low) return;
  for (const x of RAFTERS) extrudeZY(k, timber, rafterTail(), x - RAFTER.wide / 2, x + RAFTER.wide / 2);
}

/** One rafter tail's (z, y) profile: its top 2 mm up into the eave band, cut plumb at both ends. */
export function rafterTail(): ZY[] {
  const { from, end, deep } = RAFTER, d = deep / Math.cos(Math.atan(VILLAGE_EAVE.fall));
  return [[from, villageFoot(from) + 0.002], [from, villageFoot(from) - d], [end, villageFoot(end) - d], [end, villageFoot(end) + 0.002]];
}

/**
 * Half the ridge, block and cap, from x0 to x1 on the panel's high edge. The block
 * stands on the gable's apex height, so its end is never in the plaster gable's plane
 * (the first band fills under it).
 */
export function ridge(k: Kit, tiles: Material, x0: number, x1: number) {
  const R = VILLAGE_SLOPE_RISE, { half, block, capHalf, cap } = VILLAGE_RIDGE, base = R;
  k.b.box(tiles, [x1 - x0, R + block - base, half], { position: [(x0 + x1) / 2, (base + R + block) / 2, -0.5 + half / 2] }, 0);
  k.b.box(tiles, [x1 - x0, cap, capHalf], { position: [(x0 + x1) / 2, R + block + cap / 2, -0.5 + capHalf / 2] }, 0);
}

/**
 * Slatted boardwalk in the grating's place: a timber fascia frame the
 * full slab deep round the cell (walls still land on timber), two joists, and
 * between the frame's sides six narrow slats with 40 mm gaps (four at low),
 * so light falls through as it does through the grating. The slats stop at
 * the frame instead of running over it: no face of theirs lies in the
 * frame's top.
 */
export function grateDeck(k: Kit) {
  const { b } = k;
  const frame = k.m('post'), slats = k.m('tread');
  for (const z of [-0.475, 0.475]) b.box(frame, [1.0, 0.12, 0.05], { position: [0, -0.06, z] }, 0);
  for (const x of [-0.475, 0.475]) b.box(frame, [0.05, 0.12, 0.9], { position: [x, -0.06, 0] }, 0);
  if (!k.low) for (const z of [-0.16, 0.16]) b.box(frame, [0.9, 0.09, 0.05], { position: [0, -0.075, z] }, 0);
  const n = k.low ? 4 : 6, pitch = 0.9 / n;
  for (let i = 0; i < n; i++) b.box(slats, [pitch - 0.04, 0.03, 0.9], { position: [-0.45 + (i + 0.5) * pitch, -0.015, 0] }, 0);
}

/** Boards across a roof terrace cell, on a quarter metre each, laid along x and 15 mm apart. */
export const DECK_BOARDS = 4;

/**
 * Roof terrace in the flat roof's place, a drying platform: the slab
 * under four wide boards laid along x with 15 mm open joints (one sheet at
 * low), their tops exactly on the walking surface; and below, the ceiling of
 * the room under it: two timber joists and a paper lantern hung where the
 * industrial luminaire is, its glow round the same light point, clear of the
 * 1.86 m door opening.
 */
export function roofDeck(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  const boards = k.low ? 1 : DECK_BOARDS, w = 1.0 / boards, gap = k.low ? 0 : 0.015;
  for (let i = 0; i < boards; i++) b.box(k.m('tread'), [1.0, 0.03, w - gap], { position: [0, -0.015, -0.5 + (i + 0.5) * w] }, 0);
  // Ceiling of the room below.
  const soffit = -SLAB;
  if (!k.low) for (const z of [-0.3, 0.3]) b.box(k.m('post'), [1.0, 0.06, 0.08], { position: [0, soffit - 0.03, z] }, 0);
  // Lantern: a cord, a timber cap and the glowing paper box round the industrial luminaire's light point.
  const lx = 0, lz = -0.05, ly = soffit - 0.105, glow = 0.07, cap = 0.012;
  b.box(k.m('steel'), [0.01, 0.045 - cap, 0.01], { position: [lx, soffit - (0.045 - cap) / 2, lz] }, 0);
  b.box(k.m('post'), [glow + 0.01, cap, glow + 0.01], { position: [lx, ly + glow - 0.01 + cap / 2, lz] }, 0);
  b.box(k.m('lamp'), [glow, glow, glow], { position: [lx, ly - 0.01 + glow / 2, lz] }, 0);
  b.emitter('ceiling', [0, soffit - 0.105, -0.05], [0, -1, 0]);
}
