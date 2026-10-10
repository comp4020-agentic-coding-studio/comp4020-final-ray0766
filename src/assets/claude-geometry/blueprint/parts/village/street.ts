import * as T from 'three';
import { extrudeZY, SLAB, WALL_H } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { TOP_BAND } from './walls.ts';

// Village structure and street parts, on the industrial frames and inside the
// industrial parts' reach: corner post, bamboo railing, stone footway, lane
// with its side gutter, stone kerb, water channel (in the pipe rack's place
// and size), lantern post and the stone landing pad. Ground surfaces are a
// few large stones with open joints over a dark bed, since a street is many
// cells; their tops are the walking surface, y 0, and they meet the next
// cell's flush.

/** Height of a corner post's footing stone. */
export const POST_FOOT = 0.15;

/**
 * Timber post on a footing stone, inside the industrial column's 0.22 m
 * square: a 0.2 m shaft, so inside a room it stands only 10 mm proud of the
 * plaster; a low stone foot 10 mm wider all round (no wider: a sliding
 * door's innermost leaf runs 0.112 m from the vertex, village/walls.ts); and,
 * above low, a band round its top where the walls' beam turns the corner,
 * the band a porch beam ends against (home/frame.ts VILLAGE_SHAFT).
 */
export function cornerColumn(k: Kit) {
  const { b } = k;
  b.box(k.m('post'), [0.2, WALL_H - POST_FOOT, 0.2], { position: [0, POST_FOOT + (WALL_H - POST_FOOT) / 2, 0] }, 0);
  b.box(k.m('concrete'), [0.22, POST_FOOT, 0.22], { position: [0, POST_FOOT / 2, 0] }, 0);
  if (!k.low) b.box(k.m('post'), [0.22, TOP_BAND - 0.02, 0.22], { position: [0, WALL_H - TOP_BAND / 2 - 0.01, 0] }, 0);
}

/**
 * Bamboo railing in the guard railing's place: a timber post at the middle
 * under a timber cap rail at the railing's 1.07 m top, and below the cap a
 * four-eyed bamboo grid: two bamboo rails (one at low) on the
 * outer side of four bamboo uprights on a 0.25 m module (two at low), so a
 * run of railings reads as one fence with its posts a metre apart. All
 * inside the railing's depth, and no deeper into the cell than the picket
 * fence it replaces (a stair's handrails pass 0.16 m inside a stairwell's
 * edge).
 */
export function guardRail(k: Kit) {
  const { b } = k;
  const timber = k.m('post'), bamboo = k.m('tread'), top = 1.07, cap = 0.05, z = -0.06, cane = 0.025;
  b.box(timber, [0.07, top - cap, 0.07], { position: [0, (top - cap) / 2, z] }, 0);
  b.box(timber, [1.0, cap, 0.07], { position: [0, top - cap / 2, z] }, 0);
  // Rails just inside the post's outer face (so they pass through it unseen), uprights behind them.
  for (const y of k.low ? [0.55] : [0.32, 0.7]) b.box(bamboo, [1.0, cane, cane], { position: [0, y, z + 0.035 - 0.0025 - cane / 2] }, 0);
  for (const x of k.low ? [-0.25, 0.25] : [-0.375, -0.125, 0.125, 0.375]) {
    b.box(bamboo, [cane, top - cap, cane], { position: [x, (top - cap) / 2, z + 0.035 - 0.0025 - 1.5 * cane] }, 0);
  }
}

/**
 * Joints between the street's stones: 12 mm (at 8 mm the ink across a pad's
 * ring broke up on a phone), so each draws in ink; a stone ending on a
 * jointed cell edge stops half a joint short of it.
 */
export const STONE_JOINT = 0.012;
/**
 * How deep a joint or the gutter's slit is: a dark bed (`jointBed`) closes
 * every one at this depth, so a joint reads dark even where the pen breaks
 * its line. Open to below, a joint showed whatever lies under the street: in
 * the village sample and the workshop that is their ground at y −0.02, a
 * green sliver in every joint. The bed stays above that ground.
 */
export const JOINT_BED = 0.012;

/**
 * `source` without the faces that look straight down: a stone's underside,
 * which `underside` draws for the whole cell in one sheet. That pays for the
 * bed without a dearer model than the industrial one.
 */
function openBelow(source: T.BufferGeometry): T.BufferGeometry {
  const flat = source.index ? source.toNonIndexed() : source, p = flat.getAttribute('position'), keep: number[] = [];
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (n.y > -0.99) keep.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  if (flat !== source) flat.dispose();
  source.dispose();
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(keep, 3));
}

/** A stone slab under the walking surface (y −SLAB … 0) on a footprint of [x, z] corners, open below. */
export function slab(k: Kit, material: T.Material, footprint: [number, number][]) {
  // Shape y maps to −Z after the −90° turn about X; the extrusion rises from the slab's underside.
  const shape = new T.Shape(footprint.map(([x, z]) => new T.Vector2(x, -z)));
  k.b.geometry(material, openBelow(new T.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false }).rotateX(-Math.PI / 2)), { position: [0, -SLAB, 0] });
}

/** A box slab from x0 to x1 and z0 to z1, its top the walking surface, open below. */
export function block(k: Kit, material: T.Material, x0: number, x1: number, z0: number, z1: number) {
  k.b.geometry(material, openBelow(new T.BoxGeometry(x1 - x0, SLAB, z1 - z0)), { position: [(x0 + x1) / 2, -SLAB / 2, (z0 + z1) / 2] });
}

/** A street cell's underside in one sheet at the slab's bottom, facing down, under stones drawn open below. */
export function underside(k: Kit, material: T.Material) {
  k.b.geometry(material, new T.PlaneGeometry(1, 1), { position: [0, -SLAB, 0], rotation: [Math.PI / 2, 0, 0] });
}

/** The dark bed under a street cell's joints and slits, one sheet over the cell at −JOINT_BED (inside the stones elsewhere). */
export function jointBed(k: Kit) {
  k.b.geometry(k.m('steel'), new T.PlaneGeometry(1, 1), { position: [0, -JOINT_BED, 0], rotation: [-Math.PI / 2, 0, 0] });
}

/**
 * Where the footway's second course is jointed: its stones are flush with
 * the cell's ±X edges and run on into the next cell's, so along a run they
 * are a metre long and break joint 0.4 m from the first course's.
 */
export const PAVING_STAGGER = 0.1;

/**
 * Stone footway: two courses of large stones along x, the first one
 * stone between joints on the cell's edges, the second jointed at
 * `PAVING_STAGGER` and flush at the edges, so a run reads as metre-long
 * stones breaking joint. At low the courses are two stones between joints.
 */
export function streetPaving(k: Kit) {
  const stone = k.m('pavers'), j = STONE_JOINT / 2, s = PAVING_STAGGER;
  underside(k, stone);
  jointBed(k);
  block(k, stone, -0.5 + j, 0.5 - j, -0.5 + j, -j);
  if (k.low) { block(k, stone, -0.5 + j, 0.5 - j, j, 0.5 - j); return; }
  block(k, stone, -0.5, s - j, j, 0.5 - j);
  block(k, stone, s + j, 0.5, j, 0.5 - j);
}

/**
 * The lane's side gutter: stone lids along the cell's −Z edge, flush
 * with the walking surface, a slit between them and the lane where the
 * water runs in, and a joint between the lids at every cell edge.
 */
export const GUTTER = { width: 0.25, slit: 0.015 } as const;

/**
 * Lane: one packed surface, the gutter along its −Z edge and the industrial
 * road's half dash on the +Z edge, so two rows facing make a two-lane lane
 * with a dashed centre line and a gutter on each side. The dash is a paint
 * film 3 mm up, as the lane corner's are (home/joins.ts roadCornerVillage).
 */
export function streetRoad(k: Kit) {
  const { width, slit } = GUTTER, j = STONE_JOINT / 2;
  underside(k, k.m('asphalt'));
  jointBed(k);
  block(k, k.m('asphalt'), -0.5, 0.5, -0.5 + width, 0.5);
  block(k, k.m('concrete'), -0.5 + j, 0.5 - j, -0.5, -0.5 + width - slit);
  k.b.geometry(k.m('marking'), new T.PlaneGeometry(0.5, 0.05), { position: [0, 0.003, 0.475], rotation: [-Math.PI / 2, 0, 0] });
}

/**
 * Stone kerb: one edging stone along the edge with both top edges eased, in
 * the industrial kerb's profile envelope, jointed only at the vertices (the
 * lane's gutter takes the water, so there is no drain).
 */
export function streetKerb(k: Kit) {
  extrudeZY(k, k.m('concrete'), [[-0.075, -0.05], [0.075, -0.05], [0.075, 0.115], [0.05, 0.14], [-0.05, 0.14], [-0.075, 0.115]], -0.4975, 0.4975);
}

/** The water channel's trough: its sides (z), its bottom and rim, its boards and the water's surface (y). */
export const CHANNEL = { z0: 0.035, z1: 0.285, bottom: 0.33, top: 0.46, board: 0.024, water: 0.425 } as const;

/**
 * Water channel, standing where the pipe rack stands (+Z side of the
 * edge, up to 0.33 m out) and under its height: an open trough of three
 * boards on two timber stands at the rack's stands, water a little under its
 * rim. The trough's ends are open, so a run of channels is one channel.
 */
export function streetPipes(k: Kit) {
  const { b } = k, { z0, z1, bottom, top, board, water } = CHANNEL, zc = (z0 + z1) / 2, w = z1 - z0;
  const wood = k.m('tread'), timber = k.m('post');
  b.box(wood, [1.0, board, w], { position: [0, bottom + board / 2, zc] }, 0);
  for (const z of [z0 + board / 2, z1 - board / 2]) b.box(wood, [1.0, top - bottom - board, board], { position: [0, (top + bottom + board) / 2, z] }, 0);
  // The water stands 1 mm off the side boards' faces, so no two faces share a plane.
  b.box(k.m('leaf'), [1.0, water - bottom - board, w - 2 * board - 0.002], { position: [0, (water + bottom + board) / 2, zc] }, 0);
  for (const x of [-0.3, 0.3]) {
    b.box(timber, [0.06, bottom - 0.04, 0.06], { position: [x, (bottom - 0.04) / 2, zc] }, 0);
    b.box(timber, [0.07, 0.04, w + 0.03], { position: [x, bottom - 0.02, zc] }, 0);
  }
}

/** The lantern post's paper lantern: its centre under the arm's end, the light point in its upper half. */
export const LANTERN = { x: -0.3, z: 0.36, bottom: 3.15, top: 3.35, radius: 0.08 } as const;

/**
 * Lantern post on a footway cell, at the street light's spot: a square
 * timber post on a footing stone, a timber arm towards +Z at the industrial
 * column's 3.42 m top with a straight brace under it (not at low), and a
 * paper lantern hanging under the arm's end round the street light's light
 * point: a glowing drum between two dark rims (a glowing box under a dark
 * cap at low).
 */
export function serviceLight(k: Kit) {
  const { b } = k;
  const px = -0.3, pz = -0.3, top = 3.42, foot = 0.12, arm = 0.07, timber = k.m('post');
  const { x: hx, z: hz, bottom, top: hang, radius } = LANTERN;
  b.box(k.m('concrete'), [0.22, foot, 0.22], { position: [px, foot / 2, pz] }, 0);
  b.box(timber, [0.11, top - foot, 0.11], { position: [px, foot + (top - foot) / 2, pz] }, 0);
  const a0 = pz - 0.08, a1 = hz + 0.08;
  b.box(timber, [arm, arm, a1 - a0], { position: [px, top - arm / 2, (a0 + a1) / 2] }, 0);
  // The brace at 45°, long enough that both its square ends sit inside the post and the arm.
  if (!k.low) b.box(timber, [0.05, 0.05, 0.56], { position: [px, top - arm - 0.175, pz + 0.055 + 0.175], rotation: [-Math.PI / 4, 0, 0] }, 0);
  const rim = 0.025, drum = hang - bottom - 2 * rim;
  if (k.low) {
    b.box(k.m('lamp'), [0.13, drum + rim, 0.13], { position: [hx, bottom + (drum + rim) / 2, hz] }, 0);
    b.box(timber, [0.15, rim, 0.15], { position: [hx, hang - rim / 2, hz] }, 0);
  } else {
    const segments = k.fine ? 10 : 8;
    b.cylinder(k.m('lamp'), radius, radius, drum, { position: [hx, bottom + rim + drum / 2, hz] }, { segments });
    for (const y of [bottom + rim / 2, hang - rim / 2]) b.cylinder(timber, radius - 0.012, radius - 0.012, rim, { position: [hx, y, hz] }, { segments });
  }
  // The industrial street light's light point (its head's diffuser), in the drum's upper half.
  b.emitter('street', [hx, 3.31, hz], [0, -1, 0]);
}

/** The stone pad's touchdown ring, between its joints (radii from the pad's centre). */
export const PAD_RING = [0.62, 0.74] as const;

/**
 * Quarter of the 2×2 landing pad in stone, round the pad's centre at the
 * cell's (−X, −Z) corner: a quarter of the round centre stone, of the pale
 * touchdown ring and of the edge stones round it, those split on the
 * diagonal to the pad's corner, and the three edge lights let into them
 * where the industrial quarter has them. On its inner edges a quarter is
 * flush with its siblings, so four make one centre stone, one ring and four
 * edge stones jointed to the pad's corners; on the pad's outer edges it is
 * jointed. The stone's top is the walking surface.
 */
export function padQuarter(k: Kit) {
  const { b } = k, stone = k.m('concrete'), j = STONE_JOINT / 2, c = -0.5;
  const steps = k.low ? 4 : k.fine ? 12 : 8, [r0, r1] = PAD_RING;
  underside(k, stone);
  jointBed(k);
  const arc = (r: number, a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as [number, number];
  });
  slab(k, stone, [[c, c], ...arc(r0 - j, 0, Math.PI / 2, steps)]);
  slab(k, k.m('marking'), [...arc(r1 - j, 0, Math.PI / 2, steps), ...arc(r0 + j, Math.PI / 2, 0, steps)]);
  // Edge stones: outside the ring to the pad's outer joints, on either side of the diagonal joint.
  const R = r1 + j, d = j / Math.SQRT2, u = Math.sqrt((R * R - 2 * d * d) / 2), edge = 0.5 - j;
  // Their arc keeps to the ring's own angles, so the joint between them keeps its width between the chords.
  const lip = Math.atan2(u - d, u + d), step = Math.PI / 2 / steps;
  const piece = [[c + R * Math.cos(lip), c + R * Math.sin(lip)] as [number, number], ...arc(R, 0, step * (steps / 2 - 1), steps / 2 - 1).reverse()];
  // The joint's side: x − z = 2d off the diagonal, from the pad's outer edge to the ring's outer joint.
  const a: [number, number][] = [[edge, c], [edge, edge - 2 * d], ...piece];
  slab(k, stone, a);
  slab(k, stone, a.map(([x, z]) => [z, x] as [number, number]).reverse());
  const segments = k.low ? 6 : k.fine ? 10 : 8;
  for (const [x, z] of [[0.43, 0.43], [0.43, -0.25], [-0.25, 0.43]]) {
    b.cylinder(k.m('steel'), 0.045, 0.05, 0.012, { position: [x, 0.002, z] }, { segments });
    b.cylinder(k.m('lamp'), 0.03, 0.03, 0.006, { position: [x, 0.008, z] }, { segments });
    b.emitter('pad', [x, 0.011, z], [0, 1, 0]);
  }
}
