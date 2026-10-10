import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import {layoutErrors} from '../src/shared/blueprint-model.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import type {HeightField} from '../src/assets/claude-geometry/core/ground.ts';
import {structureSize} from '../src/shared/blueprints.ts';
import {createPublicTownPlacementCheck,PUBLIC_OPERATION_RADII} from '../src/shared/public-town-reservations.ts';
import {placementProblem} from '../src/shared/planets.ts';
import type {PlacedObject} from '../src/shared/planets.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {PUBLIC_TOWN_ENVIRONMENT} from '../src/shared/public-town-layout.ts';
import {GroundWorld,STEP_HEIGHT} from '../src/shared/physics/world.ts';
import {HUB_SHIP} from '../src/shared/harbour-layout.ts';
import {HUB_DOCK} from '../src/shared/ports.ts';
import {NPCS,SPAWN,distance,validPosition} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';

const radius=21.6,field=fieldOf(PUBLIC_TOWN_ENVIRONMENT,radius);
function deepRoom(){
 const parts:PartPlacement[]=[],add=(part:PartPlacement['part'],x:number,z:number,rot:PartPlacement['rot']=0,level=0)=>parts.push({n:parts.length+1,part,x,z,rot,level});
 for(let x=1;x<=3;x++)for(let z=1;z<=4;z++){
  add('floor.deck',x,z);add('roof.deck',x,z,0,1);
  for(const[dx,dz,rot]of [[0,1,0],[1,0,1],[0,-1,2],[-1,0,3]] as const)if(x+dx<1||x+dx>3||z+dz<1||z+dz>4){
   add(x===2&&z===1&&rot===2?'wall.door.open':(x+z+rot)%3===0?'wall.window':'wall.solid',x,z,rot);add('roof.parapet',x,z,rot,1);
  }
 }
 add('structure.column',2,2);add('step.entry',2,0,2);return parts;
}
const parts=deepRoom(),blueprints={room:parts};
const room=(id:string,position:Vec3,rotation:number):PlacedObject=>({id,kind:'structure',position,rotation,version:10,blueprintHash:'room',...structureSize(parts)});
// Exact independently frozen authoring examples. Tests reconstruct only the
// ordinary 12 m² room, not an untracked .data snapshot or a whole draft town.
const micaRooms=[
 room('mica-back',[.44698294246330894,.868953848409537,-.21242753701226566],1.5879886690809943),
 room('polar-turn',[.1909810573566909,.9467563133391635,-.2591885778412234],4.721034712831862),
];
const spawnRoom=room('landing-return',[.12873314201432226,.9792814744134364,.15631881530310562],3.1450158094717704);
const privateCheck=(o:PlacedObject,objects:PlacedObject[]=[])=>placementProblem('structure',o.position,objects,o.id,o.radius,radius,2,{rotation:o.rotation,blueprintHash:o.blueprintHash,blueprints,field});

it('admits the actual deep-room examples without shrinking the fixed operation radii',()=>{
 expect(layoutErrors(parts)).toEqual([]);expect(PUBLIC_OPERATION_RADII).toEqual({spawn:1,mica:.6,sol:.6,dock:.6});
 const check=createPublicTownPlacementCheck(field,radius,blueprints),before=structuredClone(micaRooms);
 for(const object of micaRooms){
  expect(distance(object.position,NPCS.mica.position,radius)).toBeLessThan(object.radius!+.6);
  expect(privateCheck(object)).toBeNull();expect(check(object,micaRooms)).toBeNull();
 }
 expect(micaRooms).toEqual(before);
 expect(distance(spawnRoom.position,SPAWN,radius)).toBeLessThan(spawnRoom.radius!+1);
 expect(privateCheck(spawnRoom)).toMatch(/landing spot/);
 expect(check(spawnRoom,[])).toBeNull();
});

it('preserves actual neighbour geometry and does not ignore operation space when editing the same ID',()=>{
 const check=createPublicTownPlacementCheck(field,radius,blueprints),object=micaRooms[0];
 expect(check(object,[{...object,id:'other-building'}])).toMatch(/walls, roofs and foundations/);
 for(const[id,point]of [['spawn',SPAWN],['mica',NPCS.mica.position],['sol',NPCS.sol.position],['dock',HUB_DOCK]] as const){
  const edited={...object,position:[...point] as Vec3};
  expect(check(edited,[object]),id).toMatch(/actual .*space/);
 }
});

it('rejects a room covering the operation disk even when the exact NPC capsule still fits',()=>{
 const object={...micaRooms[0],position:[...NPCS.mica.position] as Vec3},world=new GroundWorld({id:'reservation-counterexample',revision:0,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects:[object],blueprints});
 const p=NPCS.mica.position,pose={position:p,radius:world.support(p,world.radius(p)+STEP_HEIGHT).radius,grounded:true,verticalSpeed:0};
 expect(world.blocked(pose)).toBe(false);
 expect(createPublicTownPlacementCheck(field,radius,blueprints)(object,[])).toMatch(/mica standing/);
});

it('keeps the complete ship circle for every ordinary candidate, including roads',()=>{
 const check=createPublicTownPlacementCheck(field,radius,blueprints),position=localToDir({dir:HUB_SHIP,yaw:0},radius,[4,0,0]),object={...micaRooms[0],position};
 expect(distance(position,HUB_SHIP,radius)).toBeLessThan(object.radius!+2.5);
 expect(check(object,[])).toBe('Preserve ship landing clearance.');
 const path:PlacedObject={id:'path',kind:'path',position:HUB_SHIP,rotation:0,version:1,assetVersion:2};
 expect(check(path,[])).toBe('Preserve ship landing clearance.');
});

it('allows a real level-zero road support but not a residential floor or an added obstacle',()=>{
 const flat:HeightField={id:'flat-public',waterLevel:null,heightAt:()=>radius-10,normalAt:p=>p};
 const road:PartPlacement[]=[{n:1,part:'street.paving',x:2,z:2,level:0,rot:0}],houseFloor:PartPlacement[]=[{...road[0],part:'floor.deck'}],withPost:PartPlacement[]=[...road,{n:2,part:'structure.column',x:2,z:2,level:0,rot:0}];
 for(const[id,content,allowed]of [['road',road,true],['house',houseFloor,false],['post',withPost,false]] as const){
  const object:PlacedObject={id,kind:'structure',position:[...NPCS.mica.position],rotation:0,version:1,blueprintHash:id,...structureSize(content)},check=createPublicTownPlacementCheck(flat,radius,{[id]:content});
  expect(check(object,[])===null,id).toBe(allowed);
 }
});

it('fails closed for unresolved or malformed public buildings even with no neighbours',()=>{
 const check=createPublicTownPlacementCheck(field,radius,blueprints),object=micaRooms[0];
 expect(check({...object,blueprintHash:'missing'},[])).toMatch(/blueprint/);
 expect(check({...object,radius:.1},[])).toMatch(/complete building footprint/);
 expect(check({...object,rotation:NaN},[])).toMatch(/orientation/);
 expect(check({...object,position:[NaN,0,0]},[])).toMatch(/point/);
 const bad={bad:[{...parts[0],level:4}]};
 expect(createPublicTownPlacementCheck(field,radius,bad)({...object,blueprintHash:'bad'},[])).toMatch(/layout/);
});

it('retains the original private landing rejection and ordinary Path treatment',()=>{
 expect(privateCheck(spawnRoom,[{...spawnRoom,id:'overlap'}])).toBe('Leave a little space around the landing spot.');
 const check=createPublicTownPlacementCheck(field,radius,blueprints),path:PlacedObject={id:'path',kind:'path',position:SPAWN,rotation:0,version:1,assetVersion:2};
 expect(check(path,[])).toBe('Leave a little space around the landing spot.');
 expect(placementProblem('path',[NaN,0,0],[])).toBe('Choose a point on the planet.');
});

it('requires canonical public directions while retaining private tolerance and normalization',()=>{
 const check=createPublicTownPlacementCheck(field,radius,blueprints);
 expect(check(spawnRoom,[])).toBeNull();
 for(const scale of [.9995,1.0005]){
  const object={...spawnRoom,position:spawnRoom.position.map(n=>n*scale) as Vec3};
  expect(validPosition(object.position)).toBe(true);
  expect(check(object,[])).toBe('Use a unit direction for public placement.');
  expect(privateCheck(object)).toBe('Leave a little space around the landing spot.');
 }
});

it('leaves actual task LOS and height as independent acceptance conditions',()=>{
 // A real wall between two individually clear standing capsules is still
 // opaque to the same camera ray used by the client task-resident guard.
 const p=NPCS.mica.position,wall:PartPlacement[]=[{n:1,part:'floor.deck',x:0,z:0,rot:0,level:0},{n:2,part:'wall.solid',x:0,z:0,rot:0,level:0}],object:PlacedObject={id:'wall',kind:'structure',position:localToDir({dir:p,yaw:0},radius,[0,0,.15]),rotation:0,version:1,blueprintHash:'wall',...structureSize(wall)};
 const world=new GroundWorld({id:'task-los-counterexample',revision:0,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects:[object],blueprints:{wall}}),point=localToDir({dir:p,yaw:0},radius,[0,0,1.3]);
 const npcFeet=world.support(p,world.radius(p)+STEP_HEIGHT).radius,feet=world.support(point,world.radius(point)+STEP_HEIGHT).radius;
 expect(world.blocked({position:p,radius:npcFeet,grounded:true,verticalSpeed:0})).toBe(false);
 expect(world.blocked({position:point,radius:feet,grounded:true,verticalSpeed:0})).toBe(false);
 expect(distance(point,p,radius)).toBeLessThan(1.53);expect(Math.abs(feet-npcFeet)).toBeLessThan(.65);
 const head=new Vector3(...point).multiplyScalar(feet+1.35),eyes=new Vector3(...p).multiplyScalar(npcFeet+1.3);
 expect(world.cameraDistance(head,eyes)+.03).toBeLessThan(head.distanceTo(eyes));
 expect(createPublicTownPlacementCheck(field,radius,{wall})(object,[])).toMatch(/mica standing/);
});
