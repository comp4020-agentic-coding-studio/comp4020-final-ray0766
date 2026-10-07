import * as T from 'three';
import { extrudeZY, small } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { SIDE_BACK } from './furniture.ts';

// Crates and barrels that stand against one side of a cell, as the furniture
// does (edge-mounted, backs 0.13 m in from the edge line, no further than the
// cell centre). Looks only: they hold nothing.
//
// One model for both looks: boards ('tread') on timber battens and an iron
// hooped barrel in the village look, tread plate on painted steel in the
// industrial one. Boards and staves meet in shallow V joints whose faces lean
// about 27° off the board face: the joints read in a shapes-only render, and
// the look's ink (creases over 35°) draws one line at each joint's root.

type P2 = [number, number];

/** V joints between boards: depth into the board and half width on its face. */
const JOINT_D = 0.006, JOINT_E = 0.012;

/**
 * Cross-section of a boarded panel in (n, s): n outward from its back plane
 * (0) to the board face (t), s across the boards from 0 to `span`, with
 * `boards` boards meeting in V joints and both long edges eased the same way.
 */
function boardSection(span: number, boards: number, t: number): P2[] {
  const d = JOINT_D, e = JOINT_E, out: P2[] = [[0, 0], [t - d, 0], [t, e]];
  for (let i = 1; i < boards; i++) { const s = (span * i) / boards; out.push([t, s - e], [t - d, s], [t, s + e]); }
  out.push([t, span - e], [t - d, span], [0, span]);
  return out;
}

/**
 * One plank crate standing on y = 0, centred on x and z: its outer box w × h ×
 * d includes the four corner battens, which stand 12 mm proud of the boarded
 * sides; a cleat across each end is its handle.
 */
function crate(k: Kit, w: number, h: number, d: number) {
  const { b } = k, boards = k.m('tread'), timber = k.m('post');
  const proud = 0.012, batten = 0.045, hx = w / 2 - proud, hz = d / 2 - proud;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(timber, [batten, h, batten], { position: [sx * (w / 2 - batten / 2), h / 2, sz * (d / 2 - batten / 2)] }, small(k, 0.008));
  }
  // End cleats, between the battens.
  for (const sx of [-1, 1]) b.box(timber, [0.022, 0.045, 2 * hz - 2 * (batten - proud)], { position: [sx * (hx + 0.011), h * 0.66, 0] }, small(k, 0.006));
  if (k.low) { b.box(boards, [2 * hx, h, 2 * hz], { position: [0, h / 2, 0] }, 0); return; }
  const t = 0.02, lid = 0.025, wall = h - lid;
  const side = boardSection(wall, Math.max(2, Math.round(wall / 0.125)), t);
  // Sides, each placed on its back plane facing out: −Z (front), +Z, −X and +X.
  for (const [x, z, yaw, half] of [[0, -(hz - t), Math.PI, hx], [0, hz - t, 0, hx], [-(hx - t), 0, -Math.PI / 2, hz], [hx - t, 0, Math.PI / 2, hz]] as const) {
    extrudeZY(k, boards, side, -half, half, { position: [x, 0, z], rotation: [0, yaw, 0] });
  }
  // Lid boards run along x; their joints face up.
  extrudeZY(k, boards, boardSection(2 * hz, 3, lid), -hx, hx, { position: [0, h - lid, hz], rotation: [-Math.PI / 2, 0, 0] });
}

/** Lower and upper crate: outer sizes, and the upper one's offset and turn on the lower's lid. */
const LOWER = { w: 0.64, h: 0.42, d: 0.35 }, UPPER = { w: 0.46, h: 0.34, d: 0.28, x: 0.045, yaw: -0.14 };
const SKID = 0.03;

/**
 * Two crates, the smaller one stacked on the larger and turned a little on
 * it, the pair on two timber skids: 0.64 m wide, 0.79 m high.
 */
export function crates(k: Kit) {
  const { b } = k, z = SIDE_BACK - 0.005 - LOWER.d / 2;
  for (const dz of [-1, 1]) b.box(k.m('post'), [LOWER.w - 0.08, SKID, 0.05], { position: [0, SKID / 2, z + dz * (LOWER.d / 2 - 0.06)] }, small(k, 0.005));
  b.within({ position: [0, SKID, z] }, () => crate(k, LOWER.w, LOWER.h, LOWER.d));
  b.within({ position: [UPPER.x, SKID + LOWER.h, z], rotation: [0, UPPER.yaw, 0] }, () => crate(k, UPPER.w, UPPER.h, UPPER.d));
}

// ------------------------------------------------------------------ barrel

const BARREL_H = 0.66, R_END = 0.15, R_MID = 0.176;
/** Stave face radius at height y: a parabolic bulge, widest halfway up. */
const staveR = (y: number) => R_END + (R_MID - R_END) * (1 - ((2 * y) / BARREL_H - 1) ** 2);
const staveSlope = (y: number) => -(R_MID - R_END) * 2 * ((2 * y) / BARREL_H - 1) * (2 / BARREL_H);
/** Stave joints: depth into the stave face and arc width of each lean-in face. */
const STAVE_D = 0.007, STAVE_E = 0.015;
/** Inner radius of the stave ends round the head, and how far the head is let in below them. */
const CHIME_R = R_END - 0.024, HEAD_DROP = 0.022;

type SV = { p: T.Vector3; n: T.Vector3 | null };

/**
 * The barrel's staves as one surface: `n` staves round, each a smooth bulged
 * face (`m` facets across, `rows` up) whose edges lean in to V joints, and the
 * ring of stave ends at the top round the head. Normals are smooth on the
 * stave faces and flat on the joints and the ring.
 */
function staves(n: number, m: number, rows: number): T.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  const e1 = new T.Vector3(), e2 = new T.Vector3(), fn = new T.Vector3();
  const at = (a: number, y: number, off: number, smooth: boolean): SV => {
    const r = staveR(y) + off;
    return { p: new T.Vector3(r * Math.cos(a), y, r * Math.sin(a)), n: smooth ? new T.Vector3(Math.cos(a), -staveSlope(y), Math.sin(a)).normalize() : null };
  };
  /** A triangle turned to face `out`; vertices without a normal take the face's. */
  const tri = (a: SV, b: SV, c: SV, out: T.Vector3) => {
    e1.subVectors(b.p, a.p); e2.subVectors(c.p, a.p); fn.crossVectors(e1, e2).normalize();
    if (fn.dot(out) < 0) { [b, c] = [c, b]; fn.negate(); }
    for (const q of [a, b, c]) { const nn = q.n ?? fn; pos.push(q.p.x, q.p.y, q.p.z); nor.push(nn.x, nn.y, nn.z); }
  };
  const quad = (a: SV, b: SV, c: SV, d: SV, out: T.Vector3) => { tri(a, b, c, out); tri(a, c, d, out); };
  const step = (2 * Math.PI) / n, lean = STAVE_E / R_MID, up = new T.Vector3(0, 1, 0), rin = CHIME_R - 0.002;
  for (let i = 0; i < n; i++) {
    const a0 = i * step, a1 = a0 + step;
    // Across one stave: joint root, face edge, m facets, face edge, joint root.
    const across: [number, number, boolean][] = [[a0, -STAVE_D, false]];
    for (let s = 0; s <= m; s++) across.push([a0 + lean + ((step - 2 * lean) * s) / m, 0, true]);
    across.push([a1, -STAVE_D, false]);
    for (let s = 0; s + 1 < across.length; s++) {
      const [aa, oa, sa] = across[s], [ab, ob, sb] = across[s + 1], smooth = sa && sb, mid = (aa + ab) / 2;
      const out = new T.Vector3(Math.cos(mid), 0, Math.sin(mid));
      for (let r = 0; r < rows; r++) {
        const y0 = (BARREL_H * r) / rows, y1 = (BARREL_H * (r + 1)) / rows;
        quad(at(aa, y0, oa, smooth), at(ab, y0, ob, smooth), at(ab, y1, ob, smooth), at(aa, y1, oa, smooth), out);
      }
      // Stave end: from the face (or joint) outline in to the chime circle, just inside the head's wall.
      const inA: SV = { p: new T.Vector3(rin * Math.cos(aa), BARREL_H, rin * Math.sin(aa)), n: null };
      const inB: SV = { p: new T.Vector3(rin * Math.cos(ab), BARREL_H, rin * Math.sin(ab)), n: null };
      quad(at(aa, BARREL_H, oa, false), at(ab, BARREL_H, ob, false), inB, inA, up);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * One small barrel, 0.35 m across at the bilge, 0.66 m high: bulged staves
 * meeting in V joints, two iron hoops 0.13 m in from the ends and a head let
 * in below the stave ends.
 */
export function barrel(k: Kit) {
  const { b } = k, boards = k.m('tread'), iron = k.m('steel');
  const place = { position: [0, 0, SIDE_BACK - 0.005 - R_MID - 0.009] as [number, number, number] };
  const hoops = [0.13, BARREL_H - 0.13], band = 0.042;
  if (k.low) {
    // One lathe body and a separate head (a shared lathe would round the rim); the hoops on the same 8 sides,
    // so their flats stand clear of the body's.
    b.lathe(boards, [[R_END, 0], [R_MID, BARREL_H / 2], [R_END, BARREL_H]], place, 8);
    b.lathe(boards, [[R_END, BARREL_H], [0, BARREL_H]], place, 8);
    for (const y of hoops) b.lathe(iron, [[staveR(y - band / 2) + 0.008, y - band / 2], [staveR(y + band / 2) + 0.008, y + band / 2]], place, 8);
    return;
  }
  b.geometry(boards, staves(k.fine ? 10 : 8, k.fine ? 3 : 2, k.fine ? 6 : 4), place);
  // Head: the inner wall of the stave ends in the darker timber, so the let-in head reads as closed, not as a hole.
  const seg = k.fine ? 24 : 16;
  const lathe = (mat: T.Material, profile: P2[]) => { for (let i = 0; i + 1 < profile.length; i++) b.lathe(mat, [profile[i], profile[i + 1]], place, seg); };
  lathe(k.m('post'), [[CHIME_R, BARREL_H], [CHIME_R, BARREL_H - HEAD_DROP]]);
  lathe(boards, [[CHIME_R, BARREL_H - HEAD_DROP], [0, BARREL_H - HEAD_DROP]]);
  // Hoops: a flat band 6 mm proud, its lips turned in past the joints' roots so no joint shows through.
  for (const y of hoops) {
    const y0 = y - band / 2, y1 = y + band / 2;
    lathe(iron, [[staveR(y0) - STAVE_D - 0.002, y0], [staveR(y0) + 0.006, y0], [staveR(y1) + 0.006, y1], [staveR(y1) - STAVE_D - 0.002, y1]]);
  }
}
