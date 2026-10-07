import {Vector3} from 'three';
import type {HeightField} from '../assets/claude-geometry/core/ground.ts';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';
import type {Blueprint,PartPlacement,Rot} from '../assets/claude-geometry/blueprint/model.ts';
import type {PartId} from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import {structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {placementProblem} from './planets.ts';
import type {PlacedObject,BuildKind} from './planets.ts';
import {NPCS,SPAWN} from './world.ts';
import type {Vec3} from './world.ts';
import {HUB_RADIUS} from './world-size.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_SHIP,facePoint,villagePoint,localPoint} from './harbour-layout.ts';

// System-owned composition, authored within the unchanged player limits:
// eight structures / sixty-four placed objects. No bespoke prop geometry.
export const PUBLIC_FIELD:HeightField={id:'compact-harbour',waterLevel:null,heightAt:()=>HUB_RADIUS-10,normalAt:p=>[...p]};
/** Rebase the public ground without stretching metre-sized construction. */
export const publicField=(radius=HUB_RADIUS):HeightField=>radius===HUB_RADIUS?PUBLIC_FIELD:{
 id:`public-harbour:${radius}`,waterLevel:null,heightAt:()=>radius-10,normalAt:p=>[...p],
};
function terrace(id:string,name:string,tall=false,port=false):Blueprint{
 const parts:PartPlacement[]=[];
 const add=(part:PartId,x:number,level:number,z:number,rot:Rot=0)=>parts.push({part,x,level,z,rot,n:parts.length+1});
 for(const offset of [0,3]){
  const levels=tall&&offset===3?2:1;
  for(let level=0;level<levels;level++){
   for(const x of [offset,offset+1])for(const z of [0,1])add('floor.deck',x,level,z);
   add(level===0?'wall.door.open':'wall.window',offset,level,1);add('wall.window',offset+1,level,1);
   add('wall.solid',offset,level,0,2);add('wall.louvre',offset+1,level,0,2);
   for(const z of [0,1]){add('wall.window',offset,level,z,3);add('wall.solid',offset+1,level,z,1);}
   add('structure.column',offset,level,0,2);add('structure.column',offset+1,level,0,1);add('structure.column',offset,level,1,3);add('structure.column',offset+1,level,1,0);
  }
  for(const x of [offset,offset+1])for(const z of [0,1])add('roof.slope',x,levels,z,z===0?2:0);
 }
 for(let x=0;x<5;x++)for(const z of [2,3])add(port?'street.road':'street.paving',x,0,z,z===2?2:0);
 add('service.light',4,0,3,0);
 for(const x of [0,1,3,4])add(port?'rail.guard':'street.pipes',x,0,3,0);
 // Furnish the existing rooms and courts with ordinary player pieces. The
 // doorway column and the central promenade remain clear for both couriers.
 for(const offset of [0,3]){
  if(tall&&offset===3)add('furniture.shelf',4,0,0,1);
  else{add(port?'storage.crates':'furniture.table',offset+1,0,0);if(!port)add('furniture.chair',offset+1,0,0,2);}
  add('light.wall',offset,0,0,2);
 }
 const frontage=parts.find(p=>p.part==='wall.window'&&p.x===1&&p.z===1&&p.level===0)!;
 frontage.part='wall.solid';add(port?'sign.mail':tall?'sign.blank':'sign.cup',1,0,2,2);
 if(port){add('storage.barrel',4,0,2);add('storage.crates',1,0,2,2);}
 else{add('garden.bed',1,0,2);add('furniture.bench',4,0,2);}
 return {id:id as BlueprintId,name,parts,groups:[]};
}
export const PUBLIC_BLUEPRINTS=[
 terrace('6f803480-9eae-4439-8ff2-33c0b0f4b4b1','Village · garden pair'),
 terrace('6f803480-9eae-4439-8ff2-33c0b0f4b4b2','Village · loft pair',true),
 terrace('6f803480-9eae-4439-8ff2-33c0b0f4b4b3','Village · port pair',false,true),
];
// SHA-256 from the unmodified player blueprint codec; checked in tests.
export const PUBLIC_HASHES=["7351f39ff6fc7c9917866503061221a09f58723f5343ba224b8c41c72d6eb39a","61a77fce6922183b7cba44a88da13847c8cfa8e33b540dbd6a8817d8f74e3cf2","25de9f9bc61a392bacf4e993d8d92617cf4e3485e7a125de27e10921fddce0dd"];
export const PUBLIC_CONTENTS:BlueprintContents=Object.fromEntries(PUBLIC_BLUEPRINTS.map((b,i)=>[PUBLIC_HASHES[i],b.parts]));
export const HUB_OBJECTS:PlacedObject[]=[];
export const HUB_LOTS:{object:PlacedObject;blueprint:Blueprint;district:string}[]=[];
const sites:[string,number,number,number,number,number][]=[
 ['post',8.5,1,4,1,0],['post',11,9,6,6,1],['post',0,-1,0,5,0],
 ['orchard',-9.5,1,-5,1,0],['orchard',-12,10,-6,7,1],['orchard',-4.5,17,0,10,0],
 ['port',8,-11,3,-9,2],['port',-10,-14,-5,-10,2],
];
for(const [district,x,z,tx,tz,b]of sites){const position=villagePoint(x,z),blueprint=PUBLIC_BLUEPRINTS[b],object:PlacedObject={id:'public-lot-'+HUB_LOTS.length,kind:'structure',position,rotation:(facePoint(position,villagePoint(tx,tz))+Math.PI*2)%(Math.PI*2),version:1,blueprintHash:PUBLIC_HASHES[b],...structureSize(blueprint.parts)};HUB_OBJECTS.push(object);HUB_LOTS.push({object,blueprint,district});}
const spacing=(a:Vec3,b:Vec3)=>new Vector3(...a).angleTo(new Vector3(...b))*HUB_RADIUS;
// Navigation bearings only; they do not draw a private ribbon road. Actual
// paving is the blueprint's street.paving/street.road and quick-build path.
export const PUBLIC_WALKS:Vec3[][]=[[SPAWN,HUB_DOCK],[SPAWN,NPCS.mica.position,HUB_DOCK],[SPAWN,NPCS.sol.position,HUB_DOCK]];
function routeDistance(point:Vec3){let best=Infinity;for(const road of PUBLIC_WALKS)for(let k=1;k<road.length;k++)for(let i=0;i<=40;i++){const at=new Vector3(...road[k-1]).lerp(new Vector3(...road[k]),i/40).normalize().toArray() as Vec3;best=Math.min(best,spacing(point,at));}return best;}
function prop(kind:BuildKind,point:Vec3,rotation=0){if(placementProblem(kind,point,HUB_OBJECTS,undefined,undefined,HUB_RADIUS)||spacing(point,HUB_SHIP)<3.8)return false;HUB_OBJECTS.push({id:'public-'+kind+'-'+HUB_OBJECTS.length,kind,assetVersion:2,position:point,rotation:(rotation%(Math.PI*2)+Math.PI*2)%(Math.PI*2),version:1});return true;}
for(const road of PUBLIC_WALKS){let made=0;for(let k=1;k<road.length;k++){const d=spacing(road[k-1],road[k]),steps=Math.ceil(d/.7);for(let i=0;i<=steps&&made<8;i++)if(prop('path',new Vector3(...road[k-1]).lerp(new Vector3(...road[k]),i/steps).normalize().toArray() as Vec3))made++;}}
const clusters=[[3,-6],[-3,-4],[4,6],[-4,6],[15,1],[-16,2],[17,11],[-18,12],[8,22],[-9,24],[20,-10],[-20,-14],[0,28],[0,-24]];
for(let i=0;i<10;i++)for(const [cx,cz]of clusters){if(HUB_OBJECTS.filter(o=>o.kind==='tree').length>=20)break;const a=i*2.39996,r=.8+Math.sqrt(i)*1.2,point=villagePoint(cx+Math.cos(a)*r,cz+Math.sin(a)*r);if(routeDistance(point)>1.2)prop('tree',point,i*Math.PI/12);}
for(const [kind,limit]of [['bench',4],['flowers',8]] as const)for(let i=0;i<180&&HUB_OBJECTS.filter(o=>o.kind===kind).length<limit;i++){const a=i*2.39996,r=4+Math.sqrt(i)*.75,point=villagePoint(Math.cos(a)*r,Math.sin(a)*r);if(routeDistance(point)>.85)prop(kind,point,Math.round(a/(Math.PI/12))*Math.PI/12);}
// The boarding marker is also a normal quick-build prop, at catalogue size.
for(const x of [-.95,.95])prop('lamp',localPoint(HUB_DOCK,0,x,0));
export const HUB_COUNTS={buildings:16,walkInRooms:16,structures:HUB_LOTS.length,objects:HUB_OBJECTS.length,...Object.fromEntries(['tree','path','bench','flowers','lamp'].map(kind=>[kind,HUB_OBJECTS.filter(o=>o.kind===kind).length])),blueprintLamps:24};
