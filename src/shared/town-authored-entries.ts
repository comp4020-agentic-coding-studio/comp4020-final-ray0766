import type {Vec3} from './world.ts';
import type {PlacedObject} from './planets.ts';
import type {BlueprintContents} from './blueprints.ts';
import {structureFit} from './blueprints.ts';
import type {PartPlacement} from './blueprint-model.ts';
import {partTransform,pivotOf} from './blueprint-model.ts';
import {WIDE_DOOR} from './wide-door.ts';
import {WIDE_ENTRY,WIDE_ENTRY_ID} from './wide-entry.ts';
import {localToDir} from '../assets/claude-geometry/core/anchor.ts';
import {fieldOf} from './terrain.ts';
import {PART_COLLIDERS} from './physics/parts.ts';

interface EntrancePoint {id:string;point:Vec3;buildingId:string}
export interface TownExplicitEntrancePoint extends EntrancePoint {
 sharedAutomaticApproachId:string;
 expectedBlueprintHash:string;
 entryPartN:number;
 doorPartN:number|null;
 kind:'shallow-wing-cell-centre'|'open-porch'|'rear-room';
 terminal:{kind:'actual-floor-cell-centre';partN:number;cell:{x:number;z:number;level:0};local:Vec3;actualInteriorDepth:.5}
  |{kind:'open-wing-standing';floorPartNs:readonly number[];local:Vec3}
  |{kind:'actual-room-standing';floorPartNs:readonly number[];local:Vec3;doorPlaneLocal:Vec3;actualInteriorDepth:number};
}
export type TownAuthoredEntrancePoint=EntrancePoint|TownExplicitEntrancePoint;

// Each approved blueprint keeps its own real portal set. The v10 rear room
// replaces the two side doors with actual windows; old v9 blueprints retain
// their shallow side-door records. Unknown revisions still require review.
const COURT_LEGACY='43153196379b06aead81443163b2ffb5de8b7e94085ba33ec9bb097071157e8f';
const COURT_REAR_ROOM='324f14b93776cb84074a68dee71c17477c4be45a9ce7a0b8b4f3d5946d9e1883';
const PORCH_OPEN='98729521de292296f8191d8d76471af32b0cb96beea47f12c607e8d6805147c5';
const approvedBlueprints:Readonly<Record<string,readonly string[]>>={
 'town-courts-5':[COURT_LEGACY,COURT_REAR_ROOM],
 'town-porches-5':[PORCH_OPEN],
};
const extraPortals=[
 {id:'town-authored-entry-town-courts-5-west-side-door',buildingId:'town-courts-5',hash:COURT_LEGACY,kind:'shallow-wing-cell-centre',doorPartN:13,doorCell:[0,2,1],floorPartN:11,floorCell:[0,2],local:[-2,0,0]},
 {id:'town-authored-entry-town-courts-5-east-side-door',buildingId:'town-courts-5',hash:COURT_LEGACY,kind:'shallow-wing-cell-centre',doorPartN:77,doorCell:[4,3,3],floorPartN:71,floorCell:[4,3],local:[2,0,1]},
 {id:'town-authored-entry-town-courts-5-rear-room',buildingId:'town-courts-5',hash:COURT_REAR_ROOM,kind:'rear-room',doorPartN:41,doorCell:[1,1,0],floorPartNs:[25,29,35,39],floorCells:[[1,0],[1,1],[2,0],[2,1]],local:[-.5,0,-1.6]},
 {id:'town-authored-entry-town-porches-5-west-wing',buildingId:'town-porches-5',hash:PORCH_OPEN,kind:'open-porch',doorPartN:null,floorPartNs:[11,17],floorCells:[[0,2],[0,3]],local:[-1.75,0,.5]},
 {id:'town-authored-entry-town-porches-5-east-wing',buildingId:'town-porches-5',hash:PORCH_OPEN,kind:'open-porch',doorPartN:null,floorPartNs:[65,71],floorCells:[[4,2],[4,3]],local:[1.75,0,.5]},
] as const;

function requirePart(parts:readonly PartPlacement[],n:number,name:string,x:number,z:number,rot=0){
 const matches=parts.filter(p=>p.n===n),part=matches[0];
 if(matches.length!==1||part.part!==name||part.x!==x||part.z!==z||part.rot!==rot||part.level!==0)
  throw Error(`Changed actual part for explicit entrance: ${n} ${name}`);
 return part;
}

/** Real facade openings with ordinary paving landings. Their wall spans are
 * intentionally open, so the automatic wall.door/step scan cannot name them.
 * A matching content hash and actual source part are required; these records
 * add navigation targets and never create or suppress a collision surface. */
const openings=[
 {id:'town-authored-entry-town-court-to-porch-5',buildingId:'town-court-to-porch-5',hash:'2fce82e71a59bf667db9a8ccf635b7394b32edeabe85cfa40f42287956dd8849',landing:43},
 {id:'town-authored-entry-town-court-to-porch-7',buildingId:'town-court-to-porch-7',hash:'340057f2a79ef40129a69fb64a54ea4ab9b822f6bb76a7f51393808d8de371f4',landing:31},
];
export function townAuthoredEntrancePoints(town:{objects:PlacedObject[];blueprints:BlueprintContents;environment:string;radius:number},automaticEntries?:readonly EntrancePoint[]):TownAuthoredEntrancePoint[]{
 const field=fieldOf(town.environment,town.radius);
 const legacy:EntrancePoint[]=openings.flatMap(opening=>{
  const object=town.objects.find(candidate=>candidate.id===opening.buildingId&&candidate.blueprintHash===opening.hash);
  if(!object)return [];
  const parts=town.blueprints[opening.hash],landing=parts.find(part=>part.n===opening.landing&&part.part==='street.paving');
  if(!landing)throw Error(`Missing ordinary entrance landing: ${opening.id}`);
  const transform=partTransform(landing,pivotOf(parts)),base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  const point=localToDir({dir:object.position,yaw:object.rotation},base,
   [transform.position[0]+Math.sin(transform.yaw)*1.2,0,transform.position[2]+Math.cos(transform.yaw)*1.2]);
  return [{id:opening.id,point,buildingId:object.id}];
 });
 for(const [buildingId,hashes] of Object.entries(approvedBlueprints)){
  const object=town.objects.find(candidate=>candidate.id===buildingId);
  if(object&&(object.kind!=='structure'||!object.blueprintHash||!hashes.includes(object.blueprintHash)))
   throw Error(`Unapproved blueprint for explicit entrance: ${buildingId}`);
 }
 const explicit:TownExplicitEntrancePoint[]=extraPortals.flatMap(spec=>{
  const object=town.objects.find(candidate=>candidate.id===spec.buildingId);
  if(!object||object.blueprintHash!==spec.hash)return [];
  const parts=town.blueprints[object.blueprintHash];
  if(!parts||new Set(parts.map(p=>p.n)).size!==parts.length)throw Error(`Missing or duplicate actual parts: ${spec.id}`);
  const step=requirePart(parts,85,'step.entry',2,4),pivot=pivotOf(parts);
  if(pivot.x!==2.5||pivot.z!==2.5)throw Error(`Changed explicit entrance pivot: ${spec.id}`);
  const steps=parts.filter(p=>p.part==='step.entry'||p.part==='ramp.entry'||p.part===WIDE_ENTRY_ID),stepIndex=steps.indexOf(step);
  if(stepIndex<0)throw Error(`Missing automatic entry step: ${spec.id}`);
  const sharedAutomaticApproachId=`town-frontdoor-${object.id}${stepIndex?`-entry-${step.n}`:''}`,t=partTransform(step,pivot),base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  const support=PART_COLLIDERS[step.part]().filter(box=>box.support);
  if(!support.length)throw Error(`Actual entry step has no support: ${spec.id}`);
  const outer=Math.max(...support.map(box=>box.center[2]+Math.abs(Math.cos(box.pitch??0))*box.half[2]+Math.abs(Math.sin(box.pitch??0))*box.half[1]));
  const centerX=step.part===WIDE_ENTRY_ID?WIDE_ENTRY.centerX:0;
  const derived=localToDir({dir:object.position,yaw:object.rotation},base,
   [t.position[0]+Math.cos(t.yaw)*centerX+Math.sin(t.yaw)*(outer+.56),0,t.position[2]-Math.sin(t.yaw)*centerX+Math.cos(t.yaw)*(outer+.56)]);
  const automatic=automaticEntries?.filter(e=>e.id===sharedAutomaticApproachId);
  if(automatic&&(automatic.length!==1||automatic[0].buildingId!==object.id||automatic[0].point.some((n,i)=>n!==derived[i])))
   throw Error(`Missing or changed original automatic approach: ${spec.id}`);
  const point=automatic?.[0].point??derived;
  let terminal:TownExplicitEntrancePoint['terminal'];
  if(spec.kind==='shallow-wing-cell-centre'){
   requirePart(parts,spec.doorPartN,'wall.door.open',spec.doorCell[0],spec.doorCell[1],spec.doorCell[2]);
   const floor=requirePart(parts,spec.floorPartN,'floor.deck',spec.floorCell[0],spec.floorCell[1]),centre=partTransform(floor,pivot).position;
   if(centre.some((n,i)=>n!==spec.local[i]))throw Error(`Changed actual shallow floor centre: ${spec.id}`);
   terminal={kind:'actual-floor-cell-centre',partN:spec.floorPartN,cell:{x:floor.x,z:floor.z,level:0},local:[...spec.local],actualInteriorDepth:.5};
  }else if(spec.kind==='rear-room'){
   const door=requirePart(parts,spec.doorPartN,'wall.door-wide.open',spec.doorCell[0],spec.doorCell[1],spec.doorCell[2]);
   requirePart(parts,13,'wall.window',0,2,1);
   requirePart(parts,77,'wall.window',4,3,3);
   if(parts.some(p=>p.n===31))throw Error(`Rear room wide door has an overlapping old wall: ${spec.id}`);
   spec.floorPartNs.forEach((n,i)=>requirePart(parts,n,'floor.deck',spec.floorCells[i][0],spec.floorCells[i][1]));
   requirePart(parts,43,'street.paving',2,2);
   requirePart(parts,44,'street.paving',2,3);
   const doorTransform=partTransform(door,pivot),doorPlaneLocal:Vec3=[doorTransform.position[0]+Math.cos(doorTransform.yaw)*WIDE_DOOR.centerX,0,doorTransform.position[2]-Math.sin(doorTransform.yaw)*WIDE_DOOR.centerX];
   const depth=(doorPlaneLocal[0]-spec.local[0])*Math.sin(doorTransform.yaw)+(doorPlaneLocal[2]-spec.local[2])*Math.cos(doorTransform.yaw);
   if(Math.abs(depth-1.1)>1e-9)throw Error(`Changed rear room terminal depth: ${spec.id}`);
   terminal={kind:'actual-room-standing',floorPartNs:spec.floorPartNs,local:[...spec.local],doorPlaneLocal,actualInteriorDepth:depth};
  }else{
   spec.floorPartNs.forEach((n,i)=>requirePart(parts,n,'floor.deck',spec.floorCells[i][0],spec.floorCells[i][1]));
   if(parts.some(p=>p.level===0&&((p.x===0&&p.z===2&&p.rot===1)||(p.x===4&&p.z===3&&p.rot===3))&&p.part.startsWith('wall.')))
    throw Error(`Explicit open wing has acquired a wall or door: ${spec.id}`);
   terminal={kind:'open-wing-standing',floorPartNs:spec.floorPartNs,local:[...spec.local]};
  }
  return[{id:spec.id,buildingId:object.id,point,sharedAutomaticApproachId,expectedBlueprintHash:object.blueprintHash,entryPartN:85,doorPartN:spec.doorPartN,kind:spec.kind,terminal}];
 });
 return [...legacy,...explicit];
}
