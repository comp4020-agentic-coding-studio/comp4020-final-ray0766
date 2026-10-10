import { QUICK_PARTS } from './quick-parts.ts';
import { PRIVATE_CAPACITY } from './world-capacity.ts';
import { distance, normalize, SPAWN, validPosition } from './world.ts';
import type { PlayerState, Vec3 } from './world.ts';
import type { BlueprintContents } from './blueprints.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { pathPlacementCheck, PATH_STRUCTURE_REACH } from './path-structure-placement.ts';
import type { PathPlacementCache } from './path-structure-placement.ts';
import { StructurePlacementCache, structurePlacementProblem, structurePlacementRadius } from './structure-placement.ts';
import type { HomeDoorState } from './home-door.ts';
import type { HomeDescriptor, HomeInfrastructureManifest } from './home.ts';

export const CATALOGUE = {
  cottage: { name: 'Cottage', icon: '⌂', radius: 1.05, height: 2.5, description: 'Panelled cabin · shared Sunseed components' },
  tree: { name: 'Tree', icon: '♧', radius: .40, height: 2.1, description: 'A patch of shade' },
  path: { name: 'Path', icon: '▱', radius: .42, height: 0, description: 'Brushed metal deck tile' },
  flowers: { name: 'Flowers', icon: '✿', radius: .28, height: .55, description: 'Something growing' },
  bench: { name: 'Bench', icon: '▰', radius: .65, height: .9, description: 'A place to pause' },
  lamp: { name: 'Lamp', icon: '♙', radius: .26, height: 2.1, description: 'A shielded service light' },
} as const;
export type BuildKind = keyof typeof CATALOGUE;
export type ObjectKind = BuildKind | 'structure';
export const MAX_OBJECTS = PRIVATE_CAPACITY.objects;
export interface PlacedObject { id: string; kind: ObjectKind; position: Vec3; rotation: number; version: number; blueprintHash?: string; radius?: number; height?: number; assetVersion?: 2 }
export const objectName = (o: Pick<PlacedObject, 'kind'>) => o.kind === 'structure' ? 'Custom structure' : CATALOGUE[o.kind].name;
export const objectRadius = (o: Pick<PlacedObject, 'kind' | 'radius' | 'assetVersion'>) => o.kind === 'structure' ? o.radius ?? 0 : o.assetVersion===2?(o.kind==='lamp'?.3694:QUICK_PARTS[o.kind]?.radius??CATALOGUE[o.kind].radius):CATALOGUE[o.kind].radius;
export const objectHeight = (o: Pick<PlacedObject, 'kind' | 'height' | 'assetVersion'>) => o.kind === 'structure' ? o.height ?? 0 : o.assetVersion===2?(o.kind==='lamp'?2.2:QUICK_PARTS[o.kind]?.height??CATALOGUE[o.kind].height):CATALOGUE[o.kind].height;
export interface PlanetSummary { id: string; name: string; kind: 'hub' | 'garden'; claimed: boolean; mine: boolean; revision: number; objectCount: number; center:Vec3; slot:number; radius?:number; environment?:string|null; publicTown?: { objects:number; structures:number; districts:number; version:number } }
export interface PlanetView extends PlanetSummary { objects: PlacedObject[]; blueprints?: BlueprintContents; home?: HomeDescriptor | null; homeDoor?: HomeDoorState; homeManifest?: HomeInfrastructureManifest }
export interface Universe { player: PlayerState; planets: PlanetSummary[]; ownedPlanetId: string | null; currentPlanet: PlanetView }
export function isBuildKind(value: unknown): value is BuildKind { return typeof value === 'string' && Object.hasOwn(CATALOGUE, value); }
export interface PlacementDetails { rotation:number; blueprintHash?:string; blueprints:BlueprintContents; field:HeightField; terrainSeating?:boolean; cache?:PathPlacementCache; structureCache?:StructurePlacementCache }
export function placementProblem(kind: ObjectKind, position: unknown, objects: PlacedObject[], ignoreId?: string, radius?: number, worldRadius=10, assetVersion:1|2=2, details?:PlacementDetails) {
  if (!validPosition(position)) return 'Choose a point on the planet.';
  const point=normalize(position);
  const size = objectRadius({kind, radius,assetVersion:assetVersion===2?2:undefined});
  if (distance(point, SPAWN, worldRadius) < size + 1.0) return 'Leave a little space around the landing spot.';
  const candidate:PlacedObject={id:ignoreId??'placement-preview',kind,position:point,rotation:details?.rotation??0,version:1,radius,blueprintHash:details?.blueprintHash,...(assetVersion===2?{assetVersion:2 as const}:{})};
  let check:ReturnType<typeof pathPlacementCheck>|undefined;
  const structureCache=details?.structureCache??new StructurePlacementCache();
  for (const item of objects) {
    if (item.id === ignoreId || (item.kind === 'path' && kind === 'path')) continue;
    if(details&&((kind==='path'&&item.kind==='structure')||(kind==='structure'&&item.kind==='path'))){
      const path=kind==='path'?candidate:item,structure=kind==='structure'?candidate:item;
      if(distance(point,item.position,worldRadius)>=objectRadius(structure)+PATH_STRUCTURE_REACH+.06)continue;
      const parts=details.blueprints[structure.blueprintHash??''];
      if(parts){
        if(check===undefined){
          const scene=objects.map(o=>o.id===ignoreId?candidate:o);
          if(!objects.some(o=>o.id===ignoreId))scene.push(candidate);
          check=pathPlacementCheck(details.field,scene,details.blueprints,objectRadius,details.terrainSeating,details.cache);
        }
        if(check){const problem=check(path,structure,parts);if(problem)return problem;continue;}
      }
    }
    if(kind==='structure'&&item.kind==='structure'&&details){
      const ownParts=details.blueprints[candidate.blueprintHash??''],otherParts=details.blueprints[item.blueprintHash??''];
      // Unresolved content retains the original circle rule. Resolved geometry
      // gets a query bound that also contains doorway and appearance extents.
      if(!ownParts?.length||!otherParts?.length){
        if(distance(point,item.position,worldRadius)>=size+objectRadius(item)+.06)continue;
      }else if(distance(point,item.position,worldRadius)>=structurePlacementRadius(candidate,ownParts)+structurePlacementRadius(item,otherParts)+.06)continue;
      const problem=structurePlacementProblem(candidate,item,{field:details.field,blueprints:details.blueprints,cache:structureCache});
      if(problem)return problem;
      continue;
    }
    if (distance(point, item.position, worldRadius) < size + objectRadius(item) + .06)
      return 'A little too close. Leave room between objects.';
  }
  return null;
}
