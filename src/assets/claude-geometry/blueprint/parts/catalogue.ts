import { PartBuilder } from '../../style/geometry.ts';
import type { BuiltPart } from '../../style/geometry.ts';
import { LOD_TIERS } from '../../style/lod.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary } from '../../style/materials.ts';
import { floorDeck, grateDeck, roofDeck, slopeRoof } from './decks.ts';
import { buildEmit, countingMaterials, makeKit } from './kit.ts';
import type { Emit } from './kit.ts';
import { cornerColumn, guardRail, parapet, plantUnit, stair } from './structure.ts';
import { corrugatedWall, doorOpenWall, doorWall, louvreWall, solidWall, windowWall } from './walls.ts';
import { padQuarter, serviceLight, streetKerb, streetPaving, streetPipes, streetRoad } from './street.ts';

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
 * - slope: a roof panel that covers its cell and keeps its eave side clear.
 * - equipment: stands on a deck inside one cell.
 */
export type Role = 'deck' | 'wall' | 'guard' | 'column' | 'stair' | 'slope' | 'equipment';

export const PART_IDS = [
  'floor.deck', 'floor.grate', 'wall.solid', 'wall.door', 'wall.window', 'wall.louvre', 'wall.corrugated',
  'structure.column', 'stair.straight', 'rail.guard', 'roof.deck', 'roof.parapet', 'roof.slope', 'roof.plant',
  'wall.door.open', 'street.paving', 'street.road', 'street.kerb', 'street.pipes', 'service.light', 'pad.quarter',
] as const;
export type PartId = typeof PART_IDS[number];
export const isPartId = (v: unknown): v is PartId => typeof v === 'string' && (PART_IDS as readonly string[]).includes(v);

export interface PartDef {
  id: PartId;
  label: string;
  /** One line for the palette tile. */
  blurb: string;
  category: 'Floor' | 'Wall' | 'Structure' | 'Roof' | 'Street';
  mount: Mount;
  role: Role;
  /** Decks that count as a floor for walls, columns, stairs and equipment standing on them. */
  floor?: boolean;
  /** Roofs need walls or columns below even at level 0. */
  roof?: boolean;
  /** A wall people walk through; kept off a stair's sides and off its landing edge, and the only part allowed at its top exit. */
  door?: boolean;
  emit: Emit;
}

export const PARTS: Record<PartId, PartDef> = {
  'floor.deck': { id: 'floor.deck', label: 'Floor deck', blurb: 'Concrete slab, tread plate', category: 'Floor', mount: 'cell', role: 'deck', floor: true, emit: floorDeck },
  'floor.grate': { id: 'floor.grate', label: 'Grated catwalk', blurb: 'Open grating on channels', category: 'Floor', mount: 'cell', role: 'deck', floor: true, emit: grateDeck },
  'wall.solid': { id: 'wall.solid', label: 'Solid wall', blurb: 'Clad panel, conduit', category: 'Wall', mount: 'edge', role: 'wall', emit: solidWall },
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
  'service.light': { id: 'service.light', label: 'Street light', blurb: '3.4 m column, warm head', category: 'Street', mount: 'cell', role: 'equipment', emit: serviceLight },
  'pad.quarter': { id: 'pad.quarter', label: 'Pad quarter', blurb: 'Quarter of a 2×2 pad', category: 'Street', mount: 'cell', role: 'deck', floor: true, emit: padQuarter },
};

/** Build one part with library materials (its own builder, merged per material). */
export function buildPart(id: PartId, lib: StyleLibrary, b = new PartBuilder(lib.lod)): BuiltPart {
  return buildEmit(PARTS[id].emit, id, lib, b);
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
    c = { triangles: built.triangles, drawCalls: built.drawCalls };
    built.group.traverse(o => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    source.dispose();
    counted.set(key, c);
  }
  return c;
}

export const allPartCosts = () => PART_IDS.flatMap(id => LOD_TIERS.map(lod => ({ id, lod, ...partCost(id, lod) })));
