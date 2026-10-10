import { PART_INFO } from '../../assets/claude-geometry/blueprint/parts/info.ts';
import { PART_IDS } from '../../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { homeDoorLeaves } from '../home-door.ts';
import { VILLAGE_PART_BOUNDS } from './village-bounds.ts';
import type { Vec3 } from '../world.ts';

/** Physics 7: authored village proxies in metres, +Y up, +Z exterior.
 * Mesh LOD never changes walking. Slots, persisted part IDs and hashes stay put. */
export interface PartBox { center:Vec3; half:Vec3; yaw?:number; pitch?:number; support?:boolean; tag:string }
const box=(tag:string,center:Vec3,size:Vec3,support=false,yaw=0):PartBox=>({tag,center,half:size.map(n=>n/2) as Vec3,support,yaw});
const between=(tag:string,min:Vec3,max:Vec3,support=false)=>box(tag,min.map((n,i)=>(n+max[i])/2) as Vec3,min.map((n,i)=>max[i]-n) as Vec3,support);
const bounds=(id:PartId)=>{const b=VILLAGE_PART_BOUNDS[id];return [between(id,b.min,b.max)];};
const slab=()=>[box('floor',[0,-.08,0],[1,.16,1],true)];
function door(open:boolean):PartBox[]{
  return [box('jamb',[-.45,1.02,0],[.1,2.04,.2]),box('jamb',[.45,1.02,0],[.1,2.04,.2]),
    box('lintel',[0,1.97,0],[.8,.14,.2]),box('threshold',[0,.01,.0255],[1,.02,.251],true),
    box('door head rail',[0,1.97,.126],[1,.14,.052]),...homeDoorLeaves(open)];
}
function stairs():PartBox[]{
  const result:PartBox[]=[],going=1.82/11,slope=.2/going;
  for(let i=1;i<=11;i++){
    const front=.44-i*going,back=i===11?-1.5:front-going-.025,top=i===11?2.199:i*.2;
    result.push(box('stair tread',[0,top/2,(front+back)/2],[i===11?.67:.6,top,front-back],true));
  }
  // Rails match the new narrow timber rail, including its shortened top exit.
  // Filled treads are conservative under the stair; no invisible 0.9 m wall
  // extends above their sides or across the door at the top.
  const front=.405,back=-1.32,depth=.045/Math.cos(Math.atan(slope));
  for(const side of [-1,1]){
    for(let i=0;i<16;i++){
      const z0=back+i*(front-back)/16,z1=back+(i+1)*(front-back)/16;
      result.push(between('stair rail',[side*.3175-.025,(.44-z1)*slope+.91-depth,z0],[side*.3175+.025,(.44-z0)*slope+.91,z1]));
    }
    const postTop=.07*slope+.97;
    result.push(box('stair foot post',[side*.3175,postTop/2,.405],[.07,postTop,.07]));
    result.push(box('stair stringer foot',[side*.3175,.112,.397],[.035,.224,.1853]));
    // Solid strings and the union of the real low/medium/high rail posts.
    // These are side obstacles, never alternate walking surfaces.
    for(let i=0;i<16;i++){
      const back=-1.38+i*1.86964/16,front=-1.38+(i+1)*1.86964/16;
      const top=Math.min(2.2,Math.max(0,(.44-back)*slope+.06));
      const bottom=Math.max(0,(.44-front)*slope+.06-.24/Math.cos(Math.atan(slope)));
      result.push(between('stair string',[side*.3175-.0175,bottom,back],[side*.3175+.0175,top,front]));
    }
    for(const i of [4,6,8]){
      const z=.44-i*going-.06,bottom=(.44-z)*slope+.06,top=(.44-z)*slope+.91-depth;
      result.push(box('stair rail post',[side*.3175,(bottom+top)/2,z],[.04,top-bottom,.04]));
    }
  }
  return result;
}
export const SLOPE_BOUNDS={halfWidth:.5,back:-.5,front:.9622,bottom:-.16,top:.65};
// A stepped conservative top follows the two pitches and ridge. In particular
// air above the low eave stays open; a full-height roof envelope is not physics.
const roofTop=(z:number)=>z<-.41?.65:z<=.5?.5*(.5-z)+.102:-.25*(z-.5)+.075;
function slopeRoof():PartBox[]{
 const cuts=[-.5,-.41,-.25,0,.041,.25,.5,.541,.61,.735,.86,.9622];
 return cuts.slice(0,-1).map((z,i)=>{const end=cuts[i+1],bottom=z>=.61?Math.min(-.16,-.25*(end-.5)-.045):-.16,top=roofTop(z);
  return between('pitched roof',[-.5,bottom,z],[.5,top,end]);});
}
function suggested(id:PartId):PartBox[]{
 return (PART_INFO[id].colliders??[]).filter((s,i)=>id!=='ramp.entry'||i===0||!s.support)
   .map(s=>({...box(id,s.center,s.size,s.support),pitch:s.pitch}));
}
function cornerRoof(hip:boolean):PartBox[]{
 const shapes:PartBox[]=[],start=-.5,end=hip?.9622:.5,n=8,step=(end-start)/n;
 for(let x=0;x<n;x++)for(let z=0;z<n;z++){
  const x0=start+x*step,z0=start+z*step,top=Math.min(.65,roofTop(hip?Math.max(x0,z0):Math.min(x0,z0))+.05);
  shapes.push(between('corner roof',[x0,-.16,z0],[x0+step,top,z0+step]));
 }
 return shapes;
}
function verge(side:number):PartBox[]{
 const count=12,step=1.4622/count;
 return Array.from({length:count},(_,i)=>{const z=-.5+i*step,top=Math.min(.675,roofTop(z)+.05);
  return between('roof verge',[side<0?-.58:.5,-.226,z],[side<0?-.5:.58,z<-.35?.675:top,z+step]);});
}
const added=Object.fromEntries(PART_IDS.slice(21).map(id=>[id,()=>suggested(id)])) as Record<PartId,()=>PartBox[]>;
added['roof.slope.hip']=()=>cornerRoof(true);added['roof.slope.valley']=()=>cornerRoof(false);
added['roof.verge.left']=()=>verge(-1);added['roof.verge.right']=()=>verge(1);
// Furniture no longer keeps the old high chair backs/table top as air walls.
for(const id of ['furniture.table','furniture.chair','furniture.sideboard','furniture.shelf','storage.crates','storage.barrel','garden.pot','furniture.bench','light.wall','sign.blank','sign.mail','sign.cup'] as const)added[id]=()=>bounds(id);
added['structure.beam']=()=>[box('beam',[0,1.94,0],[.8,.2,.15]),...[-1,1].map(side=>box('beam bracket',[side*.325,1.815,0],[.15,.3852,.15]))];
added['garden.tree']=()=>[box('pine trunk',[0,.55,0],[.28,1.1,.28]),box('pine crown',[-.005,1.60,-.019],[.865,1.4,.673])];
added['garden.bed']=()=>[box('stone flower bed',[0,.155,0],[.76,.31,.76])];
added['street.kerb.corner']=()=>[box('kerb',[0,.045,.5],[1,.19,.15],true),box('kerb',[.5,.045,0],[.15,.19,1],true),box('rounded kerb turn',[.4625,.045,.4625],[.225,.19,.225],true)];
added['ramp.entry']=()=>[...suggested('ramp.entry'),...Array.from({length:12},(_,i)=>{
 const z=-.5+i/6,end=z+1/6,top=-.3*(end+.5)-.1;
 return between('ramp solid underside',[-.4,-.9,z],[.4,top,end]);
}),...[-1,1].flatMap(side=>Array.from({length:12},(_,i)=>{
 const z=-.5+i/6,end=z+1/6,top=Math.min(0,-.3*(z+.5)+.05);
 return between('ramp stone cheek',[side<0?-.5:.4,-.9,z],[side<0?-.4:.5,top,end]);
}))];
export const PART_COLLIDERS:Record<PartId,()=>PartBox[]>={
 ...added,
 'floor.deck':slab,'floor.grate':()=>[box('floor',[0,-.06,0],[1,.12,1],true)],
 'roof.deck':()=>[...slab(),...[-.3,.3].map(z=>box('ceiling joist',[0,-.19,z],[1,.06,.08])),box('ceiling lantern',[0,-.2175,-.05],[.08,.115,.08])],
 'wall.solid':()=>bounds('wall.solid'),'wall.window':()=>bounds('wall.window'),'wall.louvre':()=>bounds('wall.louvre'),'wall.corrugated':()=>bounds('wall.corrugated'),
 'wall.door':()=>door(false),'wall.door.open':()=>door(true),
 'structure.column':()=>bounds('structure.column'),'stair.straight':stairs,
 'rail.guard':()=>bounds('rail.guard'),'roof.parapet':()=>bounds('roof.parapet'),
 'roof.slope':slopeRoof,'roof.plant':()=>bounds('roof.plant'),
 'street.paving':slab,'street.road':slab,'pad.quarter':slab,
 'street.kerb':()=>[box('kerb',[0,.045,0],[.995,.19,.15],true)],
 'street.pipes':()=>bounds('street.pipes'),
 'service.light':()=>[box('light column',[-.3,1.71,-.3],[.22,3.42,.22]),box('light arm',[-.3,3.385,.03],[.07,.07,.82]),
   {...box('light brace',[-.3,3.175,-.07],[.05,.05,.56]),pitch:-Math.PI/4},box('light head',[-.3,3.25,.36],[.16,.2,.16])],
};
