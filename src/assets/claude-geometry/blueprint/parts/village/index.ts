import type { Emit } from '../kit.ts';
import type { PartId } from '../catalogue.ts';
import { floorDeck, grateDeck, roofDeck, slopeRoof } from './decks.ts';
import { parapet, plantUnit, stair } from './structure.ts';
import { cornerColumn, guardRail, padQuarter, serviceLight, streetKerb, streetPaving, streetPipes, streetRoad } from './street.ts';
import { corrugatedWall, doorOpenWall, doorWall, louvreWall, solidWall, windowWall } from './walls.ts';
import { entryRamp, entrySteps } from '../home/entry.ts';
import { beamVillage } from '../home/frame.ts';
import { chair, shelf, sideboard, table } from '../home/furniture.ts';
import { flowerBed } from '../home/bed.ts';
import { bench, pot, tree } from '../home/garden.ts';
import { kerbCornerVillage, roadCorner, roadPlain } from '../home/joins.ts';
import { hipRoofVillage, valleyRoofVillage } from '../home/roofs.ts';
import { vergeLeftVillage, vergeRightVillage } from '../home/verges.ts';
import { barrel, crates } from '../home/storage.ts';
import { signBlankVillage, signCupVillage, signMailVillage, wallLampVillage } from '../home/fixtures.ts';

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
  // Round 8: parts drawn alike in both looks are listed with their one model,
  // so the village look gives them their ink; roof closures and the kerb
  // corner have their own, to meet the village panel and kerb.
  'street.road.plain': roadPlain,
  'street.road.corner': roadCorner,
  'street.kerb.corner': kerbCornerVillage,
  'step.entry': entrySteps,
  'ramp.entry': entryRamp,
  'roof.slope.hip': hipRoofVillage,
  'roof.slope.valley': valleyRoofVillage,
  'roof.verge.left': vergeLeftVillage,
  'roof.verge.right': vergeRightVillage,
  'structure.beam': beamVillage,
  'furniture.table': table,
  'furniture.chair': chair,
  'furniture.sideboard': sideboard,
  'furniture.shelf': shelf,
  'storage.crates': crates,
  'storage.barrel': barrel,
  'garden.bed': flowerBed,
  'garden.pot': pot,
  'garden.tree': tree,
  'furniture.bench': bench,
  'light.wall': wallLampVillage,
  'sign.blank': signBlankVillage,
  'sign.mail': signMailVillage,
  'sign.cup': signCupVillage,
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
  'street.road.plain': 'Lane with no centre line',
  'street.road.corner': 'Centre line turning',
  'street.kerb.corner': 'Kerb round a corner',
  'step.entry': 'Stone steps down to the ground',
  'ramp.entry': '1×2 cells, 0.6 m down',
  'roof.slope.hip': 'Outer roof corner',
  'roof.slope.valley': 'Inner roof corner',
  'roof.verge.left': 'Gable trim, left side',
  'roof.verge.right': 'Gable trim, right side',
  'structure.beam': 'Timber beam between posts',
  'furniture.table': 'Chairs tuck under it',
  'furniture.chair': 'Against a side, faces in',
  'furniture.sideboard': 'Low cupboard against a wall',
  'furniture.shelf': 'Tall open shelves',
  'storage.crates': 'Two stacked crates',
  'storage.barrel': 'Small barrel',
  'garden.bed': 'Raised bed filling a cell',
  'garden.pot': 'Pot against a side',
  'garden.tree': 'Open sky above, no walls',
  'furniture.bench': 'Ends reach over two edges',
  'light.wall': 'On a plaster wall, lit',
  'sign.blank': 'Plain board on a bracket',
  'sign.mail': 'Envelope on a board',
  'sign.cup': 'Cup on a board',
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
  'street.road.plain': 'Plain lane',
  'street.road.corner': 'Lane corner',
  'street.kerb.corner': 'Stone kerb corner',
  'step.entry': 'Entrance steps',
  'ramp.entry': 'Entrance ramp',
  'roof.slope.hip': 'Tiled hip',
  'roof.slope.valley': 'Tiled valley',
  'roof.verge.left': 'Verge board, left',
  'roof.verge.right': 'Verge board, right',
  'structure.beam': 'Porch beam',
  'furniture.table': 'Round table',
  'furniture.chair': 'Chair',
  'furniture.sideboard': 'Sideboard',
  'furniture.shelf': 'Shelf',
  'storage.crates': 'Crates',
  'storage.barrel': 'Barrel',
  'garden.bed': 'Flower bed',
  'garden.pot': 'Flower pot',
  'garden.tree': 'Round tree',
  'furniture.bench': 'Park bench',
  'light.wall': 'Wall lantern',
  'sign.blank': 'Hanging sign',
  'sign.mail': 'Post sign',
  'sign.cup': 'Tea sign',
};
