import type { PartId } from '../../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { Vec3 } from '../world.ts';

/** Physics contract for the db79d73 kit: metres, +Y up, +Z exterior.
 * Deliberately authored collision proxies, never extracted from rendering meshes.
 * Cosmetic fixings/glass subdivisions do not affect movement. */
export interface PartBox { center: Vec3; half: Vec3; yaw?: number; support?: boolean; tag: string }
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
export const PART_COLLIDERS:Record<PartId,()=>PartBox[]>={
  'floor.deck':slab,'floor.grate':slab,'roof.deck':slab,
  'wall.solid':wall,'wall.window':wall,'wall.louvre':wall,'wall.corrugated':wall,
  'wall.door':()=>door(false),'wall.door.open':()=>door(true),
  'structure.column':()=>[box('column',[0,1.02,0],[.22,2.04,.22]),box('column base',[0,.035,0],[.30,.07,.30])],
  'stair.straight':stairs,
  'rail.guard':()=>[box('guard',[0,.54,-.06],[1,1.08,.06])],
  'roof.parapet':()=>[box('parapet',[0,.30,0],[1,.60,.22])],
  'roof.slope':()=>[box('sloping roof envelope',[0,.23,0],[1,.62,1.15])],
  'roof.plant':()=>[box('plant',[0,.33,0],[.8,.66,.8])],
  'street.paving':slab,'street.road':slab,'pad.quarter':slab,
  'street.kerb':()=>[box('kerb',[0,.065,0],[1,.13,.18],true)],
  'street.pipes':()=>[box('pipe rack',[0,.60,0],[1,1.2,.36])],
  'service.light':()=>[box('light column',[0,1.7,0],[.13,3.4,.13]),box('light head',[0,3.3,.35],[.4,.2,.8])],
};
