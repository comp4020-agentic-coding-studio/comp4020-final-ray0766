import * as T from 'three';
import { extrudeZY, SLAB, WALL_H } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { BASE_COURSE, TOP_BAND } from './walls.ts';

// Village structure and street parts, on the industrial frames and inside the
// industrial parts' reach: corner post, picket fence, cobbled footway, lane,
// stone kerb, low hedge (in the pipe rack's place and size), lantern post and
// the stone landing pad. Ground surfaces are drawn in few large pieces, since
// a street is many cells.

/**
 * Timber corner post on a stone foot, inside the industrial column's 0.22 m
 * square: 0.2 m, so inside a room it stands only 10 mm proud of the plaster,
 * and the foot just covers the corner of the walls' base courses.
 */
export function cornerColumn(k: Kit) {
  const { b } = k;
  b.box(k.m('post'), [0.2, WALL_H - BASE_COURSE, 0.2], { position: [0, BASE_COURSE + (WALL_H - BASE_COURSE) / 2, 0] }, 0);
  b.box(k.m('concrete'), [0.22, BASE_COURSE, 0.22], { position: [0, BASE_COURSE / 2, 0] }, 0);
  if (!k.low) b.box(k.m('post'), [0.22, TOP_BAND - 0.02, 0.22], { position: [0, WALL_H - TOP_BAND / 2 - 0.01, 0] }, 0);
}

/**
 * Cream picket fence in the guard railing's place: pointed pickets on a 0.125 m
 * module (so runs read as one fence), two rails behind them and a post at the
 * middle, all inside the railing's depth and up to its 1.07 m top.
 */
export function guardRail(k: Kit) {
  const { b } = k;
  const paint = k.m('marking'), top = 1.07, z = -0.06;
  for (const y of [0.28, 0.82]) b.box(paint, [1.0, 0.06, 0.025], { position: [0, y, z - 0.0225] }, 0);
  b.box(k.m('post'), [0.07, top - 0.08, 0.07], { position: [0, (top - 0.08) / 2, z - 0.01] }, 0);
  const n = k.low ? 4 : 8, pitch = 1.0 / n, w = k.low ? 0.12 : 0.06;
  for (let i = 0; i < n; i++) {
    const x = -0.5 + (i + 0.5) * pitch;
    if (Math.abs(x) < 0.05) continue;
    if (k.low) { b.box(paint, [w, top - 0.04, 0.02], { position: [x, (top - 0.04) / 2 + 0.04, z] }, 0); continue; }
    // Picket outline in x/y, extruded 20 mm through z.
    const outline: [number, number][] = [[x - w / 2, 0.04], [x + w / 2, 0.04], [x + w / 2, top - 0.05], [x, top], [x - w / 2, top - 0.05]];
    b.extrude(paint, outline, 0.02, { position: [0, 0, z - 0.01] });
  }
}

/** Footway: a cobble-coloured bed with flagstones in a running bond; joints show as ink lines and shadow. */
export function streetPaving(k: Kit) {
  const { b } = k;
  const stone = k.m('pavers');
  if (k.low) { b.box(stone, [1.0, SLAB, 1.0], { position: [0, -SLAB / 2, 0] }, 0); return; }
  b.box(stone, [1.0, SLAB - 0.05, 1.0], { position: [0, -SLAB / 2 - 0.025, 0] }, 0);
  const rows: [number, number][][] = k.fine
    ? [[[-0.5, 0], [0, 0.5]], [[-0.5, -0.17], [-0.17, 0.5]], [[-0.5, 0.17], [0.17, 0.5]]]
    : [[[-0.5, 0.5]], [[-0.5, 0.5]]];
  const depth = 1.0 / rows.length, joint = 0.008;
  rows.forEach((row, r) => {
    for (const [x0, x1] of row) {
      b.box(stone, [x1 - x0 - joint, 0.05, depth - joint], { position: [(x0 + x1) / 2, -0.025, -0.5 + (r + 0.5) * depth] }, 0);
    }
  });
}

/** Lane: one packed surface with the industrial road's dash on the +Z edge, so two rows facing make a dashed centre line. */
export function streetRoad(k: Kit) {
  k.b.box(k.m('asphalt'), [1.0, SLAB, 1.0], { position: [0, -SLAB / 2, 0] }, 0);
  k.b.box(k.m('marking'), [0.5, 0.003, 0.05], { position: [0, 0.0015, 0.475] }, 0);
}

/** Stone kerb: two 0.5 m units with eased top edges, the industrial kerb's profile envelope, and an iron drain on the road side. */
export function streetKerb(k: Kit) {
  const { b } = k;
  for (const x of [-0.25, 0.25]) {
    extrudeZY(k, k.m('concrete'), [[-0.075, -0.05], [0.075, -0.05], [0.075, 0.115], [0.05, 0.14], [-0.05, 0.14], [-0.075, 0.115]], x - 0.2475, x + 0.2475);
  }
  if (!k.low) b.box(k.m('steel'), [0.26, 0.012, 0.14], { position: [0.18, -0.002, 0.16] }, 0);
}

/**
 * Low hedge on a stone curb, standing where the pipe rack stands (+Z side of
 * the edge, up to 0.33 m out) and no taller: clipped body, rounded crowns and,
 * close up, a few flowers.
 */
export function streetPipes(k: Kit) {
  const { b } = k;
  const z = 0.16;
  b.box(k.m('concrete'), [1.0, 0.1, 0.34], { position: [0, 0.05, z] }, 0);
  b.box(k.m('membrane'), [0.98, 0.26, 0.28], { position: [0, 0.23, z] }, 0);
  const detail = k.fine ? 1 : 0;
  for (const [x, r] of [[-0.31, 0.12], [0.02, 0.13], [0.31, 0.12]] as const) {
    b.geometry(k.m('membrane'), new T.IcosahedronGeometry(r, detail), { position: [x, 0.36, z], scale: [1.4, 0.8, 1.05] });
  }
  if (!k.fine) return;
  for (const [x, y, dz] of [[-0.36, 0.43, 0.1], [-0.1, 0.4, 0.13], [0.15, 0.45, 0.08], [0.4, 0.41, 0.11]] as const) {
    b.geometry(k.m('hazard'), new T.IcosahedronGeometry(0.03, 0), { position: [x, y, z + dz] });
  }
}

/**
 * Lantern post on a footway cell: a cast iron column at the street light's
 * spot, an arm towards +Z and a lantern hanging where the street light's head
 * is, its glass round the same light point; a hanging planter and a street
 * sign on the column. 3.42 m to the arm, as the industrial column.
 */
export function serviceLight(k: Kit) {
  const { b } = k;
  const px = -0.3, pz = -0.3, top = 3.42, iron = k.m('steel');
  const seg = k.low ? 6 : k.fine ? 8 : 6;
  if (k.low) b.box(iron, [0.13, 0.32, 0.13], { position: [px, 0.16, pz] }, 0);
  else b.cylinder(iron, 0.05, 0.075, 0.32, { position: [px, 0.16, pz] }, { segments: seg });
  b.cylinder(iron, 0.03, 0.04, top - 0.32, { position: [px, 0.32 + (top - 0.32) / 2, pz] }, { segments: seg });
  // Arm and the lantern under its end.
  const hx = px, hz = pz + 0.66, hy = 3.31;
  b.box(iron, [0.035, 0.035, 0.72], { position: [px, top - 0.03, pz + 0.34] }, 0);
  if (!k.low) b.box(iron, [0.025, 0.025, 0.36], { position: [px, top - 0.17, pz + 0.16], rotation: [Math.PI / 4.2, 0, 0] }, 0);
  b.box(iron, [0.13, 0.015, 0.13], { position: [hx, 3.215, hz] }, 0);
  b.box(k.m('lamp'), [0.1, 0.12, 0.1], { position: [hx, 3.28, hz] }, 0);
  b.cylinder(iron, 0, 0.1, 0.06, { position: [hx, 3.37, hz], rotation: [0, Math.PI / 4, 0] }, { segments: 4 });
  b.emitter('street', [hx, hy, hz], [0, -1, 0]);
  if (!k.fine) return;
  // Hanging planter and a street sign along the arm, inside the street light's own box.
  b.geometry(k.m('membrane'), new T.IcosahedronGeometry(0.115, 0), { position: [px, 2.32, pz + 0.15], scale: [1, 0.75, 1] });
  b.geometry(k.m('hazard'), new T.IcosahedronGeometry(0.045, 0), { position: [px + 0.04, 2.39, pz + 0.2] });
  b.box(k.m('leaf'), [0.03, 0.16, 0.38], { position: [px, 2.75, pz + 0.26] }, 0);
}

/**
 * Quarter of the 2×2 landing pad in stone: a slab with the touchdown ring
 * quarter round the cell's (−X, −Z) corner, a coral edge band, and the three
 * recessed edge lights where the industrial quarter has them.
 */
export function padQuarter(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1.0, SLAB - 0.02, 1.0], { position: [0, -SLAB / 2 - 0.01, 0] }, 0);
  const steps = k.low ? 6 : k.fine ? 16 : 10;
  const arc = (r: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI / 2;
    return [-0.5 + r * Math.cos(t), -0.5 + r * Math.sin(t)] as [number, number];
  });
  const ring = (r0: number, r1: number) => {
    const outer = arc(r1), inner = arc(r0).reverse();
    b.extrude(k.m('marking'), [...outer, ...inner].map(([x, z]) => [x, -z] as [number, number]), 0.004, { position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0] });
  };
  ring(0.62, 0.74);
  b.box(k.m('hazard'), [1.0, 0.004, 0.06], { position: [0, 0.002, 0.44] }, 0);
  b.box(k.m('hazard'), [0.06, 0.004, 0.94], { position: [0.44, 0.002, -0.03] }, 0);
  for (const [x, z] of [[0.43, 0.43], [0.43, -0.25], [-0.25, 0.43]]) {
    b.cylinder(k.m('steel'), 0.045, 0.05, 0.012, { position: [x, 0.002, z] }, { segments: k.low ? 6 : 10 });
    b.cylinder(k.m('lamp'), 0.03, 0.03, 0.006, { position: [x, 0.008, z] }, { segments: k.low ? 6 : 10 });
    b.emitter('pad', [x, 0.011, z], [0, 1, 0]);
  }
}
