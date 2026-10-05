import { expect,it } from 'vitest';
import { openStore } from '../src/server/store.ts';
import { presenceStore } from '../src/server/presence.ts';
import { normalize,SPAWN } from '../src/shared/world.ts';
import { MAX_NEIGHBOURS,PRESENCE_TTL } from '../src/shared/presence.ts';
import { INITIAL_PLANETS,regionFor } from '../src/shared/regions.ts';
const face=normalize([0,SPAWN[2],-SPAWN[1]]);
it('uses authoritative positions, private ephemeral IDs, bounded neighbours and scoped expiring presence',()=>{
  const s=openStore(':memory:');const p=presenceStore(s.state);for(let i=0;i<21;i++)s.create('secret-'+i,0);
  const body={planetId:'hub',facing:face};
  for(let i=1;i<21;i++)p.heartbeat('secret-'+i,body,1000);
  const snapshot=p.heartbeat('secret-0',body,1000);expect(snapshot.nearbyCount).toBe(20);expect(snapshot.visitors).toHaveLength(MAX_NEIGHBOURS);expect(JSON.stringify(snapshot)).not.toContain('secret');
  expect(snapshot.visitors.every(v=>JSON.stringify(v.position)===JSON.stringify(SPAWN))).toBe(true);
  const again=p.heartbeat('secret-0',body,1200);expect(again.selfId).toBe(snapshot.selfId);
  for(const forged of [{...body,position:[1,0,0]},{...body,id:'secret-2'},{...body,facing:[0,0,0]},{...body,facing:SPAWN}])expect(()=>p.heartbeat('secret-0',forged,1300)).toThrow();
  expect(()=>p.heartbeat('secret-0',{...body,planetId:'forged'},1300)).toThrow('changed');
  const world=s.universe('secret-1').planets.find(p=>p.kind==='garden')!;s.visit('secret-1',world.id);p.heartbeat('secret-1',{...body,planetId:world.id},1400);
  expect(p.heartbeat('secret-0',body,1500).nearbyCount).toBe(19);
  expect(p.heartbeat('secret-1',{...body,planetId:world.id},1500).visitors).toEqual([]);
  p.leave('secret-2');expect(p.heartbeat('secret-0',body,1600).nearbyCount).toBe(18);
  expect(p.heartbeat('secret-0',body,1600+PRESENCE_TTL).visitors).toEqual([]);
  s.close();
});
it('seeds three finite regions without moving existing slots or replacing owned scenes',()=>{
  const s=openStore(':memory:');s.create('a');const u=s.universe('a');expect(u.planets).toHaveLength(INITIAL_PLANETS);expect(new Set(u.planets.map(p=>regionFor(p.slot).id))).toEqual(new Set(['harbour','reach','frontier']));
  const near=u.planets[1];s.claim('a',near.id);expect(s.universe('a').planets.find(p=>p.id===near.id)?.center).toEqual(near.center);s.close();
});
