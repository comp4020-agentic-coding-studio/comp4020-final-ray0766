import * as T from 'three';
import { mulberry32 } from '../core/noise.ts';
import type { Vec3 } from '../core/vec.ts';
import type { PropKind } from '../core/world.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW } from '../style/tokens.ts';
import { VILLAGE_LAMP, villageMaterial } from '../style/village.ts';
import { HABITAT_DOOR_LIGHT } from './habitat.ts';
import { aim, limb, pebble, plate, polygon, ringSolid } from './village-shapes.ts';
import type { BoxFace, Ring } from './village-shapes.ts';
import { WORK_LIGHT_HEAD, WORK_LIGHT_LENS } from './work-light.ts';

// Village versions of the six catalogue kinds (docs/VILLAGE.md), the props of
// a small Japanese town. Same kind keys, footprints, reach (PROP_INFO),
// heights within the industrial ones and the same light fittings at the same
// points, each inside its lantern's glow: only the art changes. Grammar shared
// with the village buildings: plaster, timber, kawara tile and stone in flat
// colour, planting as clusters of domes with toothed rims. The look draws the
// lines on screen from depth, so the models are shaped for the lines they
// should get (village-shapes.ts): hard edges where a line belongs, eight or
// more sides where a round form should draw only its outline.
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

/**
 * Garden cottage in the habitat's place: a small Japanese town house with its
 * gable to the front. White plaster walls framed by dark timber posts and
 * beams over a dark board skirt, on a stone plinth; a kawara roof laid as two
 * wide bands a slope, deep eaves to the sides, a raised ridge and plain blocks
 * at its ends; a sliding lattice door under a split curtain, a tie beam and
 * king post in the gable, lattice windows in the side walls, and the door
 * lantern hung from a bracket where the habitat's door light is. Inside the
 * habitat's 1.05 m reach (the roof's corners reach furthest) and 2.8 m height.
 * Every edge is hard at every tier (no chamfer that comes and goes with the
 * tier); low leaves out some lattice bars, beams and the bracket brace. Eight
 * materials.
 */
function cottage(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low';
  const plaster = m('village:plaster'), timber = m('village:timber'), tile = m('village:tile'), stone = m('village:stone');
  const boards = m('village:boards'), paint = m('village:paint'), glass = m('glass');
  /** A hard-edged box at `at`, without the faces named (against a wall, on the ground). */
  const box = (material: T.Material, size: Vec3, at: Vec3, hidden: BoxFace[] = [], rotation?: Vec3) => plate(b, material, size, { position: at, rotation }, hidden);
  /** The face of a piece on the side wall facing `s` along x that lies against it. */
  const wallX = (s: number): BoxFace => (s > 0 ? '-x' : '+x');
  // Body (half width along x, half depth along z); floor, skirt, door head and eave heights.
  const HW = 0.65, HD = 0.58, FLOOR = 0.14, SKIRT = 0.58, HEAD = 1.56, PLATE = 1.72;
  // Roof: underside plane at Y0 − |x|·PITCH (the ridge runs along z), eaves at ±EAVE in x, verges at ±VERGE in z.
  const PITCH = 0.7, Y0 = PLATE + HW * PITCH, EAVE = 0.78, VERGE = 0.66, SLAB = 0.06;
  box(stone, [2 * HW + 0.1, FLOOR, 2 * HD + 0.1], [0, FLOOR / 2, 0], ['-y']);
  // Walls and both gables in one plaster extrusion along z.
  b.extrude(plaster, [[-HW, FLOOR], [HW, FLOOR], [HW, PLATE], [0, Y0], [-HW, PLATE]], 2 * HD, { position: [0, 0, -HD] });
  // Dark board skirt round the walls (the front one stops at the door).
  const skirtH = SKIRT - FLOOR, skirtY = FLOOR + skirtH / 2, DOOR = 0.3;
  box(timber, [2 * HW, skirtH, 0.03], [0, skirtY, -HD], ['+z', '-y']);
  for (const s of [-1, 1]) {
    box(timber, [0.03, skirtH, 2 * HD], [s * HW, skirtY, 0], [wallX(s), '-y']);
    box(timber, [HW - DOOR - 0.03, skirtH, 0.03], [s * (HW + DOOR + 0.03) / 2, skirtY, HD], ['-z', '-y']);
  }
  // Timber frame: corner posts, wall plates under the eaves, the front tie beam and king post, a head beam over the door.
  const postH = PLATE - FLOOR;
  for (const x of [-HW, HW]) for (const z of [-HD, HD]) box(timber, [0.08, postH, 0.08], [x, FLOOR + postH / 2, z], ['-y', '+y']);
  for (const s of [-1, 1]) box(timber, [0.05, 0.09, 2 * HD + 0.08], [s * HW, PLATE - 0.045, 0], [wallX(s), '+y']);
  box(timber, [2 * HW + 0.08, 0.09, 0.05], [0, PLATE - 0.045, HD], ['-z']);
  box(timber, [0.07, Y0 - PLATE, 0.04], [0, (PLATE + Y0) / 2, HD], ['-z', '+y', '-y']);
  box(timber, [2 * HW, 0.07, 0.04], [0, HEAD + 0.035, HD], ['-z']);
  if (!low) box(timber, [2 * HW + 0.08, 0.09, 0.05], [0, PLATE - 0.045, -HD], ['+z']);
  // Roof: two wide tile bands a slope, the upper one lapping over the lower, a raised ridge and its end blocks.
  const theta = Math.atan(PITCH), slope = EAVE / Math.cos(theta), split = 0.42, depth = 2 * VERGE;
  for (const s of [1, -1]) b.within({ position: [0, Y0, 0], rotation: [0, 0, -s * theta] }, () => {
    box(tile, [slope - split + 0.04, SLAB, depth], [s * (split - 0.04 + slope) / 2, SLAB / 2, 0], [wallX(s)]);
    box(tile, [split, SLAB, depth], [s * split / 2, SLAB * 1.5, 0], [wallX(s)]);
  });
  // The ridge sits down between the bands' top edges and stands 0.1 m clear of them; its end blocks a little higher.
  const ridgeTop = Y0 + 2 * SLAB * Math.cos(theta) + 0.1;
  box(tile, [0.16, ridgeTop - Y0, depth - 0.06], [0, (Y0 + ridgeTop) / 2, 0], ['-y']);
  for (const s of [-1, 1]) box(tile, [0.24, ridgeTop + 0.05 - Y0, 0.06], [0, (Y0 + ridgeTop + 0.05) / 2, s * (VERGE - 0.03)], ['-y']);
  // Sliding lattice door: dark glazing behind light wood bars, a boarded kick panel, a two-piece curtain over it.
  const doorH = HEAD - FLOOR, doorY = FLOOR + doorH / 2, kick = 0.28;
  box(glass, [2 * DOOR, doorH, 0.03], [0, doorY, HD + 0.005], ['-z', '-y']);
  for (const s of [-1, 1]) box(timber, [0.06, doorH, 0.05], [s * (DOOR + 0.03), doorY, HD + 0.01], ['-z', '-y']);
  box(boards, [2 * DOOR, kick, 0.03], [0, FLOOR + kick / 2, HD + 0.02], ['-z', '-y']);
  const barH = doorH - kick;
  for (const x of low ? [-0.15, 0, 0.15] : [-0.2, -0.1, 0, 0.1, 0.2]) box(boards, [x === 0 ? 0.04 : 0.025, barH, 0.025], [x, FLOOR + kick + barH / 2, HD + 0.025], ['-z', '-y', '+y']);
  for (const s of [-1, 1]) box(paint, [DOOR - 0.012, 0.34, 0.012], [s * DOOR / 2, HEAD - 0.17, HD + 0.06], ['+y']);
  // Stone step at the door.
  box(stone, [0.72, 0.08, 0.2], [0, 0.04, HD + 0.15], ['-y']);
  // A lattice window in each side wall: dark glazing, a light wood sill and head, and bars.
  for (const s of [-1, 1]) {
    const x = s * HW;
    box(glass, [0.03, 0.4, 0.52], [x + s * 0.005, 1.14, -0.04], [wallX(s)]);
    for (const y of [0.92, 1.36]) box(boards, [0.05, 0.04, 0.6], [x + s * 0.01, y, -0.04], [wallX(s)]);
    for (const z of low ? [-0.17, 0.09] : [-0.235, -0.105, 0.025, 0.155]) box(boards, [0.03, 0.4, 0.025], [x + s * 0.025, 1.14, z], [wallX(s), '+y', '-y']);
  }
  // The door lantern: a paper lantern hung from a timber bracket on the king post, its light where the habitat's door light is.
  const lamp = m('glow'), [, ly, lz] = HABITAT_DOOR_LIGHT;
  const top = ly + 0.075, armY = top + 0.035;
  box(timber, [0.045, 0.04, lz + 0.03 - HD], [0, armY, (HD + lz + 0.03) / 2], ['-z']);
  if (!low) {
    const dz = 0.2, dy = armY - 0.02 - (PLATE + 0.02);
    box(timber, [0.035, Math.hypot(dz, dy), 0.03], [0, PLATE + 0.02 + dy / 2, HD + dz / 2], ['+y', '-y'], [Math.atan2(dz, dy), 0, 0]);
  }
  b.cylinder(timber, 0.045, 0.075, 0.025, { position: [0, top + 0.0125, lz], rotation: [0, Math.PI / 4, 0] }, { segments: 4 });
  box(lamp, [0.11, 0.15, 0.11], [0, ly, lz], ['+y']);
  box(timber, [0.13, 0.02, 0.13], [0, ly - 0.085, lz]);
  b.emitter('door', HABITAT_DOOR_LIGHT, [0, -0.6, 0.8]);
}

/**
 * A cloud-pruned foliage pad: a cluster of low domes on one flat underside.
 * Where the underside meets the domes there is one sharp rim, cut into teeth,
 * so the pad's lower edge draws jagged; where two domes run into each other
 * they meet in a valley that draws a short curved mark inside the pad; each
 * dome turns smoothly from lit to shade.
 * `domes` is how many (one main dome and the rest round it), `sides` how many
 * corners a dome has (eight, so its sides draw no creases; six only where the
 * pine is a few pixels across), `shoulder` whether a dome rounds over a
 * shoulder ring on its way to the top (a dome costs 6 × sides triangles with
 * it, 4 × sides without).
 */
function pad(b: PartBuilder, leaf: T.Material, at: Vec3, radius: number, height: number, domes: number, sides: number, seed: number, shoulder: boolean) {
  const rnd = mulberry32(seed), round = polygon(sides, rnd() * Math.PI);
  // The rim's every other corner drawn in, so the underside's edge is cut into teeth.
  const teeth = round.map(([x, z], i) => (i % 2 ? [x * 0.84, z * 0.84] : [x * 1.04, z * 1.04]) as [number, number]);
  // Steep low sides (64°), a rounded shoulder and a flat top: two domes meet low on their sides, at a sharp valley.
  // Without the shoulder ring a dome rises in one step to its top.
  const rings = (x: number, z: number, r: number, h: number): Ring[] => shoulder
    ? [{ r, y: 0, x, z, outline: teeth }, { r: r * 0.85, y: h * 0.45, x, z }, { r: r * 0.5, y: h * 0.85, x, z }, { r: 0, y: h, x, z }]
    : [{ r, y: 0, x, z, outline: teeth }, { r: r * 0.8, y: h * 0.5, x, z }, { r: 0, y: h, x, z }];
  const dome = (x: number, z: number, r: number, h: number) => b.geometry(leaf, ringSolid(round, rings(x, z, r, h), { smooth: true, capTop: false }), { position: at });
  const main = domes > 1 ? 0.66 : 0.95;
  dome(0, 0, radius * main, height);
  let a = rnd() * Math.PI * 2;
  for (let i = 1; i < domes; i++) {
    a += (Math.PI * 2) / (domes - 1) * (0.8 + 0.4 * rnd());
    const r = radius * (0.46 + 0.08 * rnd()), d = radius - r;
    dome(Math.cos(a) * d, Math.sin(a) * d * 0.8, r, height * (0.7 + 0.12 * rnd()));
  }
}

/**
 * Garden pine in the conifer's place, pruned into clouds: a leaning trunk that
 * turns twice, three branches each carrying a pad, and a crown pad with a
 * smaller one on it. Inside its 0.5 m reach and 2.45 m height. Two materials,
 * so a blueprint part can draw it through the kit's slots. It is also the
 * village look's garden.tree, so at every tier it costs no more than that
 * part's industrial model, the round 8 tree (568 / 268 / 80 triangles), and
 * the part's budget figure stays: high gives the pads two or three domes with
 * a shoulder, medium one dome each (the crown two) without; low is a straight
 * trunk of four sides carrying the two lower side pads and the crown, one
 * six-sided dome each.
 */
function tree(m: PropMaterials, b: PartBuilder) {
  const bark = m('village:bark'), leaf = m('village:leaf');
  if (b.lod === 'low') {
    // 8 triangles of trunk and 3 × 24 of pads: 80. The pads overlap the trunk, so they need no branches.
    b.geometry(bark, ringSolid(polygon(4, 0.3), [{ r: 0.085, y: 0 }, { r: 0.036, y: 2.0, x: 0.02, z: -0.02 }], { capBottom: false, capTop: false }));
    pad(b, leaf, [-0.19, 0.95, 0.06], 0.25, 0.21, 1, 6, 11, false);
    pad(b, leaf, [0.2, 1.3, -0.05], 0.24, 0.21, 1, 6, 23, false);
    pad(b, leaf, [0.02, 1.92, -0.02], 0.34, 0.28, 1, 6, 41, false);
    return;
  }
  const high = b.lod === 'high', two = high ? 2 : 1;
  // One five-sided tube with horizontal rings: no seams where it turns, and each facet turns 72°,
  // so the trunk draws the same full creases at high and medium. 40 triangles, and 30 in branches.
  b.geometry(bark, ringSolid(polygon(5, 0.3), [{ r: 0.085, y: 0 }, { r: 0.07, y: 0.6, x: 0.07, z: 0.03 }, { r: 0.058, y: 1.18, x: -0.05, z: -0.01 }, { r: 0.046, y: 1.72, x: 0.02, z: -0.02 }, { r: 0.036, y: 2.0, z: -0.02 }], { capBottom: false, capTop: false }));
  const branches: [Vec3, Vec3][] = [[[0.0, 0.86, 0.01], [-0.2, 0.97, 0.06]], [[0.03, 1.22, -0.01], [0.2, 1.32, -0.05]], [[-0.02, 1.55, -0.01], [-0.13, 1.64, 0.1]]];
  for (const [a, c] of branches) limb(b, bark, a, c, 0.032, 0.022, 5, 0.01);
  // High: ten domes of 48 triangles (550 in all); medium: six of 32 (262).
  pad(b, leaf, [-0.19, 0.95, 0.06], 0.25, 0.21, two, 8, 11, high);
  pad(b, leaf, [0.2, 1.3, -0.05], 0.24, 0.21, two, 8, 23, high);
  pad(b, leaf, [-0.13, 1.62, 0.1], 0.22, 0.18, two, 8, 37, high);
  pad(b, leaf, [0.02, 1.92, -0.02], 0.34, 0.28, two + 1, 8, 41, high);
  pad(b, leaf, [0.04, 2.12, -0.03], 0.2, 0.18, 1, 8, 53, high);
}

/**
 * Three flat stepping stones in the deck pad's 0.44 m reach: irregular slabs of
 * ten corners, 6 cm thick, each a little narrower at the top than at the
 * ground. The top meets the sides in one sharp edge, the stone's outline.
 */
function path(m: PropMaterials, b: PartBuilder) {
  const stone = m('village:stone');
  for (const [x, z, r, sx, seed] of [[-0.18, 0.2, 0.15, 0.8, 3], [0.12, 0.0, 0.17, 0.82, 5], [-0.08, -0.24, 0.16, 0.78, 7]] as const) {
    const outline = pebble(10, 0.12, seed).map(([u, v]) => [u, v * sx] as [number, number]);
    b.geometry(stone, ringSolid(outline, [{ r, y: 0, x, z }, { r: r * 0.96, y: 0.06, x, z }], { capBottom: false, smooth: false }));
  }
}

/** How far the flower pot reaches towards +Z (its shrub's rim): the blueprint's pot stands back against a side by this. */
export const FLOWER_POT_BACK = 0.2;

/**
 * A round flowering shrub (azalea or hydrangea) in a glazed pot, in the
 * planter's 0.3 m reach and 0.7 m height: a round-bellied clay pot glazed
 * from the shoulder up, with a rolled lip, a mound of domes on one flat toothed underside like the pine's pads (a
 * main dome and a ring of smaller ones, so the valleys between them draw the
 * shrub's marks), and flat bloom clusters lying on it, low enough that they
 * draw no line of their own: they read by colour. The main dome's rim reaches
 * exactly FLOWER_POT_BACK towards +Z and nothing reaches further. It is also
 * the village look's garden.pot, so at every tier it costs no more than that
 * part's industrial model, the round 8 pot (428 / 380 / 180 triangles): high
 * draws the pot in twelve sides, three domes round the main one and four
 * blooms (420); medium ten sides and three blooms (374); low eight sides, the
 * main dome alone without its shoulder, and two blooms (168).
 */
function flowers(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low', high = b.lod === 'high';
  const clay = m('village:pot'), glaze = m('village:tile'), leaf = m('village:leaf');
  const seg = low ? 8 : high ? 12 : 10;
  // Pot: bare clay from a narrow foot to a full belly, then a slate glaze over the shoulder and a rolled lip
  // (the lip's underside is its one line; where the glaze ends is a change of colour only).
  b.geometry(clay, ringSolid(polygon(seg), [{ r: 0.1, y: 0 }, { r: 0.155, y: 0.09 }, { r: 0.162, y: 0.13 }], { smooth: true, capBottom: false, capTop: false }));
  b.geometry(glaze, ringSolid(polygon(seg), [{ r: 0.162, y: 0.13 }, { r: 0.14, y: 0.235 }, { r: 0.163, y: 0.242 }, { r: 0.163, y: 0.28 }], { smooth: true, capBottom: false }));
  // Shrub: domes of eight sides on one flat underside just inside the lip, its teeth overhanging it.
  const round = polygon(8, Math.PI / 2);
  const teeth = round.map(([x, z], i) => (i % 2 ? [x * 0.86, z * 0.86] : [x * 1.04, z * 1.04]) as [number, number]);
  const base = 0.27, main = FLOWER_POT_BACK / 1.04, H = 0.22;
  const dome = (x: number, z: number, r: number, h: number) => b.geometry(leaf, ringSolid(round, low
    ? [{ r, y: base, x, z, outline: teeth }, { r: r * 0.86, y: base + h * 0.5, x, z }, { r: 0, y: base + h, x, z }]
    : [{ r, y: base, x, z, outline: teeth }, { r: r * 0.94, y: base + h * 0.38, x, z }, { r: r * 0.68, y: base + h * 0.76, x, z }, { r: 0, y: base + h, x, z }], { smooth: true, capTop: false }));
  dome(0, 0, main, H);
  const ring: [number, number][] = low ? [] : [[0.105, 0.2], [0.1, 2.3], [0.1, 4.2]];
  for (const [d, a] of ring) dome(Math.cos(a) * d, -Math.sin(a) * d * 0.5, 0.095, 0.17);
  // Bloom clusters: low scalloped domes lying on the main dome, their rims sunk into it. The first two sit on
  // opposite sides, so every tier shows one from any side; the fourth (high only) near the top.
  const yellow = m('village:bloom-yellow'), coral = high ? m('village:bloom-coral') : yellow;
  const rosette = polygon(8).map(([x, z], i) => (i % 2 ? [x * 0.84, z * 0.84] : [x, z]) as [number, number]);
  const blooms: [number, number, T.Material][] = [[0.6, 0.5, yellow], [0.75, 4.3, coral], [0.8, 2.5, yellow], [0.15, 3.4, coral]];
  for (const [phi, theta, mat] of blooms.slice(0, low ? 2 : high ? 4 : 3)) {
    const n: Vec3 = [Math.sin(phi) * Math.cos(theta) / main, Math.cos(phi) / H, -Math.sin(phi) * Math.sin(theta) / main];
    const at: Vec3 = [main * 0.96 * Math.sin(phi) * Math.cos(theta), base + H * 0.96 * Math.cos(phi), -main * 0.96 * Math.sin(phi) * Math.sin(theta)];
    b.within({ position: at, rotation: aim(n) }, () => b.geometry(mat, ringSolid(rosette, [{ r: 0.058, y: -0.012 }, { r: 0.034, y: 0.012 }, { r: 0, y: 0.018 }], { smooth: true, capBottom: false })));
  }
}

/**
 * A plain wooden bench, the kind set out in front of a shop or a garden: two
 * wide seat boards on two board ends joined by a stretcher, no back. The steel
 * bench's 1.16 m length and 0.44 m seat; boards light, the frame dark timber.
 * Hard edges and no small pieces, so every tier draws the same few lines.
 */
function bench(m: PropMaterials, b: PartBuilder) {
  const timber = m('village:timber'), boards = m('village:boards');
  const box = (material: T.Material, size: Vec3, at: Vec3, hidden: BoxFace[] = []) => plate(b, material, size, { position: at }, hidden);
  const LEN = 1.16, SEAT = 0.44, BOARD = 0.045, DEPTH = 0.38, GAP = 0.02;
  const w = (DEPTH - GAP) / 2;
  for (const s of [-1, 1]) box(boards, [LEN, BOARD, w], [0, SEAT - BOARD / 2, s * (GAP + w) / 2]);
  const legH = SEAT - BOARD, ends = LEN / 2 - 0.13;
  for (const s of [-1, 1]) box(timber, [0.055, legH, DEPTH - 0.06], [s * ends, legH / 2, 0], ['-y', '+y']);
  box(timber, [2 * ends - 0.055, 0.06, 0.05], [0, 0.13, 0]);
}

/**
 * Stone lantern in the work light's place: a tall eight-sided lantern of the
 * kind that lights a garden path, from the ground up a base, a post, a flared
 * platform, the fire box with its window, a broad roof and a small finial. Its
 * window glows round the work light's light point, which sits in front of the
 * post, so the whole lantern stands 0.1 m forward of the origin; its roof's
 * corners are what reach furthest (0.37 m). Eight sides turn 45° each, so the
 * faces shade apart without drawing a crease between them; the steps from one
 * piece to the next are its lines. The same model at every tier.
 */
function lamp(m: PropMaterials, b: PartBuilder) {
  const stone = m('village:stone'), glow = m('glow');
  const C = 0.1, oct = polygon(8, Math.PI / 8), across = Math.cos(Math.PI / 8);
  const part = (rings: Ring[], caps: { capBottom?: boolean; capTop?: boolean }) => b.geometry(stone, ringSolid(oct, rings.map(r => ({ ...r, z: C })), caps));
  part([{ r: 0.2, y: 0 }, { r: 0.17, y: 0.14 }], { capBottom: false });
  part([{ r: 0.075, y: 0.14 }, { r: 0.066, y: 1.62 }], { capBottom: false, capTop: false });
  part([{ r: 0.066, y: 1.61 }, { r: 0.18, y: 1.71 }, { r: 0.18, y: 1.77 }], { capBottom: false });
  // The fire box: its window passes through it front to back, standing a few millimetres proud of both faces.
  const box = 0.15 / across;
  part([{ r: box, y: 1.77 }, { r: box, y: 2.04 }], { capBottom: false, capTop: false });
  b.box(glow, [0.12, 0.16, 2 * 0.15 + 0.012], { position: [0, 1.93, C] }, 0);
  // Roof: flaring out over the fire box to a sharp eave, rising to a point that carries the finial.
  part([{ r: 0.19, y: 2.04 }, { r: 0.275, y: 2.065 }, { r: 0.05, y: 2.17 }], { capTop: false });
  part([{ r: 0.045, y: 2.165 }, { r: 0, y: 2.2 }], { capBottom: false });
  b.within(WORK_LIGHT_HEAD, () => b.emitter('flood', WORK_LIGHT_LENS, [0, -1, 0]));
}

export const VILLAGE_PROP_BUILDERS: Record<PropKind, (m: PropMaterials, b: PartBuilder) => void> = { cottage, tree, path, flowers, bench, lamp };

/** What each kind is in the village look. */
export const VILLAGE_PROP_NAMES: Record<PropKind, string> = {
  cottage: 'Garden cottage', tree: 'Garden pine', path: 'Stepping stones', flowers: 'Flower pot', bench: 'Garden bench', lamp: 'Stone lantern',
};

// ------------------------------------------------------- the round 8 garden models

/**
 * The round 8 village tree, flower pot and bench, kept exactly as they were
 * before the props above were reshaped for the Japanese town. The industrial
 * and warm looks draw their garden parts (garden.tree, garden.pot and
 * furniture.bench, blueprint/parts/home/garden.ts) with these, in their kit
 * slots' materials, so those looks draw what they drew before; the village
 * look draws the props above. Frozen: tests/unit/village/props-reuse.test.ts
 * holds them to the triangles and boxes they were recorded with.
 */
const blob = (b: PartBuilder, material: T.Material, r: number, detail: number, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) =>
  b.geometry(material, new T.IcosahedronGeometry(r, detail), { position, scale });

/** Round broadleaf tree: a tapered trunk and three overlapping crowns, inside a 0.5 m reach. */
function round8Tree(m: PropMaterials, b: PartBuilder) {
  const low = b.lod === 'low', detail = low ? 0 : b.lod === 'high' ? 2 : 1;
  b.cylinder(m('village:bark'), 0.055, 0.085, 1.4, { position: [0, 0.7, 0] }, { segments: low ? 5 : 7 });
  const leaf = m('village:leaf');
  blob(b, leaf, 0.42, detail, [0, 1.62, 0], [1, 0.95, 1]);
  blob(b, leaf, 0.3, detail, [0.05, 2.06, -0.03]);
  blob(b, leaf, 0.26, detail, [-0.17, 1.4, 0.13]);
}

/** How far the round 8 flower pot reaches towards +Z (its rim). */
export const ROUND8_POT_RIM = 0.2;

/** Terracotta pot with a mound of leaves and flowers, in a 0.3 m reach and 0.7 m height. */
function round8Flowers(m: PropMaterials, b: PartBuilder) {
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

/** Park bench: timber slats on cast iron ends, 1.16 m long with a 0.44 m seat; the sitter faces +Z. */
function round8Bench(m: PropMaterials, b: PartBuilder) {
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

/** The round 8 garden models by prop kind (the industrial and warm looks' garden parts). */
export const ROUND8_GARDEN: Record<'tree' | 'flowers' | 'bench', (m: PropMaterials, b: PartBuilder) => void> = { tree: round8Tree, flowers: round8Flowers, bench: round8Bench };
