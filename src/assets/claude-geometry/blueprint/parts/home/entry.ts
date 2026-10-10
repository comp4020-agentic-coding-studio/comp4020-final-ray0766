import * as T from 'three';
import type { Kit } from '../kit.ts';

// Entrance steps and ramp: the way from a ground-floor deck down to the
// ground. A structure is seated with its slab top at the highest ground under
// its footprint, so its edge can stand anywhere from 0 to MAX_FOUNDATION_DEPTH
// (0.6 m) above the ground outside. These parts always reach down 0.6 m in
// risers the step height allows; where the ground is higher their lower treads
// are under it. Cell parts on level 0 only: origin at the top cell's centre,
// the top edge at local −Z joins the floor behind, they descend towards +Z.
//
// The industrial look draws precast steps and a boarded ramp with rounded
// edges; the village look draws its own twins (entryStepsVillage,
// entryRampVillage): square stone steps, and a ramp of three wide boards and
// three cleats, between plain stone cheeks, on the same treads, slope and
// cheeks, so one set of colliders fits both, and on the same constants
// below. Nothing rises above the floor (y 0), so a door's threshold and a
// corner post's foot on the top edge, and walls or rails on the decks
// beside, stand clear of them. The solid bodies reach down to ENTRY_DROP +
// ENTRY_EMBED across the whole cell width.

/** Total drop of the entrance parts: MAX_FOUNDATION_DEPTH (core/ground.ts). */
export const ENTRY_DROP = 0.6;
/** How far their solid bodies reach below the bottom tread, as the foundation plinth does (PLINTH_EMBED). */
export const ENTRY_EMBED = 0.3;

const BOTTOM = -(ENTRY_DROP + ENTRY_EMBED);
/** Outer face of the cheeks (the cell's side edges) and their coping's inner edge: treads and boards run between. */
const OUT = 0.5, CHEEK = 0.4;

/** A point of a cross-section: where it is, its normal where the surface is rounded, and whether it rises and falls with the path. */
interface Pt { p: [number, number]; n?: [number, number]; follow?: boolean }

const pt = (u: number, v: number, follow = false): Pt => ({ p: [u, v], follow });

/**
 * Points round a quarter arc about (cu, cv) from angle a0 to a1, each with its
 * radial normal, so the rounding shades smooth and draws no crease line. With
 * no segments, the hard corner the arc would round.
 */
function arc(cu: number, cv: number, r: number, a0: number, a1: number, segments: number, follow = false): Pt[] {
  if (segments <= 0) return [pt(cu + r * (Math.cos(a0) + Math.cos(a1)), cv + r * (Math.sin(a0) + Math.sin(a1)), follow)];
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / segments, c = Math.cos(a), s = Math.sin(a);
    return { p: [cu + r * c, cv + r * s], n: [c, s], follow };
  });
}

/**
 * A prism of `section` (u, v) carried along w through `stations` ([w, rise]):
 * points that follow add the station's rise to v, the rest stay where they
 * are, so a top can slope while its bed stays level, and every end is a plumb
 * cut. Rounded points share one normal between their two faces; the others
 * are hard corners. A face from a following to a fixed point must be plumb
 * (one u), or it would twist.
 */
function loft(section: Pt[], stations: [number, number][]): T.BufferGeometry {
  const area = section.reduce((a, q, i) => { const r = section[(i + 1) % section.length].p; return a + q.p[0] * r[1] - r[0] * q.p[1]; }, 0);
  const s = area < 0 ? [...section].reverse() : section;
  const pos: number[] = [], nor: number[] = [];
  const put = (v: T.Vector3, n: T.Vector3) => { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); };
  const at = (q: Pt, [w, rise]: [number, number]) => new T.Vector3(q.p[0], q.p[1] + (q.follow ? rise : 0), w);
  for (let j = 0; j + 1 < stations.length; j++) {
    const a = stations[j], b = stations[j + 1], m = (b[1] - a[1]) / (b[0] - a[0]);
    const smooth = (q: Pt, face: T.Vector3) => (q.n ? new T.Vector3(q.n[0], q.n[1], q.follow ? -m * q.n[1] : 0).normalize() : face);
    for (let i = 0; i < s.length; i++) {
      const q0 = s[i], q1 = s[(i + 1) % s.length];
      const A0 = at(q0, a), A1 = at(q1, a), B1 = at(q1, b), B0 = at(q0, b);
      const face = new T.Vector3().crossVectors(B1.clone().sub(A0), B0.clone().sub(A1)).normalize();
      const n0 = smooth(q0, face), n1 = smooth(q1, face);
      put(A0, n0); put(A1, n1); put(B1, n1);
      put(A0, n0); put(B1, n1); put(B0, n0);
    }
  }
  for (const [st, dir] of [[stations[0], -1], [stations[stations.length - 1], 1]] as const) {
    const ring = s.map(q => at(q, st)), n = new T.Vector3(0, 0, dir);
    for (const [i0, i1, i2] of T.ShapeUtils.triangulateShape(ring.map(v => new T.Vector2(v.x, v.y)), [])) {
      const a = ring[i0], b = ring[i1], c = ring[i2];
      const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
      for (const v of ccw === dir > 0 ? [a, b, c] : [a, c, b]) put(v, n);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}

/** A section drawn in the side elevation ([z, y]) carried across x from x0 to x1: step slabs, bodies. */
function acrossX(k: Kit, material: T.Material, section: Pt[], x0: number, x1: number) {
  // Rotating +90° about Y sends the loft's w to +X and its u to −Z, so u = −z.
  const flipped = section.map(q => ({ ...q, p: [-q.p[0], q.p[1]] as [number, number], n: q.n && [-q.n[0], q.n[1]] as [number, number] }));
  k.b.geometry(material, loft(flipped, [[x0, 0], [x1, 0]]), { rotation: [0, Math.PI / 2, 0] });
}

/** A section drawn across the part ([x, y]) carried down the fall along z: cheeks and boards. */
function alongZ(k: Kit, material: T.Material, section: Pt[], stations: [number, number][]) {
  k.b.geometry(material, loft(section, stations));
}

/**
 * Stone cheek on the +X side (−X mirrored): a wall from the bottom up to a
 * coping whose top runs at rise 0 of the path, rounded on both edges and proud
 * of the wall on the inside by `lip` over a drip edge (no lip: a rounded upstand).
 * Square: no rounding at all, a plain wall cut flat along the path.
 */
function cheek(k: Kit, side: number, stations: [number, number][], opts: { lip: number; coping: number; round: number; square?: boolean }) {
  const seg = k.low || opts.square ? 0 : 3, f = true, r = opts.round;
  const wall = CHEEK + opts.lip;
  const s: Pt[] = [
    pt(wall, BOTTOM), pt(OUT, BOTTOM),
    ...arc(OUT - r, -r, r, 0, Math.PI / 2, seg, f),
    ...arc(CHEEK + r, -r, r, Math.PI / 2, Math.PI, seg, f),
  ];
  if (opts.lip > 0) s.push(...arc(CHEEK + 0.01, -opts.coping + 0.01, 0.01, Math.PI, 1.5 * Math.PI, k.low ? 0 : 1, f), pt(wall, -opts.coping, f));
  const mirrored = s.map(q => ({ ...q, p: [side * q.p[0], q.p[1]] as [number, number], n: q.n && [side * q.n[0], q.n[1]] as [number, number] }));
  alongZ(k, k.m('concrete'), mirrored, stations);
}

/** Treads of the entrance steps: rise, going, slab thickness, and how far each slab's nosing stands over the riser below. */
const STEP = { rise: 0.15, going: 0.25, slab: 0.05, set: 0.02 } as const;

/**
 * The steps' stone: one mass under the slabs down to the bottom, its risers
 * set back under the nosings, and four tread slabs, `inner` either side of
 * the centre line; `nose` and `under` are the segments rounding each slab's
 * nosing and the edge beneath it (none: square).
 */
function stepStones(k: Kit, inner: number, nose: number, under: number) {
  const stone = k.m('concrete');
  const { rise, going, slab, set } = STEP;
  const top = (i: number) => -rise * (i + 1), front = (i: number) => -0.5 + going * (i + 1);
  const body: Pt[] = [pt(-0.5, BOTTOM), pt(0.5, BOTTOM), pt(0.5, top(3) - slab)];
  for (let i = 2; i >= 0; i--) body.push(pt(front(i) - set, top(i + 1) - slab), pt(front(i) - set, top(i) - slab));
  body.push(pt(-0.5, top(0) - slab));
  acrossX(k, stone, body, -inner, inner);
  for (let i = 0; i < 4; i++) {
    const y = top(i), z1 = front(i), z0 = i === 0 ? -0.5 : front(i - 1) - set, last = i === 3;
    const s: Pt[] = [pt(z0, y - slab)];
    // The bottom tread's front is the body's: it stands on the ground, nothing under it to shade.
    s.push(...(last ? [pt(z1, y - slab)] : arc(z1 - 0.012, y - slab + 0.012, 0.012, -Math.PI / 2, 0, under)));
    s.push(...arc(z1 - 0.03, y - 0.03, 0.03, 0, Math.PI / 2, nose), pt(z0, y));
    acrossX(k, stone, s, -inner, inner);
  }
}

/** The cheeks' copings run 0.1 above the steps' nosing line (y = −0.6 z − 0.3), never above the floor: the path they follow. */
const STEP_COPING: [number, number][] = (() => {
  const coping = (z: number) => Math.min(0, -0.6 * z - 0.3 + 0.1);
  const level = (0.1 - 0.3) / 0.6;
  return [[-0.5, 0], [level, 0], [0.5, coping(0.5)]];
})();

/**
 * Four stone steps between stone cheeks. Treads at −0.15, −0.30, −0.45 and
 * −0.60 on 0.25 m goings, the first riser being the floor slab's own edge at
 * the top: each tread is a slab 50 mm thick, flat and level, with a rounded
 * nosing 20 mm proud of the riser below it, so every step casts a shadow line.
 * The cheeks' copings run 0.1 m above the nosing line, level with the floor
 * where that line would rise above it.
 */
export function entrySteps(k: Kit) {
  const lip = 0.015;
  // Under each slab's bed one stone mass reaches down to the bottom, its risers set back under the nosings.
  stepStones(k, CHEEK + lip, k.low ? 0 : k.fine ? 4 : 3, k.low ? 0 : 1);
  for (const side of [-1, 1]) cheek(k, side, STEP_COPING, { lip, coping: 0.06, round: 0.025 });
}

/**
 * Village twin: the same treads and cheeks cut square, as dressed stone
 * steps are: square nosings 20 mm over the riser below, which the
 * lines find as a crease and a shadow line at every step, and plain cheeks,
 * a wall cut flat along the same coping line with no lip.
 */
export function entryStepsVillage(k: Kit) {
  stepStones(k, CHEEK, 0, 0);
  for (const side of [-1, 1]) cheek(k, side, STEP_COPING, { lip: 0, coping: 0, round: 0, square: true });
}

/**
 * Ramp: one 0.3 in 1 fall (16.7°) from the floor at its top edge to −0.60 at
 * its foot, two cells long. Five boards run down the fall, as the floor's
 * boards run, on a stone body between stone cheeks that stand 50 mm above the
 * boards (level with the floor at the top, where the boards are still within
 * 50 mm of it). Timber cleats, 18 mm, across the boards every 0.25 m give
 * feet a hold; the first 0.35 m below the top is left smooth for a door.
 */
export function entryRamp(k: Kit) {
  const { b } = k;
  const fall = ENTRY_DROP / 2, board = 0.03, upstand = 0.05, cleat = 0.018;
  const surface = (z: number) => -fall * (z + 0.5), foot = surface(1.5);
  acrossX(k, k.m('concrete'), [pt(-0.5, BOTTOM), pt(1.5, BOTTOM), pt(1.5, foot - board), pt(-0.5, -board)], -CHEEK, CHEEK);
  const level = -0.5 + upstand / fall;
  for (const side of [-1, 1]) cheek(k, side, [[-0.5, 0], [level, 0], [1.5, foot + upstand]], { lip: 0, coping: 0, round: 0.025 });
  // Boards: their tops are the walking surface, from y 0 at the top edge to the foot. On the
  // floor's 0.2 m module, so a plank floor's boards run on down the ramp; the cheeks cut the outer two.
  const edges = k.low ? [-CHEEK, CHEEK] : [-CHEEK, -0.3, -0.1, 0.1, 0.3, CHEEK];
  const gap = 0.006, r = k.fine ? 0.008 : 0, seg = k.fine ? 2 : 0;
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i] + (i > 0 ? gap / 2 : 0), x1 = edges[i + 1] - (i + 2 < edges.length ? gap / 2 : 0);
    const s: Pt[] = [pt(x0, -board, true), pt(x1, -board, true), ...arc(x1 - r, -r, r, 0, Math.PI / 2, seg, true), ...arc(x0 + r, -r, r, Math.PI / 2, Math.PI, seg, true)];
    alongZ(k, k.m('tread'), s, [[-0.5, 0], [1.5, foot]]);
  }
  // Cleats square to the fall, lying on the boards.
  const angle = Math.atan(fall), zs = k.low ? [0.125, 0.625, 1.125] : [-0.125, 0.125, 0.375, 0.625, 0.875, 1.125, 1.375];
  for (const z of zs) {
    b.within({ position: [0, surface(z), z], rotation: [angle, 0, 0] }, () => b.box(k.m('post'), [2 * CHEEK - 0.03, cleat, 0.04], { position: [0, cleat / 2, 0] }, 0.006));
  }
}

/**
 * Village twin: the same 0.3 in 1 fall between the same cheeks, cut square
 * (plain stone cheeks, no lip, no rounding), boarded in three wide boards on
 * the plank floor's third-of-a-metre module, so a floor's board joints run on
 * down the ramp (one sheet at low), and three square timber cleats where the
 * industrial ramp has its low-LOD three: few lines, each one a board joint
 * or a cleat.
 */
export function entryRampVillage(k: Kit) {
  const { b } = k;
  const fall = ENTRY_DROP / 2, board = 0.03, upstand = 0.05, cleat = 0.018, gap = 0.006;
  const surface = (z: number) => -fall * (z + 0.5), foot = surface(1.5);
  acrossX(k, k.m('concrete'), [pt(-0.5, BOTTOM), pt(1.5, BOTTOM), pt(1.5, foot - board), pt(-0.5, -board)], -CHEEK, CHEEK);
  const level = -0.5 + upstand / fall;
  for (const side of [-1, 1]) cheek(k, side, [[-0.5, 0], [level, 0], [1.5, foot + upstand]], { lip: 0, coping: 0, round: 0, square: true });
  const edges = k.low ? [-CHEEK, CHEEK] : [-CHEEK, -1 / 6, 1 / 6, CHEEK];
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i] + (i > 0 ? gap / 2 : 0), x1 = edges[i + 1] - (i + 2 < edges.length ? gap / 2 : 0);
    alongZ(k, k.m('tread'), [pt(x0, -board, true), pt(x1, -board, true), pt(x1, 0, true), pt(x0, 0, true)], [[-0.5, 0], [1.5, foot]]);
  }
  const angle = Math.atan(fall);
  for (const z of [0.125, 0.625, 1.125]) {
    b.within({ position: [0, surface(z), z], rotation: [angle, 0, 0] }, () => b.box(k.m('post'), [2 * CHEEK - 0.03, cleat, 0.04], { position: [0, cleat / 2, 0] }, 0));
  }
}
