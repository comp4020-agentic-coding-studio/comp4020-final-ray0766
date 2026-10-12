import {expect,it} from 'vitest';
import {samplePublicVillage,SAMPLE_PUBLIC_VERSION} from '../src/shared/sample-public-village.ts';
import {PUBLIC_TOWN_VERSION} from '../src/shared/public-town-layout.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS} from '../src/shared/public-village.ts';
import {NPCS,SPAWN,distance} from '../src/shared/world.ts';
import {HUB_DOCK,canBoard} from '../src/shared/ports.ts';
import {openStore} from '../src/server/store.ts';
import {planetStore} from '../src/server/planets.ts';
import {groundStore} from '../src/server/ground.ts';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';

const village=samplePublicVillage();
it('retains the landing, delivery and harbour bearings within the whole-sphere public template',()=>{
 expect(village.version).toBe(SAMPLE_PUBLIC_VERSION);expect(SAMPLE_PUBLIC_VERSION).toBe(PUBLIC_TOWN_VERSION);expect(SAMPLE_PUBLIC_VERSION).toBe(13);
 expect(village.radius).toBe(21.6);expect(village.destinations.map(d=>d.id)).toEqual(['post','orchard','harbour']);
 expect(village.destinations.map(d=>d.position)).toEqual([NPCS.mica.position,NPCS.sol.position,HUB_DOCK]);
 for(const destination of village.destinations){
  const building=village.objects.find(o=>o.id===destination.buildingId)!;
  // v12: the post office, glasshouse and harbour store face their destination across a short forecourt.
  expect(building).toBeDefined();expect(distance(building.position,destination.position,village.radius)).toBeLessThan(7);
 }
 for(const id of ['public-post','public-orchard','public-harbour']){
  const route=village.routes.find(r=>r.id===id);
  expect(route,`Missing preserved task route ${id}`).toBeDefined();expect(route!.points[0]).toEqual(SPAWN);
 }
 expect(canBoard('hub',HUB_DOCK,village.radius)).toBe(true);
});
it('keeps old harbour geometry and private database rows separate from the current public projection',()=>{
 const legacy=new GroundWorld({id:'hub',radius:14,revision:0,objects:[]});
 expect(legacy.bodies.map(b=>b.objectId)).toContain(HUB_OBJECTS[0].id);
 expect(legacy.bodies.map(b=>b.objectId)).not.toContain(village.objects[0].id);
 expect(Object.keys(PUBLIC_CONTENTS)).toHaveLength(3);
 const store=openStore(':memory:');
 try{
  store.create('legacy-public');const before=store.state('legacy-public').ground!;
  store.db.prepare("UPDATE planets SET sample_radius=21.6 WHERE id='hub'").run();
  const rowBefore=store.db.prepare("SELECT * FROM planets WHERE id='hub'").get();
  const planets=planetStore(store.db,undefined,undefined,21.6),hub=planets.view('legacy-public','hub');
  expect(hub.radius).toBe(21.6);expect(hub.environment).toBe(village.environment);expect(hub.revision).toBe(1000+SAMPLE_PUBLIC_VERSION);
  const restored=groundStore(store.db,planets).read('legacy-public');
  expect(restored.sceneRevision).toBe(1000+SAMPLE_PUBLIC_VERSION);expect(restored.sequence).toBeGreaterThan(before.sequence);
  expect(restored.radius).toBeGreaterThan(21);
  expect(store.db.prepare("SELECT * FROM planets WHERE id='hub'").get()).toEqual(rowBefore);
 }finally{store.close();}
},30000);
it('uses identical terrain and collision bodies when the public objects are copied to an ordinary player scene',()=>{
 const publicWorld=new GroundWorld({id:'hub',radius:village.radius,revision:5,objects:[],environment:village.environment});
 const privateWorld=new GroundWorld({id:'ordinary-player-world',radius:village.radius,revision:5,objects:village.objects,environment:village.environment,blueprints:village.blueprints});
 // Street kerbs are the hub's own continuous surfaces, not placed objects: low walkable supports only.
 const kerbs=publicWorld.bodies.filter(body=>body.objectId.startsWith('kerb:'));
 expect(kerbs.length).toBeGreaterThan(20);
 for(const body of kerbs)for(const c of body.colliders){expect(c.support).toBe(true);expect(c.tag).toBe('kerb');expect(c.half.y*2).toBeLessThan(.26);}
 expect(publicWorld.bodies.filter(body=>body.objectId!=='hub-ship'&&!body.objectId.startsWith('kerb:'))).toEqual(privateWorld.bodies);
 for(const point of [SPAWN,NPCS.mica.position,NPCS.sol.position]){
  expect(publicWorld.pose(point)).toEqual(privateWorld.pose(point));
  expect(publicWorld.support(point,23)).toEqual(privateWorld.support(point,23));
 }
},30000);
it('checks NPC reach in actual world metres without altering a legacy player quest',()=>{
 const store=openStore(':memory:');
 try{
  store.create('sample-reach');store.db.prepare("UPDATE planets SET sample_radius=21.6 WHERE id='hub'").run();
  const point=localToDir({dir:NPCS.mica.position,yaw:0},21.6,[0,0,1.9]);
  expect(distance(point,NPCS.mica.position,21.6)).toBeGreaterThan(1.65);
  expect(distance(point,NPCS.mica.position,14)).toBeLessThan(1.65);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(point),'sample-reach');
  expect(()=>store.interact('sample-reach','pickup')).toThrow('Walk closer to Mica');
  expect(store.db.prepare('SELECT quest FROM players WHERE id=?').get('sample-reach')?.quest).toBe('available');
 }finally{store.close();}
});
