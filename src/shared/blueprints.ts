import type { Blueprint, PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { blueprintFootprint } from '../assets/claude-geometry/blueprint/model.ts';
import { fitStructureOnGround } from '../assets/claude-geometry/blueprint/placement.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { legacyHeightField } from '../assets/claude-geometry/core/ground.ts';
import { STOREY } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import type { Vec3 } from './world.ts';

export interface LibraryEntry { blueprint: Blueprint; hash: string; version: number }
export type BlueprintContents = Record<string, PartPlacement[]>;
export const MAX_BLUEPRINTS = 24;
export const MAX_STRUCTURES = 8;
export const BLUEPRINT_BODY_LIMIT = 65_536;
export function structureSize(parts: readonly PartPlacement[]) {
  return { radius: blueprintFootprint(parts).radius, height: Math.max(...parts.map(p => p.level * STOREY + 3.4)) };
}
const ground = legacyHeightField();
export const structureFit = (parts: readonly PartPlacement[], position: Vec3, rotation: number, field:HeightField=ground) =>
  fitStructureOnGround(field, { dir: position, yaw: rotation }, { parts: [...parts] });
