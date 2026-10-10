import * as T from 'three';
import { SLOPE_RISE } from '../decks.ts';
import { extrudeZY } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { ridge, VILLAGE_BANDS, VILLAGE_EAVE, VILLAGE_RIDGE_TOP, VILLAGE_SLOPE_RISE, villageFoot } from '../village/decks.ts';

// Verge boards: the trim on an open gable end of a sloped roof panel (roof.slope).
// Cell parts placed on the panel's own cell and turned as it is (the rules
// require that); 'left' finishes its local −X end, 'right' its +X end, from
// the ridge (local −Z) to the eave (local +Z). They follow each look's panel.
//
// Everything stays outside the panel (|x| 0.5 … 0.58) and is cut plumb at the
// ridge (z −0.5), so two panels back to back carry two verges that meet face
// to face there. Over the gable wall and the corner post below (z ≤ 0.61)
// nothing drops under the panel's underside, y −0.16, the top of that wall.

/** Top of the wall below the panel, in the panel's frame. */
const WALL_TOP = -0.16;
/** Outer face of the wall and corner post under the eave; the verge may drop past the wall top only beyond it. */
const WALL_FACE = 0.61;

/**
 * A prism of `outline` ([x, v]: across the roof and up from a line in the Z–Y
 * plane through `origin` [y, z] at `angle` below horizontal towards +Z), run
 * along that line from start(v) to end(v). Ends that depend on v come out
 * sheared, which is how a piece laid to the pitch gets a plumb cut.
 */
function prism(k: Kit, mat: T.Material, outline: [number, number][], origin: [number, number], angle: number, start: (v: number) => number, end: (v: number) => number) {
  const g = new T.ExtrudeGeometry(new T.Shape(outline.map(([x, v]) => new T.Vector2(x, v))), { depth: 1, bevelEnabled: false });
  const p = g.getAttribute('position'), c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = p.getY(i), t = p.getZ(i), along = start(v) + t * (end(v) - start(v));
    p.setXYZ(i, x, origin[0] + v * c - along * s, origin[1] + v * s + along * c);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g.computeVertexNormals();
  k.b.geometry(mat, g);
}

/** Clip a Z–Y profile to z ≥ z0 (one plane, Sutherland–Hodgman). */
function clipZ(poly: [number, number][], z0: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[0] >= z0, inb = b[0] >= z0;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (z0 - a[0]) / (b[0] - a[0]); out.push([z0, a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}

/** extrudeZY over the span between x0 and x1 on the verge's side. */
const across = (k: Kit, mat: T.Material, profile: [number, number][], side: -1 | 1, x0: number, x1: number) =>
  extrudeZY(k, mat, profile, Math.min(side * x0, side * x1), Math.max(side * x0, side * x1));

// ------------------------------------------------------------ industrial

/**
 * Folded verge flashing over the sheet edge (parts/decks.ts slopeRoof): a
 * cap standing above the standing seams, an apron down over the end of the
 * sheet and the insulated wedge, and a drip kicked out at its foot, cut plumb
 * at the ridge and just past the sheet's end. The ridge flashing runs on to
 * its outer face, a stop end closes the box gutter, and screws hold the apron.
 */
function industrialVerge(k: Kit, side: -1 | 1) {
  const R = SLOPE_RISE, a = Math.atan2(R, 1), over = 0.1, flash = k.m('bright');
  // Section across the verge, v up from the slope line (the sheet's top is at v 0.014, the seams' at 0.047).
  const section: [number, number][] = [[0.5, 0.058], [0.556, 0.058], [0.556, 0.04], [0.545, 0.04], [0.545, -0.078], [0.558, -0.091], [0.558, -0.1], [0.5, -0.1]];
  const zEnd = 0.6;
  prism(k, flash, section.map(([x, v]) => [side * x, v]), [R, -0.5], a, v => -v * Math.tan(a), v => (zEnd + 0.5 - v * Math.sin(a)) / Math.cos(a));
  // The panel's ridge flashing carried on over the cap, cut at the ridge.
  const h = a / 2, c: [number, number] = [-0.47, R + 0.045], d = [Math.cos(h), -Math.sin(h)], n = [Math.sin(h), Math.cos(h)];
  const corner = (l: number, t: number): [number, number] => [c[0] + l * d[0] + t * n[0], c[1] + l * d[1] + t * n[1]];
  across(k, flash, clipZ([corner(-0.07, -0.005), corner(0.07, -0.005), corner(0.07, 0.005), corner(-0.07, 0.005)], -0.5), side, 0.5, 0.556);
  // Stop end over the open ends of the fascia and the box gutter (z 0.5 … 0.66), kept on the wall top.
  const gy = -0.03 - over * Math.sin(a);
  across(k, flash, [[0.5, gy + 0.014], [0.5, WALL_TOP], [0.652, WALL_TOP], [0.664, WALL_TOP + 0.012], [0.664, gy + 0.024]], side, 0.5, 0.508);
  // Screws through the apron, on its outer face.
  for (const s of [0.22, 0.56, 0.9]) {
    const v = -0.02;
    k.b.bolt(k.m('steel'), { position: [side * 0.545, R + v * Math.cos(a) - s * Math.sin(a), -0.5 + v * Math.sin(a) + s * Math.cos(a)], rotation: [0, 0, -side * Math.PI / 2] }, 0.009);
  }
}

// ------------------------------------------------------------ village

/** The village verge across the gable: the bands run on to `edge`, the barge board under them out to `board`. */
const VERGE = { edge: 0.565, board: 0.545, depth: 0.11 };
/** The plain ridge-end block, half of it on each verge: across the gable, out from the ridge line at its foot and at its top (it flares), and its top. */
const RIDGE_END = { x: [0.53, 0.58] as const, foot: 0.1, half: 0.14, top: VILLAGE_RIDGE_TOP + 0.025 };

/**
 * Village verge: each of the panel's three tile bands runs on past the
 * gable over a straight timber barge board, which follows the roof line from
 * the ridge to the eave's tip, its lower edge parallel to it (kept on the wall
 * top as far as the wall's face, where the pitch keeps it anyway), cut plumb
 * at both ends. The half ridge runs on with the bands, a plain ridge-end
 * block stands over its end, and (not at low) a flat hanging board
 * under the boards' apex; two verges back to back make each of them whole.
 */
function villageVerge(k: Kit, side: -1 | 1) {
  const R = VILLAGE_SLOPE_RISE, a = Math.atan2(R, 1), e = Math.atan(VILLAGE_EAVE.fall);
  const timber = k.m('post'), tiles = k.m('corrugated'), { edge, board, depth } = VERGE;
  for (const band of VILLAGE_BANDS) across(k, tiles, band, side, 0.5, edge);
  ridge(k, tiles, Math.min(side * 0.5, side * edge), Math.max(side * 0.5, side * edge));
  const base = R, { foot, half, top } = RIDGE_END;
  across(k, tiles, [[-0.5, base], [-0.5 + foot, base], [-0.5 + half, top], [-0.5, top]], side, RIDGE_END.x[0], RIDGE_END.x[1]);

  // Barge board: its top on the bands' undersides, its lower edge `depth` under it, square to the pitch and to the eave.
  const tip = VILLAGE_BANDS[2][1][0], dp = depth / Math.cos(a), de = depth / Math.cos(e);
  // Where the two lower edges meet, under the cell edge.
  const zk = 0.5 - (dp - de) / (R - VILLAGE_EAVE.fall), yk = villageFoot(zk) - dp;
  const lower = (z: number, d: number) => Math.max(villageFoot(z) - d, z <= WALL_FACE ? WALL_TOP : -Infinity);
  across(k, timber, [[-0.5, R], [0.5, 0], [tip, villageFoot(tip)], [tip, lower(tip, de)], [zk, yk], [-0.5, lower(-0.5, dp)]], side, 0.501, board);
  if (k.low) return;
  // Hanging board under the apex: a flat half hexagon on the barge board's face, its top inside the board.
  const apex = R - dp;
  across(k, timber, [[-0.5, apex + 0.025], [-0.43, apex - 0.01], [-0.43, apex - 0.085], [-0.5, apex - 0.13]], side, board - 0.015, board + 0.005);
}

/** Verge board on the panel's −X (left) or +X (right) end, from its ridge to its eave. */
export const vergeLeft = (k: Kit) => industrialVerge(k, -1);
export const vergeRight = (k: Kit) => industrialVerge(k, 1);
export const vergeLeftVillage = (k: Kit) => villageVerge(k, -1);
export const vergeRightVillage = (k: Kit) => villageVerge(k, 1);
