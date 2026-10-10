import type {Blueprint,PartPlacement} from './blueprint-model.ts';
import {homeCottage} from '../assets/claude-geometry/blueprint/samples.ts';
import {townStreetGallery} from './town-place-blueprints.ts';

/** Ordinary workshop parts for the connected court fronts. Door landings in
 * the two houses use street.paving; their open portals are authored separately
 * from the step/door-derived entrances. They retain normal floor collisions. */
function house(width:number,door:number):PartPlacement[]{
 const parts:PartPlacement[]=[];
 const add=(part:PartPlacement['part'],x:number,z:number,rot:PartPlacement['rot']=0,level=0)=>
  parts.push({n:parts.length+1,part,x,z,rot,level});
 for(let x=0;x<width;x++)for(let z=0;z<2;z++){
  add('floor.deck',x,z);
  add('roof.slope',x,z,z===0?2:0,1);
  if(z===0)add(x%2?'wall.window':'wall.solid',x,z,2);
  if(z===1)add(x===door?'wall.door.open':x%2?'wall.window':'wall.solid',x,z);
  if(x===0)add('wall.window',x,z,3);
  if(x===width-1)add('wall.solid',x,z,1);
 }
 for(const [x,z,rot]of [[0,0,2],[width-1,0,1],[0,1,3],[width-1,1,0]] as const)
  add('structure.column',x,z,rot);
 for(const z of [0,1]){
  const rot=z===0?2:0;
  add(z===0?'roof.verge.right':'roof.verge.left',0,z,rot,1);
  add(z===0?'roof.verge.left':'roof.verge.right',width-1,z,rot,1);
 }
 add('step.entry',door,2);
 add('furniture.sideboard',width-1,0,2);
 return parts;
}

function openLanding(source:PartPlacement[],door:number):PartPlacement[]{
 const parts=source.filter(p=>p.part!=='wall.door.open'&&
  !(p.part==='structure.column'&&p.x===door&&p.z===1&&p.rot===3))
  .map(p=>p.part==='step.entry'?{...p,part:'street.paving' as const}:p);
 // The roof is carried by a real rear corner post. A front beam would need
 // two front posts and would reintroduce the narrow opening being removed.
 parts.push({n:Math.max(...parts.map(p=>p.n))+1,part:'structure.column',x:door,z:1,rot:2,level:0});
 return parts;
}

export function townConnectedFront(kind:'long-corner'|'short-return'|'open-gallery'):Blueprint{
 const base=townStreetGallery();
 if(kind==='open-gallery')return {...base,name:'Open court gallery',parts:base.parts.filter(p=>
  p.part!=='structure.beam'&&!(p.part==='structure.column'&&p.rot===0&&p.x<2))};
 if(kind==='short-return')return {...base,name:'Short court return house',parts:openLanding(house(3,1),1)};
 // The missing front corner leaves the existing shared street gate outdoors.
 // Its remaining corner has a real hip roof and a complete end wall.
 const parts=house(5,0).filter(p=>!(p.x===4&&p.z===1)&&!(p.x===4&&p.part.startsWith('roof.verge')));
 let n=Math.max(...parts.map(p=>p.n))+1;
 parts.push({n:n++,part:'wall.window',x:4,z:0,rot:0,level:0},
  {n,part:'structure.column',x:4,z:0,rot:0,level:0});
 for(const p of parts)if(p.x===4&&p.z===0&&p.part==='roof.slope'){
  p.part='roof.slope.hip';p.rot=1;
 }
 return {...base,name:'Long corner-front house',parts:openLanding(parts,0).filter(p=>
  !(p.part==='wall.window'&&p.x===0&&p.z===1&&p.rot===3))};
}

/** Public-house furniture correction only; the reusable vendor sample and
 * private blueprints retain their original contents and identity. */
export function townClearEntryHome():Blueprint{
 const base=homeCottage();
 return {...base,name:'Home with a clear entry',parts:base.parts.map(p=>
  p.n===48&&p.part==='garden.pot'?{...p,x:2,z:1}:p)};
}
