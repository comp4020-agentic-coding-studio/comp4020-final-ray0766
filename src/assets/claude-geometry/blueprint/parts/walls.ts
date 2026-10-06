import { SCALE } from '../../style/tokens.ts';
import { BEAM, cladding, conduit, extrudeZY, interiorFinish, kickPlate, small, TRACK, WALL_H, WALL_T, wallFrame } from './kit.ts';
import type { Kit } from './kit.ts';

// Edge parts that close a storey: origin on the cell edge at the top of the
// slab, x along the edge, +Z exterior. The first three are the material lab's
// reference modules, moved here unchanged in shape.

export function solidWall(k: Kit) {
  wallFrame(k);
  cladding(k, -0.45, 0.45, TRACK, WALL_H - BEAM);
  kickPlate(k, -0.45, 0.45);
  conduit(k, WALL_H - BEAM - 0.12);
  interiorFinish(k);
}

/** Door frame, infill, threshold and status lamp: everything of a door wall but the leaf. */
function doorFrame(k: Kit) {
  const { b } = k;
  wallFrame(k, { track: false });
  const steel = k.m('steel');
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
  // Status lamp: a recessed housing with a short warm strip, not a neon bar.
  b.box(steel, [0.26, 0.06, 0.05], { position: [0, doorTop + 0.11, WALL_T / 2 + 0.03] }, 0.006);
  b.box(k.m('lamp'), [0.2, 0.018, 0.012], { position: [0, doorTop + 0.1, WALL_T / 2 + 0.056] }, 0);
  // It lights the threshold and the first steps outside (src/style/practical.ts).
  b.emitter('door', [0, doorTop + 0.1, WALL_T / 2 + 0.062], [0, -0.6, 0.8]);
  // Skirting either side of the opening on the inside.
  interiorFinish(k, { raceway: false, x0: -0.45, x1: -0.4 });
  interiorFinish(k, { raceway: false, x0: 0.4, x1: 0.45 });
}

export const DOOR_LEAF = { width: 0.78, height: SCALE.doorHeight - 0.01, thickness: 0.05, hingeX: -0.39 - 0.005 } as const;

/**
 * The door leaf in its own frame: hinge edge on x = 0, the leaf running along
 * +x, exterior face +Z. Lever and vision slot on both faces, a closer inside.
 */
function doorLeaf(k: Kit) {
  const { b } = k;
  const steel = k.m('steel'), leafPaint = k.m('leaf');
  const { width: w, height: h, thickness: t } = DOOR_LEAF;
  const cx = w / 2 + 0.005;
  b.box(leafPaint, [w, h, t], { position: [cx, h / 2, 0] }, 0.008);
  // Raised stiffener panel and a kick plate on the outside.
  b.box(leafPaint, [w - 0.16, 0.5, 0.012], { position: [cx, 0.75, t / 2 + 0.006] }, 0.004);
  b.box(k.m('tread'), [w - 0.06, 0.24, 0.008], { position: [cx, 0.16, t / 2 + 0.004] }, 0.003);
  // Vision slot: frame through the leaf, smoked glass.
  b.box(steel, [0.16, 0.5, t + 0.01], { position: [cx + 0.16, 1.38, 0] }, 0.004);
  b.box(k.m('glassSmoked'), [0.11, 0.45, t + 0.014], { position: [cx + 0.16, 1.38, 0] }, 0);
  // Lever handles on rose plates, both faces.
  for (const side of [1, -1]) {
    const z = side * (t / 2);
    b.box(steel, [0.05, 0.16, 0.012], { position: [cx + 0.31, 1.0, z + side * 0.006] }, 0.003);
    b.box(k.m('bright'), [0.14, 0.022, 0.022], { position: [cx + 0.26, 1.03, z + side * 0.035] }, 0.006);
    b.cylinder(k.m('bright'), 0.012, 0.012, 0.04, { position: [cx + 0.32, 1.03, z + side * 0.018], rotation: [Math.PI / 2, 0, 0] });
  }
  // Hinge knuckles on the hinge edge.
  for (const y of [0.25, 0.95, 1.65]) b.cylinder(steel, 0.016, 0.016, 0.12, { position: [0, y, 0] });
  // Overhead closer on the inside face, with its arm.
  if (!k.low) {
    b.box(steel, [0.3, 0.055, 0.06], { position: [0.22, h - 0.07, -t / 2 - 0.03] }, small(k, 0.006));
    b.box(k.m('bright'), [0.26, 0.014, 0.022], { position: [0.36, h - 0.035, -t / 2 - 0.075], rotation: [0, 0.35, 0] }, 0);
  }
}

export function doorWall(k: Kit) {
  doorFrame(k);
  k.b.within({ position: [DOOR_LEAF.hingeX, 0.025, 0.015] }, () => doorLeaf(k));
}

/** The same door held open 90° into the room, so a placed structure can be entered and seen into. */
export function doorOpenWall(k: Kit) {
  doorFrame(k);
  // Hinge on the interior face; rotating +90° about Y swings the leaf from +X to −Z (inwards).
  k.b.within({ position: [DOOR_LEAF.hingeX, 0.025, -WALL_T / 2 + DOOR_LEAF.thickness / 2 - 0.01], rotation: [0, Math.PI / 2, 0] }, () => doorLeaf(k));
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
  // Inside: a sill board, rubber glazing gaskets top and bottom, skirting and raceway.
  b.box(k.m('leaf'), [2 * half + 0.08, 0.025, 0.045], { position: [0, sill - 0.0125, -WALL_T / 2 - 0.0025] }, small(k, 0.004));
  if (!k.low) for (const y of [sill + 0.056, head - 0.056]) for (const z of [0.044, -0.044]) {
    b.box(k.m('membrane'), [2 * half - 0.02, 0.012, 0.01], { position: [0, y, z] }, 0);
  }
  interiorFinish(k);
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
