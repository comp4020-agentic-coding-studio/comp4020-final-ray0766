import {Vector3} from 'three';
import {bearing,firstCollision,spaceDistance,wrapAngle,flightBounds,withinFlightBoundary} from '../shared/flight.ts';
import type {FlightState,SpaceBody,FlightInput} from '../shared/flight.ts';
import {RADIUS} from '../shared/world.ts';
import type {Vec3} from '../shared/world.ts';
import {bodyRadius,landingRadius} from '../shared/world-size.ts';
const stopped:FlightInput={thrust:false,brake:true,turn:0,pitch:0};
/** Bounded visibility graph over real hulls. This plans input; it cannot move,
 * teleport, land or modify authoritative world coordinates. */
export function planFlightRoute(start:Vec3,target:SpaceBody,bodies:SpaceBody[]):Vec3[]{
 const approach=landingRadius(target)-1.5;
 return planFlightPath(start,[target.center[0]+approach*.6,target.center[1]+approach*.8,target.center[2]],bodies);
}
export function planFlightPath(start:Vec3,goal:Vec3,bodies:SpaceBody[]):Vec3[]{
 const bounds=flightBounds(bodies);
 // Leave steering margin below the simulator's 1.3-radian pitch cap.
 const clear=(a:Vec3,b:Vec3)=>Math.abs(b[1]-a[1])<=Math.hypot(b[0]-a[0],b[2]-a[2])*Math.tan(1.1)+.01&&withinFlightBoundary(a,b,bounds)&&firstCollision(a,b,bodies,RADIUS+6)===null;
 if(clear(start,goal))return [goal];
 const a=new Vector3(...start),d=new Vector3(...goal).sub(a),length=d.lengthSq();
 const corridor=(p:SpaceBody)=>{const q=new Vector3(...p.center).sub(a),t=length?Math.max(0,Math.min(1,q.dot(d)/length)):0;return q.addScaledVector(d,-t).length()-bodyRadius(p);};
 const obstacles=[...bodies].sort((x,y)=>corridor(x)-corridor(y)).slice(0,24);
 const nodes:Vec3[]=[start,goal];
 for(const b of obstacles)for(const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
  const p=b.center.map((v,i)=>v+axis[i]*(bodyRadius(b)+20)) as Vec3;
  if(bodies.every(x=>spaceDistance(p,x.center)>bodyRadius(x)+8))nodes.push(p);
 }
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set<number>();costs[0]=0;
 for(let count=0;count<nodes.length;count++){
  let u=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(u<0||costs[i]<costs[u]))u=i;
  if(u<0||!Number.isFinite(costs[u]))break;if(u===1){const path:Vec3[]=[];for(let i=1;i>0;i=previous[i])path.unshift(nodes[i]);return path;}
  done.add(u);for(let v=1;v<nodes.length;v++)if(!done.has(v)){const cost=costs[u]+spaceDistance(nodes[u],nodes[v]);if(cost<costs[v]&&clear(nodes[u],nodes[v])){costs[v]=cost;previous[v]=u;}}
 }
 return [];
}
export function flightRouteInput(f:FlightState,waypoint:Vec3|undefined,active:boolean):FlightInput{
 if(!active||!waypoint)return {...stopped};
 const aim=bearing(f.position,waypoint),yaw=wrapAngle(aim.yaw-f.yaw),pitch=Math.max(-1.3,Math.min(1.3,aim.pitch))-f.pitch;
 const distance=spaceDistance(f.position,waypoint),brake=Math.abs(yaw)>.08||Math.abs(pitch)>.08||distance<1+f.speed*f.speed/104+f.speed*.28;
 return {thrust:!brake,brake,turn:Math.max(-1,Math.min(1,yaw*3)),pitch:Math.max(-1,Math.min(1,pitch*3))};
}
