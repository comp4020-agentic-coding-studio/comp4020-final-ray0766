import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { circle, LAY_FLAT } from './shapes.ts';

// Anti-slip deck stepping pad: the stand-in for the main project's "path"
// stone (footprint radius 0.42 m). A hexagonal tread plate on an angle-iron
// ring, set into a cast bedding pad that runs a few centimetres into the
// ground so uneven terrain never shows a gap under it. Pads may overlap each
// other to form a walkway (main project rule), so the model stays low: the
// tread surface is 9 cm above the local origin.

const R = 0.4;

export function buildDeckPad(lib: StyleLibrary, b: PartBuilder) {
  const fine = b.lod !== 'low';
  const deck = lib.preset('deck'), steel = lib.preset('frame'), dark = lib.preset('framePainted');
  const hex = (r: number) => circle(r, 6); // flat edges face ±Z

  // Bedding pad, partly below ground.
  b.extrude(lib.preset('concrete'), hex(R + 0.02), 0.1, { position: [0, -0.06, 0], rotation: LAY_FLAT }, fine ? 0.012 : 0);
  // Angle-iron ring and the tread plate it holds.
  b.extrude(dark, hex(R), 0.035, { position: [0, 0.04, 0], rotation: LAY_FLAT }, 0, [hex(R - 0.04)]);
  b.extrude(deck, hex(R - 0.035), 0.012, { position: [0, 0.067, 0], rotation: LAY_FLAT }, fine ? 0.003 : 0);
  // Hazard nosing on the leading (+Z) edge and its opposite, so the edge of a walkway is visible.
  const edge = R * Math.cos(Math.PI / 6);
  for (const s of [1, -1]) b.box(lib.hazard(), [R * 0.96, 0.014, 0.03], { position: [0, 0.074, s * (edge - 0.035)] }, 0);
  if (!fine) return;
  // Countersunk fixings through the ring into the bedding.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.bolt(steel, { position: [Math.cos(a) * (R - 0.02), 0.075, Math.sin(a) * (R - 0.02)] }, 0.011);
  }
  // Drain slots across the plate.
  for (const x of [-0.12, 0.12]) b.box(dark, [0.03, 0.004, 0.24], { position: [x, 0.08, 0] }, 0);
  // Lifting eye recess at the centre.
  b.cylinder(steel, 0.03, 0.03, 0.006, { position: [0, 0.081, 0] }, { segments: 10 });
}
