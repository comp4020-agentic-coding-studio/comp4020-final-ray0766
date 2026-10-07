import type { Vec3 } from './world.ts';

export const HOME_SAMPLE_RADIUS = 21.6;
export interface HomeRoom { width: number; depth: number; height: number }
/** 60.2 m²: three times the original floor area; people and furniture keep their metre scale. */
export const HOME_ROOM: Readonly<HomeRoom> = { width: 8.6, depth: 7, height: 2.6 };
export const homeEntry = (room: HomeRoom = HOME_ROOM): Vec3 => [0, 0, room.depth / 2 - .9];
export const homeExit = (room: HomeRoom = HOME_ROOM): Vec3 => [0, 0, room.depth / 2 - .2];
export const HOME_ENTRY = homeEntry();
export const HOME_EXIT = homeExit();
export const homeNearDoor = (position: Vec3, room: HomeRoom = HOME_ROOM) => Math.abs(position[0]) < .7 && position[2] >= homeExit(room)[2] - .9;
export const HOME_BODY_RADIUS = .18;
export const HOME_MOVE_SPEED = 4;
export const HOME_MAX_ITEMS = 12;
export const HOME_MATERIALS = ['warm', 'sage', 'blue'] as const;
export const HOME_ITEM_KINDS = ['table', 'chair', 'shelf', 'plant'] as const;
export type HomeMaterial = typeof HOME_MATERIALS[number];
export type HomeItemKind = typeof HOME_ITEM_KINDS[number];
export interface HomeItem { id: string; kind: HomeItemKind; position: Vec3; yaw: number }
export interface HomeInterior { version: number; room: HomeRoom; material: HomeMaterial; items: HomeItem[]; doorOpen: boolean; doorVersion: number }
/** Read-only compatibility projection. Persisted furniture, labels and revision stay unchanged. */
export function normalizeHomeInterior(value: HomeInterior): HomeInterior {
  const legacy = value.room.width === 5 && value.room.depth === 4;
  return { ...value, room: legacy ? { ...HOME_ROOM } : value.room, doorOpen: typeof value.doorOpen === 'boolean' ? value.doorOpen : true, doorVersion: Number.isSafeInteger(value.doorVersion) ? value.doorVersion : 0 };
}
export interface HomeDescriptor {
  planetId: string; buildingId: string; interiorId: string;
  door: { position: Vec3; yaw: number; frame?: { position: Vec3; quaternion: [number, number, number, number] } };
  interior: HomeInterior; canEdit: boolean; buildingVersion: number; variant: 'base' | 'terrace' | 'roof' | 'extended' | 'custom'; canUndo: boolean;
}
export interface HomeInfrastructureManifest {
  generator: 'home-sample' | 'home-neighbourhood'; version: number; seed: number; radius: number;
  environment: string; catalogueVersion: string; homeBuildingId: string;
  fallback?: boolean; fallbackReason?: string;
  routes: { id: string; width: number; points: Vec3[] }[];
  objects: { id: string; kind: string; blueprintHash?: string; position: Vec3; rotation: number; version?: number; assetVersion?: 2; radius?: number; height?: number }[];
}
export type HomeLocation =
  | { kind: 'exterior'; planetId: string; visitEpoch: number }
  | { kind: 'interior'; planetId: string; buildingId: string; interiorId: string; position: Vec3; yaw: number; sequence: number; visitEpoch: number };

/** Logical furniture footprints shared by the server and local walking preview. */
export function homeItemBounds(item: HomeItem) {
  const size: Record<HomeItemKind, [number, number]> = { table: [.7, .7], chair: [.48, .48], shelf: [.95, .36], plant: [.5, .5] };
  const [w, d] = size[item.kind], c = Math.abs(Math.cos(item.yaw)), s = Math.abs(Math.sin(item.yaw));
  return { minX: item.position[0] - (w*c+d*s)/2, maxX: item.position[0] + (w*c+d*s)/2,
    minZ: item.position[2] - (w*s+d*c)/2, maxZ: item.position[2] + (w*s+d*c)/2 };
}
export function homePositionAllowed(position: Vec3, items: readonly HomeItem[], padding = HOME_BODY_RADIUS, room: HomeRoom = HOME_ROOM): boolean {
  if (!position.every(Number.isFinite) || Math.abs(position[1]) > .001 || Math.abs(position[0]) > room.width/2-padding || Math.abs(position[2]) > room.depth/2-padding) return false;
  return items.every(item => { const b=homeItemBounds(item); return position[0] < b.minX-padding || position[0] > b.maxX+padding || position[2] < b.minZ-padding || position[2] > b.maxZ+padding; });
}
export function homePathAllowed(from: Vec3, to: Vec3, items: readonly HomeItem[], room: HomeRoom = HOME_ROOM): boolean {
  const steps=Math.max(1,Math.ceil(Math.hypot(to[0]-from[0],to[2]-from[2])/.06));
  for(let n=0;n<=steps;n++) if(!homePositionAllowed(from.map((v,i)=>v+(to[i]-v)*n/steps) as Vec3,items,HOME_BODY_RADIUS,room)) return false;
  return true;
}
export function defaultHomeInterior(): HomeInterior {
  return {version:1,room:{...HOME_ROOM},doorOpen:true,doorVersion:0,material:'warm',items:[
    {id:'table',kind:'table',position:[-.9,0,-.45],yaw:0},
    {id:'chair',kind:'chair',position:[-.9,0,.35],yaw:Math.PI},
    {id:'shelf',kind:'shelf',position:[1.65,0,-1.55],yaw:0},
    {id:'plant',kind:'plant',position:[-1.9,0,-1.4],yaw:0},
  ]};
}
