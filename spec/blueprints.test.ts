import { expect, it, inject } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint, blueprintHash } from '../src/assets/claude-geometry/blueprint/codec.ts';
import type { Blueprint } from '../src/assets/claude-geometry/blueprint/model.ts';
import { normalize, SPAWN } from '../src/shared/world.ts';
import { MAX_BLUEPRINTS } from '../src/shared/blueprints.ts';
import type { LibraryEntry } from '../src/shared/blueprints.ts';
import type { Universe } from '../src/shared/planets.ts';
const documentOf=(bp:Blueprint)=>JSON.parse(encodeBlueprint(bp));
function setup(){const s=openStore(':memory:');s.create('owner');s.create('visitor');const p=s.universe('owner').planets.find(p=>p.kind==='garden')!;s.claim('owner',p.id);s.visit('owner',p.id);s.visit('visitor',p.id);return {s,p};}
it('saves complete private metadata, canonical hashes, retries and optimistic version conflicts',async()=>{
  const {s}=setup();try{
    const bp=industrialCabin();bp.name='Private name';bp.groups=[{name:'Cabin shell',members:[1,2,3,4]}];
    const body={document:documentOf(bp),expectedVersion:0};const a=s.saveBlueprint('owner',body);
    expect(a.hash).toBe(await blueprintHash(bp));expect(a.version).toBe(1);
    expect(s.saveBlueprint('owner',body)).toEqual(a);expect(s.library('owner')[0].blueprint.groups).toEqual(bp.groups);
    expect(s.library('visitor')).toEqual([]);expect(()=>s.saveBlueprint('visitor',body)).toThrow('Claim');
    bp.name='Renamed';const renamed=s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:1});
    expect(renamed.hash).toBe(a.hash);expect(renamed.version).toBe(2);
    bp.name='Stale draft';expect(()=>s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:1})).toThrow('another tab');
    expect(s.library('owner')[0].blueprint.name).toBe('Renamed');
    expect(s.db.prepare('SELECT count(*) AS n FROM blueprint_contents').get()!.n).toBe(1);
  }finally{s.close();}
});
it('rejects malformed parts, unknown fields, empty layouts, oversized metadata and library overflow',()=>{
  const {s}=setup();try{
    const bp=industrialCabin(),doc=documentOf(bp);
    for(const patch of [{ownerId:'visitor'}, {expectedVersion:-1}, {expectedVersion:1.5}, {document:{...doc,parts:[]}}, {document:{...doc,parts:[{...bp.parts[0],x:NaN}]}}, {document:{...doc,parts:[{...bp.parts[0],owner:'forged'}]}}, {document:{...doc,parts:[{...bp.parts[0],part:'unknown'}]}}, {document:{...doc,groups:[{name:'bad',members:[1,999]}]}}, {document:{...doc,name:'x'.repeat(70_000)}}])
      expect(()=>s.saveBlueprint('owner',{document:doc,expectedVersion:0,...patch})).toThrow();
    for(let i=0;i<MAX_BLUEPRINTS;i++){bp.id=randomUUID() as Blueprint['id'];s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:0});}
    bp.id=randomUUID() as Blueprint['id'];expect(()=>s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:0})).toThrow('24');
  }finally{s.close();}
});
it('places immutable, grounded structures; visitors see geometry only and all writes are fenced',()=>{
  const {s,p}=setup();try{
    const bp=industrialCabin();bp.name='Secret name';bp.groups=[{name:'Secret group',members:[1,2]}];
    const entry=s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:0});
    const body={planetId:p.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:normalize([.55,1,.4]),rotation:0};
    expect(()=>s.createObject('visitor',body)).toThrow('Only');
    expect(()=>s.createObject('owner',{...body,position:SPAWN})).toThrow('landing');
    expect(()=>s.createObject('owner',{...body,radius:.001})).toThrow('Unexpected');
    s.createObject('owner',body);s.createObject('owner',body);
    const u=s.universe('visitor');expect(u.currentPlanet.objects).toHaveLength(1);expect(u.currentPlanet.blueprints![entry.hash]).toEqual(bp.parts);
    expect(JSON.stringify(u)).not.toMatch(/Secret|owner_id|moved_at|flight_at|document|members/);
    expect(()=>s.createObject('owner',{...body,objectId:randomUUID()})).toThrow('too close');
    const update={planetId:p.id,objectId:body.objectId,position:body.position,rotation:1,expectedVersion:1};
    expect(()=>s.updateObject('visitor',update)).toThrow('Only');s.updateObject('owner',update);s.updateObject('owner',update);
    expect(()=>s.updateObject('owner',{...update,rotation:2})).toThrow('another tab');
    // Editing the library doesn't rewrite already placed content or break creation retries.
    bp.parts=bp.parts.filter(x=>x.part!=='roof.plant');s.saveBlueprint('owner',{document:documentOf(bp),expectedVersion:1});
    expect(s.universe('visitor').currentPlanet.objects[0].blueprintHash).toBe(entry.hash);
    const remove={planetId:p.id,objectId:body.objectId,expectedVersion:2};expect(()=>s.removeObject('visitor',remove)).toThrow('Only');
    s.removeObject('owner',remove);s.removeObject('owner',remove);expect(()=>s.createObject('owner',body)).toThrow('removed');
  }finally{s.close();}
});
it('owner cannot place another library’s hash even if its public geometry is known',()=>{
  const {s,p}=setup();try{
    const entry=s.saveBlueprint('owner',{document:documentOf(industrialCabin()),expectedVersion:0});
    const other=s.universe('visitor').planets.find(x=>x.kind==='garden'&&!x.claimed)!;s.claim('visitor',other.id);
    expect(()=>s.createObject('visitor',{planetId:other.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:normalize([.55,1,.4]),rotation:0})).toThrow('own saved library');
    expect(s.universe('owner').currentPlanet.id).toBe(p.id);
  }finally{s.close();}
});
it('HTTP applies route-specific byte limits, cookies, same-origin checks and concurrent save versions',async()=>{
  const base=inject('baseUrl');const response=await fetch(base+'/api/state');const cookie=response.headers.get('set-cookie')!.split(';')[0];
  const headers={Cookie:cookie,'Content-Type':'application/json'};
  const get=(route:string)=>fetch(base+'/api/'+route,{headers});
  const post=(route:string,body:unknown,extra={})=>fetch(base+'/api/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  const u=await (await get('universe')).json() as Universe;const planet=u.planets.find(x=>x.kind==='garden'&&!x.claimed)!;
  expect((await post('planets/claim',{planetId:planet.id})).status).toBe(200);
  const bp=industrialCabin();bp.groups=[{name:'Detailed shell with doors and windows',members:bp.parts.slice(0,12).map(p=>p.n)},{name:'Columns and upper level roof modules',members:bp.parts.slice(12).map(p=>p.n)}];const body={document:documentOf(bp),expectedVersion:0};expect(JSON.stringify(body).length).toBeGreaterThan(2048);
  expect((await post('blueprints/save',body,{Origin:'https://other.invalid'})).status).toBe(403);
  expect((await post('blueprints/save',body)).status).toBe(200);
  const a={...documentOf(bp),name:'Revision A'},b={...documentOf(bp),name:'Revision B'};
  const race=await Promise.all([post('blueprints/save',{document:a,expectedVersion:1}),post('blueprints/save',{document:b,expectedVersion:1})]);
  expect(race.map(x=>x.status).sort()).toEqual([200,409]);
  const library=await (await get('blueprints')).json() as LibraryEntry[];expect(library[0].version).toBe(2);
  expect((await post('blueprints/save',{document:'x'.repeat(66_000),expectedVersion:0})).status).toBe(413);
  expect((await post('objects/create',{padding:'x'.repeat(3000)})).status).toBe(413);
  expect((await fetch(base+'/api/blueprints')).status).toBe(401);
  expect((await fetch(base+'/api/blueprints/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(401);
});

it('backs up v4, preserves every old column and reopens blueprints and placements from disk',()=>{
  const dir=mkdtempSync(join(tmpdir(),'workshop-migration-')),path=join(dir,'world.sqlite');let s=openStore(path);
  try{
    s.create('legacy-owner');s.character('legacy-owner','sky');const p=s.universe('legacy-owner').planets.find(p=>p.kind==='garden')!;
    s.claim('legacy-owner',p.id);s.visit('legacy-owner',p.id);s.createObject('legacy-owner',{planetId:p.id,objectId:randomUUID(),kind:'tree',position:normalize([-.6,1,.4]),rotation:1});
    s.db.prepare("UPDATE players SET quest='carrying',flight=? WHERE id='legacy-owner'").run(JSON.stringify(s.state('legacy-owner').flight));s.close();
    // Build a schema-4 fixture with the released object's original six columns.
    const old=new DatabaseSync(path);old.exec(`CREATE TABLE old_objects (id TEXT PRIMARY KEY,planet_id TEXT NOT NULL REFERENCES planets(id),kind TEXT NOT NULL CHECK(kind IN ('cottage','tree','path','flowers','bench','lamp')),position TEXT NOT NULL,rotation REAL NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      INSERT INTO old_objects SELECT id,planet_id,kind,position,rotation,version FROM planet_objects;
      DROP TABLE planet_objects;ALTER TABLE old_objects RENAME TO planet_objects;CREATE INDEX objects_by_planet ON planet_objects(planet_id);
      DROP TABLE blueprint_library;DROP TABLE blueprint_contents;PRAGMA user_version=4;`);
    const tables=['players','planets','planet_objects','visits','object_tombstones'];const baseline=tables.map(table=>({table,columns:old.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).join(','),rows:old.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()}));old.close();
    s=openStore(path);expect(s.migrationBackup).not.toBeNull();
    const backup=new DatabaseSync(s.migrationBackup!);expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(4);backup.close();
    for(const b of baseline)expect(s.db.prepare(`SELECT ${b.columns} FROM ${b.table} ORDER BY rowid`).all()).toEqual(b.rows);
    expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const bp=industrialCabin();bp.groups=[{name:'Saved shell',members:[1,2,3]}];const entry=s.saveBlueprint('legacy-owner',{document:documentOf(bp),expectedVersion:0});
    const body={planetId:p.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:normalize([.55,1,.4]),rotation:0};s.createObject('legacy-owner',body);
    const state=s.universe('legacy-owner');s.close();s=openStore(path);expect(s.migrationBackup).toBeNull();expect(s.library('legacy-owner')).toEqual([entry]);expect(s.universe('legacy-owner')).toEqual(state);
    s.createObject('legacy-owner',body);expect(s.universe('legacy-owner')).toEqual(state);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
