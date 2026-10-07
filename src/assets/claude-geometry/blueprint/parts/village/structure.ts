import * as T from 'three';
import { extrudeZY, STOREY, WALL_T } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { PARAPET_H, STAIR } from '../structure.ts';

// Village stair, parapet and rooftop unit, inside the reaches the slot rules
// rely on (STAIR, PLANT_REACH, the parapet's 0.387 m inner face) and with the
// stair's walking surfaces exactly where the industrial stair has them.

/**
 * Cottage stair over the industrial stair's 1×2 cells: two closed timber
 * strings 0.6 m apart, plank treads with a nosing over cream risers on the
 * same eleven 0.2 m rises and goings, a landing board at the top, and a
 * timber handrail on cream balusters along each string between newel posts.
 * Everything stays inside STAIR.reach (0.376 m) of the centre line, short of
 * the landing edge below 2.1 m, and the treads' tops are the industrial
 * treads' tops, so the main project's stair collider still fits.
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
  // Treads: plank on each rise, its nosing on the industrial nosing line; risers set back under the nosings.
  const width = 2 * (sx - string / 2), t = 0.035, over = 0.025;
  for (let i = 1; i < S.risers; i++) {
    const y = i * S.rise, z = S.foot - i * S.going, d = Math.min(S.going + over, z - S.top);
    b.box(k.m('tread'), [width, t, d], { position: [0, y - t / 2, z - d / 2] }, 0);
  }
  if (!k.low) for (let i = 1; i < S.risers; i++) {
    const y0 = (i - 1) * S.rise, y1 = i * S.rise - t, z = S.foot - i * S.going - over - 0.0075;
    b.box(k.m('skin'), [width, y1 - y0, 0.015], { position: [0, (y0 + y1) / 2, z] }, 0);
  }
  // Landing board from the top nosing to the slab edge, as the industrial landing plate.
  b.box(k.m('tread'), [width + 2 * string, 0.03, S.setback], { position: [0, STOREY - 0.016, (S.top + S.edge) / 2] }, 0);
  // Handrails: rail, balusters on the string, a newel post at the foot.
  const railH = 0.89, zs = S.foot - 0.07, ze = S.top + 0.05;   // 10 mm under the industrial rail, so the end ball stays under its top
  const balusters = k.low ? [3, 7] : k.fine ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [2, 4, 6, 8];
  for (const side of [-1, 1]) {
    const x = side * sx;
    const len = (zs - ze) / Math.cos(beta), zm = (zs + ze) / 2;
    b.box(k.m('post'), [0.05, 0.045, len], { position: [x, nose(zm) + railH, zm], rotation: [beta, 0, 0] }, 0);
    for (const i of balusters) {
      const z = S.foot - i * S.going - 0.06, y0 = nose(z) + lip, y1 = nose(z) + railH;
      b.box(k.m('marking'), [0.026, y1 - y0, 0.026], { position: [x, (y0 + y1) / 2, z] }, 0);
    }
    // Foot newel with a ball cap. At the top the rail ends in a ball over the landing, as the
    // industrial rail ends in the air: a post there would stand in a top-exit door's threshold.
    const footTop = nose(zs) + railH + 0.08;
    b.box(k.m('post'), [0.07, footTop, 0.07], { position: [x, footTop / 2, zs + 0.035] }, 0);
    if (!k.low) {
      b.geometry(k.m('post'), new T.IcosahedronGeometry(0.038, k.fine ? 1 : 0), { position: [x, footTop + 0.03, zs + 0.035] });
      b.geometry(k.m('post'), new T.IcosahedronGeometry(0.03, k.fine ? 1 : 0), { position: [x, nose(ze) + railH - 0.015, ze + 0.01] });
    }
  }
}

/**
 * Plaster parapet in the industrial parapet's place and height: a solid
 * upstand with a stone coping that overhangs both faces (on the roof side no
 * further than the industrial termination bar, 0.387 m from the cell centre),
 * a stone kerb along its roof side and, outside, a little timber rainwater spout.
 */
export function parapet(k: Kit) {
  const { b } = k;
  const H = PARAPET_H, face = WALL_T / 2;
  b.box(k.m('skin'), [1.0, H - 0.05, WALL_T], { position: [0, (H - 0.05) / 2, 0] }, 0);
  // Coping: proud by 23 mm inside (to the termination bar's line) and 40 mm outside, with a drip step.
  const inner = 0.023, outer = 0.04;
  b.box(k.m('concrete'), [1.0, 0.05, WALL_T + inner + outer], { position: [0, H - 0.025, (outer - inner) / 2] }, 0);
  if (!k.low) b.box(k.m('concrete'), [1.0, 0.02, WALL_T + 0.01], { position: [0, H - 0.06, 0.0] }, 0);
  // Kerb along the roof side where the terrace meets the wall.
  b.box(k.m('concrete'), [1.0, 0.1, 0.02], { position: [0, 0.05, -face - 0.01] }, 0);
  if (k.low) return;
  // A stubby spout through the outer face (inside the industrial parapet's depth), off centre.
  b.box(k.m('post'), [0.06, 0.05, 0.08], { position: [0.3, 0.07, face + 0.01] }, 0);
}

/**
 * Rooftop air unit in the condenser's place: a rounded painted cabinet on two
 * timber skids with a big round fan on top (a trim ring, a dark throat, four
 * spokes and a hub), a little cream service plate in front and a refrigerant
 * pipe bending down into the roof behind. Within PLANT_REACH (0.38 m) of the
 * cell centre on both axes, and within 0.36 m above 0.55 m, under a parapet's
 * coping.
 */
export function plantUnit(k: Kit) {
  const { b } = k;
  const base = 0.08, h = 0.5, w = 0.62, d = 0.56, top = base + h;
  for (const x of [-0.22, 0.22]) b.box(k.m('post'), [0.08, base, d + 0.06], { position: [x, base / 2, 0] }, 0);
  b.box(k.m('leaf'), [w, h, d], { position: [0, base + h / 2, 0] }, k.low ? 0 : 0.05);
  // Fan: a raised ring, a dark throat and spokes with a hub.
  const seg = k.low ? 8 : k.fine ? 20 : 12;
  b.lathe(k.m('marking'), [[0.2, 0], [0.235, 0], [0.235, 0.035], [0.2, 0.035], [0.2, 0]], { position: [0, top - 0.005, 0] }, seg);
  b.cylinder(k.m('steel'), 0.2, 0.2, 0.01, { position: [0, top + 0.005, 0] }, { segments: seg });
  if (!k.low) for (let i = 0; i < 4; i++) b.box(k.m('marking'), [0.4, 0.012, 0.022], { position: [0, top + 0.03, 0], rotation: [0, i * Math.PI / 4, 0] }, 0);
  b.cylinder(k.m('marking'), 0.045, 0.05, 0.04, { position: [0, top + 0.03, 0] }, { segments: k.low ? 6 : 10 });
  // Service plate and pipe.
  b.box(k.m('marking'), [0.2, 0.14, 0.012], { position: [0.14, base + 0.25, d / 2 + 0.006] }, 0);
  if (k.low) return;
  b.cylinder(k.m('steel'), 0.022, 0.022, 0.3, { position: [-0.18, base + 0.15, -d / 2 - 0.04] }, { segments: 8 });
  b.cylinder(k.m('steel'), 0.022, 0.022, 0.06, { position: [-0.18, base + 0.3, -d / 2 - 0.02], rotation: [Math.PI / 2, 0, 0] }, { segments: 8 });
}
