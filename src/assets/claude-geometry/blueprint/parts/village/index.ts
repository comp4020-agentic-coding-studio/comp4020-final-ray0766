import type { Emit } from '../kit.ts';
import type { PartId } from '../catalogue.ts';
import { floorDeck, grateDeck, roofDeck, slopeRoof } from './decks.ts';
import { parapet, plantUnit, stair } from './structure.ts';
import { cornerColumn, guardRail, padQuarter, serviceLight, streetKerb, streetPaving, streetPipes, streetRoad } from './street.ts';
import { corrugatedWall, doorOpenWall, doorWall, louvreWall, solidWall, windowWall } from './walls.ts';

// The village look's models for blueprint parts (docs/VILLAGE.md). Same part
// IDs, mounts, roles, anchors and light fittings as the industrial set; only
// the models differ. Every part has one; partEmit would fall back to the
// industrial model for an ID added without one.

export const VILLAGE_EMITS: Partial<Record<PartId, Emit>> = {
  'floor.deck': floorDeck,
  'floor.grate': grateDeck,
  'wall.solid': solidWall,
  'wall.louvre': louvreWall,
  'wall.corrugated': corrugatedWall,
  'stair.straight': stair,
  'roof.deck': roofDeck,
  'roof.parapet': parapet,
  'roof.plant': plantUnit,
  'wall.window': windowWall,
  'wall.door': doorWall,
  'wall.door.open': doorOpenWall,
  'structure.column': cornerColumn,
  'rail.guard': guardRail,
  'roof.slope': slopeRoof,
  'street.paving': streetPaving,
  'street.road': streetRoad,
  'street.kerb': streetKerb,
  'street.pipes': streetPipes,
  'service.light': serviceLight,
  'pad.quarter': padQuarter,
};

/** One line for the palette tile in the village look. */
export const VILLAGE_BLURBS: Record<PartId, string> = {
  'floor.deck': 'Boards on a stone slab',
  'floor.grate': 'Slats with gaps, timber frame',
  'wall.solid': 'Plaster, timber posts',
  'wall.door': 'Panelled door, lantern',
  'wall.window': 'Sash, shutters, flower box',
  'wall.louvre': 'Timber vent, little hood',
  'wall.corrugated': 'Boards and battens on stone',
  'structure.column': 'Timber post at a vertex',
  'stair.straight': '1×2 cells, one storey',
  'rail.guard': 'Balcony and roof edge',
  'roof.deck': 'Clay tiles, pendant below',
  'roof.parapet': 'Roof edge with coping',
  'roof.slope': 'Clay tiles, 35° pitch',
  'roof.plant': 'Air unit with a round fan',
  'wall.door.open': 'Door held open inward',
  'street.paving': 'Flagstones, running bond',
  'street.road': 'Packed lane, centre line',
  'street.kerb': 'Stone kerb, drain',
  'street.pipes': 'Clipped hedge on a curb',
  'service.light': '3.4 m post, hanging lantern',
  'pad.quarter': 'Quarter of a 2×2 pad',
};

/** What each part is in the village look, for palettes and docs; the IDs and their uses stay the same. */
export const VILLAGE_NAMES: Record<PartId, string> = {
  'floor.deck': 'Plank floor',
  'floor.grate': 'Open boardwalk',
  'wall.solid': 'Plaster wall',
  'wall.louvre': 'Louvred vent',
  'wall.corrugated': 'Board shed wall',
  'stair.straight': 'Cottage stair',
  'roof.deck': 'Roof terrace',
  'roof.parapet': 'Plaster parapet',
  'roof.plant': 'Rooftop air unit',
  'wall.window': 'Shuttered window',
  'wall.door': 'Cottage door',
  'wall.door.open': 'Cottage door, open',
  'structure.column': 'Corner post',
  'rail.guard': 'Picket fence',
  'roof.slope': 'Tiled roof',
  'street.paving': 'Flagstone footway',
  'street.road': 'Lane',
  'street.kerb': 'Stone kerb',
  'street.pipes': 'Low hedge',
  'service.light': 'Lantern post',
  'pad.quarter': 'Stone pad quarter',
};
