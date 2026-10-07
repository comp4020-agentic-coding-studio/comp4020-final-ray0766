import { PartBuilder } from '../../style/geometry.ts';
import type { BuiltPart } from '../../style/geometry.ts';
import { LOD_TIERS } from '../../style/lod.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary } from '../../style/materials.ts';
import type { Look } from '../../style/look.ts';
import { floorDeck, grateDeck, roofDeck, slopeRoof } from './decks.ts';
import { buildEmit, countingMaterials, makeKit } from './kit.ts';
import type { Emit, Kit } from './kit.ts';
import { cornerColumn, guardRail, parapet, plantUnit, stair } from './structure.ts';
import { corrugatedWall, doorOpenWall, doorWall, louvreWall, solidWall, windowWall } from './walls.ts';
import { padQuarter, serviceLight, streetKerb, streetPaving, streetPipes, streetRoad } from './street.ts';
import { entryRamp, entrySteps } from './home/entry.ts';
import { beam } from './home/frame.ts';
import { chair, shelf, sideboard, table } from './home/furniture.ts';
import { flowerBed } from './home/bed.ts';
import { bench, pot, tree } from './home/garden.ts';
import { kerbCorner, roadCorner, roadPlain } from './home/joins.ts';
import { hipRoof, valleyRoof } from './home/roofs.ts';
import { vergeLeft, vergeRight } from './home/verges.ts';
import { barrel, crates } from './home/storage.ts';
import { signBlank, signCup, signMail, wallLamp } from './home/fixtures.ts';
import { VILLAGE_BLURBS, VILLAGE_EMITS, VILLAGE_NAMES } from './village/index.ts';

// The parts a blueprint is made of. Each entry says how it mounts on the grid
// (cell, edge or vertex) and what structural role it plays; the occupancy and
// support rules in ../model.ts are written against these roles only.

export type Mount = 'cell' | 'edge' | 'vertex';

/**
 * - deck: forms the walking surface of its cell at its level (floors, roof decks).
 * - wall: a storey-high edge that also carries the deck above.
 * - guard: an edge part that carries nothing (parapet, railing).
 * - column: a vertex post that carries the deck above.
 * - stair: two cells, rises one level and keeps a stairwell open above.
 * - slope: a roof panel that covers its cell and keeps its eave sides clear.
 * - equipment: stands on a deck inside one cell.
 * - furnishing: stands on a deck against one side of its cell (edge-mounted,
 *   inside the cell); a cell takes them on two opposite sides at most.
 * - fixture: hangs on the face of a plain wall, inside the cell it looks into.
 * - entry: entrance steps or ramp from a ground-floor deck down to the ground.
 * - trim: finishes the edges of its own cell (a kerb corner, a verge board).
 * - beam: spans an edge between the posts at its two ends, under the slab above.
 */
export type Role = 'deck' | 'wall' | 'guard' | 'column' | 'stair' | 'slope' | 'equipment' | 'furnishing' | 'fixture' | 'entry' | 'trim' | 'beam';

export const PART_IDS = [
  'floor.deck', 'floor.grate', 'wall.solid', 'wall.door', 'wall.window', 'wall.louvre', 'wall.corrugated',
  'structure.column', 'stair.straight', 'rail.guard', 'roof.deck', 'roof.parapet', 'roof.slope', 'roof.plant',
  'wall.door.open', 'street.paving', 'street.road', 'street.kerb', 'street.pipes', 'service.light', 'pad.quarter',
  // Round 8 (docs/WORKSHOP.md): appended, so every earlier blueprint keeps its meaning.
  'street.road.plain', 'street.road.corner', 'street.kerb.corner', 'step.entry', 'ramp.entry',
  'roof.slope.hip', 'roof.slope.valley', 'roof.verge.left', 'roof.verge.right', 'structure.beam',
  'furniture.table', 'furniture.chair', 'furniture.sideboard', 'furniture.shelf', 'storage.crates', 'storage.barrel',
  'garden.bed', 'garden.pot', 'garden.tree', 'furniture.bench', 'light.wall', 'sign.blank', 'sign.mail', 'sign.cup',
] as const;
export type PartId = typeof PART_IDS[number];
export const isPartId = (v: unknown): v is PartId => typeof v === 'string' && (PART_IDS as readonly string[]).includes(v);

export interface PartDef {
  id: PartId;
  label: string;
  /** One line for the palette tile. */
  blurb: string;
  category: 'Floor' | 'Wall' | 'Structure' | 'Roof' | 'Street' | 'Furniture' | 'Garden' | 'Light';
  mount: Mount;
  role: Role;
  /** Decks that count as a floor for walls, columns, stairs and equipment standing on them. */
  floor?: boolean;
  /** Roofs need walls or columns below even at level 0. */
  roof?: boolean;
  /** A wall people walk through; kept off a stair's sides and off its landing edge, and the only part allowed at its top exit. */
  door?: boolean;
  /** A wall whose faces are plain on both sides, so fixtures may hang on them. */
  plainFaces?: boolean;
  /** Equipment that leaves its cell's sides to furnishings that tuck under it (a table). */
  sides?: boolean;
  /** Furnishing low enough to tuck under a table top (a chair). */
  tuck?: boolean;
  /** Reaches the wall-fixture band (above 1.5 m): a furnishing takes its wall face too; equipment keeps every face of its cell clear. */
  tall?: boolean;
  /** Equipment that rises into the level above (a tree): keeps that cell's deck and space clear. */
  above?: boolean;
  /** Equipment whose cell edges may hold no wall (a tree's canopy reaches over them). */
  noWalls?: boolean;
  /** Equipment whose ends reach past its cell's local ±X edges (a bench): keeps those edges clear. */
  reach?: boolean;
  /** Equipment that may not stand in a cell with a door on one of its edges (it would block the way through). */
  clearOfDoors?: boolean;
  /** Slope: the local sides that are eaves (0 = +Z, 1 = +X), each kept clear with the deck beyond it. Default [0]. */
  eaves?: number[];
  /** Trim: the local sides of its own cell it occupies, and what it stands on. */
  trim?: { sides: number[]; on: 'floor' | 'slope' };
  /** Entry: how many cells it runs over, top cell first (towards local +Z). */
  cells?: 1 | 2;
  /** What it does beyond being seen. Default: nothing (a look-only module). */
  behaviour?: 'light';
  emit: Emit;
}

export const PARTS: Record<PartId, PartDef> = {
  'floor.deck': { id: 'floor.deck', label: 'Floor deck', blurb: 'Concrete slab, tread plate', category: 'Floor', mount: 'cell', role: 'deck', floor: true, emit: floorDeck },
  'floor.grate': { id: 'floor.grate', label: 'Grated catwalk', blurb: 'Open grating on channels', category: 'Floor', mount: 'cell', role: 'deck', floor: true, emit: grateDeck },
  'wall.solid': { id: 'wall.solid', label: 'Solid wall', blurb: 'Clad panel, conduit', category: 'Wall', mount: 'edge', role: 'wall', plainFaces: true, emit: solidWall },
  'wall.door': { id: 'wall.door', label: 'Door wall', blurb: 'Steel door, status lamp', category: 'Wall', mount: 'edge', role: 'wall', door: true, emit: doorWall },
  'wall.window': { id: 'wall.window', label: 'Window wall', blurb: 'Double glazed, sun hood', category: 'Wall', mount: 'edge', role: 'wall', emit: windowWall },
  'wall.louvre': { id: 'wall.louvre', label: 'Louvre wall', blurb: 'Vent blades, weather hood', category: 'Wall', mount: 'edge', role: 'wall', emit: louvreWall },
  'wall.corrugated': { id: 'wall.corrugated', label: 'Shed wall', blurb: 'Corrugated sheet on girts', category: 'Wall', mount: 'edge', role: 'wall', emit: corrugatedWall },
  'structure.column': { id: 'structure.column', label: 'Corner column', blurb: 'Steel post at a vertex', category: 'Structure', mount: 'vertex', role: 'column', emit: cornerColumn },
  'stair.straight': { id: 'stair.straight', label: 'Straight stair', blurb: '1×2 cells, one storey', category: 'Structure', mount: 'cell', role: 'stair', emit: stair },
  'rail.guard': { id: 'rail.guard', label: 'Guard railing', blurb: 'Balcony and roof edge', category: 'Structure', mount: 'edge', role: 'guard', emit: guardRail },
  'roof.deck': { id: 'roof.deck', label: 'Roof deck', blurb: 'Membrane and pavers', category: 'Roof', mount: 'cell', role: 'deck', floor: true, roof: true, emit: roofDeck },
  'roof.parapet': { id: 'roof.parapet', label: 'Parapet', blurb: 'Roof edge with coping', category: 'Roof', mount: 'edge', role: 'guard', emit: parapet },
  'roof.slope': { id: 'roof.slope', label: 'Sloped roof', blurb: 'Standing seam, gutter', category: 'Roof', mount: 'cell', role: 'slope', roof: true, emit: slopeRoof },
  'roof.plant': { id: 'roof.plant', label: 'Plant unit', blurb: 'Condenser on a skid', category: 'Roof', mount: 'cell', role: 'equipment', emit: plantUnit },
  'wall.door.open': { id: 'wall.door.open', label: 'Open door', blurb: 'Door held open inward', category: 'Wall', mount: 'edge', role: 'wall', door: true, emit: doorOpenWall },
  'street.paving': { id: 'street.paving', label: 'Footway', blurb: 'Precast paving slabs', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: streetPaving },
  'street.road': { id: 'street.road', label: 'Roadway', blurb: 'Asphalt, centre line', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: streetRoad },
  'street.kerb': { id: 'street.kerb', label: 'Kerb', blurb: 'Precast kerb, gully grate', category: 'Street', mount: 'edge', role: 'guard', emit: streetKerb },
  'street.pipes': { id: 'street.pipes', label: 'Pipe rack', blurb: 'Lagged main and return', category: 'Street', mount: 'edge', role: 'guard', emit: streetPipes },
  'service.light': { id: 'service.light', label: 'Street light', blurb: '3.4 m column, warm head', category: 'Street', mount: 'cell', role: 'equipment', tall: true, behaviour: 'light', emit: serviceLight },
  'pad.quarter': { id: 'pad.quarter', label: 'Pad quarter', blurb: 'Quarter of a 2×2 pad', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: padQuarter },
  'street.road.plain': { id: 'street.road.plain', label: 'Plain roadway', blurb: 'No marking: bends, junctions, alleys', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: roadPlain },
  'street.road.corner': { id: 'street.road.corner', label: 'Roadway corner', blurb: 'Centre line turning a corner', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: roadCorner },
  'street.kerb.corner': { id: 'street.kerb.corner', label: 'Kerb corner', blurb: 'Kerb round a cell corner', category: 'Street', mount: 'cell', role: 'trim', trim: { sides: [0, 1], on: 'floor' }, emit: kerbCorner },
  'step.entry': { id: 'step.entry', label: 'Entrance steps', blurb: 'Four 0.15 m steps to the ground', category: 'Structure', mount: 'cell', role: 'entry', cells: 1, emit: entrySteps },
  'ramp.entry': { id: 'ramp.entry', label: 'Entrance ramp', blurb: '1×2 cells, 0.6 m down', category: 'Structure', mount: 'cell', role: 'entry', cells: 2, emit: entryRamp },
  'roof.slope.hip': { id: 'roof.slope.hip', label: 'Hip roof corner', blurb: 'Outer corner of a sloped roof', category: 'Roof', mount: 'cell', role: 'slope', roof: true, eaves: [0, 1], emit: hipRoof },
  'roof.slope.valley': { id: 'roof.slope.valley', label: 'Valley roof corner', blurb: 'Inner corner of a sloped roof', category: 'Roof', mount: 'cell', role: 'slope', roof: true, eaves: [], emit: valleyRoof },
  'roof.verge.left': { id: 'roof.verge.left', label: 'Verge, left', blurb: 'Gable end trim, left side', category: 'Roof', mount: 'cell', role: 'trim', trim: { sides: [3], on: 'slope' }, emit: vergeLeft },
  'roof.verge.right': { id: 'roof.verge.right', label: 'Verge, right', blurb: 'Gable end trim, right side', category: 'Roof', mount: 'cell', role: 'trim', trim: { sides: [1], on: 'slope' }, emit: vergeRight },
  'structure.beam': { id: 'structure.beam', label: 'Porch beam', blurb: 'Beam between two posts', category: 'Structure', mount: 'edge', role: 'beam', emit: beam },
  'furniture.table': { id: 'furniture.table', label: 'Round table', blurb: 'Chairs tuck under it', category: 'Furniture', mount: 'cell', role: 'equipment', sides: true, clearOfDoors: true, emit: table },
  'furniture.chair': { id: 'furniture.chair', label: 'Chair', blurb: 'Against a side, faces in', category: 'Furniture', mount: 'edge', role: 'furnishing', tuck: true, emit: chair },
  'furniture.sideboard': { id: 'furniture.sideboard', label: 'Sideboard', blurb: 'Low cabinet against a wall', category: 'Furniture', mount: 'edge', role: 'furnishing', emit: sideboard },
  'furniture.shelf': { id: 'furniture.shelf', label: 'Shelf', blurb: 'Tall open shelves', category: 'Furniture', mount: 'edge', role: 'furnishing', tall: true, emit: shelf },
  'storage.crates': { id: 'storage.crates', label: 'Crates', blurb: 'Two stacked crates', category: 'Furniture', mount: 'edge', role: 'furnishing', emit: crates },
  'storage.barrel': { id: 'storage.barrel', label: 'Barrel', blurb: 'Small barrel', category: 'Furniture', mount: 'edge', role: 'furnishing', emit: barrel },
  'garden.bed': { id: 'garden.bed', label: 'Flower bed', blurb: 'Raised bed filling a cell', category: 'Garden', mount: 'cell', role: 'equipment', clearOfDoors: true, emit: flowerBed },
  'garden.pot': { id: 'garden.pot', label: 'Flower pot', blurb: 'Against a side of a cell', category: 'Garden', mount: 'edge', role: 'furnishing', emit: pot },
  'garden.tree': { id: 'garden.tree', label: 'Tree', blurb: 'Open sky above, no walls', category: 'Garden', mount: 'cell', role: 'equipment', tall: true, above: true, noWalls: true, emit: tree },
  'furniture.bench': { id: 'furniture.bench', label: 'Bench', blurb: 'Ends reach over two edges', category: 'Furniture', mount: 'cell', role: 'equipment', reach: true, clearOfDoors: true, emit: bench },
  'light.wall': { id: 'light.wall', label: 'Wall lamp', blurb: 'On a plain wall, lit', category: 'Light', mount: 'edge', role: 'fixture', behaviour: 'light', emit: wallLamp },
  'sign.blank': { id: 'sign.blank', label: 'Hanging sign', blurb: 'Plain board on a bracket', category: 'Light', mount: 'edge', role: 'fixture', emit: signBlank },
  'sign.mail': { id: 'sign.mail', label: 'Post sign', blurb: 'Envelope on a hanging board', category: 'Light', mount: 'edge', role: 'fixture', emit: signMail },
  'sign.cup': { id: 'sign.cup', label: 'Cup sign', blurb: 'Cup on a hanging board', category: 'Light', mount: 'edge', role: 'fixture', emit: signCup },
};

/**
 * The model a part is drawn with in a look: the village look has its own
 * models (./village) and falls back to the industrial one where it has none.
 * Rules always use the catalogue entry; budgets count the dearer look (partCost).
 */
export function partEmit(id: PartId, look: Look = 'industrial'): Emit {
  return (look === 'village' ? VILLAGE_EMITS[id] : undefined) ?? PARTS[id].emit;
}

/**
 * Emit a part in a look into a kit. A part the look has no model for is drawn
 * by its industrial model without the ink shell (PartBuilder.shellOff), so it
 * costs exactly its industrial triangles there too.
 */
export function emitPart(id: PartId, look: Look, k: Kit) {
  const own = look === 'village' && VILLAGE_EMITS[id] !== undefined;
  k.b.shellOff = look !== 'industrial' && !own;
  try { partEmit(id, look)(k); } finally { k.b.shellOff = false; }
}

/** A part's name and palette line as a look shows them (rule messages keep the catalogue's names). */
export const partLabel = (id: PartId, look: Look = 'industrial') => (look === 'village' ? VILLAGE_NAMES[id] : PARTS[id].label);
export const partBlurb = (id: PartId, look: Look = 'industrial') => (look === 'village' ? VILLAGE_BLURBS[id] : PARTS[id].blurb);

/** Build one part with library materials (its own builder, merged per material), in the library's look. */
export function buildPart(id: PartId, lib: StyleLibrary, b = new PartBuilder(lib.lod)): BuiltPart {
  return buildEmit(k => emitPart(id, lib.look, k), id, lib, b);
}

const counted = new Map<string, { triangles: number; drawCalls: number }>();
/**
 * Triangles and draw calls of one part at a tier, measured by building its real
 * geometry with stand-in materials (no textures, works in Node). Cached.
 */
export function partCost(id: PartId, lod: LodTier): { triangles: number; drawCalls: number } {
  const key = `${id}|${lod}`;
  let c = counted.get(key);
  if (!c) {
    const source = countingMaterials(lod), b = new PartBuilder(lod);
    PARTS[id].emit(makeKit(b, source));
    const built = b.build(id);
    // A part drawn the same in both looks pays for its ink in the village look,
    // so the budget (which counts triangles) takes whichever look has more. The
    // village models of the first 21 parts are held under their industrial
    // ones, so for them this is the industrial count. Draw calls stay the
    // catalogue model's: a building's are bounded by its kit materials.
    const village = lookPartCost(id, lod, 'village');
    c = { triangles: Math.max(built.triangles, village.triangles), drawCalls: built.drawCalls };
    built.group.traverse(o => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    source.dispose();
    counted.set(key, c);
  }
  return c;
}

/** Triangles and draw calls of a part's catalogue model alone (no ink), as the industrial look draws it. */
export function industrialPartCost(id: PartId, lod: LodTier): { triangles: number; drawCalls: number } {
  const source = countingMaterials(lod), b = new PartBuilder(lod);
  PARTS[id].emit(makeKit(b, source));
  const built = b.build(id);
  built.group.traverse(o => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
  source.dispose();
  return { triangles: built.triangles, drawCalls: built.drawCalls };
}

export const allPartCosts = () => PART_IDS.flatMap(id => LOD_TIERS.map(lod => ({ id, lod, ...partCost(id, lod) })));

/**
 * Triangles and draw calls of a part's model in a look, ink outline included,
 * counted like partCost. The village models are held to their industrial
 * part's cost (tests/unit/blueprint/village.test.ts), so the budget rules,
 * which count with partCost, hold for village buildings too.
 */
export function lookPartCost(id: PartId, lod: LodTier, look: Look): { triangles: number; drawCalls: number } {
  const source = countingMaterials(lod, look), b = new PartBuilder(lod);
  emitPart(id, look, makeKit(b, source));
  const built = b.build(id);
  built.group.traverse(o => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
  source.dispose();
  return { triangles: built.triangles, drawCalls: built.drawCalls };
}
