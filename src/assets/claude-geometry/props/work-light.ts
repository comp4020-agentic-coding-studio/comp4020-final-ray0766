import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW, PALETTE } from '../style/tokens.ts';

// Sodium work light: the stand-in for the main project's "lamp" (footprint
// radius 0.26 m, about 2.1 m tall). A square hollow-section post on a bolted
// base plate and a small cast plinth, hazard banding at knee height, a
// junction box with its conduit, and a cantilever arm carrying a finned lamp
// head tilted down over the front (+Z). The lens is the only emitter.

const POST = 0.085, TOP = 2.12;
/** The lamp head's frame and the lens's light point in it; the village garden lantern lights from the same point (village.ts). */
export const WORK_LIGHT_HEAD = { position: [0, TOP - 0.05 - 0.035, 0.2 - 0.04] as [number, number, number], rotation: [-0.26, 0, 0] as [number, number, number] };
export const WORK_LIGHT_LENS: [number, number, number] = [0, -0.06, 0.06];

export function buildWorkLight(lib: StyleLibrary, b: PartBuilder) {
  const fine = b.lod !== 'low', high = b.lod === 'high';
  const dark = lib.preset('framePainted'), steel = lib.preset('frame'), sheet = lib.preset('sheet');

  // Plinth and base plate with anchor bolts.
  b.box(lib.preset('concrete'), [0.34, 0.12, 0.34], { position: [0, 0.02, 0] }, fine ? 0.015 : 0);
  b.box(steel, [0.24, 0.016, 0.24], { position: [0, 0.088, 0] }, fine ? 0.003 : 0);
  if (fine) for (const [x, z] of [[0.09, 0.09], [-0.09, 0.09], [0.09, -0.09], [-0.09, -0.09]]) {
    b.bolt(steel, { position: [x, 0.096, z] }, 0.013);
    if (high) b.cylinder(steel, 0.007, 0.007, 0.03, { position: [x, 0.11, z] }, { segments: 6 });
  }
  // Post with gussets at the foot.
  b.box(dark, [POST, TOP - 0.096, POST], { position: [0, 0.096 + (TOP - 0.096) / 2, 0] }, fine ? 0.008 : 0);
  if (fine) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    b.extrude(dark, [[0, 0], [0.07, 0], [0, 0.12]], 0.008, { position: [Math.sin(a) * POST / 2, 0.096, Math.cos(a) * POST / 2], rotation: [0, a - Math.PI / 2, 0] }, 0);
  }
  // Safety banding at knee height: two painted amber collars.
  for (const y of [0.36, 0.56]) b.box(lib.preset('accent'), [POST + 0.006, 0.1, POST + 0.006], { position: [0, y, 0] }, fine ? 0.008 : 0);
  // Junction box on the back face, conduit down into the plinth.
  b.box(sheet, [0.13, 0.2, 0.075], { position: [0, 1.0, -POST / 2 - 0.04] }, fine ? 0.01 : 0);
  b.cylinder(dark, 0.013, 0.013, 0.84, { position: [0.035, 0.52, -POST / 2 - 0.02] }, { segments: 6 });
  if (fine) {
    b.box(steel, [0.11, 0.03, 0.01], { position: [0, 1.06, -POST / 2 - 0.08] }, 0);
    b.cylinder(steel, 0.02, 0.02, 0.03, { position: [0.035, 0.885, -POST / 2 - 0.02] }, { segments: 8 }); // cable gland
  }
  // Post cap and the cantilever arm with a diagonal brace.
  b.box(steel, [POST + 0.02, 0.02, POST + 0.02], { position: [0, TOP + 0.01, 0] }, fine ? 0.004 : 0);
  // A short arm keeps the head within 0.36 m of the post, so it cannot reach into a neighbour placed at the minimum spacing.
  const armY = TOP - 0.05, reach = 0.2;
  b.box(dark, [0.05, 0.05, reach], { position: [0, armY, reach / 2 - 0.02] }, fine ? 0.006 : 0);
  // Brace from the post face up to the arm's underside (its far end rises, so the rotation about X is negative).
  if (fine) b.box(dark, [0.03, 0.03, 0.17], { position: [0, armY - 0.0875, 0.1], rotation: [-Math.atan2(0.125, 0.1175), 0, 0] }, 0.004);

  // Lamp head: a cobra-head housing with its nose lifted 15°, so the lens on
  // its underside throws light down and forward; cooling fins on top.
  b.within(WORK_LIGHT_HEAD, () => {
    b.box(sheet, [0.2, 0.07, 0.24], { position: [0, 0, 0.06] }, fine ? 0.012 : 0);
    if (fine) for (let i = 0; i < (high ? 5 : 3); i++) {
      const x = -0.08 + i * (0.16 / ((high ? 5 : 3) - 1));
      b.box(steel, [0.012, 0.035, 0.2], { position: [x, 0.05, 0.06] }, 0);
    }
    b.box(steel, [0.21, 0.02, 0.25], { position: [0, -0.04, 0.06] }, fine ? 0.004 : 0);
    const lamp = lib.createGlow(PALETTE.sodium, GLOW.hot);
    b.box(lamp, [0.15, 0.006, 0.18], { position: [0, -0.052, 0.06] }, 0);
    // The lens throws real light down and forward (src/style/practical.ts).
    b.emitter('flood', WORK_LIGHT_LENS, [0, -1, 0]);
    b.box(lib.glass('clear'), [0.17, 0.006, 0.2], { position: [0, -0.058, 0.06] }, 0);
    // Yoke plates either side.
    if (fine) for (const s of [1, -1]) b.box(dark, [0.012, 0.08, 0.06], { position: [s * 0.107, 0.01, -0.03] }, 0.003);
  });
}
