import * as T from 'three';
import { PartBuilder } from '../../style/geometry.ts';
import type { BuiltPart, Placement } from '../../style/geometry.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary, SurfaceRecipe } from '../../style/materials.ts';
import { GLOW, PALETTE, SCALE } from '../../style/tokens.ts';

// Shared vocabulary for the building kit.
//
// Part-local frames (kept from the material lab's reference modules):
// - cell parts: origin at the cell centre on top of the floor slab;
// - edge parts (walls, parapets, railings): origin on the cell edge at the top
//   of the slab, x runs along the edge (-0.5..0.5 m), +Z is the exterior face;
// - vertex parts (columns): origin on the grid vertex at the top of the slab.
// Walls rise to the underside of the next slab (storey − slab = 2.04 m).
//
// Parts never pick materials directly. They name a logical kit material and
// the source resolves it, so one placed building merges into at most 14 draw
// calls (one per kit material) and only 10 at low LOD, where close look-alikes
// share a material.

export const STOREY = SCALE.storey;
export const SLAB = SCALE.slab;
/** Clear wall height, top of slab to underside of the next slab. */
export const WALL_H = STOREY - SLAB;
export const WALL_T = SCALE.wall;
export const TRACK = 0.08;
export const BEAM = 0.14;

export const KIT_MATERIALS = [
  'post',        // painted structural steel (graphite)
  'steel',       // bare brushed steel: jambs, angles, clips
  'bright',      // steel tube: pipes, handrails, flashings
  'skin',        // exterior cladding panels
  'skinInner',   // interior cladding panels
  'tread',       // tread plate
  'concrete',
  'hazard',
  'leaf',        // smooth painted sheet: door leaves, housings, roof sheet
  'glass',
  'glassSmoked',
  'lamp',        // the one emissive material, owned per model
  'corrugated',
  'membrane',    // rubber: roof membrane, pads, pipe lagging
] as const;
export type KitMaterial = typeof KIT_MATERIALS[number];

/** At low LOD look-alikes share one material, keeping a building at ten draw calls. */
const LOW_SHARE: Partial<Record<KitMaterial, KitMaterial>> = { bright: 'steel', skinInner: 'leaf', glassSmoked: 'glass', membrane: 'post' };
export const kitMaterialFor = (name: KitMaterial, lod: LodTier): KitMaterial => (lod === 'low' ? LOW_SHARE[name] ?? name : name);
export const kitMaterialsAt = (lod: LodTier): KitMaterial[] => [...new Set(KIT_MATERIALS.map(m => kitMaterialFor(m, lod)))];

/** Resolves kit materials. Shared presets come from a StyleLibrary; the lamp glow is owned by the source. */
export interface MaterialSource {
  get(name: KitMaterial): T.Material;
  /** Materials this source created and the model must free (the lamp glow). */
  owned(): T.Material[];
}

/**
 * Looks this module registers with StyleLibrary.custom.
 * - tube: rails, conduits, levers, gutters and flashings. Mid-grey steel with a
 *   damped reflection. Polished light alloy here mirrored the hangar softbox
 *   into continuous white bars that bloomed like neon at high LOD, and the
 *   brushed preset's streaks twist on sloped tubes because UVs are box-projected.
 * - precast: smooth cast concrete. The concrete preset's 2 m pattern carries
 *   form-tie holes and pits up to 3 cm across, drawn into both the normal and
 *   the albedo map; on pavers and wall upstands under a metre long they read as
 *   craters, so kit concrete uses the plain pattern with the concrete finish.
 */
export const KIT_LOOKS = {
  tube: { finish: 'metal', pattern: 'plain', color: PALETTE.steel, envIntensity: 0.55 },
  precast: { finish: 'concrete', pattern: 'plain', color: PALETTE.concrete, relief: 1.6 },
} as const satisfies Record<string, SurfaceRecipe>;

export function libraryMaterials(lib: StyleLibrary): MaterialSource {
  let lamp: T.MeshStandardMaterial | null = null;
  const resolve = (name: KitMaterial): T.Material => {
    switch (kitMaterialFor(name, lib.lod)) {
      case 'post': return lib.preset('framePainted');
      case 'steel': return lib.preset('frame');
      case 'bright': return lib.custom('blueprint:tube', KIT_LOOKS.tube);
      case 'skin': return lib.preset('cladding');
      case 'skinInner': return lib.preset('claddingDark');
      case 'tread': return lib.preset('deck');
      case 'concrete': return lib.custom('blueprint:precast', KIT_LOOKS.precast);
      case 'hazard': return lib.hazard();
      case 'leaf': return lib.preset('sheet');
      case 'glass': return lib.glass('clear');
      case 'glassSmoked': return lib.glass('smoked');
      case 'corrugated': return lib.preset('corrugated');
      case 'membrane': return lib.preset('rubber');
      case 'lamp':
        if (!lamp) { lamp = lib.createGlow(PALETTE.sodium, GLOW.lit); lamp.name = 'blueprint:lamp'; }
        return lamp;
    }
  };
  return { get: resolve, owned: () => (lamp ? [lamp] : []) };
}

/**
 * Plain stand-in materials, one per kit material, for counting triangles and
 * draw calls in Node or before textures exist. Geometry is identical to a
 * library build; only the materials differ.
 */
export function countingMaterials(lod: LodTier): MaterialSource & { dispose(): void } {
  const made = new Map<KitMaterial, T.Material>();
  return {
    get(name) {
      const key = kitMaterialFor(name, lod);
      let m = made.get(key);
      if (!m) { m = new T.MeshBasicMaterial({ name: `count:${key}` }); made.set(key, m); }
      return m;
    },
    owned: () => [],
    dispose() { made.forEach(m => m.dispose()); made.clear(); },
  };
}

/** What a part's emitter receives: a builder, a material resolver and LOD switches. */
export interface Kit {
  b: PartBuilder;
  m(name: KitMaterial): T.Material;
  lod: LodTier;
  /** Small hardware (bolts, clips) is drawn. */
  hardware: boolean;
  /** High LOD only: fine extras such as per-tread fixings and mid rails. */
  fine: boolean;
  /** Low LOD: drop secondary members entirely. */
  low: boolean;
}

export function makeKit(b: PartBuilder, source: MaterialSource): Kit {
  const s = b.settings;
  return { b, m: name => source.get(name), lod: b.lod, hardware: s.hardware, fine: b.lod === 'high', low: b.lod === 'low' };
}

export type Emit = (k: Kit) => void;

/** Build one part on its own (its own builder and lamp). */
export function buildEmit(emit: Emit, name: string, lib: StyleLibrary, b = new PartBuilder(lib.lod)): BuiltPart {
  emit(makeKit(b, libraryMaterials(lib)));
  return b.build(name);
}

// ------------------------------------------------------------ shared pieces

/** Half posts at both ends, an optional floor track and a head beam with bolted flange plates. */
export function wallFrame(k: Kit, opts: { track?: boolean; height?: number } = {}) {
  const { b } = k;
  const steel = k.m('post'), bare = k.m('steel');
  const h = opts.height ?? WALL_H;
  for (const x of [-0.475, 0.475]) b.box(steel, [0.05, h, WALL_T + 0.02], { position: [x, h / 2, 0] }, 0.008);
  if (opts.track !== false) b.box(bare, [0.9, TRACK, WALL_T + 0.02], { position: [0, TRACK / 2, 0] }, 0.006);
  b.box(steel, [0.9, BEAM, WALL_T + 0.03], { position: [0, h - BEAM / 2, 0] }, 0.008);
  for (const x of [-0.42, 0.42]) {
    b.box(bare, [0.08, 0.12, 0.012], { position: [x, h - BEAM / 2, WALL_T / 2 + 0.021] }, 0.003);
    for (const dy of [-0.035, 0.035]) b.bolt(bare, { position: [x, h - BEAM / 2 + dy, WALL_T / 2 + 0.027], rotation: [Math.PI / 2, 0, 0] }, 0.011);
  }
}

/** Cladding between y0 and y1 across x0..x1: exterior and interior skins. */
export function cladding(k: Kit, x0: number, x1: number, y0: number, y1: number) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  k.b.box(k.m('skin'), [w, h, 0.05], { position: [cx, cy, WALL_T / 2 - 0.025] }, 0.006);
  k.b.box(k.m('skinInner'), [w, h, 0.05], { position: [cx, cy, -WALL_T / 2 + 0.025] }, 0.006);
}

export function kickPlate(k: Kit, x0: number, x1: number) {
  k.b.box(k.m('tread'), [x1 - x0, 0.22, 0.012], { position: [(x0 + x1) / 2, TRACK + 0.11, WALL_T / 2 + 0.006] }, 0.003);
}

/** A cable conduit on the exterior face, held by two bolted clips. */
export function conduit(k: Kit, y: number) {
  const pipe = k.m('bright'), clip = k.m('steel');
  k.b.cylinder(pipe, 0.02, 0.02, 1.0, { position: [0, y, WALL_T / 2 + 0.032], rotation: [0, 0, Math.PI / 2] });
  for (const x of [-0.3, 0.3]) {
    k.b.box(clip, [0.03, 0.06, 0.05], { position: [x, y, WALL_T / 2 + 0.024] }, 0.004);
    k.b.bolt(clip, { position: [x, y + 0.042, WALL_T / 2 + 0.012], rotation: [Math.PI / 2, 0, 0] }, 0.008);
  }
}

/** Concrete slab with edge angles, the base of every deck-type cell part (y −0.16 … −0.03). */
export function slab(k: Kit) {
  const s = SLAB;
  k.b.box(k.m('concrete'), [0.98, s - 0.03, 0.98], { position: [0, -s / 2 - 0.015, 0] }, 0.01);
  edgeAngles(k, -0.0175, 0.035);
}

export function edgeAngles(k: Kit, y: number, h: number) {
  const angle = k.m('steel');
  for (const [x, z, w, d] of [[0, 0.49, 1, 0.02], [0, -0.49, 1, 0.02], [0.49, 0, 0.02, 0.96], [-0.49, 0, 0.02, 0.96]] as const) {
    k.b.box(angle, [w, h, d], { position: [x, y, z] }, 0.003);
  }
}

/**
 * Extrude a profile drawn in the part's Z–Y plane (pairs of [z, y]) across x
 * from x0 to x1. Used for stringers, gutters and roof wedges.
 */
export function extrudeZY(k: Kit, material: T.Material, profile: [number, number][], x0: number, x1: number, placement: Placement = {}) {
  // Rotating +90° about Y sends the extrusion axis (+Z) to +X and shape x to −Z.
  const outline = profile.map(([z, y]) => [-z, y] as [number, number]);
  k.b.within(placement, () => k.b.extrude(material, outline, x1 - x0, { position: [x0, 0, 0], rotation: [0, Math.PI / 2, 0] }));
}

/**
 * Lathe a closed profile ([radius, y] pairs) one segment at a time. LatheGeometry
 * averages normals across profile corners, which rounds a pressed ring into a
 * tyre; separate bands keep every fold crisp and stay smooth around the axis.
 * Same triangle count as one lathe of the whole profile.
 */
export function latheBands(k: Kit, material: T.Material, profile: [number, number][], placement?: Placement) {
  for (let i = 0; i + 1 < profile.length; i++) k.b.lathe(material, [profile[i], profile[i + 1]], placement);
}

/** Chamfer helper: small pieces lose their chamfer below high LOD to save triangles. */
export const small = (k: Kit, c: number) => (k.fine ? c : 0);
