import {expect,it} from 'vitest';
import {BufferGeometry,DoubleSide,Float32BufferAttribute,Mesh,MeshBasicMaterial,Raycaster,SphereGeometry,Vector3} from 'three';
import {samplePublicVillage,SAMPLE_PUBLIC_BLUEPRINTS,SAMPLE_PUBLIC_HASHES} from '../src/shared/sample-public-village.ts';
import {layoutErrors} from '../src/assets/claude-geometry/blueprint/model.ts';
import {blueprintHash} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {structureFit,MAX_STRUCTURES} from '../src/shared/blueprints.ts';
import {MAX_OBJECTS,placementProblem} from '../src/shared/planets.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS} from '../src/shared/public-village.ts';
import {NPCS,SPAWN,distance} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {HUB_DOCK,canBoard} from '../src/shared/ports.ts';
import {openStore} from '../src/server/store.ts';
import {planetStore} from '../src/server/planets.ts';
import {groundStore} from '../src/server/ground.ts';
import {routeClearings,sampleLandscape,surfaceRouteGeometry,ROUTE_SURFACE_OFFSET} from '../src/client/sample-landscape.ts';
import {groundPresentation} from '../src/client/presentation.ts';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import {libraryMaterials} from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import {handleFor,isShared,materialTextures} from '../src/assets/claude-geometry/core/dispose.ts';
import {worldMaterials} from '../src/client/shared-assets.ts';

const village=samplePublicVillage();
const world=()=>new GroundWorld({id:'hub',radius:village.radius,revision:0,objects:[],environment:village.environment});
function walk(w:GroundWorld,start:GroundPose,target:Vec3){
 let p=start;
 for(let i=0;i<1800;i++){
  const a=new Vector3(...p.position),b=new Vector3(...target),d=a.angleTo(b)*village.radius;
  if(d<.028)return p;
  p=w.move(p,a.lerp(b,Math.min(1,.045/d)).normalize().toArray() as Vec3,FIXED_STEP);
  expect(w.blocked(p)).toBe(false);
 }
 throw Error(`Unreachable sample public waypoint ${JSON.stringify(target)} from ${JSON.stringify(p.position)}`);
}
it('composes three distinct destinations from unchanged metre-sized legal player parts',async()=>{
 expect(village.radius).toBe(21.6);expect(village.destinations.map(d=>d.id)).toEqual(['post','orchard','harbour']);
 expect(village.objects.length).toBeLessThanOrEqual(32);expect(village.objects.length).toBeLessThan(MAX_OBJECTS);
 expect(village.objects.filter(o=>o.kind==='structure')).toHaveLength(3);expect(3).toBeLessThan(MAX_STRUCTURES);
 for(const [i,b]of SAMPLE_PUBLIC_BLUEPRINTS.entries()){
  expect(layoutErrors(b.parts)).toEqual([]);expect(await blueprintHash(b)).toBe(SAMPLE_PUBLIC_HASHES[i]);
 }
 for(const o of village.objects){
  expect(placementProblem(o.kind,o.position,village.objects,o.id,o.radius,village.radius)).toBeNull();
  if(o.kind==='structure'){
   const fit=structureFit(village.blueprints[o.blueprintHash!],o.position,o.rotation,fieldOf(village.environment,village.radius));
   expect(fit.problem).toBeNull();expect(fit.foundationDepth).toBeLessThan(.6);
  }
 }
 expect(samplePublicVillage()).toBe(village);
});
it('walks from landing to the post, orchard and boarding marker and back using authoritative colliders',()=>{
 const w=world();
 for(const route of village.routes){
  let p=w.recover(w.pose(SPAWN));
  for(const target of route.points.slice(1))p=walk(w,p,target);
  expect(distance(p.position,route.points.at(-1)!,village.radius)).toBeLessThan(.03);
  for(const target of [...route.points].reverse().slice(1))p=walk(w,p,target);
 }
 for(const p of [SPAWN,NPCS.mica.position,NPCS.sol.position,HUB_DOCK]){
  const pose=w.pose(p);expect(w.blocked(pose)).toBe(false);expect(pose.radius).toBeGreaterThan(21);
 }
 expect(canBoard('hub',HUB_DOCK,village.radius)).toBe(true);
});
it('keeps old harbour geometry and private database rows separate from the sample public projection',()=>{
 const legacy=new GroundWorld({id:'hub',radius:14,revision:0,objects:[]});
 expect(legacy.bodies.map(b=>b.objectId)).toContain(HUB_OBJECTS[0].id);
 expect(legacy.bodies.map(b=>b.objectId)).not.toContain(village.objects[0].id);
 expect(Object.keys(PUBLIC_CONTENTS)).toHaveLength(3);
 const store=openStore(':memory:');
 try{
  store.create('legacy-public');const before=store.state('legacy-public').ground!;
  // A disposable in-memory copy models an old sample hub ground row. The
  // new public configuration must recover it through the scene fence.
  store.db.prepare("UPDATE planets SET sample_radius=21.6 WHERE id='hub'").run();
  const rowBefore=store.db.prepare("SELECT * FROM planets WHERE id='hub'").get();
  const planets=planetStore(store.db,undefined,undefined,21.6),hub=planets.view('legacy-public','hub');
  expect(hub.radius).toBe(21.6);expect(hub.environment).toBe(village.environment);expect(hub.revision).toBe(1001);
  const restored=groundStore(store.db,planets).read('legacy-public');
  expect(restored.sceneRevision).toBe(1001);expect(restored.sequence).toBeGreaterThan(before.sequence);
  expect(restored.radius).toBeGreaterThan(21);
  expect(store.db.prepare("SELECT * FROM planets WHERE id='hub'").get()).toEqual(rowBefore);
 }finally{store.close();}
});
it('clears route corridors and renders thin ground-following paving without extra support surfaces',()=>{
 const w=world(),clearings=routeClearings(village.routes,village.radius);
 for(const route of village.routes)for(let leg=1;leg<route.points.length;leg++){
  const a=new Vector3(...route.points[leg-1]),b=new Vector3(...route.points[leg]),steps=Math.ceil(a.angleTo(b)*village.radius/.2);
  for(let i=0;i<=steps;i++){
   const p=a.clone().lerp(b,i/steps).normalize().toArray() as Vec3;
   expect(clearings.some(c=>distance(p,c.dir,village.radius)<=c.radius-route.width/2+.001)).toBe(true);
  }
 }
 const geometry=surfaceRouteGeometry(village.routes,w.ground),position=geometry.getAttribute('position');
 for(let i=0;i<position.count;i++){
  const p=new Vector3().fromBufferAttribute(position,i),r=p.length(),n=p.normalize().toArray() as Vec3;
  expect(r-(10+w.ground.heightAt(n))).toBeCloseTo(ROUTE_SURFACE_OFFSET,4);
 }
 expect((geometry.index?.count??0)/3).toBeLessThan(4000);geometry.dispose();
 expect(groundPresentation('hub',21.6)).toBe(groundPresentation('private',21.6));
});
it('checks NPC reach in actual 21.6-metre world units rather than the old 14-metre globe',()=>{
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
it('projects decorative paving above the displayed terrain triangles even when they differ from the source field',()=>{
 const ground=new Mesh(new SphereGeometry(21.8,24,18),new MeshBasicMaterial());ground.updateWorldMatrix(true,false);
 const field={id:'flat-test',waterLevel:null,heightAt:()=>11.6,normalAt:(dir:Vec3)=>dir};
 const geometry=surfaceRouteGeometry([village.routes[0]],field,ground),positions=geometry.getAttribute('position'),ray=new Raycaster();
 let projectedAwayFromField=false;
 for(let i=0;i<positions.count;i++){
  const position=new Vector3().fromBufferAttribute(positions,i),radius=position.length(),dir=position.clone().normalize();
  ray.set(dir.clone().multiplyScalar(25),dir.clone().negate());const hit=ray.intersectObject(ground)[0];
  expect(hit).toBeTruthy();expect(radius-hit.point.length()).toBeCloseTo(ROUTE_SURFACE_OFFSET,4);
  if(Math.abs(radius-21.6-ROUTE_SURFACE_OFFSET)>.03)projectedAwayFromField=true;
 }
 expect(projectedAwayFromField).toBe(true);geometry.dispose();ground.geometry.dispose();(ground.material as MeshBasicMaterial).dispose();
});
it('keeps triangle interiors above a transverse terrain crest within a bounded two-dimensional road grid',()=>{
 const groundGeometry=new BufferGeometry();groundGeometry.setAttribute('position',new Float32BufferAttribute([
  -2,21.6,1, 0,21.95,1, 2,21.6,1,
  -2,21.6,-5, 0,21.95,-5, 2,21.6,-5,
 ],3));groundGeometry.setIndex([0,1,4,0,4,3,1,2,5,1,5,4]);groundGeometry.computeVertexNormals();
 const ground=new Mesh(groundGeometry,new MeshBasicMaterial({side:DoubleSide}));ground.updateWorldMatrix(true,false);
 const route={id:'crosswise-crest',width:1.4,points:[[0,1,0],[0,1,-.14]].map(p=>new Vector3(...p).normalize().toArray() as Vec3)};
 const field={id:'source-field',waterLevel:null,heightAt:()=>11.6,normalAt:(dir:Vec3)=>dir};
 const geometry=surfaceRouteGeometry([route],field,ground),position=geometry.getAttribute('position'),indices=geometry.index!,ray=new Raycaster();
 expect(indices.count/3).toBeLessThan(260);
 const weights=[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
 for(let i=0;i<indices.count;i+=3){
  const corners=[0,1,2].map(j=>new Vector3().fromBufferAttribute(position,indices.getX(i+j)));
  for(const w of weights){
   const p=new Vector3();corners.forEach((corner,j)=>p.addScaledVector(corner,w[j]));const radius=p.length(),dir=p.normalize();
   ray.set(dir.clone().multiplyScalar(25),dir.clone().negate());const hit=ray.intersectObject(ground)[0];
   expect(hit).toBeTruthy();expect(radius-hit.point.length()).toBeGreaterThan(.02);expect(radius-hit.point.length()).toBeLessThan(.03);
  }
 }
 geometry.dispose();groundGeometry.dispose();(ground.material as MeshBasicMaterial).dispose();
});
it('owns an unbiased paving material while preserving the shared palette, cel shader and textures',()=>{
 const source=libraryMaterials(worldMaterials()).get('pavers'),before={enabled:source.polygonOffset,factor:source.polygonOffsetFactor,units:source.polygonOffsetUnits};
 const route=sampleLandscape([village.routes[0]],world().ground),material=route.material;
 expect(material).not.toBe(source);expect(isShared(source)).toBe(true);expect(isShared(material)).toBe(false);
 expect(material.userData.ownedResource).toBe(true);expect(material.polygonOffset).toBe(false);
 expect(material.onBeforeCompile).toBe(source.onBeforeCompile);expect(material.customProgramCacheKey).toBe(source.customProgramCacheKey);
 expect(materialTextures(material)).toEqual(materialTextures(source));
 let sharedDisposals=0,ownedDisposals=0,textureDisposals=0;
 const onShared=()=>sharedDisposals++,onOwned=()=>ownedDisposals++,onTexture=()=>textureDisposals++;
 source.addEventListener('dispose',onShared);material.addEventListener('dispose',onOwned);
 for(const texture of materialTextures(source)){expect(isShared(texture)).toBe(true);texture.addEventListener('dispose',onTexture);}
 const handle=handleFor(route);handle.dispose();handle.dispose();
 expect(ownedDisposals).toBe(1);expect(sharedDisposals).toBe(0);expect(textureDisposals).toBe(0);
 expect({enabled:source.polygonOffset,factor:source.polygonOffsetFactor,units:source.polygonOffsetUnits}).toEqual(before);
 source.removeEventListener('dispose',onShared);for(const texture of materialTextures(source))texture.removeEventListener('dispose',onTexture);
});
