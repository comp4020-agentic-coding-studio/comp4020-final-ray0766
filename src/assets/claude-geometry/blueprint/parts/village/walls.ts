import * as T from 'three';
import { DOOR_LEAF } from '../walls.ts';
import { WALL_H, WALL_T } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Village walls: plaster cottage walls on the industrial walls' frame (origin
// on the cell edge at the top of the slab, x along the edge, +Z exterior) and
// within their envelope: −0.5..0.5 along the edge, the same storey height, the
// same door opening and leaf. Every wall shares one grammar, after b98e0ce's
// cottages: a stone base course, plaster, a timber top band, and timber posts
// at both ends, which double as corner boards and, where two walls meet in
// line, as one post of a timber frame. Details stand proud of the plaster so
// the ink outline finds them; nothing is carried by texture.
//
// Inside, details stand at most 30 mm off the wall face, as the industrial
// walls' do (a wall on a stair side, inside to the stair, must clear it).

export const BASE_COURSE = 0.3;
export const TOP_BAND = 0.12;
const FACE = WALL_T / 2;

/** Exterior plaster and interior plaster over x0..x1, y0..y1, through the wall's full thickness. */
export function plaster(k: Kit, x0: number, x1: number, y0: number, y1: number) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  k.b.box(k.m('skin'), [w, h, FACE], { position: [cx, cy, FACE / 2] }, 0);
  k.b.box(k.m('skinInner'), [w, h, FACE], { position: [cx, cy, -FACE / 2] }, 0);
}

/** Base course, top band and end posts on the exterior face; `posts: false` where door casings take their place. */
export function dress(k: Kit, opts: { base?: boolean; posts?: boolean } = {}) {
  const { b } = k;
  if (opts.base !== false) b.box(k.m('concrete'), [1.0, BASE_COURSE, 0.02], { position: [0, BASE_COURSE / 2, FACE + 0.01] }, 0);
  b.box(k.m('post'), [1.0, TOP_BAND, 0.015], { position: [0, WALL_H - TOP_BAND / 2, FACE + 0.0075] }, 0);
  if (opts.posts === false) return;
  const h = WALL_H - TOP_BAND - BASE_COURSE;
  for (const x of [-0.475, 0.475]) b.box(k.m('post'), [0.05, h, 0.015], { position: [x, BASE_COURSE + h / 2, FACE + 0.0075] }, 0);
}

/** Height of the inside rail; the window board sits on the same line, so the rail runs round a room through its windows. */
export const RAIL_Y = 0.86;

/** Timber skirting inside, 15 mm off the face, and (`rail`) a rail at window-board height above it. */
export function skirting(k: Kit, x0: number, x1: number, rail = true) {
  k.b.box(k.m('post'), [x1 - x0, 0.1, 0.015], { position: [(x0 + x1) / 2, 0.05, -FACE - 0.0075] }, 0);
  if (rail && !k.low) k.b.box(k.m('post'), [x1 - x0, 0.04, 0.02], { position: [(x0 + x1) / 2, RAIL_Y - 0.02, -FACE - 0.01] }, 0);
}

export function solidWall(k: Kit) {
  plaster(k, -0.5, 0.5, 0, WALL_H);
  dress(k);
  skirting(k, -0.5, 0.5);
}

/** Opening of the window wall: narrower and taller than the industrial pane, a cottage window. */
export const WINDOW = { half: 0.25, sill: 0.86, head: 1.62 } as const;

/**
 * Window wall: a recessed sash with a cross bar in a cream surround, a stone
 * sill, teal shutters folded back against the wall and a flower box on
 * brackets under the sill.
 */
export function windowWall(k: Kit) {
  const { b } = k;
  const { half, sill, head } = WINDOW;
  plaster(k, -0.5, 0.5, 0, sill);
  plaster(k, -0.5, 0.5, head, WALL_H);
  plaster(k, -0.5, -half, sill, head);
  plaster(k, half, 0.5, sill, head);
  dress(k);
  const trim = k.m('marking'), h = head - sill, my = (sill + head) / 2;
  // Surround: head and jambs proud of the plaster, a stone sill that sheds water.
  b.box(trim, [2 * half + 0.12, 0.07, 0.03], { position: [0, head + 0.035, FACE + 0.015] }, 0);
  for (const s of [-1, 1]) b.box(trim, [0.06, h, 0.03], { position: [s * (half + 0.03), my, FACE + 0.015] }, 0);
  b.box(k.m('concrete'), [2 * half + 0.16, 0.05, 0.1], { position: [0, sill - 0.025, FACE + 0.02] }, 0);
  // Sash set back in the reveal: dark glass and a cross bar.
  b.box(k.m('glass'), [2 * half, h, 0.01], { position: [0, my, 0.02] }, 0);
  b.box(trim, [0.03, h, 0.03], { position: [0, my, 0.02] }, 0);
  b.box(trim, [2 * half, 0.03, 0.03], { position: [0, my + 0.04, 0.02] }, 0);
  // Shutters folded back between the surround and the end posts, with ledges.
  for (const s of [-1, 1]) {
    b.box(k.m('leaf'), [0.14, h, 0.025], { position: [s * 0.38, my, FACE + 0.0125] }, 0);
    if (!k.low) for (const y of [sill + 0.16, head - 0.16]) b.box(k.m('leaf'), [0.12, 0.05, 0.01], { position: [s * 0.38, y, FACE + 0.03] }, 0);
  }
  flowerBox(k, 2 * half + 0.06, sill - 0.05);
  // Inside: a timber window board on the rail line, the rail either side of it, and skirting.
  b.box(k.m('post'), [2 * half + 0.1, 0.025, 0.03], { position: [0, sill + 0.0125, -FACE - 0.015] }, 0);
  skirting(k, -0.5, 0.5, false);
  if (!k.low) for (const s of [-1, 1]) b.box(k.m('post'), [0.5 - half - 0.05, 0.04, 0.02], { position: [s * (0.5 + half + 0.05) / 2, RAIL_Y - 0.02, -FACE - 0.01] }, 0);
}

/** Planted box on two iron brackets, its top at `top`, standing off the exterior face. */
function flowerBox(k: Kit, w: number, top: number) {
  const { b } = k;
  const d = 0.13, h = 0.13, z = FACE + 0.01 + d / 2;
  b.box(k.m('post'), [w, h, d], { position: [0, top - h / 2, z] }, 0);
  if (!k.low) for (const s of [-1, 1]) b.box(k.m('post'), [0.025, 0.1, d - 0.02], { position: [s * (w / 2 - 0.08), top - h - 0.05, z - 0.01] }, 0);
  // Foliage spilling over the rim and a few flowers: low icosahedra, smooth-shaded.
  const detail = k.fine ? 1 : 0;
  for (const [x, r] of [[-0.17, 0.075], [0.0, 0.085], [0.17, 0.075]] as const) {
    b.geometry(k.m('membrane'), new T.IcosahedronGeometry(r, detail), { position: [x, top + 0.02, z], scale: [1.2, 0.8, 0.9] });
  }
  if (k.low) return;
  for (const [x, y, dz] of [[-0.2, 0.07, 0.03], [-0.06, 0.09, 0.05], [0.09, 0.08, 0.04], [0.21, 0.06, 0.02]] as const) {
    b.geometry(k.m('hazard'), new T.IcosahedronGeometry(0.03, 0), { position: [x, top + y, z + dz] });
  }
}

/** Door opening: as wide as the industrial door's and a little taller (1.9 m against 1.88 m). */
export const DOOR_OPENING = { half: 0.4, top: 1.9 } as const;

/** Everything of a door wall but the leaf: plaster, timber casings, threshold and the lantern over the door. */
function doorFrame(k: Kit) {
  const { b } = k;
  const { half, top } = DOOR_OPENING, lining = 0.02;
  plaster(k, -0.5, -half - lining, 0, WALL_H);
  plaster(k, half + lining, 0.5, 0, WALL_H);
  plaster(k, -half - lining, half + lining, top + lining, WALL_H);
  dress(k, { base: false, posts: false });
  const timber = k.m('post');
  // Reveal linings, then casings on both faces from the lining to the wall end.
  for (const s of [-1, 1]) b.box(timber, [lining, top + lining, WALL_T + 0.02], { position: [s * (half + lining / 2), (top + lining) / 2, 0] }, 0);
  b.box(timber, [2 * half + 2 * lining, lining, WALL_T + 0.02], { position: [0, top + lining / 2, 0] }, 0);
  const caseH = WALL_H - TOP_BAND, caseW = 0.5 - half;
  for (const s of [-1, 1]) {
    b.box(timber, [caseW, caseH, 0.015], { position: [s * (half + caseW / 2), caseH / 2, FACE + 0.0075] }, 0);
    b.box(timber, [caseW, caseH, 0.015], { position: [s * (half + caseW / 2), caseH / 2, -FACE - 0.0075] }, 0);
  }
  // Stone threshold, the industrial threshold's size.
  b.box(k.m('concrete'), [0.8, 0.025, WALL_T + 0.1], { position: [0, 0.0125, 0] }, 0);
  // Wall lantern over the door, flat against the top band and no prouder than the
  // industrial status lamp (z 0.152); its glass is round the same light point.
  const lz = FACE + 0.062, ly = 1.98, back = FACE + 0.015, depth = lz - back, cz = (back + lz) / 2;
  b.box(k.m('steel'), [0.075, 0.012, depth], { position: [0, 1.926, cz] }, 0);
  b.box(k.m('lamp'), [0.06, 0.07, depth - 0.006], { position: [0, 1.967, cz - 0.003] }, 0);
  b.box(k.m('steel'), [0.085, 0.014, depth], { position: [0, 2.009, cz] }, 0);
  b.box(k.m('steel'), [0.03, 0.02, depth - 0.01], { position: [0, 2.026, cz - 0.005] }, 0);
  b.emitter('door', [0, ly, lz], [0, -0.6, 0.8]);
}

/**
 * The leaf in its own frame (hinge edge on x = 0, the leaf along +x, exterior
 * face +Z), the industrial leaf's size: stiles and rails round a recessed
 * lower panel and a glazed light with a cross bar, iron strap hinges, a knob
 * on both faces and a letter plate.
 */
function doorLeaf(k: Kit) {
  const { b } = k;
  const paint = k.m('leaf'), iron = k.m('steel');
  const { width: w, height: h, thickness: t } = DOOR_LEAF;
  const x0 = 0.005, stile = 0.13, inner = w - 2 * stile;
  const cx = x0 + w / 2;
  for (const x of [x0 + stile / 2, x0 + w - stile / 2]) b.box(paint, [stile, h, t], { position: [x, h / 2, 0] }, 0);
  const rails: [number, number][] = [[0, 0.22], [1.06, 1.22], [h - 0.14, h]];
  for (const [y0, y1] of rails) b.box(paint, [inner, y1 - y0, t], { position: [cx, (y0 + y1) / 2, 0] }, 0);
  // Recessed lower panel, a raised field on it outside.
  b.box(paint, [inner, 1.06 - 0.22, t - 0.024], { position: [cx, 0.64, 0] }, 0);
  if (!k.low) b.box(paint, [inner - 0.12, 0.6, 0.01], { position: [cx, 0.64, (t - 0.024) / 2 + 0.005] }, 0);
  // Glazed light with a cross bar.
  const gy0 = 1.22, gy1 = h - 0.14, gy = (gy0 + gy1) / 2;
  b.box(k.m('glass'), [inner, gy1 - gy0, 0.01], { position: [cx, gy, 0] }, 0);
  b.box(paint, [0.03, gy1 - gy0, t - 0.01], { position: [cx, gy, 0] }, 0);
  b.box(paint, [inner, 0.03, t - 0.01], { position: [cx, gy, 0] }, 0);
  // Strap hinges outside, a letter plate on the middle rail, knobs both sides.
  for (const y of [0.32, 1.52]) b.box(iron, [0.32, 0.035, 0.006], { position: [x0 + 0.16, y, t / 2 + 0.003] }, 0);
  if (!k.low) b.box(iron, [0.2, 0.045, 0.006], { position: [cx, 1.14, t / 2 + 0.003] }, 0);
  for (const s of [1, -1]) b.cylinder(iron, 0.022, 0.016, 0.04, { position: [x0 + w - 0.09, 1.0, s * (t / 2 + 0.02)], rotation: [Math.PI / 2, 0, 0] }, { segments: k.low ? 6 : 8 });
}

export function doorWall(k: Kit) {
  doorFrame(k);
  k.b.within({ position: [DOOR_LEAF.hingeX, 0.025, 0.015] }, () => doorLeaf(k));
}

/** The same door held open 90° into the room, hinged as the industrial open door is. */
export function doorOpenWall(k: Kit) {
  doorFrame(k);
  k.b.within({ position: [DOOR_LEAF.hingeX, 0.025, -WALL_T / 2 + DOOR_LEAF.thickness / 2 - 0.01], rotation: [0, Math.PI / 2, 0] }, () => doorLeaf(k));
}

/** Opening of the louvre wall: a squarer vent than the window, at the industrial louvre's height. */
export const VENT = { half: 0.24, sill: 0.95, head: 1.55 } as const;

/**
 * Plaster wall with a timber louvred vent: a deep timber frame round fixed,
 * inclined teal boards over a dark backing, and a small pitched hood on two
 * brackets over it, the way barns and wash houses are aired. Outside detail
 * stays inside the industrial louvre's hood.
 */
export function louvreWall(k: Kit) {
  const { b } = k;
  const { half, sill, head } = VENT;
  plaster(k, -0.5, 0.5, 0, sill);
  plaster(k, -0.5, 0.5, head, WALL_H);
  plaster(k, -0.5, -half, sill, head);
  plaster(k, half, 0.5, sill, head);
  dress(k);
  const timber = k.m('post'), h = head - sill, my = (sill + head) / 2, fd = WALL_T + 0.03;
  // Frame through the wall, proud on both faces.
  for (const y of [sill + 0.025, head - 0.025]) b.box(timber, [2 * half + 0.1, 0.05, fd], { position: [0, y, 0] }, 0);
  for (const s of [-1, 1]) b.box(timber, [0.05, h, fd], { position: [s * (half + 0.025), my, 0] }, 0);
  // Dark backing, then the boards, drained outwards.
  b.box(k.m('steel'), [2 * half, h - 0.05, 0.01], { position: [0, my, -0.03] }, 0);
  const boards = k.low ? 4 : 6, span = h - 0.1;
  for (let i = 0; i < boards; i++) {
    const y = sill + 0.05 + span * (i + 0.5) / boards;
    b.box(k.m('leaf'), [2 * half, 0.012, 0.11], { position: [0, y, 0.015], rotation: [0.6, 0, 0] }, 0);
  }
  // Pitched hood: two boards meeting over the vent's centre, on two brackets.
  const hoodY = head + 0.07, run = half + 0.08, pitch = 0.32;
  if (!k.low) for (const s of [-1, 1]) b.box(k.m('post'), [0.03, 0.12, 0.1], { position: [s * (half + 0.02), head + 0.02, WALL_T / 2 + 0.05] }, 0);
  for (const s of [-1, 1]) {
    b.box(k.m('corrugated'), [run / Math.cos(pitch), 0.02, 0.15], { position: [s * run / 2, hoodY + Math.tan(pitch) * run / 2, WALL_T / 2 + 0.075], rotation: [0, 0, -s * pitch] }, 0);
  }
  // Skirting only: the frame already stands 15 mm into the room, as deep as the industrial louvre's.
  skirting(k, -0.5, 0.5, false);
}

/**
 * Shed wall: a stone upstand, then upright boards with battens over their
 * joints on two rails, the industrial shed wall's construction in timber.
 * Like it, there is no inner lining: inside you see the rails and the back
 * of the boards. Nothing stands further inside than the industrial girts.
 */
export function corrugatedWall(k: Kit) {
  const { b } = k;
  const upstand = 0.32, top = WALL_H - TOP_BAND, face = WALL_T / 2;
  b.box(k.m('concrete'), [1.0, upstand, WALL_T], { position: [0, upstand / 2, 0] }, 0);
  // Boards as one sheet set into the wall's outer half, battens on the 0.125 m module so runs line up.
  const sheetZ = face - 0.02;
  b.box(k.m('tread'), [1.0, top - upstand, 0.03], { position: [0, (upstand + top) / 2, sheetZ] }, 0);
  const battens = k.low ? 4 : 8;
  for (let i = 0; i < battens; i++) {
    const x = -0.5 + (i + 0.5) / battens;
    b.box(k.m('post'), [0.035, top - upstand, 0.015], { position: [x, (upstand + top) / 2, face + 0.0025] }, 0);
  }
  // Rails behind the boards (seen from inside) and the top band.
  for (const y of [0.86, 1.46]) b.box(k.m('post'), [1.0, 0.09, 0.05], { position: [0, y, sheetZ - 0.04] }, 0);
  b.box(k.m('post'), [1.0, TOP_BAND, WALL_T], { position: [0, WALL_H - TOP_BAND / 2, 0] }, 0);
  if (k.low) return;
  // A drip board over the upstand.
  b.box(k.m('post'), [1.0, 0.025, 0.05], { position: [0, upstand + 0.012, face + 0.01] }, 0);
}
