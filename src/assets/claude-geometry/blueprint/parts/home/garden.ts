import { VILLAGE_PROP_BUILDERS } from '../../../props/village.ts';
import { kitPropMaterials } from '../kit.ts';
import type { Kit } from '../kit.ts';
import { SIDE_BACK } from './furniture.ts';

// Garden parts that are the village props' own models (src/props/village.ts),
// drawn by the props' builders through the kit's slots (kit.ts
// kitPropMaterials), so a blueprint and the quick-build palette show the same
// thing at every LOD. In the industrial look they keep the village shapes in
// the slots' industrial materials; the industrial props are other models. The
// flower bed is new and lives in bed.ts.

/** The flower pot's rim radius (props/village.ts flowers); nothing of it reaches further out. */
const POT_RIM = 0.2;

/** Flower pot against one side of its cell (edge-mounted): its rim's back on SIDE_BACK, like the furniture's backs. */
export function pot(k: Kit) {
  k.b.within({ position: [0, 0, SIDE_BACK - POT_RIM] }, () => VILLAGE_PROP_BUILDERS.flowers(kitPropMaterials(k), k.b));
}

/** Round tree in the middle of its cell. */
export function tree(k: Kit) {
  VILLAGE_PROP_BUILDERS.tree(kitPropMaterials(k), k.b);
}

/** Park bench in the middle of its cell, along its x axis, the sitter facing +Z; its ends reach 0.08 m past the cell's side edges. */
export function bench(k: Kit) {
  VILLAGE_PROP_BUILDERS.bench(kitPropMaterials(k), k.b);
}
