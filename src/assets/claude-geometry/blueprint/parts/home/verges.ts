import * as T from 'three';
import { SLOPE_RISE } from '../decks.ts';
import { extrudeZY } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { VILLAGE_EAVE, VILLAGE_SLOPE_RISE } from '../village/decks.ts';

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

/** Half of a turned piece: a lathe over z ≥ 0 closed by a flat face on z = 0, so two halves back to back make it whole. */
function halfTurned(k: Kit, mat: T.Material, profile: [number, number][], position: [number, number, number], segments: number) {
  k.b.geometry(mat, new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), segments, -Math.PI / 2, Math.PI), { position });
  const outline = [...profile, ...profile.slice().reverse().filter(([r]) => r > 0).map(([r, y]) => [-r, y])].map(([r, y]) => new T.Vector2(r, y));
  k.b.geometry(mat, new T.ShapeGeometry(new T.Shape(outline)), { position, rotation: [0, Math.PI, 0] });
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

/**
 * The same with its edges rounded over `round` metres in `segments` facets
 * (three keep each step under the ink's crease angle, so only the silhouette
 * is inked). The rounding is taken inside the profile and the span, so the
 * piece keeps exactly their bounds.
 */
function acrossRounded(k: Kit, mat: T.Material, profile: [number, number][], side: -1 | 1, x0: number, x1: number, round: number, segments: number) {
  const r = k.b.settings.bevelSegments > 0 ? round : 0, lo = Math.min(side * x0, side * x1), hi = Math.max(side * x0, side * x1);
  const shape = new T.Shape(profile.map(([z, y]) => new T.Vector2(-z, y)));
  const g = new T.ExtrudeGeometry(shape, { depth: hi - lo - 2 * r, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: segments });
  // As extrudeZY: a quarter turn about Y sends the extrusion (+Z) along +X and the shape's x to −Z.
  k.b.geometry(mat, g, { position: [lo + r, 0, 0], rotation: [0, Math.PI / 2, 0] });
}

/** Points on a quarter round of radius r about (cx, cy) from angle a0 to a1 (radians), n facets. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });

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

/** The village panel's tile courses (parts/village/decks.ts slopeRoof), repeated so the verge tiles continue them course for course. */
const TILE = 0.04, LAP = 0.03, STEP = 0.03;
function villageCourses(lod: Kit['lod']) {
  const R = VILLAGE_SLOPE_RISE, a = Math.atan2(R, 1), length = Math.hypot(1, R) + VILLAGE_EAVE;
  const count = lod === 'low' ? 3 : lod === 'high' ? 7 : 4, pitch = length / count, tile = pitch + LAP;
  const tilt = a - Math.asin(STEP / tile);
  const along = (s: number): [number, number] => [R - s * Math.sin(a), -0.5 + s * Math.cos(a)];
  return { R, a, count, pitch, tile, tilt, along };
}

/**
 * Village verge: each tile course runs on past the gable as a cloaked verge
 * tile, its edge turned down in a lip, and the half ridge cap runs on with
 * it; under the tiles a timber barge board follows the roof line, its lower
 * edge waved, sitting on the wall top where it reaches it and ending in a
 * rounded foot past the wall's corner. A turned knob on the ridge cap and a
 * drop under the boards' apex, each half on either verge, mark the ridge end.
 */
function villageVerge(k: Kit, side: -1 | 1) {
  const { R, count, pitch, tile, tilt, along } = villageCourses(k.lod);
  const timber = k.m('post'), tiles = k.m('corrugated');
  const lip = 0.035, board = 0.545, edge = 0.565, r = 0.008, facets = k.low ? 1 : 3;
  // Tile verge: the course's own section across the gable, and a lip down outside the board, its outer corners rounded.
  const section: [number, number][] = [[0.5, 0], [0.5, TILE], ...arc(edge - r, TILE - r, r, Math.PI / 2, 0, facets),
    ...arc(edge - r, -lip + r, r, 0, -Math.PI / 2, facets), [board, -lip], [board, 0]];
  for (let i = 0; i < count; i++) {
    // The first course's lip is cut plumb at the ridge, where the course itself starts.
    prism(k, tiles, section.map(([x, v]) => [side * x, v]), along(i * pitch), tilt, v => (i === 0 ? Math.max(0, -v * Math.tan(tilt)) : 0), () => tile);
  }
  // Half ridge cap carried on to the verge's edge.
  k.b.box(tiles, [0.07, 0.06, 0.08], { position: [side * 0.535, R + 0.055, -0.46] }, 0);

  // Barge board, x 0.5 … board: top on the courses' line, lower edge waved in a lobe every
  // 0.25 m (the fullest at the ridge), floored at the wall top up to the wall's face, then a rounded foot.
  const top = (z: number) => R * (0.5 - z), depth = 0.1, wave = k.low ? 0 : 0.04, period = 0.25;
  const per = k.fine ? 8 : 6, zFoot = 0.68, footDrop = 0.03;
  const lower: [number, number][] = [];
  const steps = wave ? Math.round((WALL_FACE + 0.5) / period * per) : 1;
  for (let i = 0; i <= steps; i++) {
    const z = -0.5 + (WALL_FACE + 0.5) * i / steps;
    const y = Math.max(top(z) - depth - wave * (0.5 + 0.5 * Math.cos(2 * Math.PI * (z + 0.5) / period)), WALL_TOP);
    const prev = lower[lower.length - 1];
    if (prev && prev[1] === WALL_TOP && y === WALL_TOP && i < steps) continue;
    lower.push([z, y]);
  }
  const footSteps = k.low ? 2 : k.fine ? 6 : 4;
  for (let i = 1; i <= footSteps; i++) {
    const t = i / footSteps;
    lower.push([WALL_FACE + (zFoot - WALL_FACE) * t, WALL_TOP - footDrop * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))]);
  }
  // Its back stands 1 mm off the gable: the long rounding facets would otherwise lie on the panel's end face.
  acrossRounded(k, timber, [[-0.5, top(-0.5)], [zFoot, top(zFoot)], ...lower.reverse()], side, 0.501, board, 0.008, k.fine ? 3 : 2);
  if (k.low) return;

  // Ridge end: a turned knob on the cap, a drop under the boards' apex.
  const segs = k.fine ? 10 : 6;
  halfTurned(k, timber, [[0.02, 0], [0.014, 0.008], [0.026, 0.022], [0.022, 0.036], [0.008, 0.048], [0, 0.054]], [side * 0.535, R + 0.085, -0.5], segs);
  const apex = top(-0.5) - depth - wave;
  halfTurned(k, timber, [[0, -0.085], [0.01, -0.078], [0.019, -0.058], [0.012, -0.035], [0.016, -0.018], [0.02, 0.01]], [side * 0.5225, apex, -0.5], segs);
}

/** Verge board on the panel's −X (left) or +X (right) end, from its ridge to its eave. */
export const vergeLeft = (k: Kit) => industrialVerge(k, -1);
export const vergeRight = (k: Kit) => industrialVerge(k, 1);
export const vergeLeftVillage = (k: Kit) => villageVerge(k, -1);
export const vergeRightVillage = (k: Kit) => villageVerge(k, 1);
