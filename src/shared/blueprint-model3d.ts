import { buildBlueprintModel as build } from '../assets/claude-geometry/blueprint/model3d.ts';
import { pivotOf, toVendorParts } from './blueprint-model.ts';
import type { PartPlacement } from './blueprint-model.ts';
export * from '../assets/claude-geometry/blueprint/model3d.ts';
export function buildBlueprintModel(parts: readonly PartPlacement[] | { parts: readonly PartPlacement[] }, ...args: [Parameters<typeof build>[1], Parameters<typeof build>[2]?, Parameters<typeof build>[3]?]) {
  const list = 'parts' in parts ? parts.parts : parts;
  return build(toVendorParts(list), args[0], args[1], { ...args[2], pivot: args[2]?.pivot ?? pivotOf(list) });
}
