import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {defaultEnvironment,encodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {townStoneLane,planTownStoneLanes} from '../src/shared/town-stone-lanes.ts';
import {placementProblem} from '../src/shared/planets.ts';
import type {PlacedObject} from '../src/shared/planets.ts';
import {fieldOf,objectSeat} from '../src/shared/terrain.ts';
import {GroundWorld,STEP_HEIGHT} from '../src/shared/physics/world.ts';
import type {Vec3} from '../src/shared/world.ts';

const radius=21.6,hashes={1:'one',2:'two',3:'three',4:'four',5:'five'};
const blueprints=Object.fromEntries(([1,2,3,4,5] as const).map(n=>[hashes[n],townStoneLane(n).parts]));
const doc=defaultEnvironment('temperate',17);
Object.assign(doc.params,{relief:.3,roughness:0,waterLevel:null,outcrops:0});
const environment=encodeEnvironment(doc),at=(metres:number):Vec3=>[0,-Math.cos(metres/radius),Math.sin(metres/radius)];
const fixture=(objects:PlacedObject[]=[])=>({routes:[{id:'fractional',width:1,points:[at(0),at(8.4)]}],objects,blueprints,hashes,radius,environment,maxObjects:100,maxStructures:100,version:9});
function ordinaryPlacement(objects:PlacedObject[]){
 const field=fieldOf(environment,radius);
 for(const object of objects){
  expect(objectSeat(field,object,blueprints).problem).toBeNull();
  expect(placementProblem(object.kind,object.position,objects,object.id,object.radius,radius,2,{rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints,field})).toBeNull();
 }
}

it('packs a fractional route without overlapping rounded-up strips and reports its unfinished tail',()=>{
 const input=fixture(),before=JSON.stringify(input),result=planTownStoneLanes(input);
 expect(result.reports[0].failures).toEqual([]);
 // Eight metres of kit paving along 8.4 m, instead of overlapping 5 m slabs.
 expect(result.objects.reduce((n,o)=>n+blueprints[o.blueprintHash!].length,0)).toBe(8);
 expect(result.reports[0].unplacedSpans.at(-1)?.toMetres).toBeCloseTo(8.4,8);
 ordinaryPlacement(result.objects);
 expect(JSON.stringify(input)).toBe(before);
 expect(planTownStoneLanes(input)).toEqual(result);
 for(const length of [5.04,5.08,5.10]){
  const short=planTownStoneLanes({...fixture(),routes:[{id:'short-tail',width:1,points:[at(0),at(length)]}]});
  expect(short.reports[0].unplacedSpans[0]?.fromMetres).toBeCloseTo(5,8);
  expect(short.reports[0].unplacedSpans[0]?.toMetres).toBeCloseTo(length,8);
 }
});

it('walks over the proposed joint in both directions with ordinary spherical collision and step limits',()=>{
 const objects=planTownStoneLanes(fixture()).objects,world=new GroundWorld({id:'stone-joint-test',revision:0,radius,environment,objects,blueprints});
 let pose=world.pose(at(-1));
 for(const direction of [1,-1])for(let step=1;step<=380;step++){
  const metres=direction===1?-1+step*.03:10.4-step*.03,target=at(metres),before=pose;
  pose=world.move(pose,target,.01,0);
  expect(world.blocked(pose)).toBe(false);
  expect(new Vector3(...pose.position).angleTo(new Vector3(...target))*radius).toBeLessThan(.003);
  expect(pose.radius-before.radius).toBeLessThanOrEqual(STEP_HEIGHT+.003);
 }
 expect(new Vector3(...pose.position).angleTo(new Vector3(...at(-1)))*radius).toBeLessThan(.003);
});

it('tries shorter ordinary strips around an obstruction without hiding rejected attempts or uncovered spans',()=>{
 const tree:PlacedObject={id:'obstacle',kind:'tree',position:at(2.4),rotation:0,version:1};
 const result=planTownStoneLanes(fixture([tree])),report=result.reports[0];
 expect(result.objects[0].blueprintHash).toBe(hashes[1]);
 expect(report.failures.some(f=>f.length===5&&f.problem.includes('too close'))).toBe(true);
 expect(report.unplacedSpans.some(s=>s.fromMetres<=2.4&&s.toMetres>=2.4&&s.problem.includes('too close'))).toBe(true);
 const field=fieldOf(environment,radius);
 for(const object of result.objects)expect(placementProblem('structure',object.position,[tree,...result.objects],object.id,object.radius,radius,2,{rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints,field})).toBeNull();
});

it('stops at either capacity and records the remaining span without a repeated budget-rejection loop',()=>{
 for(const budget of [{maxObjects:1,maxStructures:100},{maxObjects:100,maxStructures:1}]){
  const result=planTownStoneLanes({...fixture(),...budget}),report=result.reports[0];
  expect(result.objects).toHaveLength(1);
  expect(report.failures.filter(f=>f.problem.includes('budget'))).toHaveLength(1);
  expect(report.unplacedSpans.at(-1)?.toMetres).toBeCloseTo(8.4,8);
  expect(report.unplacedSpans.at(-1)?.fromMetres).toBeCloseTo(5,8);
  expect(report.unplacedSpans.at(-1)?.problem).toMatch(/budget/);
 }
 const threeOnly=planTownStoneLanes({...fixture(),hashes:{1:hashes[1],2:hashes[2],3:hashes[3]}});
 expect(threeOnly.reports[0].failures).toEqual([]);ordinaryPlacement(threeOnly.objects);
});
