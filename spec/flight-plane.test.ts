import {expect,it} from 'vitest';
import {flightStep,groundFlight,planetCenter,spaceDistance,firstCollision,flightBounds,withinFlightBoundary} from '../src/shared/flight.ts';
import type {FlightState} from '../src/shared/flight.ts';
import type {Vec3} from '../src/shared/world.ts';
import {cruiseHeight,cruiseRoute,cruiseReady,canApproach,PlanarDrive} from '../src/client/flight-plane.ts';
import {planFlightRoute,flightRouteInput} from '../src/client/flight-route.ts';
import {landingRadius} from '../src/shared/world-size.ts';
const worlds=Array.from({length:33},(_,slot)=>({id:String(slot),center:planetCenter(slot),radius:slot?21.6:22,environment:'present'}));
const start=(position:Vec3):FlightState=>({...groundFlight(),mode:'space',position});
function follow(f:FlightState,path:Vec3[]){
 expect(path.length).toBeGreaterThan(0);let index=0,turn=0,pitch=0;
 let previous=f.position;for(const goal of path){expect(Math.abs(goal[1]-previous[1])).toBeLessThanOrEqual(Math.hypot(goal[0]-previous[0],goal[2]-previous[2])*Math.tan(1.1)+.011);previous=goal;}
 for(let i=0;i<18000&&index<path.length;i++){
  if(spaceDistance(f.position,path[index])<1.5&&f.speed<.5){index++;if(index===path.length)break;}
  const input=flightRouteInput(f,path[index],true);turn+=(input.turn-turn)*(1-Math.exp(-10/60));pitch+=(input.pitch-pitch)*(1-Math.exp(-10/60));const next=flightStep(f,{...input,turn,pitch},1/60,worlds);
  expect(firstCollision(f.position,next.position,worlds)).toBeNull();expect(withinFlightBoundary(f.position,next.position,flightBounds(worlds))).toBe(true);f=next;
 }
 expect(index).toBe(path.length);return f;
}
it('uses a plane with 20m clearance over every real hull',()=>{expect(cruiseHeight(worlds)).toBeGreaterThan(55);for(const w of worlds)expect(cruiseHeight(worlds)-w.center[1]-w.radius-1.75).toBeGreaterThanOrEqual(20-1e-8);});
it('forward/back and sideways stay level, diagonal speed is bounded, looking while held does not steer',()=>{
 for(const [x,z]of [[0,1],[0,-1],[1,0],[-1,0],[1,1]]){
  const drive=new PlanarDrive();let f=start([45,cruiseHeight(worlds),-45]);const y=f.position[1];
  for(let i=0;i<60;i++)f=flightStep(f,drive.input(f,{x,z,brake:false},i?2:0),1/60,worlds);
  expect(f.position[1]).toBe(y);expect(Math.sign(f.position[0]-45)).toBe(Math.sign(x));expect(Math.sign(f.position[2]+45)).toBeCloseTo(-Math.sign(z));expect(f.speed).toBeCloseTo(14);
 }
});
it('brakes on release and relatches the new view only for a new gesture',()=>{const d=new PlanarDrive(),f=start([0,cruiseHeight(worlds),0]);expect(d.input(f,{x:0,z:1,brake:false},0).planar).toEqual([0,-1]);expect(d.input(f,{x:0,z:1,brake:false},1).planar).toEqual([0,-1]);expect(d.input(f,{x:0,z:0,brake:false},1).brake).toBe(true);expect(d.input(f,{x:0,z:1,brake:false},Math.PI/2).planar![0]).toBeCloseTo(1);});
it('recovers the actual legacy far origin without moving the saved fixture or crossing hulls',()=>{const f=start([-6.316967616872948,-486.77468039666616,739.6949674917352]),original=[...f.position];const ready=follow(f,cruiseRoute(f,worlds));expect(f.position).toEqual(original);expect(cruiseReady(ready,worlds)).toBe(true);expect(spaceDistance(ready.position,flightBounds(worlds).center)).toBeLessThan(flightBounds(worlds).radius);});
it('approaches every height through ordinary flight and can depart again from below a hull',()=>{for(const target of worlds){const f=start([target.center[0]+35,cruiseHeight(worlds),target.center[2]]);expect(canApproach(f,target)).toBe(true);const landed=follow(f,planFlightRoute(f.position,target,worlds));expect(spaceDistance(landed.position,target.center)).toBeLessThan(landingRadius(target));const departure=start([target.center[0],target.center[1]-target.radius-20,target.center[2]]);expect(cruiseReady(follow(departure,cruiseRoute(departure,worlds)),worlds)).toBe(true);}});
it('contains horizontal boundary attempts without changing height; inward escape stays possible',()=>{const b=flightBounds(worlds),y=cruiseHeight(worlds),radius=Math.sqrt(b.radius*b.radius-(y-b.center[1])**2);let f=start([b.center[0]+radius-.01,y,b.center[2]]);const drive=new PlanarDrive();for(let i=0;i<240;i++)f=flightStep(f,drive.input(f,{x:1,z:0,brake:false},0),1/60,worlds);expect(f.position[1]).toBe(y);expect(spaceDistance(f.position,b.center)).toBeLessThanOrEqual(b.radius);drive.reset();for(let i=0;i<120;i++)f=flightStep(f,drive.input(f,{x:-1,z:0,brake:false},0),1/60,worlds);expect(spaceDistance(f.position,b.center)).toBeLessThan(b.radius-10);});

it('avoids the actual near-vertical post-landing departure stall',()=>{const f=start([-90.00035537487547,26.22363472714302,190.84449170963057]);f.pitch=1.3;f.yaw=-1.37785;const path=cruiseRoute(f,worlds);expect(cruiseReady(follow(f,path),worlds)).toBe(true);});
