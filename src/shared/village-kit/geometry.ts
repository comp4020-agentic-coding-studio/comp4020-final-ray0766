import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { Kit } from '../../assets/claude-geometry/blueprint/parts/kit.ts';
import { WALL_H, WALL_T } from '../../assets/claude-geometry/blueprint/parts/kit.ts';
import { doorOpenWall, windowWall, KOSHI, WINDOW } from '../../assets/claude-geometry/blueprint/parts/village/walls.ts';
import { PAVING } from './style.ts';
import { extrudeZY, SLAB } from '../../assets/claude-geometry/blueprint/parts/kit.ts';
import { FRIEZE, RAFTER, RAFTERS, rafterTail, VILLAGE_EAVE, VILLAGE_RIDGE, VILLAGE_SLOPE_RISE, VILLAGE_TILE } from '../../assets/claude-geometry/blueprint/parts/village/decks.ts';

// Host parts for the R12 village kit. Same frames as the vendor kit: cell parts
// centred on the cell at the slab top, edge parts on the cell edge with x along
// it and +Z outside. Same grammar: plaster between timber, kawara tile, dressed
// stone over a dark joint bed. Every detail stands proud so the depth ink finds
// it; nothing is carried by texture. Each part keeps inside its envelope
// (src/shared/village-kit/parts.ts) and its collider matches what you can touch.

type P2 = [number, number];
const FACE = WALL_T / 2;

/** A closed prism over a star-shaped (x, z) outline seen from vertex 0, flat shaded. */
export function prism(outline: readonly P2[], y0: number, y1: number): BufferGeometry {
  const positions: number[] = [];
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  const centre = new Vector3(cx, (y0 + y1) / 2, cz);
  const tri = (a: Vector3, b: Vector3, c: Vector3, away?: Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-14) return;
    const ref = away ?? a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(centre);
    if (n.dot(ref) < 0) [b, c] = [c, b];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const top = outline.map(([x, z]) => new Vector3(x, y1, z)), bottom = outline.map(([x, z]) => new Vector3(x, y0, z));
  const up = new Vector3(0, 1, 0), down = new Vector3(0, -1, 0);
  for (let i = 1; i < outline.length - 1; i++) { tri(top[0], top[i], top[i + 1], up); tri(bottom[0], bottom[i], bottom[i + 1], down); }
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length, a = outline[i], b = outline[j];
    // Outward: perpendicular to the edge, away from the polygon's own side.
    const edge = new Vector3(b[0] - a[0], 0, b[1] - a[1]), normal = new Vector3(edge.z, 0, -edge.x);
    const mid = new Vector3((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2), probe = mid.clone().addScaledVector(normal.clone().normalize(), 1e-4);
    const outward = insidePolygon([probe.x, probe.z], outline) ? normal.negate() : normal;
    tri(bottom[i], bottom[j], top[j], outward); tri(bottom[i], top[j], top[i], outward);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
function insidePolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Points of an annular sector about centre c (angles in the x–z plane, atan2(z, x)). */
function sector(c: P2, r0: number, r1: number, a0: number, a1: number, steps: number): P2[] {
  const outer: P2[] = [], inner: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    outer.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]);
    if (r0 > 1e-6) inner.push([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]);
  }
  return r0 > 1e-6 ? [...outer, ...inner.reverse()] : [c, ...outer];
}
/** Sutherland–Hodgman clip of a convex polygon to the cell square |x|, |z| ≤ h. */
function clipSquare(poly: P2[], h = .5): P2[] {
  let out = poly;
  const planes: [(p: P2) => number][] = [[p => h - p[0]], [p => p[0] + h], [p => h - p[1]], [p => p[1] + h]];
  for (const [f] of planes) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    if (!out.length) return out;
  }
  return out;
}
const area = (poly: P2[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** Dark joint bed under paving: visible in every joint, 40 mm below the stone top. */
function jointBed(k: Kit, w = 1, d = 1, x = 0, z = 0) {
  k.b.box(k.m('steel'), [w, PAVING.bed, d], { position: [x, -.04 - PAVING.bed / 2, z] }, 0);
}
function flag(k: Kit, mat: 'pavers' | 'concrete', w: number, d: number, x: number, z: number, top = 0) {
  k.b.box(k.m(mat), [w - PAVING.joint, PAVING.stone, d - PAVING.joint], { position: [x, top - PAVING.stone / 2, z] }, .006);
}

// ---- Roads -------------------------------------------------------------

/** Lane flagstones: two staggered courses of cobble flags over the joint bed. */
export function roadPaving(k: Kit) {
  if (k.low) { k.b.box(k.m('pavers'), [1, PAVING.stone, 1], { position: [0, -PAVING.stone / 2, 0] }, 0); return; }
  jointBed(k);
  for (const [z, widths] of [[-.25, [.5, .5]], [.25, [.25, .5, .25]]] as [number, number[]][]) {
    let x = -.5;
    for (const w of widths) { flag(k, 'pavers', w, .5, x + w / 2, z); x += w; }
  }
}
/** Quarter-round outer corner: fan flags inside a stone kerb arc, grass beyond. */
export function roadPavingCurve(k: Kit) {
  const c: P2 = [.5, -.5], a0 = Math.PI / 2, a1 = Math.PI, steps = k.low ? 4 : 10;
  const inner = 1 - PAVING.edge;
  if (!k.low) jointBed(k);
  const rings: [number, number, number][] = k.low ? [[0, inner, 1]] : [[0, inner / 2, 2], [inner / 2, inner, 3]];
  for (const [r0, r1, parts] of rings) for (let i = 0; i < parts; i++) {
    const s0 = a0 + (a1 - a0) * i / parts, s1 = a0 + (a1 - a0) * (i + 1) / parts, pad = k.low ? 0 : PAVING.joint / 2;
    const poly = sector(c, r0 + (r0 ? pad : 0), r1 - pad, s0 + pad / Math.max(r1, .2), s1 - pad / Math.max(r1, .2), steps);
    k.b.geometry(k.m('pavers'), prism(poly, -PAVING.stone, 0));
  }
  const edgeParts = k.low ? 1 : 3;
  for (let i = 0; i < edgeParts; i++) {
    const s0 = a0 + (a1 - a0) * i / edgeParts, s1 = a0 + (a1 - a0) * (i + 1) / edgeParts, pad = k.low ? 0 : PAVING.joint / 2;
    k.b.geometry(k.m('concrete'), prism(sector(c, inner + pad, 1, s0 + pad, s1 - pad, steps), -PAVING.stone, .005));
  }
  // Grass in the cut-off corner, star-shaped from the cell corner.
  const grass: P2[] = [[-.5, .5]];
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; grass.push([c[0] + Math.cos(a) * 1.0, c[1] + Math.sin(a) * 1.0]); }
  k.b.geometry(k.m('membrane'), prism(grass, -.06, -.008));
}
/** Flush dressed-stone edge band centred on the cell edge. */
export function roadEdge(k: Kit) {
  const parts = k.low ? 1 : 2, len = 1 / parts;
  for (let i = 0; i < parts; i++) k.b.box(k.m('concrete'), [len - (k.low ? 0 : PAVING.joint), PAVING.stone + .005, PAVING.edge], { position: [-.5 + len * (i + .5), .005 - (PAVING.stone + .005) / 2, 0] }, k.low ? 0 : .006);
  if (!k.low) jointBed(k, 1, PAVING.edge + .02);
}
/** Low chamfered kerb centred on the cell edge: the main streets' kerb. */
export function roadKerb(k: Kit) {
  const { kerbWidth: w, kerbHeight: h, kerbChamfer: c } = PAVING, hw = w / 2;
  const outline: P2[] = [[-hw, -.08], [hw, -.08], [hw, h - c], [hw - c, h], [-hw + c, h], [-hw, h - c]];
  const parts = k.low ? 1 : 2, len = 1 / parts, gap = k.low ? 0 : PAVING.joint;
  for (let i = 0; i < parts; i++) k.b.extrude(k.m('concrete'), outline, len - gap, { position: [-.5 + len * i + gap / 2, 0, 0], rotation: [0, Math.PI / 2, 0] });
  if (!k.low) jointBed(k, 1, w + .02);
}
/** Door apron: three large dressed flags, a deeper stone than the lane. */
export function roadApron(k: Kit) {
  if (k.low) { k.b.box(k.m('concrete'), [1, .06, 1], { position: [0, -.03, 0] }, 0); return; }
  jointBed(k);
  flag(k, 'concrete', 1, .46, 0, -.27);
  flag(k, 'concrete', .5, .54, -.25, .23);
  flag(k, 'concrete', .5, .54, .25, .23);
}
/** Quarter of a fan pattern about the local (−x, −z) corner: four turned cells make a round. */
export function roadPlaza(k: Kit) {
  if (k.low) { k.b.box(k.m('pavers'), [1, PAVING.stone, 1], { position: [0, -PAVING.stone / 2, 0] }, 0); return; }
  jointBed(k);
  const c: P2 = [-.5, -.5], ring = PAVING.fanRing, pad = PAVING.joint / 2;
  for (let r = 0; r < 1.42; r += ring) {
    const r0 = r, r1 = Math.min(r + ring, 1.42), mid = (r0 + r1) / 2;
    const count = Math.max(1, Math.round(mid * Math.PI / 2 / .42));
    for (let i = 0; i < count; i++) {
      const a0 = i / count * Math.PI / 2, a1 = (i + 1) / count * Math.PI / 2;
      const poly = clipSquare(sector(c, r0 ? r0 + pad : 0, r1 - pad, a0 + pad / Math.max(mid, .2), a1 - pad / Math.max(mid, .2), 4));
      if (poly.length >= 3 && area(poly) > .002) k.b.geometry(k.m(r0 >= 1.05 ? 'concrete' : 'pavers'), prism(poly, -PAVING.stone, 0));
    }
  }
}

// ---- Garden boundaries --------------------------------------------------

/** Low courtyard wall: stone footing, plaster, timber rail and a kawara coping. */
export function gardenWall(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [1, .3, .24], { position: [0, .15, 0] }, k.low ? 0 : .01);
  b.box(k.m('skin'), [1, .55, .18], { position: [0, .575, 0] }, 0);
  b.box(k.m('post'), [1, .04, .2], { position: [0, .87, 0] }, 0);
  for (const s of [-1, 1]) b.box(k.m('corrugated'), [1, .03, .17], { position: [0, .925, s * .07], rotation: [s * .42, 0, 0] }, 0);
  b.box(k.m('corrugated'), [1, .05, .07], { position: [0, .97, 0] }, k.low ? 0 : .01);
}
/** Roofed garden gate: two posts, a tie beam and a small kawara roof; 0.72 m clear. */
export function gardenGate(k: Kit) {
  const { b } = k;
  for (const s of [-1, 1]) {
    b.box(k.m('post'), [.12, 1.82, .12], { position: [s * .44, .91, 0] }, k.low ? 0 : .008);
    b.box(k.m('concrete'), [.18, .08, .18], { position: [s * .44, .04, 0] }, 0);
  }
  b.box(k.m('post'), [1, .1, .12], { position: [0, 1.77, 0] }, 0);
  b.box(k.m('concrete'), [.76, .02, .2], { position: [0, .01, 0] }, 0);
  for (const s of [-1, 1]) b.box(k.m('corrugated'), [1, .035, .36], { position: [0, 1.93, s * .15], rotation: [s * .45, 0, 0] }, 0);
  b.box(k.m('corrugated'), [1, .06, .08], { position: [0, 2.0, 0] }, k.low ? 0 : .01);
  if (!k.low) for (const s of [-1, 1]) b.box(k.m('post'), [.04, .16, .3], { position: [s * .44, 1.88, 0] }, 0);
}
/** Bamboo-slat fence between two posts with a timber cap. */
export function gardenFence(k: Kit) {
  const { b } = k;
  for (const s of [-1, 1]) b.box(k.m('post'), [.06, 1.12, .06], { position: [s * .47, .56, 0] }, 0);
  const slats = k.low ? 1 : 10;
  if (k.low) b.box(k.m('tread'), [.88, 1.0, .025], { position: [0, .52, 0] }, 0);
  else for (let i = 0; i < slats; i++) b.box(k.m('tread'), [.082, 1.0, .025], { position: [-.44 + .088 * (i + .5), .52, 0] }, 0);
  for (const y of [.25, .75]) b.box(k.m('post'), [.94, .035, .025], { position: [0, y, .025] }, 0);
  b.box(k.m('post'), [1, .04, .07], { position: [0, 1.1, 0] }, 0);
}
/** Clipped hedge on the edge line. */
export function gardenHedge(k: Kit) {
  k.b.box(k.m('membrane'), [1, .52, .46], { position: [0, .26, 0] }, k.low ? 0 : .06);
  k.b.box(k.m('membrane'), [.96, .4, .4], { position: [0, .68, 0] }, k.low ? 0 : .1);
}
/** Lawn deck: a grass slab that carries garden walls, trees and benches. */
export function gardenLawn(k: Kit) {
  k.b.box(k.m('membrane'), [1, .06, 1], { position: [0, -.03, 0] }, 0);
  k.b.box(k.m('post'), [1, .1, 1], { position: [0, -.11, 0] }, 0);
}

// ---- Facades -------------------------------------------------------------

/** A single-pitch hood: kawara board on two brackets over an opening, within the edge. */
function shedHood(k: Kit, width: number, depth: number, high: number, low: number, y0 = 1.72) {
  const { b } = k, run = Math.hypot(depth, high - low), pitch = Math.atan2(high - low, depth);
  b.box(k.m('corrugated'), [width, .035, run], { position: [0, (high + low) / 2, FACE + depth / 2], rotation: [pitch, 0, 0] }, 0);
  b.box(k.m('post'), [width, .08, .03], { position: [0, low - .035, FACE + depth - .01] }, 0);
  b.box(k.m('post'), [width, .05, .05], { position: [0, high - .04, FACE + .025] }, 0);
  if (k.low) return;
  // Tile ribs down the slope.
  for (let i = 0; i < 5; i++) b.box(k.m('corrugated'), [.022, .02, run], { position: [-width / 2 + width * (i + .5) / 5, (high + low) / 2 + .025, FACE + depth / 2], rotation: [pitch, 0, 0] }, 0);
  for (const s of [-1, 1]) {
    const x = s * (width / 2 - .06), za = FACE + .02, ya = y0, zb = FACE + depth * .62, yb = low + (high - low) * .38 - .05;
    const len = Math.hypot(zb - za, yb - ya), tilt = Math.atan2(zb - za, yb - ya);
    b.box(k.m('post'), [.035, len, .035], { position: [x, (ya + yb) / 2, (za + zb) / 2], rotation: [tilt, 0, 0] }, 0);
  }
}
/** Entrance with a hood: the lattice door slid open under a tiled shed hood. */
export function hoodedDoor(k: Kit) {
  doorOpenWall(k);
  shedHood(k, .96, .6, 2.18, 2.04);
}
/** Open shop front: a timber portal the width of the bay, noren and a deep awning. */
export function shopFront(k: Kit) {
  const { b } = k, depth = WALL_T + .03;
  for (const s of [-1, 1]) b.box(k.m('post'), [.08, WALL_H, depth], { position: [s * .46, WALL_H / 2, 0] }, 0);
  b.box(k.m('post'), [.84, .18, depth], { position: [0, 1.95, 0] }, 0);
  b.box(k.m('skin'), [.5, .1, .012], { position: [0, 1.95, depth / 2 + .006] }, 0);
  b.box(k.m('concrete'), [.84, .02, depth], { position: [0, .01, 0] }, 0);
  // Noren: three cloth panels from the head, a pale crest on the middle one.
  // Above head height (the 1.6 m courier walks under it).
  const panels = 3, pw = .84 / panels, top = 1.86, drop = .22;
  for (let i = 0; i < panels; i++) b.box(k.m('leaf'), [pw - .016, drop, .008], { position: [-.42 + pw * (i + .5), top - drop / 2, depth / 2 + .02] }, 0);
  if (!k.low) b.box(k.m('marking'), [.12, .12, .003], { position: [0, top - drop * .45, depth / 2 + .026] }, 0);
  shedHood(k, .98, .78, 2.18, 2.0);
}
/** Lattice window with a flower box under the sill and a small hood above. */
export function windowBox(k: Kit) {
  windowWall(k);
  const { b } = k, z = FACE + .13 + .09, y = KOSHI - .11;
  b.box(k.m('post'), [.72, .16, .18], { position: [0, y, z] }, k.low ? 0 : .008);
  if (!k.low) {
    for (const s of [-1, 1]) b.box(k.m('post'), [.03, .16, .14], { position: [s * .3, y - .14, FACE + .07] }, 0);
    for (const [x, hgt] of [[-.22, .12], [0, .15], [.22, .11]] as [number, number][]) {
      b.box(k.m('membrane'), [.2, hgt, .14], { position: [x, y + .08 + hgt / 2, z] }, .03);
      b.box(k.m('hazard'), [.06, .05, .06], { position: [x + .03, y + .08 + hgt + .02, z - .02] }, 0);
    }
  }
  const head = WINDOW.head;
  b.box(k.m('corrugated'), [.86, .03, .3], { position: [0, head + .13, FACE + .15], rotation: [.35, 0, 0] }, 0);
}

// ---- Long gable roof (two cells, eave cell first, ridge one cell behind) --


/** Pitch run of the long panel: from the eave cell's outer edge (z 0.5) to the ridge (z −1.5). */
export const LONG_ROOF = { back: -1.5, rise: 2 * VILLAGE_SLOPE_RISE } as const;
/** Foot of the tile bands over the two-cell run: the vendor pitch continued one more cell, then the same eave. */
export function longFoot(z: number): number {
  return z <= .5 ? VILLAGE_SLOPE_RISE * (.5 - z) : -VILLAGE_EAVE.fall * (z - .5);
}
type ZY = [number, number];
const LONG_BANDS: ZY[][] = (() => {
  const a = Math.atan2(VILLAGE_SLOPE_RISE, 1), e = Math.atan(VILLAGE_EAVE.fall), { thick, lip } = VILLAGE_TILE;
  const up = (p: ZY, n: number, d: number): ZY => [p[0] + d * Math.sin(n), p[1] + d * Math.cos(n)];
  const at = (z: number): ZY => [z, longFoot(z)];
  const stops = [-1.5, -1, -.5, 0, .5].map(at), tip = at(.5 + VILLAGE_EAVE.reach), bands: ZY[][] = [];
  for (let i = 0; i < stops.length - 1; i++) bands.push([stops[i], stops[i + 1], up(stops[i + 1], a, thick + lip), up(stops[i], a, thick)]);
  bands.push([stops[4], tip, up(tip, e, thick), up(stops[4], e, thick)]);
  return bands;
})();
/** Kawara gable panel over two cells: ceiling, plaster gable wedge, five bands, half the ridge, frieze and rafter tails. */
export function longRoof(k: Kit) {
  const { b } = k, R = LONG_ROOF.rise, timber = k.m('post'), tiles = k.m('corrugated');
  b.box(timber, [1, SLAB - .03, 2], { position: [0, -SLAB / 2 - .015, -.5] }, 0);
  extrudeZY(k, k.m('skin'), [[.5, -.03], [-1.5, -.03], [-1.5, R], [.5, 0]], -.5, .5);
  for (const band of LONG_BANDS) extrudeZY(k, tiles, band, -.5, .5);
  const { half, block, capHalf, cap } = VILLAGE_RIDGE;
  b.box(tiles, [1, block, half], { position: [0, R + block / 2, -1.5 + half / 2] }, 0);
  b.box(tiles, [1, cap, capHalf], { position: [0, R + block + cap / 2, -1.5 + capHalf / 2] }, 0);
  extrudeZY(k, timber, FRIEZE, -.5, .5);
  if (k.low) return;
  for (const x of RAFTERS) extrudeZY(k, timber, rafterTail(), x - RAFTER.wide / 2, x + RAFTER.wide / 2);
}
/** Gable end of the long panel: bands run on past the end, a barge board under them and a ridge-end block. */
function longVerge(k: Kit, side: -1 | 1) {
  const a = Math.atan2(VILLAGE_SLOPE_RISE, 1), e = Math.atan(VILLAGE_EAVE.fall), timber = k.m('post'), tiles = k.m('corrugated');
  const span = (x0: number, x1: number): [number, number] => side > 0 ? [x0, x1] : [-x1, -x0];
  for (const band of LONG_BANDS) extrudeZY(k, tiles, band, ...span(.5, .56));
  const depth = .1, tip = .5 + VILLAGE_EAVE.reach, dp = depth / Math.cos(a), de = depth / Math.cos(e);
  const zk = .5 - (dp - de) / (VILLAGE_SLOPE_RISE - VILLAGE_EAVE.fall), yk = longFoot(zk) - dp;
  const lower = (z: number, d: number) => Math.max(longFoot(z) - d, z <= .61 ? -.16 : -Infinity);
  extrudeZY(k, timber, [[-1.5, LONG_ROOF.rise], [.5, 0], [tip, longFoot(tip)], [tip, lower(tip, de)], [zk, yk], [-1.5, lower(-1.5, dp)]], ...span(.501, .54));
  const { half, block, cap } = VILLAGE_RIDGE, R = LONG_ROOF.rise;
  extrudeZY(k, tiles, [[-1.5, R], [-1.5 + half * 1.3, R], [-1.5 + half, R + block + cap + .02], [-1.5, R + block + cap + .02]], ...span(.5, .58));
  if (k.low) return;
  const apex = R - dp;
  extrudeZY(k, timber, [[-1.5, apex + .025], [-1.41, apex - .01], [-1.41, apex - .1], [-1.5, apex - .15]], ...span(.525, .545));
}
export const longVergeLeft = (k: Kit) => longVerge(k, -1);
export const longVergeRight = (k: Kit) => longVerge(k, 1);

// ---- Teleport portal (five cells along local +X, ring centred on the middle cell) --

/** The station's wormhole ring, in local metres: centre x = GATE.x, just behind z = 0, top above 5 m. */
export const GATE = { x: 2, centreY: 2.75, outer: 2.35, inner: 1.88, depth: .4, daisTop: .22, chevron: 2.47 } as const;
/** Ring band, rim lines, nine lit chevrons, a swirling membrane on a stone dais. */
export function stationGate(k: Kit) {
  const { b } = k, g = GATE, segments = k.low ? 16 : k.fine ? 40 : 24, mid = (g.outer + g.inner) / 2, band = g.outer - g.inner;
  const at = (a: number, r: number, y = g.centreY): [number, number] => [g.x + Math.cos(a) * r, y + Math.sin(a) * r];
  // Dais, front step and the cradle the ring stands in.
  b.box(k.m('concrete'), [4.9, g.daisTop, .8], { position: [g.x, g.daisTop / 2, -.1] }, k.low ? 0 : .03);
  b.box(k.m('concrete'), [3, .11, .2], { position: [g.x, .055, .4] }, k.low ? 0 : .015);
  b.box(k.m('steel'), [1.8, .36, .5], { position: [g.x, g.daisTop + .18, 0] }, k.low ? 0 : .02);
  for (let i = 0; i < segments; i++) {
    const a = (i + .5) / segments * Math.PI * 2, [x, y] = at(a, mid);
    b.box(k.m('steel'), [2 * Math.PI * mid / segments + .02, band, g.depth], { position: [x, y, 0], rotation: [0, 0, a + Math.PI / 2] }, 0);
    if (k.low) continue;
    const [ox, oy] = at(a, g.outer - .06), [ix, iy] = at(a, g.inner + .025);
    if (k.fine) b.box(k.m('concrete'), [2 * Math.PI * (g.outer - .06) / segments + .02, .12, g.depth + .06], { position: [ox, oy, 0], rotation: [0, 0, a + Math.PI / 2] }, 0);
    b.box(k.m('marking'), [2 * Math.PI * (g.inner + .025) / segments + .01, .05, g.depth + .04], { position: [ix, iy, 0], rotation: [0, 0, a + Math.PI / 2] }, 0);
  }
  // Nine chevrons, one at the top: a stone housing with a lamp on both faces.
  for (let c = 0; c < 9; c++) {
    const a = Math.PI / 2 + c * Math.PI * 2 / 9, [x, y] = at(a, g.chevron - .17);
    b.box(k.m('concrete'), [.42, .34, .52], { position: [x, y, 0], rotation: [0, 0, a + Math.PI / 2] }, k.low ? 0 : .02);
    // At low detail only the top chevron keeps its lamps.
    if (!k.low || c === 0) for (const z of [.255, -.255]) b.box(k.m('lamp'), [.24, .16, .02], { position: [x, y, z], rotation: [0, 0, a + Math.PI / 2] }, 0);
  }
  // The membrane: a teal disc, white spiral arms and a glowing core, both faces.
  const fan = (radius: number, z: number, sides: number) => {
    const pos: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
      for (const f of [1, -1]) {
        const p0 = [g.x + Math.cos(a0) * radius, g.centreY + Math.sin(a0) * radius, z * f], p1 = [g.x + Math.cos(a1) * radius, g.centreY + Math.sin(a1) * radius, z * f];
        pos.push(...(f > 0 ? [g.x, g.centreY, z, ...p0, ...p1] : [g.x, g.centreY, -z, ...p1, ...p0]));
      }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(pos, 3)); geometry.computeVertexNormals(); return geometry;
  };
  b.geometry(k.m('leaf'), fan(g.inner + .01, .006, k.low ? 16 : 32));
  b.geometry(k.m('lamp'), fan(.42, .014, k.low ? 8 : 16));
  if (!k.low) {
    const arms = 3, steps = k.fine ? 28 : 16, pos: number[] = [];
    for (let arm = 0; arm < arms; arm++) for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, w0 = .05 + .13 * t0, w1 = .05 + .13 * t1;
      const point = (t: number, w: number) => { const r = .45 + t * (g.inner - .55), a = arm * Math.PI * 2 / arms + t * Math.PI * 1.6; return [g.x + Math.cos(a) * (r + w), g.centreY + Math.sin(a) * (r + w), g.x + Math.cos(a) * (r - w), g.centreY + Math.sin(a) * (r - w)]; };
      const [ax, ay, bx, by] = point(t0, w0), [cx, cy, dx, dy] = point(t1, w1);
      for (const z of [.01, -.01]) {
        const quad = [ax, ay, z, bx, by, z, cx, cy, z, bx, by, z, dx, dy, z, cx, cy, z];
        // As listed the quad faces −Z; turn the +Z copy so each face of the membrane shows its arms.
        if (z > 0) for (let q = 0; q < quad.length; q += 9) { const [x1, y1, z1] = quad.slice(q + 3, q + 6); quad.splice(q + 3, 3, ...quad.slice(q + 6, q + 9)); quad.splice(q + 6, 3, x1, y1, z1); }
        pos.push(...quad);
      }
    }
    const spiral = new BufferGeometry(); spiral.setAttribute('position', new Float32BufferAttribute(pos, 3)); spiral.computeVertexNormals();
    b.geometry(k.m('marking'), spiral);
  }
  b.emitter('pad', [g.x, g.daisTop + .05, .6], [0, 1, 0]);
}
