import type * as T from 'three';
import type { Vec3 } from '../core/vec.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { villageMaterial } from '../style/village.ts';

// The village look's stonework under things that stand on a planet: one
// design shared by every landing pad (the showcase's, the timeline's, the
// blueprint planet view's) and every footing (the timeline's and the
// showcase's prop footings, the terrain demo's carriers, beds and pads).
//
// - A footing is a plain stone drum: straight sides, a flat top, no chamfer
//   (a 1–2 cm bevel only makes crease noise in the line drawing).
// - A pad is the same drum with a cobbled rim standing a little proud of the
//   deck, so the lines draw the kerb's inner edge; a landing pad adds a cream
//   touchdown ring and cross and its lamps, warm lenses let into the rim.
// - A planting bed is a stone kerb ring round soil level with the floor.
//
// No steel angles, bolts, hazard stripes or chamfers, and no face that is
// never seen (a drum's underside is below the ground, a mark's underside on
// the deck): every pad costs fewer triangles and no more draw calls than the
// industrial one it replaces (tests/unit/terrain/village-stonework.test.ts).
// Where a pad has light fittings the callers keep them (and their emitters)
// where the industrial model has them; this file only draws them. Every
// colour is a village material from the library (src/style/look.ts
// VILLAGE.materials).

export interface StoneMaterials { stone: T.Material; cobble: T.Material; line: T.Material; brass: T.Material; soil: T.Material }

/** The village materials stonework is drawn in (shared and cached by the library). */
export function stoneMaterials(lib: StyleLibrary): StoneMaterials {
  return {
    stone: villageMaterial(lib, 'village:stone'), cobble: villageMaterial(lib, 'village:cobble'),
    line: villageMaterial(lib, 'village:line'), brass: villageMaterial(lib, 'village:brass'), soil: villageMaterial(lib, 'village:soil'),
  };
}

/** Width of a pad's cobbled rim for its radius. */
export const rimWidth = (radius: number) => Math.min(0.32, Math.max(0.05, radius * 0.14));
/** How far a pad's rim stands proud of its deck, metres. */
export const RIM_RISE = 0.012;

export interface DrumShape {
  /** Radius at the top. */
  radius: number;
  /** Radius at the bottom, if the drum batters out a little (default `radius`). */
  foot?: number;
  /** Local y of the flat top and of the bottom (below the ground). */
  top: number;
  bottom: number;
  segments: number;
}

/** A plain stone footing: a straight drum with a flat top, open underneath (below the ground). One lathe, one material. */
export function stoneFooting(b: PartBuilder, stone: T.Material, d: DrumShape) {
  // Up the side, inwards across the top: every face points out.
  b.lathe(stone, [[d.foot ?? d.radius, d.bottom], [d.radius, d.top], [0, d.top]], undefined, d.segments);
}

/**
 * A stone pad: the footing's drum with a cobbled rim round the deck's edge,
 * flush with the drum's side and standing `rise` proud. Returns the rim's top
 * and inner radius, for lamps set into it.
 */
export function stonePad(b: PartBuilder, m: StoneMaterials, d: DrumShape & { rim?: number; rise?: number }): { rimTop: number; rimInner: number } {
  const rim = d.rim ?? rimWidth(d.radius), rise = d.rise ?? RIM_RISE, inner = d.radius - rim;
  stoneFooting(b, m.stone, d);
  // Up the outside, inwards across the top, down the inside.
  b.lathe(m.cobble, [[d.radius, d.top], [d.radius, d.top + rise], [inner, d.top + rise], [inner, d.top]], undefined, d.segments);
  return { rimTop: d.top + rise, rimInner: inner };
}

/** Touchdown marks painted on a landing pad's deck at `y`: a cream ring at about half the radius and a cross at the centre, 3 mm proud. */
export function touchdownMarks(b: PartBuilder, line: T.Material, radius: number, y: number, segments: number) {
  const inner = radius * 0.525, outer = Math.max(radius * 0.56, inner + 0.045), h = 0.003;
  // Inwards across the top, so the face points up.
  b.lathe(line, [[outer, y + h], [inner, y + h]], undefined, segments);
  const arm = radius * 0.4, width = Math.max(radius * 0.031, 0.04);
  for (const a of [0, Math.PI / 2]) b.box(line, [arm, h, width], { position: [0, y + h / 2, 0], rotation: [0, a, 0] }, 0);
}

/** A pad lamp in the builder's current frame: a warm lens of `radius` from `base` (its foot, let into the rim) up `height`. */
export function stoneLamp(b: PartBuilder, glow: T.Material, base: Vec3, radius: number, height: number, segments: number) {
  b.cylinder(glow, radius, radius, height, { position: [base[0], base[1] + height / 2, base[2]] }, { segments });
}

/**
 * A planting bed: a stone kerb ring `kerb` wide standing `rise` proud of the
 * floor (y = `top`), round soil level with the floor, on a stone drum down to
 * `bottom`.
 */
export function stoneBed(b: PartBuilder, m: StoneMaterials, d: DrumShape & { kerb: number; rise: number }) {
  const inner = d.radius - d.kerb;
  b.lathe(m.stone, [[d.foot ?? d.radius, d.bottom], [d.radius, d.top + d.rise], [inner, d.top + d.rise], [inner, d.top]], undefined, d.segments);
  b.lathe(m.soil, [[inner + 0.001, d.top], [0, d.top]], undefined, d.segments);
}

/**
 * A rectangular stone slab, `width` × `depth`, from `bottom` to a deck at
 * `top`, with a cobbled rim round its edge standing `rise` proud.
 */
export function stoneSlab(b: PartBuilder, m: StoneMaterials, s: { width: number; depth: number; top: number; bottom: number; rim?: number; rise?: number }) {
  const { width: w, depth: d } = s, rim = s.rim ?? rimWidth(Math.min(w, d) / 2), rise = s.rise ?? RIM_RISE, h = s.top - s.bottom;
  b.box(m.stone, [w, h, d], { position: [0, s.bottom + h / 2, 0] }, 0);
  const y = s.top + rise / 2;
  for (const z of [-1, 1]) b.box(m.cobble, [w, rise, rim], { position: [0, y, z * (d - rim) / 2] }, 0);
  for (const x of [-1, 1]) b.box(m.cobble, [rim, rise, d - 2 * rim], { position: [x * (w - rim) / 2, y, 0] }, 0);
}
