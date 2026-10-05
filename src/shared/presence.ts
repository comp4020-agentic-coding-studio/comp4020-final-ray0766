import type { Character,Vec3 } from './world.ts';
export const PRESENCE_TTL=6000,PRESENCE_INTERVAL=1000,MAX_PRESENCE=256,MAX_NEIGHBOURS=16;
export interface Visitor {id:string;position:Vec3;facing:Vec3;character:Character}
export interface PresenceSnapshot {planetId:string;selfId:string;visitors:Visitor[];nearbyCount:number;ttlMs:number}
