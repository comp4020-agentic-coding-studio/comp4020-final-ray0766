import type { Blueprint, PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { blueprintFootprint, partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import { structureGroundFootprint } from './blueprint-ground-footprint.ts';
import { seatedFit } from './ground-fit-cache.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { legacyHeightField } from '../assets/claude-geometry/core/ground.ts';
import { STOREY } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import type { Vec3 } from './world.ts';
import { PART_INFO } from '../assets/claude-geometry/blueprint/parts/info.ts';
import { SLOPE_BOUNDS } from './physics/parts.ts';
import { PRIVATE_CAPACITY } from './world-capacity.ts';

export interface LibraryEntry { blueprint: Blueprint; hash: string; version: number }
export type BlueprintContents = Record<string, PartPlacement[]>;
export const MAX_BLUEPRINTS = 24;
export const MAX_STRUCTURES = PRIVATE_CAPACITY.structures;
export const BLUEPRINT_BODY_LIMIT = 65_536;
export function structureSize(parts: readonly PartPlacement[]) {
  let radius=blueprintFootprint(parts).radius;
  const pivot=pivotOf(parts);
  // R7 roof tiles extend beyond the original cell/gutter footprint. Include
  // their corners at every quarter turn without changing seating samples or
  // rewriting the immutable blueprint and its saved placement.
  for(const part of parts){
    const bounds=PART_INFO[part.part].envelope?.village;
    if(part.part!=='roof.slope'&&!bounds)continue;
    const t=partTransform(part,pivot),c=Math.cos(t.yaw),s=Math.sin(t.yaw);
    for(const x of bounds?[bounds.min[0],bounds.max[0]]:[-SLOPE_BOUNDS.halfWidth,SLOPE_BOUNDS.halfWidth])for(const z of bounds?[bounds.min[2],bounds.max[2]]:[SLOPE_BOUNDS.back,SLOPE_BOUNDS.front])
      radius=Math.max(radius,Math.hypot(t.position[0]+x*c+z*s,t.position[2]-x*s+z*c)+.02);
  }
  return { radius, height: Math.max(...parts.map(p => p.level * STOREY + 3.4)) };
}
const ground = legacyHeightField();
export const structureFit = (parts: readonly PartPlacement[], position: Vec3, rotation: number, field:HeightField=ground) =>
  seatedFit(field, { dir: position, yaw: rotation }, structureGroundFootprint(parts));
