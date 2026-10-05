import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bearing, flightStep, groundFlight, planetCenter, SAFE_RADIUS, spaceDistance } from '../src/shared/flight.ts';
import type { FlightState } from '../src/shared/flight.ts';
import { openStore } from '../src/server/store.ts';
import { SPAWN } from '../src/shared/world.ts';
const idle={thrust:false,brake:false,turn:0,pitch:0};
const body=(f:FlightState)=>({journey:f.journey,sequence:f.sequence,position:f.position,yaw:f.yaw,pitch:f.pitch,speed:f.speed,targetId:f.targetId});
it('lays planets at stable non-overlapping coordinates and integrates a full stop without tunnelling',()=>{
  const centers=Array.from({length:256},(_,i)=>planetCenter(i));
  expect(new Set(centers.map(p=>JSON.stringify(p))).size).toBe(256);expect(planetCenter(7)).toEqual(centers[7]);
  for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)expect(spaceDistance(centers[i],centers[j])).toBeGreaterThanOrEqual(90);
  const bodies=[{id:'world',center:[0,0,0] as [number,number,number]}];
  let f:FlightState={...groundFlight(),mode:'space' as const,position:[0,0,45] as [number,number,number],speed:36};
  for(let i=0;i<180;i++)f=flightStep(f,{...idle,thrust:true},1/60,bodies);
  expect(f.speed).toBe(0);expect(spaceDistance(f.position,bodies[0].center)).toBeGreaterThanOrEqual(SAFE_RADIUS-.001);
  f.yaw=Math.PI;for(let i=0;i<120;i++)f=flightStep(f,{...idle,thrust:true},1/60,bodies);
  expect(spaceDistance(f.position,bodies[0].center)).toBeGreaterThan(35);
  const run=(hz:number)=>{let s:FlightState={...groundFlight(),mode:'space' as const};for(let i=0;i<hz*2;i++)s=flightStep(s,{...idle,thrust:true},1/hz,[]);for(let i=0;i<hz;i++)s=flightStep(s,{...idle,brake:true},1/hz,[]);return s;};
  expect(spaceDistance(run(30).position,run(120).position)).toBeLessThan(.03);expect(run(30).speed).toBe(0);
});
it('fences forged/stale navigation and persists a flown landing and resumed journey',()=>{
  const dir=mkdtempSync(join(tmpdir(),'worlds-flight-')),path=join(dir,'save.sqlite');let s=openStore(path);let now=10000;s.create('pilot',now);s.character('pilot','sky');
  const initial=s.state('pilot'),depart={planetId:'hub',journey:0};s.takeoff('pilot',depart,now);const departure=s.state('pilot');s.takeoff('pilot',depart,now);expect(s.state('pilot')).toEqual(departure);
  const target=s.universe('pilot').planets.find(p=>p.id===departure.flight.targetId)!;
  expect(()=>s.land('pilot',{planetId:target.id,journey:1},now)).toThrow('closer');
  expect(()=>s.move('pilot',SPAWN,now,'hub')).toThrow('Land');expect(()=>s.interact('pilot','pickup')).toThrow('Harbour');
  const baseline=body({...departure.flight,sequence:1});
  for(const patch of [{position:target.center},{position:[NaN,0,1]},{speed:999},{yaw:Infinity},{targetId:'missing'},{journey:0},{sequence:999},{ownerId:'forged'},{speed:36}])expect(()=>s.flight('pilot',{...baseline,...patch},now+100)).toThrow();
  const fly=()=>{let f=s.state('pilot').flight;for(let i=0;i<1200;i++){
    const d=spaceDistance(f.position,target.center),aim=bearing(f.position,target.center),stop=d<18+f.speed*f.speed/104+f.speed*.1;
    const next=flightStep({...f,yaw:aim.yaw,pitch:aim.pitch},{...idle,thrust:!stop,brake:stop},.05,s.universe('pilot').planets);now+=50;next.sequence=f.sequence+1;
    f=s.flight('pilot',body(next),now).flight;
    if(i===18){s.close();s=openStore(path);expect(s.state('pilot').flight).toEqual(f);}
    if(d<19&&f.speed===0)return f;
  }throw Error('Flight failed to approach');};
  const arrived=fly();s.flight('pilot',body(arrived),now);expect(s.state('pilot').flight).toEqual(arrived);
  expect(()=>s.flight('pilot',{...body(arrived),yaw:arrived.yaw-.1},now)).toThrow('newer');
  s.land('pilot',{planetId:target.id,journey:1},now);const landed=s.state('pilot');s.land('pilot',{planetId:target.id,journey:1},now);expect(s.state('pilot')).toEqual(landed);
  expect(landed).toMatchObject({planetId:target.id,character:'sky',quest:initial.quest,position:SPAWN,flight:{mode:'ground'}});
  s.claim('pilot',target.id);const saved=s.universe('pilot');s.close();s=openStore(path);expect(s.universe('pilot')).toEqual(saved);
  s.takeoff('pilot',{planetId:target.id,journey:1},now);expect(s.state('pilot').flight.journey).toBe(2);expect(()=>s.land('pilot',{planetId:'hub',journey:1},now)).toThrow('earlier');
  s.close();rmSync(dir,{recursive:true});
});
it('accepts a collision stop but rejects a segment that crosses a planet',()=>{
  const s=openStore(':memory:');s.create('a',0);s.takeoff('a',{planetId:'hub',journey:0},0);
  const f={...s.state('a').flight,position:[0,0,30] as [number,number,number],yaw:0,pitch:0,speed:36};
  s.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(f),'a');
  const stopped={...f,position:[0,0,13] as [number,number,number],speed:0,sequence:1};expect(()=>s.flight('a',body(stopped),500)).not.toThrow();
  s.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(f),'a');
  expect(()=>s.flight('a',body({...stopped,position:[0,0,-14],speed:36}),2000)).toThrow('outside');s.close();
});
