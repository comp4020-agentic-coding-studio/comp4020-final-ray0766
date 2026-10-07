import * as T from 'three';
import { mulberry32 } from '../core/noise.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW, PALETTE } from '../style/tokens.ts';
import { bladeGeometry, rect } from './shapes.ts';

// Planter box: the stand-in for the main project's "flowers" (footprint radius
// 0.28 m, about 0.6 m tall). A folded steel trough on corner angles and feet,
// with a rolled rim, filled with soil, strap-leaved hardy plants and a few
// yarrow-like flower stems, and a soil-moisture probe with a pilot LED. The
// box is 0.38 m square so its corners sit 0.27 m from the origin.
//
// Flower heads are flat clusters of small florets on bent stems of varied
// height, in a pale dusty cream: small and muted, never a colour accent.

/** Sage green: palette olive pulled towards teal, then a little towards bone, as hardy strap-leaved plants are greyer than conifers. */
const LEAF_GREEN = `#${new T.Color(PALETTE.olive).lerp(new T.Color(PALETTE.teal), 0.35).lerp(new T.Color(PALETTE.bone), 0.12).multiplyScalar(0.8).getHexString()}`;
/** Pale dusty cream: bone pulled a third towards amber and darkened. */
const BLOOM = `#${new T.Color(PALETTE.bone).lerp(new T.Color(PALETTE.amber), 0.3).multiplyScalar(0.9).getHexString()}`;

const S = 0.19;      // half the box width
const H = 0.32;      // top of the rim
const SOIL = H - 0.05;

export function buildPlanter(lib: StyleLibrary, b: PartBuilder) {
  const rnd = mulberry32(77);
  const tier = b.lod, fine = tier !== 'low';
  const sheet = lib.preset('sheet'), steel = lib.preset('frame'), dark = lib.preset('framePainted');
  const soil = lib.custom('props:soil', { finish: 'rubber', pattern: 'plain', color: PALETTE.graphite, relief: 3 });
  // Leaves on the plain pattern: the brushed pattern the conifer uses runs in bands across strap blades.
  const leaves = lib.custom('props:leaf', { finish: 'rubber', pattern: 'plain', color: LEAF_GREEN, relief: 1.4, envIntensity: 0.5 });
  leaves.side = T.DoubleSide;
  const bloom = lib.custom('props:bloom-cream', { finish: 'rubber', pattern: 'plain', color: BLOOM, envIntensity: 0.45 });

  // Trough: four wall plates with real thickness, standing on a base tray.
  const wall = 0.016, h0 = 0.05;
  for (const [x, z, w, d] of [[0, S - wall / 2, 2 * S, wall], [0, -S + wall / 2, 2 * S, wall], [S - wall / 2, 0, wall, 2 * S - 2 * wall], [-S + wall / 2, 0, wall, 2 * S - 2 * wall]] as const) {
    b.box(sheet, [w, H - h0, d], { position: [x, h0 + (H - h0) / 2, z] }, fine ? 0.004 : 0);
  }
  b.box(dark, [2 * S - 0.01, 0.02, 2 * S - 0.01], { position: [0, h0 + 0.01, 0] }, 0);
  // Rolled rim: four bars proud of the walls.
  for (const [x, z, w, d] of [[0, S, 2 * S + 0.03, 0.03], [0, -S, 2 * S + 0.03, 0.03], [S, 0, 0.03, 2 * S - 0.03], [-S, 0, 0.03, 2 * S - 0.03]] as const) {
    b.box(steel, [w, 0.022, d], { position: [x, H - 0.011, z] }, fine ? 0.006 : 0);
  }
  // Corner angles running down to feet.
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    b.box(dark, [0.035, H - 0.02, 0.035], { position: [sx * (S - 0.008), (H - 0.02) / 2, sz * (S - 0.008)] }, fine ? 0.004 : 0);
    if (fine) b.box(dark, [0.06, 0.012, 0.06], { position: [sx * (S - 0.01), 0.006, sz * (S - 0.01)] }, 0);
  }
  if (fine) {
    // Stiffening rib across each face and a drain spout at the front.
    for (const s of [1, -1]) b.box(dark, [2 * S - 0.06, 0.025, 0.012], { position: [0, 0.16, s * (S + 0.005)] }, 0);
    for (const s of [1, -1]) b.box(dark, [0.012, 0.025, 2 * S - 0.06], { position: [s * (S + 0.005), 0.16, 0] }, 0);
    b.cylinder(steel, 0.012, 0.012, 0.05, { position: [0.1, 0.075, S + 0.02], rotation: [Math.PI / 2, 0, 0] }, { segments: 8 });
  }

  // Soil surface, slightly mounded.
  b.extrude(soil, rect(-S + wall, -S + wall, S - wall, S - wall), 0.02, { position: [0, SOIL - 0.02, 0], rotation: [-Math.PI / 2, 0, 0] }, 0);
  if (fine) b.cylinder(soil, 0.12, 0.16, 0.025, { position: [0, SOIL + 0.01, 0] }, { segments: 9 });

  // Strap leaves in three clumps.
  const clumps = tier === 'high' ? [[-0.07, -0.06, 9], [0.08, -0.03, 8], [-0.02, 0.08, 8]] : tier === 'medium' ? [[-0.06, -0.04, 7], [0.06, 0.05, 6]] : [[0, 0, 6]];
  const steps = tier === 'high' ? 4 : tier === 'medium' ? 3 : 2;
  for (const [cx, cz, n] of clumps) {
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const height = 0.16 + rnd() * 0.16;
      b.geometry(leaves, bladeGeometry(height, 0.035 + rnd() * 0.015, 0.06 + rnd() * 0.12, steps),
        { position: [cx + (rnd() - 0.5) * 0.03, SOIL, cz + (rnd() - 0.5) * 0.03], rotation: [0, yaw, 0] });
    }
  }
  // Flower stems: each bends in a gentle curve to a flat cluster of florets (a yarrow-like umbel).
  const flowers = tier === 'high' ? 6 : tier === 'medium' ? 4 : 2;
  const florets = tier === 'high' ? 7 : tier === 'medium' ? 5 : 3;
  for (let i = 0; i < flowers; i++) {
    const a = (i / flowers) * Math.PI * 2 + 0.4 + (rnd() - 0.5) * 0.5, r = 0.04 + rnd() * 0.09;
    const height = 0.16 + rnd() * 0.2, lean = 0.05 + rnd() * 0.07, heading = rnd() * Math.PI * 2;
    // Stem centre line: rises, drifts sideways and straightens towards the head.
    const dx = Math.cos(heading) * lean, dz = Math.sin(heading) * lean;
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0), new T.Vector3(dx * 0.35, height * 0.38, dz * 0.35),
      new T.Vector3(dx * 0.95, height * 0.74, dz * 0.95), new T.Vector3(dx * 1.05, height, dz * 1.05),
    ]);
    const top = curve.getPoint(1);
    b.within({ position: [Math.cos(a) * r, SOIL, Math.sin(a) * r] }, () => {
      b.geometry(leaves, new T.TubeGeometry(curve, tier === 'low' ? 2 : 4, 0.0035, 3, false));
      for (let f = 0; f < florets; f++) {
        // One floret in the middle, the rest on a ring a little lower: a flat, slightly domed head.
        const ring = f === 0 ? 0 : 0.013 + rnd() * 0.007, t = (f / Math.max(1, florets - 1)) * Math.PI * 2 + rnd() * 0.5;
        const size = 0.005 + rnd() * 0.0025;
        b.geometry(bloom, new T.OctahedronGeometry(size, 0), { position: [top.x + Math.cos(t) * ring, top.y + (f === 0 ? 0.003 : 0) - ring * 0.2, top.z + Math.sin(t) * ring], rotation: [0, t, 0], scale: [1, 0.55, 1] });
      }
    });
  }
  // Moisture probe: a steel stake with a small cased head and a cyan pilot LED.
  if (fine) {
    b.cylinder(steel, 0.004, 0.004, 0.16, { position: [0.13, SOIL + 0.06, 0.13] }, { segments: 4 });
    b.box(dark, [0.03, 0.045, 0.02], { position: [0.13, SOIL + 0.15, 0.13], rotation: [0, Math.PI / 4, 0] }, 0.003);
    const led = lib.createGlow(PALETTE.cyan, GLOW.pilot);
    b.box(led, [0.008, 0.008, 0.004], { position: [0.137, SOIL + 0.158, 0.137], rotation: [0, Math.PI / 4, 0] }, 0);
  }
}
