import * as T from 'three';
import { SLAB, small } from '../kit.ts';
import type { Kit } from '../kit.ts';
import type { Placement } from '../../../style/geometry.ts';

// Street joins: the lane pieces that turn a straight roadway into corners,
// T junctions and crossings, and the kerb corner that closes two kerb runs
// meeting at a grid vertex. Cell parts: origin at the cell centre on the
// walking surface (y 0), +Z the part's front.

/**
 * Lane with no marking: the outer cells of a bend or junction, and one-cell
 * alleys. One slab, top at y 0 and down to the slab's underside, the same
 * surface as the roadway (parts/village/street.ts streetRoad) so it meets it
 * flush on every side.
 */
export function roadPlain(k: Kit) {
  k.b.box(k.m('asphalt'), [1.0, SLAB, 1.0], { position: [0, -SLAB / 2, 0] }, 0);
}

/**
 * Lane with the roadway's half dash on two neighbouring edges (+Z and +X): the
 * inside cell of a bend, T or crossing. Each dash is the roadway's own (0.5 m
 * by 50 mm at the edge's middle, 3 mm of paint), so the cell across either
 * edge completes it to the 0.1 m centre line, and the line turns round the
 * vertex between them with the run's 0.5 m gap.
 */
export function roadCorner(k: Kit) {
  roadPlain(k);
  k.b.box(k.m('marking'), [0.5, 0.003, 0.05], { position: [0, 0.0015, 0.475] }, 0);
  k.b.box(k.m('marking'), [0.05, 0.003, 0.5], { position: [0.475, 0.0015, 0] }, 0);
}

// ------------------------------------------------------------ kerb corner

/** A kerb section as [out, y] pairs, counter-clockwise, `out` across the kerb towards the road. */
type Section = [number, number][];

/** parts/street.ts streetKerb's section: 0.15 m wide, 0.14 m up, chamfer on the road side. */
const INDUSTRIAL_KERB: Section = [[-0.075, -0.05], [0.075, -0.05], [0.075, 0.11], [0.045, 0.14], [-0.075, 0.14]];
/** parts/village/street.ts streetKerb's section: the same box with both top edges eased. */
const VILLAGE_KERB: Section = [[-0.075, -0.05], [0.075, -0.05], [0.075, 0.115], [0.05, 0.14], [-0.05, 0.14], [-0.075, 0.115]];
/** The industrial kerb's steel nosing: a 12 mm square bar turned 45°, along the chamfer. */
const NOSING: Section = (() => {
  const d = 0.006 * Math.SQRT2, o = 0.06, y = 0.137;
  return [[o, y - d], [o + d, y], [o, y + d], [o - d, y]];
})();

/**
 * The turn: the kerb's centre line leaves each edge line on a quarter circle of
 * this radius round a vertical axis at (TURN_C, TURN_C). The road face then
 * rounds at 0.225 m and the back at 0.075 m, and the rounded road face still
 * passes 13 mm outside the footway's corner (0.15 √2 < 0.225), so no paving
 * shows on the road side.
 */
const TURN_R = 0.15, TURN_C = 0.5 - TURN_R;
/** Kerb ends and the mid-edge joint, as the straight kerb's two 0.5 m units: 5 mm joints, ends 2.5 mm short of the vertices. */
const END = 0.4975, JOINT = 0.0025;

/** A point on the kerb's centre line and the horizontal direction across it towards the road. */
interface Station { x: number; z: number; ox: number; oz: number }
const onZ = (x: number): Station => ({ x, z: 0.5, ox: 0, oz: 1 });
const onX = (z: number): Station => ({ x: 0.5, z, ox: 1, oz: 0 });

/** The centre line from x = `from` on the +Z edge, round the turn, to z = `to` on the +X edge. */
function turnPath(from: number, to: number, segments: number): Station[] {
  const out = [onZ(from)];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
    out.push({ x: TURN_C + TURN_R * s, z: TURN_C + TURN_R * c, ox: s, oz: c });
  }
  out.push(onX(to));
  return out;
}

/**
 * Sweep a closed section along stations, with end caps. Faces are flat across
 * the section (its corners stay crisp, and the ink draws them) and smooth
 * along the path, so the turn shades as one rounded face. Stations run so that
 * up × across is the direction of travel, which keeps every face outward.
 */
function sweep(section: Section, path: Station[]): T.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  const at = (s: Station, [o, y]: [number, number]) => [s.x + s.ox * o, y, s.z + s.oz * o];
  const face = (a: number[], b: number[], c: number[], na: number[], nb: number[], nc: number[]) => { pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc); };
  const n = section.length;
  for (let j = 0; j < n; j++) {
    const p = section[j], q = section[(j + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), no = (q[1] - p[1]) / len, ny = -(q[0] - p[0]) / len;
    const normal = (s: Station) => [s.ox * no, ny, s.oz * no];
    for (let i = 0; i + 1 < path.length; i++) {
      const s0 = path[i], s1 = path[i + 1], a0 = at(s0, p), b0 = at(s0, q), a1 = at(s1, p), b1 = at(s1, q);
      const n0 = normal(s0), n1 = normal(s1);
      face(a0, b1, b0, n0, n1, n0);
      face(a0, a1, b1, n0, n1, n1);
    }
  }
  // Caps: the section fanned from its first corner, facing back along the path at the start and on at the end.
  const first = path[0], last = path[path.length - 1];
  const back = [-first.oz, 0, first.ox], on = [last.oz, 0, -last.ox];
  for (let j = 1; j + 1 < n; j++) {
    face(at(first, section[0]), at(first, section[j]), at(first, section[j + 1]), back, back, back);
    face(at(last, section[0]), at(last, section[j + 1]), at(last, section[j]), on, on, on);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}

/** The two arms as straight kerbs on their edges: +Z as placed, +X turned a quarter (its x runs along −Z). */
const ARMS: Placement[] = [{ position: [0, 0, 0.5] }, { position: [0.5, 0, 0], rotation: [0, Math.PI / 2, 0] }];

const turnSegments = (k: Kit) => (k.low ? 3 : k.fine ? 8 : 6);

/**
 * The kerb's units: a 0.5 m unit at the far end of each arm and one corner
 * unit from the middle of one edge round the vertex to the middle of the
 * other, so the joints keep the straight kerb's 0.5 m rhythm and nothing
 * breaks the stone at the turn.
 */
function kerbUnits(k: Kit, section: Section) {
  const stone = k.m('concrete');
  k.b.geometry(stone, sweep(section, [onZ(-END), onZ(-JOINT)]));
  k.b.geometry(stone, sweep(section, turnPath(JOINT, JOINT, turnSegments(k))));
  k.b.geometry(stone, sweep(section, [onX(-JOINT), onX(-END)]));
}

/**
 * Kerb along the cell's +Z and +X edges, turning round the vertex between
 * them, with the road outside the cell on both: parts/street.ts streetKerb's
 * precast section, sealed joints and steel nosing carried round a rounded
 * corner unit, and a gully on each arm where a straight kerb there has its
 * own, so a run's gullies keep their 1 m spacing through the corner.
 */
export function kerbCorner(k: Kit) {
  const { b } = k;
  kerbUnits(k, INDUSTRIAL_KERB);
  b.geometry(k.m('steel'), sweep(NOSING, turnPath(-0.5, -0.5, turnSegments(k))));
  for (const arm of ARMS) b.within(arm, () => {
    if (!k.low) b.box(k.m('post'), [0.005, 0.19, 0.15], { position: [0, 0.045, 0] }, 0);
    b.box(k.m('steel'), [0.32, 0.012, 0.16], { position: [0.18, -0.002, 0.16] }, small(k, 0.003));
    if (!k.low) for (let i = 0; i < 5; i++) b.box(k.m('post'), [0.022, 0.004, 0.12], { position: [0.06 + i * 0.06, 0.004, 0.16] }, 0);
  });
}

/** The same in the village look: the stone kerb's eased section round the turn, and its iron drain on each arm. */
export function kerbCornerVillage(k: Kit) {
  kerbUnits(k, VILLAGE_KERB);
  if (k.low) return;
  for (const arm of ARMS) k.b.within(arm, () => k.b.box(k.m('steel'), [0.26, 0.012, 0.14], { position: [0.18, -0.002, 0.16] }, 0));
}
