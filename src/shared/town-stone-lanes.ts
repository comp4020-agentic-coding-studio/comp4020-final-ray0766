import {Vector3} from 'three';
import type {Blueprint,PartPlacement} from './blueprint-model.ts';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';
import type {BlueprintContents} from './blueprints.ts';
import {structureSize} from './blueprints.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import type {PlacedObject} from './planets.ts';
import {placementProblem} from './planets.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {facePoint} from './harbour-layout.ts';
import {StructurePlacementCache} from './structure-placement.ts';
import type {Vec3} from './world.ts';

/** Short, one-metre-wide ordinary paving compositions; no road texture or
 * invisible corridor. Each strip remains editable in the player's grid. */
export function townStoneLane(length:1|2|3|4|5):Blueprint {
 const parts:PartPlacement[]=Array.from({length},(_,z)=>({n:z+1,part:'street.paving',x:0,z,rot:0,level:0}));
 return {id:'6177e154-332d-4d16-bb46-b90300000000' as BlueprintId,name:`Stone lane ${length}m`,parts,groups:[]};
}

type StoneLength=1|2|3|4|5;
export interface TownStoneLaneReport {
 id:string;placed:number;
 /** Every rejected candidate, including longer strips before a shorter fit. */
 failures:{position:Vec3;problem:string;segment:number;length?:StoneLength}[];
 /** Nominal route spans left for the author to inspect, not paving coverage. */
 unplacedSpans:{segment:number;fromMetres:number;toMetres:number;problem:string}[];
}
/** Authoring proposal only: exact ordinary placement guards every slab and
 * join. Unplaced spans remain reported, and require real-motion validation. */
export function planTownStoneLanes(input:{routes:HomeSurfaceRoute[];objects:PlacedObject[];blueprints:BlueprintContents;hashes:Record<1|2|3,string>&Partial<Record<4|5,string>>;radius:number;environment:string;maxObjects:number;maxStructures:number;version:number}){
 const {radius,blueprints}=input,field=fieldOf(input.environment,radius),cache=new StructurePlacementCache();
 const maxLength=input.hashes[5]?5:input.hashes[4]?4:3;
 const objects:PlacedObject[]=[],occupied=[...input.objects],reports:TownStoneLaneReport[]=[];
 let structures=occupied.filter(o=>o.kind==='structure').length;
 for(const route of input.routes){
  const report:TownStoneLaneReport={id:route.id,placed:0,failures:[],unplacedSpans:[]};reports.push(report);
  for(let segment=1;segment<route.points.length;segment++){
   const a=new Vector3(...route.points[segment-1]),b=new Vector3(...route.points[segment]),angle=a.angleTo(b),length=angle*radius;
   if(length<1e-6)continue;
   const at=(metres:number)=>{const t=Math.max(0,Math.min(1,metres/length)),sin=Math.sin(angle);return(sin>1e-8?a.clone().multiplyScalar(Math.sin((1-t)*angle)/sin).addScaledVector(b,Math.sin(t*angle)/sin):a.clone().lerp(b,t)).normalize().toArray() as Vec3;};
   let cursor=0,unplacedFrom=0,attempt=0;
   // Pack integer lengths in order. Equal division followed by ceil(length)
   // overlaps neighbouring strips. The small proposed joint still has to pass
   // ordinary spherical seating/placement and subsequent walking checks.
   while(length-cursor>=.86){
    if(occupied.length>=input.maxObjects||structures>=input.maxStructures){
     const problem='Public construction budget reached.';
     report.failures.push({position:at(cursor),problem,segment});
     report.unplacedSpans.push({segment,fromMetres:unplacedFrom,toMetres:length,problem});
     unplacedFrom=length;break;
    }
    let accepted=false,lastProblem='No ordinary strip fits this span.';
    for(let size=Math.min(maxLength,Math.floor(length-cursor+.14));size>=1;size--){
     const strip=size as StoneLength,blueprintHash=input.hashes[strip];if(!blueprintHash)continue;
     const center=cursor+size/2,position=at(center),rotation=(facePoint(position,at(center+.01))+Math.PI*2)%(Math.PI*2),parts=blueprints[blueprintHash];
     const object:PlacedObject={id:`town-stone-${route.id}-${segment}-${attempt++}`,kind:'structure',position,rotation,version:input.version,blueprintHash,...structureSize(parts)};
     const problem=objectSeat(field,object,blueprints).problem??placementProblem('structure',position,occupied,object.id,object.radius,radius,2,{rotation,blueprintHash,blueprints,field,structureCache:cache});
     if(problem){lastProblem=problem;report.failures.push({position,problem,segment,length:strip});continue;}
     objects.push(object);occupied.push(object);structures++;report.placed++;accepted=true;
     unplacedFrom=cursor+size;cursor=unplacedFrom+.09;break;
    }
    if(!accepted){
     const next=Math.min(length,cursor+.45);
     report.unplacedSpans.push({segment,fromMetres:unplacedFrom,toMetres:next,problem:lastProblem});cursor=next;unplacedFrom=next;
    }
   }
   if(unplacedFrom<length)report.unplacedSpans.push({segment,fromMetres:unplacedFrom,toMetres:length,problem:'Remaining span is shorter than one ordinary slab.'});
  }
 }
 return {objects,reports};
}
