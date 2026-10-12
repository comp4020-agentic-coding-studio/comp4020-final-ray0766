import {Quaternion,Vector3} from 'three';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';
import type {Blueprint,PartPlacement} from './blueprint-model.ts';
import {partTransform,pivotOf} from './blueprint-model.ts';
import {isDoorPartId,isWideDoorPartId} from './blueprint-parts.ts';
import {WIDE_DOOR} from './wide-door.ts';
import {WIDE_ENTRY_ID,WIDE_ENTRY} from './wide-entry.ts';
import {homeCottage,padStall,relayHut,surveyPost,villageCottage} from '../assets/claude-geometry/blueprint/samples.ts';
import {defaultEnvironment,encodeEnvironment} from '../assets/claude-geometry/terrain/env.ts';
import {anchorFrame,localToDir} from '../assets/claude-geometry/core/anchor.ts';
import {districtHome,districtWorkshopWithEntryStep} from './district-layout.ts';
import {HOME_INFRASTRUCTURE} from './home-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {structureFit,structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {createPublicTownPlacementCheck} from './public-town-reservations.ts';
import type {PlacedObject} from './planets.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {HUB_DOCK} from './ports.ts';
import {NPCS,distance} from './world.ts';
import type {Vec3} from './world.ts';
import {PUBLIC_TOWN_CAPACITY} from './world-capacity.ts';
import {StructurePlacementCache,isRoadSurface} from './structure-placement.ts';
import {PUBLIC_TOWN_DATA} from './public-town-data.ts';
import {TOWN_WIDE_ROAD_OBJECTS,TOWN_WIDE_ROAD_BLUEPRINTS,TOWN_WIDE_ROAD_ROUTES} from './town-wide-roads.ts';
import {TOWN_AUTHORED_BLUEPRINTS} from './town-authored-blueprints.ts';
import {planRoutePaths} from './path-layout.ts';
import type {RoutePathCoverage} from './path-layout.ts';
import {PART_COLLIDERS} from './physics/parts.ts';
import {GroundWorld} from './physics/world.ts';
import {townPlacePlans,townPlacePoint} from './town-place-layout.ts';
import {TOWN_LOCAL_STREETS} from './town-local-streets.ts';
import {TOWN_STREET_NETWORK,TOWN_PLACE_STREET} from './town-street-network.ts';
import {townAuthoredEntrancePoints} from './town-authored-entries.ts';
import {TOWN_ENTRY_CONNECTIONS} from './town-entry-connections.ts';
import {townWorksite} from './town-worksite-blueprints.ts';
import {townStoneLane} from './town-stone-lanes.ts';
import type {TownStoneLaneReport} from './town-stone-lanes.ts';
import {TOWN_CRITICAL_SUPPORTS,TOWN_ANCHOR_BUILDINGS} from './town-critical-supports.ts';
import {streetHouse} from './town-street-houses.ts';
import {townDoorHouse} from './town-door-houses.ts';
import {townConnectedFront,townClearEntryHome} from './town-connected-fronts.ts';
import {townSpatialVariants} from './town-spatial-variants.ts';
import {townAuthoredPose} from './town-authored-poses.ts';
import {townPostHouse,townLongWorkshop,townSharedCourt,townHarbourLookout,townStreetGallery,townCourtEdge} from './town-place-blueprints.ts';

/** The public town is an explicit larger template; no extra scenery sits
 * outside its object ledger. Private construction retains its own limits. */
export const PUBLIC_TOWN_VERSION=11;
export const PUBLIC_TOWN_LIMITS=PUBLIC_TOWN_CAPACITY;
const environment=defaultEnvironment('temperate',20261009);
Object.assign(environment.params,{relief:.3,roughness:.025,vegetation:.36,waterLevel:-.3,woodland:.05,outcrops:0});
export const PUBLIC_TOWN_ENVIRONMENT=encodeEnvironment(environment);
export interface TownDistrict {id:string;name:string;nameZh:string;center:Vec3;objectIds:string[]}
export interface PublicTown {
 version:number;radius:number;environment:string;objects:PlacedObject[];blueprints:BlueprintContents;
 routes:HomeSurfaceRoute[];pavingRoutes:HomeSurfaceRoute[];renderDistricts:TownDistrict[];
 /** Proposed paving lines, including rejected spans; never navigation. */
 pavingPlans?:HomeSurfaceRoute[];
 destinations:{id:string;position:Vec3;buildingId:string}[];
 buildings:string[];roadObjects:string[];siteObjects?:string[];landmarks:{id:string;position:Vec3;kind?:'navigation'|'structure';objectId?:string}[];
 entranceCoverage?:RoutePathCoverage[];
 pavingCoverage?:RoutePathCoverage[];
 stoneCoverage?:TownStoneLaneReport[];
 worksites?:{id:string;placeId:string;objectId:string;position:Vec3}[];
 places?:{id:string;name:string;nameZh:string;center:Vec3;intent:string;objectIds:string[];siteObjectIds?:string[];boundaryObjectIds?:string[];streetIds?:string[];walk:Vec3[]}[];
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
 const blueprint:Blueprint=structuredClone(HOME_INFRASTRUCTURE[0]);
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
 streetHouse('court'),streetHouse('hall'),streetHouse('terrace'),streetHouse('gable'),deck('long lane',2,5),
 townPostHouse(),townLongWorkshop(),townSharedCourt(),townHarbourLookout(),
 townWorksite('garden'),townWorksite('repair'),townWorksite('counter'),townWorksite('sorting'),
 townStoneLane(1),townStoneLane(2),townStoneLane(3),
 townDoorHouse('front-left'),townDoorHouse('court-side'),townDoorHouse('court-back'),townDoorHouse('gable-side'),
 townStreetGallery(),townCourtEdge(),townCourtEdge(true),townStoneLane(4),townStoneLane(5),
].map((blueprint,index)=>({...blueprint,id:`51549d27-cabe-4d99-af34-a1${String(index).padStart(10,'0')}` as BlueprintId,
 name:`Town · ${blueprint.name.replace(/^(Town · )+/,'')}`}));
// Content-addressed ordinary blueprints, checked against the canonical codec.
export const PUBLIC_TOWN_HASHES=["fa832dd85a321da376c731f777aa65e9796eed7da65e96a7321ea544a62baf25","c4374061b3e838eab1143a8c8bf29bb23876372bda9b77682ca545f5165f939d","6b5514cb44e732694ec114a0626214fb9829d74d96c5ff291a5ae5d41613ec9f","b254c8da217d42e1112353691e312ee21c16496b775494fb6a2761a379f0b94d","f9fb9e44efa78eeae6fd373d3a461bd9a2a62440faffa25688c5e768d8f9975d","7cd68a5f77f81fd8b1ffde1cbac991cb563403a57d0f6cc0764f8552994831ad","e8298b4d01de8e410bda20f4b8888168a65f62daf4819fa9cb9690b40f349e04","acbe5d36207566bb42e99dc0850bfce807fffabcb44b0e20d2739aa36dc0e456","46394bc396801e6891b57d90d4324fd8c8a1097a75d013f4733aeef49350439d","52aa04b090db2053f17173dfd296968bd792c30ee11e28a1b4ec62312ea980cc","60f7fec9a8a440a836baf0adc9350d30520ccd190952e6a948a7bd783f4bb883","494d519acc7affd7e805356f9b84b0cf63458d3706fe8e99d6b649cdb52807ca","494d519acc7affd7e805356f9b84b0cf63458d3706fe8e99d6b649cdb52807ca","c2417bcc6bf65c0638137e0bfc58546aff86200850faa24ff44f15b7c52fb78f","457ffda315ad31cfddc2f7be027599b0694fdc834dc7a384fb9d887d11f90ad8","6bf4e0365416a10462af3f5ba6b95a6019cb92d21e1de59ee273f3e8ba3a3a49","38cc9e0b084feff754f6614e159975aeb50213c74591e8abdabb0e9bbbeb2d01","e3c936baa638fb4951892814280fce47e11f5ffba6896e342cb4de18ac3d4af3","9091370a66ce3f6af4905f4b7dfb1b08eadb9b25e0b8959fca5b20bd296ff3fa","7f6a6eca52aec087a7dc12f40cc7e43387343e4bb0bbe32a78e4194c2babc0f0","75719fbab9e9717a6d6278ec4b45fe3a4cee490e5c4755f9d45d2fc96c2e3a1c","7cf83dd53588254c99fdcd038ac3850070ad8d1c9504d6759e739b2742ea382a","dece6bcf8e0997b498ec6c44fb4ed4325c9e23150581accc28524544277c9886","152acb632b77f40a05bf4aaf3821d109ec8f8045c0bf41369fe344d5ed2f2f60","2ee5ebe993a365905906dec5d29b54e4494d233765109cd0d03cc8199820e5c5","43153196379b06aead81443163b2ffb5de8b7e94085ba33ec9bb097071157e8f","d42191c0a7ef4a3943bb55ca7048c301299010641cfea76e77b943f0578783f0","356b1c24939061876bec3e91f155c317e434e667dee7f9130d1d6fdc82212ba5","439d0a22c9268e9454d84e3f4e1ad190ff032d2b84e9cf2782312ac0bf40e6f1","21fa16f738df52ab4ca568d90a7c990bbc4558771cca8155069e8899b1247447","56a6c8c49aa724f1bbe88a169802d3f8911f8bbf54d4f1dd76444f1bc37eb1a8","f8674286acef5afc49c60b6c6e5a15c7281d2032b8871fd8500e53a37eabb3ec","b61d67a9fef94dd65bbd653b80f8b9d0d418d2737b4a2fc0f3a34c5d4604d671","1dcd1dd3f18058671ff1193b12cd944fb747ff2f339b0fcf4cc3f6f0fca2e39c","cc4572cc6a10517a9be2eadeb97b282aae17a433436babe9a469a8447aca0df9","66f828ae12daab5485534593afc2547e894bce9c93559a99589a4f24113878b8","66ab302f35f49de7a8e495afeade52186377769d4e0ba003e5c403ec2af2309f","75cb7c72b40d334c7b2520410790ae91e9de5d2ee0806931a7fe362525380361","98ad9b0581e6a0c5d6d9555e6a7747f04fe55389e627eb5159d70825cf1260e7","26e7d5dd4f80efea811e6b8d05f623673230f51b8e21ad47c915162f82a0523c","06d94103ffd66eebfc30f91c1999ba71cceb090034028a6a811989f4911d0ff2","795731f7460ef19cc1d7f84d3f425378ff7dd25c69b126aacd38cfeadbe5e3ba","b5adcc7ed102a5a96534f92e8867e928d838c08a608249a722440e00eebef32f"];
// Final place-specific variants remain ordinary editable blueprint documents.
const connectedFronts=[townConnectedFront('long-corner'),townConnectedFront('short-return'),townConnectedFront('open-gallery'),townClearEntryHome()];
const spatialVariants=townSpatialVariants(PUBLIC_TOWN_BLUEPRINTS);
for(const blueprint of [...connectedFronts,...spatialVariants.map(variant=>variant.blueprint)]){
 const index=PUBLIC_TOWN_BLUEPRINTS.length;
 PUBLIC_TOWN_BLUEPRINTS.push({...blueprint,id:`51549d27-cabe-4d99-af34-a1${String(index).padStart(10,'0')}` as BlueprintId,
  name:`Town · ${blueprint.name.replace(/^(Town · )+/,'')}`});
}
PUBLIC_TOWN_HASHES.push('2fce82e71a59bf667db9a8ccf635b7394b32edeabe85cfa40f42287956dd8849',
 '340057f2a79ef40129a69fb64a54ea4ab9b822f6bb76a7f51393808d8de371f4',
 '404b21ec696f767f81a7c24acbfb0e00ac18ed4a7582d374202786109af44edd',
 '959f99a05895d62c1bca6d713dfcdc18321105e4daf2a82707e171d077f5bd71',
 ...spatialVariants.map(variant=>variant.hash));
// Keep the first 43 player workshop plans and all existing content hashes stable.
for(const [hash,parts] of Object.entries(TOWN_AUTHORED_BLUEPRINTS)){
 if(PUBLIC_TOWN_HASHES.includes(hash))throw Error('Duplicate authored blueprint hash');
 const index=PUBLIC_TOWN_BLUEPRINTS.length;
 PUBLIC_TOWN_BLUEPRINTS.push({id:(`51549d27-cabe-4d99-af34-a1${String(index).padStart(10,'0')}`) as BlueprintId,name:`Town · Authored block ${index}`,parts,groups:[]});
 PUBLIC_TOWN_HASHES.push(hash);
}
// Public street packs append to the registry; the first 43 workshop examples
// and every existing building blueprint retain their identities and indices.
for(const [hash,parts] of Object.entries(TOWN_WIDE_ROAD_BLUEPRINTS)){
 if(PUBLIC_TOWN_HASHES.includes(hash))continue;
 const index=PUBLIC_TOWN_BLUEPRINTS.length;
 PUBLIC_TOWN_BLUEPRINTS.push({id:(`51549d27-cabe-4d99-af34-a1${String(index).padStart(10,'0')}`) as BlueprintId,name:`Town · Street pack ${index}`,parts,groups:[]});
 PUBLIC_TOWN_HASHES.push(hash);
}
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
  const parts=blueprints[object.blueprintHash!],entry=parts.find(p=>p.part==='step.entry'||p.part==='ramp.entry'||p.part===WIDE_ENTRY_ID)
   ??parts.find(p=>p.level===0&&isDoorPartId(p.part));
  if(!entry)return [];
  const t=partTransform(entry,pivotOf(parts)),base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  const support=PART_COLLIDERS[entry.part]().filter(box=>box.support);
  const outer=support.length?Math.max(...support.map(box=>box.center[2]+Math.abs(Math.cos(box.pitch??0))*box.half[2]+Math.abs(Math.sin(box.pitch??0))*box.half[1])):.15;
  const centerX=entry.part===WIDE_ENTRY_ID?WIDE_ENTRY.centerX:isWideDoorPartId(entry.part)?WIDE_DOOR.centerX:0;
  const start=localToDir({dir:object.position,yaw:object.rotation},base,
   [t.position[0]+Math.cos(t.yaw)*centerX+Math.sin(t.yaw)*(outer+.56),0,t.position[2]-Math.sin(t.yaw)*centerX+Math.cos(t.yaw)*(outer+.56)]);
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
 const blueprints=Object.fromEntries(PUBLIC_TOWN_BLUEPRINTS.map((b,i)=>[PUBLIC_TOWN_HASHES[i],b.parts]));
 const objects=structuredClone(TOWN_WIDE_ROAD_OBJECTS);
 const renderDistricts=townDistricts();
 for(const object of objects)renderDistricts.find(d=>d.id===townDistrictFor(object.position))!.objectIds.push(object.id);
 const town:PublicTown={...PUBLIC_TOWN_DATA,version:PUBLIC_TOWN_VERSION,radius,environment:PUBLIC_TOWN_ENVIRONMENT,
  objects,blueprints,renderDistricts,routes:structuredClone(TOWN_WIDE_ROAD_ROUTES),
  roadObjects:objects.filter(o=>isRoadSurface(blueprints[o.blueprintHash!])).map(o=>o.id),
  // Previous narrow-lane coverage is no longer evidence for this ledger.
  pavingRoutes:[],entranceCoverage:[],pavingCoverage:[],stoneCoverage:[]};
 assertTownCapacity(town.objects);
 cache.set(radius,town);return town;
}
/** Every door's real outward approach, independent of whether its street is
 * paved or ordinary walkable terrain. Authoring/navigation consumes these
 * points; a missing stone never becomes a fictional paved connection. */
export function townEntrancePoints(town:Pick<PublicTown,'objects'|'blueprints'|'environment'|'radius'>):{id:string;point:Vec3;buildingId:string}[]{
 const field=fieldOf(town.environment,town.radius);
 const automatic=town.objects.filter(object=>object.kind==='structure').flatMap(object=>{
  const parts=town.blueprints[object.blueprintHash!],steps=parts.filter(p=>p.part==='step.entry'||p.part==='ramp.entry'||p.part===WIDE_ENTRY_ID);
  const entries=steps.length?steps:parts.filter(p=>p.level===0&&isDoorPartId(p.part));
  const base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  return entries.map((entry,index)=>{
   const t=partTransform(entry,pivotOf(parts)),support=PART_COLLIDERS[entry.part]().filter(box=>box.support);
   const outer=support.length?Math.max(...support.map(box=>box.center[2]+Math.abs(Math.cos(box.pitch??0))*box.half[2]+Math.abs(Math.sin(box.pitch??0))*box.half[1])):.15;
   const centerX=entry.part===WIDE_ENTRY_ID?WIDE_ENTRY.centerX:isWideDoorPartId(entry.part)?WIDE_DOOR.centerX:0;
   const point=localToDir({dir:object.position,yaw:object.rotation},base,
    [t.position[0]+Math.cos(t.yaw)*centerX+Math.sin(t.yaw)*(outer+.56),0,t.position[2]-Math.sin(t.yaw)*centerX+Math.cos(t.yaw)*(outer+.56)]);
   return {id:`town-frontdoor-${object.id}${index?`-entry-${entry.n}`:''}`,point,buildingId:object.id};
  });
 });
 return [...automatic,...townAuthoredEntrancePoints(town,automatic)];
}


/** Two ordinary cobble-cluster lanes form a narrow 1.5 m surface. Bends are
 * authored in the place plan; rejected stones remain visible in the report. */
export function townPlacePavingRoutes(radius=21.6):HomeSurfaceRoute[]{
 return TOWN_LOCAL_STREETS.filter(route=>route.id!=='town-street-courts-exit').flatMap(route=>[-.36,.36].map((offset,lane)=>({
  id:`${route.id}-${lane}`,width:.75,points:route.points.map((point,i)=>{
   const up=new Vector3(...point),before=new Vector3(...route.points[Math.max(0,i-1)]),after=new Vector3(...route.points[Math.min(route.points.length-1,i+1)]);
   const tangent=after.sub(before).projectOnPlane(up).normalize(),side=new Vector3().crossVectors(tangent,up).normalize();
   return up.multiplyScalar(radius).addScaledVector(side,offset).normalize().toArray() as Vec3;
  }),
 })));
}

export interface TownAuthoringReport { attempts:{id:string;template:number;latitude:number;longitude:number;problem:string}[]; unplaced:{id:string;latitude:number;longitude:number}[] }
/** Places are deliberately authored as different spatial compositions. Long
 * generic latitude roads no longer consume the town's construction budget.
 * Actual geometry uses the ordinary placement contract; fixed public task
 * areas have a separate conservative occupied-space reservation. */
export function generatePublicTown(radius=21.6,report?:TownAuthoringReport):PublicTown {
 if(Math.abs(radius-21.6)<1e-6){
  const town=structuredClone(publicTown(radius));
  const check=createPublicTownPlacementCheck(fieldOf(town.environment,radius),radius,town.blueprints,new StructurePlacementCache());
  for(const object of town.objects){const problem=check(object,town.objects);if(problem)throw Error(`Invalid authored town placement ${object.id}: ${problem}`);}
  return town;
 }
 if(PUBLIC_TOWN_HASHES.length!==PUBLIC_TOWN_BLUEPRINTS.length)throw Error('Town blueprint hashes have not been verified.');
 const blueprints=Object.fromEntries(PUBLIC_TOWN_BLUEPRINTS.map((b,i)=>[PUBLIC_TOWN_HASHES[i],b.parts]));
 const objects:PlacedObject[]=[...TOWN_CRITICAL_SUPPORTS,...TOWN_ANCHOR_BUILDINGS].map(o=>({...structuredClone(o),version:PUBLIC_TOWN_VERSION}));
 const buildings=TOWN_ANCHOR_BUILDINGS.map(o=>o.id),roadObjects=TOWN_CRITICAL_SUPPORTS.map(o=>o.id);
 const field=fieldOf(PUBLIC_TOWN_ENVIRONMENT,radius),structureCache=new StructurePlacementCache();
 const placementCheck=createPublicTownPlacementCheck(field,radius,blueprints,structureCache);
 const plans=townPlacePlans(),places:NonNullable<PublicTown['places']>=[];
 // These three streets have been read at walking height. Place their actual
 // street walls first so a previously rejected neighbour cannot consume a
 // newly opened corner and silently erase an accepted street on regeneration.
 // This is only authoring order: every part still passes the same fit/OBB rules.
 const streetWalls=new Set(['post-1','post-2','post-3','post-4','post-5','post-6','post-8','post-9','post-10','post-11',
  'craft-1','craft-2','craft-3','craft-4','craft-5','craft-6','craft-7','craft-8','craft-9','craft-10','craft-11','craft-12','craft-14','craft-15','craft-16',
  'courts-1','courts-2','courts-3','courts-4','courts-5','courts-6','courts-7','courts-8','courts-9','courts-10','courts-12','courts-13','courts-14']);
 const connectingFronts=new Set(['arrival-1','arrival-2','arrival-3','arrival-4','back-junction-1','back-junction-2','back-junction-3','timber-yard-5','wash-court-5','work-to-home-1','work-to-home-4']);
 const priority=(id:string)=>streetWalls.has(id)?0:connectingFronts.has(id)?1:2;
 const plotOrder=plans.flatMap(place=>place.plots.map(plot=>({place,plot}))).sort((a,b)=>priority(a.plot.id)-priority(b.plot.id));
 const placedByPlace=new Map(plans.map(place=>[place.id,[] as string[]]));
 for(const {place,plot}of plotOrder){
   let accepted:PlacedObject|undefined;
   for(const [dx,dz]of [[0,0]]){
    if(accepted)break;
    const intended=townPlacePoint(place,radius,plot.x+dx,plot.z+dz),angle=plot.turn*Math.PI/180;
    const toward=townPlacePoint(place,radius,plot.x+dx+Math.sin(angle)*.1,plot.z+dz+Math.cos(angle)*.1);
    const {position:point,rotation}=townAuthoredPose(`town-${plot.id}`,intended,facing(intended,toward),radius);
    for(const index of [plot.template]){
     const parts=PUBLIC_TOWN_BLUEPRINTS[index].parts;
     const object:PlacedObject={id:`town-${plot.id}`,kind:'structure',position:point,rotation,version:PUBLIC_TOWN_VERSION,
      blueprintHash:PUBLIC_TOWN_HASHES[index],...structureSize(parts)};
     const problem=placementCheck(object,objects);
     if(problem){report?.attempts.push({id:object.id,template:index,latitude:Math.asin(point[1])*180/Math.PI,longitude:Math.atan2(point[0],point[2])*180/Math.PI,problem});continue;}
     accepted=object;break;
    }
   }
   if(accepted){objects.push(accepted);buildings.push(accepted.id);placedByPlace.get(place.id)!.push(accepted.id);}
   else{const point=townPlacePoint(place,radius,plot.x,plot.z);report?.unplaced.push({id:`town-${plot.id}`,latitude:Math.asin(point[1])*180/Math.PI,longitude:Math.atan2(point[0],point[2])*180/Math.PI});}
 }
 // The concrete spatial plan has no speculative fallback plots. An absent
 // street wall changes the place itself, so a partial ledger is not emitted.
 const missingPlans=plotOrder.filter(({plot})=>!objects.some(object=>object.id===`town-${plot.id}`));
 if(missingPlans.length)throw Error(`Concrete town placements failed: ${missingPlans.map(({plot})=>plot.id).join(', ')}. Inspect the authoring report before changing the plan.`);
 for(const place of plans){
  places.push({id:place.id,name:place.name,nameZh:place.nameZh,center:place.center,intent:place.intent,objectIds:placedByPlace.get(place.id)!,
   walk:place.walk.map(([x,z])=>townPlacePoint(place,radius,x,z))});
 }
 const worksites:NonNullable<PublicTown['worksites']>=[];
 // Resident work objects stay in side pockets, leaving the authored walking
 // line and a clothing-width standing space clear. No NPC acts as scenery.
 for(const [id,placeId,x,z,turn,index]of [
  ['nell-garden','orchard',-1,4.7,180,27],['ivo-repair','harbour',-3.5,1.5,0,28],
  ['ada-shop','arcades',-2,2.7,180,29],
 ] as [string,string,number,number,number,number][]){
  const place=plans.find(p=>p.id===placeId)!;let accepted:PlacedObject|undefined;
  for(const [dx,dz]of [[0,0],[.2,0],[-.2,0],[0,.2],[0,-.2]]){
   const intended=townPlacePoint(place,radius,x+dx,z+dz),angle=turn*Math.PI/180,toward=townPlacePoint(place,radius,x+dx+Math.sin(angle)*.1,z+dz+Math.cos(angle)*.1);
   const {position:point,rotation}=townAuthoredPose(`town-worksite-${id}`,intended,facing(intended,toward),radius);
   const parts=PUBLIC_TOWN_BLUEPRINTS[index].parts,object:PlacedObject={id:`town-worksite-${id}`,kind:'structure',position:point,rotation,version:PUBLIC_TOWN_VERSION,blueprintHash:PUBLIC_TOWN_HASHES[index],...structureSize(parts)};
   const problem=placementCheck(object,objects);
   if(problem){report?.attempts.push({id:object.id,template:index,latitude:Math.asin(point[1])*180/Math.PI,longitude:Math.atan2(point[0],point[2])*180/Math.PI,problem});continue;}
   accepted=object;break;
  }
  if(accepted){objects.push(accepted);worksites.push({id,placeId,objectId:accepted.id,position:accepted.position});}
  else{const point=townPlacePoint(place,radius,x,z);report?.unplaced.push({id:`town-worksite-${id}`,latitude:Math.asin(point[1])*180/Math.PI,longitude:Math.atan2(point[0],point[2])*180/Math.PI});}
 }
 const postalPorch=objects.find(object=>object.id==='town-post-3');
 if(postalPorch){
  const entry=townEntrancePoints({objects:[postalPorch],blueprints,environment:PUBLIC_TOWN_ENVIRONMENT,radius})[0];
  if(entry)worksites.push({id:'pax-courier',placeId:'post',objectId:postalPorch.id,position:entry.point});
 }
 // The reviewed entity stage keeps the actual three street surfaces and
 // doorway paving. New cross-district routes remain explicit ground lanes;
 // no unverified stone report is reused after changing their geometry.
 // Pave only the three retained public destinations. Other door approaches
 // are intentionally ground alleys and receive separate real-motion checks.
 const entrances=entranceRoutes(objects,TOWN_ANCHOR_BUILDINGS.map(o=>o.id),roadObjects,blueprints,radius);
 const yards=planRoutePaths({routes:entrances,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects,blueprints,
  maxObjects:PUBLIC_TOWN_CAPACITY.objects,spacing:.74,idPrefix:'town-anchor-path'});
 if(yards.budgetLimited)throw Error('Anchor paving exceeds the public construction budget.');
 objects.push(...yards.objects.map(object=>({...object,version:PUBLIC_TOWN_VERSION})));
 const entranceCoverage=townEntranceCoverage({objects,blueprints,environment:PUBLIC_TOWN_ENVIRONMENT,radius},entrances,yards.coverage);
 const streets=townPlacePavingRoutes(radius);
 const paving=planRoutePaths({routes:streets,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects,blueprints,
  maxObjects:PUBLIC_TOWN_CAPACITY.objects,spacing:.67,idPrefix:'town-street-path'});
 if(paving.budgetLimited)throw Error('Authored street paving exceeds the public construction budget.');
 objects.push(...paving.objects.map(object=>({...object,version:PUBLIC_TOWN_VERSION})));
 const districts=townDistricts();
 for(const object of objects)districts.find(d=>d.id===townDistrictFor(object.position))!.objectIds.push(object.id);
 // Includes pre-seeded task buildings, supports, work objects and paving.
 // A valid candidate is not permission to freeze an invalid complete ledger.
 for(const object of objects){const problem=placementCheck(object,objects);if(problem)throw Error(`Invalid public placement ${object.id}: ${problem}`);}
 assertTownCapacity(objects);
 // Preserve the actual checked street graph and the independent SPAWN task
 // routes. Paving is a separate surface ledger; no renderer draws ribbons.
 const routes:HomeSurfaceRoute[]=[...new Map([
  ...entrances.map(route=>({...route,points:[...route.points].reverse()})),
  ...TOWN_LOCAL_STREETS.filter(route=>route.id!=='town-street-courts-exit'),
  ...TOWN_STREET_NETWORK,...TOWN_ENTRY_CONNECTIONS,
 ].map(route=>[route.id,route])).values()];
 const navigationById=new Map(routes.map(route=>[route.id,route]));
 // Yard furniture and planted edges are ordinary site structures, not rooms.
 const actualBuildings=buildings.filter(id=>blueprints[objects.find(object=>object.id===id)!.blueprintHash!].some(part=>part.part.startsWith('roof.')));
 const siteObjects=objects.filter(object=>object.kind==='structure'&&!actualBuildings.includes(object.id)&&!roadObjects.includes(object.id)).map(object=>object.id);
 const sharedBoundaries:Record<string,string[]>={
  'post-upper':['town-post-5','town-post-8','town-post-9'],
  'garden-back-lane':['town-garden-steps-4','town-garden-steps-8','town-south-lane-12','town-court-to-porch-2'],
  'orchard-back':['town-orchard-8','town-orchard-9','town-roof-to-arrival-1','town-north-steps-6'],
  'court-to-porch':['town-courts-10','town-porches-12','town-porches-15'],
  'work-to-home':['town-timber-yard-8'],
 };
 for(const place of places){
  const route=navigationById.get(TOWN_PLACE_STREET[place.id]);
  if(!route)throw Error(`No actual street for authored place ${place.id}`);
  place.siteObjectIds=place.objectIds.filter(id=>siteObjects.includes(id));
  place.objectIds=place.objectIds.filter(id=>actualBuildings.includes(id));
  place.boundaryObjectIds=sharedBoundaries[place.id]??[];
  place.streetIds=[route.id];
  if(route.id==='town-south-network'){
   // This continuous network returns through its side branches. Retain a
   // contiguous local portion, not a new chord across the place centre.
   const nearest=route.points.reduce((best,point,index)=>distance(point,place.center,radius)<distance(route.points[best],place.center,radius)?index:best,0);
   place.walk=route.points.slice(Math.max(0,nearest-2),Math.min(route.points.length,nearest+3));
  }else place.walk=route.points;
 }

 const connectedEntrances=entrances.filter((_,i)=>entranceCoverage[i].connected);
 return {version:PUBLIC_TOWN_VERSION,radius,environment:PUBLIC_TOWN_ENVIRONMENT,objects,blueprints,routes,pavingRoutes:connectedEntrances,pavingPlans:[...entrances,...streets],pavingCoverage:[...entranceCoverage,...paving.coverage],stoneCoverage:[],
  renderDistricts:districts,buildings:actualBuildings,roadObjects,siteObjects,entranceCoverage:entranceCoverage.filter(item=>item.connected),places,worksites,
  destinations:[{id:'post',position:NPCS.mica.position,buildingId:'town-post'},{id:'orchard',position:NPCS.sol.position,buildingId:'town-orchard'},{id:'harbour',position:HUB_DOCK,buildingId:'town-harbour'}],
  landmarks:[{id:'north-square',position:townPoint(90,0),kind:'navigation'},{id:'south-square',position:townPoint(-90,0),kind:'navigation'},
   ...[['postal-stair','town-post-3'],['workshop-corner','town-craft-4'],['shared-court-wing','town-courts-5'],['harbour-working-front','town-harbour-3'],['garden-stair','town-garden-steps-3'],['polar-threshold','town-south-court-2']].flatMap(([id,objectId])=>{
    const object=objects.find(candidate=>candidate.id===objectId);return object?[{id,objectId,position:object.position,kind:'structure' as const}]:[];
   })]};
}
