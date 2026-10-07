import * as T from 'three';
import { PartBuilder } from '../../style/geometry.ts';
import type { BuiltPart, Placement } from '../../style/geometry.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary, SurfaceRecipe } from '../../style/materials.ts';
import { GLOW, PALETTE, SCALE } from '../../style/tokens.ts';
import { createInkMaterials } from '../../style/ink.ts';
import type { InkMaterials } from '../../style/ink.ts';
import { lookParams } from '../../style/look.ts';
import { VILLAGE_GROUND, VILLAGE_LAMP, villageMaterial } from '../../style/village.ts';
import type { Look } from '../../style/look.ts';

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
// the source resolves it, so one placed building merges into at most 17 draw
// calls (one per kit material; 14 without the street surfaces) and only 10 at
// low LOD, where close look-alikes share a material.

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
  'pavers',      // precast paving slabs (street)
  'asphalt',     // road surface (street)
  'marking',     // road and pad paint
] as const;
export type KitMaterial = typeof KIT_MATERIALS[number];

/** At low LOD look-alikes share one material, keeping a building at ten draw calls. */
const LOW_SHARE: Partial<Record<KitMaterial, KitMaterial>> = { bright: 'steel', skinInner: 'leaf', glassSmoked: 'glass', membrane: 'post', pavers: 'concrete', asphalt: 'post', marking: 'skin' };
export const kitMaterialFor = (name: KitMaterial, lod: LodTier): KitMaterial => (lod === 'low' ? LOW_SHARE[name] ?? name : name);
export const kitMaterialsAt = (lod: LodTier): KitMaterial[] => [...new Set(KIT_MATERIALS.map(m => kitMaterialFor(m, lod)))];

/** Resolves kit materials. Shared presets come from a StyleLibrary; the lamp glow is owned by the source. */
export interface MaterialSource {
  get(name: KitMaterial): T.Material;
  /** Materials this source created and the model must free (the lamp glow). */
  owned(): T.Material[];
  /** The look the materials are in; the village look also selects the village models (parts/village). */
  look?: Look;
  /** Ink outline materials when the look draws them. */
  ink?(): InkMaterials | null;
}

/**
 * The village look's material for each kit slot. Slot names keep their
 * contract (parts still ask for 'skin', 'leaf' and so on); the village models
 * use them for plaster, painted doors and so on, and close look-alikes share
 * one material so a building stays within its draw calls with its ink lines:
 * 14 materials at most, plus the ink shell and lines, and a single part within
 * BUDGET.part's ten. Inside and outside plaster are one material. Two slots
 * carry planting in this look: 'membrane' is foliage, 'hazard' is blossom.
 */
const VILLAGE_SLOTS: Record<KitMaterial, string> = {
  post: 'village:timber', steel: 'village:iron', bright: 'village:iron', skin: 'village:plaster', skinInner: 'village:plaster',
  tread: 'village:boards', concrete: 'village:stone', hazard: 'village:bloom-coral', leaf: 'village:paint', glass: 'glass',
  glassSmoked: 'glass', lamp: 'lamp', corrugated: 'village:tile', membrane: 'village:leaf', pavers: 'village:cobble',
  asphalt: 'village:lane', marking: 'village:line',
};
/** At low LOD the village look folds further, to 8 materials and the ink lines: inside the 10 calls of BUDGET.building.low. */
const VILLAGE_LOW: Record<string, string> = {
  'village:iron': 'village:timber', 'village:boards': 'village:timber', 'village:line': 'village:plaster',
  'village:cobble': 'village:stone', 'village:lane': 'village:stone', 'village:bloom-coral': 'village:paint',
};
/** The village material a kit slot resolves to at a tier ('glass' and 'lamp' are the library's glass and the owned glow). */
export const villageKey = (name: KitMaterial, lod: LodTier): string => {
  const key = VILLAGE_SLOTS[name];
  return lod === 'low' ? VILLAGE_LOW[key] ?? key : key;
};

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
  // Interior lining: light grey painted steel, as cabins and plant rooms are lined, so a
  // room lit only through its door and windows still reads instead of going black.
  lining: { finish: 'paint', pattern: 'panel', color: '#8b8e8c' },
  // Street surfaces: with scans on they use the CC0 paving and asphalt sets in their
  // own colours; without, a plain concrete finish in the nearest palette tone.
  pavers: { finish: 'concrete', pattern: 'concrete', color: PALETTE.concrete, scan: 'concrete_pavement' },
  asphalt: { finish: 'concrete', pattern: 'plain', color: '#34373a', scan: 'clean_asphalt' },
  marking: { finish: 'paint', pattern: 'plain', color: '#c8c3b4', scan: 'blue_metal_plate', scanRoughness: 2.2 },
} as const satisfies Record<string, SurfaceRecipe>;

export function libraryMaterials(lib: StyleLibrary): MaterialSource {
  let lamp: T.MeshStandardMaterial | null = null;
  const village = lib.look === 'village';
  const resolve = (name: KitMaterial): T.Material => {
    if (village) {
      const key = villageKey(name, lib.lod);
      if (key === 'glass') return lib.glass('clear');
      if (key === 'lamp') {
        if (!lamp) { lamp = lib.createGlow(VILLAGE_LAMP, GLOW.lit); lamp.name = 'blueprint:lamp'; }
        return lamp;
      }
      return villageMaterial(lib, key);
    }
    switch (kitMaterialFor(name, lib.lod)) {
      case 'post': return lib.preset('framePainted');
      case 'steel': return lib.preset('frame');
      case 'bright': return lib.custom('blueprint:tube', KIT_LOOKS.tube);
      case 'skin': return lib.preset('cladding');
      case 'skinInner': return lib.custom('blueprint:lining', KIT_LOOKS.lining);
      case 'tread': return lib.preset('deck');
      case 'concrete': return lib.custom('blueprint:precast', KIT_LOOKS.precast);
      case 'hazard': return lib.hazard();
      case 'leaf': return lib.preset('sheet');
      case 'glass': return lib.glass('clear');
      case 'glassSmoked': return lib.glass('smoked');
      case 'corrugated': return lib.preset('corrugated');
      case 'membrane': return lib.preset('rubber');
      case 'pavers': return lib.custom('blueprint:pavers', KIT_LOOKS.pavers);
      case 'asphalt': return lib.custom('blueprint:asphalt', KIT_LOOKS.asphalt);
      case 'marking': return lib.custom('blueprint:marking', KIT_LOOKS.marking);
      case 'lamp':
        if (!lamp) { lamp = lib.createGlow(PALETTE.sodium, GLOW.lit); lamp.name = 'blueprint:lamp'; }
        return lamp;
    }
  };
  return { get: resolve, owned: () => (lamp ? [lamp] : []), look: lib.look, ink: () => lib.ink() };
}

/**
 * Plain stand-in materials, one per kit material, for counting triangles and
 * draw calls in Node or before textures exist. Geometry is identical to a
 * library build; only the materials differ. In the village look they fold the
 * way the village materials do and bring stand-in ink, so a count includes
 * the outline.
 */
export function countingMaterials(lod: LodTier, look: Look = 'industrial'): MaterialSource & { dispose(): void } {
  const made = new Map<string, T.Material>();
  const village = look === 'village';
  let ink: InkMaterials | null = null;
  return {
    get(name) {
      const key = village ? villageKey(name, lod) : kitMaterialFor(name, lod);
      let m = made.get(key);
      if (!m) {
        // Glass is transparent in the library, which keeps it out of the ink outline.
        m = new T.MeshBasicMaterial({ name: `count:${key}`, transparent: key === 'glass' || key === 'glassSmoked' });
        if (village && VILLAGE_GROUND.has(key)) m.userData.inkShell = false;
        made.set(key, m);
      }
      return m;
    },
    owned: () => [],
    ...(village ? { look, ink: () => (ink ??= createInkMaterials('#000000', 1, 1)) } : {}),
    dispose() {
      made.forEach(m => m.dispose()); made.clear();
      if (ink) { ink.shell.dispose(); ink.lines.dispose(); ink = null; }
    },
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

/**
 * The kit slot a village prop's material key (src/props/village.ts) is drawn
 * in, so a part can draw a prop's own model: the same village material in the
 * village look where the key has a slot, the slot's industrial material in the
 * industrial look. Keys with no slot fold into the nearest: bark and soil into
 * timber (#8a6a4f and #6f5240 against #7d5b43), the pot's terracotta into
 * tile, yellow blooms into cream plaster (#efe3c6), which keeps their outline.
 */
const PROP_SLOTS: Record<string, KitMaterial> = {
  'village:timber': 'post', 'village:iron': 'steel', 'village:plaster': 'skin', 'village:boards': 'tread', 'village:stone': 'concrete',
  'village:paint': 'leaf', 'village:tile': 'corrugated', 'village:leaf': 'membrane', 'village:bloom-coral': 'hazard',
  'village:cobble': 'pavers', 'village:lane': 'asphalt', 'village:line': 'marking', glass: 'glass', glow: 'lamp',
  'village:bark': 'post', 'village:soil': 'post', 'village:pot': 'corrugated', 'village:bloom-yellow': 'skin',
};

/** A village prop's material resolver (props/village.ts PropMaterials) that asks this kit by slot. */
export function kitPropMaterials(k: Kit): (key: string) => T.Material {
  return key => {
    const slot = PROP_SLOTS[key];
    if (!slot) throw new Error(`No kit slot for the prop material ${key}.`);
    return k.m(slot);
  };
}

/**
 * Chamfers below this size are drawn as hard edges, per tier. At medium the
 * 3–4.5 mm chamfers on thin plates, edge angles, clips, sills and tread plates
 * go: each costs 44 triangles against a plain box's 12, and the plate's own
 * edge still shows. The 5–12 mm chamfers on posts, beams, panels, slabs and
 * columns stay, so outlines and members keep their bevels. High keeps every
 * chamfer; low draws none (its settings have no bevels).
 */
export const KIT_MIN_CHAMFER: Record<LodTier, number> = { high: 0, medium: 0.005, low: 0 };

/** Wraps a builder for kit parts, raising its minimum chamfer to the tier's (KIT_MIN_CHAMFER). */
export function makeKit(b: PartBuilder, source: MaterialSource): Kit {
  const s = b.settings;
  b.minChamfer = Math.max(b.minChamfer, KIT_MIN_CHAMFER[b.lod]);
  const outline = source.look ? lookParams(source.look)?.outline : undefined, ink = outline ? source.ink?.() : null;
  if (outline && ink) b.ink = { materials: ink, crease: outline.crease };
  return { b, m: name => source.get(name), lod: b.lod, hardware: s.hardware, fine: b.lod === 'high', low: b.lod === 'low' };
}

/**
 * The interior lining sits inside the exterior skin of the same wall, and a
 * wall's openings are framed by members that span its whole thickness, so the
 * skin already casts the lining's shadow. Drawing the lining into the shadow
 * map again only costs triangles; it still receives shadows.
 */
export function liningCastsNoShadow(group: T.Object3D, source: MaterialSource, lod: LodTier) {
  if (kitMaterialFor('skinInner', lod) !== 'skinInner') return;   // at low it shares a material with door leaves
  const lining = source.get('skinInner');
  // Where the lining shares the exterior's material (the village look's plaster), it is the exterior too.
  if (lining === source.get('skin') || lining === source.get('leaf')) return;
  group.traverse(o => { if ((o as T.Mesh).isMesh && (o as T.Mesh).material === lining) o.castShadow = false; });
}

export type Emit = (k: Kit) => void;

/** Build one part on its own (its own builder and lamp). */
export function buildEmit(emit: Emit, name: string, lib: StyleLibrary, b = new PartBuilder(lib.lod)): BuiltPart {
  const source = libraryMaterials(lib);
  emit(makeKit(b, source));
  const built = b.build(name);
  liningCastsNoShadow(built.group, source, b.lod);
  return built;
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

/**
 * Cladding between y0 and y1 across x0..x1: exterior and interior skins. Above
 * low LOD the exterior gets joint cover strips on the 0.5 m panel rows (the
 * same rows the panel normal map draws), so the joints cast real shadow lines.
 */
export function cladding(k: Kit, x0: number, x1: number, y0: number, y1: number) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  k.b.box(k.m('skin'), [w, h, 0.05], { position: [cx, cy, WALL_T / 2 - 0.025] }, 0.006);
  k.b.box(k.m('skinInner'), [w, h, 0.05], { position: [cx, cy, -WALL_T / 2 + 0.025] }, 0.006);
  if (k.low) return;
  for (const y of [0.5, 1.0, 1.5, 2.0]) {
    if (y < y0 + 0.04 || y > y1 - 0.04) continue;
    k.b.box(k.m('skin'), [w - 0.004, 0.022, 0.008], { position: [cx, y, WALL_T / 2 + 0.004] }, small(k, 0.002));
  }
}

/**
 * Inside face of a wall module: a painted steel skirting at the floor and, where the
 * wall has no opening at the top, a cable raceway under the head beam. Inside detail
 * stands at most 30 mm off the wall face (window boards 25 mm), so a wall on a stair
 * side with its inside to the stair still clears the handrails (STAIR.reach).
 */
export function interiorFinish(k: Kit, opts: { raceway?: boolean; x0?: number; x1?: number } = {}) {
  const x0 = opts.x0 ?? -0.45, x1 = opts.x1 ?? 0.45, cx = (x0 + x1) / 2, w = x1 - x0;
  k.b.box(k.m('post'), [w, 0.09, 0.012], { position: [cx, 0.045 + TRACK * 0.25, -WALL_T / 2 - 0.006] }, small(k, 0.002));
  if (opts.raceway === false || k.low) return;
  const y = WALL_H - BEAM - 0.05;
  k.b.box(k.m('leaf'), [0.9, 0.055, 0.025], { position: [0, y, -WALL_T / 2 - 0.0125] }, small(k, 0.004));
  if (k.hardware) for (const x of [-0.3, 0.3]) k.b.box(k.m('steel'), [0.02, 0.07, 0.03], { position: [x, y, -WALL_T / 2 - 0.015] }, 0);
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
