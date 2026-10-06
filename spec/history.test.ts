import {expect,it,inject} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {openStore} from '../src/server/store.ts';
import {decodeEvent,decodeSnapshot} from '../src/assets/claude-geometry/timeline/codec.ts';
import {normalize} from '../src/shared/world.ts';
import {migrateHistory} from '../src/server/history.ts';
const setup=()=>{const s=openStore(':memory:');s.create('owner');s.create('visitor');const planet=s.universe('owner').planets.find(p=>p.kind==='garden')!.id;s.claim('owner',planet);return {s,planet};};
it('records create, move, rotate and delete atomically, replays exact snapshots and records retries once',()=>{
 const {s,planet}=setup();try{
 const create={planetId:planet,objectId:randomUUID(),kind:'lamp',position:normalize([.7,1,.3]),rotation:0};s.createObject('owner',create);s.createObject('owner',create);
 const change={planetId:planet,objectId:create.objectId,position:normalize([.6,1,.5]),rotation:.7,expectedVersion:1};s.updateObject('owner',change);s.updateObject('owner',change);
 const remove={planetId:planet,objectId:create.objectId,expectedVersion:2};s.removeObject('owner',remove);s.removeObject('owner',remove);
 const page=s.historyPage('owner',planet);expect(page.head).toBe(4);expect(page.events.map(raw=>{const r=decodeEvent(raw);return r.ok?r.value.type:null;})).toEqual(['object.created','object.moved','object.rotated','object.deleted']);
 for(const seq of [0,1,2,3,4]){const snapshot=s.historySnapshot('owner',planet,seq),r=decodeSnapshot(snapshot.document);expect(r.ok).toBe(true);if(r.ok)expect(Object.keys(r.value.objects)).toHaveLength(seq>0&&seq<4?1:0);expect(snapshot.hash).toBe(createHash('sha256').update(snapshot.document).digest('hex'));}
 expect(s.historyPage('owner',planet,1,2).next).toBe(3);expect(()=>s.historyPage('owner',planet,0,101)).toThrow('range');expect(()=>s.historySnapshot('owner',planet,99)).toThrow('range');
 expect(JSON.stringify(page)).not.toContain('visitor');expect(JSON.stringify(page)).not.toContain('owner_id');
 expect(()=>s.db.exec('UPDATE history_events SET seq=seq')).toThrow('immutable');expect(()=>s.db.exec('DELETE FROM history_snapshots')).toThrow('immutable');
 }finally{s.close();}
});
it('rejects every visitor read and rolls back the authoritative building if event append fails',()=>{
 const {s,planet}=setup();try{
 expect(()=>s.historyPage('visitor',planet)).toThrow('owner');expect(()=>s.historySnapshot('visitor',planet,0)).toThrow('owner');
 s.db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON history_events BEGIN SELECT RAISE(ABORT,'injected event failure'); END;");const before=s.universe('owner');
 expect(()=>s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'tree',position:normalize([.5,1,.5]),rotation:0})).toThrow('injected');expect(s.universe('owner')).toEqual(before);expect(s.historyPage('owner',planet).head).toBe(0);
 }finally{s.close();}
});
it('imports old buildings as a sequence-zero baseline and reconstructs across immutable periodic snapshots',()=>{
 const {s,planet}=setup();try{
 const id=randomUUID();s.db.prepare('INSERT INTO planet_objects(id,planet_id,kind,position,rotation,version) VALUES (?,?,?,?,?,?)').run(id,planet,'lamp',JSON.stringify(normalize([.6,1,.4])),0,9);
 s.db.exec('DROP TRIGGER history_snapshots_no_delete;DELETE FROM history_snapshots;DELETE FROM history_heads;');migrateHistory(s.db);
 const baseline=s.historySnapshot('owner',planet,0);expect(s.historyPage('owner',planet).events).toEqual([]);const r=decodeSnapshot(baseline.document);expect(r.ok&&r.value.objects[id].version).toBe(9);
 for(let i=1;i<=19;i++)s.updateObject('owner',{planetId:planet,objectId:id,position:normalize([.6,1,.4]),rotation:i*.1,expectedVersion:8+i});
 expect(s.historyPage('owner',planet).head).toBe(19);expect(s.db.prepare('SELECT count(*) AS n FROM history_snapshots WHERE planet_id=?').get(planet)!.n).toBe(2);
 expect(s.historySnapshot('owner',planet,0)).toMatchObject({document:baseline.document});const result=decodeSnapshot(s.historySnapshot('owner',planet,17).document);expect(result.ok&&result.value.objects[id].anchor.yaw).toBe(1.7);
 }finally{s.close();}
});
it('protects both HTTP history endpoints with server-derived ownership and strict pagination',async()=>{
 const base=inject('baseUrl');const a=await fetch(base+'/api/state'),owner=a.headers.get('set-cookie')!.split(';')[0],b=await fetch(base+'/api/state'),visitor=b.headers.get('set-cookie')!.split(';')[0];
 const u=await(await fetch(base+'/api/universe',{headers:{cookie:owner}})).json(),planet=u.planets.find((p:{claimed:boolean;kind:string})=>p.kind==='garden'&&!p.claimed).id;
 expect((await fetch(base+'/api/planets/claim',{method:'POST',headers:{cookie:owner,'content-type':'application/json'},body:JSON.stringify({planetId:planet})})).status).toBe(200);
 for(const route of ['history','history/snapshot']){const url=base+'/api/'+route+'?planetId='+planet;expect((await fetch(url,{headers:{cookie:visitor}})).status).toBe(403);expect((await fetch(url)).status).toBe(401);const response=await fetch(url,{headers:{cookie:owner}});expect(response.status).toBe(200);expect(await response.text()).not.toContain(owner.split('=')[1]);}
 expect((await fetch(base+'/api/history?planetId='+planet+'&limit=5000',{headers:{cookie:owner}})).status).toBe(400);
 expect((await fetch(base+'/api/history/snapshot?planetId='+planet+'&actorId=owner',{headers:{cookie:owner}})).status).toBe(400);
});
it('rolls back the first event and head when the second half of move+rotate fails',()=>{
 const {s,planet}=setup();try{const create={planetId:planet,objectId:randomUUID(),kind:'lamp',position:normalize([.6,1,.3]),rotation:0};s.createObject('owner',create);const before=s.universe('owner'),head=s.historySnapshot('owner',planet);
 s.db.exec("CREATE TRIGGER fail_second_event BEFORE INSERT ON history_events WHEN NEW.seq=3 BEGIN SELECT RAISE(ABORT,'second append failed'); END;");
 expect(()=>s.updateObject('owner',{planetId:planet,objectId:create.objectId,position:normalize([.5,1,.5]),rotation:1,expectedVersion:1})).toThrow('second append');expect(s.universe('owner')).toEqual(before);expect(s.historySnapshot('owner',planet)).toEqual(head);expect(s.historyPage('owner',planet).head).toBe(1);
 }finally{s.close();}
});
