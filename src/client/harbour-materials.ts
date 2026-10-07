import * as T from 'three';
import { HARBOUR_SURFACES, HARBOUR_ACCENTS, HARBOUR_GRAIN } from './presentation-materials.ts';
import { applyCel } from '../assets/claude-geometry/style/cel.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';

// Shared original Sunseed material profile. One bounded palette lives for the app lifetime.
function makePalette(){
  let seed=719;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const texture=(size:number,paint:(ctx:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d')!);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=HARBOUR_GRAIN.anisotropy;t.userData.ownedResource=true;return t;};
  const steel=(name:keyof typeof HARBOUR_SURFACES)=>{const m=applyCel(new T.MeshStandardMaterial(HARBOUR_SURFACES[name]),VILLAGE.cel!);m.userData.ownedResource=true;return m;};
  const concrete=steel('concrete'),pale=steel('pale'),metal=steel('metal'),dark=steel('dark'),copper=steel('copper'),road=steel('road'),edge=steel('edge');
  const cyan=new T.MeshStandardMaterial(HARBOUR_ACCENTS.cyan);
  const amber=new T.MeshStandardMaterial(HARBOUR_ACCENTS.amber);
  const glass=new T.MeshPhysicalMaterial(HARBOUR_ACCENTS.glass);glass.userData.ownedResource=true;
  const windows=Array.from({length:96},()=>random()>.8);
  const facadeMap=texture(512,c=>{c.fillStyle='#efe3c6';c.fillRect(0,0,512,512);for(let row=0;row<12;row++)for(let col=0;col<8;col++){
    const x=col*64+21,y=row*42+7;c.fillStyle='#7d5b43';c.fillRect(x-2,y-2,26,28);c.fillStyle=windows[row*8+col]?'#ffd08a':'#3f5a5e';c.fillRect(x,y,22,23);
    c.fillStyle='#5f8b82';c.fillRect(x-12,y,8,23);c.fillRect(x+26,y,8,23);c.fillStyle='#efe3c6';c.fillRect(x+10,y,2,23);c.fillRect(x,y+11,22,2);c.fillStyle='#b9ad8c';c.fillRect(x-4,y+25,30,3);
  }});
  const lightMap=texture(512,c=>{c.fillStyle='#000000';c.fillRect(0,0,512,512);for(let row=0;row<12;row++)for(let col=0;col<8;col++)if(windows[row*8+col]){const x=col*64+21,y=row*42+7;c.fillStyle='#ffffff';c.fillRect(x,y,22,23);c.fillStyle='#000000';c.fillRect(x+10,y,2,23);c.fillRect(x,y+11,22,2);}});
  const facade=applyCel(new T.MeshStandardMaterial({...HARBOUR_ACCENTS.facade,map:facadeMap,emissiveMap:lightMap}),VILLAGE.cel!);facade.userData.ownedResource=true;
  const palette={concrete,pale,metal,dark,copper,road,edge,cyan,amber,glass,facade};
  for(const [name,m] of Object.entries(palette)){m.name='sunseed:'+name;m.userData.sharedResource=true;}
  return palette;
}
let shared:ReturnType<typeof makePalette>|null=null;
export const harbourMaterials=()=>shared??=makePalette();
