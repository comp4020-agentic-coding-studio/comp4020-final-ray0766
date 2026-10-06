import {DatabaseSync} from 'node:sqlite';
import {expect,it,inject} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vector3} from 'three';
import {openStore} from '../src/server/store.ts';
import {STYLES,defaultEnvironment,encodeEnvironment,decodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {createHeightField} from '../src/assets/claude-geometry/terrain/field.ts';
import {chooseSites,padFootprint} from '../src/assets/claude-geometry/terrain/pads.ts';
import {buildPlanet} from '../src/assets/claude-geometry/terrain/planet.ts';
import {blueprintGroundFootprint} from '../src/assets/claude-geometry/blueprint/model.ts';
import {fieldOf,objectSeat,foundations,gradedField} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP} from '../src/shared/physics/world.ts';
import {SPAWN} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {placementProblem} from '../src/shared/planets.ts';
import {groundFlight,flightStep,firstCollision,SAFE_RADIUS} from '../src/shared/flight.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {encodeBlueprint} from '../src/assets/claude-geometry/blueprint/codec.ts';
const env=encodeEnvironment(defaultEnvironment('desert'));
const setup=(path=':memory:')=>{const s=openStore(path);s.create('owner',0);s.create('visitor',0);const p=s.universe('owner').planets.find(p=>p.kind==='garden')!;s.claim('owner',p.id);s.visit('owner',p.id);return {s,planet:p.id};};
const apply=(s:ReturnType<typeof openStore>,planet:string,environment=env)=>s.terrain('owner',{planetId:planet,environment,expectedRevision:s.universe('owner').currentPlanet.revision});
const directions=Array.from({length:700},(_,i)=>{const y=1-2*(i+.5)/700,a=i*2.399963229728653,r=Math.sqrt(1-y*y);return [Math.cos(a)*r,y,Math.sin(a)*r] as Vec3;});
it('keeps all legacy worlds untouched and validates deterministic four-style fields at both poles and a dry landing pad',()=>{
 const {s}=setup();try{expect(s.universe('owner').planets.every(p=>p.environment===null)).toBe(true);for(const style of STYLES){const e=defaultEnvironment(style),a=createHeightField(e),r=decodeEnvironment(encodeEnvironment(e));expect(r.ok).toBe(true);if(!r.ok)continue;const b=createHeightField(r.value);for(const d of [[0,1,0],[0,-1,0],SPAWN,...directions] as Vec3[]){expect(a.heightAt(d)).toBe(b.heightAt(d));expect(a.heightAt(d)).toBeGreaterThanOrEqual(-1.45);expect(a.heightAt(d)).toBeLessThanOrEqual(1.75);expect(a.normalAt(d).every(Number.isFinite)).toBe(true);}if(a.waterLevel!==null)expect(a.heightAt(SPAWN)).toBeGreaterThan(a.waterLevel+.15);}}finally{s.close();}
});
it('applies only on the grounded owner planet, fences stale/forged documents, retries once and rolls back atomically',()=>{
 const {s,planet}=setup();try{
 const rev=s.universe('owner').currentPlanet.revision,body={planetId:planet,environment:env,expectedRevision:rev};
 expect(()=>s.terrain('visitor',body)).toThrow('owner');expect(()=>s.terrain('owner',{...body,ownerId:'visitor'})).toThrow('Unexpected');expect(()=>s.terrain('owner',{...body,environment:'{}'})).toThrow();expect(()=>s.terrain('owner',{...body,expectedRevision:rev+1})).toThrow('another tab');
 s.db.exec("CREATE TRIGGER refuse_terrain BEFORE UPDATE OF environment ON planets BEGIN SELECT RAISE(ABORT,'injected terrain failure'); END;");const before=s.universe('owner');expect(()=>s.terrain('owner',body)).toThrow('injected');expect(s.universe('owner')).toEqual(before);s.db.exec('DROP TRIGGER refuse_terrain');
 apply(s,planet);const saved=s.universe('owner');s.terrain('owner',body);expect(s.universe('owner')).toEqual(saved);expect(saved.currentPlanet.environment).toBe(env);expect(saved.player.ground!.radius).toBeCloseTo(10+fieldOf(env).heightAt(SPAWN),6);expect(saved.planets.find(p=>p.id==='hub')!.environment).toBe(null);
 s.takeoff('owner',{planetId:planet,journey:0},1000);expect(()=>apply(s,planet,encodeEnvironment(defaultEnvironment('ice')))).toThrow('Land');
 }finally{s.close();}
});
it('restricts terrain flooding/steep buildings, underwater visitors and aircraft inside the new clearance; refused changes preserve every object',()=>{
 const {s,planet}=setup();try{
 const ocean=encodeEnvironment(defaultEnvironment('ocean')),f=fieldOf(ocean);const at=directions.find(p=>f.heightAt(p)<f.waterLevel!-.1&&!placementProblem('lamp',p,[]))!;expect(at).toBeTruthy();s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'lamp',position:at,rotation:0});const before=s.universe('owner');expect(()=>apply(s,planet,ocean)).toThrow('under water');expect(s.universe('owner')).toEqual(before);
 const old=before.currentPlanet.objects[0];s.removeObject('owner',{planetId:planet,objectId:old.id,expectedVersion:1});s.visit('visitor',planet);s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(at),'visitor');expect(()=>apply(s,planet,ocean)).toThrow('visitor');s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(SPAWN),'visitor');
 const center=before.currentPlanet.center,flight={...groundFlight(),mode:'space',position:center.map((v,i)=>v+(i===0?14:0))};s.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify(flight),'visitor');expect(()=>apply(s,planet,ocean)).toThrow('ship is too close');
 s.db.prepare('UPDATE players SET flight=NULL WHERE id=?').run('visitor');apply(s,planet,ocean);expect(()=>s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'lamp',position:at,rotation:0})).toThrow('under water');
 }finally{s.close();}
});
it('shares generated ground with bounded server movement, persists it, and uses enlarged flight clearance with a dry landing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'terrain-state-')),path=join(dir,'world.sqlite');const initial=setup(path),planet=initial.planet;let s=initial.s;try{
 apply(s,planet);let state=s.state('owner'),w=new GroundWorld(s.universe('owner').currentPlanet),pose=w.pose(SPAWN),now=Date.now()+100;
 for(let batch=0;batch<6;batch++){const steps:[number,number,number,number][]=[];for(let i=0;i<20;i++){const target=new Vector3(...pose.position).addScaledVector(new Vector3(1,0,0).projectOnPlane(new Vector3(...pose.position)).normalize(),1.5*FIXED_STEP/pose.radius).normalize().toArray() as Vec3;pose=w.move(pose,target,FIXED_STEP);steps.push([...pose.position,FIXED_STEP]);now+=FIXED_STEP*1000;}state=s.move('owner',pose.position,now,planet,{sequence:state.ground!.sequence+1,steps});expect(state.ground!.radius).toBeCloseTo(pose.radius,6);}
 expect(new Vector3(...state.position).distanceTo(new Vector3(...SPAWN))).toBeGreaterThan(.1);s.close();s=openStore(path);expect(s.state('owner')).toEqual(state);expect(s.universe('owner').currentPlanet.environment).toBe(env);
 const bodies=[{id:planet,center:[0,0,0] as Vec3,environment:env}],start={...groundFlight(),mode:'space' as const,position:[0,0,45] as Vec3,speed:36};let flight:ReturnType<typeof groundFlight>=start;for(let i=0;i<180;i++)flight=flightStep(flight,{thrust:true,brake:false,turn:0,pitch:0},FIXED_STEP,bodies);expect(flight.speed).toBe(0);expect(new Vector3(...flight.position).length()).toBeGreaterThanOrEqual(SAFE_RADIUS+1.75-.001);expect(firstCollision([0,0,30],[0,0,13],bodies,12.65)).not.toBe(null);
 const center=s.universe('owner').currentPlanet.center;s.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify({...start,journey:4,speed:0,position:center.map((v,i)=>v+(i===0?18:0))}),'owner');s.land('owner',{planetId:planet,journey:4},now);expect(s.state('owner').position).toEqual(SPAWN);w=new GroundWorld(s.universe('owner').currentPlanet);expect(s.state('owner').ground!.radius).toBeCloseTo(w.pose(SPAWN).radius,6);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
it('preserves building transforms and freezes each history snapshot terrain context',()=>{
 const {s,planet}=setup();try{
 apply(s,planet);
 const field=fieldOf(env),site=chooseSites(field,[{id:'lamp',label:'lamp',footprint:padFootprint({kind:'circle',radius:.24})}])[0];expect(site).toBeTruthy();const id=randomUUID();s.createObject('owner',{planetId:planet,objectId:id,kind:'lamp',position:site.anchor.dir,rotation:site.anchor.yaw});const object=s.universe('owner').currentPlanet.objects[0];expect(objectSeat(field,object).problem).toBe(null);expect(s.historySnapshot('owner',planet,1).environment).toBe(env);
 const w=new GroundWorld(s.universe('owner').currentPlanet);expect(w.radius(object.position)).toBeLessThanOrEqual(10+field.heightAt(object.position));
 const candidate=Array.from({length:20},(_,i)=>encodeEnvironment(defaultEnvironment('desert',i))).find(e=>!objectSeat(fieldOf(e),object).problem)!;apply(s,planet,candidate);expect(s.universe('owner').currentPlanet.objects).toEqual([object]);expect(s.historySnapshot('owner',planet,0).environment).toBe(null);expect(s.historySnapshot('owner',planet,1).environment).toBe(env);
 s.updateObject('owner',{planetId:planet,objectId:id,position:object.position,rotation:0,expectedVersion:1});expect(s.historySnapshot('owner',planet,2).environment).toBe(candidate);
 }finally{s.close();}
});
it('protects the HTTP terrain write and rejects forged owner fields and malformed environment documents',async()=>{
 const base=inject('baseUrl'),a=await fetch(base+'/api/state'),owner=a.headers.get('set-cookie')!.split(';')[0],b=await fetch(base+'/api/state'),visitor=b.headers.get('set-cookie')!.split(';')[0];const u=await(await fetch(base+'/api/universe',{headers:{cookie:owner}})).json(),planet=u.planets.find((p:{kind:string;claimed:boolean})=>p.kind==='garden'&&!p.claimed).id;
 await fetch(base+'/api/planets/claim',{method:'POST',headers:{cookie:owner,'content-type':'application/json'},body:JSON.stringify({planetId:planet})});const post=(cookie:string,body:unknown)=>fetch(base+'/api/terrain/apply',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});const body={planetId:planet,environment:env,expectedRevision:1};expect((await post(visitor,body)).status).toBe(403);expect((await post(owner,{...body,ownerId:'forged'})).status).toBe(400);expect((await post(owner,{...body,environment:'{}'})).status).toBe(400);expect((await post(owner,body)).status).toBe(409);
});

it('places a custom structure using dense footing, rejects steep refits and matches drawn mesh vertices to physical grading',()=>{
 const {s,planet}=setup();try{
 apply(s,planet);const bp={...industrialCabin(),parts:[{n:1,part:'floor.deck' as const,x:0,z:0,level:0,rot:0 as const}]};const entry=s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}),field=fieldOf(env);
 const site=chooseSites(field,[{id:'deck',label:'deck',footprint:blueprintGroundFootprint(bp.parts)}])[0];expect(site).toBeTruthy();s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:site.anchor.dir,rotation:site.anchor.yaw});const p=s.universe('owner').currentPlanet,ground=gradedField(field,p.objects,p.blueprints);
 const r=decodeEnvironment(env);if(!r.ok)throw Error('fixture');const model=buildPlanet(r.value,null,'low',{foundations:foundations(field,p.objects,p.blueprints)});
 try{const vertices=model.ground.geometry.attributes.position;let error=0;for(let i=0;i<vertices.count;i++){const v=new Vector3().fromBufferAttribute(vertices,i),radius=v.length(),d=v.normalize().toArray() as Vec3;error=Math.max(error,Math.abs(radius-(10+ground.heightAt(d))));}expect(error).toBeLessThan(.00001);}finally{model.dispose();}
 const candidate=Array.from({length:100},(_,i)=>encodeEnvironment({...defaultEnvironment('desert',i),params:{...defaultEnvironment('desert',i).params,relief:1.4,roughness:1}})).find(e=>objectSeat(fieldOf(e),p.objects[0],p.blueprints).problem==='too-uneven');expect(candidate).toBeTruthy();expect(()=>apply(s,planet,candidate!)).toThrow('ground drops');expect(s.universe('owner').currentPlanet).toEqual(p);
 }finally{s.close();}
});

it('rolls back a failed schema-8 migration and retries with old rows intact',()=>{
 const dir=mkdtempSync(join(tmpdir(),'terrain-migrate-')),path=join(dir,'world.sqlite'),initial=setup(path);initial.s.close();let db=new DatabaseSync(path);
 try{
 for(const table of ['planets','history_events','history_snapshots'])db.exec('ALTER TABLE '+table+' DROP COLUMN environment');db.exec('PRAGMA user_version=8;CREATE TABLE ground_states_v9 (blocked TEXT)');
 const tables=['players','planets','planet_objects','visits','object_tombstones','blueprint_contents','blueprint_library','ground_states','player_ships','history_heads','history_events','history_snapshots'];const before=tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all());db.close();expect(()=>openStore(path)).toThrow('already exists');db=new DatabaseSync(path);expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(8);expect(db.prepare('PRAGMA table_info(planets)').all().some(c=>c.name==='environment')).toBe(false);expect(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())).toEqual(before);db.exec('DROP TABLE ground_states_v9');db.close();
 const migrated=openStore(path);expect(migrated.migrationBackup).toMatch(/v8-/);expect(migrated.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');expect(migrated.universe('owner').planets.every(p=>p.environment===null)).toBe(true);migrated.close();db=new DatabaseSync(path);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
it('keeps generated-ground turning finite at both poles and clips the camera before it enters a hill',()=>{
 const w=new GroundWorld({id:'p',revision:1,objects:[],environment:env});for(const direction of [[0,1,0],[0,-1,0]] as Vec3[]){let p=w.pose(direction);for(let i=0;i<120;i++){const tangent=new Vector3(i<60?1:-1,0,0).projectOnPlane(new Vector3(...p.position)).normalize();const target=new Vector3(...p.position).addScaledVector(tangent,.018/p.radius).normalize().toArray() as Vec3;p=w.move(p,target,FIXED_STEP);expect([...p.position,p.radius,p.verticalSpeed].every(Number.isFinite)).toBe(true);}expect(new Vector3(...p.position).length()).toBeCloseTo(1,10);const eye=new Vector3(...p.position).multiplyScalar(p.radius+1.4),inside=new Vector3(...p.position).multiplyScalar(p.radius-.5);expect(w.cameraDistance(eye,inside)).toBeLessThan(1.4);}
});
