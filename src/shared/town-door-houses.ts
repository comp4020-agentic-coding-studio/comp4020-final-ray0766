import type {Blueprint,PartPlacement} from './blueprint-model.ts';
import {streetHouse} from './town-street-houses.ts';

/** Real door/step arrangements for the street each house faces. These are
 * separate ordinary documents; existing stored house hashes stay unchanged. */
export function townDoorHouse(kind:'front-left'|'court-side'|'court-back'|'gable-side'):Blueprint {
 const blueprint=streetHouse(kind==='gable-side'?'gable':'court'),parts=blueprint.parts;
 const door=parts.find(p=>p.level===0&&p.part==='wall.door.open')!,step=parts.find(p=>p.part==='step.entry')!;
 door.part='wall.window';
 const add=(part:PartPlacement['part'],x:number,z:number,rot:PartPlacement['rot']=0)=>parts.push({n:Math.max(...parts.map(p=>p.n))+1,part,x,z,rot,level:0});
 if(kind==='front-left'){
  parts.find(p=>p.level===0&&p.x===0&&p.z===3&&p.rot===0&&p.part.startsWith('wall.'))!.part='wall.door.open';
  step.x=0;
 }else if(kind==='gable-side'){
  parts.find(p=>p.level===0&&p.x===3&&p.z===2&&p.rot===1&&p.part.startsWith('wall.'))!.part='wall.door.open';
  step.part='street.paving';add('step.entry',4,2,1);
 }else{
  const east=kind==='court-side';
  parts.find(p=>p.level===0&&p.x===(east?1:2)&&p.z===(east?2:1)&&p.rot===(east?1:0)&&p.part.startsWith('wall.'))!.part='wall.door.open';
  step.part='street.paving';
  Object.assign(parts.find(p=>p.part==='street.paving'&&p.x===2&&p.z===2)!,{part:'step.entry',rot:east?1:0});
  add('street.paving',3,3);
  if(east)Object.assign(parts.find(p=>p.part==='garden.bed')!,{part:'garden.pot',x:3,z:3,rot:1});
  else Object.assign(parts.find(p=>p.part==='furniture.bench')!,{x:3,z:3,rot:1});
 }
 blueprint.name=({'front-left':'Offset front cottage','court-side':'Side court entry house','court-back':'Inner court entry house','gable-side':'Side entry gable house'})[kind];
 return blueprint;
}
