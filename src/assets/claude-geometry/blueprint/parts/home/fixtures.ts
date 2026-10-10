import * as T from 'three';
import { extrudeZY, small } from '../kit.ts';
import type { Kit } from '../kit.ts';

// Fixtures on a plain wall's face: a wall lamp and hanging signs. Edge-mounted
// like the furniture (origin on the edge midpoint at the slab top, +Z the
// edge's outside) but they hang on the face of the wall standing on that edge
// that looks into their cell, above head height, and they need that wall.
// The lamp is a real practical light; the signs carry an emblem and no text
// (editable text is a host feature). The industrial fixtures are painted
// steel on a bracket bolted to the head beam, their emblems in relief; the
// village ones hang from a straight timber bracket: a box lantern with dark
// caps, and plain wooden signboards whose marks are flat geometric inlays.
//
// A fixture may meet either face of the wall, so it is fixed where both faces
// are the same. Measured on wall.solid: the cladding and the plaster stand
// 0.090 m off the edge line. Industrial: the head beam stands at 0.105 m over
// y 1.908 … 2.032 (flat), and between the cladding's 1.50 m joint strip and
// the head the faces differ (an outside conduit at 1.76 … 1.80 m, 0.142 m
// proud; an inside raceway at 1.82 … 1.88 m, 0.115 m proud): the industrial
// fixtures bolt to the head beam. Village: the outside face's top band stands
// at 0.105 m from 1.92 m, the inside is plaster to the top: the village
// fixtures stay on the plaster below 1.92 m.
//
// A roof terrace over the fixture's cell hangs its ceiling below the slab:
// industrial, a cable tray from 1.90 m, 0.15–0.25 m off one edge, and a
// luminaire from 1.936 m; village, joists from 1.98 m and a pendant from
// 1.925 m at the middle. Beyond 0.14 m from the edge line, fixtures stay
// under 1.90 m.
//
// A tall shelf on a side edge of the same cell stands from 0.055 m off this
// edge's middle (its box allows 0.05 m) to 1.815 m (1.85 m): below 1.85 m
// the lanterns stay within 0.048 m either side of the middle (SLIM).

/** The face of a plain wall, in the fixture's frame, nominal (walls are 0.18 m thick; their faces sit 0.090–0.105 m off the edge line, measured above). */
export const WALL_FACE = -0.1;

/** Plaster and cladding, either face, below the head. */
const FACE = -0.09;
/** The industrial head beam's face and its flat height. */
const HEAD = -0.105, HEAD_Y0 = 1.908, HEAD_Y1 = 2.032;
/** The village top band starts here on the outside face; plates stop under it. */
const BAND = 1.92;
/** Half-width of the lanterns below 1.85 m, clear of a tall shelf on a side edge. */
const SLIM = 0.048;
/** The light shines down and out of the wall (the door lantern's direction). */
const SHINE: [number, number, number] = [0, -0.6, -0.8];

type P2 = [number, number];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P2; });
const roundRect = (hu: number, hv: number, r: number, n: number, cu = 0, cv = 0): P2[] => [
  ...arc(cu + hu - r, cv + hv - r, r, r, 0, 0.5 * Math.PI, n), ...arc(cu - hu + r, cv + hv - r, r, r, 0.5 * Math.PI, Math.PI, n),
  ...arc(cu - hu + r, cv - hv + r, r, r, Math.PI, 1.5 * Math.PI, n), ...arc(cu + hu - r, cv - hv + r, r, r, 1.5 * Math.PI, 2 * Math.PI, n),
];
/**
 * Village bracket: a timber plate on the wall face from `plate` up to under
 * the top band, a square timber arm at `armY` (its top under 1.90 m) running
 * out to `reach`, and (not at low) a straight timber brace from the plate up
 * to the arm's underside at `brace` m out.
 */
function timberBracket(k: Kit, half: number, plate: number, armY: number, reach: number, brace: number) {
  const { b } = k, wood = k.m('post'), arm = 0.03, front = FACE - 0.02;
  b.box(wood, [2 * half, BAND - 0.01 - plate, FACE - front], { position: [0, (plate + BAND - 0.01) / 2, (FACE + front) / 2] }, 0);
  b.box(wood, [arm, arm, front - reach], { position: [0, armY, (front + reach) / 2] }, 0);
  if (k.low) return;
  // The brace's ends sit in the plate and the arm; its corners stay in front of the wall face.
  const y0 = plate + 0.04, z0 = front + 0.005, y1 = armY - arm / 2, z1 = brace, len = Math.hypot(y1 - y0, z1 - z0);
  b.box(wood, [0.02, len, 0.02], { position: [0, (y0 + y1) / 2, (z0 + z1) / 2], rotation: [Math.atan2(z1 - z0, y1 - y0), 0, 0] }, 0);
}

/** Centre of the industrial bracket's arm: under a terrace ceiling's 1.90 m. */
const ARM_Y = 1.87;

/**
 * Industrial bracket: a plate bolted to the head beam, a square tube drop
 * down its face (2 mm clear of an inside raceway, above an outside conduit)
 * to a rectangular tube arm running out to `reach` under ARM_Y's ceiling
 * line, a gusset under the corner and an end cap.
 */
function headBracket(k: Kit, half: number, reach: number) {
  const { b } = k;
  const steel = k.m('post'), bare = k.m('steel'), plate = 0.012, y = (HEAD_Y0 + HEAD_Y1) / 2, front = HEAD - plate, tube = 0.024;
  b.box(steel, [2 * half, 0.105, plate], { position: [0, y, HEAD - plate / 2] }, small(k, 0.004));
  if (k.hardware) for (const x of [-half + 0.016, half - 0.016]) for (const dy of [-0.03, 0.03]) b.bolt(bare, { position: [x, y + dy, front], rotation: [-0.5 * Math.PI, 0, 0] }, 0.008);
  const d0 = 1.81, d1 = 1.93, a0 = ARM_Y - 0.015;
  b.box(steel, [tube, d1 - d0, tube], { position: [0, (d0 + d1) / 2, front - tube / 2] }, small(k, 0.003));
  b.box(steel, [tube, 0.03, front - reach], { position: [0, ARM_Y, (front + reach) / 2] }, small(k, 0.003));
  b.box(steel, [0.03, 0.036, 0.006], { position: [0, ARM_Y, reach - 0.003] }, 0);
  if (!k.low) extrudeZY(k, steel, [[front - tube, a0], [front - tube - 0.045, a0], [front - tube, d0]], -0.004, 0.004);
}

// ------------------------------------------------------------------ lamp

/**
 * Industrial wall lamp: the head-beam bracket and a caged pendant hanging
 * from it: a shade, a glass tube round the lamp, a bottom cap and a guard.
 */
export function wallLamp(k: Kit) {
  const { b } = k;
  const steel = k.m('steel'), sheet = k.m('leaf'), lz = -0.25, ly = 1.75;
  headBracket(k, 0.06, lz - 0.015);
  const seg = k.low ? 6 : k.fine ? 16 : 10;
  b.cylinder(steel, 0.008, 0.008, 0.02, { position: [0, 1.845, lz] }, { segments: 6 });
  b.cylinder(sheet, 0.03, SLIM, 0.035, { position: [0, 1.8175, lz] }, { segments: seg });
  b.cylinder(k.m('glass'), 0.036, 0.036, 0.1, { position: [0, ly, lz] }, { segments: seg });
  b.cylinder(k.m('lamp'), 0.015, 0.015, 0.07, { position: [0, ly, lz] }, { segments: k.low ? 6 : 8 });
  b.cylinder(sheet, 0.04, 0.03, 0.02, { position: [0, 1.69, lz] }, { segments: seg });
  b.emitter('door', [0, ly, lz], SHINE);
  if (k.low) return;
  // Guard: four bars round the glass and, close up, a ring at mid height.
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) * 0.5 * Math.PI;
    b.box(k.m('bright'), [0.007, 0.1, 0.007], { position: [0.041 * Math.cos(a), ly, lz + 0.041 * Math.sin(a)], rotation: [0, -a, 0] }, 0);
  }
  if (k.fine) b.geometry(k.m('bright'), new T.TorusGeometry(0.0425, 0.004, 4, 16), { position: [0, ly, lz], rotation: [0.5 * Math.PI, 0, 0] });
}

/** The village lantern's glowing box: its half width, bottom and top, under the arm at 1.87 m. */
export const LANTERN_BOX = { half: 0.04, y0: 1.64, y1: 1.78 } as const;

/**
 * Village wall lantern: a timber plate, arm and brace, and a box lantern
 * hanging from the arm on a short iron rod: a glowing paper box between two
 * dark iron caps, thin iron corner posts (not at low). The paper is the glow,
 * as in every village lantern here; the light point is at its middle.
 */
export function wallLampVillage(k: Kit) {
  const { b } = k;
  const iron = k.m('steel'), lz = -0.25, ly = 1.718, armY = 1.87, { half, y0, y1 } = LANTERN_BOX, cap = 0.02;
  timberBracket(k, 0.04, 1.695, armY, lz - 0.02, -0.2);
  b.box(iron, [0.008, armY - 0.015 - (y1 + 0.025), 0.008], { position: [0, (armY - 0.015 + y1 + 0.025) / 2, lz] }, 0);
  b.box(iron, [2 * SLIM, 0.025, 2 * SLIM], { position: [0, y1 + 0.0125, lz] }, 0);
  b.box(k.m('lamp'), [2 * half, y1 - y0, 2 * half], { position: [0, (y0 + y1) / 2, lz] }, 0);
  b.box(iron, [2 * SLIM, cap, 2 * SLIM], { position: [0, y0 - cap / 2, lz] }, 0);
  b.emitter('door', [0, ly, lz], SHINE);
  if (k.low) return;
  const c = half - 0.004;
  for (const x of [-c, c]) for (const z of [-c, c]) b.box(iron, [0.012, y1 - y0, 0.012], { position: [x, (y0 + y1) / 2, lz + z] }, 0);
}

// ------------------------------------------------------------------ signs

/** One raised piece of an emblem, in (u, v) about the board's centre: u along the board, v up. */
interface Relief { shape: P2[]; holes?: P2[][]; second?: boolean }
type Emblem = (n: number, board: { hu: number; hv: number; rounded: boolean }) => Relief[];

/**
 * Raise emblem pieces from both faces of a board standing in the Z–Y plane
 * (faces at x ±t). Seen from +x, −z is to the right, from −x, +z: each face
 * shows the emblem the right way round. At high LOD the pieces' edges are
 * bevelled, so the relief also reads where colour and light are gone; the
 * bevel's back half sinks into the board.
 */
function relief(k: Kit, material: T.Material, pieces: Relief[], at: { z: number; y: number; t: number; d1: number; d2: number }) {
  const bevel = k.fine ? 0.002 : 0;
  for (const p of pieces) for (const s of [1, -1]) {
    const x0 = at.t + (p.second ? at.d1 : 0), x1 = at.t + (p.second ? at.d2 : at.d1), depth = x1 - x0 - bevel;
    // Shape coordinates for an extrusion turned onto +X: (−z, y). It runs from x0 − bevel to x1 (mirrored on −x).
    const map = ([u, v]: P2): P2 => [-(at.z - s * u), at.y + v];
    k.b.extrude(material, p.shape.map(map), depth, { position: [s > 0 ? x0 : -x1 + bevel, 0, 0], rotation: [0, 0.5 * Math.PI, 0] }, bevel, (p.holes ?? []).map(h => h.map(map)));
  }
}

/** A plain border round the board, for a host that adds text later. */
const border: Emblem = (n, { hu, hv, rounded }) => [{
  shape: roundRect(hu - 0.02, hv - 0.02, rounded ? 0.024 : 0.012, rounded ? n : 1),
  holes: [roundRect(hu - 0.035, hv - 0.035, rounded ? 0.01 : 0.005, rounded ? Math.max(1, n - 1) : 1)],
}];

/** An envelope: the body, and its flap raised over it. */
const envelope: Emblem = () => [
  { shape: roundRect(0.085, 0.055, 0.008, 1) },
  { shape: [[-0.074, 0.047], [0, -0.01], [0.074, 0.047]], second: true },
];

/** A cup on a saucer, handle to the right, two curls of steam over it. */
const cup: Emblem = n => {
  const dv = -0.02, up = (pts: P2[]) => pts.map(([u, v]) => [u, v + dv] as P2);
  const body: P2[] = [[-0.06, 0.035], [0.04, 0.035], ...arc(-0.01, 0.005, 0.05, 0.05, 0, -Math.PI, 2 * n)];
  // The handle: half a flat ring whose ends meet the body's straight side.
  const handle: P2[] = [...arc(0.04, 0.017, 0.028, 0.019, -0.5 * Math.PI, 0.5 * Math.PI, 2 * n), ...arc(0.04, 0.017, 0.014, 0.008, 0.5 * Math.PI, -0.5 * Math.PI, n)];
  const saucer: P2[] = [...arc(0.055, -0.052, 0.007, 0.007, -0.5 * Math.PI, 0.5 * Math.PI, n), ...arc(-0.075, -0.052, 0.007, 0.007, 0.5 * Math.PI, 1.5 * Math.PI, n)];
  const steam = [-0.032, 0.008].map((u0, i): P2[] => {
    const m = 2 * n + 1, w = 0.0045, pts = Array.from({ length: m + 1 }, (_, j) => {
      const v = 0.047 + 0.052 * (j / m);
      return [u0 + 0.008 * Math.sin(((v - 0.047) / 0.052) * 2 * Math.PI + i * 0.9), v] as P2;
    });
    return [...pts.map(([u, v]) => [u + w, v] as P2), ...pts.reverse().map(([u, v]) => [u - w, v] as P2)];
  });
  return [body, handle, saucer, ...steam].map(s => ({ shape: up(s) }));
};

/**
 * Industrial hanging sign: the head-beam bracket and a painted sheet board on
 * two lugs under its arm, the emblem in relief on both faces.
 */
function hangingSign(k: Kit, emblem: Emblem) {
  const { b } = k;
  headBracket(k, 0.04, -0.477);
  // Board z −0.20 … −0.47, y 1.625 … 1.835.
  const bz = -0.335, by = 1.73, hu = 0.135, hv = 0.105, t = 0.015;
  for (const dz of [-0.095, 0.095]) b.box(k.m('steel'), [0.008, 0.04, 0.03], { position: [0, by + hv + 0.01, bz + dz] }, 0);
  b.box(k.m('leaf'), [2 * t, 2 * hv, 2 * hu], { position: [0, by, bz] }, small(k, 0.005));
  relief(k, k.m('marking'), emblem(k.low ? 1 : k.fine ? 4 : 2, { hu, hv, rounded: false }), { z: bz, y: by, t, d1: 0.009, d2: 0.014 });
}

/**
 * The village signboard: z and y extents, the board's half thickness, the
 * pale panel standing `panel` proud of it on both faces inside a dark rim
 * `rim` wide, and how far each layer of a mark stands off the panel.
 */
export const SIGNBOARD = { z0: -0.215, z1: -0.465, y0: 1.62, y1: 1.84, t: 0.015, panel: 0.004, rim: 0.022, layer: 0.004 } as const;

/** A flat mark on a village signboard: an outline in (u, v) about the board's middle (u along the board, v up), its material, and its layer (2 stands on 1). */
interface Mark { shape: P2[]; material: 'leaf' | 'marking'; layer: 1 | 2 }
const rect = (hu: number, hv: number, cv = 0): P2[] => [[-hu, cv - hv], [hu, cv - hv], [hu, cv + hv], [-hu, cv + hv]];
/** An envelope: a teal body and its cream flap. */
const envelopeMark = (): Mark[] => [
  { shape: rect(0.08, 0.05), material: 'leaf', layer: 1 },
  { shape: [[-0.07, 0.042], [0, -0.005], [0.07, 0.042]], material: 'marking', layer: 2 },
];
/** A tea bowl: a teal half disc on a short foot. */
const bowlMark = (n: number): Mark[] => [
  { shape: arc(0, 0.025, 0.075, 0.075, Math.PI, 2 * Math.PI, n), material: 'leaf', layer: 1 },
  { shape: rect(0.03, 0.013, -0.058), material: 'leaf', layer: 1 },
];

/**
 * Village hanging signboard: the timber bracket, two iron straps, and a dark
 * timber board with a pale panel proud on both faces; marks inlaid flat on
 * the panel, on both faces (symmetric, so each face reads the same way).
 */
function hangingSignVillage(k: Kit, marks: Mark[]) {
  const { b } = k, wood = k.m('post');
  const { z0, z1, y0, y1, t, panel, rim, layer } = SIGNBOARD, armY = 1.88;
  timberBracket(k, 0.03, 1.7, armY, -0.48, -0.25);
  const bz = (z0 + z1) / 2, by = (y0 + y1) / 2;
  for (const dz of [-0.09, 0.09]) b.box(k.m('steel'), [0.008, armY - 0.015 - y1, 0.012], { position: [0, (armY - 0.015 + y1) / 2, bz + dz] }, 0);
  b.box(wood, [2 * t, y1 - y0, z0 - z1], { position: [0, by, bz] }, 0);
  b.box(k.m('tread'), [2 * (t + panel), y1 - y0 - 2 * rim, z0 - z1 - 2 * rim], { position: [0, by, bz] }, 0);
  for (const m of marks) for (const s of [1, -1]) {
    const off = t + panel + (m.layer - 1) * layer, x0 = s > 0 ? off : -off - layer;
    extrudeZY(k, k.m(m.material), m.shape.map(([u, v]) => [bz + u, by + v] as P2), x0, x0 + layer);
  }
}

/** Hanging sign with a plain painted border, for a host that adds text later. */
export const signBlank = (k: Kit) => hangingSign(k, border);
/** Hanging sign with an envelope: post and parcels. */
export const signMail = (k: Kit) => hangingSign(k, envelope);
/** Hanging sign with a cup: tea or food. */
export const signCup = (k: Kit) => hangingSign(k, cup);

/** The village look's signboards: a plain one, the envelope and the tea bowl. */
export const signBlankVillage = (k: Kit) => hangingSignVillage(k, []);
export const signMailVillage = (k: Kit) => hangingSignVillage(k, envelopeMark());
export const signCupVillage = (k: Kit) => hangingSignVillage(k, bowlMark(k.low ? 4 : k.fine ? 8 : 6));
