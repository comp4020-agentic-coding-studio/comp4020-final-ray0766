import {HOME_GENERATOR_VERSION} from '../src/shared/home-generation.ts';
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/server/store.ts';
import { presenceStore } from '../src/server/presence.ts';
import { HOME_EXIT, HOME_ROOM } from '../src/shared/home.ts';
import { decodeSnapshot } from '../src/shared/timeline-codec.ts';
import { SPAWN } from '../src/shared/world.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import { homeVariant, samplePoint } from '../src/shared/home-layout.ts';

const stores:ReturnType<typeof openStore>[]=[];
const dirs:string[]=[];
const sample=()=>{const s=openStore(':memory:',{homeSample:true});stores.push(s);s.create('owner');return s;};
const enter=(s:ReturnType<typeof openStore>,id='owner')=>{const p=s.state(id);return s.enterHome(id,{planetId:p.planetId,buildingId:p.home!.buildingId,visitEpoch:p.location!.visitEpoch});};
// Existing saved indoor guests keep a safe exit after owner-only entry ships.
function legacyVisitorInside(s:ReturnType<typeof openStore>,id='visitor'){
 const p=s.state(id),h=p.home!,loc={kind:'interior',planetId:p.planetId,buildingId:h.buildingId,interiorId:h.interiorId,position:[0,0,h.interior.room.depth/2-1],yaw:Math.PI,sequence:0,visitEpoch:p.location!.visitEpoch+1};
 s.db.prepare('UPDATE home_locations SET document=? WHERE player_id=?').run(JSON.stringify(loc),id);return s.universe(id);
}
afterEach(()=>{for(const s of stores.splice(0)){try{s.close();}catch{ /* already closed to test reopening */ }}for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});

it('starts an isolated sample at its sole home and never regenerates its persisted manifest',()=>{
  const s=sample(),u=s.universe('owner');expect(u.player.worldRadius).toBe(21.6);expect(u.planets.every(p=>p.radius===21.6)).toBe(true);
  const structures=u.currentPlanet.objects.filter(o=>o.kind==='structure');
  expect(structures.length).toBeGreaterThanOrEqual(2);expect(structures.length).toBeLessThanOrEqual(4);
  expect(u.currentPlanet.homeManifest).toMatchObject({generator:'home-neighbourhood',version:HOME_GENERATOR_VERSION});
  expect(u.player.home).toMatchObject({canEdit:true,buildingVersion:1,variant:'custom',interior:{room:HOME_ROOM}});
  const before=s.db.prepare('SELECT document,hash FROM home_manifests').all();s.claim('owner',u.ownedPlanetId);expect(s.db.prepare('SELECT document,hash FROM home_manifests').all()).toEqual(before);
  expect(()=>s.claim('owner',u.planets.find(p=>p.kind==='garden'&&!p.mine)!.id)).toThrow('already');
  expect(s.state('owner').position).toEqual(s.state('owner').home!.door.position);
});

it('requires the paired entrance and persists flat positions across reopen without touching exterior position',()=>{
  const dir=mkdtempSync(join(tmpdir(),'home-save-'));dirs.push(dir);const path=join(dir,'sample.sqlite');
  const s=openStore(path,{homeSample:true});stores.push(s);s.create('owner');const outside=s.state('owner');
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(SPAWN),'owner');expect(()=>enter(s)).toThrow('closer');
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(outside.position),'owner');enter(s);
  const at=s.state('owner').location!;expect(at.kind).toBe('interior');
  s.moveHome('owner',{buildingId:outside.home!.buildingId,visitEpoch:at.visitEpoch,sequence:1,position:[.4,0,.8],yaw:.7},Date.now()+1000);
  const saved=s.state('owner');expect(saved.position).toEqual(outside.position);expect(saved.ground).toBeUndefined();s.close();
  const again=openStore(path,{homeSample:true});stores.push(again);expect(again.state('owner')).toEqual(saved);
  expect(again.state('owner').home!.interiorId).toBe(outside.home!.interiorId);expect(again.migrationBackup).toBeNull();
});

it('rejects stale surface and indoor actions; furniture and walls block walking, matching retries are idempotent',()=>{
  const s=sample(),outside=s.state('owner');enter(s);const at=s.state('owner').location!,id=outside.home!.buildingId;
  expect(()=>s.move('owner',outside.position,Date.now(),outside.planetId,undefined,outside.location!.visitEpoch)).toThrow('Leave');
  expect(()=>s.takeoff('owner',{planetId:outside.planetId,journey:0,visitEpoch:outside.location!.visitEpoch})).toThrow('Leave');
  expect(()=>s.flight('owner',{visitEpoch:outside.location!.visitEpoch})).toThrow('Leave');
  expect(()=>s.moveHome('owner',{buildingId:id,visitEpoch:at.visitEpoch,sequence:1,position:[0,0,20],yaw:0},Date.now()+1000)).toThrow('blocks');
  expect(()=>s.moveHome('owner',{buildingId:id,visitEpoch:at.visitEpoch,sequence:1,position:outside.home!.interior.items.find(item=>item.id==='table')!.position,yaw:0},Date.now()+1000)).toThrow('blocks');
  const body={buildingId:id,visitEpoch:at.visitEpoch,sequence:1,position:HOME_EXIT,yaw:0};s.moveHome('owner',body,Date.now()+1000);const accepted=s.state('owner');s.moveHome('owner',body,Date.now()+1001);expect(s.state('owner')).toEqual(accepted);
  s.exitHome('owner',{buildingId:id,visitEpoch:at.visitEpoch});
  expect(()=>s.moveHome('owner',{...body,sequence:2},Date.now()+2000)).toThrow('changed');
  expect(()=>s.move('owner',outside.position,Date.now(),outside.planetId,undefined,outside.location!.visitEpoch)).toThrow('changed');
});

it('rejects every exterior editing route indoors before any persistent write',()=>{
  const s=sample();enter(s);
  const before=Number(s.db.prepare('SELECT total_changes() AS n').get()!.n);
  const snapshot=s.universe('owner');
  for(const method of ['terrain','createObject','updateObject','removeObject','replaceObject','undoObject','remodelHome','undoHome'] as const){
    expect(()=>s[method]('owner',{}),method).toThrow('Leave your home');
  }
  expect(Number(s.db.prepare('SELECT total_changes() AS n').get()!.n)).toBe(before);
  expect(s.universe('owner')).toEqual(snapshot);
});

it('keeps visitors read-only, validates furniture clearances and scopes presence to the same home',()=>{
  const s=sample();s.create('visitor');const owner=s.state('owner'),h=owner.home!,presence=presenceStore(s.state);s.visit('visitor',owner.planetId);
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(owner.position),'visitor');enter(s);legacyVisitorInside(s);
  const inside=s.state('owner'),visitor=s.state('visitor');expect(visitor.home!.canEdit).toBe(false);
  const save={buildingId:h.buildingId,expectedVersion:1,material:'sage',items:h.interior.items};
  expect(()=>s.saveHome('visitor',save)).toThrow('Only');s.saveHome('owner',save);expect(s.state('owner').home!.interior.material).toBe('sage');
  expect(()=>s.saveHome('owner',save)).toThrow('another tab');
  expect(()=>s.saveHome('owner',{...save,expectedVersion:2,items:[{id:'block',kind:'table',position:[0,0,1],yaw:0}]})).toThrow('door');
  expect(()=>s.saveHome('owner',{...save,expectedVersion:2,items:[{id:'block',kind:'shelf',position:[HOME_ROOM.width/2+1,0,0],yaw:0}]})).toThrow('inside');
  const beat=(p:typeof inside)=>({planetId:p.planetId,facing:[0,0,-1],scope:'home:'+h.buildingId,visitEpoch:p.location!.visitEpoch});
  presence.heartbeat('owner',beat(inside));const snapshot=presence.heartbeat('visitor',beat(visitor));expect(snapshot.scope).toBe('home:'+h.buildingId);expect(snapshot.visitors).toHaveLength(1);expect(snapshot.visitors[0].position).toEqual(inside.location!.kind==='interior'?inside.location!.position:[]);
  s.exitHome('visitor',{buildingId:h.buildingId,visitEpoch:visitor.location!.visitEpoch});expect(presence.heartbeat('owner',beat(inside)).visitors).toHaveLength(0);
  expect(()=>presence.heartbeat('owner',{planetId:inside.planetId,facing:[0,0,-1],scope:'exterior',visitEpoch:inside.location!.visitEpoch})).toThrow('scope');
});

it('replaces and undoes exterior content under one building id, replays hashes, preserves belongings and exits at the moved door',()=>{
  const s=sample(),old=s.state('owner'),h=old.home!;
  const changed=s.remodelHome('owner',{buildingId:h.buildingId,expectedVersion:1,variant:'terrace'}),updated=changed.player.home!;
  expect(updated.buildingId).toBe(h.buildingId);expect(updated.interior).toEqual(h.interior);expect(updated.interiorId).toBe(h.interiorId);expect(updated.buildingVersion).toBe(2);expect(updated.canUndo).toBe(true);
  const snapshot=s.historySnapshot('owner',old.planetId),decoded=decodeSnapshot(snapshot.document);expect(decoded.ok).toBe(true);if(decoded.ok)expect(decoded.value.objects[h.buildingId].spec).toMatchObject({blueprintHash:changed.currentPlanet.objects.find(o=>o.id===h.buildingId)!.blueprintHash});
  expect(()=>s.removeObject('owner',{planetId:old.planetId,objectId:h.buildingId,expectedVersion:2})).toThrow('belongings');
  s.undoHome('owner',{buildingId:h.buildingId,expectedVersion:2});expect(s.state('owner').home).toMatchObject({buildingId:h.buildingId,variant:h.variant,canUndo:false,buildingVersion:3});
  s.create('visitor');s.visit('visitor',old.planetId);s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(h.door.position),'visitor');legacyVisitorInside(s);
  // Relocate onto clear ground: rotating in the compact street now correctly
  // conflicts with its neighbouring paving and is not a valid movement fixture.
  s.updateObject('owner',{planetId:old.planetId,objectId:h.buildingId,position:samplePoint(21.6,10,5),rotation:.1,expectedVersion:3});
  const latest=s.state('visitor'),newDoor=latest.home!.door.position;expect(newDoor).not.toEqual(h.door.position);
  s.exitHome('visitor',{buildingId:h.buildingId,visitEpoch:latest.location!.visitEpoch});expect(s.state('visitor').position).toEqual(newDoor);expect(s.state('owner').home!.interior).toEqual(h.interior);
},10000); // Two fully validated generated worlds plus remodel/history replays.

it('reuses preset content without overwriting user library names, groups or edited documents',()=>{
  const s=sample(),buildingId=s.state('owner').home!.buildingId;
  s.remodelHome('owner',{buildingId,expectedVersion:1,variant:'terrace'});
  const preset=s.library('owner').find(e=>e.hash===s.universe('owner').currentPlanet.objects.find(o=>o.id===buildingId)!.blueprintHash)!;
  const personal={...preset.blueprint,name:'My saved porch',groups:[{name:'Keep my doorway label',members:preset.blueprint.parts.slice(0,2).map(p=>p.n)}]};
  s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(personal)),expectedVersion:preset.version});
  const rows=()=>s.db.prepare('SELECT * FROM blueprint_library WHERE owner_id=? ORDER BY rowid').all('owner');
  const annotated=rows();
  s.remodelHome('owner',{buildingId,expectedVersion:2,variant:'base'});
  s.remodelHome('owner',{buildingId,expectedVersion:3,variant:'terrace'});
  expect(rows()).toEqual(annotated);

  // Reusing a preset's former library id must also preserve changed geometry.
  const edited={...personal,parts:homeVariant('roof').parts};
  s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(edited)),expectedVersion:2});
  const customized=rows();
  s.remodelHome('owner',{buildingId,expectedVersion:4,variant:'base'});
  s.remodelHome('owner',{buildingId,expectedVersion:5,variant:'terrace'});
  expect(rows().slice(0,customized.length)).toEqual(customized);
  expect(rows()).toHaveLength(customized.length+1);
  expect(rows().at(-1)!.id).not.toBe(preset.blueprint.id);
});

it('checks the exterior version before touching the library and rolls back a preset append if replacement fails',()=>{
  const s=sample(),h=s.state('owner').home!,body={buildingId:h.buildingId,expectedVersion:1,variant:'extended'};
  const rows=()=>s.db.prepare('SELECT * FROM blueprint_library ORDER BY rowid').all();
  const before=rows(),changes=Number(s.db.prepare('SELECT total_changes() AS n').get()!.n);
  expect(()=>s.remodelHome('owner',{...body,expectedVersion:2})).toThrow('another tab');
  expect(Number(s.db.prepare('SELECT total_changes() AS n').get()!.n)).toBe(changes);
  const state=s.universe('owner'),contents=s.db.prepare('SELECT * FROM blueprint_contents ORDER BY hash').all();
  s.db.exec("CREATE TRIGGER home_fail_replace BEFORE INSERT ON history_events BEGIN SELECT RAISE(ABORT,'injected replacement failure'); END;");
  expect(()=>s.remodelHome('owner',body)).toThrow('injected replacement failure');
  expect(rows()).toEqual(before);
  expect(s.db.prepare('SELECT * FROM blueprint_contents ORDER BY hash').all()).toEqual(contents);
  expect(s.universe('owner')).toEqual(state);
});

it('refuses an existing normal save before WAL or schema changes; normal migrations retain dimensions and back up',()=>{
  const dir=mkdtempSync(join(tmpdir(),'home-legacy-'));dirs.push(dir);const path=join(dir,'normal.sqlite');
  const s=openStore(path);s.create('owner');const before=s.universe('owner');s.db.exec('PRAGMA user_version=13');s.close();
  expect(()=>openStore(path,{homeSample:true})).toThrow('before migration');
  const probe=new DatabaseSync(path,{readOnly:true});expect(probe.prepare('PRAGMA user_version').get()!.user_version).toBe(13);probe.close();
  const upgraded=openStore(path);stores.push(upgraded);expect(upgraded.migrationBackup&&existsSync(upgraded.migrationBackup)).toBe(true);expect(upgraded.universe('owner')).toEqual(before);
});
