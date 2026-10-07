import type { Vec3 } from './world.ts';
import type { HomeRoom } from './home.ts';
import type { PartBox } from './physics/parts.ts';

/** The single metre-scale leaf contract used by physics and both renderers. */
export const HOME_DOOR_LEAF = { width: .8, height: 1.82, thickness: .055, hinge: [-.4, .025, .16] as Vec3, openAngle: Math.PI / 2 } as const;
export const HOME_DOOR_BODY = { radius: .18, height: 1.6 } as const;
export interface HomeDoorState { buildingId: string; partNumber: number; open: boolean; version: number }
export const homeIndoorDoorOrigin = (room: HomeRoom): Vec3 => [0, 0, room.depth / 2 - .2];
export function homeDoorLeaf(open: boolean): PartBox {
  const leaf=HOME_DOOR_LEAF, [x,y,z]=leaf.hinge;
  return { tag:'home door leaf', center:open?[x,y+leaf.height/2,z-leaf.width/2]:[x+leaf.width/2,y+leaf.height/2,z],
    half:open?[leaf.thickness/2,leaf.height/2,leaf.width/2]:[leaf.width/2,leaf.height/2,leaf.thickness/2] };
}
/** Capsule against a leaf at any angle. Extra sweep padding covers the gaps
 * between the 5° samples, so an accepted transition cannot clip a saved body. */
export function homeDoorLeafContains(position:Vec3,angle:number,padding=0,up:Vec3=[0,1,0]):boolean {
  const leaf=HOME_DOOR_LEAF,[hx,hy,hz]=leaf.hinge,c=Math.cos(angle),s=Math.sin(angle),r=HOME_DOOR_BODY.radius+padding;
  for(let i=0;i<=8;i++){
    const h=HOME_DOOR_BODY.radius+(HOME_DOOR_BODY.height-2*HOME_DOOR_BODY.radius)*i/8;
    const x=position[0]+up[0]*h-hx,y=position[1]+up[1]*h-hy,z=position[2]+up[2]*h-hz;
    const lx=c*x-s*z,lz=s*x+c*z;
    const dx=Math.max(0,-lx,lx-leaf.width),dz=Math.max(0,Math.abs(lz)-leaf.thickness/2),dy=Math.max(0,-y,y-leaf.height);
    if(Math.hypot(dx,dy,dz)<r)return true;
  }
  return false;
}
export function homeDoorSweepContains(position:Vec3,up:Vec3=[0,1,0]):boolean {
  for(let i=0;i<=18;i++)if(homeDoorLeafContains(position,HOME_DOOR_LEAF.openAngle*i/18,.025,up))return true;
  return false;
}
export function homeIndoorDoorAllows(position:Vec3,room:HomeRoom,open:boolean):boolean {
  const origin=homeIndoorDoorOrigin(room);
  return !homeDoorLeafContains(position.map((n,i)=>n-origin[i]) as Vec3,open?HOME_DOOR_LEAF.openAngle:0);
}
