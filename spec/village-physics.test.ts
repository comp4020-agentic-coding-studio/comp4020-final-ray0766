import {expect,it} from 'vitest';
import {Vector3,Quaternion} from 'three';
import type {Mesh} from 'three';
import {PART_IDS,buildPart} from '../src/shared/blueprint-parts.ts';
import {buildProp} from '../src/assets/claude-geometry/props/index.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {disposeObject3D} from '../src/assets/claude-geometry/core/dispose.ts';
import {anchorQuaternion,localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import {defaultEnvironment,encodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {DOOR_OPENING,LEAVES,leafX} from '../src/assets/claude-geometry/blueprint/parts/village/walls.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {homeDoorLeaves,homeDoorPanelX,homeDoorSweepContains,HOME_DOOR_SLIDING} from '../src/shared/home-door.ts';
import {PART_COLLIDERS,SLOPE_BOUNDS} from '../src/shared/physics/parts.ts';
import type {PartBox} from '../src/shared/physics/parts.ts';
import {villageLampColliders} from '../src/shared/physics/props.ts';
import {QUICK_PARTS} from '../src/shared/quick-parts.ts';
import {objectRadius,objectHeight} from '../src/shared/planets.ts';
import {GroundWorld,FIXED_STEP,PHYSICS_VERSION,HUB_PHYSICS_VERSION} from '../src/shared/physics/world.ts';
import {structureFit,structureSize} from '../src/shared/blueprints.ts';
import {structurePlacementProblem,isRoadSurface} from '../src/shared/structure-placement.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import type {PlacedObject} from '../src/shared/planets.ts';
import type {Vec3} from '../src/shared/world.ts';
import {normalize} from '../src/shared/world.ts';

function contains(box:PartBox,point:Vector3){
 const inverse=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),box.yaw??0).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),box.pitch??0)).invert();
 const local=point.clone().sub(new Vector3(...box.center)).applyQuaternion(inverse);
 return Math.abs(local.x)<=box.half[0]+.0001&&Math.abs(local.y)<=box.half[1]+.0001&&Math.abs(local.z)<=box.half[2]+.0001;
}
it('covers the actual solid meshes at all LODs without depending on the placement envelope',()=>{
 // Paint (3 mm), recessed pad lights (8 mm), ramp cleats (18 mm), and
 // flower-bed foliage are appearance details; their deck/stone stays solid.
 const detail=new Set(['street.road','street.road.corner','pad.quarter','ramp.entry','garden.bed']);
 let checked=0;
 for(const part of PART_IDS.filter(id=>!detail.has(id)))for(const lod of ['low','medium','high'] as const){
  const lib=new StyleLibrary(lod,{scans:false,look:'village'}),built=buildPart(part,lib),boxes=PART_COLLIDERS[part]();let missed=0;
  built.group.updateMatrixWorld(true);
  built.group.traverse(node=>{const mesh=node as Mesh;if(!mesh.isMesh)return;const positions=mesh.geometry.getAttribute('position');
   for(let i=0;i<positions.count;i++){const point=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);checked++;if(!boxes.some(box=>contains(box,point)))missed++;}
  });
  expect(missed,`${part}/${lod}`).toBe(0);disposeObject3D(built.group);lib.dispose();
 }
 expect(checked).toBeGreaterThan(20_000);
});
it('uses measured all-LOD quick-prop extents and a separate versioned stone lantern',()=>{
 for(const kind of ['tree','flowers','bench','lamp'] as const){
  let reach=0,height=0;
  for(const lod of ['low','medium','high'] as const){
   const lib=new StyleLibrary(lod,{scans:false,look:'village'}),contract=QUICK_PARTS[kind],built=contract?buildPart(contract.part,lib):buildProp('lamp',lib);
   built.group.updateMatrixWorld(true);
   built.group.traverse(node=>{const mesh=node as Mesh;if(!mesh.isMesh)return;const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){const point=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).add(new Vector3(...(contract?.offset??[0,0,0])));reach=Math.max(reach,Math.hypot(point.x,point.z));height=Math.max(height,point.y);if(kind==='lamp')expect(villageLampColliders().some(box=>contains(box,point))).toBe(true);}
   });disposeObject3D(built.group);lib.dispose();
  }
  expect(objectRadius({kind,assetVersion:2})).toBeGreaterThanOrEqual(reach);
  expect(objectRadius({kind,assetVersion:2})-reach).toBeLessThan(.0002);
  expect(objectHeight({kind,assetVersion:2})).toBeCloseTo(height,4);
 }
 const at=normalize([.8,1,.2]);
 const world=new GroundWorld({id:'lamp-test',revision:1,radius:21.6,objects:[{id:'old',kind:'lamp',position:at,rotation:0,version:1},{id:'new',kind:'lamp',assetVersion:2,position:at,rotation:0,version:1}]});
 expect(world.bodies.find(b=>b.objectId==='old')!.round).toMatchObject({radius:.26,height:2.1});
 expect(world.bodies.find(b=>b.objectId==='new')!.round).toBeUndefined();
 expect(world.bodies.find(b=>b.objectId==='new')!.colliders.map(c=>c.tag)).toContain('stone lantern shaft');
});

it('pins six sliding leaves to the source model and leaves the old inward swing clear',()=>{
 expect([PHYSICS_VERSION,HUB_PHYSICS_VERSION]).toEqual([10,11]);
 expect(HOME_DOOR_SLIDING.width).toBe(LEAVES.width);expect(HOME_DOOR_SLIDING.top).toBe(DOOR_OPENING.top);
 expect(HOME_DOOR_SLIDING.tracks).toEqual(LEAVES.tracks);
 for(const open of [false,true])for(const side of [-1,1])for(let i=0;i<3;i++)expect(homeDoorPanelX(side,i,open)).toBe(leafX(side,i,open));
 expect(homeDoorLeaves(true)).toHaveLength(6);
 expect(homeDoorLeaves(true)[0].center[0]+homeDoorLeaves(true)[0].half[0]).toBeCloseTo(-.355);
 expect(homeDoorSweepContains([0,0,.13])).toBe(true);expect(homeDoorSweepContains([-.3,0,-.5])).toBe(false);
 expect(PART_COLLIDERS['wall.door.open']().some(s=>s.tag==='open leaf')).toBe(false);
});
it('matches new low furniture and channel height while keeping roofs non-walkable',()=>{
 const top=(id:Parameters<typeof isRoadSurface>[0][number]['part'])=>Math.max(...PART_COLLIDERS[id]().map(b=>b.center[1]+b.half[1]));
 expect(top('furniture.table')).toBeCloseTo(.45);expect(top('furniture.chair')).toBeCloseTo(.3);
 expect(top('furniture.bench')).toBeCloseTo(.44);expect(top('street.pipes')).toBeCloseTo(.46);
 expect(SLOPE_BOUNDS.front).toBeGreaterThan(.9621);
 for(const id of ['roof.slope','roof.slope.hip','roof.slope.valley','roof.verge.left','roof.verge.right'] as const)expect(PART_COLLIDERS[id]().every(b=>!b.support)).toBe(true);
 expect(PART_COLLIDERS['stair.straight']().filter(b=>b.support)).toHaveLength(11);
});
function roads(length:number,at:Vec3,rotation:number){
 const radius=21.6,env=defaultEnvironment('temperate',123);Object.assign(env.params,{relief:.3,roughness:.025,waterLevel:-.3});
 const environment=encodeEnvironment(env),field=fieldOf(environment,radius);
 const parts:PartPlacement[]=[];for(let x=0;x<2;x++)for(let z=0;z<length;z++)parts.push({n:parts.length+1,part:'street.road.plain',x,z,rot:0,level:0});
 const fit=structureFit(parts,at,rotation,field),b=localToDir({dir:at,yaw:rotation},fit.baseRadius,[0,0,length*.97]);
 const objects:PlacedObject[]=[at,b].map((position,i)=>({id:String(i),kind:'structure',position,rotation,version:1,blueprintHash:'road',...structureSize(parts)}));
 const world=new GroundWorld({id:'road-test',revision:1,radius,environment,objects,blueprints:{road:parts}});
 return {parts,objects,world,field,environment,radius};
}
it('joins ordinary 3 m and 5 m road decks on the sphere and walks both directions across their real supports',()=>{
 for(const length of [3,5])for(const at of [[0,1,0],[0,-1,0],normalize([.8,1,.2])] as Vec3[])for(const rotation of [0,.7]){
  const f=roads(length,at,rotation),context={field:f.field,blueprints:{road:f.parts}};
  expect(structurePlacementProblem(f.objects[0],f.objects[1],context),`${length}/${at}/${rotation}`).toBeNull();
  expect(structurePlacementProblem(f.objects[1],f.objects[0],context)).toBeNull();
  for(const [from,to] of [[0,1],[1,0]]){
   let pose=f.world.recover(f.world.pose(f.objects[from].position));
   for(let step=0;step<450;step++){
    const p=new Vector3(...pose.position),target=new Vector3(...f.objects[to].position),distance=p.angleTo(target)*pose.radius;
    if(distance<.02)break;
    const next=p.lerp(target,Math.min(1,2.5*FIXED_STEP/distance)).normalize().toArray() as Vec3;
    pose=f.world.move(pose,next,FIXED_STEP);
   }
   expect(new Vector3(...pose.position).angleTo(new Vector3(...f.objects[to].position))*f.radius,`${length}/${at}/${rotation}/${from}`).toBeLessThan(.03);
   expect(f.world.blocked(pose)).toBe(false);
  }
 }
},20_000);
it('does not grant a road join to buildings or raised decks, and checks the whole overlap',()=>{
 const f=roads(5,normalize([.8,1,.2]),0);
 expect(isRoadSurface(f.parts)).toBe(true);
 expect(isRoadSurface([...f.parts,{n:100,part:'wall.solid',x:0,z:0,rot:0,level:0}])).toBe(false);
 expect(isRoadSurface(f.parts.map(p=>({...p,level:1})))).toBe(false);
 // Crossed five-metre rectangles on the same foundation plane are a normal plaza.
 const crossed={...f.objects[0],id:'cross',rotation:Math.PI/2};
 expect(structurePlacementProblem(f.objects[0],crossed,{field:f.field,blueprints:{road:f.parts}})).toBeNull();
 // A house remains a solid, even if most of its parts happen to be paving.
 const house=[...f.parts,{n:100,part:'wall.solid' as const,x:0,z:0,rot:0 as const,level:0}];
 expect(structurePlacementProblem(f.objects[0],{...crossed,blueprintHash:'house'},{field:f.field,blueprints:{road:f.parts,house}})).toMatch(/too close/);
});
it('rejects the measured polar join whose bare planes fit but capsule needs a 27 cm step',()=>{
 const env=defaultEnvironment('temperate',20261009);Object.assign(env.params,{relief:.3,roughness:.025,waterLevel:-.3,woodland:.05,outcrops:0});
 const field=fieldOf(encodeEnvironment(env),21.6),parts=roads(4,[0,1,0],0).parts;
 const at=(latitude:number):Vec3=>{const angle=latitude*Math.PI/180;return [-Math.cos(angle)*Math.SQRT1_2,Math.sin(angle),-Math.cos(angle)*Math.SQRT1_2];};
 const object=(id:string,latitude:number):PlacedObject=>{
  const position=at(latitude),up=new Vector3(...position),inverse=new Quaternion().fromArray(anchorQuaternion({dir:position,yaw:0})).invert();
  const forward=new Vector3(0,1,0).projectOnPlane(up).normalize().applyQuaternion(inverse);
  return {id,kind:'structure',position,rotation:Math.atan2(forward.x,forward.z),version:1,blueprintHash:'road',...structureSize(parts)};
 };
 const a=object('polar-17',-90+17.5*180/19),b=object('polar-18',-90+18.5*180/19);
 const before=JSON.stringify([a,b,parts]);
 expect(structurePlacementProblem(a,b,{field,blueprints:{road:parts}})).toMatch(/walking capsule/);
 expect(structurePlacementProblem(b,a,{field,blueprints:{road:parts}})).toMatch(/walking capsule/);
 expect(JSON.stringify([a,b,parts])).toBe(before);
});
it('keeps the camera above a low eave clear while clipping the actual deeper tiled eave',()=>{
 const f=roads(3,normalize([.8,1,.2]),.3),parts:PartPlacement[]=[{n:1,part:'floor.deck',x:2,z:2,rot:0,level:0},{n:2,part:'roof.slope',x:2,z:2,rot:0,level:1}];
 const object={...f.objects[0],blueprintHash:'roof',...structureSize(parts)},fit=structureFit(parts,object.position,object.rotation,f.field);
 const world=new GroundWorld({id:'roof-test',revision:1,radius:f.radius,environment:f.environment,objects:[object],blueprints:{roof:parts}});
 const q=anchorQuaternion({dir:object.position,yaw:object.rotation});
 const point=(y:number)=>new Vector3(0,y,.93).applyQuaternion(new Quaternion().fromArray(q)).addScaledVector(new Vector3(...object.position),fit.baseRadius);
 expect(world.cameraDistance(point(1.8),point(2.6))).toBeLessThan(.5);
 expect(world.cameraDistance(point(2.65),point(3.65))).toBeCloseTo(1,5);
});
