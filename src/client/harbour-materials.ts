import * as T from 'three';
import { HARBOUR_SURFACES, HARBOUR_ACCENTS, HARBOUR_GRAIN } from './presentation-materials.ts';

// Shared original Sunseed material profile. One bounded palette lives for the app lifetime.
function makePalette(){
  let seed=719;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const texture=(size:number,paint:(ctx:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d')!);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=HARBOUR_GRAIN.anisotropy;t.userData.ownedResource=true;return t;};
  const grain=texture(256,c=>{c.fillStyle='#999999';c.fillRect(0,0,256,256);for(let i=0;i<19000;i++){const v=100+random()*100;c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(random()*256,random()*256,1,1+random()*3);}});grain.colorSpace=T.NoColorSpace;
  const steel=(name:keyof typeof HARBOUR_SURFACES)=>{const m=new T.MeshStandardMaterial({...HARBOUR_SURFACES[name],roughnessMap:grain,bumpMap:grain,bumpScale:HARBOUR_GRAIN.bumpScale});m.userData.ownedResource=true;return m;};
  const concrete=steel('concrete'),pale=steel('pale'),metal=steel('metal'),dark=steel('dark'),copper=steel('copper'),road=steel('road'),edge=steel('edge');
  const cyan=new T.MeshStandardMaterial(HARBOUR_ACCENTS.cyan);
  const amber=new T.MeshStandardMaterial(HARBOUR_ACCENTS.amber);
  const glass=new T.MeshPhysicalMaterial(HARBOUR_ACCENTS.glass);glass.userData.ownedResource=true;
  const facadeMap=texture(512,c=>{c.fillStyle='#26343f';c.fillRect(0,0,512,512);for(let row=0;row<12;row++)for(let col=0;col<8;col++){const x=col*64+6,y=row*42+5;c.fillStyle=random()>.8?'#8b8880':'#385260';c.fillRect(x,y,49,30);c.fillStyle='#162431';c.fillRect(x,y,49,3);c.fillRect(x+24,y,2,30);c.fillStyle='#758083';c.fillRect(x,y+30,49,2);}});
  const lightMap=texture(512,c=>{c.fillStyle='#000000';c.fillRect(0,0,512,512);for(let row=0;row<12;row++)for(let col=0;col<8;col++){if(random()>.80){c.fillStyle=random()>.3?'#a28a70':'#7cabb6';c.fillRect(col*64+7,row*42+7,47,24);}}});
  const facade=new T.MeshStandardMaterial({...HARBOUR_ACCENTS.facade,map:facadeMap,emissiveMap:lightMap,bumpMap:facadeMap});facade.userData.ownedResource=true;
  const palette={concrete,pale,metal,dark,copper,road,edge,cyan,amber,glass,facade};
  for(const [name,m] of Object.entries(palette)){m.name='sunseed:'+name;m.userData.sharedResource=true;}
  return palette;
}
let shared:ReturnType<typeof makePalette>|null=null;
export const harbourMaterials=()=>shared??=makePalette();
