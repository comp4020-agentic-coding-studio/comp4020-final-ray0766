import * as T from 'three';
import { SLOPE_RISE } from '../decks.ts';
import { slab, small, SLAB } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { FRIEZE, RAFTER, RAFTERS, rafterTail, VILLAGE_BANDS, VILLAGE_EAVE, VILLAGE_EAVE_REACH, VILLAGE_RIDGE, VILLAGE_RIDGE_TOP, VILLAGE_SLOPE_RISE, VILLAGE_TILE, villageFoot } from '../village/decks.ts';

// Roof closures for the sloped roof panel (roof.slope): the hip that turns an
// outer corner and the valley that turns an inner one. They meet the panel's
// surface edge for edge, so each look has its own: the industrial panel rises
// 0.36 m over its cell (parts/decks.ts), the village panel 0.5 m and its eave
// on past the cell (parts/village/decks.ts).
//
// Cell parts, origin at the cell centre on the level's walking surface. With
// u = z + 0.5 and v = x + 0.5 (0..1 across the cell), a panel turned to drain
// to +Z has its surface at rise·(1 − u); one turned to drain to +X at
// rise·(1 − v). The hip is the lower of the two (eaves on +Z and +X, its high
// corner at −X−Z), the valley the higher (ridges on −Z and −X, its low point
// at the +X+Z corner). Each is drawn as the panel's own pieces on the +Z plane,
// cut where the planes meet (the diagonal x = z), and the same pieces mirrored
// across that diagonal for the +X plane, so courses, seams and lips sit where
// the neighbouring panels have them.

/** The industrial panel's rise over its cell (parts/decks.ts slopeRoof). */
export const INDUSTRIAL_SLOPE_RISE = SLOPE_RISE;

// ------------------------------------------------------------ convex solids

// The panels are boxes; the corners need them cut along the diagonal and the
// valley gutter, which PartBuilder's boxes cannot do. A solid here is a convex
// polyhedron as outward-wound faces; cutting keeps one side of a plane.

type V3 = [number, number, number];
type Solid = V3[][];
const EPS = 1e-9;

/** The box lo..hi of a frame placed by `m`. */
function boxSolid(lo: V3, hi: V3, m?: T.Matrix4): Solid {
  const v = new T.Vector3();
  const p = [0, 1, 2, 3, 4, 5, 6, 7].map((i): V3 => {
    v.set(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
    if (m) v.applyMatrix4(m);
    return [v.x, v.y, v.z];
  });
  return [[p[0], p[4], p[6], p[2]], [p[1], p[3], p[7], p[5]], [p[0], p[1], p[5], p[4]], [p[2], p[6], p[7], p[3]], [p[0], p[2], p[3], p[1]], [p[4], p[5], p[7], p[6]]];
}

/** Wind every face of a convex solid outward: its normal (Newell's, as draw() takes it) away from the solid's centre. */
function outward(s: Solid): Solid {
  const all = s.flat(), c = all.reduce((m, p) => [m[0] + p[0] / all.length, m[1] + p[1] / all.length, m[2] + p[2] / all.length] as V3, [0, 0, 0] as V3);
  return s.map(face => {
    let nx = 0, ny = 0, nz = 0, fx = 0, fy = 0, fz = 0;
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      fx += a[0] / face.length; fy += a[1] / face.length; fz += a[2] / face.length;
    }
    return nx * (fx - c[0]) + ny * (fy - c[1]) + nz * (fz - c[2]) < 0 ? face.slice().reverse() : face;
  });
}

/** A convex (z, y) profile run along x from x0 to x1, as the village panel's extrudeZY pieces are. */
function prismSolid(profile: [number, number][], x0: number, x1: number): Solid {
  const a = profile.map(([z, y]): V3 => [x0, y, z]), b = profile.map(([z, y]): V3 => [x1, y, z]);
  const sides = profile.map((_, i): V3[] => { const j = (i + 1) % profile.length; return [a[i], a[j], b[j], b[i]]; });
  return outward([a, b, ...sides]);
}

/** Keep the part of a convex solid where n·p ≤ d; `cap` closes the cut (leave it open where a mirrored twin closes it). */
function cut(s: Solid, n: V3, d: number, cap = true): Solid {
  const f = (p: V3) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d;
  const out: Solid = [], on: V3[] = [];
  for (const face of s) {
    const kept: V3[] = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length], fa = f(a), fb = f(b);
      if (fa <= EPS) kept.push(a);
      if (Math.abs(fa) <= EPS) on.push(a);
      if ((fa < -EPS && fb > EPS) || (fa > EPS && fb < -EPS)) {
        const t = fa / (fa - fb), q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        kept.push(q); on.push(q);
      }
    }
    if (kept.length >= 3) out.push(kept);
  }
  if (!cap || out.length === 0) return out;
  const pts: V3[] = [];
  for (const q of on) if (!pts.some(r => Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 1e-7)) pts.push(q);
  if (pts.length < 3) return out;
  // Order the cut's corners round its centre, counter-clockwise seen from +n.
  const c = pts.reduce((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length, m[2] + q[2] / pts.length] as V3, [0, 0, 0] as V3);
  const nn = new T.Vector3(...n).normalize();
  const e1 = new T.Vector3(1, 0, 0).cross(nn);
  if (e1.lengthSq() < 1e-6) e1.set(0, 1, 0).cross(nn);
  e1.normalize();
  const e2 = new T.Vector3().crossVectors(nn, e1);
  const ang = (q: V3) => { const dx = q[0] - c[0], dy = q[1] - c[1], dz = q[2] - c[2]; return Math.atan2(dx * e2.x + dy * e2.y + dz * e2.z, dx * e1.x + dy * e1.y + dz * e1.z); };
  out.push(pts.sort((x, y) => ang(x) - ang(y)));
  return out;
}

/** Cut by several planes in turn: [n, d] keeps n·p ≤ d. */
const cuts = (s: Solid, planes: [V3, number][]) => planes.reduce((acc, [n, d]) => cut(acc, n, d), s);

/** The solid's twin across the diagonal x = z: the same piece on the other plane of the corner. */
const mirror = (s: Solid): Solid => s.map(face => face.map(([x, y, z]): V3 => [z, y, x]).reverse());
const withMirror = (solids: Solid[]) => [...solids, ...solids.map(mirror)];

/** Space to cut a piece out of by planes alone. */
const space = () => boxSolid([-1, -0.6, -1], [1.5, 1.6, 1.5]);

/** Draw solids as one flat-shaded piece (convex faces, fanned). */
function draw(k: Kit, material: T.Material, solids: Solid[]) {
  const pos: number[] = [], nor: number[] = [];
  for (const s of solids) for (const raw of s) {
    // Drop repeated and collinear corners, which would make slivers.
    const face = raw.filter((p, i) => {
      const a = raw[(i + raw.length - 1) % raw.length], b = raw[(i + 1) % raw.length];
      const u = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], w = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
      return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) > 1e-10;
    });
    if (face.length < 3) continue;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    for (let i = 1; i + 1 < face.length; i++) for (const p of [face[0], face[i], face[i + 1]]) { pos.push(...p); nor.push(nx / l, ny / l, nz / l); }
  }
  if (!pos.length) return;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  k.b.geometry(material, g);
}

const frame = (position: V3, rx = 0) => new T.Matrix4().makeRotationX(rx).setPosition(...position);
/** A frame on a line through `origin` along `along`, its x horizontal across the diagonal. */
function lineFrame(origin: V3, along: T.Vector3) {
  const ez = along.clone().normalize(), ex = new T.Vector3(1, 0, -1).normalize(), ey = new T.Vector3().crossVectors(ez, ex);
  return new T.Matrix4().makeBasis(ex, ey, ez).setPosition(...origin);
}

/** The wedge under a hip: below both planes, from the slab top (y −0.03). */
const hipWedge = (R: number) => cuts(boxSolid([-0.5, -0.03, -0.5], [0.5, R + 0.01, 0.5]), [[[0, 1, R], R / 2], [[R, 1, 0], R / 2]]);

/**
 * The valley gutter's floor plane on the +Z side: from `depth` below the
 * diagonal to the +Z plane at `half` across it, so the gutter is a V a little
 * steeper than the roof's own. y = αx + βz + γ.
 */
function gutterPlane(R: number, half: number, depth: number) {
  const al = depth / (half * Math.SQRT2);
  return { al, be: -R - al, ga: R / 2 - depth };
}

/**
 * Half the wedge under a valley, on the +Z side of the diagonal (open there:
 * its mirror closes it), its top the +Z plane, sunk along the diagonal for
 * the gutter; `back` holds its ridge face back from the cell edge.
 */
function valleyWedge(R: number, half: number, depth: number, back = 0): Solid {
  const { al, be, ga } = gutterPlane(R, half, depth);
  let s = cuts(boxSolid([-0.5, -0.03, -0.5], [0.5, R + 0.01, 0.5]), [[[0, 1, R], R / 2], [[-al, 1, -be], ga]]);
  if (back) s = cut(s, [0, 0, -1], 0.5 - back);
  return cut(s, [-1, 0, 1], 0, false);
}

/** One wing of the valley gutter (+Z side): a sheet `thick` deep on the gutter's floor plane, inside `inside` (planes). */
function gutterWing(R: number, half: number, depth: number, thick: number, inside: [V3, number][] = []): Solid {
  const { al, be, ga } = gutterPlane(R, half, depth);
  return cuts(space(), [
    [[al, -1, be], -ga], [[-al, 1, -be], ga + thick],
    [[-1, 0, 1], 0], [[1, 0, -1], half * Math.SQRT2],
    [[1, 0, 0], 0.5], [[0, 0, 1], 0.5], [[-1, 0, 0], 0.5], [[0, 0, -1], 0.5], ...inside,
  ]);
}

// ------------------------------------------------------------ village

/** The panel's timber ceiling slab. */
function villageCeiling(k: Kit) {
  k.b.box(k.m('post'), [1.0, SLAB - 0.03, 1.0], { position: [0, -SLAB / 2 - 0.015, 0] }, 0);
}

/** The panel's half ridge (block and cap) as boxes over x0..x1 and z0..z1, each its own depth out from the ridge line at z0 (or x0 for an x run). */
function ridgeBox(k: Kit, x: [number, number], z: [number, number], y: [number, number]) {
  k.b.box(k.m('corrugated'), [x[1] - x[0], y[1] - y[0], z[1] - z[0]], { position: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2] }, 0);
}
const R_BASE = VILLAGE_SLOPE_RISE, R_BLOCK = VILLAGE_SLOPE_RISE + VILLAGE_RIDGE.block;

/**
 * The hip ridge along the hip line: one straight piece over the lips of
 * the pitch's two bands from the ridges' meeting square, a second on the eave
 * band from the cell's corner to the eave's, each `h` over what it rests on
 * and sunk far enough that its edges meet the bands either side.
 */
function hipRidge(w: number, h: number): Solid[] {
  const R = VILLAGE_SLOPE_RISE, a = Math.atan2(R, 1), e = Math.atan(VILLAGE_EAVE.fall), { thick, lip } = VILLAGE_TILE;
  const tip = VILLAGE_EAVE_REACH.z, end = 0.5 + (thick + lip) * Math.sin(a);
  /** A piece from t0 to t1 along the hip line, its underside `lift` over the foot line, sunk `sink`. */
  const piece = (t0: number, t1: number, lift: number, sink: number) => {
    const p0: V3 = [t0, villageFoot(t0) + lift, t0], p1: V3 = [t1, villageFoot(t1) + lift, t1];
    const dir = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    return boxSolid([-w / 2, -sink, 0], [w / 2, h, dir.length()], lineFrame(p0, dir));
  };
  const pitch = cuts(piece(-0.5, end, (thick + lip) / Math.cos(a), 0.065), [[[0, 1, 0], VILLAGE_RIDGE_TOP], [[-1, 0, 0], 0.5], [[0, 0, -1], 0.5]]);
  const eave = cuts(piece(0.5, tip, thick / Math.cos(e), 0.03), [[[1, 0, 0], tip], [[0, 0, 1], tip]]);
  return [pitch, eave];
}

/**
 * Village hip: the panel's three bands on both planes, mitred on the hip line
 * under a hip ridge that runs from the ridges' meeting square down to the
 * eave corner; the eaves overhang on +Z and +X as the panel's does, and the
 * frieze and rafter tails turn the corner with them.
 */
export function hipRoofVillage(k: Kit) {
  const R = VILLAGE_SLOPE_RISE, { half, capHalf } = VILLAGE_RIDGE;
  const timber = k.m('post'), tiles = k.m('corrugated');
  villageCeiling(k);
  draw(k, k.m('skin'), [hipWedge(R)]);
  // Bands on the +Z plane, wide enough to reach the mitre over the corner overhang, and their twins on +X.
  const reach = VILLAGE_EAVE_REACH.z + 0.01;
  draw(k, tiles, withMirror(VILLAGE_BANDS.map(band => cut(prismSolid(band, -0.5, reach), [1, 0, -1], 0, false))));
  // Where the two neighbours' half ridges meet: a square of block and of cap.
  ridgeBox(k, [-0.5, -0.5 + half], [-0.5, -0.5 + half], [R_BASE, R_BLOCK]);
  ridgeBox(k, [-0.5, -0.5 + capHalf], [-0.5, -0.5 + capHalf], [R_BLOCK, VILLAGE_RIDGE_TOP]);
  draw(k, tiles, hipRidge(0.11, 0.05));
  // Frieze over both walls below, mitred at the corner.
  draw(k, timber, withMirror([cut(prismSolid(FRIEZE, -0.5, 0.7), [1, 0, -1], 0, false)]));
  if (k.low) return;
  // Rafter tails as the panel's, on both eaves, and a hip rafter's tail under the corner.
  const tails = RAFTERS.map(x => prismSolid(rafterTail(), x - RAFTER.wide / 2, x + RAFTER.wide / 2));
  const p0: V3 = [RAFTER.from, villageFoot(RAFTER.from), RAFTER.from], fall = new T.Vector3(1, -VILLAGE_EAVE.fall, 1);
  const hipTail = boxSolid([-0.03, -0.05, 0], [0.03, 0.002, (RAFTER.end - RAFTER.from) * fall.length()], lineFrame(p0, fall));
  draw(k, timber, [...withMirror(tails), hipTail]);
}

/** Village valley gutter: half its width across the diagonal, and how far its floor sinks below the roof's planes there. */
const VILLAGE_GUTTER = { half: 0.035, depth: 0.025, thick: 0.012 };

/**
 * Village valley: the pitch's two bands on both planes (its eave band lies
 * past the cell, where the runs it joins carry theirs), cut back from the
 * diagonal either side of an iron valley gutter sunk into the plaster, half
 * ridges along both ridges (−Z and −X) to meet the neighbours' back to back,
 * and no eave of its own. The bands lie on the plaster, so no gap under a lip
 * needs the gutter's iron run on under it.
 */
export function valleyRoofVillage(k: Kit) {
  const R = VILLAGE_SLOPE_RISE, g = VILLAGE_GUTTER, { half, capHalf } = VILLAGE_RIDGE;
  const tiles = k.m('corrugated');
  villageCeiling(k);
  draw(k, k.m('skin'), withMirror([valleyWedge(R, g.half, g.depth)]));
  draw(k, tiles, withMirror(VILLAGE_BANDS.slice(0, 2).map(band => cut(prismSolid(band, -0.5, 0.5), [-1, 0, 1], -g.half * Math.SQRT2))));
  // Half ridges on both ridges, as an L of block and an L of cap.
  ridgeBox(k, [-0.5, 0.5], [-0.5, -0.5 + half], [R_BASE, R_BLOCK]);
  ridgeBox(k, [-0.5, -0.5 + half], [-0.5 + half, 0.5], [R_BASE, R_BLOCK]);
  ridgeBox(k, [-0.5, 0.5], [-0.5, -0.5 + capHalf], [R_BLOCK, VILLAGE_RIDGE_TOP]);
  ridgeBox(k, [-0.5, -0.5 + capHalf], [-0.5 + capHalf, 0.5], [R_BLOCK, VILLAGE_RIDGE_TOP]);
  // The gutter stops under the ridges' blocks, whose ends would otherwise share the cell's end planes with it.
  draw(k, k.m('steel'), withMirror([gutterWing(R, g.half, g.depth, g.thick, [[[0, 1, 0], R_BASE - 0.001]])]));
}

// ------------------------------------------------------------ industrial

/** The industrial panel's pieces (parts/decks.ts slopeRoof) as solids on the +Z plane. */
function industrialPanel() {
  const R = INDUSTRIAL_SLOPE_RISE, a = Math.atan2(R, 1), L = Math.hypot(1, R), over = 0.1;
  const at = (lift: number, along: number): V3 => [0, R / 2 + Math.cos(a) * lift - Math.sin(a) * along, Math.sin(a) * lift + Math.cos(a) * along];
  const len = L + over;
  /** The roof sheet between x0 and x1. */
  const sheet = (x0: number, x1: number) => boxSolid([x0, -0.006, -len / 2], [x1, 0.006, len / 2], frame(at(0.008, over / 2), a));
  /** A standing seam centred on x. */
  const seam = (x: number) => boxSolid([x - 0.007, -0.017, -len / 2], [x + 0.007, 0.017, len / 2], frame(at(0.03, over / 2), a));
  /** The ridge flashing, tilted half the pitch over the high edge. */
  const fl = { y: R + 0.045, z: -0.47, half: 0.07, t: 0.01, tilt: a / 2 };
  const flashing = (x0: number, x1: number) => boxSolid([x0, -fl.t / 2, -fl.half], [x1, fl.t / 2, fl.half], frame([0, fl.y, fl.z], fl.tilt));
  /** The flashing's top is y = top0 − k·z (over the panel's own cell). */
  const k = Math.tan(fl.tilt), top0 = fl.y + fl.t / 2 / Math.cos(fl.tilt) + k * fl.z;
  /** How far a flashing reaches past its ridge into the cell behind (its lower back corner). */
  const reach = -0.5 - (fl.z - (fl.t / 2) * Math.sin(fl.tilt) - fl.half * Math.cos(fl.tilt));
  // Box gutter at the eave (the panel's U section) and where the sheet ends over it.
  const gutter = { t: 0.008, w: 0.13, d: 0.1, z: 0.53 + 0.065, y: -0.03 - over * Math.sin(a) };
  const sheetEnd = Math.sin(a) * 0.008 + Math.cos(a) * (L / 2 + over);
  return { R, a, sheet, seam, flashing, fl, k, top0, reach, gutter, sheetEnd };
}

/** The box gutter's three sides, run along x from x0 to x1 (the caller cuts the corner). */
function gutterSides(g: ReturnType<typeof industrialPanel>['gutter'], x0: number, x1: number, depth = g.d): Solid[] {
  const z0 = g.z - g.w / 2, z1 = g.z + g.w / 2, yb = g.y - depth;
  return [
    boxSolid([x0, yb, z0], [x1, yb + g.t, z1]),
    boxSolid([x0, yb + g.t, z0], [x1, g.y, z0 + g.t]),
    boxSolid([x0, yb + g.t, z1 - g.t], [x1, g.y + 0.01, z1]),
  ];
}

/**
 * Industrial hip: the panel's sheet and standing seams on both planes, mitred
 * on the hip line under a folded hip flashing; at the high corner the two
 * neighbours' ridge flashings meet as a small square cap. Fascia and box
 * gutter turn the eave corner with mitred ends.
 */
export function hipRoof(k: Kit) {
  const { b } = k;
  const p = industrialPanel(), { R } = p;
  slab(k);
  draw(k, k.m('skin'), [hipWedge(R)]);
  const mitre = (s: Solid, off = 0) => cut(s, [1, 0, -1], -off, off !== 0);
  // Sheet and seams on the +Z plane up to the hip line; the seams stop under the flashing's edge.
  draw(k, k.m('leaf'), withMirror([mitre(p.sheet(-0.5, 0.65)), ...[-0.375, -0.125, 0.125, 0.375].map(x => mitre(p.seam(x), 0.101))]));
  // The neighbours' ridge flashings end here: each runs on to the hip line, clipped to the cell.
  const ridge = cuts(p.flashing(-0.5, -0.3), [[[0, 0, -1], 0.5], [[1, 0, -1], 0]]);
  // Hip flashing: a folded cap straddling the hip line over the seams, its edges turned down to the sheet.
  const planeY = (off: number): [V3, number] => [[0, 1, R], R / 2 + off];
  const below = (off: number): [V3, number] => [[0, -1, -R], -(R / 2 + off)];
  const hipLine: [V3, number][] = [[[-1, 0, -1], 0.82], [[1, 0, 0], p.sheetEnd], [[0, 0, 1], p.sheetEnd], [[1, 0, -1], 0]];
  const wing = cuts(space(), [planeY(0.06), below(0.052), [[-1, 0, 1], 0.099], ...hipLine]);
  const lip = cuts(space(), [planeY(0.052), below(0.016), [[-1, 0, 1], 0.099], [[1, 0, -1], -0.092], ...hipLine]);
  draw(k, k.m('bright'), withMirror([ridge, wing, lip]));
  // Fascia on both eaves.
  b.box(k.m('post'), [1.025, 0.13, 0.025], { position: [0.0125, -0.07, 0.5125] }, small(k, 0.004));
  b.box(k.m('post'), [0.025, 0.13, 1.0], { position: [0.5125, -0.07, 0] }, small(k, 0.004));
  // Box gutter round the corner, mitred on the diagonal. Its rims are the panel's; its floor sits 5 mm higher
  // (above the y −0.16 wall tops it hangs beside, where the panel's dips 4 mm into the walls below the eave).
  draw(k, k.m('bright'), withMirror(gutterSides(p.gutter, -0.5, 0.8, p.gutter.d - 0.005).map(s => cut(s, [1, 0, -1], 0))));
  if (k.low) return;
  const g = p.gutter;
  for (const x of [-0.3, 0.3]) {
    b.box(k.m('steel'), [0.025, 0.006, g.w + 0.03], { position: [x, g.y + 0.012, g.z] }, 0);
    b.box(k.m('steel'), [g.w + 0.03, 0.006, 0.025], { position: [g.z, g.y + 0.012, x] }, 0);
  }
}

/** Industrial valley gutter: half its width across the diagonal, and its floor's sink below the planes there. */
const INDUSTRIAL_GUTTER = { half: 0.028, depth: 0.025, thick: 0.006 };

/**
 * Industrial valley: the panel's sheet and seams on both planes, cut back
 * either side of a sunk valley gutter; ridge flashings along both ridges.
 * The neighbour behind each ridge has its own flashing reaching 4 cm over it
 * with a drip down its back, so this one keeps 12 mm clear of the edge below
 * the flashings, laps a thin cover over the neighbour's flashing and folds
 * down to a flashing of the panel's own section; the two ridges' pieces meet
 * on the diagonal.
 */
export function valleyRoof(k: Kit) {
  const p = industrialPanel(), { R } = p, g = INDUSTRIAL_GUTTER;
  const back = 0.012, root2 = Math.SQRT2;
  slab(k);
  draw(k, k.m('skin'), withMirror([valleyWedge(R, g.half, g.depth, back)]));
  const sheet = cuts(p.sheet(-0.5, 0.5), [[[0, 0, -1], 0.5 - back], [[-1, 0, 1], -g.half * root2]]);
  const seams = [-0.375, -0.125, 0.125, 0.375].map(x => cuts(p.seam(x), [[[0, 0, -1], 0.41], [[-1, 0, 1], -g.half * root2 - 0.004]])).filter(s => s.length >= 4);
  draw(k, k.m('leaf'), withMirror([sheet, ...seams]));
  // Ridge (−Z side; mirrored for −X). The neighbour's flashing, turned half round about the ridge, has its
  // top over this cell at y = top0 + k·(z + 1), out to `reach`.
  const gap = 0.0005, thick = 0.0015, wl = p.reach, wf = p.reach + 0.0008, fold = 0.0015;
  const over = (dy: number): [V3, number] => [[0, 1, -p.k], p.top0 + p.k + dy];
  const under = (dy: number): [V3, number] => [[0, -1, p.k], -(p.top0 + p.k + dy)];
  const lapBand: [V3, number][] = [under(gap), over(gap + thick), [[0, 0, -1], 0.5], [[0, 0, 1], -0.5 + wl], [[1, 0, 0], 0.5]];
  // The lap splits where the other ridge's neighbour crosses it: past that, and this side's half of the corner square.
  const lapRun = cuts(space(), [...lapBand, [[-1, 0, 0], 0.5 - wl]]);
  const lapCorner = cuts(space(), [...lapBand, [[1, 0, -1], 0], [[-1, 0, 0], 0.5]]);
  // The panel's own flashing from the fold on, and the fold from its underside up to the lap.
  const ownTop = (dy: number): [V3, number] => [[0, -1, -p.k], -(p.top0 + dy)];
  const own = cuts(p.flashing(-0.5, 0.5), [[[0, 0, -1], 0.5 - wf - fold], [[-1, 0, 1], 0]]);
  const foldPiece = cuts(space(), [[[0, 0, -1], 0.5 - wf], [[0, 0, 1], -0.5 + wf + fold], over(gap + thick), ownTop(-p.fl.t / Math.cos(p.fl.tilt)), [[-1, 0, 1], 0], [[1, 0, 0], 0.5]]);
  const gutter = gutterWing(R, g.half, g.depth, g.thick, [[[0, 0, -1], 0.5 - back], [[-1, 0, 0], 0.5 - back]]);
  draw(k, k.m('bright'), withMirror([lapRun, lapCorner, own, foldPiece, gutter]));
}
