import * as T from 'three';
import type { PropKind } from '../core/world.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW } from '../style/tokens.ts';
import { VILLAGE_LAMP, villageMaterial } from '../style/village.ts';
import { HABITAT_DOOR_LIGHT } from './habitat.ts';
import { WORK_LIGHT_HEAD, WORK_LIGHT_LENS } from './work-light.ts';

// Village versions of the six catalogue kinds (docs/VILLAGE.md). Same kind
// keys, footprints, reach (PROP_INFO), heights within the industrial ones and
// the same light fittings at the same points: only the art changes. Grammar
// shared with the village buildings: plaster, timber, clay tile and stone in
// flat colour, round low-poly planting, ink outlines from the look.
//
// The models ask for materials by village key, not from a library, so the
// blueprint's garden parts (blueprint/parts/home/garden.ts) draw these same
// models through their kit's slots (kit.ts kitPropMaterials).

/**
 * A prop's material by key: a village material ('village:timber' …), 'glass'
 * (clear window glass) or 'glow' (the lantern glass, owned by the model).
 */
export type PropMaterials = (key: string) => T.Material;

/** The village materials from a library, and one lantern glow per model (each build takes a fresh resolver). */
export function libraryPropMaterials(lib: StyleLibrary): PropMaterials {
  let glow: T.Material | null = null;
  return key => {
    if (key === 'glass') return lib.glass('clear');
    if (key === 'glow') return (glow ??= lib.createGlow(VILLAGE_LAMP, GLOW.lit));
    return villageMaterial(lib, key);
  };
}

const blob = (b: PartBuilder, material: T.Material, r: number, detail: number, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) =>
  b.geometry(material, new T.IcosahedronGeometry(r, detail), { position, scale });

/**
 * Garden cottage in the habitat's place: a plastered body with a front gable
 * (+Z), a stepped tile roof over it, a teal door with its lantern on a bracket
 * where the habitat's door light is, side windows with shutters, a stone step
 * and a chimney. Inside the habitat's 1.05 m reach and 2.8 m height, and its
 * ten draw calls with the ink: eight materials.
 */
function cottage(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low', high = b.lod === 'high';
  const plaster = m('village:plaster'), timber = m('village:timber'), tile = m('village:tile'), stone = m('village:stone');
  const paint = m('village:paint'), iron = m('village:iron'), glass = m('glass');
  const hw = 0.55, hd = 0.7, eave = 1.6, pitch = 40 * Math.PI / 180;
  const roofHalf = hw + 0.1, ridge = eave - 0.1 * Math.tan(pitch) + roofHalf * Math.tan(pitch);
  b.box(stone, [2 * hw + 0.1, 0.12, 2 * hd + 0.1], { position: [0, 0.06, 0] }, 0);
  // Body and gables in one extrusion through z.
  b.extrude(plaster, [[-hw, 0.12], [hw, 0.12], [hw, eave], [0, eave + hw * Math.tan(pitch)], [-hw, eave]], 2 * hd, { position: [0, 0, -hd] });
  if (!low) for (const x of [-hw, hw]) for (const z of [-hd, hd]) b.box(timber, [0.07, eave - 0.12, 0.07], { position: [x, (eave + 0.12) / 2, z] }, 0);
  // Roof: three stepped courses a side running along the ridge, and a ridge cap.
  const slope = roofHalf / Math.cos(pitch), courses = low ? 1 : 3, pitchLen = slope / courses, lap = low ? 0 : 0.03;
  for (const s of [1, -1]) for (let i = 0; i < courses; i++) {
    const along = i * pitchLen, tilt = pitch - (low ? 0 : Math.asin(0.03 / (pitchLen + lap)));
    b.within({ position: [s * along * Math.cos(pitch), ridge - along * Math.sin(pitch), 0], rotation: [0, 0, -s * tilt] }, () => {
      b.box(tile, [pitchLen + lap, 0.045, 2 * hd + 0.12], { position: [s * (pitchLen + lap) / 2, 0.0225, 0] }, 0);
    });
  }
  b.box(tile, [0.12, 0.06, 2 * hd + 0.14], { position: [0, ridge + 0.04, 0] }, 0);
  // Door in a timber frame, a stone step, and the lantern on its bracket over it.
  const dw = 0.5, dh = 1.22, fz = hd;
  b.box(paint, [dw, dh, 0.04], { position: [0, 0.12 + dh / 2, fz + 0.01] }, 0);
  b.box(timber, [dw + 0.12, 0.07, 0.05], { position: [0, 0.12 + dh + 0.035, fz + 0.015] }, 0);
  for (const s of [-1, 1]) b.box(timber, [0.06, dh, 0.05], { position: [s * (dw / 2 + 0.03), 0.12 + dh / 2, fz + 0.015] }, 0);
  if (!low) b.box(iron, [0.05, 0.05, 0.03], { position: [dw / 2 - 0.08, 0.75, fz + 0.04] }, 0);
  b.box(stone, [0.7, 0.1, 0.2], { position: [0, 0.05, fz + 0.12] }, 0);
  const lamp = m('glow'), lz = HABITAT_DOOR_LIGHT[2];
  b.box(iron, [0.03, 0.03, lz - fz], { position: [0, 1.95, (fz + lz) / 2] }, 0);
  b.box(iron, [0.1, 0.012, 0.1], { position: [0, 1.99, lz] }, 0);
  b.box(lamp, [0.075, 0.1, 0.075], { position: [0, 2.046, lz] }, 0);
  b.cylinder(iron, 0, 0.07, 0.05, { position: [0, 2.121, lz], rotation: [0, Math.PI / 4, 0] }, { segments: 4 });
  b.emitter('door', HABITAT_DOOR_LIGHT, [0, -0.6, 0.8]);
  // Gable window and side windows (shutters close up).
  b.box(timber, [0.26, 0.26, 0.04], { position: [0, eave + 0.2, fz + 0.005] }, 0);
  b.box(glass, [0.18, 0.18, 0.05], { position: [0, eave + 0.2, fz + 0.005] }, 0);
  for (const s of [-1, 1]) {
    b.box(timber, [0.04, 0.5, 0.48], { position: [s * (hw + 0.005), 1.0, 0.1] }, 0);
    b.box(glass, [0.05, 0.4, 0.38], { position: [s * (hw + 0.005), 1.0, 0.1] }, 0);
    if (!low) b.box(timber, [0.05, 0.03, 0.38], { position: [s * (hw + 0.008), 1.0, 0.1] }, 0);
    if (high) for (const dz of [-0.32, 0.32]) b.box(paint, [0.025, 0.46, 0.17], { position: [s * (hw + 0.012), 1.0, 0.1 + dz] }, 0);
  }
  // Chimney through the roof's west slope.
  b.box(stone, [0.2, 0.7, 0.2], { position: [-0.28, 2.1, -0.35] }, 0);
  b.box(stone, [0.26, 0.05, 0.26], { position: [-0.28, 2.475, -0.35] }, 0);
}

/** Round broadleaf tree in the conifer's place: a tapered trunk and three overlapping crowns, inside its 0.5 m reach. */
function tree(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low', detail = low ? 0 : b.lod === 'high' ? 2 : 1;
  b.cylinder(m('village:bark'), 0.055, 0.085, 1.4, { position: [0, 0.7, 0] }, { segments: low ? 5 : 7 });
  const leaf = m('village:leaf');
  blob(b, leaf, 0.42, detail, [0, 1.62, 0], [1, 0.95, 1]);
  blob(b, leaf, 0.3, detail, [0.05, 2.06, -0.03]);
  blob(b, leaf, 0.26, detail, [-0.17, 1.4, 0.13]);
}

/** Three flat stepping stones and two grass tufts in the deck pad's 0.44 m reach. */
function path(m: PropMaterials, b: PartBuilder) {
  const stone = m('village:stone'), seg = b.lod === 'low' ? 6 : 8;
  for (const [x, z, r, yaw] of [[-0.18, 0.2, 0.15, 0.2], [0.12, 0.0, 0.17, 0.9], [-0.08, -0.24, 0.16, 0.5]] as const) {
    b.cylinder(stone, r, r * 1.04, 0.06, { position: [x, 0.03, z], rotation: [0, yaw, 0], scale: [1, 1, 0.82] }, { segments: seg });
  }
  if (b.lod !== 'high') return;
  for (const [x, z] of [[0.2, 0.25], [-0.27, -0.05]] as const) blob(b, m('village:leaf'), 0.06, 0, [x, 0.03, z], [1, 0.8, 1]);
}

/** Terracotta pot with a mound of leaves and flowers, in the planter's 0.3 m reach and 0.7 m height. */
function flowers(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low', detail = low ? 0 : 1, seg = low ? 8 : 12;
  b.lathe(m('village:pot'), [[0.0, 0.0], [0.13, 0.0], [0.17, 0.25], [0.2, 0.26], [0.2, 0.31], [0.165, 0.31]], undefined, seg);
  // Soil shows only at high; below it the leaf mound fills the rim (one draw call less per pot).
  if (b.lod === 'high') b.cylinder(m('village:soil'), 0.165, 0.165, 0.02, { position: [0, 0.295, 0] }, { segments: seg });
  const leaf = m('village:leaf');
  blob(b, leaf, 0.17, detail, [0, 0.4, 0], [1.1, 0.8, 1.1]);
  blob(b, leaf, 0.12, detail, [0.06, 0.5, -0.05]);
  // Two flower colours at high, one below (each colour is a draw call per pot).
  const yellow = m('village:bloom-yellow'), coral = b.lod === 'high' ? m('village:bloom-coral') : yellow;
  const blooms: [number, number, number, T.Material][] = [[-0.1, 0.52, 0.08, yellow], [0.1, 0.56, 0.06, coral], [0.0, 0.6, -0.08, yellow], [-0.12, 0.47, -0.08, coral], [0.14, 0.46, -0.1, yellow]];
  for (const [x, y, z, mat] of low ? blooms.slice(0, 3) : blooms) blob(b, mat, 0.04, 0, [x, y, z]);
}

/** Park bench: timber slats on cast iron ends, the steel bench's 1.16 m length and 0.44 m seat; the sitter faces +Z. */
function bench(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low';
  const iron = m('village:iron'), boards = m('village:boards');
  const LEN = 1.16, SEAT = 0.44, end = LEN / 2 - 0.06;
  const profile: [number, number][] = [
    [0.22, 0], [0.22, 0.04], [0.16, 0.06], [0.17, SEAT - 0.04], [0.23, 0.6], [0.19, 0.62], [0.12, SEAT],
    [-0.13, SEAT], [-0.21, 0.86], [-0.25, 0.86], [-0.18, SEAT - 0.04], [-0.19, 0.05], [-0.24, 0.03], [-0.24, 0],
  ];
  for (const s of [1, -1]) b.extrude(iron, profile.map(([z, y]) => [-z, y] as [number, number]), 0.04, { position: [s * end - 0.02, 0, 0], rotation: [0, Math.PI / 2, 0] });
  const slats = low ? 2 : 4, depth = 0.36;
  for (let i = 0; i < slats; i++) b.box(boards, [LEN, 0.03, depth / slats - 0.02], { position: [0, SEAT + 0.015, 0.17 - (i + 0.5) * (depth / slats)] }, 0);
  const rake = Math.atan2(0.08, 0.42);
  for (let i = 0; i < (low ? 1 : 2); i++) {
    const y = SEAT + 0.18 + i * 0.16, z = -0.14 - (y - SEAT) * Math.tan(rake) + 0.02;
    b.box(boards, [LEN, 0.09, 0.025], { position: [0, y, z], rotation: [-rake, 0, 0] }, 0);
  }
}

/**
 * Garden lantern post in the work light's place: a timber post on a stone foot,
 * an iron arm towards +Z and the lantern hung round the work light's light
 * point; a clump of flowers at the foot.
 */
function lamp(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low';
  const iron = m('village:iron');
  b.box(m('village:stone'), [0.2, 0.15, 0.2], { position: [0, 0.075, 0] }, 0);
  b.box(m('village:timber'), [0.09, 1.97, 0.09], { position: [0, 0.15 + 1.97 / 2, 0] }, 0);
  b.box(iron, [0.03, 0.03, 0.27], { position: [0, 2.1, 0.13] }, 0);
  if (!low) b.box(iron, [0.02, 0.02, 0.16], { position: [0, 2.02, 0.07], rotation: [Math.PI / 4, 0, 0] }, 0);
  const glow = m('glow'), z = 0.233;
  b.box(iron, [0.11, 0.012, 0.11], { position: [0, 1.93, z] }, 0);
  b.box(glow, [0.085, 0.11, 0.085], { position: [0, 1.992, z] }, 0);
  b.cylinder(iron, 0, 0.08, 0.05, { position: [0, 2.072, z], rotation: [0, Math.PI / 4, 0] }, { segments: 4 });
  b.within(WORK_LIGHT_HEAD, () => b.emitter('flood', WORK_LIGHT_LENS, [0, -1, 0]));
  if (b.lod !== 'high') return;
  blob(b, m('village:leaf'), 0.12, 0, [0.12, 0.1, -0.1], [1, 0.75, 1]);
  blob(b, m('village:bloom-yellow'), 0.035, 0, [0.15, 0.19, -0.04]);
}

export const VILLAGE_PROP_BUILDERS: Record<PropKind, (m: PropMaterials, b: PartBuilder) => void> = { cottage, tree, path, flowers, bench, lamp };

/** What each kind is in the village look. */
export const VILLAGE_PROP_NAMES: Record<PropKind, string> = {
  cottage: 'Garden cottage', tree: 'Round tree', path: 'Stepping stones', flowers: 'Flower pot', bench: 'Park bench', lamp: 'Garden lantern',
};
