import {describe,expect,it} from 'vitest';
import {planTownGroundRoutes} from '../scripts/town-ground-routes.ts';
import {defaultEnvironment,encodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {structureSize} from '../src/shared/blueprints.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import {distance} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';

function draft(wall=false):Pick<PublicTown,'radius'|'environment'|'objects'|'blueprints'>{
 const environment=defaultEnvironment('temperate',1);
 Object.assign(environment.params,{relief:.3,roughness:0,waterLevel:null,woodland:0,outcrops:0});
 const parts:PartPlacement[]=[];
 for(let x=0;x<3;x++){
  parts.push({n:parts.length+1,part:'floor.deck',x,z:0,level:0,rot:0});
  parts.push({n:parts.length+1,part:'wall.solid',x,z:0,level:0,rot:0});
 }
 return {radius:6,environment:encodeEnvironment(environment),objects:wall?[{id:'wall',kind:'structure',position:[0,0,1],rotation:0,version:1,blueprintHash:'wall',...structureSize(parts)}]:[],blueprints:wall?{wall:parts}:{}};
}
const at=(x:number,z:number):Vec3=>localToDir({dir:[0,0,1],yaw:0},6,[x,0,z]);

describe('read-only town ground authoring routes',()=>{
 it('uses actual terrain without requiring or inventing paving',()=>{
  const town=draft(),before=JSON.stringify(town),start:Vec3=[0,0,1],end:Vec3=[.5,0,Math.sqrt(.75)];
  const result=planTownGroundRoutes({town,starts:[{id:'origin',point:start}],targets:[{id:'destination',point:end}],spacing:1,maxExpandedPerTarget:1000}),route=result.routes[0];
  expect(result.rootsConnected).toBe(true);expect(route.status).toBe('connected');
  expect(route.route?.points[0]).toEqual(start);expect(route.route?.points.at(-1)).toEqual(end);
  expect(route.supports.terrainSamples).toBeGreaterThan(0);expect(route.supports.structureSamples).toBe(0);
  expect(JSON.stringify(town)).toBe(before);expect('pavingRoutes' in result).toBe(false);expect('entranceCoverage' in result).toBe(false);
 });
 it('goes around a real ordinary wall and refuses an anchor inside that wall',()=>{
  const town=draft(true),before=JSON.stringify(town),start=at(0,2),end=at(0,-2);
  const result=planTownGroundRoutes({town,starts:[{id:'front',point:start}],targets:[{id:'back',point:end},{id:'inside-wall',point:at(0,.5)}],spacing:.65,maxExpandedPerTarget:1000});
  expect(result.routes[0].status).toBe('connected');expect(result.routes[0].lengthMetres).toBeGreaterThan(distance(start,end,6)+1);
  expect(result.routes[0].blockedPoints.length).toBeGreaterThan(0);
  expect(result.routes[1].status).toBe('blocked-anchor');expect(result.routes[1].route).toBeNull();
  expect(result.routes[1].blockedPoints[0].reason).toBe('body-overlap');expect(JSON.stringify(town)).toBe(before);
 });
 it('does not disguise a blocked primary origin with a successful secondary root',()=>{
  const result=planTownGroundRoutes({town:draft(true),starts:[{id:'blocked-primary',point:at(0,.5)},{id:'secondary',point:at(0,2)}],targets:[{id:'back',point:at(0,-2)}],spacing:.65,maxExpandedPerTarget:1000});
  expect(result.routes[0].status).toBe('connected');expect(result.routes[0].startId).toBe('secondary');
  expect(result.rootConnections[0].status).toBe('blocked-anchor');expect(result.rootsConnected).toBe(false);
 });
 it('keeps ordinary door authoring but requires explicit public floor parts for street authoring',()=>{
  const town=draft(true);town.blueprints!.wall=town.blueprints!.wall.filter(p=>p.part==='floor.deck');
  const request={town,starts:[{id:'on-deck',point:at(-.2,0)}],targets:[{id:'nearby-deck',point:at(.2,0)}],spacing:.65,maxExpandedPerTarget:1000};
  expect(planTownGroundRoutes(request).routes[0].status).toBe('connected');
  const refused=planTownGroundRoutes({...request,outdoorOnly:{publicSupports:[]}}).routes[0];
  expect(refused.status).toBe('blocked-anchor');expect(refused.blockedPoints[0].reason).toBe('unclassified-support');
  expect(refused.blockedPoints[0].support?.objectId).toBe('wall');
  const world=new GroundWorld({id:'spec-public-floor',revision:0,...town}),body=world.bodies.find(b=>b.objectId==='wall')!;
  const colliderIndices=body.colliders.flatMap((c,i)=>c.support&&c.tag==='floor'?[i]:[]);
  const permitted=planTownGroundRoutes({...request,outdoorOnly:{publicSupports:[{objectId:'wall',colliderIndices,tag:'floor',reason:'Explicit open test deck, not a whole-building exemption'}]}}).routes[0];
  expect(permitted.status).toBe('connected');expect(permitted.supportLog?.some(s=>s.objectId==='wall'&&s.colliderIndices.length>0)).toBe(true);
 });
 it('does not turn a local street repair into a large detour around a building',()=>{
  const town=draft(true),starts=[{id:'front',point:at(0,2)}],targets=[{id:'back',point:at(0,-2)}];
  expect(planTownGroundRoutes({town,starts,targets,spacing:.65,maxExpandedPerTarget:1000}).routes[0].status).toBe('connected');
  const bounded=planTownGroundRoutes({town,starts,targets,spacing:.65,maxExpandedPerTarget:1000,localCorridorMetres:.3}).routes[0];
  expect(bounded.status).not.toBe('connected');expect(bounded.route).toBeNull();
 });
});
