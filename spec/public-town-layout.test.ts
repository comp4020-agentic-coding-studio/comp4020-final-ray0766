import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {blueprintHash,decodeBlueprint,encodeBlueprint} from '../src/shared/blueprint-codec.ts';
import {layoutErrors} from '../src/shared/blueprint-model.ts';
import {PART_IDS} from '../src/shared/blueprint-parts.ts';
import {publicTown,PUBLIC_TOWN_VERSION,townDistrictFor} from '../src/shared/public-town-layout.ts';
import {PUBLIC_TOWN_CAPACITY} from '../src/shared/world-capacity.ts';
import {createPublicTownPlacementCheck} from '../src/shared/public-town-reservations.ts';
import {StructurePlacementCache} from '../src/shared/structure-placement.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP,STEP_HEIGHT} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {NPCS,SPAWN,distance} from '../src/shared/world.ts';
import {HUB_DOCK} from '../src/shared/ports.ts';
import {contentHash} from '../src/assets/claude-geometry/core/doc.ts';
import {MAIN_PLANET_LEDGER,MAIN_PLANET_PLAN,mainPlanetNetwork} from '../src/shared/planet-plan/main-planet.ts';
import {planTown,streetDistance} from '../src/shared/planet-plan/generate.ts';
import {buildLedger} from '../src/shared/planet-plan/ledger-build.ts';
import {loadPlan,savePlan} from '../src/shared/planet-plan/schema.ts';
import {COMPOSITION_IDS} from '../src/shared/planet-plan/compositions.ts';
import {compositionFootprint} from '../src/shared/planet-plan/footprint.ts';
import {CLEARANCE,ROAD_PROFILES,roadHalfWidth} from '../src/shared/planet-plan/params.ts';
import {fromLocalRight,plazaDistance} from '../src/shared/planet-plan/network.ts';
import {anchorPoint,dirOf} from '../src/shared/planet-plan/sphere.ts';

const town=publicTown(),R=town.radius,field=fieldOf(town.environment,R),network=mainPlanetNetwork();
const PLAN_TEXT=readFileSync(new URL('../src/shared/planet-plan/main-planet.plan.json',import.meta.url),'utf8');

it('serves the frozen ledger of the current plan, regenerated identically with its seeded variation and no plan errors',async()=>{
 expect(MAIN_PLANET_LEDGER.planHash,'Run node scripts/planet-plan.ts build after editing the plan.').toBe(await contentHash(PLAN_TEXT));
 const regenerated=await buildLedger(planTown(MAIN_PLANET_PLAN,{field}),PLAN_TEXT);
 expect(regenerated).toEqual(MAIN_PLANET_LEDGER);
 expect(MAIN_PLANET_LEDGER.conflicts.filter(c=>c.severity==='error')).toEqual([]);
},120000);

it('loads, validates and saves the plan losslessly, and names what is wrong with a broken plan',()=>{
 const loaded=loadPlan(PLAN_TEXT,COMPOSITION_IDS);
 expect(loaded.ok).toBe(true);
 if(!loaded.ok)return;
 expect(savePlan(loaded.plan)).toBe(PLAN_TEXT);
 const broken=structuredClone(loaded.plan);
 broken.lots[0].composition='castle';broken.roads[0].nameZh='';broken.roads[1].path=[broken.roads[1].path[0]];
 const result=loadPlan(JSON.stringify(broken),COMPOSITION_IDS);
 expect(result.ok).toBe(false);
 if(!result.ok)for(const message of [/unknown composition castle/,/needs English and Chinese names/,/at least two points/])expect(result.errors.join('\n')).toMatch(message);
});

it('uses ordinary editable blueprints of the shared catalogue within the public capacity',async()=>{
 expect(town.version).toBe(PUBLIC_TOWN_VERSION);expect(PUBLIC_TOWN_VERSION).toBe(15);expect(R).toBe(21.6);
 expect(town.objects.length).toBeLessThanOrEqual(PUBLIC_TOWN_CAPACITY.objects);
 expect(new Set(town.objects.map(o=>o.id)).size).toBe(town.objects.length);
 expect(town.objects.every(o=>o.version===PUBLIC_TOWN_VERSION)).toBe(true);
 expect(town.roadObjects,'Streets are continuous surfaces, not placed deck packs.').toEqual([]);
 for(const [hash,parts]of Object.entries(town.blueprints)){
  expect(layoutErrors(parts),hash).toEqual([]);
  for(const part of parts)expect(PART_IDS).toContain(part.part);
  expect(await blueprintHash({parts}),hash).toBe(hash);
  expect(decodeBlueprint(encodeBlueprint({id:'51549d27-cabe-4d99-af34-c12000000000' as never,name:'Check',parts,groups:[]})).ok).toBe(true);
 }
 const structures=town.objects.filter(o=>o.kind==='structure');
 expect(structures.length).toBeGreaterThanOrEqual(40);
 expect(new Set(structures.map(o=>MAIN_PLANET_LEDGER.blueprints[o.blueprintHash!].composition)).size).toBeGreaterThanOrEqual(14);
 const assigned=town.renderDistricts.flatMap(d=>d.objectIds);
 expect(assigned.slice().sort()).toEqual(town.objects.map(o=>o.id).sort());
 for(const district of town.renderDistricts)for(const id of district.objectIds)expect(townDistrictFor(town.objects.find(o=>o.id===id)!.position)).toBe(district.id);
 for(const place of town.places??[]){
  expect(place.name.length).toBeGreaterThan(0);expect(place.nameZh.length).toBeGreaterThan(0);
  expect(place.objectIds.length+(place.siteObjectIds?.length??0),place.id).toBeGreaterThan(0);
  for(const id of place.streetIds??[])expect(town.routes.some(r=>r.id===id),id).toBe(true);
 }
});

it('keeps a street hierarchy in which two people pass on main streets and kerbs stay walkable',()=>{
 // Two 0.6 m shoulders plus a metre between them; branch and lane step down in width.
 expect(ROAD_PROFILES.main.paved).toBeGreaterThanOrEqual(2*.6+1);
 expect(ROAD_PROFILES.main.paved).toBeGreaterThan(ROAD_PROFILES.branch.paved);
 expect(ROAD_PROFILES.branch.paved).toBeGreaterThan(ROAD_PROFILES.lane.paved);
 expect(ROAD_PROFILES.lane.paved).toBeGreaterThanOrEqual(1.1);
 expect(ROAD_PROFILES.main.kerbHeight).toBeLessThan(STEP_HEIGHT/2);
 const classes=new Set(network.roads.map(r=>r.class));
 expect([...classes].sort()).toEqual(['branch','lane','main']);
});

it('designs the back, both poles and every face with streets, plazas, buildings or planting',()=>{
 const content=(p:Vec3)=>Math.min(streetDistance(network,network.pieces,p as [number,number,number]).d,
  ...network.plazas.map(plaza=>plazaDistance(plaza,p as [number,number,number],R)),...town.objects.map(o=>distance(o.position,p,R)-.5));
 for(const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as Vec3[])expect(content(axis),String(axis)).toBeLessThan(6);
 // No large undesigned hole anywhere: a Fibonacci probe of the whole sphere.
 let worst=0;
 for(let i=0;i<400;i++){const y=1-2*(i+.5)/400,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);worst=Math.max(worst,content([Math.cos(a)*r,y,Math.sin(a)*r]));}
 expect(worst).toBeLessThan(9);
});

it('validates the entire frozen ledger with the shared placement contract and fixed public operation reservations',()=>{
 const check=createPublicTownPlacementCheck(field,R,town.blueprints,new StructurePlacementCache()),failures:unknown[]=[];
 for(const object of town.objects){const problem=check(object,town.objects);if(problem)failures.push({id:object.id,problem});}
 expect(failures).toEqual([]);
},120000);

it('keeps eaves, awnings, steps and street furniture off the walking width of every street and plaza',()=>{
 const streets=network.pieces.filter(p=>p.class!=='door'),problems:string[]=[];
 for(const object of town.objects.filter(o=>o.kind==='structure')){
  const f=compositionFootprint(town.blueprints[object.blueprintHash!]);
  const sample=(rect:typeof f.base,step:number)=>{const out:[number,number,number][]=[];for(let x=rect.minX;x<=rect.maxX+1e-9;x+=step)for(let z=rect.minZ;z<=rect.maxZ+1e-9;z+=step)out.push(anchorPoint(object.position as [number,number,number],object.rotation,x,z,R));return out;};
  const base=Math.min(...sample(f.base,.3).map(p=>streetDistance(network,streets,p).d)),canopy=Math.min(...sample(f.canopy,.4).map(p=>streetDistance(network,streets,p).d));
  if(base<.02)problems.push(`${object.id} footprint on a street (${base.toFixed(2)} m)`);
  if(canopy<CLEARANCE.canopyToRoad-.01)problems.push(`${object.id} eaves over a street (${canopy.toFixed(2)} m)`);
  for(const plaza of network.plazas){const d=Math.min(...sample(f.base,.3).map(p=>plazaDistance(plaza,p,R)));if(d<.1)problems.push(`${object.id} on ${plaza.id}`);}
 }
 for(const object of town.objects.filter(o=>o.kind!=='structure')){
  const d=streetDistance(network,network.pieces,object.position as [number,number,number]).d;
  if(d<CLEARANCE.propToPaving-.01)problems.push(`${object.id} on the paving (${d.toFixed(2)} m)`);
  for(const plaza of network.plazas)if(plazaDistance(plaza,object.position as [number,number,number],R)<CLEARANCE.propToPaving-.01)problems.push(`${object.id} on ${plaza.id}`);
 }
 expect(problems).toEqual([]);
},60000);

const hub=new GroundWorld({id:'hub',radius:R,revision:1000+PUBLIC_TOWN_VERSION,objects:[]});
function supported(point:Vec3):GroundPose{const p=hub.pose(point);return {...p,radius:hub.support(point,p.radius+STEP_HEIGHT).radius};}
function walk(start:GroundPose,points:Vec3[]):GroundPose{
 let pose=start;
 for(const target of points){
  let done=false;
  for(let i=0;i<2000;i++){
   const remaining=distance(pose.position,target,R);if(remaining<.035){done=true;break;}
   const next=new Vector3(...pose.position).lerp(new Vector3(...target),Math.min(1,.045/remaining)).normalize().toArray() as Vec3;
   const before=pose;pose=hub.move(pose,next,FIXED_STEP);
   expect(hub.blocked(pose),JSON.stringify({target,pose})).toBe(false);
   if(distance(before.position,pose.position,R)<1e-6)break;
  }
  expect(done,JSON.stringify({target,pose})).toBe(true);
 }
 return pose;
}
it('replays the task routes, every door path and every street in both directions with the hub collision and kerbs',()=>{
 for(const [id,target]of [['public-post',NPCS.mica.position],['public-orchard',NPCS.sol.position],['public-harbour',HUB_DOCK]] as const){
  const route=town.routes.find(r=>r.id===id)!;expect(route,id).toBeDefined();
  expect(route.points[0]).toEqual(SPAWN);expect(distance(route.points.at(-1)!,target,R)).toBeLessThan(.24);
 }
 expect(MAIN_PLANET_LEDGER.lots.every(lot=>town.routes.some(r=>r.id===`door-${lot.id}`))).toBe(true);
 for(const route of town.routes){
  const start=supported(route.points[0]);expect(hub.blocked(start),route.id).toBe(false);
  const end=walk(start,route.points.slice(1));walk(end,[...route.points].reverse().slice(1));
 }
 for(const point of [SPAWN,HUB_DOCK,NPCS.mica.position,NPCS.sol.position])expect(hub.blocked(supported(point))).toBe(false);
},240000);

it('steps across a kerbed main street from verge to verge, onto and off the 6 cm kerbs',()=>{
 const piece=network.pieces.filter(p=>p.class==='main').sort((a,b)=>b.samples.length-a.samples.length)[0],s=piece.samples[Math.floor(piece.samples.length/2)];
 const reach=roadHalfWidth('main')+.5,from=fromLocalRight(s.p,s.r,-reach,R) as Vec3,to=fromLocalRight(s.p,s.r,reach,R) as Vec3;
 const start=supported(from);let top=start.radius,kerb=false;
 let pose=start;
 for(let i=0;i<600&&distance(pose.position,to,R)>.035;i++){
  const next=new Vector3(...pose.position).lerp(new Vector3(...to),Math.min(1,.045/distance(pose.position,to,R))).normalize().toArray() as Vec3;
  pose=hub.move(pose,next,FIXED_STEP);expect(hub.blocked(pose)).toBe(false);
  const support=hub.support(pose.position,pose.radius+.01);if(support.tag==='kerb')kerb=true;top=Math.max(top,pose.radius);
 }
 expect(distance(pose.position,to,R)).toBeLessThan(.035);
 expect(kerb,'The crossing must actually stand on a kerb.').toBe(true);
 expect(top-Math.min(start.radius,pose.radius)).toBeLessThan(STEP_HEIGHT);
});

it('moves a saved pose that the new buildings cover to a clear standing place nearby, never deleting it',()=>{
 for(const object of town.objects.filter(o=>o.kind==='structure').slice(0,24)){
  const pose=hub.pose(object.position),recovered=hub.recover(pose);
  expect(hub.blocked(recovered),object.id).toBe(false);
  expect(distance(recovered.position,object.position,R),object.id).toBeLessThan(Math.max(3.01,(object.radius??0)+.5));
 }
 // A pose already on a street is kept exactly.
 const street=dirOf(50,1) as Vec3,kept=hub.recover(supported(street));
 expect(distance(kept.position,street,R)).toBeLessThan(1e-9);
},60000);
