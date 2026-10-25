import {expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {flightBounds,flightBoundaryStatus,withinFlightBoundary,flightStep,groundFlight,planetCenter,spaceDistance,bearing,FLIGHT_BOUNDARY_MARGIN} from '../src/shared/flight.ts';
import type {FlightState,SpaceBody} from '../src/shared/flight.ts';
import type {Vec3} from '../src/shared/world.ts';
import {bodyRadius} from '../src/shared/world-size.ts';
import {openStore} from '../src/server/store.ts';
import {flightRouteInput,planFlightRoute} from '../src/client/flight-route.ts';
const bodies:SpaceBody[]=Array.from({length:33},(_,i)=>({id:String(i),center:planetCenter(i),radius:i?21.6:22,environment:'present'}));
const idle={thrust:false,brake:false,turn:0,pitch:0};
const checkpoint=(f:FlightState)=>{const {mode,...body}=f;void mode;return body;};
it('encloses all actual hulls and pairwise routes with turn/braking clearance, including sparse outer worlds',()=>{
 for(const worlds of [bodies,[...bodies,{id:'far',center:[1400,120,-800] as Vec3,radius:40}]]){
  const bounds=flightBounds(worlds);
  for(const a of worlds){expect(spaceDistance(a.center,bounds.center)+bodyRadius(a)+FLIGHT_BOUNDARY_MARGIN).toBeLessThanOrEqual(bounds.radius+.0001);
   for(const b of worlds)for(const t of [0,.25,.5,.75,1])expect(spaceDistance(a.center.map((v,i)=>v+(b.center[i]-v)*t) as Vec3,bounds.center)).toBeLessThan(bounds.radius-40);
  }
 }
});
it('slows outward thrust before the edge and never escapes at 20/60/120Hz; turning inward remains possible',()=>{
 const bounds=flightBounds(bodies);
 for(const hz of [20,60,120]){
  let f:FlightState={...groundFlight(),mode:'space',position:[bounds.center[0]+bounds.radius-30,bounds.center[1],bounds.center[2]],yaw:Math.PI/2,speed:36};const initial=f.speed;
  for(let i=0;i<hz*6;i++){const next=flightStep(f,{...idle,thrust:true},1/hz,bodies);expect(withinFlightBoundary(f.position,next.position,bounds)).toBe(true);f=next;}
  expect(f.speed).toBeLessThan(initial/10);expect(flightBoundaryStatus(f.position,bounds).mode).toBe('edge');const old=spaceDistance(f.position,bounds.center);
  f.yaw=-Math.PI/2;for(let i=0;i<hz*3;i++)f=flightStep(f,{...idle,thrust:true},1/hz,bodies);expect(spaceDistance(f.position,bounds.center)).toBeLessThan(old-30);
 }
});
it('allows safe tangential motion at the boundary and blocks an already-outside ship from extending its exception',()=>{
 const bounds=flightBounds(bodies);let f:FlightState={...groundFlight(),mode:'space',position:[bounds.center[0]+bounds.radius,bounds.center[1],bounds.center[2]],speed:20};const start=f.position;
 for(let i=0;i<120;i++){const d=f.position.map((v,j)=>v-bounds.center[j]) as Vec3;f.yaw=Math.atan2(d[2],d[0]);const next=flightStep(f,{...idle,thrust:true},1/60,bodies);expect(withinFlightBoundary(f.position,next.position,bounds)).toBe(true);f=next;}
 expect(spaceDistance(start,f.position)).toBeGreaterThan(30);expect(spaceDistance(f.position,bounds.center)).toBeLessThanOrEqual(bounds.radius);
 f={...f,position:[-6.316967616872948,-486.77468039666616,739.6949674917352],speed:36};const distance=spaceDistance(f.position,bounds.center);const outward=bearing(bounds.center,f.position);f={...f,...outward};
 for(let i=0;i<120;i++){const next=flightStep(f,{...idle,thrust:true},1/60,bodies);expect(withinFlightBoundary(f.position,next.position,bounds)).toBe(true);f=next;}
 expect(spaceDistance(f.position,bounds.center)).toBeLessThanOrEqual(distance);expect(f.speed).toBe(0);
});
it('rejects old-client outward checkpoints without save changes, survives restart, and accepts inward return without weakening speed checks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'flight-boundary-')),path=join(dir,'test.sqlite');let store=openStore(path);
 try{
  store.create('pilot',0);const worlds=store.universe('pilot').planets,bounds=flightBounds(worlds);
  const original:FlightState={...groundFlight(),mode:'space',journey:1,position:[-6.316967616872948,-486.77468039666616,739.6949674917352],speed:2,targetId:worlds[1].id};
  const outward=bearing(bounds.center,original.position);Object.assign(original,outward);store.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(original),'pilot');
  const radial=original.position.map((v,i)=>v-bounds.center[i]) as Vec3,length=spaceDistance(original.position,bounds.center);
  const invalid={...original,sequence:1,position:original.position.map((v,i)=>v+radial[i]/length*.1) as Vec3};
  for(let i=0;i<3;i++)expect(()=>store.flight('pilot',checkpoint(invalid),1000)).toThrow('Flight boundary');
  expect(store.state('pilot').flight).toEqual(original);store.close();store=openStore(path);expect(store.state('pilot').flight).toEqual(original);
  const inward={...original,sequence:1,position:original.position.map((v,i)=>v-radial[i]/length*.1) as Vec3};expect(()=>store.flight('pilot',checkpoint(inward),1000)).not.toThrow();
  expect(()=>store.flight('pilot',checkpoint({...inward,sequence:2,speed:36}),1010)).toThrow('too quickly');
  const edge={...original,position:[bounds.center[0]+bounds.radius-.1,bounds.center[1],bounds.center[2]] as Vec3,yaw:Math.PI/2,speed:36};store.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(edge),'pilot');
  const stopped=flightStep(edge,{...idle,thrust:true},.05,worlds);stopped.sequence=1;expect(stopped.speed).toBe(0);expect(()=>store.flight('pilot',checkpoint(stopped),50)).not.toThrow();
  const escape={...stopped,sequence:2,position:[stopped.position[0]+.01,...stopped.position.slice(1)] as Vec3};expect(()=>store.flight('pilot',checkpoint(escape),1000)).toThrow('Flight boundary');
 }finally{store.close();rmSync(dir,{recursive:true});}
});
it('returns from the actual 737m-away saved origin through accepted server checkpoints and lands, without relocating the starting save',()=>{
 const store=openStore(':memory:');try{store.create('pilot',0);const worlds=store.universe('pilot').planets,target=worlds[1],bounds=flightBounds(worlds);
 let f:FlightState={...groundFlight(),mode:'space',journey:1,position:[-6.316967616872948,-486.77468039666616,739.6949674917352],yaw:-2.17,pitch:-.276,targetId:target.id};store.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(f),'pilot');
 const path=planFlightRoute(f.position,target,worlds);expect(path.length).toBeGreaterThan(0);let index=0,now=0;
 for(let i=0;i<3000&&index<path.length;i++){
  if(spaceDistance(f.position,path[index])<1.5&&f.speed<.5){index++;if(index===path.length)break;}
  const next=flightStep(f,flightRouteInput(f,path[index],true),.05,worlds);next.sequence=f.sequence+1;expect(withinFlightBoundary(f.position,next.position,bounds)).toBe(true);now+=50;f=store.flight('pilot',checkpoint(next),now).flight;
 }
 expect(index).toBe(path.length);expect(flightBoundaryStatus(f.position,bounds).mode).toBe('inside');expect(()=>store.land('pilot',{planetId:target.id,journey:1},now)).not.toThrow();
 }finally{store.close();}
});
