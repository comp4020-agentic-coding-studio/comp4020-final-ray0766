import { distance, normalize, SPAWN, validPosition } from './world.ts';
import type { PlayerState, Vec3 } from './world.ts';

export const CATALOGUE = {
  cottage: { name: 'Cottage', icon: '⌂', radius: 1.05, height: 2.5, description: 'A warm little roof' },
  tree: { name: 'Tree', icon: '♧', radius: .40, height: 2.1, description: 'A patch of shade' },
  path: { name: 'Path', icon: '▱', radius: .42, height: 0, description: 'A stepping stone' },
  flowers: { name: 'Flowers', icon: '✿', radius: .28, height: .55, description: 'Something growing' },
  bench: { name: 'Bench', icon: '▰', radius: .65, height: .9, description: 'A place to pause' },
  lamp: { name: 'Lamp', icon: '♙', radius: .26, height: 2.1, description: 'A welcoming light' },
} as const;
export type BuildKind = keyof typeof CATALOGUE;
export const MAX_OBJECTS = 64;
export interface PlacedObject { id: string; kind: BuildKind; position: Vec3; rotation: number; version: number }
export interface PlanetSummary { id: string; name: string; kind: 'hub' | 'garden'; claimed: boolean; mine: boolean; revision: number; objectCount: number; center:Vec3; slot:number }
export interface PlanetView extends PlanetSummary { objects: PlacedObject[] }
export interface Universe { player: PlayerState; planets: PlanetSummary[]; ownedPlanetId: string | null; currentPlanet: PlanetView }
export function isBuildKind(value: unknown): value is BuildKind { return typeof value === 'string' && Object.hasOwn(CATALOGUE, value); }
export function placementProblem(kind: BuildKind, position: unknown, objects: PlacedObject[], ignoreId?: string) {
  if (!validPosition(position)) return 'Choose a point on the planet.';
  const point=normalize(position);
  if (distance(point, SPAWN) < CATALOGUE[kind].radius + 1.0) return 'Leave a little space around the landing spot.';
  for (const item of objects) {
    if (item.id === ignoreId || (item.kind === 'path' && kind === 'path')) continue;
    if (distance(point, item.position) < CATALOGUE[kind].radius + CATALOGUE[item.kind].radius + .06)
      return 'A little too close. Leave room between objects.';
  }
  return null;
}
