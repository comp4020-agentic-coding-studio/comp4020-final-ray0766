import { FLOWER_POT_BACK, ROUND8_GARDEN, ROUND8_POT_RIM, VILLAGE_PROP_BUILDERS } from '../../../props/village.ts';
import { kitPropMaterials } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { SIDE_BACK } from './furniture.ts';

// Garden parts drawn by the village props' builders through the kit's slots
// (kit.ts kitPropMaterials). In the village look they are the village props'
// own models (src/props/village.ts), so a blueprint and the quick-build
// palette show the same thing at every LOD. The industrial and warm looks keep
// the round 8 tree, pot and bench (ROUND8_GARDEN, frozen in props/village.ts)
// in the slots' industrial materials, so they draw exactly what they drew
// before the props were reshaped. The flower bed is new and lives in bed.ts.

/**
 * Whether a kit draws in the village look. A Kit does not carry its look, so
 * this reads it off the kit's own materials: the village look resolves every
 * slot to a 'village:' material (kit.ts villageKey), the industrial and warm
 * looks never do. tests/unit/village/props-reuse.test.ts holds each look to
 * its own model, so if either side changes it shows there. Once VILLAGE_EMITS
 * lists the village twins below, this check can go (docs/restyle/props-ships.md).
 */
const villageKit = (k: Kit) => k.m('post').name.includes('village:');

/** The village look's flower pot: the prop, its back (the shrub's rim, FLOWER_POT_BACK) on SIDE_BACK. */
export function potVillage(k: Kit) {
  k.b.within({ position: [0, 0, SIDE_BACK - FLOWER_POT_BACK] }, () => VILLAGE_PROP_BUILDERS.flowers(kitPropMaterials(k), k.b));
}

/** The village look's tree: the garden pine prop, in the middle of its cell. */
export function treeVillage(k: Kit) {
  VILLAGE_PROP_BUILDERS.tree(kitPropMaterials(k), k.b);
}

/** The village look's bench: the plain wooden bench prop, in the middle of its cell along its x axis. */
export function benchVillage(k: Kit) {
  VILLAGE_PROP_BUILDERS.bench(kitPropMaterials(k), k.b);
}

/** Flower pot against one side of its cell (edge-mounted): its back on SIDE_BACK, like the furniture's backs. */
export function pot(k: Kit) {
  if (villageKit(k)) { potVillage(k); return; }
  k.b.within({ position: [0, 0, SIDE_BACK - ROUND8_POT_RIM] }, () => ROUND8_GARDEN.flowers(kitPropMaterials(k), k.b));
}

/** Tree in the middle of its cell. */
export function tree(k: Kit) {
  if (villageKit(k)) { treeVillage(k); return; }
  ROUND8_GARDEN.tree(kitPropMaterials(k), k.b);
}

/** Bench in the middle of its cell, along its x axis; its ends reach 0.08 m past the cell's side edges. */
export function bench(k: Kit) {
  if (villageKit(k)) { benchVillage(k); return; }
  ROUND8_GARDEN.bench(kitPropMaterials(k), k.b);
}
