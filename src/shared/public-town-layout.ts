import {Quaternion,Vector3} from 'three';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';
import type {Blueprint,PartPlacement} from '../assets/claude-geometry/blueprint/model.ts';
import {partTransform,pivotOf} from '../assets/claude-geometry/blueprint/model.ts';
import {homeCottage,padStall,relayHut,surveyPost,villageCottage} from '../assets/claude-geometry/blueprint/samples.ts';
import {defaultEnvironment,encodeEnvironment} from '../assets/claude-geometry/terrain/env.ts';
import {anchorFrame,localToDir} from '../assets/claude-geometry/core/anchor.ts';
import {districtHome,districtWorkshopWithEntryStep} from './district-layout.ts';
import {HOME_INFRASTRUCTURE} from './home-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {structureFit,structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {placementProblem} from './planets.ts';
import type {PlacedObject,BuildKind} from './planets.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_SHIP} from './harbour-layout.ts';
import {NPCS,SPAWN,distance} from './world.ts';
import type {Vec3} from './world.ts';
import {PUBLIC_TOWN_CAPACITY} from './world-capacity.ts';
import {StructurePlacementCache} from './structure-placement.ts';
import {PUBLIC_TOWN_DATA} from './public-town-data.ts';
import {planRoutePaths} from './path-layout.ts';
import type {RoutePathCoverage} from './path-layout.ts';
import {PART_COLLIDERS} from './physics/parts.ts';
import {GroundWorld} from './physics/world.ts';
import {PathPlacementCache} from './path-structure-placement.ts';

/** The public town is an explicit larger template; no extra scenery sits
 * outside its object ledger. Private construction retains its own limits. */
export const PUBLIC_TOWN_VERSION=8;
export const PUBLIC_TOWN_LIMITS=PUBLIC_TOWN_CAPACITY;
const environment=defaultEnvironment('temperate',20261009);
Object.assign(environment.params,{relief:.3,roughness:.025,vegetation:.36,waterLevel:-.3,woodland:.05,outcrops:0});
export const PUBLIC_TOWN_ENVIRONMENT=encodeEnvironment(environment);
export interface TownDistrict {id:string;name:string;nameZh:string;center:Vec3;objectIds:string[]}
export interface PublicTown {
 version:number;radius:number;environment:string;objects:PlacedObject[];blueprints:BlueprintContents;
 routes:HomeSurfaceRoute[];pavingRoutes:HomeSurfaceRoute[];renderDistricts:TownDistrict[];
 destinations:{id:string;position:Vec3;buildingId:string}[];
 buildings:string[];roadObjects:string[];landmarks:{id:string;position:Vec3}[];
 entranceCoverage?:RoutePathCoverage[];
}
export const townPoint=(latitude:number,longitude:number):Vec3=>{
 const a=latitude*Math.PI/180,b=longitude*Math.PI/180;
 return [Math.cos(a)*Math.sin(b),Math.sin(a),Math.cos(a)*Math.cos(b)];
};
export function townDistrictFor(point:Vec3):string {
 const latitude=Math.asin(point[1])*180/Math.PI;
 const longitude=(Math.atan2(point[0],point[2])*180/Math.PI+360)%360;
 return `town-${latitude>30?'north':latitude< -30?'south':'middle'}-${Math.floor(longitude/90)%4}`;
}
const names=[
 ['Lantern gardens','灯笼庭院'],['Post quarter','邮政街区'],['Harbour market','港口集市'],['Pine terraces','松林台街'],
 ['Potters’ street','陶艺街'],['Tea house row','茶屋街'],['Courtyard homes','庭院住宅'],['Canal workshops','水渠工坊'],
 ['South orchard','南部果园'],['Quiet court','静庭'],['Hill cottages','坡地民居'],['Lookout gardens','望台花园'],
];
export function townDistricts():TownDistrict[] {
 return [55,0,-55].flatMap((latitude,row)=>Array.from({length:4},(_,column)=>({
  id:`town-${['north','middle','south'][row]}-${column}`,name:names[row*4+column][0],nameZh:names[row*4+column][1],
  center:townPoint(latitude,column*90+45),objectIds:[],
 })));
}
function deck(name:string,width:number,length:number):Blueprint {
 const parts:PartPlacement[]=[];
 for(let x=0;x<width;x++)for(let z=0;z<length;z++)parts.push({n:parts.length+1,part:'street.road.plain',x,z,level:0,rot:0});
 return {id:'51549d27-cabe-4d99-af34-a10000000000' as BlueprintId,name,parts,groups:[]};
}
const teaHouse=districtHome();
teaHouse.parts=teaHouse.parts.map(part=>part.part==='sign.mail'?{...part,part:'sign.cup'}:part);
function gardenPavilion():Blueprint {
 const blueprint=structuredClone(HOME_INFRASTRUCTURE[0]);
 const add=(part:PartPlacement['part'],x:number,z:number,rot:PartPlacement['rot']=0)=>blueprint.parts.push({n:100+blueprint.parts.length,part,x,z,rot,level:0});
 for(const x of [0,3])for(const z of [1,2,3])add('street.paving',x,z);
 add('street.paving',1,3);
 for(const x of [0,3]){add('rail.guard',x,1,2);add('rail.guard',x,3);add('garden.bed',x,1);}
 for(const z of [1,2,3]){add('rail.guard',0,z,3);add('rail.guard',3,z,1);}
 add('furniture.bench',0,2,1);add('garden.pot',3,3,1);
 return {...blueprint,name:'Shared garden pavilion'};
}
function townCottage():Blueprint {
 const blueprint=villageCottage();
 blueprint.parts=blueprint.parts.filter(p=>!(p.part==='street.kerb'&&p.x===1&&p.z===4))
  .map(p=>p.part==='street.paving'&&p.x===1&&p.z===4?{...p,part:'step.entry'}:p);
 return blueprint;
}
function townSurveyPost():Blueprint {
 const blueprint=surveyPost();
 blueprint.parts.push({n:100,part:'step.entry',x:3,z:3,level:0,rot:0});
 return blueprint;
}
export const PUBLIC_TOWN_BLUEPRINTS:Blueprint[]=[
 townCottage(),homeCottage(),relayHut(),townSurveyPost(),districtHome(),districtWorkshopWithEntryStep(),
 {...teaHouse,name:'Tea house'},structuredClone(HOME_INFRASTRUCTURE[0]),padStall(),
 deck('lane',2,4),deck('crossing',3,3),deck('polar lane',2,2),deck('polar square',2,2),gardenPavilion(),deck('junction lane',2,3),deck('short lane',2,1),deck('door landing',1,1),deck('polar court',4,4),
].map((blueprint,index)=>({...blueprint,id:`51549d27-cabe-4d99-af34-a1${String(index).padStart(10,'0')}` as BlueprintId,
 name:`Town · ${blueprint.name}`}));
// Content-addressed ordinary blueprints, checked against the canonical codec.
export const PUBLIC_TOWN_HASHES=['fa832dd85a321da376c731f777aa65e9796eed7da65e96a7321ea544a62baf25','c4374061b3e838eab1143a8c8bf29bb23876372bda9b77682ca545f5165f939d','6b5514cb44e732694ec114a0626214fb9829d74d96c5ff291a5ae5d41613ec9f','b254c8da217d42e1112353691e312ee21c16496b775494fb6a2761a379f0b94d','f9fb9e44efa78eeae6fd373d3a461bd9a2a62440faffa25688c5e768d8f9975d','7cd68a5f77f81fd8b1ffde1cbac991cb563403a57d0f6cc0764f8552994831ad','e8298b4d01de8e410bda20f4b8888168a65f62daf4819fa9cb9690b40f349e04','acbe5d36207566bb42e99dc0850bfce807fffabcb44b0e20d2739aa36dc0e456','46394bc396801e6891b57d90d4324fd8c8a1097a75d013f4733aeef49350439d','52aa04b090db2053f17173dfd296968bd792c30ee11e28a1b4ec62312ea980cc','60f7fec9a8a440a836baf0adc9350d30520ccd190952e6a948a7bd783f4bb883','494d519acc7affd7e805356f9b84b0cf63458d3706fe8e99d6b649cdb52807ca','494d519acc7affd7e805356f9b84b0cf63458d3706fe8e99d6b649cdb52807ca','c2417bcc6bf65c0638137e0bfc58546aff86200850faa24ff44f15b7c52fb78f','457ffda315ad31cfddc2f7be027599b0694fdc834dc7a384fb9d887d11f90ad8','6bf4e0365416a10462af3f5ba6b95a6019cb92d21e1de59ee273f3e8ba3a3a49','38cc9e0b084feff754f6614e159975aeb50213c74591e8abdabb0e9bbbeb2d01','e3c936baa638fb4951892814280fce47e11f5ffba6896e342cb4de18ac3d4af3'];
function facing(point:Vec3,toward:Vec3):number {
 const up=new Vector3(...point),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),up);
 const forward=new Vector3(...toward).projectOnPlane(up).normalize().applyQuaternion(q.invert());
 return (Math.atan2(forward.x,forward.z)+Math.PI*2)%(Math.PI*2);
}
/** Pave from the actual outward entrance/step to the closest real street
 * edge, stopping each end at the existing support. No invisible strip is
 * rendered over a yard and no path stone is inserted into a doorstep. */
function entranceRoutes(objects:PlacedObject[],buildings:string[],roadObjects:string[],blueprints:BlueprintContents,radius:number):HomeSurfaceRoute[]{
 const field=fieldOf(PUBLIC_TOWN_ENVIRONMENT,radius);
 const roads=objects.filter(o=>roadObjects.includes(o.id)).map(object=>{
  const parts=blueprints[object.blueprintHash!],pivot=pivotOf(parts),frame=anchorFrame({dir:object.position,yaw:object.rotation});
  return {object,base:structureFit(parts,object.position,object.rotation,field).baseRadius,
   right:new Vector3(...frame.right),front:new Vector3(...frame.front),up:new Vector3(...object.position),
   minX:Math.min(...parts.map(p=>p.x))-pivot.x,maxX:Math.max(...parts.map(p=>p.x+1))-pivot.x,
   minZ:Math.min(...parts.map(p=>p.z))-pivot.z,maxZ:Math.max(...parts.map(p=>p.z+1))-pivot.z};
 });
 return objects.filter(o=>buildings.includes(o.id)).flatMap(object=>{
  const parts=blueprints[object.blueprintHash!],entry=parts.find(p=>p.part==='step.entry'||p.part==='ramp.entry')
   ??parts.find(p=>p.level===0&&(p.part==='wall.door.open'||p.part==='wall.door'));
  if(!entry)return [];
  const t=partTransform(entry,pivotOf(parts)),base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  const support=PART_COLLIDERS[entry.part]().filter(box=>box.support);
  const outer=support.length?Math.max(...support.map(box=>box.center[2]+Math.abs(Math.cos(box.pitch??0))*box.half[2]+Math.abs(Math.sin(box.pitch??0))*box.half[1])):.15;
  const start=localToDir({dir:object.position,yaw:object.rotation},base,
   [t.position[0]+Math.sin(t.yaw)*(outer+.56),0,t.position[2]+Math.cos(t.yaw)*(outer+.56)]);
  const point=new Vector3(...start);
  const candidates=roads.flatMap(road=>{
   const dot=point.dot(road.up);if(dot<.7)return [];
   const onPlane=point.clone().multiplyScalar(road.base/dot).addScaledVector(road.up,-road.base);
   const x=onPlane.dot(road.right),z=onPlane.dot(road.front),cx=Math.max(road.minX,Math.min(road.maxX,x)),cz=Math.max(road.minZ,Math.min(road.maxZ,z));
   const edge=road.up.clone().multiplyScalar(road.base).addScaledVector(road.right,cx).addScaledVector(road.front,cz);
   const toward=road.right.clone().multiplyScalar(x-cx).addScaledVector(road.front,z-cz);
   if(toward.length()<.05)return [];
   const end=edge.addScaledVector(toward.normalize(),.56).normalize().toArray() as Vec3;
   return [{end,length:distance(start,end,radius)}];
  }).sort((a,b)=>a.length-b.length);
  const chosen=candidates[0];
  if(!chosen)return [];
  return [{id:`town-frontdoor-${object.id}`,width:.75,points:[start,chosen.end]}];
 });
}
/** Authoring-only search for a courtyard walk. Every lattice cell is an
 * actual legal ordinary Path, so the route follows the available alley. */
function gardenWalk(route:HomeSurfaceRoute,objects:PlacedObject[],blueprints:BlueprintContents,radius:number):{route:HomeSurfaceRoute;objects:PlacedObject[]} {
 const start=route.points[0],end=route.points.at(-1)!,length=distance(start,end,radius),yaw=facing(start,end),steps=Math.max(1,Math.ceil(length/.62));
 const field=fieldOf(PUBLIC_TOWN_ENVIRONMENT,radius),cache=new PathPlacementCache(),nodes=new Map<string,PlacedObject|null>();
 const node=(x:number,z:number)=>{
  const key=`${x},${z}`;if(nodes.has(key))return nodes.get(key)!;
  const reach=Math.tan(length/radius)*radius,position=localToDir({dir:start,yaw},radius,[x*.6,0,z*reach/steps]);
  const onward=localToDir({dir:start,yaw},radius,[x*.6,0,z*reach/steps+.1]);
  const object:PlacedObject={id:`${route.id}-stone-${x}-${z}`,kind:'path',assetVersion:2,version:PUBLIC_TOWN_VERSION,position,rotation:facing(position,onward)};
  const problem=placementProblem('path',position,objects,undefined,undefined,radius,2,{rotation:object.rotation,blueprints,field,cache})||objectSeat(field,object,blueprints).problem;
  nodes.set(key,problem?null:object);return nodes.get(key)!;
 };
 const initial=node(0,0);if(!initial)throw Error(`Court gate has no legal first stone: ${route.id}`);
 const pending=[{x:0,z:0,g:0,key:'0,0'}],costs=new Map([['0,0',0]]),previous=new Map<string,string>();let goal='';
 while(pending.length){
  pending.sort((a,b)=>(a.g+Math.abs(a.x)*.6+Math.abs(steps-a.z)*length/steps)-(b.g+Math.abs(b.x)*.6+Math.abs(steps-b.z)*length/steps));
  const current=pending.shift()!;if(Math.abs(current.x)<=2&&current.z===steps){goal=current.key;break;}
  for(const [dx,dz]of [[0,1],[-1,0],[1,0],[0,-1]]){
   const x=current.x+dx,z=current.z+dz,key=`${x},${z}`;if(Math.abs(x)>7||z< -2||z>steps+2||!node(x,z))continue;
   const g=current.g+(dx?.6:length/steps);if(g>=(costs.get(key)??Infinity))continue;
   costs.set(key,g);previous.set(key,current.key);pending.push({x,z,g,key});
  }
 }
 if(!goal)throw Error(`No ordinary path through courtyard alley: ${route.id}`);
 const path:PlacedObject[]=[];for(let key:string|undefined=goal;key;key=previous.get(key))path.unshift(nodes.get(key)!);
 return {route:{...route,points:path.map(o=>o.position)},objects:path};
}
/** A garden connection may already cross its own paving, steps or the
 * street. Measure the union of real support surfaces and the actual Path
 * clusters; absence of a new stone over an existing deck is not a gap. */
export function townEntranceCoverage(town:Pick<PublicTown,'objects'|'blueprints'|'environment'|'radius'>,routes:HomeSurfaceRoute[],coverage:RoutePathCoverage[]):RoutePathCoverage[]{
 const world=new GroundWorld({id:'town-authoring-coverage',revision:5,...town});
 const field=fieldOf(town.environment,town.radius),paths=town.objects.filter(o=>o.kind==='path').map(object=>{
  const frame=anchorFrame({dir:object.position,yaw:object.rotation});
  return {base:objectSeat(field,object,town.blueprints).baseRadius,up:new Vector3(...object.position),right:new Vector3(...frame.right),front:new Vector3(...frame.front)};
 });
 const covered=(point:Vec3)=>{
  const p=new Vector3(...point);
  for(const path of paths){const dot=p.dot(path.up);if(dot<.99)continue;const scale=path.base/dot,x=p.dot(path.right)*scale,z=p.dot(path.front)*scale;if(x>=-.39&&x<=.385&&z>=-.345&&z<=.355)return true;}
  for(const body of world.bodies){
   if(body.dir.angleTo(p)*town.radius>body.broad+.4)continue;
   for(const shape of body.colliders){
    if(!shape.support)continue;
    const dir=p.clone().applyQuaternion(shape.inverse),origin=shape.center.clone().applyQuaternion(shape.inverse);
    if(dir.y<.7)continue;
    const r=(origin.y+shape.half.y)/dir.y;
    if(r<town.radius-.5||r>town.radius+.8)continue;
    if(Math.abs(dir.x*r-origin.x)<=shape.half.x&&Math.abs(dir.z*r-origin.z)<=shape.half.z)return true;
   }
  }
  return false;
 };
 return routes.map((route,index)=>{
  const gaps:RoutePathCoverage['gaps']=[];let gap:RoutePathCoverage['gaps'][number]|undefined;
  for(let j=1;j<route.points.length;j++){
   const a=new Vector3(...route.points[j-1]),b=new Vector3(...route.points[j]),length=a.angleTo(b)*town.radius,count=Math.max(1,Math.ceil(length/.04));
   for(let i=0;i<count;i++){
    const point=a.clone().lerp(b,(i+.5)/count).normalize().toArray() as Vec3;
    if(covered(point))gap=undefined;
    else{
     const from=a.clone().lerp(b,i/count).normalize().toArray() as Vec3,to=a.clone().lerp(b,(i+1)/count).normalize().toArray() as Vec3;
     if(!gap){gap={from,to,length:0};gaps.push(gap);}gap.to=to;gap.length+=length/count;
    }
   }
  }
  const maxGap=Math.max(0,...gaps.map(item=>item.length+.04));
  const end=route.points.at(-1)!;let endDistance=covered(end)?0:Infinity;
  // Endpoint quality measures the real union of stones and building/street
  // support, not distance to a Path object's centre. A short direct doorstep
  // can already join the street without requiring a new Path object.
  for(let r=.02;r<=.24&&endDistance===Infinity;r+=.02)for(let ray=0;ray<16;ray++){
   const angle=ray*Math.PI/8,point=localToDir({dir:end,yaw:0},town.radius,[Math.sin(angle)*r,0,Math.cos(angle)*r]);
   if(covered(point)){endDistance=r;break;}
  }
  return {...coverage[index],gaps,maxGap,endDistance,isolated:0,connected:maxGap<=.24&&endDistance<=.24};
 });
}
const cache=new Map<number,PublicTown>();
function assertTownCapacity(objects:PlacedObject[]){
 if(objects.length>PUBLIC_TOWN_LIMITS.objects||objects.filter(o=>o.kind==='structure').length>PUBLIC_TOWN_LIMITS.structures)
  throw Error('Public town exceeds its explicit object budget.');
}
/** Checked authored placements load immediately; expensive siting belongs to
 * authoring, never a login or the first browser frame. */
export function publicTown(radius=21.6):PublicTown {
 const previous=cache.get(radius);if(previous)return previous;
 if(Math.abs(radius-21.6)>1e-6)return generatePublicTown(radius);
 const town:PublicTown={...PUBLIC_TOWN_DATA,version:PUBLIC_TOWN_VERSION,radius,environment:PUBLIC_TOWN_ENVIRONMENT,
  blueprints:Object.fromEntries(PUBLIC_TOWN_BLUEPRINTS.map((b,i)=>[PUBLIC_TOWN_HASHES[i],b.parts]))};
 assertTownCapacity(town.objects);
 cache.set(radius,town);return town;
}
/** Whole-sphere authored street network. Latitude rings are joined by four
 * meridians; every object remains an ordinary editable construction item. */
export function generatePublicTown(radius=21.6):PublicTown {
 if(PUBLIC_TOWN_HASHES.length!==PUBLIC_TOWN_BLUEPRINTS.length)throw Error('Town blueprint hashes have not been verified.');
 const blueprints=Object.fromEntries(PUBLIC_TOWN_BLUEPRINTS.map((b,i)=>[PUBLIC_TOWN_HASHES[i],b.parts]));
 const objects:PlacedObject[]=[],buildings:string[]=[],roadObjects:string[]=[],routes:HomeSurfaceRoute[]=[];
 const field=fieldOf(PUBLIC_TOWN_ENVIRONMENT,radius),meridians=[45,135,225,315],structureCache=new StructurePlacementCache();
 const addStructure=(id:string,index:number,position:Vec3,rotation:number,road=false)=>{
  const parts=PUBLIC_TOWN_BLUEPRINTS[index].parts;
  const object:PlacedObject={id:`town-${id}`,kind:'structure',position,rotation,version:PUBLIC_TOWN_VERSION,
   blueprintHash:PUBLIC_TOWN_HASHES[index],...structureSize(parts)};
  if(distance(position,SPAWN,radius)<object.radius!+1||distance(position,HUB_SHIP,radius)<object.radius!+2.5)return false;
  if(objectSeat(field,object,blueprints).problem)return false;
  if(!road&&placementProblem('structure',position,objects,object.id,object.radius,radius,2,
   {rotation,blueprintHash:object.blueprintHash,blueprints,field,structureCache}))return false;
  objects.push(object);(road?roadObjects:buildings).push(object.id);return true;
 };
 const intersections=[...[-45,0,45].flatMap(latitude=>meridians.map(longitude=>({id:`cross-${latitude}-${longitude}`,latitude,longitude}))),
  {id:'north-square',latitude:90,longitude:0},{id:'south-square',latitude:-90,longitude:0}];
 for(const node of intersections){
  const point=townPoint(node.latitude,node.longitude);
  const toward=townPoint(Math.abs(node.latitude)===90?node.latitude-Math.sign(node.latitude)*.1:node.latitude+.1,Math.abs(node.latitude)===90?45:node.longitude);
  if(node.latitude===90)addStructure(node.id,17,localToDir({dir:point,yaw:Math.PI/4},radius,[-1,0,.8]),Math.PI/4,true);
  else addStructure(node.id,Math.abs(node.latitude)===90?12:10,point,facing(point,toward),true);
 }
 const laneIndex=(length:number)=>length===4?9:length===3?14:length===2?11:15;
 const run=(id:string,length:number,at:(distance:number)=>Vec3,startClear:number,endClear:number)=>{
  const usable=length-startClear-endClear,count=Math.ceil(usable/4),last=Math.max(1,Math.ceil(usable-4*(count-1)));
  const sizes=Array.from({length:count},(_,i)=>i===count-1?last:4),overlap=count>1?(sizes.reduce((a,b)=>a+b,0)-usable)/(count-1):0;
  let cursor=startClear;
  for(const [index,size] of sizes.entries()){
   const center=cursor+size/2,point=at(center);
   addStructure(`${id}-${index}`,laneIndex(size),point,facing(point,at(Math.min(length,center+.1))),true);
   cursor+=size-overlap;
  }
 };
 for(const latitude of [-45,0,45]){
  const circumference=2*Math.PI*radius*Math.cos(latitude*Math.PI/180),count=Math.ceil(circumference/3.5);
  routes.push({id:`town-ring-${latitude}`,width:2,points:Array.from({length:count+1},(_,i)=>townPoint(latitude,i*360/count))});
  for(const longitude of meridians)run(`lane-ring-${latitude}-${longitude}`,circumference/4,d=>townPoint(latitude,longitude+d/circumference*360),1.48,1.48);
 }
 for(const longitude of meridians){
  const count=Math.ceil(Math.PI*radius/3.5);
  routes.push({id:`town-meridian-${longitude}`,width:2,points:Array.from({length:count+1},(_,i)=>townPoint(-90+i*180/count,longitude))});
  for(const latitude of [-90,-45,0,45])run(`lane-meridian-${longitude}-${latitude}`,Math.PI*radius/4,d=>townPoint(latitude+d/radius*180/Math.PI,longitude),latitude===-90?.98:1.48,latitude===45?.98:1.48);
 }
 // The four terminal boards stop outside the unified court's real deck
 // boundary. Distances include the seated sphere projection, so they do not
 // draw a second board edge across the interior of the ordinary 4x4 plan.
 for(const [longitude,fromPole,index]of [[45,3.29,15],[135,2.495,14],[225,2.685,14],[315,3.49,15]]){
  const object=objects.find(o=>o.id===`town-lane-meridian-${longitude}-45-3`);
  if(object)Object.assign(object,{position:townPoint(90-fromPole/radius*180/Math.PI,longitude),
   blueprintHash:PUBLIC_TOWN_HASHES[index],...structureSize(PUBLIC_TOWN_BLUEPRINTS[index].parts)});
 }
 const north=townPoint(90,0);
 const polarRoute=(longitude:number,latitude:number)=>{const count=Math.ceil((90-latitude)/8);return Array.from({length:count+1},(_,i)=>townPoint(90-(90-latitude)*i/count,longitude));};
 const micaLatitude=Math.asin(NPCS.mica.position[1])*180/Math.PI,solLatitude=Math.asin(NPCS.sol.position[1])*180/Math.PI;
 const connectors:HomeSurfaceRoute[]=[
  {id:'town-arrival-court',width:2,points:[SPAWN,north]},
  {id:'town-post-link',width:2,points:[townPoint(micaLatitude,135),NPCS.mica.position]},
  {id:'town-orchard-link',width:2,points:[townPoint(solLatitude,225),NPCS.sol.position]},
  {id:'town-harbour-link',width:2,points:[townPoint(45,160),townPoint(54,160),HUB_DOCK]},
 ];
 for(const route of connectors){
  routes.push(route);
  if(route.id==='town-arrival-court'){
   // The entire arrival court is one ordinary 4x4 blueprint/plane. Separate
   // tangent boards leave visible edges crossing the interior of the court.
   continue;
  }
  for(let edge=1;edge<route.points.length;edge++){
   const a=new Vector3(...route.points[edge-1]),b=new Vector3(...route.points[edge]),length=a.angleTo(b)*radius,count=Math.max(1,Math.ceil(length/3.7));
   for(let i=0;i<count;i++){
    const position=a.clone().lerp(b,(i+.5)/count).normalize().toArray() as Vec3;
    addStructure(`${route.id}-${edge}-${i}`,9,position,facing(position,route.points[edge]),true);
   }
  }
 }
 routes.push(
  {id:'public-post',width:2,points:[SPAWN,...polarRoute(135,micaLatitude),NPCS.mica.position]},
  {id:'public-orchard',width:2,points:[SPAWN,...polarRoute(225,solLatitude),NPCS.sol.position]},
  {id:'public-harbour',width:2,points:[SPAWN,...polarRoute(135,45),...Array.from({length:5},(_,i)=>townPoint(45,140+i*5)),townPoint(54,160),HUB_DOCK]},
 );
 const local=(point:Vec3,x:number,z:number)=>localToDir({dir:point,yaw:0},radius,[x,0,z]);
 const destinations=[
  {id:'post',position:NPCS.mica.position,at:local(NPCS.mica.position,1,-4.3),template:4},
  {id:'orchard',position:NPCS.sol.position,at:local(NPCS.sol.position,-3.5,-.6),template:1},
  {id:'harbour',position:HUB_DOCK,at:local(HUB_DOCK,4.8,-.2),template:8},
 ];
 // These are durable quest/flight bearings, not new interaction portals.
 for(const destination of destinations){
  let placed=addStructure(destination.id,destination.template,destination.at,facing(destination.at,destination.position));
  for(const separation of [3.8,4.5,5.2,6])for(let i=0;i<16&&!placed;i++){
   const at=local(destination.position,Math.sin(i*Math.PI/8)*separation,Math.cos(i*Math.PI/8)*separation);
   for(const template of [destination.template,4,7])if(addStructure(destination.id,template,at,facing(at,destination.position))){placed=true;break;}
  }
  if(!placed)throw Error(`The authored ${destination.id} destination has no supported plot.`);
 }
 let serial=0;
 for(const [latitude,count,offset] of [[-57,8,22.5],[-33,12,0],[-12,16,11.25],[12,16,11.25],[33,12,0],[57,8,22.5],[-72,4,0],[72,4,0]]){
  const towardLatitude=Math.abs(latitude)>65?Math.sign(latitude)*90:Math.abs(latitude)>22?Math.sign(latitude)*45:0;
  for(let i=0;i<count;i++){
   const longitude=i*360/count+offset,position=townPoint(latitude,longitude),toward=townPoint(towardLatitude,longitude);
   let first=(serial++ + Math.floor(longitude/90)*2)%9;
   // This near-street lot needs the shorter entry platform; the survey
   // balcony's foundation leaves no supported place for a paving stone.
   if(latitude===-12&&i===13)first=4;
   // A bounded authored choice tries a smaller real plot where a corner is
   // tight. Nothing is scaled and a rejected lot never becomes hidden art.
   for(const index of [first,4,7])if(addStructure(`building-${latitude}-${i}`,index,position,facing(position,toward)))break;
  }
 }
 // Small courts fill the wider equatorial blocks; their open timber roofs
 // distinguish them from the residential rows and frame the garden paths.
 for(const latitude of [-23,23])for(const i of [0,1,3,4]){
  const longitude=15+i*60;let placed=false;
  for(const dy of [0,1,-1,2,-2])for(const dx of [0,2,-2,4,-4]){
   if(placed)continue;
   const position=townPoint(latitude+Math.sign(latitude)*dy,longitude+dx),id=`garden-pavilion-${latitude}-${i}`;
   if(!addStructure(id,13,position,facing(position,townPoint(0,longitude+dx))))continue;
   const route=entranceRoutes(objects,[`town-${id}`],roadObjects,blueprints,radius)[0],start=route?.points[0];
   if(start&&!placementProblem('path',start,objects,undefined,undefined,radius,2,{rotation:facing(start,route.points.at(-1)!),blueprints,field}))placed=true;
   else{objects.pop();buildings.pop();}
  }
 }
 // Two close task doorways need one real ordinary landing each. Four
 // separately seated path stones cannot bridge the two adjacent terrain seats.
 for(const id of ['town-post','town-orchard']){
  const route=entranceRoutes(objects,[id],roadObjects,blueprints,radius)[0];
  const mid=new Vector3(...route.points[0]).add(new Vector3(...route.points.at(-1)!)).normalize().toArray() as Vec3;
  const yaw=Math.round(facing(mid,route.points.at(-1)!)/(Math.PI/12))*Math.PI/12,position=id==='town-post'?localToDir({dir:mid,yaw},radius,[-.1,0,.2]):mid;
  const landing:PlacedObject={id:`${id}-door-landing`,kind:'structure',position,rotation:yaw,version:PUBLIC_TOWN_VERSION,
   blueprintHash:PUBLIC_TOWN_HASHES[16],...structureSize(PUBLIC_TOWN_BLUEPRINTS[16].parts)};
  const problem=placementProblem('structure',position,objects,landing.id,landing.radius,radius,2,{rotation:yaw,blueprintHash:landing.blueprintHash,blueprints,field,structureCache})||objectSeat(field,landing,blueprints).problem;
  if(problem)throw Error(`The ordinary ${id} doorway landing is invalid: ${problem}`);
  objects.push(landing);roadObjects.push(landing.id);
 }
 let entrances=entranceRoutes(objects,buildings,roadObjects,blueprints,radius);
 const gardenPaths:PlacedObject[]=[];
 entrances=entrances.map(route=>{
  if(!route.id.includes('garden-pavilion'))return route;
  const walk=gardenWalk(route,[...objects,...gardenPaths],blueprints,radius);gardenPaths.push(...walk.objects);return walk.route;
 });
 const entranceSamples=entrances.flatMap(route=>route.points.slice(1).flatMap((point,index)=>{
  const a=new Vector3(...route.points[index]),b=new Vector3(...point),count=Math.ceil(a.angleTo(b)*radius/.3);
  return Array.from({length:count+1},(_,i)=>a.clone().lerp(b,i/Math.max(1,count)).normalize().toArray() as Vec3);
 }));
 let props=0;
 const addProp=(kind:BuildKind,position:Vec3,rotation:number)=>{
  const object:PlacedObject={id:`town-${kind}-${props++}`,kind,assetVersion:2,position,rotation,version:PUBLIC_TOWN_VERSION};
  if(distance(position,HUB_SHIP,radius)<3.6||objectSeat(field,object,blueprints).problem
   ||entranceSamples.some(point=>distance(point,position,radius)<.9)
   ||placementProblem(kind,position,objects,object.id,undefined,radius,2,{rotation,blueprints,field}))return;
  objects.push(object);
 };
 for(const latitude of [-80,-65,-23,23,65,80])for(let i=0;i<16;i++){
  const longitude=i*22.5+5,position=townPoint(latitude,longitude);
  addProp(i%4===0?'lamp':i%4===1?'flowers':'tree',position,facing(position,townPoint(0,longitude)));
 }
 // Courtyard planting is now part of the editable garden plans. Keep a
 // distributed set of detached accents while reserving the ledger for every
 // entrance connection; never truncate the paths at the object ceiling.
 const accents=townDistricts().map(d=>objects.filter(o=>o.kind!=='structure'&&townDistrictFor(o.position)===d.id));
 const keep=new Set<string>();
 for(let row=0;keep.size<8&&accents.some(group=>group[row]);row++)for(const group of accents)if(group[row]&&keep.size<8)keep.add(group[row].id);
 for(let i=objects.length-1;i>=0;i--)if(objects[i].kind!=='structure'&&!keep.has(objects[i].id))objects.splice(i,1);
 objects.push(...gardenPaths);
 const pavedEntrances=entrances.filter(route=>!route.id.includes('garden-pavilion'));
 const yards=planRoutePaths({routes:pavedEntrances,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects,blueprints,
  maxObjects:PUBLIC_TOWN_CAPACITY.objects,spacing:.74,idPrefix:'town-yard-path'});
 if(yards.budgetLimited)throw Error(`Town entrance paths exceed the public object budget (${yards.requested}/${yards.capacity}).`);
 objects.push(...yards.objects.map(object=>({...object,version:PUBLIC_TOWN_VERSION})));routes.push(...entrances);
 const coverage=entrances.map(route=>yards.coverage.find(item=>item.id===route.id)??{id:route.id,candidates:0,added:0,covered:0,blocked:0,budgetOmitted:0,gaps:[],maxGap:0,endDistance:Infinity,isolated:0,connected:false});
 let entranceCoverage=townEntranceCoverage({objects,blueprints,environment:PUBLIC_TOWN_ENVIRONMENT,radius},entrances,coverage);
 // A short approach can have two fixed endpoint stones whose intervening
 // interval is too small for the regular sampler. Fill only measured gaps
 // with ordinary legal stones, then measure the completed scene again.
 for(const item of entranceCoverage)for(const [index,gap]of item.gaps.entries()){
  if(gap.length+.04<=.24||gap.length>.4)continue;
  const position=new Vector3(...gap.from).add(new Vector3(...gap.to)).normalize().toArray() as Vec3;
  const object:PlacedObject={id:`${item.id}-joint-${index}`,kind:'path',assetVersion:2,version:PUBLIC_TOWN_VERSION,position,rotation:facing(position,gap.to)};
  if(placementProblem('path',position,objects,undefined,undefined,radius,2,{rotation:object.rotation,blueprints,field})||objectSeat(field,object,blueprints).problem)continue;
  objects.push(object);
 }
 entranceCoverage=townEntranceCoverage({objects,blueprints,environment:PUBLIC_TOWN_ENVIRONMENT,radius},entrances,coverage);
 const districts=townDistricts();
 for(const object of objects)districts.find(d=>d.id===townDistrictFor(object.position))!.objectIds.push(object.id);
 assertTownCapacity(objects);
 const town:PublicTown={version:PUBLIC_TOWN_VERSION,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects,blueprints,routes,pavingRoutes:routes,
  renderDistricts:districts,buildings,roadObjects,entranceCoverage,destinations:destinations.map(d=>({id:d.id,position:d.position,buildingId:`town-${d.id}`})),
  landmarks:intersections.map(n=>({id:n.id,position:townPoint(n.latitude,n.longitude)}))};
 return town;
}
