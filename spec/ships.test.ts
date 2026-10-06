import { expect, it, inject } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/server/store.ts';
import { STARTERS, encodeShipDesign } from '../src/assets/claude-geometry/ship/design.ts';
import { createShipModel, envelopeProblems } from '../src/assets/claude-geometry/ship/factory.ts';
import { SHIP_ENVELOPE } from '../src/assets/claude-geometry/ship/spec.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { ResourceTracker } from '../src/assets/claude-geometry/core/dispose.ts';
import { defaultShip } from '../src/shared/ships.ts';
import { SAFE_RADIUS } from '../src/shared/flight.ts';
import { RADIUS, normalize } from '../src/shared/world.ts';
import { HUB_DOCK } from '../src/shared/ports.ts';
const body=(index=1,version=0)=>({document:encodeShipDesign(STARTERS[index]),version});
it('keeps private ships isolated, retries idempotent, stale tabs rejected and in-flight changes fenced',()=>{
 const s=openStore(':memory:');try{
 s.create('owner',0);s.create('visitor',0);const before=s.state('owner');const saved=s.saveShip('owner',body());
 expect(saved.ship).toEqual({design:STARTERS[1],version:1});expect(saved.revision).toBe(before.revision+1);
 expect(s.saveShip('owner',body())).toEqual(saved);expect(s.state('visitor').ship).toEqual(defaultShip());
 expect(()=>s.saveShip('owner',body(2))).toThrow('another tab');
 for(const invalid of [{...body(),owner:'visitor'}, {...body(),version:-1},{...body(),version:.5},{...body(),document:{...JSON.parse(body().document),parts:{...STARTERS[0].parts,hull:'invented'}}}])expect(()=>s.saveShip('owner',invalid)).toThrow();
 expect(s.state('owner')).toEqual(saved);
 s.move('owner',normalize([0,1,-.2]),2000,'hub');s.move('owner',HUB_DOCK,4000,'hub');s.takeoff('owner',{planetId:'hub',journey:0},4000);
 expect(()=>s.saveShip('owner',body(2,1))).toThrow('Land');expect(s.saveShip('owner',body()).ship).toEqual(saved.ship);
 }finally{s.close();}
});
it('backs up schema 6 without changing existing rows and keeps saved designs across reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ship-save-')),path=join(dir,'save.sqlite');let s=openStore(path);
 try{
 s.create('owner');s.character('owner','fern');const tables=['players','planets','visits','planet_objects','ground_states'];
 const rows=Object.fromEntries(tables.map(t=>[t,s.db.prepare(`SELECT * FROM ${t}`).all()]));
 s.db.exec('DROP TABLE player_ships;PRAGMA user_version=6;');s.close();s=openStore(path);
 expect(existsSync(s.migrationBackup!)).toBe(true);const backup=new DatabaseSync(s.migrationBackup!);expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(6);backup.close();
 for(const table of tables)expect(s.db.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows[table]);
 const saved=s.saveShip('owner',body(2));s.close();s=openStore(path);expect(s.state('owner')).toEqual(saved);expect(s.migrationBackup).toBeNull();
 }finally{s.close();rmSync(dir,{recursive:true});}
});
it('uses the unchanged model envelope inside existing flight clearance and releases owned resources',()=>{
 const lib=new StyleLibrary('medium');
 try{for(const design of STARTERS){const ship=createShipModel(design,lib,'medium');const tracked=new ResourceTracker().track(ship.object);expect(envelopeProblems(ship,SHIP_ENVELOPE)).toEqual([]);expect(ship.radius).toBeLessThan(SAFE_RADIUS-RADIUS);ship.setThrust(1);expect(ship.effects.plumeMesh?.visible).toBe(true);ship.setThrust(0);expect(ship.effects.plumeMesh?.visible).toBe(false);ship.dispose();ship.dispose();expect(ship.disposed).toBe(true);expect(tracked.counts().geometries).toBe(0);}}
 finally{lib.dispose();}
});
it('derives the ship owner from the HTTP cookie and rejects unauthenticated, foreign-origin and oversized writes',async()=>{
 const base=inject('baseUrl');const session=async()=>{const r=await fetch(base+'/api/state');return r.headers.get('set-cookie')!.split(';')[0];};const a=await session(),b=await session();
 const save=(cookie:string,content:unknown,origin?:string)=>fetch(base+'/api/ship/save',{method:'POST',headers:{cookie,'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(content)});
 expect((await save(a,body())).status).toBe(200);expect((await save('',body())).status).toBe(401);expect((await save(a,body(),'https://untrusted.invalid')).status).toBe(403);
 expect((await save(b,{...body(),playerId:a})).status).toBe(400);expect((await save(b,{...body(),document:'x'.repeat(3000)})).status).toBe(413);
 const state=await(await fetch(base+'/api/state',{headers:{cookie:b}})).json();expect(state.ship).toEqual(defaultShip());
});
it('replacing the parked/flight adapter preserves its transform and releases each old model and paint lease',async()=>{
 const {makeShip}=await import('../src/client/ship-model.ts');const {worldMaterials}=await import('../src/client/shared-assets.ts');
 const ship=makeShip();ship.root.position.set(3,4,5);ship.root.rotation.set(.1,.2,.3);const matrix=ship.root.matrix.clone();ship.root.updateMatrix();matrix.copy(ship.root.matrix);
 for(let n=0;n<6;n++){const tracked=new ResourceTracker().track(ship.root);ship.setDesign({...STARTERS[n%3],name:'Replacement '+n});expect(tracked.counts().geometries).toBe(0);ship.root.updateMatrix();expect(ship.root.matrix.equals(matrix)).toBe(true);expect(worldMaterials().stats().paints).toBeLessThanOrEqual(3);}
 ship.dispose();ship.dispose();expect(worldMaterials().stats().paints).toBe(0);expect(worldMaterials().stats().presets).toBeGreaterThan(0);
});
