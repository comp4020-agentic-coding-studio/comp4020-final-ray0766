import { SCALE } from '../../style/tokens.ts';
import { BEAM, cladding, conduit, extrudeZY, kickPlate, small, TRACK, WALL_H, WALL_T, wallFrame } from './kit.ts';
import type { Kit } from './kit.ts';

// Edge parts that close a storey: origin on the cell edge at the top of the
// slab, x along the edge, +Z exterior. The first three are the material lab's
// reference modules, moved here unchanged in shape.

export function solidWall(k: Kit) {
  wallFrame(k);
  cladding(k, -0.45, 0.45, TRACK, WALL_H - BEAM);
  kickPlate(k, -0.45, 0.45);
  conduit(k, WALL_H - BEAM - 0.12);
}

export function doorWall(k: Kit) {
  const { b } = k;
  wallFrame(k, { track: false });
  const steel = k.m('steel'), leafPaint = k.m('leaf');
  const doorTop = SCALE.doorHeight + 0.02;
  // Jambs and head, deeper than the wall so the opening has a real reveal.
  for (const x of [-0.425, 0.425]) b.box(steel, [0.05, doorTop + 0.05, WALL_T + 0.04], { position: [x, (doorTop + 0.05) / 2, 0] }, 0.006);
  b.box(steel, [0.9, 0.06, WALL_T + 0.04], { position: [0, doorTop + 0.03, 0] }, 0.006);
  // Infill between the head and the beam.
  cladding(k, -0.45, 0.45, doorTop + 0.06, WALL_H - BEAM);
  // Hazard inserts on the jamb faces.
  for (const x of [-0.425, 0.425]) b.box(k.m('hazard'), [0.03, 1.1, 0.004], { position: [x, 0.62, WALL_T / 2 + 0.022] }, 0);
  // Threshold plate.
  b.box(k.m('tread'), [0.8, 0.025, WALL_T + 0.1], { position: [0, 0.0125, 0] }, 0.004);
  // Door leaf, set back from the exterior face.
  const leafW = 0.78, leafH = SCALE.doorHeight - 0.01, z = 0.015;
  b.within({ position: [0, 0.025, z] }, () => {
    b.box(leafPaint, [leafW, leafH, 0.05], { position: [0, leafH / 2, 0] }, 0.008);
    // Raised stiffener panel and a kick plate.
    b.box(leafPaint, [leafW - 0.16, 0.5, 0.012], { position: [0, 0.75, 0.031] }, 0.004);
    b.box(k.m('tread'), [leafW - 0.06, 0.24, 0.008], { position: [0, 0.16, 0.029] }, 0.003);
    // Vision slot with a frame and glass.
    b.box(steel, [0.16, 0.5, 0.02], { position: [0.16, 1.38, 0.03] }, 0.004);
    b.box(k.m('glassSmoked'), [0.11, 0.45, 0.01], { position: [0.16, 1.38, 0.041] }, 0);
    // Lever handle on a rose plate.
    b.box(steel, [0.05, 0.16, 0.012], { position: [0.31, 1.0, 0.031] }, 0.003);
    b.box(k.m('bright'), [0.14, 0.022, 0.022], { position: [0.26, 1.03, 0.06] }, 0.006);
    b.cylinder(k.m('bright'), 0.012, 0.012, 0.04, { position: [0.32, 1.03, 0.043], rotation: [Math.PI / 2, 0, 0] });
    // Hinge knuckles.
    for (const y of [0.25, 0.95, 1.65]) b.cylinder(steel, 0.016, 0.016, 0.12, { position: [-leafW / 2 - 0.005, y, 0.0] });
  });
  // Status lamp: a recessed housing with a short warm strip, not a neon bar.
  b.box(steel, [0.26, 0.06, 0.05], { position: [0, doorTop + 0.11, WALL_T / 2 + 0.03] }, 0.006);
  b.box(k.m('lamp'), [0.2, 0.018, 0.012], { position: [0, doorTop + 0.1, WALL_T / 2 + 0.056] }, 0);
}

export function windowWall(k: Kit) {
  const { b } = k;
  wallFrame(k);
  const sill = 0.86, head = 1.62, half = 0.37;
  cladding(k, -0.45, 0.45, TRACK, sill);
  cladding(k, -0.45, 0.45, head, WALL_H - BEAM);
  cladding(k, -0.45, -half, sill, head);
  cladding(k, half, 0.45, sill, head);
  kickPlate(k, -0.45, 0.45);
  const steel = k.m('steel'), glass = k.m('glass');
  // Window frame with a central mullion; profiles are deeper than the panes.
  const fd = WALL_T + 0.02;
  b.box(steel, [2 * half + 0.04, 0.05, fd], { position: [0, sill + 0.025, 0] }, 0.005);
  b.box(steel, [2 * half + 0.04, 0.05, fd], { position: [0, head - 0.025, 0] }, 0.005);
  for (const x of [-half, half]) b.box(steel, [0.05, head - sill, fd], { position: [x, (sill + head) / 2, 0] }, 0.005);
  b.box(steel, [0.04, head - sill - 0.1, fd - 0.04], { position: [0, (sill + head) / 2, 0] }, 0.004);
  // Double glazing: two panes per side.
  for (const x of [-half / 2 - 0.01, half / 2 + 0.01]) for (const z of [0.035, -0.035]) {
    b.box(glass, [half - 0.06, head - sill - 0.1, 0.008], { position: [x, (sill + head) / 2, z] }, 0);
  }
  // Sloped sill flashing and a sun hood on brackets.
  // Sill flashing in bare steel: polished alloy facing up mirrors the work lights and blows out.
  b.box(k.m('steel'), [2 * half + 0.12, 0.02, 0.1], { position: [0, sill - 0.005, WALL_T / 2 + 0.04], rotation: [0.18, 0, 0] }, 0.004);
  b.box(k.m('post'), [2 * half + 0.14, 0.018, 0.2], { position: [0, head + 0.07, WALL_T / 2 + 0.1], rotation: [0.2, 0, 0] }, 0.004);
  for (const x of [-half, half]) b.box(steel, [0.016, 0.1, 0.16], { position: [x, head + 0.03, WALL_T / 2 + 0.07] }, 0.003);
}

/**
 * Shed wall: a precast concrete upstand, then trapezoidal steel sheet fixed to
 * two girts. There is no inner skin, so from inside you see the girts and the
 * back of the sheet, as in a real uninsulated store.
 */
export function corrugatedWall(k: Kit) {
  const { b } = k;
  wallFrame(k, { track: false });
  const upstand = 0.32, top = WALL_H - BEAM;
  // Precast upstand with a chamfered top edge and a drip flashing over it.
  b.box(k.m('concrete'), [0.9, upstand, WALL_T], { position: [0, upstand / 2, 0] }, 0.012);
  b.box(k.m('steel'), [0.9, 0.012, 0.07], { position: [0, upstand + 0.004, WALL_T / 2 + 0.008], rotation: [0.25, 0, 0] }, small(k, 0.003));
  // Girts span post to post behind the sheet.
  const girtZ = WALL_T / 2 - 0.06;
  for (const y of [0.86, 1.46]) {
    b.box(k.m('steel'), [0.9, 0.08, 0.05], { position: [0, y, girtZ] }, small(k, 0.004));
    // Cleats where each girt meets a post.
    if (!k.low) for (const x of [-0.43, 0.43]) b.box(k.m('steel'), [0.04, 0.1, 0.07], { position: [x, y, girtZ - 0.01] }, small(k, 0.003));
  }
  // The sheet itself; the corrugation lives in the normal map at 0.1 m pitch.
  const sheetZ = WALL_T / 2 - 0.016;
  b.box(k.m('corrugated'), [0.9, top - upstand - 0.02, 0.022], { position: [0, (upstand + 0.02 + top) / 2, sheetZ] }, 0.004);
  // Self-drilling fixings on every other valley along each girt.
  for (const y of [0.86, 1.46]) for (const x of [-0.35, -0.15, 0.05, 0.25]) {
    k.b.bolt(k.m('bright'), { position: [x, y, sheetZ + 0.011], rotation: [Math.PI / 2, 0, 0] }, 0.007);
  }
  // Head flashing tucked under the beam.
  b.box(k.m('steel'), [0.9, 0.05, 0.03], { position: [0, top - 0.02, WALL_T / 2 + 0.006] }, small(k, 0.003));
}

/**
 * Wall with a ventilation louvre: an opening at chest height filled with
 * inclined blades in a deep frame, a dark mesh behind them and a weather hood.
 */
export function louvreWall(k: Kit) {
  const { b } = k;
  wallFrame(k);
  const sill = 0.92, head = 1.58, half = 0.33;
  cladding(k, -0.45, 0.45, TRACK, sill);
  cladding(k, -0.45, 0.45, head, WALL_H - BEAM);
  cladding(k, -0.45, -half, sill, head);
  cladding(k, half, 0.45, sill, head);
  kickPlate(k, -0.45, 0.45);
  const steel = k.m('steel'), fd = WALL_T + 0.03;
  // Deep sleeve frame.
  b.box(steel, [2 * half + 0.04, 0.04, fd], { position: [0, sill + 0.02, 0] }, 0.004);
  b.box(steel, [2 * half + 0.04, 0.04, fd], { position: [0, head - 0.02, 0] }, 0.004);
  for (const x of [-half, half]) b.box(steel, [0.04, head - sill, fd], { position: [x, (sill + head) / 2, 0] }, 0.004);
  // Bird mesh: a dark plate behind the blades.
  b.box(k.m('post'), [2 * half - 0.02, head - sill - 0.06, 0.006], { position: [0, (sill + head) / 2, -0.04] }, 0);
  // Inclined blades, drained to the outside.
  const blades = k.low ? 5 : 8, span = head - sill - 0.08;
  for (let i = 0; i < blades; i++) {
    const y = sill + 0.04 + span * (i + 0.5) / blades;
    b.box(k.m('leaf'), [2 * half - 0.04, 0.006, 0.12], { position: [0, y, 0.02], rotation: [0.72, 0, 0] }, 0);
  }
  // Weather hood with side cheeks; the cheeks are a folded profile.
  b.box(k.m('post'), [2 * half + 0.12, 0.016, 0.16], { position: [0, head + 0.05, WALL_T / 2 + 0.08], rotation: [0.32, 0, 0] }, small(k, 0.004));
  if (!k.low) for (const x of [-half - 0.05, half + 0.05]) {
    extrudeZY(k, k.m('post'), [[WALL_T / 2, head + 0.1], [WALL_T / 2 + 0.15, head + 0.04], [WALL_T / 2 + 0.15, head + 0.02], [WALL_T / 2, head + 0.02]], x - 0.006, x + 0.006);
  }
  // Fixing screws on the frame face.
  for (const x of [-half, half]) for (const y of [sill + 0.1, head - 0.1]) b.bolt(steel, { position: [x, y, fd / 2], rotation: [Math.PI / 2, 0, 0] }, 0.008);
}
