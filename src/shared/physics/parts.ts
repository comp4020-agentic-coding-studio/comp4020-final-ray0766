import { PART_INFO } from '../../assets/claude-geometry/blueprint/parts/info.ts';
import { PART_IDS } from '../../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { Vec3 } from '../world.ts';

/** Physics contract for the R7 village kit: metres, +Y up, +Z exterior.
 * Deliberately authored collision proxies, never extracted from rendering meshes.
 * Cosmetic fixings/glass subdivisions do not affect movement. */
export interface PartBox { center: Vec3; half: Vec3; yaw?: number; pitch?: number; support?: boolean; tag: string }
const box=(tag:string,center:Vec3,size:Vec3,support=false,yaw=0):PartBox=>({tag,center,half:size.map(n=>n/2) as Vec3,support,yaw});
const slab=()=>[box('floor',[0,-.08,0],[1,.16,1],true)];
const wall=()=>[box('wall',[0,1.02,0],[1,2.04,.20])];
function door(open:boolean):PartBox[]{
  return [box('jamb',[-.45,.95,0],[.1,1.9,.22]),box('jamb',[.45,.95,0],[.1,1.9,.22]),
    box('lintel',[0,1.96,0],[1,.16,.22]),box('threshold',[0,.0125,0],[.8,.025,.28],true),
    open?box('open leaf',[-.395,.945,-.47],[.055,1.84,.79]):box('closed leaf',[0,.945,.015],[.79,1.84,.065])];
}
function stairs():PartBox[]{
  const result:PartBox[]=[],going=1.82/11;
  // Eleven 0.20 m risers and the final 0.12 m landing; filled underside is a
  // conservative collision proxy. Handrails are continuous safety barriers.
  for(let i=1;i<=11;i++){
    const front=.44-i*going,back=i===11?-1.5:front-going-.03,top=i*.2;
    result.push(box('stair tread',[0,top/2,(front+back)/2],[.628,top,front-back],true));
    for(const side of [-1,1])result.push(box('stair rail',[side*.355,top+.43,(front+back)/2],[.042,.9,front-back]));
  }
  return result;
}
/** Conservative bounds across R7's three LODs, including the tile overhang.
 * This roof has never been a walking surface. All of these proxies remain
 * non-supporting, including the thin eave used to clip the camera. */
export const SLOPE_BOUNDS={halfWidth:.5,back:-.5,front:.79,bottom:-.16,top:.79};
function slopeRoof():PartBox[]{
  const shapes=[box('pitched roof ceiling',[0,-.095,0],[1,.13,1])];
  for(let i=0;i<8;i++){
    const back=-.5+i/8,front=back+1/8,top=.7*(.5-back);
    shapes.push(box('pitched roof gable',[0,(top-.03)/2,(back+front)/2],[1,top+.03,1/8]));
  }
  const pitch=Math.atan(.7),run=1.26;
  shapes.push({...box('pitched roof tiles',[0,.7-.7*run/2+.055,-.5+run/2],[1,.08,run/Math.cos(pitch)]),pitch});
  shapes.push(box('pitched roof ridge',[0,.755,-.46],[1,.06,.08]));
  return shapes;
}
// R8 source suggestions are translated once into host collision contracts.
// The manifest lists two alternative ramp supports; only the pitched one ships.
function suggested(id:PartId):PartBox[]{
 const shapes=PART_INFO[id].colliders??[];
 return shapes.filter((s,i)=>id!=='ramp.entry'||i===0||!s.support).map(s=>({...box(id,s.center,s.size,s.support),pitch:s.pitch}));
}
function cornerRoof(hip:boolean):PartBox[]{
 const shapes:PartBox[]=[],start=-.5,end=hip?.79:.5,n=8,step=(end-start)/n;
 for(let x=0;x<n;x++)for(let z=0;z<n;z++){
  const x0=start+x*step,z0=start+z*step;
  // Conservative tile/ridge envelope at each strip's highest corner. The
  // volume closes the roof and clips cameras but never grants foot support.
  const top=Math.min(.8,.7*(.5-(hip?Math.max(x0,z0):Math.min(x0,z0)))+.10),bottom=-.16;
  shapes.push(box('corner roof', [x0+step/2,(top+bottom)/2,z0+step/2],[step,top-bottom,step]));
 }
 return shapes;
}
function verge(side:number):PartBox[]{
 return Array.from({length:8},(_,i)=>{const z=-.5+i*1.31/8,top=Math.min(.84,.7*(.5-z)+.14),bottom=-.2;
  return box('roof verge',[side*.54,(top+bottom)/2,z+1.31/16],[.08,top-bottom,1.31/8]);});
}
const added=Object.fromEntries(PART_IDS.slice(21).map(id=>[id,()=>suggested(id)])) as Record<PartId,()=>PartBox[]>;
added['roof.slope.hip']=()=>cornerRoof(true);added['roof.slope.valley']=()=>cornerRoof(false);
added['roof.verge.left']=()=>verge(-1);added['roof.verge.right']=()=>verge(1);
// The brackets are lower than the central 1.84 m beam. Match their small
// side volumes; lamps/signs also block jumping heads and camera booms.
added['structure.beam']=()=>[...suggested('structure.beam'),...[-1,1].map(side=>box('beam bracket',[side*.325,1.815,0],[.15,.39,.15]))];
for(const id of ['light.wall','sign.blank','sign.mail','sign.cup'] as const)added[id]=()=>[box(id,id==='light.wall'?[0,1.832,-.225]:[0,1.8375,-.295],id==='light.wall'?[.24,.424,.27]:[.12,.405,.41])];
export const PART_COLLIDERS:Record<PartId,()=>PartBox[]>={
 ...added,
  'floor.deck':slab,'floor.grate':slab,'roof.deck':slab,
  'wall.solid':wall,'wall.window':wall,'wall.louvre':wall,'wall.corrugated':wall,
  'wall.door':()=>door(false),'wall.door.open':()=>door(true),
  'structure.column':()=>[box('column',[0,1.02,0],[.22,2.04,.22]),box('column base',[0,.035,0],[.30,.07,.30])],
  'stair.straight':stairs,
  'rail.guard':()=>[box('guard',[0,.54,-.06],[1,1.08,.06])],
  'roof.parapet':()=>[box('parapet',[0,.30,0],[1,.60,.22])],
  'roof.slope':slopeRoof,
  'roof.plant':()=>[box('plant',[0,.33,0],[.8,.66,.8])],
  'street.paving':slab,'street.road':slab,'pad.quarter':slab,
  'street.kerb':()=>[box('kerb',[0,.065,0],[1,.13,.18],true)],
  'street.pipes':()=>[box('low hedge',[0,.24,.16],[1,.48,.34])],
  // Blueprint lantern only. The harbour lamps and local 2.23 m prop have
  // their own geometry and do not instantiate this part collider.
  'service.light':()=>[box('light column',[-.3,1.71,-.3],[.15,3.42,.15]),box('light arm',[-.3,3.39,.04],[.05,.06,.72]),box('light head',[-.3,3.31,.36],[.2,.2,.2])],
};
