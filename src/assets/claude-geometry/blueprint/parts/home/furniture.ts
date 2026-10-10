import * as T from 'three';
import { extrudeZY } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Furniture that goes into a blueprint like any other part.
//
// - The table stands in the middle of its cell (cell part, origin at the cell
//   centre) and leaves the cell's sides free for chairs tucked under it.
// - The rest stand against one side of a cell (edge-mounted: origin on the
//   edge midpoint at the slab top, x along the edge, +Z the edge's outside),
//   their backs 0.13 m in from the edge line, clear of every wall's inner
//   face, and reaching no further than the cell centre (z ≥ −0.5).
//
// The industrial look's models (table, chair, sideboard, shelf) are turned and
// boarded shapes in painted steel, tread plate and sheet, their edges eased
// (bevelled extrusions, chamfers, lathed profiles) so the forms read without
// colour. The village look has its own twins at the end of this file: a low
// table with stools, a chest of drawers and an open shelf, big flat forms the
// screen-space lines can draw. All of them are looks only: nothing sits,
// stores or opens.

/** Back of a piece standing against a side, in its frame (clear of wall linings, window boards and skirtings). */
export const SIDE_BACK = -0.13;

type P2 = [number, number];
type P3 = [number, number, number];

/** Bevel an extrusion is drawn with at this tier (none at low, whose settings draw no bevels). */
const ease = (k: Kit, c: number) => (k.low ? 0 : c);

/** Outline of the rectangle u0..u1 × v0..v1, corners rounded by r (order −u−v, +u−v, +u+v, −u+v), n steps a corner. */
function roundedRect(u0: number, u1: number, v0: number, v1: number, r: [number, number, number, number], n: number): P2[] {
  const out: P2[] = [];
  const corners: [number, number, number][] = [[u0, v0, Math.PI], [u1, v0, 1.5 * Math.PI], [u1, v1, 0], [u0, v1, 0.5 * Math.PI]];
  corners.forEach(([cu, cv, a0], i) => {
    const rr = r[i], su = cu === u0 ? 1 : -1, sv = cv === v0 ? 1 : -1;
    if (rr <= 0) { out.push([cu, cv]); return; }
    for (let s = 0; s <= n; s++) {
      const a = a0 + (s / n) * Math.PI / 2;
      out.push([cu + su * rr + rr * Math.cos(a), cv + sv * rr + rr * Math.sin(a)]);
    }
  });
  return out;
}

/** Drops repeated points (a strip touching the disc's rim starts and ends its two arcs on one point). */
function distinct(points: P2[]): P2[] {
  const out = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6);
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-6) out.pop();
  return out;
}

/** Plan outline of the strip x0..x1 of a disc of radius r: two straight sides and two arcs, at most `step` radians a facet. */
function discStrip(r: number, x0: number, x1: number, step: number): P2[] {
  const a0 = Math.acos(Math.max(-1, x0 / r)), a1 = Math.acos(Math.min(1, x1 / r));
  const n = Math.max(1, Math.ceil((a0 - a1) / step)), out: P2[] = [];
  for (let i = 0; i <= n; i++) { const a = a1 + (a0 - a1) * i / n; out.push([r * Math.cos(a), r * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = a0 - (a0 - a1) * i / n; out.push([r * Math.cos(a), -r * Math.sin(a)]); }
  return distinct(out);
}

/** A horizontal board from a plan outline (x, z), from y up by `t`; a bevel grows the outline and both faces by itself. */
function plank(k: Kit, mat: T.Material, plan: P2[], y: number, t: number, bevel: number) {
  k.b.extrude(mat, plan.map(([x, z]) => [x, -z] as P2), t, { position: [0, y, 0], rotation: [-Math.PI / 2, 0, 0] }, bevel);
}

const UP = new T.Vector3(0, 1, 0);
/** A round rod from a (radius r0) to b (r1): legs, posts, rungs, rails. Open ended: its ends always sit in wood or on the floor. */
function rod(k: Kit, mat: T.Material, a: P3, b: P3, r0: number, r1: number, segments: number) {
  const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const e = new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize()));
  k.b.cylinder(mat, r1, r0, len, { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation: [e.x, e.y, e.z] }, { segments, open: true });
}

/** A turned knob on a front at z, standing out along −Z. Eight facets: too small for its creases to matter. */
function knob(k: Kit, mat: T.Material, x: number, y: number, z: number, r: number) {
  const profile: P2[] = k.fine ? [[r * 0.45, 0], [r * 0.5, r * 0.5], [r, r * 0.85], [0, r * 1.35]] : [[r * 0.45, 0], [r, r * 0.8], [0, r * 1.35]];
  k.b.lathe(mat, profile, { position: [x, y, z], rotation: [-Math.PI / 2, 0, 0] }, 8);
}

/** A front apron across −w..w, h tall, its lower edge cut into a shallow arch between two feet; front face at z, `t` deep. */
function archApron(k: Kit, mat: T.Material, w: number, h: number, rise: number, foot: number, z: number, t: number) {
  const n = k.fine ? 8 : 4, arch: P2[] = [];
  for (let i = 1; i < n; i++) { const s = i / n; arch.push([(w - foot) * (2 * s - 1), rise * Math.sin(Math.PI * s)]); }
  k.b.extrude(mat, [[-w, h], [-w, 0], [-(w - foot), 0], ...arch, [w - foot, 0], [w, 0], [w, h]], t, { position: [0, 0, z] });
}

/**
 * Round table, 0.6 m across, top 0.72–0.75 m, on one turned pedestal: four
 * boards with eased edges meeting in shallow grooves, two crossed battens
 * under them, a turned column with a ring and a vase, and a bell foot 0.30 m
 * across, so chairs on all four sides can tuck their seats and legs under it.
 */
export function table(k: Kit) {
  const { b } = k, wood = k.m('post'), top = k.m('tread');
  if (k.low) b.cylinder(top, 0.3, 0.3, 0.03, { position: [0, 0.735, 0] }, { segments: 16 });
  else {
    // Boards run along z; each strip's bevel meets its neighbour's, leaving a V groove.
    const e = 0.004, R = 0.3 - e, step = k.fine ? 0.17 : 0.3;
    const edges = [-R, -0.15, 0, 0.15, R];
    for (let i = 0; i < 4; i++) {
      const x0 = i === 0 ? -R : edges[i] + e, x1 = i === 3 ? R : edges[i + 1] - e;
      plank(k, top, discStrip(R, x0, x1, step), 0.72 + e, 0.03 - 2 * e, e);
    }
    for (const r of [0, Math.PI / 2]) b.box(wood, [0.44, 0.03, 0.05], { position: [0, 0.705, 0], rotation: [0, r, 0] }, k.fine ? 0.008 : 0);
  }
  // Pedestal, [radius, height]: bell foot with a rounded lip, ring, vase, a plain shaft where seats reach, collar and head.
  const profile: P2[] = k.low
    ? [[0.15, 0], [0.15, 0.025], [0.09, 0.05], [0.055, 0.1], [0.065, 0.25], [0.04, 0.38], [0.04, 0.6], [0.05, 0.64], [0.045, 0.705]]
    : k.fine
      ? [[0.15, 0], [0.15, 0.016], [0.145, 0.029], [0.13, 0.039], [0.1, 0.05], [0.078, 0.066], [0.062, 0.09], [0.054, 0.12],
          [0.064, 0.13], [0.064, 0.15], [0.052, 0.162], [0.058, 0.2], [0.067, 0.25], [0.061, 0.3], [0.047, 0.34], [0.04, 0.38],
          [0.04, 0.6], [0.052, 0.615], [0.052, 0.645], [0.045, 0.66], [0.045, 0.705]]
      : [[0.15, 0], [0.15, 0.018], [0.135, 0.036], [0.095, 0.052], [0.064, 0.085], [0.054, 0.12], [0.064, 0.14], [0.052, 0.162],
          [0.067, 0.25], [0.047, 0.34], [0.04, 0.38], [0.04, 0.6], [0.052, 0.63], [0.045, 0.66], [0.045, 0.705]];
  b.lathe(wood, profile, undefined, k.fine ? 16 : k.low ? 8 : 12);
}

/**
 * Chair facing into its cell (toward −Z), 0.40 m wide: four round tapered
 * legs with rungs, a boarded seat at 0.46 m with rounded front corners, and a
 * painted back board with an arched top and a hand slot between two raked
 * posts with turned finials. Seat, legs and rungs stop 0.07 m short of the
 * cell centre, under a table's top and clear of its pedestal; above 0.70 m
 * only the back stands, 0.13–0.18 m in from the edge line, outside the top.
 */
export function chair(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread'), paint = k.m('leaf');
  const SEAT = 0.43, zb = -0.182, zf = -0.395, xb = 0.178, xf = 0.155, rake = 0.06;
  const seg = k.low ? 6 : 12;
  for (const s of [-1, 1]) {
    rod(k, wood, [s * xf, 0, zf], [s * xf, SEAT, zf], 0.017, 0.021, seg);
    rod(k, wood, [s * xb, 0, zb], [s * xb, SEAT, zb], 0.017, 0.021, seg);
  }
  // Rungs along the sides, and at high one across the front.
  if (!k.low) {
    const rs = k.fine ? 10 : 8;
    for (const s of [-1, 1]) rod(k, wood, [s * xb, 0.17, zb], [s * xf, 0.17, zf], 0.012, 0.012, rs);
    if (k.fine) rod(k, wood, [-xf, 0.12, zf], [xf, 0.12, zf], 0.011, 0.011, rs);
  }
  // Seat 0.425–0.465 m: a board with eased edges, rounded at the front corners; the back posts pass through it.
  const e = ease(k, 0.005);
  plank(k, boards, roundedRect(-0.2 + e, 0.2 - e, -0.43 + e, -0.148 - e, [0.06, 0.06, 0.02, 0.02], k.fine ? 4 : 2), SEAT - 0.005 + e, 0.04 - 2 * e, e);
  // Back, raked a little from the seat: posts with finials and the board between them.
  b.within({ position: [0, SEAT, zb], rotation: [rake, 0, 0] }, () => {
    const H = 0.41;
    for (const s of [-1, 1]) {
      rod(k, wood, [s * xb, 0, 0], [s * xb, H, 0], 0.02, 0.019, seg);
      if (!k.low) b.lathe(wood, [[0.019, 0], [0.023, 0.011], [0.022, 0.024], [0.012, 0.035], [0, 0.038]], { position: [s * xb, H, 0] }, k.fine ? 12 : 11);
    }
    const w = 0.165, y0 = 0.12, ys = 0.36, peak = 0.42, eb = ease(k, 0.003), t = 0.02;
    if (k.low) { b.box(paint, [2 * w, peak - y0, t], { position: [0, (y0 + peak) / 2, 0] }, 0); return; }
    // Arched top: a circular arc through the shoulders (±w, ys) and the peak.
    const sag = peak - ys, R = (w * w + sag * sag) / (2 * sag), cy = peak - R, steps = k.fine ? 8 : 5;
    const arch: P2[] = [];
    for (let i = 0; i <= steps; i++) { const x = w - (2 * w * i) / steps; arch.push([x, cy + Math.sqrt(R * R - x * x)]); }
    // Hand slot: a stadium 0.12 × 0.035 m, cut larger by the bevel that closes it up again.
    const slot: P2[] = [], hs = k.fine ? 6 : 4, sr = 0.0175 + eb, sl = 0.0425, sy = 0.33;
    for (let i = 0; i <= hs; i++) { const a = -Math.PI / 2 + (Math.PI * i) / hs; slot.push([sl + sr * Math.cos(a), sy + sr * Math.sin(a)]); }
    for (let i = 0; i <= hs; i++) { const a = Math.PI / 2 + (Math.PI * i) / hs; slot.push([-sl + sr * Math.cos(a), sy + sr * Math.sin(a)]); }
    b.extrude(paint, [[-w, y0], [w, y0], ...arch], t - 2 * eb, { position: [0, 0, -t / 2 + eb] }, eb, [slot]);
  });
}

/**
 * Low cupboard against a wall, 0.68 m wide and 0.90 m high: a painted body on
 * a timber plinth whose front is cut into an arch between two feet, two
 * doors with raised fielded panels under two drawers, turned knobs, and a
 * top of two boards with eased edges overhanging the front. The top is left
 * clear (later decor sockets stand on it).
 */
export function sideboard(k: Kit) {
  const { b } = k, wood = k.m('post'), paint = k.m('leaf'), boards = k.m('tread');
  const back = SIDE_BACK - 0.005, front = -0.435, W = 0.32, base = 0.075, body = 0.86;
  // Plinth: an arched front 1 cm behind the body's, plain sides.
  if (k.low) b.box(wood, [0.62, base, 0.28], { position: [0, base / 2, -0.285] }, 0);
  else {
    archApron(k, wood, 0.31, base, 0.04, 0.06, front + 0.01, 0.02);
    for (const s of [-1, 1]) b.box(wood, [0.02, base, 0.27], { position: [s * 0.3, base / 2, -0.28] }, 0);
  }
  b.box(paint, [2 * W, body - base, back - front], { position: [0, (base + body) / 2, (back + front) / 2] }, 0.008);
  // Doors and drawers stand 18 mm proud with 1 cm between them, so the body frames them.
  const dz = front - 0.009, face = dz - 0.009, dx = 0.149;
  for (const s of [-1, 1]) {
    b.box(paint, [0.288, 0.48, 0.018], { position: [s * dx, 0.345, dz] }, k.fine ? 0.005 : 0);
    b.box(paint, [0.288, 0.19, 0.018], { position: [s * dx, 0.72, dz] }, k.fine ? 0.005 : 0);
    if (k.low) continue;
    // Raised field 8 mm proud, its 45° bevel running back into the door, so it shades and keeps an ink line.
    b.extrude(paint, [[-0.085, -0.17], [0.085, -0.17], [0.085, 0.17], [-0.085, 0.17]], 0.002, { position: [s * dx, 0.345, face + 0.002], rotation: [0, Math.PI, 0] }, 0.008);
    knob(k, wood, s * 0.035, 0.42, face, 0.016);
    knob(k, wood, s * dx, 0.72, face, 0.016);
  }
  // Top: two boards front to back, their chamfers meeting in a groove; 2 cm over the doors.
  const mid = (back - 0.475) / 2;
  for (const [z0, z1] of [[back, mid], [mid, -0.475]]) b.box(boards, [0.68, 0.04, z0 - z1], { position: [0, body + 0.02, (z0 + z1) / 2] }, k.fine ? 0.008 : 0.006);
}

/**
 * Tall open shelves against a wall, 0.68 m wide and 1.82 m high: shaped
 * timber sides on arched feet, four boarded shelves and a crown board, a
 * scalloped valance under the crown, a painted boarded back, and things on
 * the shelves: lidded stoneware crocks, books standing, leaning and lying,
 * jars with cloth lids, two plates on a plate rail and a small plant in a
 * terracotta pot.
 */
export function shelf(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread'), paint = k.m('leaf');
  const stone = k.m('concrete'), tile = k.m('corrugated'), bloom = k.m('hazard');
  const zb = SIDE_BACK - 0.002, zf = -0.43, top = 1.78, W = 0.34, side = 0.03, inner = W - side;
  const shelves = [0.07, 0.49, 0.91, 1.33], t = 0.03, zc = -0.29;
  // Sides: rounded at the front top, the lower edge cut into an arch between a front and a back foot.
  const arch: P2[] = [], an = k.low ? 0 : k.fine ? 6 : 3;
  for (let i = 1; i < an; i++) { const s = i / an; arch.push([zf + 0.035 + (zb - 0.065 - zf) * s, 0.05 * Math.sin(Math.PI * s)]); }
  const profile: P2[] = [[zb, 0], [zb, top], [zf + 0.03, top], ...(k.low ? [] : [[zf + 0.009, top - 0.009] as P2]), [zf, top - 0.03], [zf, 0], [zf + 0.035, 0], ...arch, [zb - 0.03, 0]];
  for (const s of [-1, 1]) extrudeZY(k, wood, profile, s > 0 ? inner : -W, s > 0 ? W : -inner);
  if (k.low) b.box(wood, [2 * inner, 0.07, 0.02], { position: [0, 0.035, zf + 0.022] }, 0);
  else archApron(k, wood, inner, 0.07, 0.035, 0.05, zf + 0.012, 0.02);
  // Shelves between the sides and the crown board over them.
  for (const y of shelves) b.box(boards, [2 * inner + 0.004, t, zb - 0.002 - (zf + 0.01)], { position: [0, y + t / 2, (zb - 0.002 + zf + 0.01) / 2] }, k.fine ? 0.006 : 0);
  b.box(wood, [2 * W, 0.035, zb + 0.445], { position: [0, top + 0.0175, (zb - 0.445) / 2] }, 0.008);
  // Valance: three shallow scallops under the crown, across the front.
  if (!k.low) {
    const vt = top - 0.08, sc = k.fine ? 5 : 3, edge: P2[] = [];
    for (let j = 0; j < 3; j++) for (let i = j > 0 ? 1 : 0; i <= sc; i++) {
      const s = i / sc;
      edge.push([inner - (2 * inner * (j + s)) / 3, vt + 0.03 * Math.sin(Math.PI * s)]);
    }
    b.extrude(wood, [[-inner, top], [inner, top], ...edge], 0.018, { position: [0, 0, zf + 0.004] });
  }
  // Painted back: at high four boards whose chamfers draw the joints, else one.
  const nb = k.fine ? 4 : 1, bw = (2 * inner) / nb;
  for (let i = 0; i < nb; i++) b.box(paint, [bw, top - 0.06, 0.014], { position: [-inner + bw * (i + 0.5), 0.06 + (top - 0.06) / 2, zb - 0.007] }, k.fine ? 0.004 : 0);

  const [s0, s1, s2, s3] = shelves.map(y => y + t);
  // Eleven facets or more keep each turn under the 35° crease angle: turned pieces draw no ink down their sides.
  const seg = k.fine ? 12 : 11;
  /** A book standing upright, w thick along x from x; `lean` tips it toward −x on its lower −x edge. */
  const book = (mat: T.Material, x: number, y: number, w: number, h: number, d: number, lean = 0) =>
    b.within({ position: [x, y, zc + 0.02], rotation: [0, 0, lean] }, () => b.box(mat, [w, h, d], { position: [w / 2, h / 2, 0] }, 0));
  /** A book lying flat, turned a little about y. */
  const lying = (mat: T.Material, x: number, y: number, w: number, h: number, turn: number) =>
    b.box(mat, [w, h, 0.19], { position: [x, y + h / 2, zc + 0.01], rotation: [0, turn, 0] }, 0);
  /** A lidded stoneware crock. */
  const crock = (x: number, y: number, z: number, r: number, h: number) => {
    if (k.low) { b.cylinder(stone, r * 0.85, r * 0.85, h, { position: [x, y + h / 2, z] }, { segments: 6 }); return; }
    b.lathe(stone, k.fine ? [[r * 0.78, 0], [r, h * 0.42], [r * 0.74, h * 0.88], [r * 0.77, h]] : [[r * 0.8, 0], [r, h * 0.45], [r * 0.76, h]], { position: [x, y, z] }, seg);
    b.lathe(wood, k.fine ? [[r * 0.82, 0], [r * 0.82, 0.014], [r * 0.3, 0.026], [0, 0.044]] : [[r * 0.82, 0], [r * 0.8, 0.016], [0, 0.04]], { position: [x, y + h, z] }, seg);
  };
  /** A glass jar (open: the shelf and the lid close it) with a cloth lid tied over its mouth. */
  const jar = (x: number, y: number, r: number, h: number) => {
    b.cylinder(k.m('glass'), r, r, h, { position: [x, y + h / 2, zc + 0.03] }, { segments: seg, open: true });
    b.lathe(bloom, [[r + 0.004, -0.012], [r + 0.007, 0.012], [0, 0.018]], { position: [x, y + h, zc + 0.03] }, seg);
  };

  // Bottom shelf: a big crock and two books lying flat.
  crock(-0.15, s0, zc, 0.095, 0.24);
  if (!k.low) { lying(tile, 0.13, s0, 0.2, 0.045, 0.08); lying(boards, 0.13, s0 + 0.045, 0.17, 0.04, -0.05); }
  // Second shelf: a row of books, the last one leaning on the row, and jars.
  if (k.low) book(tile, -0.3, s1, 0.19, 0.22, 0.19);
  else {
    let x = -0.3;
    for (const [mat, w, h] of [[tile, 0.04, 0.25], [boards, 0.035, 0.22], [bloom, 0.045, 0.27], [wood, 0.03, 0.23], [stone, 0.04, 0.2]] as [T.Material, number, number][]) {
      book(mat, x, s1, w, h, 0.19);
      x += w + 0.002;
    }
    book(paint, x - 0.001 + 0.2 * Math.sin(0.35), s1, 0.035, 0.2, 0.18, 0.35);
    jar(0.15, s1, 0.045, 0.13);
    if (k.fine) jar(0.245, s1, 0.038, 0.1);
  }
  // Third shelf: two plates leaning on the back behind a plate rail, and a small crock in front of the rail.
  if (!k.low) {
    const pr = 0.095, tilt = 0.2;
    for (const px of [-0.2, 0]) b.cylinder(stone, pr, pr, 0.012, { position: [px, s2 + pr * Math.cos(tilt) + 0.004, zb - 0.03 - pr * Math.sin(tilt)], rotation: [Math.PI / 2 + tilt, 0, 0] }, { segments: k.fine ? 16 : 12 });
    rod(k, wood, [-inner, s2 + 0.03, zb - 0.085], [inner, s2 + 0.03, zb - 0.085], 0.008, 0.008, 6);
  }
  crock(0.2, s2, zc - 0.035, 0.07, 0.17);
  // Top shelf: a small plant in a terracotta pot, two books lying flat.
  const px = -0.15, leaf = k.m('membrane'), detail = k.fine ? 1 : 0;
  if (k.low) b.cylinder(tile, 0.065, 0.05, 0.1, { position: [px, s3 + 0.05, zc] }, { segments: 6 });
  else b.lathe(tile, k.fine ? [[0.045, 0], [0.058, 0.08], [0.066, 0.082], [0.066, 0.104], [0.054, 0.104]] : [[0.045, 0], [0.06, 0.082], [0.066, 0.104]], { position: [px, s3, zc] }, seg);
  b.geometry(leaf, new T.IcosahedronGeometry(0.075, detail), { position: [px, s3 + 0.17, zc], scale: [1.1, 0.85, 1] });
  if (!k.low) {
    b.geometry(leaf, new T.IcosahedronGeometry(0.05, detail), { position: [px - 0.06, s3 + 0.12, zc - 0.04], scale: [1.2, 0.8, 1] });
    if (k.fine) b.geometry(leaf, new T.IcosahedronGeometry(0.045, 1), { position: [px + 0.065, s3 + 0.125, zc - 0.03], scale: [1.1, 0.8, 1] });
    b.geometry(bloom, new T.IcosahedronGeometry(0.022, 0), { position: [px + 0.03, s3 + 0.235, zc - 0.04] });
  }
  lying(paint, 0.15, s3, 0.21, 0.04, -0.1);
  lying(bloom, 0.15, s3 + 0.04, 0.18, 0.035, 0.06);
}

// ------------------------------------------------------------------ village twins
//
// The village look's furniture for a small Japanese town (docs/restyle/parts.md):
// dark timber frames and pale boards in big flat pieces, so the lines draw
// their edges, the drawer gaps and the shelves, and nothing else. They stand
// where the industrial pieces stand (backs from SIDE_BACK) and inside the same
// envelopes (info.ts).

/**
 * The low table: its top (two boards along z with an open joint at x 0), the
 * apron under the top's edges and the four legs at its corners.
 */
export const LOW_TABLE = { top: 0.45, board: 0.035, half: 0.3, joint: 0.008, apron: 0.06, apronOut: 0.265, apronT: 0.02, leg: 0.05 } as const;
/** The stool that tucks under it: seat top, seat board, half width, front and back of the seat (z), legs and their inset. */
export const STOOL = { top: 0.3, board: 0.04, half: 0.17, front: -0.4, back: SIDE_BACK - 0.02, leg: 0.04, inset: 0.015 } as const;

/**
 * Low table, 0.6 m square, its top at 0.45 m: two wide boards on an
 * apron 6 cm deep, four square legs. Stools on two opposite sides tuck under
 * it: their seats (0.30 m) pass under the apron (from 0.355 m) between the
 * legs (from 0.215 m off the middle).
 */
export function tableVillage(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread');
  const { top, board, half, joint, apron, apronOut, apronT, leg } = LOW_TABLE;
  const under = top - board, at = apronOut - leg / 2;
  if (k.low) b.box(boards, [2 * half, board, 2 * half], { position: [0, top - board / 2, 0] }, 0);
  else for (const s of [-1, 1]) b.box(boards, [half - joint / 2, board, 2 * half], { position: [s * (half + joint / 2) / 2, top - board / 2, 0] }, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(wood, [leg, under, leg], { position: [sx * at, under / 2, sz * at] }, 0);
  if (k.low) return;
  // Apron between the legs' inner faces, flush with their outer faces.
  const run = 2 * (at - leg / 2), y = under - apron / 2, c = apronOut - apronT / 2;
  for (const s of [-1, 1]) {
    b.box(wood, [run, apron, apronT], { position: [0, y, s * c] }, 0);
    b.box(wood, [apronT, apron, run], { position: [s * c, y, 0] }, 0);
  }
}

/**
 * Stool against a side of its cell: a board seat 0.34 × 0.25 m at
 * 0.30 m on four square legs, a stretcher along each side (not at low).
 * Nothing of it is above 0.30 m, so it tucks under the low table.
 */
export function chairVillage(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread');
  const { top, board, half, front, back, leg, inset } = STOOL;
  const seat = top - board, lx = half - inset - leg / 2, z0 = front + inset + leg / 2, z1 = back - inset - leg / 2;
  b.box(boards, [2 * half, board, back - front], { position: [0, top - board / 2, (front + back) / 2] }, 0);
  for (const s of [-1, 1]) for (const z of [z0, z1]) b.box(wood, [leg, seat, leg], { position: [s * lx, seat / 2, z] }, 0);
  if (!k.low) for (const s of [-1, 1]) b.box(wood, [0.025, 0.03, z1 - z0 - leg], { position: [s * lx, 0.1, (z0 + z1) / 2] }, 0);
}

/**
 * The chest of drawers: its top board (left clear for decor) and carcass, the
 * plinth set back under it, and the drawer fronts standing proud of the
 * carcass with gaps between them.
 */
export const CHEST = { top: 0.9, board: 0.03, half: 0.33, front: -0.445, plinth: 0.06, frame: 0.025, gap: 0.012, proud: 0.012 } as const;

/**
 * Chest of drawers against a wall, 0.66 m wide and 0.90 m high: a dark
 * timber carcass on a plinth, a pale top board overhanging it, and pale
 * drawer fronts in three rows (two small drawers over two wide ones), each
 * with an iron pull on a square plate (two on a wide drawer; none at low). The
 * dark carcass shows in the gaps, so the drawers read as drawers in colour and
 * in lines.
 */
export function sideboardVillage(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread'), iron = k.m('steel');
  const { top, board, half, front, plinth, frame, gap, proud } = CHEST;
  const back = SIDE_BACK - 0.005, body = top - board;
  // Plinth: 12 mm in from the front and the sides, so its top draws a line round the foot.
  const pb = back - 0.005, pf = front + 0.012;
  b.box(wood, [2 * half - 0.024, plinth, pb - pf], { position: [0, plinth / 2, (pb + pf) / 2] }, 0);
  b.box(wood, [2 * half, body - plinth, back - front], { position: [0, (plinth + body) / 2, (back + front) / 2] }, 0);
  // Top: 1 cm over the sides, 2 cm over the front, 2 mm short of the carcass's back.
  const tb = back - 0.002, tf = front - 0.02;
  b.box(boards, [2 * half + 0.02, board, tb - tf], { position: [0, body + board / 2, (tb + tf) / 2] }, 0);
  // Drawers: three rows inside the carcass's frame.
  const x0 = half - frame, y0 = plinth + frame, rows = 3, rh = (body - frame - y0 - (rows - 1) * gap) / rows;
  // Pulls: a square iron plate on the drawer front and a flat bar hanging low on it, as a tansu's fittings.
  const dz = front - proud / 2, face = front - proud;
  const pull = (x: number, y: number) => {
    if (k.low) return;
    b.box(iron, [0.075, 0.05, 0.004], { position: [x, y, face - 0.002] }, 0);
    b.box(iron, [0.09, 0.014, 0.01], { position: [x, y - 0.012, face - 0.004 - 0.005] }, 0);
  };
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * (rh + gap) + rh / 2;
    if (r < rows - 1) {
      b.box(boards, [2 * x0, rh, proud], { position: [0, y, dz] }, 0);
      for (const s of [-1, 1]) pull(s * 0.15, y);
    } else for (const s of [-1, 1]) {
      const w = x0 - gap / 2, x = s * (x0 + gap / 2) / 2;
      b.box(boards, [w, rh, proud], { position: [x, y, dz] }, 0);
      pull(x, y);
    }
  }
}

/** The open shelf: height (top board's top), half width, side boards, front (z), back (z), shelf bottoms and boards. */
export const OPEN_SHELF = { top: 1.815, crown: 0.025, half: 0.34, side: 0.03, front: -0.43, back: SIDE_BACK - 0.002, backT: 0.014, shelves: [0.06, 0.48, 0.9, 1.32], board: 0.03 } as const;

/**
 * Open shelf against a wall, 0.68 m wide and 1.815 m high: two dark
 * timber sides under a timber top board, a pale boarded back, four pale
 * shelves over a kick board set back at the floor, and two or three things a
 * shelf: a stoneware jar and a slate lacquer box; two teal tea caddies and a
 * folded cloth on a second; a stack of three stone bowls and a small jar; a
 * potted plant and a wooden tea box at the top.
 */
export function shelfVillage(k: Kit) {
  const { b } = k, wood = k.m('post'), boards = k.m('tread'), stone = k.m('concrete'), slate = k.m('corrugated');
  const { top, crown, half, side, front, back, backT, shelves, board } = OPEN_SHELF;
  const inner = half - side, high = top - crown, zc = -0.29;
  for (const s of [-1, 1]) b.box(wood, [side, high, back - front], { position: [s * (half - side / 2), high / 2, (back + front) / 2] }, 0);
  b.box(wood, [2 * half, crown, back - front + 0.015], { position: [0, high + crown / 2, (back + front - 0.015) / 2] }, 0);
  b.box(boards, [2 * inner, high, backT], { position: [0, high / 2, back - backT / 2] }, 0);
  if (!k.low) b.box(wood, [2 * inner, shelves[0], 0.02], { position: [0, shelves[0] / 2, front + 0.03] }, 0);
  const sb = back - backT, sf = front + 0.01;
  for (const y of shelves) b.box(boards, [2 * inner, board, sb - sf], { position: [0, y + board / 2, (sb + sf) / 2] }, 0);
  const [s0, s1, s2, s3] = shelves.map(y => y + board);
  const seg = k.fine ? 12 : k.low ? 6 : 8;
  // Bottom shelf: a stoneware jar with a shoulder and a short neck, a slate lacquer box.
  if (k.low) b.cylinder(stone, 0.08, 0.08, 0.24, { position: [-0.15, s0 + 0.12, zc] }, { segments: seg });
  else b.lathe(stone, [[0.07, 0], [0.095, 0.08], [0.09, 0.17], [0.06, 0.215], [0.065, 0.24], [0, 0.24]], { position: [-0.15, s0, zc] }, seg);
  b.box(slate, [0.2, 0.12, 0.18], { position: [0.15, s0 + 0.06, zc] }, 0);
  // Second shelf: two tea caddies in the teal paint, a folded cloth (coral, cream on top).
  for (const x of k.low ? [-0.2] : [-0.21, -0.1]) b.cylinder(k.m('leaf'), 0.045, 0.045, 0.14, { position: [x, s1 + 0.07, zc] }, { segments: seg });
  b.box(k.m('hazard'), [0.18, 0.05, 0.2], { position: [0.15, s1 + 0.025, zc] }, 0);
  if (!k.low) b.box(k.m('marking'), [0.15, 0.04, 0.17], { position: [0.15, s1 + 0.07, zc] }, 0);
  // Third shelf: three stone bowls stacked, a small jar.
  if (!k.low) {
    b.lathe(stone, [[0.045, 0], [0.09, 0.045], [0.06, 0.05], [0.09, 0.095], [0.06, 0.1], [0.09, 0.145], [0, 0.145]], { position: [-0.16, s2, zc] }, seg);
    b.lathe(stone, [[0.05, 0], [0.068, 0.06], [0.064, 0.12], [0.042, 0.15], [0, 0.15]], { position: [0.17, s2, zc] }, seg);
  }
  // Top shelf: a plant in a slate pot, a wooden tea box.
  if (k.low) b.cylinder(slate, 0.065, 0.05, 0.11, { position: [-0.15, s3 + 0.055, zc] }, { segments: seg });
  else b.lathe(slate, [[0.05, 0], [0.066, 0.11], [0, 0.11]], { position: [-0.15, s3, zc] }, seg);
  b.geometry(k.m('membrane'), new T.IcosahedronGeometry(0.09, k.fine ? 1 : 0), { position: [-0.15, s3 + 0.18, zc], scale: [1.1, 0.85, 1] });
  b.box(wood, [0.16, 0.1, 0.16], { position: [0.16, s3 + 0.05, zc] }, 0);
}
