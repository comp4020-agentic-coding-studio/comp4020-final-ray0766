import { bodyRadius } from './world-size.ts';
import { RADIUS } from './world.ts';
import type { Vec3 } from './world.ts';
export const MAX_FLIGHT_SPEED=36, FLIGHT_ACCEL=14, FLIGHT_BRAKE=52, TURN_RATE=1.35;
export const SAFE_RADIUS=RADIUS+3, LAND_RADIUS=RADIUS+10, LAND_SPEED=6, SPACE_LIMIT=5000, MAX_PLANETS=256;
export interface FlightState { mode:'ground'|'space'; journey:number; position:Vec3; yaw:number; pitch:number; speed:number; sequence:number; targetId:string|null }
export interface SpaceBody { id:string; center:Vec3; radius?:number; environment?:string|null }
export interface FlightInput { thrust:boolean; brake:boolean; turn:number; pitch:number; planar?:[number,number] }
export const groundFlight=():FlightState=>({mode:'ground',journey:0,position:[0,0,0],yaw:0,pitch:0,speed:0,sequence:0,targetId:null});
export const length=(v:Vec3)=>Math.hypot(...v);
export const subtract=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const spaceDistance=(a:Vec3,b:Vec3)=>length(subtract(a,b));
export const wrapAngle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export const forward=(yaw:number,pitch:number):Vec3=>[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
export function bearing(from:Vec3,to:Vec3){const d=subtract(to,from);return{yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
const coordinates:Vec3[]=[[0,0,0]];
export function planetCenter(slot:number):Vec3 {
  if(!coordinates[slot]){
    let x=0,z=0,index=0,run=1,dir=0;const directions=[[0,-1],[1,0],[0,1],[-1,0]];
    while(index<slot){for(let twice=0;twice<2;twice++){const [dx,dz]=directions[dir++%4];for(let n=0;n<run;n++){x+=dx;z+=dz;index++;coordinates[index]=[x*90,Math.sin(index*1.9)*14,z*90];}}run++;}
  }
  return [...coordinates[slot]];
}
export function firstCollision(a:Vec3,b:Vec3,bodies:SpaceBody[],radius=SAFE_RADIUS){
  const d=subtract(b,a),aa=d.reduce((s,v)=>s+v*v,0);if(aa<1e-12)return null;
  let earliest=Infinity;
  for(const body of bodies){
    const collisionRadius=bodyRadius(body)+(radius-RADIUS)+(body.environment?1.75:0);
    const f=subtract(a,body.center),bb=2*f.reduce((s,v,i)=>s+v*d[i],0),cc=f.reduce((s,v)=>s+v*v,0)-collisionRadius*collisionRadius;
    // Contact must allow an outward departure, including rounding at the hull.
    if(cc<=1e-6&&bb>=0)continue;
    const disc=bb*bb-4*aa*cc;if(disc<0)continue;
    const t=(-bb-Math.sqrt(disc))/(2*aa);
    if(t>=0&&t<=1)earliest=Math.min(earliest,t);
    else if(cc<-.01&&spaceDistance(b,body.center)<spaceDistance(a,body.center))earliest=0;
  }
  return Number.isFinite(earliest)?earliest:null;
}
// 36²/(2×52) braking + 36/1.35 turning + 20 m approach clearance ≈ 59.1 m.
// A convex envelope includes every real hull and every straight inter-world route.
export const FLIGHT_BOUNDARY_MARGIN=60, FLIGHT_BOUNDARY_WARNING=36;
export interface FlightBounds { center:Vec3; radius:number }
export function flightBounds(bodies:SpaceBody[]):FlightBounds {
  if(!bodies.length)return {center:[0,0,0],radius:SPACE_LIMIT};
  const center=[0,1,2].map(i=>(Math.min(...bodies.map(b=>b.center[i]))+Math.max(...bodies.map(b=>b.center[i])))/2) as Vec3;
  const radius=Math.max(...bodies.map(b=>spaceDistance(center,b.center)+bodyRadius(b)+(b.environment?1.75:0)))+FLIGHT_BOUNDARY_MARGIN;
  return {center,radius};
}
/** Outside legacy saves may stay or move inward, never extend their own exception.
 * The sphere is convex, so admitted endpoints also admit the intervening segment. */
export function withinFlightBoundary(from:Vec3,to:Vec3,bounds:FlightBounds){
  const before=spaceDistance(from,bounds.center),after=spaceDistance(to,bounds.center);
  return after<=Math.max(bounds.radius,before);
}
export function flightBoundaryStatus(position:Vec3,bounds:FlightBounds){
  const remaining=bounds.radius-spaceDistance(position,bounds.center);
  return {remaining,mode:remaining<0?'return':remaining<FLIGHT_BOUNDARY_WARNING?'edge':'inside'} as const;
}
export function flightStep(state:FlightState,input:FlightInput,delta:number,bodies:SpaceBody[]):FlightState {
  const dt=Math.max(0,Math.min(delta,.05)),next={...state,position:[...state.position] as Vec3};
  next.yaw=wrapAngle(state.yaw+Math.max(-1,Math.min(1,input.turn))*TURN_RATE*dt);
  next.pitch=Math.max(-1.3,Math.min(1.3,state.pitch+Math.max(-1,Math.min(1,input.pitch))*TURN_RATE*dt));
  next.speed=input.brake?Math.max(0,state.speed-FLIGHT_BRAKE*dt):input.thrust?Math.min(MAX_FLIGHT_SPEED,state.speed+FLIGHT_ACCEL*dt):Math.max(0,state.speed-1.8*dt);
  // Constrained rail travel translates along its horizontal segment independently
  // of the view bearing; station joining and docking retain ordinary 3D inputs.
  const horizontal=input.planar,scale=horizontal?Math.hypot(...horizontal):0;
  const f:Vec3=horizontal&&scale>0?[horizontal[0]/scale,0,horizontal[1]/scale]:forward(next.yaw,next.pitch);
  const bounds=flightBounds(bodies),radial=subtract(state.position,bounds.center),radialDistance=length(radial);
  const outward=radialDistance?f.reduce((n,v,i)=>n+v*radial[i],0)/radialDistance:0;
  // Reduce only outward motion. Tangential/inward travel remains available.
  if(outward>.05){
    const allowance=Math.max(0,bounds.radius-radialDistance);
    const cap=Math.min(MAX_FLIGHT_SPEED,allowance/outward);
    next.speed=Math.max(0,state.speed-FLIGHT_BRAKE*dt,Math.min(next.speed,cap));
  }
  const distance=(state.speed+next.speed)*.5*dt;
  let desired=next.position.map((v,i)=>v+f[i]*distance) as Vec3;
  const limit=Math.max(bounds.radius,radialDistance),wanted=spaceDistance(desired,bounds.center);
  if(wanted>limit){
    // Remove only this step's outward component; never relocate an old save.
    if(horizontal){
      const dy=state.position[1]-bounds.center[1],xz=Math.hypot(desired[0]-bounds.center[0],desired[2]-bounds.center[2]);
      const radius=Math.sqrt(Math.max(0,(limit-1e-7)**2-dy*dy));
      if(xz>0)desired=[bounds.center[0]+(desired[0]-bounds.center[0])*radius/xz,state.position[1],bounds.center[2]+(desired[2]-bounds.center[2])*radius/xz];
    }else desired=desired.map((v,i)=>bounds.center[i]+(v-bounds.center[i])*(limit-1e-7)/wanted) as Vec3;
    if(outward>.05)next.speed=0;
  }
  const hit=firstCollision(next.position,desired,bodies);
  if(hit!==null){next.position=next.position.map((v,i)=>v+(desired[i]-v)*Math.max(0,hit-.005)) as Vec3;next.speed=0;}
  else next.position=desired;
  if(length(next.position)>SPACE_LIMIT){const l=length(next.position);next.position=next.position.map(v=>v/l*SPACE_LIMIT) as Vec3;next.speed=0;}
  return next;
}
export function validSpacePosition(value:unknown):value is Vec3{return Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v))&&length(value as Vec3)<=SPACE_LIMIT+.01;}
