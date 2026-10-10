import * as T from 'three';
import type { Kit } from '../kit.ts';

// Raised flower bed: a cell part standing in the middle of its cell on a deck
// (paving or a terrace), within 0.38 m of the centre like the rooftop unit, so
// it clears any wall, kerb or post on its cell's edges. Decor only.
//
// Two courses of eased stone blocks, bonded at the corners, under a coping
// with a rounded nose that overhangs them; dark soil ('post', the kit has no
// soil slot), leaf mounds spilling over the coping, blooms in coral ('hazard')
// and cream ('marking'): the industrial look's precast planter with rubber
// planting. The village look has its own twin at the end of this file: four
// big stones laid round the bed in a pinwheel, three round shrubs, a few blooms.

type P2 = [number, number];
type P3 = [number, number, number];

/** Wall face, course height, wall thickness; coping from WALL_TOP to EDGE_TOP, reaching ±COPE_OUT. */
const WALL = 0.36, COURSE = 0.15, THICK = 0.085, WALL_TOP = 2 * COURSE, EDGE_TOP = 0.4, COPE_OUT = 0.38, COPE_IN = WALL - THICK - 0.012;
const SOIL_TOP = EDGE_TOP - 0.035;

/**
 * Joints along each wall, as fractions of its run, per course: the long runs
 * (corner to corner) and the short runs (between the long runs' ends) swap
 * sides from course to course, so the corners are bonded like masonry.
 */
const LONG_JOINTS = [[0.36, 0.7], [0.3, 0.66], [0.33, 0.69], [0.38, 0.72]];
const SHORT_JOINTS = [[0.52], [0.46], [0.55], [0.48]];

/** A plan square ring from a profile of [distance from the centre to the face, y]: a four-sided lathe, its corners mitred, its faces flat. */
function squareRing(k: Kit, material: T.Material, profile: P2[]) {
  const g = new T.LatheGeometry(profile.map(([d, y]) => new T.Vector2(d * Math.SQRT2, y)), 4, Math.PI / 4);
  // The lathe's normals are smoothed round its corners; flat ones come back from the positions.
  g.deleteAttribute('normal');
  k.b.geometry(material, g);
}

/** Coping section, [distance from the centre, y]: flat soffit, rounded outer nose, flat top, eased inner edge. */
function copingProfile(k: Kit): P2[] {
  const r = 0.045, steps = k.fine ? 3 : k.low ? 1 : 2, nose: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    nose.push([COPE_OUT - r + r * Math.cos(a), EDGE_TOP - r + r * Math.sin(a)]);
  }
  return [[COPE_IN, WALL_TOP], [COPE_OUT, WALL_TOP], ...nose, [COPE_IN + 0.015, EDGE_TOP], [COPE_IN, EDGE_TOP - 0.015], [COPE_IN, WALL_TOP]];
}

/** Leaf mounds: centre, radius, scale. The tallest stands off-centre, so the bed reads as planted, not as a pattern. */
const MOUNDS: [P3, number, P3][] = [
  [[-0.02, 0.43, -0.05], 0.19, [1.1, 0.95, 1.05]],
  [[-0.17, 0.39, 0.16], 0.13, [1.2, 0.85, 1.15]],
  [[0.17, 0.38, 0.2], 0.115, [1.25, 0.85, 1.15]],
  [[-0.22, 0.38, -0.2], 0.1, [1.2, 0.85, 1.2]],
  [[0.22, 0.4, -0.12], 0.12, [1.0, 0.95, 1.15]],
];
/** Blooms in small clusters on the mounds: [mound, azimuth, elevation (radians), colour]. */
const BLOOMS: [number, number, number, 'coral' | 'cream'][] = [
  [0, 0.3, 1.2, 'coral'], [0, 1.5, 0.95, 'coral'], [0, 2.6, 1.15, 'coral'], [0, 3.9, 0.9, 'coral'], [0, 5.2, 1.05, 'coral'],
  [1, 0.9, 0.95, 'cream'], [1, 2.2, 0.8, 'cream'], [1, 4.4, 1.1, 'cream'],
  [2, 0.4, 0.85, 'coral'], [2, 1.9, 1.0, 'coral'], [2, 4.9, 1.15, 'coral'],
  [3, 3.4, 0.9, 'cream'], [3, 1.2, 1.2, 'cream'],
  [4, 5.7, 0.95, 'cream'], [4, 0.6, 1.1, 'cream'], [4, 3.6, 0.85, 'cream'],
];

/**
 * One stone block centred at `c`, `size` along the wall, up and through it; at high its face is eased all
 * round (an extrusion through the wall with a 45° bevel: 28 triangles where a chamfered box takes 44).
 */
function block(k: Kit, material: T.Material, size: P3, c: P3, alongX: boolean, ease: number) {
  const [len, h, depth] = size;
  if (ease <= 0) { k.b.box(material, alongX ? [len, h, depth] : [depth, h, len], { position: c }, 0); return; }
  const a = len / 2 - ease, v = h / 2 - ease, run = depth / 2 - ease;
  const outline: P2[] = [[-a, -v], [a, -v], [a, v], [-a, v]];
  const position: P3 = alongX ? [c[0], c[1], c[2] - run] : [c[0] - run, c[1], c[2]];
  k.b.extrude(material, outline, depth - 2 * ease, { position, rotation: [0, alongX ? 0 : Math.PI / 2, 0] }, ease);
}

/** Raised flower bed in the middle of its cell (cell part): 0.76 m square, its edge 0.40 m high, plants up to 0.64 m. */
export function flowerBed(k: Kit) {
  const { b } = k, stone = k.m('concrete');
  if (k.low) b.box(stone, [2 * WALL, WALL_TOP, 2 * WALL], { position: [0, WALL_TOP / 2, 0] }, 0);
  else {
    // Blocks: a 6 mm joint all round each, eased at high.
    const gap = 0.006, ease = k.fine ? 0.012 : 0;
    for (let c = 0; c < 2; c++) for (let side = 0; side < 4; side++) {
      // Sides 0/2 face −Z/+Z, 1/3 face −X/+X; course 0 runs 0/2 corner to corner, course 1 runs 1/3.
      const long = side % 2 === c, joints = long ? LONG_JOINTS[(side + c) % 4] : SHORT_JOINTS[(side + 2 * c) % 4];
      const run = long ? 2 * WALL : 2 * (WALL - THICK), cuts = [0, ...joints, 1];
      const alongX = side % 2 === 0, face = (side < 2 ? -1 : 1) * (WALL - THICK / 2), y = c * COURSE + COURSE / 2;
      for (let j = 0; j + 1 < cuts.length; j++) {
        const u0 = -run / 2 + cuts[j] * run, u1 = -run / 2 + cuts[j + 1] * run, u = (u0 + u1) / 2;
        block(k, stone, [u1 - u0 - gap, COURSE - gap, THICK], alongX ? [u, y, face] : [face, y, u], alongX, ease);
      }
    }
    // Fill behind the blocks: the joints end on it instead of opening into the bed.
    b.box(stone, [2 * (WALL - THICK) + 0.02, WALL_TOP, 2 * (WALL - THICK) + 0.02], { position: [0, WALL_TOP / 2, 0] }, 0);
  }
  squareRing(k, stone, copingProfile(k));
  b.box(k.m('post'), [2 * COPE_IN, SOIL_TOP - WALL_TOP, 2 * COPE_IN], { position: [0, (WALL_TOP + SOIL_TOP) / 2, 0] }, 0);
  // Planting: smooth mounds at high, faceted below (as the hedge's crowns); fewer mounds and only cream
  // blooms at low, where the village look folds blossom into the teal paint.
  const leaf = k.m('membrane'), coral = k.m('hazard'), cream = k.m('marking');
  const mounds = k.low ? MOUNDS.slice(0, 3) : MOUNDS;
  for (const [c, r, s] of mounds) b.geometry(leaf, new T.IcosahedronGeometry(r, k.fine ? 1 : 0), { position: c, scale: s });
  const blooms = k.low ? BLOOMS.filter(([m, , , col]) => col === 'cream' && m < 3) : k.fine ? BLOOMS : BLOOMS.filter((_, i) => i % 3 !== 2);
  for (const [m, az, el, col] of blooms) {
    const [[cx, cy, cz], r, [sx, sy, sz]] = MOUNDS[m];
    const ce = Math.cos(el), p: P3 = [cx + sx * r * ce * Math.cos(az), cy + sy * r * Math.sin(el), cz + sz * r * ce * Math.sin(az)];
    b.geometry(col === 'coral' ? coral : cream, new T.IcosahedronGeometry(0.03, 0), { position: p, scale: [1, 0.8, 1] });
  }
}

// ------------------------------------------------------------------ village twin

/**
 * The village planting bed: four stones round the bed, `half` from its
 * middle and `thick` deep, each running from its corner to `joint` short of
 * the next stone's face (a pinwheel, so every corner is one stone and every
 * joint opens onto the soil); their tops vary a little, as stones do; the soil
 * stands below them.
 */
export const STONE_BED = { half: 0.38, thick: 0.12, joint: 0.012, heights: [0.3, 0.28, 0.31, 0.29], soil: 0.25 } as const;
/** Round shrubs (azalea-like): centre, radius, scale. */
const SHRUBS: [P3, number, P3][] = [
  [[-0.07, 0.32, -0.05], 0.21, [1.1, 0.9, 1.0]],
  [[0.17, 0.27, 0.16], 0.13, [1.1, 0.85, 1.1]],
  [[0.17, 0.27, -0.17], 0.12, [1.1, 0.8, 1.15]],
];
/** Blooms on the shrubs: [shrub, azimuth, elevation (radians), colour]; the first two are the ones drawn at low. */
const FLOWERS: [number, number, number, 'coral' | 'cream'][] = [
  [0, 4.3, 1.15, 'cream'], [1, 1.2, 1.0, 'cream'], [0, 0.6, 1.05, 'coral'], [2, 5.0, 0.95, 'coral'], [0, 2.4, 0.85, 'coral'],
];

/** Village planting bed in the middle of its cell: 0.76 m square, stones 0.28–0.31 m high, shrubs to 0.51 m. */
export function flowerBedVillage(k: Kit) {
  const { b } = k, stone = k.m('concrete');
  const { half, thick, joint, heights, soil } = STONE_BED;
  const run = 2 * half - thick - joint;
  heights.forEach((h, i) => b.within({ rotation: [0, -i * Math.PI / 2, 0] }, () => {
    b.box(stone, [run, h, thick], { position: [-half + run / 2, h / 2, -half + thick / 2] }, 0);
  }));
  // Soil: up to the stones' inner faces, so the joints open onto it (not into them: their bottoms would share y 0).
  const fill = half - thick;
  b.box(k.m('post'), [2 * fill, soil, 2 * fill], { position: [0, soil / 2, 0] }, 0);
  for (const [c, r, s] of SHRUBS) b.geometry(k.m('membrane'), new T.IcosahedronGeometry(r, k.fine ? 1 : 0), { position: c, scale: s });
  const flowers = k.low ? FLOWERS.slice(0, 2) : k.fine ? FLOWERS : FLOWERS.slice(0, 4);
  for (const [m, az, el, col] of flowers) {
    const [[cx, cy, cz], r, [sx, sy, sz]] = SHRUBS[m];
    const ce = Math.cos(el), p: P3 = [cx + sx * r * ce * Math.cos(az), cy + sy * r * Math.sin(el), cz + sz * r * ce * Math.sin(az)];
    b.geometry(k.m(col === 'coral' ? 'hazard' : 'marking'), new T.IcosahedronGeometry(0.035, 0), { position: p, scale: [1, 0.8, 1] });
  }
}
