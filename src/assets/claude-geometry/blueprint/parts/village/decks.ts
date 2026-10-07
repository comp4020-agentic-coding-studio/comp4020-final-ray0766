import { extrudeZY, SLAB } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Village floors and the pitched roof, on the industrial cell frames: origin
// at the cell centre, y = 0 on the walking surface, the slab below down to
// −0.16 m.

/** Stone slab under timber floorboards running along z; the slab's edge is the plinth band outside. */
export function floorDeck(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  if (k.low) { b.box(k.m('tread'), [1.0, 0.03, 1.0], { position: [0, -0.015, 0] }, 0); return; }
  const boards = 5, w = 1.0 / boards;
  for (let i = 0; i < boards; i++) b.box(k.m('tread'), [w - 0.006, 0.03, 1.0], { position: [-0.5 + (i + 0.5) * w, -0.015, 0] }, 0);
}

/**
 * Rise of the village roof panel over its 1 m cell: 35°, the pitch of the
 * b98e0ce cottages, against the industrial panel's 0.36 m (20°). With the
 * eave below, the size changes of the village set (docs/VILLAGE.md lists them
 * for the main project's colliders).
 */
export const VILLAGE_SLOPE_RISE = 0.7;
/**
 * Overhang along the slope past the cell edge. The tiles end 0.28 m beyond the
 * edge (0.17 m beyond the wall face below), between y = −0.16 and 0, where
 * nothing the slope's rules let stand beyond its gutter side reaches: walls
 * below end at −0.16, parts on the level start at 0.
 */
export const VILLAGE_EAVE = 0.27;
const TILE = 0.04, LAP = 0.03, STEP = 0.03;

/** Courses per tier and their geometry, shared by the model and the documented reach. */
function courses(lod: 'high' | 'medium' | 'low') {
  const R = VILLAGE_SLOPE_RISE, a = Math.atan2(R, 1), length = Math.hypot(1, R) + VILLAGE_EAVE;
  const count = lod === 'low' ? 3 : lod === 'high' ? 7 : 4, pitch = length / count, tile = pitch + LAP;
  const tilt = a - Math.asin(STEP / tile);
  const along = (s: number): [number, number, number] => [0, R - s * Math.sin(a), -0.5 + s * Math.cos(a)];
  const last = along((count - 1) * pitch);
  const end = { y: last[1] - tile * Math.sin(tilt), z: last[2] + tile * Math.cos(tilt) + TILE * Math.sin(tilt) };
  return { R, a, length, count, pitch, tile, tilt, along, end };
}

/** How far the village roof panel reaches past its cell centre (+Z) and down, at its longest tier: the listed size change. */
export const VILLAGE_EAVE_REACH = (() => {
  const all = (['high', 'medium', 'low'] as const).map(courses);
  return { z: Math.max(...all.map(c => c.end.z)), y: Math.min(...all.map(c => c.end.y)) };
})();

/**
 * Pitched roof panel: a timber ceiling slab, a plaster wedge whose ends are
 * the gable, and clay tile courses laid from the ridge (−Z) down past the
 * eave (+Z). Each course is pitched a little flatter than the roof so its
 * lower edge stands one step proud of the course below: a stepped tile
 * silhouette at the gable and a shadow line along every course. Half a ridge
 * cap sits on the high edge, so two panels back to back make a whole ridge;
 * a frieze over the wall, a fascia and rafter tails close the eave.
 */
export function slopeRoof(k: Kit) {
  const { b } = k;
  const { R, a, count, pitch, tile, tilt, along } = courses(k.lod);
  const timber = k.m('post'), tiles = k.m('corrugated');
  b.box(timber, [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  extrudeZY(k, k.m('skin'), [[0.5, -0.03], [-0.5, -0.03], [-0.5, R], [0.5, 0]], -0.5, 0.5);
  for (let i = 0; i < count; i++) {
    b.within({ position: along(i * pitch), rotation: [tilt, 0, 0] }, () => b.box(tiles, [1.0, TILE, tile], { position: [0, TILE / 2, tile / 2] }, 0));
  }
  // Half ridge cap over the high edge.
  b.box(tiles, [1.0, 0.06, 0.08], { position: [0, R + 0.055, -0.46] }, 0);
  // Frieze over the outer half of the wall below, up to the underside of the tiles.
  b.box(timber, [1.0, 0.09, 0.1], { position: [0, -SLAB + 0.045, 0.55] }, 0);
  if (!k.fine) return;
  // Rafter tails under the overhang, on the 0.25 m module so they line up across
  // panels, cut off before they would drop below the wall top (y −0.16).
  const s0 = (0.59 + 0.5) / Math.cos(a), deep = 0.045;
  const run = (R + SLAB - deep * Math.cos(a)) / Math.sin(a) - s0;
  b.within({ position: along(s0), rotation: [a, 0, 0] }, () => {
    for (const x of [-0.375, -0.125, 0.125, 0.375]) b.box(timber, [0.045, deep, run], { position: [x, -deep / 2, run / 2] }, 0);
  });
}

/**
 * Open boardwalk in the grating's place: a timber frame the full slab deep
 * round the cell (walls still land on timber), two joists, and slatted boards
 * with gaps, so light falls through as it does through the grating.
 */
export function grateDeck(k: Kit) {
  const { b } = k;
  const frame = k.m('post'), slats = k.m('tread');
  for (const z of [-0.475, 0.475]) b.box(frame, [1.0, 0.12, 0.05], { position: [0, -0.06, z] }, 0);
  for (const x of [-0.475, 0.475]) b.box(frame, [0.05, 0.12, 0.9], { position: [x, -0.06, 0] }, 0);
  if (!k.low) for (const z of [-0.16, 0.16]) b.box(frame, [0.9, 0.09, 0.05], { position: [0, -0.075, z] }, 0);
  const n = k.low ? 5 : 8, pitch = 0.9 / n;
  for (let i = 0; i < n; i++) b.box(slats, [pitch - 0.028, 0.03, 0.98], { position: [-0.45 + (i + 0.5) * pitch, -0.015, 0] }, 0);
}

/**
 * Roof terrace in the flat roof's place: the slab under square clay tiles with
 * open joints, and below, the ceiling of the room under it: two timber beams
 * and a pendant lamp hung where the industrial luminaire is, its bulb on the
 * same light point, clear of the 1.86 m door opening.
 */
export function roofDeck(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
  const tiles = k.low ? 1 : 2, size = 1.0 / tiles;
  for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
    b.box(k.m('corrugated'), [size - 0.012, 0.03, size - 0.012], { position: [-0.5 + (i + 0.5) * size, -0.015, -0.5 + (j + 0.5) * size] }, 0);
  }
  // Ceiling of the room below.
  const soffit = -SLAB;
  if (!k.low) for (const z of [-0.3, 0.3]) b.box(k.m('post'), [1.0, 0.06, 0.08], { position: [0, soffit - 0.03, z] }, 0);
  // Pendant: cord, a cream shade and the warm bulb round the industrial luminaire's light point.
  const lx = 0, lz = -0.05, ly = soffit - 0.105;
  b.box(k.m('steel'), [0.01, 0.07, 0.01], { position: [lx, soffit - 0.035, lz] }, 0);
  b.cylinder(k.m('marking'), 0.03, 0.09, 0.06, { position: [lx, ly + 0.03, lz] }, { segments: k.low ? 6 : 12, open: false });
  b.box(k.m('lamp'), [0.05, 0.03, 0.05], { position: [lx, ly + 0.005, lz] }, 0);
  b.emitter('ceiling', [0, soffit - 0.105, -0.05], [0, -1, 0]);
}
