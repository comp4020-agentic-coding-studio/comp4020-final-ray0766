import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/server/store.ts';
import { applyIntegration, integrationTableDigest, previewIntegration } from '../src/server/integration-migration.ts';
import { localToDir, anchorQuaternion } from '../src/assets/claude-geometry/core/anchor.ts';
import { quatConjugate, quatRotate, scale, sub } from '../src/assets/claude-geometry/core/vec.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import type { Blueprint } from '../src/assets/claude-geometry/blueprint/model.ts';
import { SPAWN } from '../src/shared/world.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { structureFit } from '../src/shared/blueprints.ts';
import { planetCenter } from '../src/shared/flight.ts';
import { SAMPLE_PUBLIC_VERSION } from '../src/shared/sample-public-village.ts';

// These operator checks include a cold subprocess, several complete worlds,
// SQLite copies and reopening. Their wall clock is not a frame-time budget.
vi.setConfig({ testTimeout: 15_000 });

type Store=ReturnType<typeof openStore>;
const stores:Store[]=[],directories:string[]=[];
afterEach(()=>{for(const store of stores.splice(0)){try{store.close();}catch{/* Closed for persistence checks. */}}for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
const connect=(path=':memory:')=>{const store=openStore(path);stores.push(store);return store;};
const table=(store:Store,name:string)=>store.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
const temp=()=>{const dir=mkdtempSync(join(tmpdir(),'world-integration-'));directories.push(dir);return dir;};
function legacy(path=':memory:',floor=false){
  const store=connect(path);store.create('old-owner');
  const planet=store.universe('old-owner').planets.find(planet=>planet.kind==='garden'&&planet.radius===10)!;
  store.claim('old-owner',planet.id);store.visit('old-owner',planet.id);
  if(floor){
    const blueprint:Blueprint={id:randomUUID() as Blueprint['id'],name:'Original floor label',groups:[{name:'Original floor group',members:[1,2]}],parts:[{n:1,part:'floor.deck',x:2,z:2,rot:0,level:0},{n:2,part:'floor.deck',x:3,z:2,rot:0,level:0}]};
    const saved=store.saveBlueprint('old-owner',{document:JSON.parse(encodeBlueprint(blueprint)),expectedVersion:0});
    store.createObject('old-owner',{planetId:planet.id,objectId:randomUUID(),kind:'structure',position:localToDir({dir:SPAWN,yaw:0},10,[-4,0,0]),rotation:0,blueprintHash:saved.hash});
  }
  return {store,planetId:planet.id};
}

it('preserves original objects, labels, groups, owners, ships, quests and immutable history and assigns historical radius epochs',()=>{
  const {store,planetId}=legacy(':memory:',true),oldHead=store.historyPage('old-owner',planetId).head;
  const preserved=['planet_objects','blueprint_contents','blueprint_library','player_ships','visits','history_events','history_heads','history_snapshots','home_manifests','home_interiors'];
  const before=Object.fromEntries(preserved.map(name=>[name,table(store,name)]));
  // Use a legal surface point outside the synthetic floor for the owner.
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(localToDir({dir:SPAWN,yaw:0},10,[4,0,0])),'old-owner');
  store.db.prepare('DELETE FROM ground_states WHERE player_id=?').run('old-owner');
  const plan=previewIntegration(store.db);expect(plan.report.risks).toEqual([]);applyIntegration(store.db,plan.report.sourceDigest);
  for(const name of preserved)expect(table(store,name),name).toEqual(before[name]);
  expect(store.historySnapshot('old-owner',planetId,oldHead).radius).toBe(10);
  expect(store.db.prepare('SELECT count(*) AS n FROM planets WHERE world_radius=21.6').get()!.n).toBe(store.db.prepare('SELECT count(*) AS n FROM planets').get()!.n);
  store.createObject('old-owner',{planetId,objectId:randomUUID(),kind:'flowers',position:localToDir({dir:SPAWN,yaw:0},21.6,[6,0,0]),rotation:0});
  expect(store.historySnapshot('old-owner',planetId,oldHead+1).radius).toBe(21.6);
  expect(store.historySnapshot('old-owner',planetId,oldHead).radius).toBe(10);
});

it.each([false,true])('preserves metre-relative support and airborne momentum across radius changes (airborne=%s)',airborne=>{
  const {store,planetId}=legacy(':memory:',true),view=store.universe('old-owner').currentPlanet,object=view.objects[0],parts=view.blueprints![object.blueprintHash!];
  const oldWorld=new GroundWorld(view),oldBase=structureFit(parts,object.position,object.rotation,oldWorld.field).baseRadius;
  const position=localToDir({dir:object.position,yaw:object.rotation},oldBase,[.15,0,.12]);
  const support=oldWorld.support(position,oldBase+.3),pose:GroundPose={position,radius:support.radius+(airborne?.65:0),grounded:!airborne,verticalSpeed:airborne?2.4:0,jumpHeld:airborne};
  expect(support.objectId).toBe(object.id);expect(oldWorld.blocked(pose)).toBe(false);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(position),'old-owner');
  store.db.prepare('UPDATE ground_states SET position=?,radius=?,grounded=?,vertical_speed=?,jump_held=?,sequence=9 WHERE player_id=?').run(JSON.stringify(position),pose.radius,Number(pose.grounded),pose.verticalSpeed,Number(airborne),'old-owner');
  const local=(point:GroundPose,base:number)=>quatRotate(quatConjugate(anchorQuaternion({dir:object.position,yaw:object.rotation})),sub(scale(point.position,point.radius),scale(object.position,base)));
  const oldLocal=local(pose,oldBase),plan=previewIntegration(store.db);expect(plan.report.risks).toEqual([]);expect(plan.report.structurePoses).toBe(1);
  applyIntegration(store.db,plan.report.sourceDigest);
  const player=store.state('old-owner'),next=store.universe('old-owner').currentPlanet,nextWorld=new GroundWorld(next),nextBase=structureFit(parts,object.position,object.rotation,nextWorld.field).baseRadius;
  const current:GroundPose={position:player.position,...player.ground!},nextLocal=local(current,nextBase);
  expect(nextLocal[0]).toBeCloseTo(oldLocal[0],4);expect(nextLocal[2]).toBeCloseTo(oldLocal[2],4);
  expect(current.verticalSpeed).toBe(pose.verticalSpeed);expect(current.jumpHeld).toBe(airborne);expect(current.grounded).toBe(!airborne);expect(player.ground!.sequence).toBe(10);
  expect(nextWorld.blocked(current)).toBe(false);
  expect(player.planetId).toBe(planetId);
});

it('blocks an unsafe saved flight atomically and rejects stale plans without any writes',()=>{
  const {store,planetId}=legacy(),planet=store.universe('old-owner').planets.find(p=>p.id===planetId)!,center=planetCenter(planet.slot);
  store.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify({mode:'space',journey:4,position:[center[0]+18,center[1],center[2]],yaw:0,pitch:0,speed:0,sequence:2,targetId:planetId}),'old-owner');
  const plan=previewIntegration(store.db),before=integrationTableDigest(store.db);expect(plan.report.risks.some(risk=>risk.kind==='flight-clearance')).toBe(true);
  expect(()=>applyIntegration(store.db,plan.report.sourceDigest)).toThrow('blocked');expect(integrationTableDigest(store.db)).toEqual(before);
  store.db.prepare('UPDATE players SET flight=NULL WHERE id=?').run('old-owner');
  const safe=previewIntegration(store.db);expect(safe.report.canApply).toBe(true);
  store.db.prepare("UPDATE players SET character='fern' WHERE id=?").run('old-owner');const changed=integrationTableDigest(store.db);
  expect(()=>applyIntegration(store.db,safe.report.sourceDigest)).toThrow('stale');expect(integrationTableDigest(store.db)).toEqual(changed);
});

it('reopens an explicitly migrated normal database without generating homes for old identities, and repeats as a no-op',()=>{
  const path=join(temp(),'world.sqlite'),{store,planetId}=legacy(path),old=store.state('old-owner');
  const oldHub=store.create('old-hub');
  const plan=previewIntegration(store.db);applyIntegration(store.db,plan.report.sourceDigest);const before=integrationTableDigest(store.db);store.close();
  const again=openStore(path,{integratedWorld:true});stores.push(again);
  expect(integrationTableDigest(again.db)).toEqual(before);expect(again.integratedWorld).toBe(true);expect(again.homeSample).toBe(false);
  const state=again.state('old-owner');expect(state).toMatchObject({planetId,quest:old.quest,character:old.character,worldRadius:21.6,home:null});expect(state.position).toEqual(old.position);
  const hub=again.state('old-hub');expect(hub.ground!.sceneRevision).toBe(1000+SAMPLE_PUBLIC_VERSION);expect(hub.ground!.sequence).toBe(oldHub.ground!.sequence+1);
  expect(state.ground!.sceneRevision).toBe(Number(again.db.prepare('SELECT revision FROM planets WHERE id=?').get(planetId)!.revision));
  expect(integrationTableDigest(again.db)).toEqual(before);
  expect(table(again,'home_manifests')).toEqual([]);expect(table(again,'home_interiors')).toEqual([]);
  const repeated=previewIntegration(again.db),current=integrationTableDigest(again.db);applyIntegration(again.db,repeated.report.sourceDigest);expect(integrationTableDigest(again.db)).toEqual(current);
});

it('refuses unmigrated main startup before changing its database and prevents report/database path collisions',()=>{
  const dir=temp(),source=join(dir,'old.sqlite'),store=connect(source);store.create('old');store.close();const bytes=readFileSync(source);
  expect(()=>openStore(source,{integratedWorld:true})).toThrow('explicit');expect(readFileSync(source)).toEqual(bytes);
  const destination=join(dir,'copy.sqlite');
  const result=spawnSync(process.execPath,['scripts/integration-migrate-copy.ts','--source',source,'--destination',destination,'--report',source,'--apply'],{encoding:'utf8'});
  expect(result.status).not.toBe(0);expect(result.stderr).toContain('Report must be a new separate file');expect(readFileSync(source)).toEqual(bytes);
});

it('applies to a fresh copy, verifies every original table and restores from the unchanged source',()=>{
  const dir=temp(),source=join(dir,'old.sqlite'),{store}=legacy(source),original=integrationTableDigest(store.db);store.close();
  const bytes=readFileSync(source),destination=join(dir,'migrated.sqlite'),report=join(dir,'report.json');
  const result=spawnSync(process.execPath,['scripts/integration-migrate-copy.ts','--source',source,'--destination',destination,'--report',report,'--apply'],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);const audit=JSON.parse(readFileSync(report,'utf8'));
  expect(audit).toMatchObject({status:'applied-to-isolated-copy',sourceUnchanged:true,restoreMatchesAllOriginalTables:true,reopenEqual:true,savedPoseReadsStable:true});
  expect(Object.values(audit.comparison).every((table:unknown)=>(table as {protectedEqual:boolean}).protectedEqual)).toBe(true);
  expect(readFileSync(source)).toEqual(bytes);
  const restored=join(dir,'independent-restore.sqlite');copyFileSync(source,restored);const restoredDb=new DatabaseSync(restored,{readOnly:true});expect(integrationTableDigest(restoredDb)).toEqual(original);restoredDb.close();
});
