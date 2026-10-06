import { edgeAngles, extrudeZY, small, SLAB } from './kit.ts';
import type { Kit } from './kit.ts';

// Street and landing-pad parts. Same frames as the rest of the kit: cell parts
// have their origin at the cell centre with y = 0 on the walking surface;
// edge parts sit on the cell edge with +Z towards the neighbouring cell.
// With scans on, the paving, asphalt and pad surfaces carry the CC0 texture
// sets at their real sizes, so joints, aggregate and wear read at 1:1 scale.

/** Concrete sub-base shared by the ground-level surfaces (y −0.16 … −0.05). */
function subBase(k: Kit, top = -0.05) {
  const h = SLAB + top;
  k.b.box(k.m('concrete'), [0.98, h, 0.98], { position: [0, -SLAB + h / 2, 0] }, small(k, 0.008));
}

/**
 * Footway: 50 mm precast paving on a concrete sub-base, with a sealed joint
 * along the −X edge. Surface water runs to the gully in the kerb.
 */
export function streetPaving(k: Kit) {
  const { b } = k;
  subBase(k);
  b.box(k.m('pavers'), [1.0, 0.05, 1.0], { position: [0, -0.025, 0] }, small(k, 0.003));
  if (!k.low) b.box(k.m('post'), [0.006, 0.003, 1.0], { position: [-0.497, 0.0005, 0] }, 0);
}

/**
 * Carriageway: asphalt on the sub-base. Half a dashed centre line runs along
 * the +Z edge, so two rows turned towards each other (rot 0 and rot 2) make a
 * two-lane road with one 0.1 m line between them.
 */
export function streetRoad(k: Kit) {
  const { b } = k;
  subBase(k, -0.06);
  b.box(k.m('asphalt'), [1.0, 0.06, 1.0], { position: [0, -0.03, 0] }, 0);
  // One 0.5 m dash per cell, so neighbouring cells make a regular dashed line.
  // Asphalt is laid continuously, so unlike the paving it has no joint at the cell edge.
  b.box(k.m('marking'), [0.5, 0.003, 0.05], { position: [0, 0.0015, 0.475] }, 0);
}

/**
 * Kerb on a cell edge: two 0.5 m precast units with a sealed joint, a
 * chamfered top and a steel nosing angle, and a gully grate on the +Z side.
 */
export function streetKerb(k: Kit) {
  const { b } = k;
  for (const x of [-0.25, 0.25]) {
    // Profile in the Z–Y plane: 0.15 m wide, 0.14 m up stand, chamfer on the road (+Z) side.
    extrudeZY(k, k.m('concrete'), [[-0.075, -0.05], [0.075, -0.05], [0.075, 0.11], [0.045, 0.14], [-0.075, 0.14]], x - 0.2475, x + 0.2475);
  }
  if (!k.low) b.box(k.m('post'), [0.005, 0.19, 0.15], { position: [0, 0.045, 0] }, 0);
  b.box(k.m('steel'), [1.0, 0.012, 0.012], { position: [0, 0.137, 0.06], rotation: [Math.PI / 4, 0, 0] }, 0);
  // Gully: a cast frame and a bar grate set into the road surface.
  b.box(k.m('steel'), [0.32, 0.012, 0.16], { position: [0.18, -0.002, 0.16] }, small(k, 0.003));
  if (!k.low) for (let i = 0; i < 5; i++) b.box(k.m('post'), [0.022, 0.004, 0.12], { position: [0.06 + i * 0.06, 0.004, 0.16] }, 0);
}

/**
 * Low service pipe rack along a cell edge, on the +Z side: a lagged supply
 * main and a bare return on two bolted stands, a cable conduit underneath and
 * a flanged joint at the +X end so neighbouring runs read as one line.
 */
export function streetPipes(k: Kit) {
  const { b } = k;
  const z = 0.16, mainY = 0.36, returnY = 0.36;
  for (const x of [-0.3, 0.3]) {
    b.box(k.m('steel'), [0.18, 0.012, 0.12], { position: [x, 0.006, z] }, small(k, 0.003));
    b.box(k.m('post'), [0.05, 0.42, 0.05], { position: [x, 0.22, z] }, small(k, 0.004));
    b.box(k.m('post'), [0.05, 0.04, 0.34], { position: [x, 0.42, z] }, small(k, 0.004));
    if (k.hardware) for (const dz of [-0.04, 0.04]) b.bolt(k.m('steel'), { position: [x - 0.06, 0.012, z + dz] }, 0.009);
    // U-bolt saddles on both pipes.
    if (!k.low) for (const pz of [z - 0.08, z + 0.08]) b.box(k.m('steel'), [0.03, 0.03, 0.12], { position: [x, mainY + 0.06, pz] }, 0);
  }
  const along = { rotation: [0, 0, Math.PI / 2] as [number, number, number] };
  // Supply main: insulation under a painted sheet jacket, with banding straps.
  b.cylinder(k.m('leaf'), 0.06, 0.06, 1.0, { position: [0, mainY + 0.065, z - 0.08], ...along });
  if (!k.low) for (const x of [-0.45, 0.05]) b.cylinder(k.m('steel'), 0.062, 0.062, 0.012, { position: [x, mainY + 0.065, z - 0.08], ...along });
  // Return: bare steel with a bolted flange pair at the joint.
  b.cylinder(k.m('bright'), 0.04, 0.04, 1.0, { position: [0, returnY + 0.045, z + 0.08], ...along });
  if (!k.low) for (const x of [0.47, 0.5]) b.cylinder(k.m('steel'), 0.062, 0.062, 0.022, { position: [x - 0.011, returnY + 0.045, z + 0.08], ...along });
  // Cable conduit hung under the cross arms.
  b.cylinder(k.m('steel'), 0.022, 0.022, 1.0, { position: [0, 0.37, z], ...along });
}

/**
 * Street light standing on a footway cell: a tapered octagonal column on a
 * bolted base plate with an access door, an outreach arm towards +Z and a
 * flat luminaire head with a warm diffuser. 3.4 m to the head.
 */
export function serviceLight(k: Kit) {
  const { b } = k;
  const px = -0.3, pz = -0.3, top = 3.4;
  b.box(k.m('steel'), [0.26, 0.02, 0.26], { position: [px, 0.01, pz] }, small(k, 0.004));
  if (k.hardware) for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) b.bolt(k.m('steel'), { position: [px + dx, 0.02, pz + dz] }, 0.012);
  b.cylinder(k.m('post'), 0.045, 0.07, top, { position: [px, top / 2 + 0.02, pz] }, { segments: k.low ? 6 : 8 });
  // Access door near the base.
  b.box(k.m('leaf'), [0.07, 0.3, 0.012], { position: [px, 0.55, pz + 0.064] }, small(k, 0.002));
  // Outreach arm and head.
  b.box(k.m('post'), [0.05, 0.05, 0.7], { position: [px, top - 0.02, pz + 0.33] }, small(k, 0.004));
  b.box(k.m('leaf'), [0.24, 0.07, 0.42], { position: [px, top - 0.045, pz + 0.66] }, small(k, 0.008));
  b.box(k.m('lamp'), [0.18, 0.008, 0.34], { position: [px, top - 0.084, pz + 0.66] }, 0);
  b.emitter('street', [px, top - 0.09, pz + 0.66], [0, -1, 0]);
  // Cable gland and a small identification plate.
  if (!k.low) {
    b.cylinder(k.m('steel'), 0.018, 0.018, 0.04, { position: [px, top - 0.02, pz + 0.05], rotation: [Math.PI / 2, 0, 0] });
    b.box(k.m('marking'), [0.06, 0.09, 0.004], { position: [px, 1.6, pz + 0.056] }, 0);
  }
}

/**
 * One quarter of a 2×2 landing pad: a cast deck with sealed joints, a quarter
 * of the touchdown ring centred on the cell's (−X, −Z) corner, and recessed
 * edge lights on the outer edges. Four quarters turned 0–3 around one grid
 * vertex make the whole pad.
 */
export function padQuarter(k: Kit) {
  const { b } = k;
  b.box(k.m('concrete'), [0.98, SLAB - 0.02, 0.98], { position: [0, -SLAB / 2 - 0.01, 0] }, small(k, 0.006));
  edgeAngles(k, -0.01, 0.02);
  // Touchdown ring, a quarter per tile; drawn as a flat extrusion just above the deck.
  const arc = (r: number) => Array.from({ length: k.low ? 7 : 17 }, (_, i) => {
    const a = (i / (k.low ? 6 : 16)) * Math.PI / 2;
    return [-0.5 + r * Math.cos(a), -0.5 + r * Math.sin(a)] as [number, number];
  });
  const ring = (r0: number, r1: number) => {
    const outer = arc(r1), inner = arc(r0).reverse();
    // Shape y maps to −Z after the −90° turn about X.
    b.extrude(k.m('marking'), [...outer, ...inner].map(([x, z]) => [x, -z] as [number, number]), 0.003, { position: [0, 0.0005, 0], rotation: [-Math.PI / 2, 0, 0] });
  };
  ring(0.62, 0.74);
  if (!k.low) ring(0.86, 0.9);
  // Hazard chevrons along the outer edges.
  b.box(k.m('hazard'), [0.5, 0.002, 0.06], { position: [0.1, 0.001, 0.44] }, 0);
  b.box(k.m('hazard'), [0.06, 0.002, 0.5], { position: [0.44, 0.001, 0.1] }, 0);
  // Recessed edge lights: steel bezels with warm lenses.
  for (const [x, z] of [[0.43, 0.43], [0.43, -0.25], [-0.25, 0.43]]) {
    b.cylinder(k.m('steel'), 0.045, 0.05, 0.012, { position: [x, 0.002, z] }, { segments: k.low ? 6 : 12 });
    b.cylinder(k.m('lamp'), 0.03, 0.03, 0.006, { position: [x, 0.008, z] }, { segments: k.low ? 6 : 12 });
    b.emitter('pad', [x, 0.011, z], [0, 1, 0]);
  }
  // Tie-down eye.
  if (!k.low) b.box(k.m('steel'), [0.06, 0.012, 0.06], { position: [0.05, 0.004, 0.05] }, small(k, 0.003));
}
