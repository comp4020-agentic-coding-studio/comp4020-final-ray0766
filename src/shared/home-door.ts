import type { Vec3 } from './world.ts';
import type { HomeRoom } from './home.ts';
import type { PartBox } from './physics/parts.ts';

/** Village sliding leaves, metres. Pinned to the source kit's LEAVES and
 * DOOR_OPENING; geometry contract tests check every source LOD against this. */
export const HOME_DOOR_SLIDING = { width:.145, thickness:.014, lap:.0075, tracks:[.117,.1295,.142], foot:.02, top:1.9, halfOpening:.4 } as const;
export const HOME_DOOR_BODY = { radius:.18, height:1.6 } as const;
export interface HomeDoorState { buildingId:string; partNumber:number; open:boolean; version:number }
export const homeIndoorDoorOrigin = (room:HomeRoom):Vec3 => [0,0,room.depth/2-.2];
export function homeDoorPanelX(side:number,index:number,open:boolean):number {
  const leaf=HOME_DOOR_SLIDING;
  return side*(open?.5-leaf.width/2:index*(leaf.width-leaf.lap)+leaf.width/2);
}
/** Every visible leaf has its own proxy, leaving the actual 0.71 m opening. */
export function homeDoorLeaves(open:boolean):PartBox[] {
  const leaf=HOME_DOOR_SLIDING;
  return [-1,1].flatMap(side=>leaf.tracks.map((z,index)=>({tag:'sliding leaf',
    center:[homeDoorPanelX(side,index,open),(leaf.foot+leaf.top)/2,z] as Vec3,
    half:[leaf.width/2,(leaf.top-leaf.foot)/2,leaf.thickness/2] as Vec3})));
}
/** Translation along one rail sweeps exactly an axis-aligned box. There is no
 * inward swing, no angular sampling gap and no invisible reservation behind it. */
export function homeDoorSweepBoxes():PartBox[] {
  const shut=homeDoorLeaves(false),open=homeDoorLeaves(true);
  return shut.map((box,index)=>({...box,tag:'sliding door travel',
    center:[(box.center[0]+open[index].center[0])/2,box.center[1],box.center[2]] as Vec3,
    half:[box.half[0]+Math.abs(open[index].center[0]-box.center[0])/2,box.half[1],box.half[2]] as Vec3}));
}
function capsuleMeets(box:PartBox,position:Vec3,up:Vec3,padding=0):boolean {
  const radius=HOME_DOOR_BODY.radius+padding;
  for(let i=0;i<=8;i++){
    const h=HOME_DOOR_BODY.radius+(HOME_DOOR_BODY.height-2*HOME_DOOR_BODY.radius)*i/8;
    const d=position.map((v,axis)=>Math.max(0,Math.abs(v+up[axis]*h-box.center[axis])-box.half[axis]));
    if(Math.hypot(...d)<radius)return true;
  }
  return false;
}
export function homeDoorSweepContains(position:Vec3,up:Vec3=[0,1,0]):boolean {
  return homeDoorSweepBoxes().some(box=>capsuleMeets(box,position,up,.003));
}
export function homeIndoorDoorAllows(position:Vec3,room:HomeRoom,open:boolean):boolean {
  const origin=homeIndoorDoorOrigin(room),local=position.map((n,i)=>n-origin[i]) as Vec3;
  return !homeDoorLeaves(open).some(box=>capsuleMeets(box,local,[0,1,0]));
}
