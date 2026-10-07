import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { PALETTE } from '../style/tokens.ts';
import { circle, cleanPaint } from './shapes.ts';

// Steel bench: the stand-in for the main project's "bench" (footprint radius
// 0.65 m, about 0.9 m tall). Two laser-cut end frames with lightening holes
// carry pressed, painted steel slats on seat rails; feet are bolted down. Seat height
// 0.44 m, length 1.16 m, depth 0.5 m, so the far corners sit 0.63 m from the
// origin. The sitter faces +Z.

const LEN = 1.16, SEAT = 0.44;

export function buildBench(lib: StyleLibrary, b: PartBuilder) {
  const tier = b.lod, fine = tier !== 'low', high = tier === 'high';
  const frame = lib.preset('framePainted'), steel = lib.preset('frame');
  // Pressed slats painted muted teal: steel street furniture, a cool note beside the warm lights.
  const slat = cleanPaint(lib, 'props:bench-slat', PALETTE.teal);
  const end = LEN / 2 - 0.04;
  // End frame profile in (z, y): a foot, a front leg, the seat arm and a raked back post.
  const profile: [number, number][] = [
    [0.24, 0], [0.24, 0.03], [0.17, 0.05], [0.15, SEAT - 0.05], [0.22, SEAT - 0.02], [0.22, SEAT],
    [-0.13, SEAT], [-0.2, 0.84], [-0.25, 0.84], [-0.19, SEAT - 0.06], [-0.18, 0.05], [-0.24, 0.03], [-0.24, 0],
  ];
  const holes = fine ? [circle(0.05, high ? 12 : 8, 0.06, 0.22), circle(0.035, high ? 10 : 6, -0.09, 0.22)] : [];
  for (const s of [1, -1]) {
    // Outline drawn in (z, y); turning it a quarter about Y lays it in the end plane.
    b.extrude(frame, profile.map(([z, y]) => [-z, y] as [number, number]), 0.03, { position: [s * end - 0.015, 0, 0], rotation: [0, Math.PI / 2, 0] }, fine ? 0.004 : 0, holes.map(h => h.map(([z, y]) => [-z, y] as [number, number])));
    // Bolted foot plates.
    b.box(steel, [0.08, 0.012, 0.12], { position: [s * end, 0.006, 0.18] }, 0);
    b.box(steel, [0.08, 0.012, 0.12], { position: [s * end, 0.006, -0.18] }, 0);
    if (high) for (const z of [0.21, -0.21]) b.bolt(steel, { position: [s * end + 0.025, 0.012, z] }, 0.01);
  }
  // Seat rails between the frames and a stretcher low at the back.
  for (const z of [0.15, -0.12]) b.box(steel, [2 * end, 0.04, 0.03], { position: [0, SEAT - 0.04, z] }, fine ? 0.004 : 0);
  b.cylinder(steel, 0.016, 0.016, 2 * end, { position: [0, 0.16, -0.17], rotation: [0, 0, Math.PI / 2] }, { segments: fine ? 10 : 6 });
  // Seat slats with gaps, slightly crowned front edge.
  const slats = 5, depth = 0.38;
  for (let i = 0; i < slats; i++) {
    const z = 0.2 - (i + 0.5) * (depth / slats);
    b.box(slat, [LEN, 0.022, depth / slats - 0.014], { position: [0, SEAT + 0.011, z] }, fine ? 0.005 : 0);
  }
  // Back slats on the raked posts.
  const rake = Math.atan2(0.07, 0.84 - SEAT);
  for (let i = 0; i < 3; i++) {
    const y = SEAT + 0.12 + i * 0.1, z = -0.13 - (y - SEAT) * Math.tan(rake) + 0.012; // on the front face of the posts
    b.box(slat, [LEN, 0.07, 0.02], { position: [0, y, z], rotation: [-rake, 0, 0] }, fine ? 0.005 : 0);
  }
  if (fine) {
    // Slat fixings: one bolt per slat at each end.
    for (let i = 0; i < slats && high; i++) {
      const z = 0.2 - (i + 0.5) * (depth / slats);
      for (const s of [1, -1]) b.bolt(steel, { position: [s * end, SEAT + 0.022, z] }, 0.008);
    }
    // Armrests capping the end frames.
    for (const s of [1, -1]) b.box(steel, [0.05, 0.03, 0.38], { position: [s * (end + 0.005), SEAT + 0.2, 0.02] }, 0.006);
    for (const s of [1, -1]) b.box(frame, [0.03, 0.2, 0.03], { position: [s * end, SEAT + 0.1, 0.17] }, 0.004);
  }
}
