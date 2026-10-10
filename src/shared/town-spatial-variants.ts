import type {Blueprint,PartPlacement,Rot} from './blueprint-model.ts';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';

export interface TownSpatialVariant {name:string;blueprint:Blueprint;hash:string}

function copyParts(base:readonly Blueprint[],index:number):PartPlacement[]{
 const blueprint=base[index];
 if(!blueprint)throw Error(`Missing town base blueprint ${index}`);
 return structuredClone(blueprint.parts);
}

function builder(){
 const parts:PartPlacement[]=[];
 const add=(part:PartPlacement['part'],x:number,z:number,rot:Rot=0,level=0)=>
  parts.push({n:parts.length+1,part,x,z,rot,level});
 return {parts,add};
}

/** Keep the original front court and doorway, and close the shortened rear
 * wing with ordinary end walls. Existing instance numbers remain stable. */
function shortHarbourCourt(source:PartPlacement[]):PartPlacement[]{
 const parts=source.filter(p=>!(p.x>=2&&p.z<=1));
 for(const p of parts)if([35,39,40].includes(p.n)){
  p.part='roof.slope';p.rot=p.x===0?3:1;
 }
 parts.push({n:111,part:'wall.solid',x:1,z:0,rot:1,level:0},
  {n:112,part:'wall.window',x:1,z:1,rot:1,level:0},
  {n:113,part:'structure.column',x:1,z:0,rot:1,level:0});
 return parts;
}

function lowGableWing(source:PartPlacement[]):PartPlacement[]{
 const parts=source.filter(p=>!(p.level>=1&&p.x>=2&&p.z>=1&&p.z<=2));
 let n=100;
 for(const x of [2,3])for(const z of [1,2])parts.push({n:++n,part:'roof.deck',x,z,rot:0,level:1});
 for(const z of [1,2])parts.push({n:++n,part:'wall.window',x:1,z,rot:1,level:1});
 return parts;
}

/** The two narrow wings become open galleries facing their own court. The
 * main rear room and roof remain; its central roof has a real interior post. */
function openSharedCourt(source:PartPlacement[]):PartPlacement[]{
 const parts=source.filter(p=>!(p.level===0&&p.part.startsWith('wall.')&&
  ((p.z===1&&p.x>0&&p.x<4&&p.rot===0)||(p.x===0&&p.z>=2&&p.rot===1)||
   (p.x===4&&p.z>=2&&p.rot===3))));
 parts.push({n:87,part:'structure.column',x:2,z:1,rot:2,level:0});
 const pot=parts.find(p=>p.part==='garden.pot')!;pot.x=1;pot.z=0;
 return parts;
}

/** Retain the real step but open the court-facing wall span. A front beam
 * would require posts in the walking opening, so real rear posts carry it. */
function wideCourtEntry(source:PartPlacement[],side:boolean):PartPlacement[]{
 source.find(p=>p.part==='wall.door.open')!.part='wall.window';
 const opening=source.find(p=>p.part.startsWith('wall.')&&p.level===0&&
  p.x===(side?1:3)&&p.z===(side?3:1)&&p.rot===(side?1:0))!;
 opening.part='wall.door.open';
 Object.assign(source.find(p=>p.part==='step.entry')!,{part:'street.paving',rot:0});
 Object.assign(source.find(p=>p.part==='street.paving'&&p.x===(side?2:3)&&p.z===(side?3:2))!,
  {part:'step.entry',rot:side?1:0});
 const bed=source.find(p=>p.part==='garden.bed');
 if(bed)Object.assign(bed,{part:'garden.pot',x:2,z:3});
 // These numbers are the authored document identities, including the gaps
 // left by removing inner walls and pots after the bench was taken out.
 const numbered=source.filter(p=>p.part!=='furniture.bench').map((p,i)=>({...p,n:i+1}));
 const parts=numbered.filter(p=>p.part!=='structure.beam'&&p.part!=='garden.pot'&&
  !(p.level===0&&p.part.startsWith('wall.')&&
   ((side&&p.x===1&&p.z>=2&&p.rot===1)||(!side&&p.z===1&&p.x>=2&&p.rot===0)))&&
  !(side&&p.level===0&&p.x===1&&p.z===3&&p.rot===0&&(p.part.startsWith('wall.')||p.part==='structure.column'))&&
  !(!side&&p.level===0&&p.x===3&&p.z===1&&p.rot===1&&p.part.startsWith('wall.')));
 for(const [x,z]of side?[[1,3]]:[[2,1],[3,1]])
  parts.push({n:Math.max(...parts.map(p=>p.n))+1,part:'structure.column',x,z,rot:2,level:0});
 return parts;
}

function longSideRoom():PartPlacement[]{
 const {parts,add}=builder();
 for(let x=0;x<2;x++)for(let z=0;z<5;z++){add('floor.deck',x,z);add('roof.deck',x,z,0,1);}
 for(let z=0;z<5;z++){
  add(z%2?'wall.window':'wall.solid',0,z,3);
  if(z!==2&&z!==3)add(z===0?'wall.solid':'wall.window',1,z,1);
 }
 for(let x=0;x<2;x++){add('wall.window',x,0,2);add('wall.solid',x,4);}
 for(const [x,z,rot]of [[0,0,2],[0,4,3],[1,0,1],[1,4,0],[0,2,0],[0,3,0]] as const)
  add('structure.column',x,z,rot);
 add('step.entry',2,2,1);add('furniture.sideboard',0,0,2);
 return parts;
}

function gardenReturn():PartPlacement[]{
 const {parts,add}=builder();
 for(let z=0;z<2;z++){add('floor.deck',0,z);add('wall.corrugated',0,z,3);add('roof.slope',0,z,1,1);}
 add('structure.column',0,0,2);add('step.entry',1,1,1);add('wall.window',0,0,2);
 return parts;
}

function wideCottage(source:PartPlacement[]):PartPlacement[]{
 const parts=source.filter(p=>!(p.level===0&&p.part==='wall.door.open'));
 parts.push({n:305,part:'structure.column',x:2,z:2,rot:2,level:0});
 return parts;
}

function harbourGallery(width:1|2):PartPlacement[]{
 const {parts,add}=builder();
 for(let x=0;x<width;x++){
  add('floor.deck',x,0);add('wall.corrugated',x,0,2);add('roof.slope',x,0,0,1);
  add('structure.column',x,0);add('structure.beam',x,0);
 }
 add('structure.column',0,0,3);add('structure.column',0,0,2);add('structure.column',width-1,0,1);
 add('wall.window',0,0,3);add('wall.window',width-1,0,1);add('step.entry',width-1,1);
 if(width===2)add('storage.crates',0,0,2);
 return parts;
}

function harbourYardEdge():PartPlacement[]{
 const {parts,add}=builder();
 for(let x=0;x<2;x++){add('street.paving',x,0);add('rail.guard',x,0,2);}
 add('rail.guard',0,0,3);add('storage.barrel',0,0,2);
 return parts;
}

/** Only variants used by the frozen town. The caller supplies the original
 * 43-entry base catalogue; it and the vendor samples are never mutated.
 * Ordering, instance numbers and hashes are stable saved-content identities.
 * Connected court fronts are registered separately by their own factory. */
export function townSpatialVariants(baseBlueprints:readonly Blueprint[]):TownSpatialVariant[]{
 const variants:TownSpatialVariant[]=[];
 const add=(name:string,hash:string,parts:PartPlacement[])=>{
  const id=`51549d27-cabe-4d99-af34-b1${String(variants.length).padStart(10,'0')}` as BlueprintId;
  variants.push({name,hash,blueprint:{id,name:`Town · ${name}`,parts,groups:[]}});
 };
 add('Open-door relay hut','40453cb760aa71ec98cab783eca2d206a78c0de7c85e1dcbc3226b8daac6eb8a',
  copyParts(baseBlueprints,2).map(p=>p.n===8?{...p,part:'wall.door.open'}:p));
 add('Short-wing harbour court','04b29f67aecb168737948af56b1d320750eed07b9eb58b8108e98d89b5fe0cb9',
  shortHarbourCourt(copyParts(baseBlueprints,18)));
 add('Open-front working shed','c0ae0276d2db04c27793275a2473f99d8076a43629bc5a64842721c065f7d8a5',
  copyParts(baseBlueprints,24).filter(p=>p.n!==44));
 add('Orchard entry cottage','b9f58a6e670adf38bc093aa5ec9178e0ba12ab13220a9dc4051987c2b2b21c82',
  copyParts(baseBlueprints,1).map(p=>p.n===48?{...p,x:0,z:0,rot:0}:p));
 add('Open-sided shared court','98729521de292296f8191d8d76471af32b0cb96beea47f12c607e8d6805147c5',
  openSharedCourt(copyParts(baseBlueprints,25)));
 add('Wide side-entry court house','38c02f77f5f10ce18c2956ca717b76e577ed5bee4979ae2084235474d08e71cd',
  wideCourtEntry(copyParts(baseBlueprints,35),true));
 add('Wide inner-court house','2a626a2a06c0d48c3fe6395c25ff8c74fb9627afc0a40e371c7ea25c4ff820cb',
  wideCourtEntry(copyParts(baseBlueprints,36),false));
 add('Gable house with a low wing','f05e9b487d70bec12b33028dd25abdab2382b22ccd8e095e638492eaea1f1799',
  lowGableWing(copyParts(baseBlueprints,21)));
 add('Long courtyard side room','dcdbe3974f6e7c7e2125049bdd80ca808d51d7613e0e3fc3de5a775c806100ff',longSideRoom());
 add('Two-bay garden return','c2ace12003de2ee9982ca1d64004f7935bbaff7a85e684f3e4e64c21f1b597dc',gardenReturn());
 add('Wide-entry cottage','3aec51ef556da5cdfc3fc15a5ed3a13add94e4aa3528465b1aafba261152802c',
  wideCottage(copyParts(baseBlueprints,4)));
 add('Harbour doorway gallery','ba269306d23bddd74894c1ce7d5b0dccf9ea4a0a1468e22f1b4ccbfb94008485',harbourGallery(1));
 add('Harbour return gallery','bf5f3a64c9f09ad5794c46d2b9458f2804cee6e8ee98796c44b3bb2388e6d96a',harbourGallery(2));
 add('Harbour yard edge','bbaef7a079ff180cecf4b8376303c6d5be1c2a0999fb3cd28671651ee90f6de1',harbourYardEdge());
 return variants;
}
