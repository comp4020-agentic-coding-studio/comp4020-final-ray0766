import {expect,it} from 'vitest';
import {flightStep,groundFlight,planetCenter,spaceDistance,firstCollision} from '../src/shared/flight.ts';
import type {FlightState} from '../src/shared/flight.ts';
import {planFlightRoute,flightRouteInput} from '../src/client/flight-route.ts';
import {landingRadius} from '../src/shared/world-size.ts';
const worlds=Array.from({length:33},(_,slot)=>({id:String(slot),center:planetCenter(slot),radius:slot?21.6:22,environment:'present'}));
function run(position:[number,number,number],target=worlds[1]){
 let f:FlightState={...groundFlight(),mode:'space',position,yaw:-2.17,pitch:-.276},index=0,turn=0,pitch=0;const path=planFlightRoute(f.position,target,worlds);expect(path.length).toBeGreaterThan(0);
 for(let i=0;i<18000&&index<path.length;i++){
  if(spaceDistance(f.position,path[index])<1.5&&f.speed<.5){index++;if(index===path.length)break;}
  const input=flightRouteInput(f,path[index],true);turn+=(input.turn-turn)*(1-Math.exp(-10/60));pitch+=(input.pitch-pitch)*(1-Math.exp(-10/60));const next=flightStep(f,{...input,turn,pitch},1/60,worlds);expect(firstCollision(f.position,next.position,worlds)).toBeNull();f=next;
 }
 expect(index).toBe(path.length);expect(f.speed).toBeLessThan(.5);expect(spaceDistance(f.position,target.center)).toBeLessThan(landingRadius(target));return f;
}
it('recovers the actual saved deep-space starting coordinates through real flight',()=>{run([-6.316967616872948,-486.77468039666616,739.6949674917352]);});
it('routes from underneath a world instead of climbing through its collision hull',()=>{run([0,-42,0],worlds[0]);});
it('routes from the real hub departure position to a nearby landing',()=>{run([0,33.759828604382164,-24.307076595155156]);});
it('stop brakes without injecting a position, heading or velocity reset',()=>{const f={...groundFlight(),mode:'space' as const,speed:20};const input=flightRouteInput(f,[100,0,0],false);expect(input).toEqual({thrust:false,brake:true,turn:0,pitch:0});expect(f.speed).toBe(20);expect(flightStep(f,input,.05,[]).speed).toBeGreaterThan(0);});
