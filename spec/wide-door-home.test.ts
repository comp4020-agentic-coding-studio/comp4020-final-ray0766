import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Quaternion, Raycaster, Vector3 } from 'three';
import { openStore } from '../src/server/store.ts';
import { planetStore } from '../src/server/planets.ts';
import { blueprintStore } from '../src/server/blueprints.ts';
import { historyStore } from '../src/server/history.ts';
import { homeStore } from '../src/server/home.ts';
import { homeSetupStore } from '../src/server/home-setup.ts';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, starterManifest } from '../src/shared/home-layout.ts';
import { HOME_SAMPLE_RADIUS, homePositionAllowed, homeEntry, homeNearDoor, homeDoorFurnitureAllowed } from '../src/shared/home.ts';
import type { HomeDescriptor, HomeItem } from '../src/shared/home.ts';
import { homeDoorLeaves, homeDoorSweepContains, homeDoorCenterOffset, homeIndoorDoorOrigin } from '../src/shared/home-door.ts';
import { SPAWN } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { encodeBlueprint } from '../src/shared/blueprint-codec.ts';
import type { Blueprint } from '../src/shared/blueprint-model.ts';
import { GroundWorld, FIXED_STEP } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { createHomeDoor, placeHomeDoor } from '../src/client/home-door.ts';
import { homeFurnitureFits } from '../src/client/home-interior.ts';
import { createHomeRoomArt } from '../src/client/home-room-art.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { HOME_ROOM } from '../src/shared/home.ts';
import { disposeObject3D } from '../src/assets/claude-geometry/core/dispose.ts';

const stores:ReturnType<typeof openStore>[]=[],dirs:string[]=[];
afterEach(()=>{for(const s of stores.splice(0))try{s.close();}catch{/* reopened fixture */}for(const p of dirs.splice(0))rmSync(p,{recursive:true,force:true});});
const connect=(path:string)=>{const s=openStore(path,{homeSample:true});stores.push(s);return s;};
function fixture(partId:'wall.door.open'|'wall.door-wide.open'='wall.door-wide.open'){
 const dir=mkdtempSync(join(tmpdir(),'wide-door-home-'));dirs.push(dir);const path=join(dir,'test.sqlite'),store=connect(path);
 const planetId=String(store.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
 store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('owner',JSON.stringify(SPAWN),Date.now(),planetId);
 store.db.prepare('UPDATE planets SET owner_id=?,environment=?,sample_radius=? WHERE id=?').run('owner',HOME_ENVIRONMENT,HOME_SAMPLE_RADIUS,planetId);
 const blueprints=blueprintStore(store.db),history=historyStore(store.db),planets=planetStore(store.db,blueprints,history),homes=homeStore(store.db,planets,blueprints,history,true),setup=homeSetupStore(store.db,planets,blueprints,homes,true),site=starterManifest(HOME_SAMPLE_RADIUS).home;
 const blueprint:Blueprint={...site.blueprint,id:randomUUID() as Blueprint['id'],name:'My new wide-door home',parts:site.blueprint.parts.filter(p=>partId==='wall.door.open'||p.n!==113).map(p=>p.n===HOME_DOOR_PART?{...p,part:partId}:p)};
 const hash=blueprints.save('owner',{document:JSON.parse(encodeBlueprint(blueprint)),expectedVersion:0}).hash,buildingId=randomUUID();
 planets.create('owner',{planetId,objectId:buildingId,kind:'structure',position:site.position,rotation:site.rotation,blueprintHash:hash});
 const preview=setup.preview('owner',{planetId});expect(preview.candidates).toContainEqual({buildingId,partNumber:HOME_DOOR_PART,buildingName:blueprint.name});
 setup.confirm('owner',{planetId,mode:'bind',buildingId,partNumber:HOME_DOOR_PART,expectedRevision:preview.expectedRevision,hash:preview.hash,visitEpoch:homes.location('owner').visitEpoch});
 const home=store.state('owner').home!;store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(home.door.position),'owner');
 return{store,path,planetId,buildingId,hash,blueprint};
}
const toggle=(s:ReturnType<typeof openStore>,open:boolean)=>{const p=s.state('owner');return s.setHomeDoor('owner',{buildingId:p.home!.buildingId,visitEpoch:p.location!.visitEpoch,expectedDoorVersion:p.home!.interior.doorVersion,open});};
function geometry(home:HomeDescriptor,world:GroundWorld){const frame=home.door.frame!,q=new Quaternion().fromArray(frame.quaternion),origin=new Vector3(...frame.position),inverse=q.clone().invert();const point=(x:number,z:number)=>new Vector3(x+homeDoorCenterOffset(home.door.partId),0,z).applyQuaternion(q).add(origin),at=(x:number,z:number)=>point(x,z).normalize().toArray() as Vec3,pose=(x:number,z:number):GroundPose=>{const p=at(x,z);return{position:p,radius:world.support(p,point(x,z).length()+.26).radius,grounded:true,verticalSpeed:0,jumpHeld:false};};const local=(p:GroundPose)=>new Vector3(...p.position).multiplyScalar(p.radius).sub(origin).applyQuaternion(inverse);function walk(from:GroundPose,x:number,z:number){let p=from;for(let n=0;n<100;n++){const target=new Vector3(...at(x,z)),up=new Vector3(...p.position),gap=up.angleTo(target)*p.radius;const next=up.lerp(target,Math.min(1,2.5*FIXED_STEP/Math.max(.00001,gap))).normalize().toArray() as Vec3;p=world.move(p,next,FIXED_STEP);}return p;}return{at,pose,local,walk};}
it('binds the saved wide part, persists its dynamic leaves and preserves blueprint identity on reopen',()=>{
 const{store,path,buildingId,hash}=fixture(),before=store.universe('owner'),home=before.player.home!;
 expect(home.door.partId).toBe('wall.door-wide.open');const world=new GroundWorld(before.currentPlanet),open=geometry(home,world);
 const expectedApproach=open.at(0,.9);expect(new Vector3(...home.door.position).distanceTo(new Vector3(...expectedApproach))).toBeLessThan(1e-12);
 expect(world.bodies.find(b=>b.objectId===buildingId)!.colliders.filter(c=>c.tag==='wide door leaf')).toHaveLength(2);
 expect(open.local(open.walk(open.pose(0,.9),0,-.5)).z).toBeLessThan(-.25);
 const shut=toggle(store,false),blocked=new GroundWorld(shut.currentPlanet),g=geometry(shut.player.home!,blocked);
 expect(g.local(g.walk(g.pose(0,.9),0,-.5)).z).toBeGreaterThan(.15);
 const document=store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document;
 store.close();const reopened=connect(path),saved=reopened.universe('owner');expect(saved.player.home!.door.partId).toBe('wall.door-wide.open');expect(saved.player.home!.interior.doorOpen).toBe(false);
 expect(reopened.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document).toBe(document);
 expect(saved.currentPlanet.objects.find(o=>o.id===buildingId)!.blueprintHash).toBe(hash);
 const next=toggle(reopened,true),pass=new GroundWorld(next.currentPlanet),again=geometry(next.player.home!,pass);expect(again.local(again.walk(again.pose(0,.9),0,-.5)).z).toBeLessThan(-.25);
 expect(next.player.home!.interiorId).toBe(home.interiorId);
},15000);
it('refuses a disconnected visitor in the inward sweep even when both endpoint poses are clear',()=>{
 const{store,planetId,buildingId}=fixture(),p=store.universe('owner'),world=new GroundWorld(p.currentPlanet),g=geometry(p.player.home!,world),body=g.pose(.12,-.30);
 expect(world.blocked(body)).toBe(false);const shutWorld=new GroundWorld({...p.currentPlanet,homeDoor:{...p.currentPlanet.homeDoor!,open:false}});expect(shutWorld.blocked(body)).toBe(false);
 store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('offline',JSON.stringify(body.position),0,planetId);
 store.state('offline');store.db.prepare('UPDATE ground_states SET position=?,radius=?,vertical_speed=0,grounded=1 WHERE player_id=?').run(JSON.stringify(body.position),body.radius,'offline');
 const before=Number(store.db.prepare('SELECT total_changes() n').get()!.n),saved=store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document;
 expect(()=>toggle(store,false)).toThrow('doorway');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);expect(store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document).toBe(saved);
 expect(homeDoorSweepContains([.62,0,-.3],[0,1,0],'wall.door-wide.open')).toBe(true);expect(homeDoorSweepContains([.12,0,-.3])).toBe(false);
},15000);
it('uses the source door kind for indoor collision and rendered endpoint changes without replacing old doors',()=>{
 const{store}=fixture(),p=store.state('owner'),home=p.home!,z=home.interior.room.depth/2-.2;
 expect(homePositionAllowed([0,0,z],[],undefined,home.interior.room,true,home.door.partId)).toBe(true);expect(homePositionAllowed([0,0,z],[],undefined,home.interior.room,false,home.door.partId)).toBe(false);
 expect(homePositionAllowed([.7,0,z-.25],[],undefined,home.interior.room,true,home.door.partId)).toBe(false);expect(homePositionAllowed([.7,0,z-.25],[],undefined,home.interior.room,true)).toBe(true);
 const view=createHomeDoor();placeHomeDoor(view,home);expect(view.root.userData.partId).toBe('wall.door-wide.open');view.setOpen(false);expect(view.root.getObjectByName('home-door-closed')!.visible).toBe(true);
 view.setPart('wall.door.open');expect(view.root.userData.partId).toBe('wall.door.open');expect(homeDoorLeaves(true)).toHaveLength(6);expect(homeDoorLeaves(true,'wall.door-wide.open')).toHaveLength(2);view.dispose();
 const command={buildingId:home.buildingId,visitEpoch:p.location!.visitEpoch,expectedDoorVersion:0,open:false,partId:'wall.door.open'};const before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);expect(()=>store.setHomeDoor('owner',command)).toThrow('Unexpected');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
},15000);
it('enforces the wide leaves in authoritative indoor movement and rejects an occupied interior sweep without writes',()=>{
 const{store,buildingId,planetId}=fixture(),owner=store.state('owner'),inside=store.enterHome('owner',{planetId,buildingId,visitEpoch:owner.location!.visitEpoch}).player,home=inside.home!,loc=inside.location!;
 if(loc.kind!=='interior')throw Error('Expected interior');const z=home.interior.room.depth/2-.2;
 expect(z-loc.position[2]).toBeCloseTo(.98);expect(homeNearDoor(loc.position,home.interior.room,home.door.partId)).toBe(true);
 expect(homeIndoorDoorOrigin(home.interior.room,home.door.partId)[0]).toBe(-.5);
 const move=(position:Vec3)=>({buildingId,visitEpoch:loc.visitEpoch,sequence:loc.sequence+1,position,yaw:0});
 let before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.moveHome('owner',move([.7,0,z-.25]),Date.now()+1200)).toThrow('blocks');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 toggle(store,false);before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.moveHome('owner',move([0,0,z]),Date.now()+1200)).toThrow('blocks');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 toggle(store,true);const moved=store.moveHome('owner',move([0,0,z-.30]),Date.now()+1200);expect(moved.location?.kind).toBe('interior');before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>toggle(store,false)).toThrow('doorway');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 expect(store.state('owner').location).toEqual(moved.location);
},15000);
it('enters outside the wide sweep, closes without moving saved people and reenters without accepting stale requests',()=>{
 const{store,path,buildingId,planetId}=fixture(),owner=store.state('owner'),enter={planetId,buildingId,visitEpoch:owner.location!.visitEpoch};
 const first=store.enterHome('owner',enter).player,location=first.location!;if(location.kind!=='interior')throw Error('Expected interior');
 const savedPosition=[...location.position];expect(location.position).toEqual(homeEntry(first.home!.interior.room,'wall.door-wide.open'));
 const close=toggle(store,false).player;expect(close.location).toEqual(location);
 let before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 toggle(store,false);expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 expect(()=>store.enterHome('owner',enter)).toThrow('changed');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 expect(()=>store.exitHome('owner',{buildingId,visitEpoch:location.visitEpoch})).toThrow('Open the door');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 store.close();const reopened=connect(path);expect(reopened.state('owner').location).toEqual(location);
 toggle(reopened,true);const outside=reopened.exitHome('owner',{buildingId,visitEpoch:location.visitEpoch}).player;
 const next=reopened.enterHome('owner',{planetId,buildingId,visitEpoch:outside.location!.visitEpoch}).player;
 expect(next.location).toMatchObject({kind:'interior',position:savedPosition,sequence:0,visitEpoch:location.visitEpoch+2});
 before=Number(reopened.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>reopened.enterHome('owner',{planetId,buildingId,visitEpoch:outside.location!.visitEpoch})).toThrow('changed');expect(Number(reopened.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 expect(homeEntry(first.home!.interior.room)[2]).toBe(first.home!.interior.room.depth/2-1.05);
},15000);
it('keeps both inward wings clear of furniture and preserves visitor position and owner-only room edits',()=>{
 const{store,path,planetId,buildingId}=fixture(),owner=store.state('owner'),home=owner.home!,room=home.interior.room;
 store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('visitor',JSON.stringify(home.door.position),0,planetId);
 const visitor=store.state('visitor'),saved=store.db.prepare('SELECT position FROM players WHERE id=?').get('visitor')!.position;
 const command=(open:boolean)=>({buildingId,visitEpoch:visitor.location!.visitEpoch,expectedDoorVersion:store.state('owner').home!.interior.doorVersion,open});
 store.setHomeDoor('visitor',command(false));store.setHomeDoor('visitor',command(true));
 const before=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.enterHome('visitor',{planetId,buildingId,visitEpoch:visitor.location!.visitEpoch})).toThrow('Only');
 expect(()=>store.saveHome('visitor',{buildingId,expectedVersion:1,material:'blue',items:[]})).toThrow('Only');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(before);
 store.enterHome('owner',{planetId,buildingId,visitEpoch:owner.location!.visitEpoch});
 const item:HomeItem={id:'door-side-chair',kind:'chair',position:[.9,0,room.depth/2-.45],yaw:0};
 expect(homeDoorFurnitureAllowed([item],room)).toBe(true);expect(homeDoorFurnitureAllowed([item],room,'wall.door-wide.open')).toBe(false);
 expect(homeFurnitureFits([item],homeEntry(room,'wall.door-wide.open'),room,true,'wall.door-wide.open')).toBe(false);
 const writeCount=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.saveHome('owner',{buildingId,expectedVersion:1,material:'blue',items:[item]})).toThrow('leaves');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(writeCount);
 expect(store.db.prepare('SELECT position FROM players WHERE id=?').get('visitor')!.position).toBe(saved);
 store.close();const reopened=connect(path);expect(reopened.db.prepare('SELECT position FROM players WHERE id=?').get('visitor')!.position).toBe(saved);expect(reopened.state('visitor').location).toEqual(visitor.location);
},15000);
it('preserves a bound wide doorway through explicit blueprint edits and refuses moving it over a saved visitor',()=>{
 const{store,planetId,buildingId,blueprint}=fixture(),before=store.universe('owner'),home=before.player.home!,document=store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document;
 const edited={...blueprint,id:randomUUID() as Blueprint['id'],name:'Same wide doorway, new blueprint'};
 const hash=blueprintStore(store.db).save('owner',{document:JSON.parse(encodeBlueprint(edited)),expectedVersion:0}).hash;
 const replaced=store.replaceObject('owner',{planetId,objectId:buildingId,expectedVersion:1,blueprintHash:hash});
 expect(replaced.player.home!.door.partId).toBe('wall.door-wide.open');expect(replaced.player.home!.interiorId).toBe(home.interiorId);
 expect(store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document).toBe(document);
 const object=replaced.currentPlanet.objects.find(o=>o.id===buildingId)!,g=geometry(replaced.player.home!,new GroundWorld(replaced.currentPlanet)),body=g.pose(.12,-.3);
 store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('offline',JSON.stringify(body.position),0,planetId);store.state('offline');
 store.db.prepare('UPDATE ground_states SET position=?,radius=?,vertical_speed=0,grounded=1 WHERE player_id=?').run(JSON.stringify(body.position),body.radius,'offline');
 const rows=store.db.prepare('SELECT * FROM planet_objects WHERE id=?').get(buildingId),visitor=store.db.prepare('SELECT * FROM ground_states WHERE player_id=?').get('offline'),changes=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.updateObject('owner',{planetId,objectId:buildingId,position:object.position,rotation:object.rotation+.001,expectedVersion:object.version})).toThrow('doorway');
 expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(changes);expect(store.db.prepare('SELECT * FROM planet_objects WHERE id=?').get(buildingId)).toEqual(rows);expect(store.db.prepare('SELECT * FROM ground_states WHERE player_id=?').get('offline')).toEqual(visitor);
},15000);
it('refuses an explicit old-to-wide replacement that would cut through saved furnishings or an indoor visitor',()=>{
 const{store,planetId,buildingId,blueprint}=fixture('wall.door.open'),home=store.state('owner').home!;
 const edited:Blueprint={...blueprint,id:randomUUID() as Blueprint['id'],parts:blueprint.parts.filter(p=>p.n!==113).map(p=>p.n===HOME_DOOR_PART?{...p,part:'wall.door-wide.open'}:p)};
 const hash=blueprintStore(store.db).save('owner',{document:JSON.parse(encodeBlueprint(edited)),expectedVersion:0}).hash,command={planetId,objectId:buildingId,expectedVersion:1,blueprintHash:hash};
 const items:HomeItem[]=[{id:'existing-side-chair',kind:'chair',position:[.9,0,home.interior.room.depth/2-.45],yaw:0}],document=JSON.stringify({...home.interior,items});
 store.db.prepare('UPDATE home_interiors SET document=? WHERE building_id=?').run(document,buildingId);
 let changes=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.replaceObject('owner',command)).toThrow('saved furniture');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(changes);expect(store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(buildingId)!.document).toBe(document);
 store.db.prepare('UPDATE home_interiors SET document=? WHERE building_id=?').run(JSON.stringify(home.interior),buildingId);
 store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('saved-indoor',JSON.stringify(home.door.position),0,planetId);const visitor=store.state('saved-indoor');
 const location={kind:'interior',planetId,buildingId,interiorId:home.interiorId,position:[.7,0,home.interior.room.depth/2-.45],yaw:0,sequence:4,visitEpoch:visitor.location!.visitEpoch};
 store.db.prepare('INSERT INTO home_locations(player_id,document,moved_at) VALUES(?,?,?)').run('saved-indoor',JSON.stringify(location),0);expect(store.state('saved-indoor').location).toEqual(location);changes=Number(store.db.prepare('SELECT total_changes() n').get()!.n);
 expect(()=>store.replaceObject('owner',command)).toThrow('visitor');expect(Number(store.db.prepare('SELECT total_changes() n').get()!.n)).toBe(changes);
 expect(store.state('owner').home!.door.partId).toBe('wall.door.open');expect(store.state('saved-indoor').location).toEqual(location);
},15000);
it('widens the actual indoor cutaway edge around the centred wide opening while keeping the old room mesh',()=>{
 const library=new StyleLibrary('medium',{scans:false,look:'village'}),old=createHomeRoomArt(HOME_ROOM,library),wide=createHomeRoomArt(HOME_ROOM,library,'wall.door-wide.open');
 try{
  old.group.updateMatrixWorld(true);wide.group.updateMatrixWorld(true);
  const hit=(root:typeof old.group,x:number)=>new Raycaster(new Vector3(x,.025,HOME_ROOM.depth/2+.3),new Vector3(0,0,-1),0,.6).intersectObject(root,true).length>0;
  expect(hit(old.group,0)).toBe(false);expect(hit(wide.group,0)).toBe(false);
  for(const side of [-1,1]){expect(hit(old.group,side*.66)).toBe(true);expect(hit(wide.group,side*.66)).toBe(false);expect(hit(wide.group,side*.8)).toBe(true);}
 }finally{disposeObject3D(old.group);disposeObject3D(wide.group);library.dispose();}
});
