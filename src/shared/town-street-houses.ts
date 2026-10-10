import type { Blueprint, PartPlacement, Rot } from './blueprint-model.ts';
import type { BlueprintId } from '../assets/claude-geometry/core/ids.ts';

/** Public streets use the same metre grid, catalogue and support rules as a
 * player's workshop. These are editable compositions, never scaled scenery. */
export function streetHouse(kind: 'court' | 'hall' | 'terrace' | 'gable'): Blueprint {
 const parts:PartPlacement[]=[];
 const add=(part:PartPlacement['part'],x:number,z:number,rot:Rot=0,level=0)=>parts.push({n:parts.length+1,part,x,z,rot,level});
 const cells:[number,number][]=[];
 for(let x=0;x<4;x++)for(let z=0;z<4;z++)if(kind!=='court'||x<2||z<2)cells.push([x,z]);
 const has=(x:number,z:number)=>cells.some(p=>p[0]===x&&p[1]===z);
 for(const [x,z]of cells){
  add('floor.deck',x,z);
  for(const [r,dx,dz]of [[0,0,1],[1,1,0],[2,0,-1],[3,-1,0]] as [Rot,number,number][])
   if(!has(x+dx,z+dz))add(x===1&&z===3&&r===0?'wall.door.open':(x+z+r)%3===0?'wall.window':'wall.solid',x,z,r);
 }
 for(const [x,z,r]of [[0,0,2],[3,0,1],[0,3,3],[kind==='court'?1:3,3,0],[1,1,0]] as [number,number,Rot][])add('structure.column',x,z,r);
 add('step.entry',1,4);
 if(kind==='court'){
  for(const [x,z]of cells){
   const corner=x===0&&z===0,valley=x===1&&z===1;
   add(corner?'roof.slope.hip':valley?'roof.slope.valley':'roof.slope',x,z,corner?2:valley?0:z===0?2:x===0?3:z===1?0:1,1);
  }
  add('street.paving',2,2);add('street.paving',3,2);add('street.paving',2,3);
  add('garden.bed',3,2);add('furniture.bench',2,3,1);
 }else if(kind==='gable'){
  // A raised two-cell-deep gable sits above lower front/back roof terraces.
  // Interior columns support each upper corner; the open upper gallery is
  // architectural structure rather than a hidden interaction destination.
  for(let x=0;x<4;x++)for(const z of [0,3])add('roof.deck',x,z,0,1);
  for(let x=0;x<4;x++)for(const z of [1,2]){
   add('floor.deck',x,z,0,1);
   if(z===1)add('wall.window',x,z,2,1);
   else add(x===1?'wall.door.open':'wall.window',x,z,0,1);
   if(x===0)add('wall.solid',x,z,3,1);
   if(x===3)add('wall.solid',x,z,1,1);
   add('roof.slope',x,z,z===1?2:0,2);
  }
  for(const [x,z,r]of [[0,1,2],[3,1,1],[0,2,3],[3,2,0]] as [number,number,Rot][]){
   add('structure.column',x,z,r);add('structure.column',x,z,r,1);
  }
  for(let x=0;x<4;x++)for(const z of [0,3])add('rail.guard',x,z,z===0?2:0,1);
 }else{
  for(const [x,z]of cells){
   add('roof.deck',x,z,0,1);
   for(const [r,dx,dz]of [[0,0,1],[1,1,0],[2,0,-1],[3,-1,0]] as [Rot,number,number][])
    if(!has(x+dx,z+dz))add('roof.parapet',x,z,r,1);
  }
  if(kind==='terrace'){
   add('garden.pot',0,0,2,1);add('garden.pot',3,0,1,1);add('furniture.bench',2,3,2,1);
  }
 }
 add('furniture.shelf',3,0,1);add('furniture.table',0,1);
 add('furniture.chair',0,1,0);add('furniture.chair',0,1,2);
 return {id:'51549d27-cabe-4d99-af34-a20000000000' as BlueprintId,name:`Street ${kind}`,parts,groups:[]};
}
