import {flightBounds,wrapAngle} from '../shared/flight.ts';
import type {FlightState,FlightInput,SpaceBody} from '../shared/flight.ts';
import {bodyRadius,landingRadius} from '../shared/world-size.ts';
import type {Vec3} from '../shared/world.ts';
import {planFlightPath} from './flight-route.ts';
export const cruiseHeight=(bodies:SpaceBody[])=>Math.max(0,...bodies.map(b=>b.center[1]+bodyRadius(b)+(b.environment?1.75:0)))+20;
export function cruiseReady(f:FlightState,bodies:SpaceBody[]){return Math.abs(f.position[1]-cruiseHeight(bodies))<1.5;}
export function cruiseRoute(f:FlightState,bodies:SpaceBody[]){
 const bounds=flightBounds(bodies),y=cruiseHeight(bodies),dy=y-bounds.center[1];
 const radius=Math.sqrt(Math.max(0,(bounds.radius-10)**2-dy*dy));
 const candidates:Vec3[]=[];
 // A vertical goal is unreachable with bounded pitch. Give each ascent/descent
 // enough horizontal run, then choose a real collision-safe route inside bounds.
 const run=Math.max(12,Math.abs(y-f.position[1])/Math.tan(1.0));
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,dx=f.position[0]+Math.cos(angle)*run-bounds.center[0],dz=f.position[2]+Math.sin(angle)*run-bounds.center[2],scale=Math.min(1,radius/Math.max(.001,Math.hypot(dx,dz)));
  candidates.push([bounds.center[0]+dx*scale,y,bounds.center[2]+dz*scale]);
 }
 for(const goal of candidates.sort((a,b)=>Math.hypot(a[0]-f.position[0],a[2]-f.position[2])-Math.hypot(b[0]-f.position[0],b[2]-f.position[2]))){const path=planFlightPath(f.position,goal,bodies);if(path.length)return path;}
 return [];
}
export function canApproach(f:FlightState,b:SpaceBody){return Math.hypot(f.position[0]-b.center[0],f.position[2]-b.center[2])<=landingRadius(b)+12;}
/** View-relative axes are latched for a held gesture. Looking alone never steers.
 * Releasing brakes along the previous vector, avoiding a sideways velocity jump. */
export class PlanarDrive {
 private basis:number|null=null;private direction:[number,number]=[0,-1];
 reset(){this.basis=null;}
 input(f:FlightState,axes:{x:number;z:number;brake:boolean},viewYaw:number):FlightInput{
  const active=!!(axes.x||axes.z)&&!axes.brake;
  if(active){this.basis??=viewYaw;const yaw=this.basis;this.direction=[Math.sin(yaw)*axes.z+Math.cos(yaw)*axes.x,-Math.cos(yaw)*axes.z+Math.sin(yaw)*axes.x];}
  const heading=this.basis??f.yaw;if(!active)this.basis=null;
  return {thrust:active,brake:!active,turn:Math.max(-1,Math.min(1,wrapAngle(heading-f.yaw)*3)),pitch:Math.max(-1,Math.min(1,-f.pitch*3)),planar:this.direction};
 }
}
