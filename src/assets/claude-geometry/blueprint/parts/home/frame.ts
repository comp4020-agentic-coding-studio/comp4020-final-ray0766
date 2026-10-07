import type { Material } from 'three';
import { extrudeZY, small, WALL_H } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { TOP_BAND } from '../village/walls.ts';

// Porch frame: a beam on a cell edge between the corner posts at its two ends,
// under the slab of the level above, so a porch or stall roof can stand on
// posts with the way below open. Edge part: origin on the edge midpoint at
// the slab top, x along the edge, +Z the exterior.
//
// What it has to clear, measured on the parts it meets:
// - a roof terrace above hangs members across the edge 0.3 m either side of
//   its midpoint (CROSSING), from either cell up to the edge line: the
//   village ceiling joists (0.08 m wide, y 1.98 … 2.04) and the industrial
//   cable tray (0.10 m wide, y 1.900 … 1.935);
// - an industrial eave gutter above hangs 4–5 mm under the slab from 30 mm
//   either side of the edge line;
// - an industrial wall on a perpendicular edge at the post carries, 0.04 m
//   or more from the vertex, an inside raceway (to 0.115 m off its line, y
//   1.82 … 1.88) or outside head-beam plates (to 0.117 m, y 1.85 … 1.97), and
//   an outside conduit along its whole length (to 0.142 m, y 1.76 … 1.80).

/**
 * Half the clear span between two corner posts' shafts: the industrial shaft is 0.11 m either
 * side of its vertex; the village post is 0.10 m, its top band (1.92–2.02 m, not at low LOD)
 * 0.11 m. The village beam meets the band at this span and reaches 10 mm further, to the shaft,
 * below the band (VILLAGE_SHAFT).
 */
export const BEAM_HALF_SPAN = 0.39;
/** Where the village post's shaft face is, and the foot of its top band (village/street.ts cornerColumn). */
export const VILLAGE_SHAFT = 0.4;
const BAND_FOOT = WALL_H - TOP_BAND;
export const BEAM_DEPTH = 0.2;

/** Underside of the beam: 1.84 m clear under it, the headroom info.ts promises. */
const SOFFIT = WALL_H - BEAM_DEPTH;
/** Where a roof terrace's joists or cable tray cross the edge, either side of its midpoint. */
const CROSSING = 0.3;
/** Knee braces reach this far in from the post face along the underside, and down to this height. */
const BRACE_IN = 0.145, BRACE_FOOT = 1.62;

type P2 = [number, number];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P2; });

/**
 * Industrial: a steel channel, 0.2 m deep with 58 mm flanges (inside the
 * 30 mm either side of the edge line an eave gutter leaves free), web on the
 * exterior face with a round service hole where a terrace's cable tray
 * crosses from outside (from inside it runs into the channel's open side).
 * End plates against the posts and square tube knee braces on bolted cleats.
 */
export function beam(k: Kit) {
  const { b } = k;
  const L = BEAM_HALF_SPAN, top = WALL_H, bottom = SOFFIT;
  const steel = k.m('post'), bare = k.m('steel');
  const half = 0.029, tf = 0.01, tw = 0.007;
  for (const y of [bottom + tf / 2, top - tf / 2]) b.box(steel, [2 * L, tf, 2 * half], { position: [0, y, 0] }, small(k, 0.002));
  const web: P2[] = [[-L, bottom + tf], [L, bottom + tf], [L, top - tf], [-L, top - tf]];
  // A cable slot the tray passes with 2 mm to spare; at low LOD the tray is not drawn, nor is the slot.
  const ends = k.fine ? 6 : 3, ty = 1.9175, tr = 0.026, run = 0.034;
  const slot = (x: number): P2[] => [...arc(x + run, ty, tr, tr, -0.5 * Math.PI, 0.5 * Math.PI, ends), ...arc(x - run, ty, tr, tr, 0.5 * Math.PI, 1.5 * Math.PI, ends)];
  b.extrude(steel, web, tw, { position: [0, 0, half - tw] }, 0, k.low ? [] : [slot(-CROSSING), slot(CROSSING)]);
  // End plates on the post faces, a little wider than the channel, under the gutter line.
  const p0 = bottom + 0.006, p1 = top - 0.01;
  for (const s of [-1, 1]) b.box(steel, [0.012, p1 - p0, 0.072], { position: [s * (L - 0.006), (p0 + p1) / 2, 0] }, small(k, 0.003));
  if (k.low) return;
  for (const s of [-1, 1]) {
    kneeBrace(k, steel, s, 0.03, 0.03);
    // Cleat on the post face round the brace's foot, bolted either side of it.
    const foot = BRACE_FOOT + 0.028;
    b.box(bare, [0.01, 0.11, 0.08], { position: [s * (L - 0.005), foot, 0] }, small(k, 0.003));
    for (const z of [-0.027, 0.027]) b.bolt(bare, { position: [s * (L - 0.01), foot, z], rotation: [0, 0, s * Math.PI / 2] }, 0.009);
  }
}

/**
 * A straight brace from the post face (x = ±L) at BRACE_FOOT up to the
 * underside, cut square to both: `t` thick in its plane, `w` across it.
 */
function kneeBrace(k: Kit, material: Material, side: number, t: number, w: number) {
  const L = BEAM_HALF_SPAN;
  // Centre line from the foot to the head; its two edges are cut by the post face and the underside.
  const p0: P2 = [L, BRACE_FOOT + t * 0.95], p1: P2 = [L - BRACE_IN + t * 0.6, SOFFIT];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d: P2 = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len], n: P2 = [-d[1], d[0]];
  const edge = (o: number): P2 => [p0[0] + n[0] * o, p0[1] + n[1] * o];
  const atPost = (o: number): P2 => { const q = edge(o); return [L, q[1] + ((L - q[0]) / d[0]) * d[1]]; };
  const atBeam = (o: number): P2 => { const q = edge(o); return [q[0] + ((SOFFIT - q[1]) / d[1]) * d[0], SOFFIT]; };
  const outline: P2[] = [atPost(-t / 2), atBeam(-t / 2), atBeam(t / 2), atPost(t / 2)].map(([x, y]) => [side * x, y] as P2);
  k.b.extrude(material, outline, w, { position: [0, 0, -w / 2] });
}

/**
 * Village: a chunky timber beam, 0.15 × 0.2 m, its underside rounded. Its
 * cogged top meets the slab between 60 mm gaps, two of which house a roof
 * terrace's ceiling joists where they cross the edge and rest on the beam; at
 * low LOD, where the terrace draws no joists, the top is whole. Curved timber
 * brackets under both ends, the cottage porch's knee braces, inside 0.15 m of
 * the posts.
 */
export function beamVillage(k: Kit) {
  const { b } = k;
  // At low LOD the post has no band, so the whole beam reaches its shaft.
  const L = k.low ? VILLAGE_SHAFT : BEAM_HALF_SPAN, S = VILLAGE_SHAFT, top = WALL_H, bottom = SOFFIT, half = 0.075, timber = k.m('post');
  const seat = top - 0.06, r = 0.032, n = k.low ? 1 : k.fine ? 4 : 2;
  // Below the post's band the body runs on to the shaft; above it, a block between the bands.
  const body: P2[] = [
    [-half, BAND_FOOT], ...arc(-half + r, bottom + r, r, r, Math.PI, 1.5 * Math.PI, n), ...arc(half - r, bottom + r, r, r, 1.5 * Math.PI, 2 * Math.PI, n), [half, BAND_FOOT],
  ];
  extrudeZY(k, timber, body, -S, S);
  b.box(timber, [2 * L, seat - BAND_FOOT, 2 * half], { position: [0, (seat + BAND_FOOT) / 2, 0] }, 0);
  // Cogged top: blocks with 0.09 m gaps every 0.2 m, two of them the joists' housings
  // (the 0.08 m joist and 5 mm either side), so an empty housing reads as part of the rhythm.
  const gap = 0.045, cogs = [-CROSSING, -CROSSING / 3, CROSSING / 3, CROSSING];
  const edges = k.low ? [-L, L] : [-L, ...cogs.flatMap(x => [x - gap, x + gap]), L];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const [x0, x1] = [edges[i], edges[i + 1]];
    b.box(timber, [x1 - x0, top - seat, 2 * half], { position: [(x0 + x1) / 2, (top + seat) / 2, 0] }, 0);
  }
  // Brackets: solid in the corner, a concave quarter-ellipse below, small flats at both tips.
  // They stand wholly below the band, so they seat on the shaft.
  const xi = S - BRACE_IN, tip = 0.015, m = k.low ? 3 : k.fine ? 9 : 5;
  const curve = arc(xi, BRACE_FOOT, S - tip - xi, bottom - tip - BRACE_FOOT, 0.5 * Math.PI, 0, m);
  const bracket: P2[] = [[S, bottom], [xi, bottom], ...curve, [S, BRACE_FOOT]];
  for (const s of [-1, 1]) b.extrude(timber, bracket.map(([x, y]) => [s * x, y] as P2), 0.07, { position: [0, 0, -0.035] });
}
