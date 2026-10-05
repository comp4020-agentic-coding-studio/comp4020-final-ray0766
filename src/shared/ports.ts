import { distance, normalize, SPAWN } from './world.ts';
import type { Vec3 } from './world.ts';
export const HUB_DOCK=normalize([0,1,-.72]);
export const BOARD_RADIUS=1.65;
// Public infrastructure at the harbour; a session's temporary return beacon elsewhere.
// Garden landing clearance already reserves SPAWN, so no existing object is displaced.
export const portPoint=(planetId:string):Vec3=>planetId==='hub'?HUB_DOCK:[...SPAWN];
export const canBoard=(planetId:string,position:Vec3)=>distance(position,portPoint(planetId))<=BOARD_RADIUS;
