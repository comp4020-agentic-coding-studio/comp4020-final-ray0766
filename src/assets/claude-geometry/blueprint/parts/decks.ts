import { extrudeZY, slab, small, SLAB } from './kit.ts';
import type { Kit } from './kit.ts';

// Cell parts that form the deck of a level: origin at the cell centre, y = 0 on
// the walking surface, structure below down to −0.16 m (one slab).

/** One 1×1 m cell of floor: concrete slab with a steel tread deck and edge angles (reference module). */
export function floorDeck(k: Kit) {
  const s = SLAB;
  k.b.box(k.m('concrete'), [0.98, s - 0.03, 0.98], { position: [0, -s / 2 - 0.015, 0] }, 0.01);
  k.b.box(k.m('tread'), [0.96, 0.03, 0.96], { position: [0, -0.015, 0] }, 0.004);
  const angle = k.m('steel');
  for (const [x, z, w, d] of [[0, 0.49, 1, 0.02], [0, -0.49, 1, 0.02], [0.49, 0, 0.02, 0.96], [-0.49, 0, 0.02, 0.96]] as const) {
    k.b.box(angle, [w, 0.035, d], { position: [x, -0.0175, z] }, 0.003);
  }
  // Countersunk fixings holding the plate to the slab.
  for (const [x, z] of [[-0.43, -0.43], [0.43, -0.43], [-0.43, 0.43], [0.43, 0.43]]) k.b.bolt(k.m('steel'), { position: [x, -0.006, z] }, 0.012);
}

/**
 * Open grating on a painted channel frame: bearing bars every 34 mm with
 * cross rods, two bearers below. Light comes through, so it reads as a
 * catwalk or service deck rather than a room floor.
 */
export function grateDeck(k: Kit) {
  const { b } = k;
  const frame = k.m('post'), bar = k.m('steel');
  // Perimeter channels, full slab depth so walls still land on steel.
  for (const z of [-0.48, 0.48]) b.box(frame, [1.0, 0.12, 0.04], { position: [0, -0.06, z] }, small(k, 0.004));
  for (const x of [-0.48, 0.48]) b.box(frame, [0.04, 0.12, 0.92], { position: [x, -0.06, 0] }, small(k, 0.004));
  for (const z of [-0.16, 0.16]) b.box(frame, [0.92, 0.09, 0.05], { position: [0, -0.075, z] }, small(k, 0.003));
  // Bearing bars on edge, running along z.
  const pitch = k.low ? 0.08 : 0.034;
  const n = Math.floor(0.9 / pitch);
  for (let i = 0; i <= n; i++) b.box(bar, [0.005, 0.03, 0.92], { position: [-0.45 + i * (0.9 / n), -0.015, 0] }, 0);
  // Cross rods pressed into the bar tops.
  if (!k.low) for (let i = 0; i < 9; i++) b.box(bar, [0.92, 0.006, 0.006], { position: [0, -0.004, -0.4 + i * 0.1] }, 0);
  // Saddle clips at the corners.
  for (const [x, z] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) b.bolt(k.m('bright'), { position: [x, 0, z] }, 0.011);
}

/**
 * Flat roof: slab, a rubber membrane over insulation, then four precast
 * pavers on the membrane with open joints, so the roof can be walked on.
 */
export function roofDeck(k: Kit) {
  const { b } = k;
  slab(k);
  // Membrane over insulation, full cell so neighbouring roofs read as one sheet.
  b.box(k.m('membrane'), [1.0, 0.035, 1.0], { position: [0, -0.0125, 0] }, small(k, 0.004));
  const pv = 0.46;
  for (const x of [-0.245, 0.245]) for (const z of [-0.245, 0.245]) {
    b.box(k.m('concrete'), [pv, 0.04, pv], { position: [x, 0.025, z] }, 0.008);
  }
  ceiling(k);
}

/**
 * The underside of a roof deck is the ceiling of the room below: a linear
 * luminaire on drop rods across the cell and a cable tray beside it, both
 * clear of the 1.86 m door opening (they sit 0.1–0.2 m under a 2.04 m soffit).
 */
function ceiling(k: Kit) {
  const { b } = k;
  const soffit = -SLAB;
  // Luminaire: folded steel body, warm diffuser, end caps.
  b.box(k.m('leaf'), [0.72, 0.05, 0.12], { position: [0, soffit - 0.075, -0.05] }, small(k, 0.006));
  b.box(k.m('lamp'), [0.66, 0.008, 0.075], { position: [0, soffit - 0.1, -0.05] }, 0);
  if (!k.low) for (const x of [-0.3, 0.3]) b.cylinder(k.m('steel'), 0.005, 0.005, 0.05, { position: [x, soffit - 0.025, -0.05] }, { segments: 6 });
  // Cable tray: a shallow U on two hangers, running the length of the cell.
  if (k.low) return;
  const ty = soffit - 0.14, tz = 0.3;
  extrudeZY(k, k.m('steel'), [[tz - 0.05, ty + 0.035], [tz - 0.05, ty], [tz + 0.05, ty], [tz + 0.05, ty + 0.035], [tz + 0.046, ty + 0.035], [tz + 0.046, ty + 0.004], [tz - 0.046, ty + 0.004], [tz - 0.046, ty + 0.035]], -0.5, 0.5);
  for (const x of [-0.25, 0.25]) b.box(k.m('steel'), [0.012, 0.14, 0.012], { position: [x, soffit - 0.07, tz] }, 0);
  b.box(k.m('membrane'), [1.0, 0.018, 0.06], { position: [0, ty + 0.013, tz] }, 0);
}

/**
 * Mono-pitch roof panel over one cell: the slab closes the room below, an
 * insulated wedge rises 0.36 m from the eave (+Z) to the high side (−Z), and a
 * standing-seam sheet sits on top with a box gutter on brackets at the eave.
 */
export const SLOPE_RISE = 0.36;
export function slopeRoof(k: Kit) {
  const { b } = k;
  const R = SLOPE_RISE, a = Math.atan2(R, 1), L = Math.hypot(1, R), over = 0.1;
  slab(k);
  // Insulated wedge; its end faces are the gable cladding.
  extrudeZY(k, k.m('skin'), [[0.5, -0.03], [-0.5, -0.03], [-0.5, R], [0.5, 0]], -0.5, 0.5);
  // Roof sheet tilted to the pitch, overhanging the eave.
  const n = [0, Math.cos(a), Math.sin(a)] as const;              // outward normal of the slope
  const down = [0, -Math.sin(a), Math.cos(a)] as const;          // down-slope direction
  const at = (lift: number, along: number): [number, number, number] => [0, R / 2 + n[1] * lift + down[1] * along, n[2] * lift + down[2] * along];
  b.box(k.m('leaf'), [1.0, 0.012, L + over], { position: at(0.008, over / 2), rotation: [a, 0, 0] }, small(k, 0.003));
  // Standing seams on a 0.25 m module, so they line up across neighbouring panels.
  for (const x of [-0.375, -0.125, 0.125, 0.375]) {
    b.box(k.m('leaf'), [0.014, 0.034, L + over], { position: [x, at(0.03, over / 2)[1], at(0.03, over / 2)[2]], rotation: [a, 0, 0] }, small(k, 0.004));
  }
  // Ridge flashing over the high edge, with a drip down the back.
  b.box(k.m('bright'), [1.0, 0.01, 0.14], { position: [0, R + 0.045, -0.47], rotation: [a * 0.5, 0, 0] }, 0);
  b.box(k.m('bright'), [1.0, 0.07, 0.01], { position: [0, R + 0.005, -0.505] }, 0);
  // Fascia closing the eave.
  b.box(k.m('post'), [1.0, 0.13, 0.025], { position: [0, -0.07, 0.5125] }, small(k, 0.004));
  // Box gutter: a folded U section running the width of the panel.
  const t = 0.008, w = 0.13, d = 0.1;
  const gz = 0.53 + w / 2, gy = -0.03 - over * Math.sin(a);
  extrudeZY(k, k.m('bright'), [[gz - w / 2, gy], [gz - w / 2, gy - d], [gz + w / 2, gy - d], [gz + w / 2, gy + 0.01], [gz + w / 2 - t, gy + 0.01], [gz + w / 2 - t, gy - d + t], [gz - w / 2 + t, gy - d + t], [gz - w / 2 + t, gy]], -0.5, 0.5);
  // Gutter brackets strapped over the top.
  if (!k.low) for (const x of [-0.3, 0.3]) b.box(k.m('steel'), [0.025, 0.006, w + 0.03], { position: [x, gy + 0.012, gz] }, 0);
}
