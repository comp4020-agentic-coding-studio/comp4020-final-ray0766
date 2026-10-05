import { extrudeZY, latheBands, small, STOREY, WALL_H, WALL_T } from './kit.ts';
import type { Kit } from './kit.ts';

// Columns, stairs and the edge guards (parapet, railing), plus rooftop plant.

/** Corner column at a grid vertex: closes the joint where two walls meet (reference module). */
export function cornerColumn(k: Kit) {
  const { b } = k;
  const steel = k.m('post'), bare = k.m('steel');
  b.box(steel, [0.22, WALL_H, 0.22], { position: [0, WALL_H / 2, 0] }, 0.012);
  b.box(bare, [0.3, 0.03, 0.3], { position: [0, 0.015, 0] }, 0.006);
  for (const [x, z] of [[0.11, 0.11], [-0.11, 0.11], [0.11, -0.11], [-0.11, -0.11]]) b.bolt(bare, { position: [x, 0.03, z] }, 0.013);
  b.box(k.m('hazard'), [0.226, 0.4, 0.226], { position: [0, 0.32, 0] }, 0.012);
}

/**
 * Straight industrial stair over a 1×2 cell footprint, climbing towards −Z and
 * rising one storey: eleven 0.2 m risers between two channel stringers, tread
 * plate treads with hazard nosings on angle supports, and a handrail with
 * posts on both sides. Origin at the centre of the bottom cell.
 *
 * Clearances that the slot rules in ../model.ts rely on:
 * - nothing reaches further than STAIR.reach (0.376 m) from the centre line,
 *   so a wall on a side edge (inner face 0.40 m out, posts included) never
 *   touches it, provided the wall's outside detail faces away;
 * - the stringers stop STAIR.setback (0.12 m) short of the far cell edge and a
 *   bolted landing plate bridges to the slab, so a wall under the landing
 *   edge (head beam 0.105 m deep) clears the stair whichever way it faces.
 */
export const STAIR = (() => {
  const risers = 11, rise = STOREY / risers, setback = 0.12, edge = -1.5;
  const top = edge + setback;                   // nosing line of the landing plate
  const going = (2.0 - 0.06 - setback) / risers;
  const foot = top + risers * going;            // first riser line, z = 0.44
  const k = rise / going;                       // pitch as dy/dz
  return { risers, rise, going, foot, top, edge, setback, halfWidth: 0.32, reach: 0.376, pitch: Math.atan(k), slope: k, nosingY: (z: number) => (foot - z) * k };
})();

export function stair(k: Kit) {
  const { b } = k;
  const S = STAIR, beta = S.pitch, cos = Math.cos(beta), sin = Math.sin(beta);
  const nose = S.nosingY;
  const halfW = S.halfWidth, web = 0.012, depth = 0.22, lip = 0.06;
  const topEdge = (z: number) => nose(z) + lip, vDepth = depth / cos;
  // Stringer webs: a parallelogram cut flat at the floor and square at the landing.
  const zb = S.foot + lip / S.slope, za = S.foot - (vDepth - lip) / S.slope, zc = S.foot - (STOREY - lip) / S.slope;
  const yBack = topEdge(S.top) - vDepth;
  const profile: [number, number][] = [[zb, 0], [zc, STOREY], [S.top, STOREY], [S.top, yBack], [za, 0]];
  for (const side of [-1, 1]) extrudeZY(k, k.m('post'), profile, side * halfW - web / 2, side * halfW + web / 2);
  // Channel flanges, turned outwards, along the top and bottom edges.
  const nrm: [number, number] = [cos, sin];     // (y, z) of the slope's upward normal
  const flange = (z0: number, y0: number, z1: number, y1: number, off: number, side: number) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    b.box(k.m('post'), [0.06, web, len], { position: [side * (halfW + 0.03 - web / 2), (y0 + y1) / 2 + nrm[0] * off, (z0 + z1) / 2 + nrm[1] * off], rotation: [beta, 0, 0] }, small(k, 0.003));
  };
  if (!k.low) for (const side of [-1, 1]) {
    // The top flange starts 45 mm up, clear of a corner column's base plate at the foot.
    flange(zb - 0.045 / S.slope, 0.045, zc, STOREY, -web / 2, side);
    flange(za, 0, S.top, yBack, web / 2, side);
  }
  // Treads with nosings, each on two angle supports; the top tread stops at the stringer ends.
  for (let i = 1; i < S.risers; i++) {
    const y = i * S.rise, z = S.foot - i * S.going;
    const d = Math.min(S.going + 0.03, z - S.top);
    b.box(k.m('tread'), [2 * halfW - web, 0.03, d], { position: [0, y - 0.015, z - d / 2] }, small(k, 0.004));
    b.box(k.m('hazard'), [2 * halfW - web - 0.004, 0.03, 0.045], { position: [0, y - 0.014, z - 0.021] }, 0);
    if (!k.low) for (const side of [-1, 1]) {
      b.box(k.m('steel'), [0.04, 0.04, d - 0.04], { position: [side * (halfW - 0.026), y - 0.05, z - d / 2] }, 0);
      if (k.fine) b.bolt(k.m('steel'), { position: [side * (halfW + web / 2), y - 0.05, z - d / 2], rotation: [0, 0, -side * Math.PI / 2] }, 0.009);
    }
  }
  // Landing plate from the stringer ends to the slab edge, on two bolted cleats, with its own nosing.
  const lz = (S.top + S.edge) / 2;
  // The plate sits 1 mm low so its nosing, like the treads', stands proud of it yet stays flush with the landing.
  b.box(k.m('tread'), [2 * halfW + 0.03, 0.03, S.setback], { position: [0, STOREY - 0.016, lz] }, small(k, 0.004));
  b.box(k.m('hazard'), [2 * halfW - web - 0.004, 0.03, 0.045], { position: [0, STOREY - 0.015, S.top - 0.0225] }, 0);
  if (!k.low) for (const side of [-1, 1]) {
    b.box(k.m('steel'), [0.05, 0.05, S.setback + 0.06], { position: [side * (halfW - 0.031), STOREY - 0.055, lz + 0.03] }, small(k, 0.003));
    if (k.hardware) b.bolt(k.m('steel'), { position: [side * (halfW - 0.031), STOREY, lz] }, 0.01);
  }
  // Base plates bolted to the floor, kept short of the cell corner where a column's base plate sits.
  const pz = (za + 0.345) / 2, pl = 0.345 - za;
  for (const side of [-1, 1]) {
    const x = side * (halfW + 0.03);
    b.box(k.m('steel'), [0.08, 0.012, pl], { position: [x - side * 0.02, 0.006, pz] }, small(k, 0.003));
    for (const dz of [-pl / 2 + 0.035, pl / 2 - 0.035]) b.bolt(k.m('steel'), { position: [x, 0.012, pz + dz] }, 0.011);
  }
  // Handrails: posts clamped to the outside of each stringer, a top rail and (high LOD) a mid rail.
  const railR = 0.021, postR = 0.019, railH = 0.9;
  const posts = k.low ? [2, 9] : [1, 5, 9];
  const zs = S.foot - 0.06, ze = S.top + 0.05;
  const rail = (h: number, r: number, x: number) => {
    const len = (zs - ze) / cos, zm = (zs + ze) / 2;
    b.cylinder(k.m('bright'), r, r, len, { position: [x, nose(zm) + h, zm], rotation: [beta - Math.PI / 2, 0, 0] });
  };
  for (const side of [-1, 1]) {
    const x = side * (halfW + 0.035);
    for (const i of posts) {
      const z = S.foot - i * S.going - 0.12;
      const y0 = topEdge(z) - 0.18, y1 = nose(z) + railH;
      // At low LOD the post ends go uncapped: the top is inside the rail, the foot beside the stringer.
      b.cylinder(k.m('post'), postR, postR, y1 - y0, { position: [x, (y0 + y1) / 2, z] }, { open: k.low });
      if (k.hardware) b.box(k.m('steel'), [0.03, 0.08, 0.06], { position: [x - side * 0.02, topEdge(z) - 0.12, z] }, 0);
    }
    rail(railH, railR, x);
    if (k.fine) rail(railH / 2, 0.015, x);
  }
}

/**
 * Guard railing for balconies and roof edges: one post per metre on a bolted
 * base plate, a 1.07 m top rail, a mid rail and a toe board. Rails carry
 * coupling sleeves at both ends, so neighbouring modules read as one run.
 */
export function guardRail(k: Kit) {
  const { b } = k;
  const z = -0.06, top = 1.07;
  b.box(k.m('post'), [0.05, top - 0.02, 0.05], { position: [0, (top - 0.02) / 2 + 0.012, z] }, small(k, 0.004));
  b.box(k.m('steel'), [0.15, 0.012, 0.14], { position: [0, 0.006, z] }, small(k, 0.003));
  for (const [dx, dz] of [[-0.05, -0.045], [0.05, -0.045], [-0.05, 0.045], [0.05, 0.045]]) b.bolt(k.m('steel'), { position: [dx, 0.012, z + dz] }, 0.01);
  // Saddle under the top rail.
  if (!k.low) b.box(k.m('steel'), [0.08, 0.03, 0.06], { position: [0, top - 0.035, z] }, small(k, 0.003));
  const run = (y: number, r: number) => {
    b.cylinder(k.m('bright'), r, r, 1.0, { position: [0, y, z], rotation: [0, 0, Math.PI / 2] });
    if (!k.low) for (const x of [-0.475, 0.475]) b.cylinder(k.m('steel'), r + 0.005, r + 0.005, 0.05, { position: [x, y, z], rotation: [0, 0, Math.PI / 2] });
  };
  run(top, 0.022);
  run(0.56, 0.016);
  // Toe board on the outer face of the post, clear of the deck for drainage.
  b.box(k.m('post'), [1.0, 0.1, 0.01], { position: [0, 0.065, z + 0.03] }, 0);
}

/**
 * Parapet on a roof edge: 0.62 m upstand with half posts, cladding outside,
 * the roof membrane turned up the inside under a bolted termination bar, and
 * a sloped coping with drip legs on both faces.
 */
export const PARAPET_H = 0.62;
export function parapet(k: Kit) {
  const { b } = k;
  const H = PARAPET_H;
  for (const x of [-0.475, 0.475]) b.box(k.m('post'), [0.05, H - 0.03, WALL_T + 0.02], { position: [x, (H - 0.03) / 2, 0] }, small(k, 0.006));
  b.box(k.m('skin'), [0.9, H - 0.05, 0.05], { position: [0, (H - 0.05) / 2, WALL_T / 2 - 0.025] }, 0.006);
  b.box(k.m('skinInner'), [0.9, H - 0.05, 0.05], { position: [0, (H - 0.05) / 2, -WALL_T / 2 + 0.025] }, 0.006);
  // Membrane upstand and termination bar on the roof side.
  b.box(k.m('membrane'), [1.0, 0.3, 0.01], { position: [0, 0.15, -WALL_T / 2 - 0.005] }, 0);
  b.box(k.m('steel'), [1.0, 0.03, 0.006], { position: [0, 0.29, -WALL_T / 2 - 0.013] }, 0);
  for (const x of [-0.3, 0, 0.3]) b.bolt(k.m('steel'), { position: [x, 0.29, -WALL_T / 2 - 0.016], rotation: [-Math.PI / 2, 0, 0] }, 0.008);
  // Coping falls towards the roof so water does not stain the facade. Bare steel:
  // polished alloy on an up-facing surface mirrors the sun and blows out.
  b.box(k.m('steel'), [1.0, 0.025, WALL_T + 0.1], { position: [0, H - 0.015, 0], rotation: [-0.06, 0, 0] }, small(k, 0.004));
  for (const s of [-1, 1]) b.box(k.m('steel'), [1.0, 0.055, 0.008], { position: [0, H - 0.05 - s * 0.003, s * (WALL_T / 2 + 0.046)] }, 0);
}

/**
 * Rooftop condenser on a skid: painted housing, fan shroud with a guard,
 * intake slats on the sides, a coil grille at the back, an access panel with
 * a nameplate and a pilot lamp, and lagged refrigerant lines into the roof.
 * Sized to sit in a cell with a wall or parapet on any side: it stays within
 * PLANT_REACH (0.38 m) of the cell centre, short of a wall's inner posts
 * (0.40 m) and a parapet's termination bar (0.387 m), and its housing stays
 * within 0.36 m, under the overhang of a parapet coping that starts 0.59 m up.
 */
export const PLANT_REACH = 0.38;
export function plantUnit(k: Kit) {
  const { b } = k;
  const base = 0.1, hgt = 0.56, w = 0.68, d = 0.6, top = base + hgt;
  for (const x of [-0.25, 0.25]) {
    b.box(k.m('post'), [0.08, 0.08, 0.72], { position: [x, 0.06, 0] }, small(k, 0.004));
    for (const z of [-0.28, 0.28]) b.box(k.m('membrane'), [0.1, 0.02, 0.1], { position: [x, 0.01, z] }, 0);
  }
  b.box(k.m('leaf'), [w, hgt, d], { position: [0, base + hgt / 2, 0] }, 0.02);
  b.box(k.m('steel'), [w + 0.02, 0.05, d + 0.02], { position: [0, base + 0.025, 0] }, small(k, 0.004));
  // Fan: a pressed venturi ring standing on the lid (each face of its profile
  // its own band, so the edges stay crisp instead of rounding into a tyre),
  // a dark throat with blades, then the guard (ring and bars) and the motor hub.
  latheBands(k, k.m('leaf'), [[0.25, 0.1], [0.25, 0.006], [0.29, 0.006], [0.29, 0.082], [0.272, 0.1], [0.25, 0.1]], { position: [0, top, 0] });
  b.cylinder(k.m('post'), 0.25, 0.25, 0.006, { position: [0, top + 0.004, 0] });
  if (!k.low) {
    for (let i = 0; i < 3; i++) b.box(k.m('post'), [0.2, 0.006, 0.07], { position: [Math.cos(i * 2.094) * 0.12, top + 0.035, Math.sin(i * 2.094) * 0.12], rotation: [0.35, -i * 2.094, 0] }, 0);
    latheBands(k, k.m('bright'), [[0.268, 0.112], [0.256, 0.112], [0.256, 0.1], [0.268, 0.1], [0.268, 0.112]], { position: [0, top, 0] });
    for (let i = 0; i < 4; i++) b.box(k.m('bright'), [0.52, 0.008, 0.008], { position: [0, top + 0.106, 0], rotation: [0, i * Math.PI / 4, 0] }, 0);
  }
  b.cylinder(k.m('steel'), 0.05, 0.055, 0.05, { position: [0, top + 0.09, 0] });
  // Intake slats on both sides.
  if (!k.low) for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    b.box(k.m('steel'), [0.006, 0.028, d - 0.12], { position: [s * (w / 2 + 0.006), base + 0.12 + i * 0.072, 0], rotation: [0, 0, s * 0.5] }, 0);
  }
  // Coil grille at the back.
  if (!k.low) for (let i = 0; i < 9; i++) b.box(k.m('steel'), [0.012, hgt - 0.16, 0.006], { position: [-0.28 + i * 0.07, base + hgt / 2, -d / 2 - 0.004] }, 0);
  // Access panel with screws, handle, nameplate, isolator and pilot lamp.
  const fz = d / 2;
  b.box(k.m('leaf'), [0.32, 0.36, 0.01], { position: [-0.14, base + 0.28, fz + 0.005] }, small(k, 0.003));
  for (const [x, y] of [[-0.28, 0.13], [0.0, 0.13], [-0.28, 0.43], [0.0, 0.43]]) b.bolt(k.m('steel'), { position: [x, base + y, fz + 0.01], rotation: [Math.PI / 2, 0, 0] }, 0.008);
  b.box(k.m('bright'), [0.1, 0.02, 0.025], { position: [-0.14, base + 0.28, fz + 0.022] }, small(k, 0.004));
  b.box(k.m('bright'), [0.1, 0.04, 0.004], { position: [0.18, base + 0.46, fz + 0.002] }, 0);
  b.box(k.m('post'), [0.12, 0.17, 0.06], { position: [0.18, base + 0.23, fz + 0.03] }, small(k, 0.006));
  b.box(k.m('lamp'), [0.03, 0.012, 0.006], { position: [0.18, base + 0.39, fz + 0.003] }, 0);
  // Lagged refrigerant lines dropping through the roof behind the unit.
  if (!k.low) for (const x of [-0.18, -0.08]) {
    b.cylinder(k.m('membrane'), 0.024, 0.024, base + 0.22, { position: [x, (base + 0.22) / 2, -d / 2 - 0.04] });
    b.cylinder(k.m('membrane'), 0.024, 0.024, 0.045, { position: [x, base + 0.22, -d / 2 - 0.018], rotation: [Math.PI / 2, 0, 0] });
  }
}
