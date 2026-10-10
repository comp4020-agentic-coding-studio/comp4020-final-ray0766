import { expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { anchorFrame, anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { PART_IDS } from '../src/assets/claude-geometry/blueprint/parts/catalogue.ts';
import { buildBlueprintModel } from '../src/assets/claude-geometry/blueprint/model3d.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import type { HeightField } from '../src/assets/claude-geometry/core/ground.ts';
import type { PartPlacement } from '../src/assets/claude-geometry/blueprint/model.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { placementProblem } from '../src/shared/planets.ts';
import type { PlacedObject } from '../src/shared/planets.ts';
import { StructurePlacementCache, structurePlacementProblem } from '../src/shared/structure-placement.ts';
import { distance, normalize, SPAWN } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';

const square:PartPlacement[]=[1,2].flatMap((x,i)=>[1,2].map((z,j)=>({n:i*2+j+1,part:'floor.deck',x,z,level:0,rot:0})));
const cell:PartPlacement[]=[{n:1,part:'floor.deck',x:2,z:2,level:0,rot:0}];
const position=normalize([.65,1,-.3]);
const flat=(radius:number):HeightField=>({id:'flat-'+radius,waterLevel:null,heightAt:()=>radius-10,normalAt:p=>p});
function fixture(radius=21.6,rotation=0,at=position,field=flat(radius)){
  const blueprints:Record<string,PartPlacement[]>={a:square,b:square};
  const make=(id:string,parts=square,local:Vec3=[0,0,0],yaw=rotation):PlacedObject=>{
    blueprints[id]=parts;
    return {id,kind:'structure',version:1,rotation:yaw,blueprintHash:id,position:localToDir({dir:at,yaw:rotation},structureFit(square,at,rotation,field).baseRadius,local),...structureSize(parts)};
  };
  const check=(a:PlacedObject,objects:PlacedObject[],contents=blueprints)=>placementProblem('structure',a.position,objects,a.id,a.radius,radius,2,{rotation:a.rotation,blueprintHash:a.blueprintHash,blueprints:contents,field});
  const both=(a:PlacedObject,b:PlacedObject)=>[check(a,[b]),check(b,[a])];
  return {make,check,both,blueprints,field,radius};
}

it('admits real separation inside overlapping circles in both orders on rotated and polar sphere frames',()=>{
  for(const radius of [10,14,21.6])for(const rotation of [0,.73,Math.PI/2])for(const at of [position,[0,-1,0] as Vec3]){
    const f=fixture(radius,rotation,at),a=f.make('a'),b=f.make('b',square,[2.9,0,0],rotation+Math.PI/4),before=structuredClone([a,b]);
    expect(distance(a.position,b.position,radius)).toBeLessThan(a.radius!+b.radius!+.06);
    expect(placementProblem('structure',b.position,[a],b.id,b.radius,radius)).toMatch(/too close/);
    expect(f.both(a,b),`${radius}/${rotation}/${at}`).toEqual([null,null]);
    expect([a,b]).toEqual(before);
  }
});

it('keeps broad-phase exits cheap and rejects unresolved blueprints conservatively',()=>{
  const f=fixture(),a=f.make('a'),near=f.make('b',square,[2.4,0,0]),far=f.make('far',square,[9,0,0]);
  const noSample:HeightField={...f.field,heightAt:()=>{throw Error('broad phase sampled terrain');}};
  expect(placementProblem('structure',far.position,[a],far.id,far.radius,f.radius,2,{rotation:far.rotation,blueprintHash:'far',blueprints:f.blueprints,field:noSample})).toBeNull();
  expect(f.check(near,[a],{a:square})).toMatch(/Resolve both/);
  expect(f.check(a,[near],{a:square})).toMatch(/Resolve both/);
  expect(f.check(near,[a],{a:[],b:square})).toMatch(/Resolve both/);
});

it('blocks foundations under separated floor edges and separately blocks overhanging roof envelopes',()=>{
  const f=fixture(10),a=f.make('a'),close=f.make('b',square,[2.15,0,0]);
  // Surface edges have a visible gap, but radial foundations converge below it.
  expect(f.both(a,close).every(Boolean)).toBe(true);
  expect(f.both(a,f.make('b',square,[2.4,0,0]))).toEqual([null,null]);
  const roof:PartPlacement[]=[...cell,{n:2,part:'wall.solid',x:2,z:2,rot:2,level:0},{n:3,part:'roof.slope',x:2,z:2,rot:0,level:1}];
  const e=fixture(),bareA=e.make('a',cell),bareB=e.make('b',cell,[0,0,1.4],Math.PI);
  expect(e.both(bareA,bareB)).toEqual([null,null]);
  const coveredA=e.make('a',roof),coveredB=e.make('b',roof,[0,0,1.4],Math.PI);
  expect(e.both(coveredA,coveredB).every(message=>message?.includes('roofs'))).toBe(true);
});

it('reserves sliding travel and a usable exterior doorway approach without an inward swing',()=>{
  const door:PartPlacement[]=[{n:1,part:'wall.door.open',x:2,z:2,rot:0,level:0}];
  const post:PartPlacement[]=[{n:1,part:'structure.column',x:2,z:2,rot:0,level:0}];
  const f=fixture(),a=f.make('a',door),b=f.make('b',post,[-.3,0,-.5]);
  // Isolated authored parts exercise the swept volume between the open/closed
  // leaf poses, without a foundation masking a collision with the leaf.
  expect(f.both(a,b)).toEqual([null,null]);
  const home:PartPlacement[]=[...cell,{...door[0],n:2}],front=f.make('front',cell,[0,0,1.8]);
  expect(f.both(f.make('a',cell),front)).toEqual([null,null]);
  // The approach extends beyond the saved footprint circle; the query bound
  // must include it rather than accepting early before the narrow phase.
  expect(placementProblem('structure',front.position,[f.make('a',home)],front.id,front.radius,f.radius)).toBeNull();
  expect(f.both(f.make('a',home),front).every(message=>message?.includes('standing room'))).toBe(true);
});

it('uses actual slope seating and invalidates cached decisions after field, orientation or content changes',()=>{
  const radius=21.6,right=anchorFrame({dir:position,yaw:0}).right;
  const slope:HeightField={id:'slope',waterLevel:null,heightAt:p=>radius-10+.06*radius*p.reduce((sum,n,i)=>sum+n*right[i],0),normalAt:p=>p};
  const f=fixture(radius,.47,position,slope),a=f.make('a'),b=f.make('b',square,[2.8,0,0]),cache=new StructurePlacementCache();
  const context={field:slope,blueprints:f.blueprints,cache};
  expect(structureFit(square,a.position,a.rotation,slope).problem).toBeNull();
  expect(structureFit(square,b.position,b.rotation,slope).problem).toBeNull();
  expect(structurePlacementProblem(a,b,context)).toBeNull();
  b.position=[...a.position];expect(structurePlacementProblem(a,b,context)).not.toBeNull();
  b.position=f.make('elsewhere',square,[2.8,0,0]).position;b.rotation+=Math.PI/4;
  expect(structurePlacementProblem(a,b,context)).toBeNull();
  expect(structurePlacementProblem(a,b,{...context,field:{...slope,waterLevel:100}})).toMatch(/ground/);
  f.blueprints.b=[0,1,2,3].flatMap((x,i)=>[0,1,2,3].map((z,j)=>({n:i*4+j+1,part:'floor.deck',x,z,level:0,rot:0})));
  expect(structurePlacementProblem(a,b,context)).not.toBeNull();
});

it('checks an enlarged edited building against neighbours while ignoring only its own previous placement',()=>{
  const f=fixture(),a=f.make('a'),b=f.make('b',square,[2.8,0,0]);
  expect(f.check(a,[a,b])).toBeNull();
  const wide:PartPlacement[]=[0,1,2,3].flatMap((x,i)=>[1,2].map((z,j)=>({n:i*2+j+1,part:'floor.deck',x,z,level:0,rot:0})));
  const edited={...a,blueprintHash:'expanded',...structureSize(wide)};
  expect(f.check(edited,[a,b],{...f.blueprints,expanded:wide})).toMatch(/too close/);
  expect(a.blueprintHash).toBe('a');expect(a.version).toBe(1);
});

it('retains landing and ordinary prop spacing without granting paths or props the structure rule',()=>{
  const f=fixture(),a=f.make('a'),b=f.make('b',square,[2.4,0,0]);
  expect(f.check({...b,position:SPAWN},[a])).toMatch(/landing/);
  for(const kind of ['tree','bench','cottage'] as const){
    const prop:PlacedObject={id:'prop',kind,position:a.position,rotation:0,version:1};
    expect(f.check(a,[prop])).toMatch(/too close/);
    expect(placementProblem(kind,a.position,[a],prop.id,undefined,f.radius)).toMatch(/too close/);
  }
});

it('covers all rendered village kit vertices at every LOD including the new roofs and sliding leaves',()=>{
  // Compare all 45 parts' real generated geometry against placement proxies instead of duplicating
  // the proxy formula in this regression. This is a vertex-coverage check.
  const field=flat(21.6),point=new Vector3();let checked=0;
  for(const lod of ['low','medium','high'] as const)for(const part of PART_IDS){
    const parts:PartPlacement[]=[{n:1,part,x:2,z:2,rot:0,level:0}],object:PlacedObject={id:part,kind:'structure',position,rotation:.47,version:1,blueprintHash:part,...structureSize(parts)};
    const fit=structureFit(parts,position,.47,field),prepared=new StructurePlacementCache().prepare(field,object,parts);
    const library=new StyleLibrary(lod,{scans:false,look:'village'}),model=buildBlueprintModel(parts,library,lod,{foundationDepth:fit.foundationDepth});
    try{
      model.object.position.fromArray(position).multiplyScalar(fit.baseRadius);model.object.quaternion.fromArray(anchorQuaternion({dir:position,yaw:.47}));model.object.updateMatrixWorld(true);
      const shapes=[...prepared.solids,...prepared.sweeps];let missed=0;
      model.object.traverseVisible(node=>{const mesh=node as Mesh;if(!mesh.isMesh)return;const vertices=mesh.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(node.matrixWorld);checked++;if(!shapes.some(shape=>shape.box.containsPoint(point)))missed++;}
      });
      expect(missed,`${part}/${lod} rendered vertices outside placement proxies`).toBe(0);
    }finally{model.dispose();library.dispose();}
  }
  expect(checked).toBeGreaterThan(20_000);
},30_000);
