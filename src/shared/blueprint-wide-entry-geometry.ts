import type { Kit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { wideEntryBoxes } from './wide-entry.ts';

/** Square stone risers use the same village material as the existing stairs.
 * One full-width tread at each height leaves no centre seam or hidden curb.
 * The solid stone and its physical support agree at every LOD. */
export function wideEntrySteps(k: Kit) {
  for (const tread of wideEntryBoxes()) k.b.box(k.m('concrete'),
    tread.half.map(value => value * 2) as [number, number, number],
    { position: tread.center }, 0);
}
