import { WALL_H, WALL_T } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Village walls: a Japanese town house's walls on the industrial walls'
// frame (origin on the cell edge at the top of the slab, x along the edge, +Z
// exterior) and within their envelope: −0.5..0.5 along the edge, the same
// storey height, the same door opening. Every wall shares one grammar: white
// plaster between timber, a beam along the top, a lower wall of dark boards,
// and timber posts at both ends, which double as corner boards and, where two
// walls meet in line, as one post of the frame. Details stand proud of the
// plaster so the lines drawn from depth (src/style/lines.ts) find them;
// nothing is carried by texture.
//
// Inside, details stand at most 30 mm off the wall face, as the industrial
// walls' do (a wall on a stair side, inside to the stair, must clear it).

/** The beam along the top of every wall, outside; fixtures on a plain wall stay under it (home/fixtures.ts BAND). */
export const TOP_BAND = 0.12;
/** Top of the dark board lower wall: the window sill line, so sills sit on it and the line runs along a street. */
export const KOSHI = 0.86;
const FACE = WALL_T / 2;
/** How far the timber stands off the plaster outside: posts, beam, the lower boards. */
const PROUD = 0.015;
/** How far timber at a wall's ends stands off the plaster where it meets a corner post's 0.2 m shaft: flush with it. */
const SHAFT_IN = 0.1 - FACE;

/** Exterior plaster and interior plaster over x0..x1, y0..y1, through the wall's full thickness. */
export function plaster(k: Kit, x0: number, x1: number, y0: number, y1: number) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  k.b.box(k.m('skin'), [w, h, FACE], { position: [cx, cy, FACE / 2] }, 0);
  k.b.box(k.m('skinInner'), [w, h, FACE], { position: [cx, cy, -FACE / 2] }, 0);
}

/**
 * The timber outside a plastered wall, after a Japanese town house: the beam
 * along the top, a lower wall of dark boards from the deck to KOSHI, and the
 * end posts between the two. Two walls in line make one 0.1 m post; a corner
 * post covers a corner. The lower wall is one flat dark band: the three thin
 * battens it had drew nothing on a wall seen face on and a hatch of short
 * broken strokes on one seen edge on.
 */
function timberOutside(k: Kit) {
  const { b } = k, timber = k.m('post'), z = FACE + PROUD / 2;
  b.box(timber, [1.0, TOP_BAND, PROUD], { position: [0, WALL_H - TOP_BAND / 2, z] }, 0);
  b.box(timber, [1.0, KOSHI, PROUD], { position: [0, KOSHI / 2, z] }, 0);
  const post = WALL_H - TOP_BAND - KOSHI;
  for (const x of [-0.475, 0.475]) b.box(timber, [0.05, post, PROUD], { position: [x, KOSHI + post / 2, z] }, 0);
}

/**
 * Inside: a skirting 15 mm off the plaster and, above low, the end posts
 * 10 mm off it, flush with a corner post's shaft, where a porch beam on the
 * next edge ends (home/frame.ts VILLAGE_SHAFT).
 */
function timberInside(k: Kit) {
  const { b } = k, timber = k.m('post');
  b.box(timber, [1.0, 0.1, PROUD], { position: [0, 0.05, -FACE - PROUD / 2] }, 0);
  if (k.low) return;
  for (const x of [-0.475, 0.475]) b.box(timber, [0.05, WALL_H - 0.1, SHAFT_IN], { position: [x, 0.1 + (WALL_H - 0.1) / 2, -FACE - SHAFT_IN / 2] }, 0);
}

/**
 * Plain wall: white plaster between the end posts and under the beam,
 * dark boards below; inside, plaster over a skirting. Both faces stay flat
 * where fixtures hang (between 1.55 and 1.92 m in the middle).
 */
export function solidWall(k: Kit) {
  plaster(k, -0.5, 0.5, 0, WALL_H);
  timberOutside(k);
  timberInside(k);
}

/** Opening of the window wall: 0.6 m wide, sitting on the lower wall's top. */
export const WINDOW = { half: 0.3, sill: KOSHI, head: 1.62 } as const;
/** How far the window's lattice box stands out of the plaster. */
const BAY = 0.13;
/**
 * The shoji's own bars on the paper's inside face: three columns and four
 * rows of panes (two and three at low), bars 15 mm wide and 10 mm deep, 1 mm
 * off the paper so no two materials share a plane, their ends 5 mm into the
 * reveal's plaster.
 */
export const KUMIKO = { bar: 0.015, deep: 0.01, off: 0.001, columns: 3, rows: 4 } as const;

/**
 * Lattice window: a timber box standing out of the wall, a sill board
 * and a head board joined by two corner posts with five square bars between
 * them, in front of a shoji panel in the reveal, which reads pale through the
 * bars outside and, inside, as paper on a grid of thin bars, over a window
 * board.
 */
export function windowWall(k: Kit) {
  const { b } = k;
  const { half, sill, head } = WINDOW;
  plaster(k, -0.5, 0.5, 0, sill);
  plaster(k, -0.5, 0.5, head, WALL_H);
  plaster(k, -0.5, -half, sill, head);
  plaster(k, half, 0.5, sill, head);
  timberOutside(k);
  const timber = k.m('post'), h = head - sill, my = (sill + head) / 2, outer = half + 0.04, front = FACE + BAY;
  b.box(timber, [2 * outer, 0.03, BAY], { position: [0, sill - 0.015, FACE + BAY / 2] }, 0);
  b.box(timber, [2 * outer, 0.035, BAY + 0.01], { position: [0, head + 0.0175, FACE + (BAY + 0.01) / 2] }, 0);
  const post = 0.035, bar = 0.022, bars = 5, span = 2 * (outer - post);
  for (const s of [-1, 1]) b.box(timber, [post, h, post], { position: [s * (outer - post / 2), my, front - post / 2] }, 0);
  for (let i = 1; i <= bars; i++) b.box(timber, [bar, h, bar], { position: [-span / 2 + span * i / (bars + 1), my, front - post / 2] }, 0);
  b.box(k.m('marking'), [2 * half, h, 0.012], { position: [0, my, -0.02] }, 0);
  // Inside, the shoji's bars on the paper, so from the room it reads as shoji and not as a blank panel.
  const { bar: kb, deep, off } = KUMIKO, columns = k.low ? 2 : KUMIKO.columns, rows = k.low ? 3 : KUMIKO.rows, kz = -0.02 - 0.012 / 2 - off - deep / 2;
  for (let i = 1; i < columns; i++) b.box(timber, [kb, h + 0.01, deep], { position: [-half + 2 * half * i / columns, my, kz] }, 0);
  for (let i = 1; i < rows; i++) b.box(timber, [2 * half + 0.01, kb, deep], { position: [0, sill + h * i / rows, kz] }, 0);
  // Inside: a window board on the sill line.
  b.box(timber, [2 * half + 0.08, 0.025, 0.03], { position: [0, sill + 0.0125, -FACE - 0.015] }, 0);
  timberInside(k);
}

/** Door opening: as wide as the industrial door's and a little taller (1.9 m against 1.88 m). */
export const DOOR_OPENING = { half: 0.4, top: 1.9 } as const;

/**
 * The sliding lattice leaves: six, three a side, each on its own
 * track outside the wall (`tracks`: the planes' centres, innermost first),
 * standing on the sill track (`foot`). The tracks lie between a corner post's
 * foot (0.11 m off the edge line) and the end of a stair's top rail (0.153 m),
 * so a door at a corner or on a stair's top exit clears both. Closed, each
 * side's leaves step out from the middle to the jamb, overlapping by `lap` and
 * lapping 20 mm onto the jamb; open, they stack in front of their own jamb, so
 * the doorway is 0.71 m clear and nothing reaches past the door's own edge.
 */
export const LEAVES = { width: 0.145, thickness: 0.01, lap: 0.0075, tracks: [0.117, 0.1295, 0.142], foot: 0.02 } as const;

/** Where leaf `i` (0 = innermost, by the middle when closed) of side `s` (−1, 1) stands along the edge. */
export function leafX(s: number, i: number, open: boolean): number {
  const { width: w, lap } = LEAVES;
  return s * (open ? 0.5 - w / 2 : i * (w - lap) + w / 2);
}

/** One leaf, centred on x = 0 in its track: a timber frame round a boards kick panel and shoji paper behind one bar. */
function leaf(k: Kit) {
  const { b } = k, timber = k.m('post');
  const { width: w, thickness: t, foot } = LEAVES;
  const y1 = DOOR_OPENING.top, h = y1 - foot, kick = 0.5, rail = 0.04, p0 = kick + rail, p1 = y1 - rail;
  if (k.low) {
    b.box(timber, [w, h, t], { position: [0, foot + h / 2, 0] }, 0);
    b.box(k.m('marking'), [w - 0.044, p1 - p0, 0.002], { position: [0, (p0 + p1) / 2, t / 2 + 0.001] }, 0);
    return;
  }
  const stile = 0.022, inner = w - 2 * stile;
  for (const s of [-1, 1]) b.box(timber, [stile, h, t], { position: [s * (w - stile) / 2, foot + h / 2, 0] }, 0);
  for (const y of [kick + rail / 2, y1 - rail / 2]) b.box(timber, [inner, rail, t], { position: [0, y, 0] }, 0);
  b.box(k.m('tread'), [inner, kick - foot, t * 0.6], { position: [0, (foot + kick) / 2, 0] }, 0);
  b.box(k.m('marking'), [inner, p1 - p0, 0.002], { position: [0, (p0 + p1) / 2, -t / 2 + 0.002] }, 0);
  b.box(timber, [0.014, p1 - p0, t * 0.6], { position: [0, (p0 + p1) / 2, t * 0.2] }, 0);
}

/**
 * Everything of a door wall but the leaves: a timber portal (jamb posts and
 * the head, through the wall and flush with a corner post's shaft on both
 * faces), the head rail and the sill track outside that the leaves run in, a stone threshold, and a box
 * lantern (andon) on the head round the status lamp's light point, no prouder
 * than the industrial lamp (z 0.152).
 */
function doorFrame(k: Kit, open: boolean) {
  const { b } = k, timber = k.m('post');
  const { half, top } = DOOR_OPENING, depth = WALL_T + 2 * SHAFT_IN, jamb = 0.5 - half;
  for (const s of [-1, 1]) b.box(timber, [jamb, WALL_H, depth], { position: [s * (half + jamb / 2), WALL_H / 2, 0] }, 0);
  b.box(timber, [2 * half, WALL_H - top, depth], { position: [0, (top + WALL_H) / 2, 0] }, 0);
  // The rails run as far as the leaves travel: to the jambs' middle when shut, to the door's ends when open.
  const run = open ? 1.0 : 2 * (half + 0.02), z0 = FACE + SHAFT_IN + 0.001, z1 = 0.151, zc = (z0 + z1) / 2;
  b.box(timber, [run, 0.04, z1 - z0], { position: [0, top + 0.02, zc] }, 0);
  b.box(timber, [run, LEAVES.foot, z1 - z0], { position: [0, LEAVES.foot / 2, zc] }, 0);
  b.box(k.m('concrete'), [2 * half, LEAVES.foot, depth], { position: [0, LEAVES.foot / 2, 0] }, 0);
  const ly = 1.98, lz = FACE + 0.062, back = FACE + SHAFT_IN, glow = lz - back - 0.004;
  for (const y of [top + 0.046, ly + 0.034]) b.box(timber, [0.09, 0.012, lz - back], { position: [0, y, (back + lz) / 2] }, 0);
  b.box(k.m('lamp'), [0.07, 0.056, glow], { position: [0, ly, back + glow / 2] }, 0);
  b.emitter('door', [0, ly, lz], [0, -0.6, 0.8]);
}

function leaves(k: Kit, open: boolean) {
  for (const s of [-1, 1]) for (let i = 0; i < LEAVES.tracks.length; i++) {
    k.b.within({ position: [leafX(s, i, open), 0, LEAVES.tracks[i]] }, () => leaf(k));
  }
}

/** Sliding lattice door, shut. */
export function doorWall(k: Kit) {
  doorFrame(k, false);
  leaves(k, false);
}

/** The same door slid open: each side's three leaves stacked in front of its own jamb. */
export function doorOpenWall(k: Kit) {
  doorFrame(k, true);
  leaves(k, true);
}

/** Opening of the vent wall: about as wide as the window, at the industrial louvre's height. */
export const VENT = { half: 0.27, sill: 0.95, head: 1.55 } as const;

/**
 * Slatted vent: a timber frame through the wall round square slats
 * set corner-on, so each shows a lit and a shaded face, over a dark backing;
 * a small tiled hood on two brackets above it, inside the industrial
 * louvre's hood.
 */
export function louvreWall(k: Kit) {
  const { b } = k;
  const { half, sill, head } = VENT;
  plaster(k, -0.5, 0.5, 0, sill);
  plaster(k, -0.5, 0.5, head, WALL_H);
  plaster(k, -0.5, -half, sill, head);
  plaster(k, half, 0.5, sill, head);
  timberOutside(k);
  const timber = k.m('post'), h = head - sill, my = (sill + head) / 2, fd = WALL_T + 2 * PROUD, m = 0.04;
  // Frame through the wall, proud of both faces, the dark backing, then the slats.
  for (const y of [sill + m / 2, head - m / 2]) b.box(timber, [2 * half + 2 * m, m, fd], { position: [0, y, 0] }, 0);
  for (const s of [-1, 1]) b.box(timber, [m, h, fd], { position: [s * (half + m / 2), my, 0] }, 0);
  b.box(k.m('steel'), [2 * half, h - 2 * m, 0.01], { position: [0, my, -0.03] }, 0);
  const slats = k.low ? 4 : 6, pitch = 2 * half / slats;
  for (let i = 0; i < slats; i++) b.box(timber, [0.03, h - 2 * m, 0.03], { position: [-half + pitch * (i + 0.5), my, 0.04], rotation: [0, Math.PI / 4, 0] }, 0);
  // Hood: one tiled board pitched out over the vent, on two brackets.
  const run = 0.16;
  b.box(k.m('corrugated'), [2 * half + 0.2, 0.025, run], { position: [0, head + 0.09, FACE + run / 2 - 0.005], rotation: [0.3, 0, 0] }, 0);
  if (!k.low) for (const s of [-1, 1]) b.box(timber, [0.03, 0.07, 0.1], { position: [s * (half + 0.06), head + 0.035, FACE + 0.05] }, 0);
  timberInside(k);
}

/**
 * Store wall: dark boards with battens over their joints (board-and-batten)
 * on a stone plinth, under the beam: the industrial shed wall's construction
 * in timber. Like it, there is no inner lining: inside you see two rails and
 * the back of the boards. Nothing stands further inside than the industrial
 * girts.
 */
export function corrugatedWall(k: Kit) {
  const { b } = k;
  const plinth = 0.3, top = WALL_H - TOP_BAND, timber = k.m('post');
  b.box(k.m('concrete'), [1.0, plinth, WALL_T], { position: [0, plinth / 2, 0] }, 0);
  b.box(timber, [1.0, top - plinth, 0.03], { position: [0, (plinth + top) / 2, FACE - 0.015] }, 0);
  const battens = k.low ? [-0.25, 0.25] : [-0.375, -0.125, 0.125, 0.375];
  for (const x of battens) b.box(timber, [0.04, top - plinth, PROUD], { position: [x, (plinth + top) / 2, FACE + PROUD / 2] }, 0);
  b.box(timber, [1.0, TOP_BAND, WALL_T + PROUD], { position: [0, WALL_H - TOP_BAND / 2, PROUD / 2] }, 0);
  for (const y of [0.86, 1.46]) b.box(timber, [1.0, 0.09, 0.05], { position: [0, y, 0.03] }, 0);
}
