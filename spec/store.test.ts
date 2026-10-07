import {Vector3} from 'three';
import {GroundWorld,FIXED_STEP,HUB_PHYSICS_VERSION} from '../src/shared/physics/world.ts';
import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/server/store.ts';
import { NPCS, SPAWN } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
const travel = (store:ReturnType<typeof openStore>,id:string,destination:Vec3,start:number) => {
 const world=new GroundWorld(store.universe(id).currentPlanet);let state=store.state(id),pose={position:state.position,...state.ground!};let time=Math.max(start,Number(store.db.prepare('SELECT moved_at FROM players WHERE id=?').get(id)!.moved_at));
 // Follow the authored clear bearings through the landing plaza, using the
 // same bounded, collision-resolved motion samples as the current client.
 for(const target of [SPAWN,destination]){let reached=false;for(let i=0;i<1500;i++){
  const a=new Vector3(...pose.position),b=new Vector3(...target),d=a.angleTo(b)*14;if(d<.03){reached=true;break;}
  const next=world.move(pose,a.lerp(b,Math.min(1,.045/d)).normalize().toArray() as Vec3,FIXED_STEP);state=store.move(id,next.position,time+=FIXED_STEP*1000,'hub',{sequence:state.ground!.sequence+1,physicsVersion:HUB_PHYSICS_VERSION,steps:[[...next.position,FIXED_STEP,0]]});pose={position:state.position,...state.ground!};
 }expect(reached).toBe(true);}
};
it('requires pickup and proximity, and replays both transitions without duplicate delivery',()=>{
  const s=openStore(':memory:');s.create('a',0);
  expect(()=>s.interact('a','deliver')).toThrow('Collect');
  expect(()=>s.interact('a','pickup')).toThrow('Walk closer');
  travel(s,'a',NPCS.mica.position,0);
  expect(s.interact('a','pickup').quest).toBe('carrying');
  expect(s.interact('a','pickup').quest).toBe('carrying');
  expect(()=>s.interact('a','deliver')).toThrow('Walk closer');
  travel(s,'a',NPCS.sol.position,10_000);
  for(let i=0;i<12;i++){expect(s.interact('a','deliver').deliveries).toBe(1);expect(s.interact('a','pickup').quest).toBe('delivered');}
  s.close();
});
it('validates character, nonfinite or off-sphere coordinates, and impossible travel',()=>{
  const s=openStore(':memory:');s.create('a',0);
  expect(()=>s.character('a','admin')).toThrow();
  for(const p of [[NaN,1,0],[0,0,0],[1,1,1],null,[0,Infinity,1],['0',1,0]])expect(()=>s.move('a',p)).toThrow();
  expect(()=>s.move('a',SPAWN.map(v=>-v),0)).toThrow('too far');
  expect(()=>s.interact('a','reset')).toThrow();s.close();
});
it('stores identity-specific coat and delivery across an actual database close/reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'little-post-')),path=join(dir,'test.sqlite');
  const s=openStore(path);s.create('a',0);s.create('b',0);s.character('a','fern');
  travel(s,'a',NPCS.mica.position,0);s.interact('a','pickup');s.close();
  const reopened=openStore(path);
  expect(reopened.state('a')).toMatchObject({character:'fern',quest:'carrying',deliveries:0});
  expect(reopened.state('b')).toMatchObject({character:'clay',quest:'available',deliveries:0});
  travel(reopened,'a',NPCS.sol.position,10_000);reopened.interact('a','deliver');reopened.close();
  const final=openStore(path);expect(final.state('a').deliveries).toBe(1);final.close();rmSync(dir,{recursive:true});
});
