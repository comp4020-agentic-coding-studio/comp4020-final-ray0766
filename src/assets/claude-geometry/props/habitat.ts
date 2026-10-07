import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW, PALETTE, SCALE } from '../style/tokens.ts';
import { circle, cleanPaint, LAY_FLAT } from './shapes.ts';
import type { Outline } from './shapes.ts';

// Compact prefab habitat module: the industrial stand-in for the main
// project's "cottage" (footprint radius 1.05 m).
//
// A squat twelve-sided drum, built the way a craned-in site pod is: two skids,
// a chassis plate, ten flat clad wall panels with bolted cover battens over
// every joint, a ring beam and a roof cap with lifting lugs and plant. The two
// front facets are replaced by one flat door bay: the hatch sits 0.10 m back
// in a deep painted collar with a lintel and a drip hood, so the opening has a
// real reveal instead of a cupboard door on the skin.
//
// Plan: corners at 1.01 m, 1.95 m across flats, eave 2.10 m. An octagon with
// 1.9 m flats cannot hold a 0.86 m door face inside the 1.05 m footprint
// (its faces are at most 0.85 m wide), which is why the plan has twelve
// sides. Everything at ground level stays inside 1.05 m. Local origin is on
// the ground at the plan centre; +Z is the door.
//
// Detail by LOD (part budget 4 000 / 1 800 / 500 triangles, 10 calls):
//   high   chamfers, batten bolts and fish plates, lugs, louvres, porthole bolts.
//   medium hard-edged panels and battens, no bolts, lugs or louvres.
//   low    one clad prism for the walls, flat portholes, no skids or services.

const RC = 1.01;                                   // plan corner radius (outer skin)
const APOTHEM = RC * Math.cos(Math.PI / 12);       // 0.976: centre to a facet's outer face
const FACET = 2 * RC * Math.sin(Math.PI / 12);     // 0.523: facet width
const BAY_Z = RC * Math.cos(Math.PI / 6);          // 0.875: door bay wall plane
const BAY_HALF = RC * Math.sin(Math.PI / 6);       // 0.505
const SKID = 0.08;
/** Top of the chassis = interior floor = door threshold. */
const FLOOR = 0.16;
const BEAM = 0.08;
const EAVE = FLOOR + SCALE.doorHeight + BEAM;      // 2.10: the ring beam is the door head
const SKIN_H = EAVE - BEAM - FLOOR;
const WALL = 0.05;
const DOOR_W = SCALE.doorWidth;
const JAMB = BAY_HALF - DOOR_W / 2;                // 0.075
const LEAF_Z = BAY_Z - 0.1;                        // hatch face, 0.10 m behind the bay
const COLLAR_FRONT = BAY_Z + 0.035;
/** The door light's point; the village garden cottage keeps its lantern here (village.ts). */
export const HABITAT_DOOR_LIGHT: [number, number, number] = [0, EAVE - BEAM / 2 - 0.006, COLLAR_FRONT + 0.05];
const DEG = Math.PI / 180;

/** Corner k of the twelve-gon, k·30° from +Z towards +X, at radius r. */
const corner = (k: number, r: number): [number, number] => [r * Math.sin(k * 30 * DEG), r * Math.cos(k * 30 * DEG)];
/**
 * The plan outline for PartBuilder.extrude with LAY_FLAT (outline y becomes −z):
 * corners 1…11, so the two front facets become the straight door bay edge.
 */
const plan = (r: number): Outline => Array.from({ length: 11 }, (_, i) => { const [x, z] = corner(i + 1, r); return [x, -z]; });

export function buildHabitat(lib: StyleLibrary, b: PartBuilder) {
  const tier = b.lod, high = tier === 'high', low = tier === 'low';
  /** Chamfer for every piece: only at high, where it catches the highlight. */
  const fine = (c: number) => (high ? c : 0);
  const seg = (h: number, m: number, l: number) => (high ? h : low ? l : m);
  const clad = lib.preset('cladding'), dark = lib.preset('framePainted'), steel = lib.preset('frame');
  const sheet = lib.preset('sheet'), deck = lib.preset('deck'), glass = lib.glass('smoked'), hazard = lib.hazard();
  // The hatch leaf and the two unit plates in muted cobalt paint: the leaf has to read
  // as a door inside its graphite collar, not as a dark hole, and it is the module's
  // one cool colour note beside the warm door lamp.
  const hatch = cleanPaint(lib, 'props:hatch-cobalt', PALETTE.cobalt);
  /** Run `fn` in the frame of the facet centred at `deg`: local +Z points out of the wall, z = 0 on its outer face. */
  const onFacet = (deg: number, fn: () => void) => b.within({ position: [Math.sin(deg * DEG) * APOTHEM, 0, Math.cos(deg * DEG) * APOTHEM], rotation: [0, deg * DEG, 0] }, fn);
  const facets = Array.from({ length: 10 }, (_, i) => (i + 1) * 30 + 15); // facet centres in degrees, door bay excluded

  // --- Skids and chassis -------------------------------------------------
  if (!low) for (const x of [-0.45, 0.45]) {
    b.box(dark, [0.12, SKID, 1.76], { position: [x, SKID / 2, 0] }, fine(0.01));
    // End caps on the skid ends.
    if (high) for (const z of [-0.88, 0.88]) b.box(steel, [0.13, 0.05, 0.012], { position: [x, SKID / 2, z] }, 0);
  }
  const chassisBase = low ? 0 : SKID;
  b.extrude(dark, plan(RC + 0.012), FLOOR - chassisBase, { position: [0, chassisBase, 0], rotation: LAY_FLAT }, fine(0.008));

  // --- Walls ---------------------------------------------------------------
  if (low) {
    // One clad prism in the same plan; panels and battens are left to the texture.
    b.extrude(clad, plan(RC), SKIN_H, { position: [0, FLOOR, 0], rotation: LAY_FLAT });
  } else {
    for (const a of facets) onFacet(a, () => {
      // A flat sandwich panel per facet; panel seams every 0.5 m come from the cladding
      // pattern. No chamfer: its vertical edges are under the battens.
      b.box(clad, [FACET - 0.012, SKIN_H, WALL], { position: [0, FLOOR + SKIN_H / 2, -WALL / 2] }, 0);
      // Tread-plate kick plate along the foot of the panel.
      b.box(deck, [FACET - 0.06, 0.2, 0.008], { position: [0, FLOOR + 0.1, 0.004] }, 0);
    });
    // Cover battens over the nine panel joints (the two bay corners carry the door collar).
    for (let k = 2; k <= 10; k++) {
      b.within({ position: [corner(k, RC)[0], 0, corner(k, RC)[1]], rotation: [0, k * 30 * DEG, 0] }, () => {
        b.box(dark, [0.046, SKIN_H, 0.024], { position: [0, FLOOR + SKIN_H / 2, 0.006] }, fine(0.005));
        if (high) {
          // A fish plate under the ring beam and square-head bolts, as on the lab's wall frame.
          b.box(steel, [0.06, 0.1, 0.008], { position: [0, EAVE - BEAM - 0.08, 0.022] }, 0);
          for (const y of [EAVE - BEAM - 0.11, EAVE - BEAM - 0.05, FLOOR + 0.32, FLOOR + 1.0]) b.box(steel, [0.016, 0.016, 0.008], { position: [0, y, 0.028] }, 0);
        }
      });
    }
  }
  // Ring beam over the panels and battens.
  b.extrude(dark, plan(RC + 0.03), BEAM, { position: [0, EAVE - BEAM, 0], rotation: LAY_FLAT }, 0, low ? [] : [plan(RC - 0.12)]);

  // --- Roof cap, lugs and plant -------------------------------------------
  b.extrude(sheet, plan(RC + 0.018), 0.07, { position: [0, EAVE, 0], rotation: LAY_FLAT }, fine(0.012));
  const roof = EAVE + 0.07 + fine(0.012);
  if (high) {
    // Lifting lugs at four corners: tab plates with an eye, turned to face the centre.
    const lug: Outline = [[-0.05, 0], [0.05, 0], [0.05, 0.045], [0.028, 0.078], [-0.028, 0.078], [-0.05, 0.045]];
    for (const k of [2, 4, 8, 10]) {
      const [x, z] = corner(k, 0.8);
      b.extrude(steel, lug, 0.018, { position: [x, roof, z], rotation: [0, k * 30 * DEG + Math.PI / 2, 0] }, 0, [circle(0.018, 8, 0, 0.046)]);
    }
  }
  // Condenser unit on two bearers at the back.
  const ac = { x: -0.12, z: -0.38, w: 0.66, h: 0.28, d: 0.46 };
  const acY = roof + (low ? 0 : 0.04);
  if (!low) for (const x of [-0.24, 0.24]) b.box(steel, [0.06, 0.04, ac.d + 0.1], { position: [ac.x + x, roof + 0.02, ac.z] }, fine(0.005));
  b.box(sheet, [ac.w, ac.h, ac.d], { position: [ac.x, acY + ac.h / 2, ac.z] }, low ? 0 : 0.016);
  if (!low) {
    b.lathe(sheet, [[0.12, 0], [0.165, 0], [0.165, 0.045], [0.15, 0.055], [0.12, 0.055]], { position: [ac.x + 0.1, acY + ac.h, ac.z] }, seg(16, 10, 8));
    for (const a of [Math.PI / 4, -Math.PI / 4]) b.box(steel, [0.25, 0.012, 0.016], { position: [ac.x + 0.1, acY + ac.h + 0.035, ac.z], rotation: [0, a, 0] }, 0);
  }
  if (high) {
    b.cylinder(dark, 0.035, 0.035, 0.03, { position: [ac.x + 0.1, acY + ac.h + 0.03, ac.z] }, { segments: 10 });
    // Intake louvres on the end face.
    for (let i = 0; i < 4; i++) b.box(dark, [0.016, 0.03, ac.d - 0.1], { position: [ac.x - ac.w / 2 - 0.006, acY + 0.07 + i * 0.05, ac.z], rotation: [0, 0, -0.5] }, 0);
  }
  // Mushroom vent and an antenna mast with a red obstruction beacon.
  if (!low) b.lathe(sheet, [[0.001, 0], [0.04, 0], [0.04, 0.14], [0.1, 0.15], [0.09, 0.19], [0.001, 0.2]], { position: [0.45, roof, 0.25] }, seg(12, 8, 6));
  const mast = { x: 0.55, z: -0.3, h: 0.55 };
  if (!low) b.box(steel, [0.11, 0.012, 0.11], { position: [mast.x, roof + 0.006, mast.z] }, 0);
  b.cylinder(steel, 0.01, 0.015, mast.h, { position: [mast.x, roof + mast.h / 2, mast.z] }, { segments: seg(8, 6, 4) });
  const beacon = lib.createGlow(PALETTE.signalRed, GLOW.lit);
  b.cylinder(beacon, 0.02, 0.02, 0.04, { position: [mast.x, roof + mast.h + 0.02, mast.z] }, { segments: seg(8, 6, 4) });
  if (!low) b.cylinder(dark, 0.024, 0.024, 0.008, { position: [mast.x, roof + mast.h + 0.044, mast.z] }, { segments: seg(8, 6, 4) });

  // --- Door bay -------------------------------------------------------------
  // Collar jambs run from behind the hatch to 35 mm proud of the bay, so the
  // hatch sits in a 0.135 m deep reveal; the lintel and a drip hood cap it.
  const collarDepth = low ? 0.05 : COLLAR_FRONT - (LEAF_Z - 0.03);
  const collarZ = COLLAR_FRONT - collarDepth / 2;
  for (const s of [-1, 1]) b.box(dark, [JAMB, SCALE.doorHeight, collarDepth], { position: [s * (DOOR_W / 2 + JAMB / 2), FLOOR + SCALE.doorHeight / 2, collarZ] }, fine(0.008));
  b.box(dark, [2 * BAY_HALF, BEAM + 0.01, collarDepth + 0.01], { position: [0, EAVE - BEAM / 2 - 0.005, collarZ + 0.005] }, fine(0.008));
  // Drip hood on top of the lintel: a tapered canopy 85 mm proud of the collar, so its
  // front corners stay inside the footprint (LAY_FLAT turns outline −y into +z, outwards).
  if (!low) b.extrude(sheet, [[-BAY_HALF - 0.02, 0], [BAY_HALF + 0.02, 0], [0.3, -0.16], [-0.3, -0.16]], 0.02, { position: [0, EAVE, COLLAR_FRONT - 0.075], rotation: LAY_FLAT }, fine(0.004));
  // Threshold plate across the reveal.
  if (!low) b.box(deck, [DOOR_W, 0.02, BAY_Z + 0.03 - LEAF_Z], { position: [0, FLOOR - 0.01, (BAY_Z + 0.03 + LEAF_Z) / 2] }, 0);
  // Hatch leaf (low: flush on the bay face, since there is no reveal there).
  b.within({ position: [0, FLOOR + 0.01, low ? BAY_Z + 0.02 : LEAF_Z - 0.0225] }, () => {
    const lw = DOOR_W - 0.02, lh = SCALE.doorHeight - 0.03;
    // Pressure-door leaf with cut top corners.
    b.extrude(hatch, [[-lw / 2, 0], [lw / 2, 0], [lw / 2, lh - 0.09], [lw / 2 - 0.09, lh], [-lw / 2 + 0.09, lh], [-lw / 2, lh - 0.09]], 0.045, { position: [0, 0, -0.0225] }, fine(0.004));
    b.box(glass, [0.11, 0.34, 0.008], { position: [0.17, 1.42, 0.026] }, 0);
    b.box(steel, [0.12, 0.022, 0.022], { position: [0.28, 1.0, 0.053] }, fine(0.006));
    if (!low) {
      b.box(dark, [0.17, 0.42, 0.012], { position: [0.17, 1.42, 0.028] }, 0);
      b.box(dark, [0.05, 0.15, 0.012], { position: [0.32, 0.98, 0.03] }, 0);
      b.box(hatch, [lw - 0.18, 0.6, 0.012], { position: [0, 0.7, 0.03] }, fine(0.004));
    }
    if (high) {
      b.box(deck, [lw - 0.06, 0.22, 0.008], { position: [0, 0.15, 0.028] }, 0);
      for (const y of [0.24, 0.92, 1.6]) b.cylinder(steel, 0.015, 0.015, 0.12, { position: [-lw / 2 - 0.004, y, 0.01] }, { segments: 6 });
    }
  });
  // Hazard inserts on the collar faces.
  for (const s of [-1, 1]) b.box(hazard, [0.03, 0.9, 0.004], { position: [s * (DOOR_W / 2 + JAMB / 2), FLOOR + 0.5, COLLAR_FRONT + 0.002] }, 0);
  // Door lamp: a housing on the lintel with a short warm strip under its lip.
  if (!low) b.box(steel, [0.3, 0.05, 0.04], { position: [0, EAVE - BEAM / 2, COLLAR_FRONT + 0.02] }, fine(0.006));
  const lamp = lib.createGlow(PALETTE.sodium, GLOW.lit);
  b.box(lamp, [0.22, 0.016, 0.01], { position: [0, EAVE - BEAM / 2 - 0.006, COLLAR_FRONT + 0.042] }, 0);
  b.emitter('door', HABITAT_DOOR_LIGHT, [0, -0.6, 0.8]);
  // Step with a hazard nosing on two brackets.
  const step = { w: 0.6, d: 0.12 };
  b.box(deck, [step.w, 0.03, step.d], { position: [0, FLOOR / 2 + 0.01, BAY_Z + step.d / 2] }, fine(0.004));
  b.box(hazard, [step.w, 0.032, 0.024], { position: [0, FLOOR / 2 + 0.01, BAY_Z + step.d - 0.012] }, 0);
  if (!low) for (const s of [-1, 1]) b.box(dark, [0.03, FLOOR / 2, step.d - 0.02], { position: [s * (step.w / 2 - 0.05), FLOOR / 4, BAY_Z + step.d / 2] }, 0);

  // --- Portholes on the two front-quarter facets ----------------------------
  for (const a of [75, -75]) onFacet(a, () => {
    // Turn local +Y out of the wall so the lathed ring's axis is the porthole axis.
    b.within({ position: [0, FLOOR + 1.2, 0], rotation: [Math.PI / 2, 0, 0] }, () => {
      const r = 0.15;
      const ring: [number, number][] = low ? [[r + 0.05, 0.006], [r - 0.004, 0.006]]
        : [[r - 0.004, -0.02], [r + 0.05, -0.02], [r + 0.05, 0.022], [r + 0.036, 0.034], [r - 0.004, 0.034]];
      b.lathe(steel, ring, {}, seg(16, 10, 8));
      b.cylinder(glass, r, r, 0.006, { position: [0, low ? 0.003 : -0.012, 0] }, { segments: seg(16, 10, 8) });
      if (!low) b.cylinder(dark, r, r, 0.006, { position: [0, -0.04, 0] }, { segments: seg(16, 10, 8) });
      // Eight square-head bolts on the clamp ring (12 triangles each; hex heads cost twice that).
      if (high) for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
        b.box(steel, [0.015, 0.008, 0.015], { position: [Math.cos(t) * (r + 0.026), 0.038, Math.sin(t) * (r + 0.026)], rotation: [0, -t, 0] }, 0);
      }
    });
  });

  // --- Services on the back ---------------------------------------------------
  if (low) return;
  onFacet(165, () => {
    // Distribution box with a nameplate, and its feed down into the chassis (all inside the footprint).
    b.box(sheet, [0.24, 0.3, 0.06], { position: [0, FLOOR + 1.0, 0.03] }, fine(0.01));
    b.box(hatch, [0.09, 0.045, 0.004], { position: [-0.05, FLOOR + 1.08, 0.062] }, 0);
    b.box(dark, [0.028, 0.84, 0.028], { position: [0.06, FLOOR + 0.42, 0.03] }, 0);
  });
  onFacet(195, () => {
    // Riser conduit from the chassis to the ring beam, clipped to the panel.
    b.cylinder(dark, 0.02, 0.02, EAVE - 0.24, { position: [0, FLOOR + (EAVE - 0.24) / 2 - 0.02, 0.03] }, { segments: seg(8, 6, 4) });
    for (const y of [0.7, 1.4]) b.box(steel, [0.065, 0.028, 0.05], { position: [0, y, 0.025] }, 0);
  });
  if (high) onFacet(135, () => {
    // Exhaust louvre high on a rear facet.
    b.box(steel, [0.3, 0.2, 0.02], { position: [0, EAVE - 0.36, 0.01] }, 0);
    for (let i = 0; i < 3; i++) b.box(dark, [0.27, 0.012, 0.04], { position: [0, EAVE - 0.42 + i * 0.06, 0.025], rotation: [0.6, 0, 0] }, 0);
  });
  // Unit plate beside the door, painted like the hatch.
  onFacet(45, () => b.box(hatch, [0.1, 0.16, 0.006], { position: [0, FLOOR + 1.55, 0.003] }, 0));
}
