import { expect,it } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Vector3 } from 'three';
import { openStore } from '../src/server/store.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { defaultEnvironment,encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import type { TerrainField } from '../src/assets/claude-geometry/terrain/field.ts';
import { terrainModel } from '../src/client/terrain-model.ts';
import { GroundWorld,PHYSICS_VERSION } from '../src/shared/physics/world.ts';
import { SPAWN,normalize,distance } from '../src/shared/world.ts';
import { safeRadius,landingRadius } from '../src/shared/world-size.ts';
import { firstCollision,planetCenter } from '../src/shared/flight.ts';
import { placementProblem } from '../src/shared/planets.ts';
import { canBoard } from '../src/shared/ports.ts';
import type { Vec3 } from '../src/shared/world.ts';

it('uses the same radial field for terrain vertices, water, normals and physics at 10, 11 and 12 metres',()=>{
 for(const radius of [10,11,12])for(const environment of [null,encodeEnvironment(defaultEnvironment('ocean',71)),encodeEnvironment(defaultEnvironment('temperate',12))]){
  const field=fieldOf(environment,radius),old=fieldOf(environment),world=new GroundWorld({id:'test',revision:0,radius,environment,objects:[]});
  for(const p of [SPAWN,normalize([.4,.8,-.3]),[0,-1,0] as Vec3]){
   expect(field.heightAt(p)-old.heightAt(p)).toBeCloseTo(radius-10,10);
   expect(world.radius(p)).toBeCloseTo(radius+old.heightAt(p),10);
   expect(Math.hypot(...field.normalAt(p))).toBeCloseTo(1,10);
  }
  if(environment){
   const f=field as TerrainField,s=f.sample(SPAWN);expect(s.height).toBeCloseTo(f.heightAt(SPAWN),10);expect(new Vector3(...f.surfacePoint(SPAWN)).distanceTo(new Vector3(...SPAWN).multiplyScalar(10+s.height))).toBeLessThan(1e-10);
   const model=terrainModel(environment,[],{},'low',false,radius),position=model.ground.geometry.getAttribute('position');
   try{for(let i=0;i<position.count;i+=19){const p=new Vector3().fromBufferAttribute(position,i),n=p.clone().normalize().toArray() as Vec3;expect(Math.abs(p.length()-10-field.heightAt(n))).toBeLessThan(.00001);}}
   finally{model.dispose();}
  }
 }
});

it('keeps metre-based placement, boarding and flight clearance coherent across sizes',()=>{
 const point=normalize([0,1,-.6]),neighbour=new Vector3(...point).applyAxisAngle(new Vector3(1,0,0),.049).toArray() as Vec3;
 const objects=[{id:'lamp',kind:'lamp' as const,position:point,rotation:0,version:1}];
 expect(placementProblem('lamp',neighbour,objects,undefined,undefined,10)).toContain('too close');
 expect(placementProblem('lamp',neighbour,objects,undefined,undefined,12)).toBeNull();
 const near=new Vector3(...SPAWN).applyAxisAngle(new Vector3(1,0,0),.15).toArray() as Vec3;
 expect(canBoard('garden',near,10)).toBe(true);expect(canBoard('garden',near,12)).toBe(false);
 for(const radius of [10,11,12,14]){
  const body={id:'world',center:[0,0,0] as Vec3,radius};expect(safeRadius(body)).toBe(radius+3);expect(landingRadius(body)).toBe(radius+10);
  const hit=firstCollision([0,0,30],[0,0,0],[body]);expect(hit).toBeCloseTo((30-radius-3)/30,9);
 }
});

it('migrates version 10 without resizing owned, built or occupied worlds or rewriting their saved content',()=>{
 const folder=mkdtempSync(join(tmpdir(),'compact-save-')),path=join(folder,'save.sqlite');let store=openStore(path);
 try{
  store.db.exec('UPDATE planets SET radius=10');store.create('owner',0);store.create('visitor',0);const planets=store.universe('owner').planets.filter(p=>p.kind==='garden');
  const owned=planets[1],occupied=planets[2],blank=planets[4];store.visit('owner',owned.id);store.claim('owner',owned.id);
  store.createObject('owner',{planetId:owned.id,objectId:randomUUID(),kind:'lamp',position:normalize([.6,1,-.3]),rotation:0});store.visit('visitor',planets[3].id);store.visit('visitor',occupied.id);
  store.db.exec("UPDATE planets SET radius=10;UPDATE ground_states SET physics_version=1;ALTER TABLE planets DROP COLUMN radius;PRAGMA user_version=10");
  const before=store.db.prepare('SELECT * FROM planet_objects').all(),history=store.db.prepare('SELECT * FROM history_events').all();store.db.close();store=openStore(path);
  expect(store.migrationBackup).toContain('.v10-');expect(store.db.prepare('PRAGMA user_version').get()!.user_version).toBe(15);
  expect(store.db.prepare('SELECT * FROM planet_objects').all()).toEqual(before);expect(store.db.prepare('SELECT * FROM history_events').all()).toEqual(history);
  const u=store.universe('owner');expect(u.currentPlanet.radius).toBe(10);expect(u.player.ground!.physicsVersion).toBe(PHYSICS_VERSION);
  expect(u.planets.find(p=>p.id===occupied.id)!.radius).toBe(10);expect(u.planets.find(p=>p.id===planets[3].id)!.radius).toBe(10);expect(u.planets.find(p=>p.id===blank.id)!.radius).toBe(11);expect(u.planets.find(p=>p.id==='hub')!.radius).toBe(14);
  store.db.close();store=openStore(path);expect(store.universe('owner').currentPlanet.radius).toBe(10);expect(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
 }finally{store.db.close();rmSync(folder,{recursive:true,force:true});}
});

it('stores travel and walking on two actual radii and rejects forged radius edits',()=>{
 const store=openStore(':memory:');try{
  for(const [index,radius]of [11,12].entries()){
   const id='walker-'+index;store.create(id,0);const planet=store.universe(id).planets.find(p=>p.kind==='garden'&&p.radius===radius&&!p.claimed)!;
   store.visit(id,planet.id);store.claim(id,planet.id);let saved=store.state(id),time=1000;
   const world=new GroundWorld(store.universe(id).currentPlanet);let pose=world.pose(saved.position);
   for(let i=0;i<12;i++){
    const target=new Vector3(...pose.position).applyAxisAngle(new Vector3(1,0,0),.03/radius).toArray() as Vec3;
    pose=world.move(pose,target,.02);saved=store.move(id,pose.position,time+=20,planet.id,{physicsVersion:PHYSICS_VERSION,sequence:saved.ground!.sequence+1,steps:[[...pose.position,.02]]});
   }
   expect(distance(SPAWN,saved.position,radius)).toBeGreaterThan(.3);expect(saved.ground!.radius).toBeGreaterThan(radius);
   expect(()=>store.createObject(id,{planetId:planet.id,objectId:randomUUID(),kind:'lamp',position:normalize([.6,1,.3]),rotation:0,radius:30})).toThrow('Unexpected');
   store.visit(id,'hub');store.visit(id,planet.id);expect(store.state(id).worldRadius).toBe(radius);
   // The saved return point remains within real boarding reach after a short walk.
   const state=store.state(id);store.takeoff(id,{planetId:planet.id,journey:state.flight.journey},time+1000);
   const flight=store.state(id).flight;expect(Math.hypot(...flight.position.map((v,i)=>v-planetCenter(planet.slot)[i]))).toBeCloseTo(radius+20,8);
  }
 }finally{store.db.close();}
});


it('rolls the whole migration back if an old flight would intersect the larger public harbour',()=>{
 const folder=mkdtempSync(join(tmpdir(),'compact-airborne-')),path=join(folder,'save.sqlite');const store=openStore(path);
 try{
  store.create('pilot',0);const flight={...store.state('pilot').flight,mode:'space',position:[0,0,15]};
  store.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify(flight),'pilot');
  store.db.exec('ALTER TABLE planets DROP COLUMN radius;PRAGMA user_version=10');store.close();
  expect(()=>openStore(path)).toThrow('land the saved nearby spacecraft');
  const old=new DatabaseSync(path);try{expect(old.prepare('PRAGMA user_version').get()!.user_version).toBe(10);expect(old.prepare('PRAGMA table_info(planets)').all().some(c=>c.name==='radius')).toBe(false);expect(JSON.parse(String(old.prepare('SELECT flight FROM players WHERE id=?').get('pilot')!.flight))).toEqual(flight);}finally{old.close();}
 }finally{rmSync(folder,{recursive:true,force:true});}
});
