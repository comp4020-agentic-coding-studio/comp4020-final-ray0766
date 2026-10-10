import type {Blueprint,PartPlacement,Rot} from './blueprint-model.ts';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';

/** Small working surfaces made solely from ordinary workshop parts. */
export function townWorksite(kind:'garden'|'repair'|'counter'|'sorting'):Blueprint {
 const parts:PartPlacement[]=[];
 const add=(part:PartPlacement['part'],x:number,z:number,rot:Rot=0)=>parts.push({n:parts.length+1,part,x,z,rot,level:0});
 const width=kind==='garden'||kind==='repair'?2:1;
 for(let x=0;x<width;x++)add('street.paving',x,0);
 if(kind==='garden'){
  for(let x=0;x<2;x++){add('garden.bed',x,0);add('rail.guard',x,0,2);}
 }else if(kind==='repair'){
  add('furniture.sideboard',0,0,2);add('storage.crates',1,0,2);
 }else add(kind==='sorting'?'furniture.table':'furniture.sideboard',0,0,2);
 return {id:'6177e154-332d-4d16-bb46-b90200000000' as BlueprintId,name:`Working ${kind}`,parts,groups:[]};
}
