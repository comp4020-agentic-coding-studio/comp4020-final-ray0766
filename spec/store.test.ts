import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/server/store.ts';
import { NPCS, SPAWN, normalize } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
const travel = (store:ReturnType<typeof openStore>,id:string,destination:Vec3,start:number) => {
  const from=store.state(id).position;
  for(let i=1;i<=10;i++) store.move(id,normalize(from.map((v,j)=>v+(destination[j]-v)*i/10) as Vec3),start+i*1000);
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
