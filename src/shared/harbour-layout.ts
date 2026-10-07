import {Vector3,Quaternion} from 'three';
import {NPCS,normalize} from './world.ts';
import type {Vec3,NpcId} from './world.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_RADIUS} from './world-size.ts';
import type {PartId} from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
interface CabinPart {part:PartId|'service.pipe';position:Vec3;yaw?:number}
export const HABITAT_CABIN:readonly CabinPart[]=[
  {part:'floor.deck',position:[-.5,.10,0]},{part:'floor.deck',position:[.5,.10,0]},
  {part:'wall.door',position:[-.5,.10,.5]},{part:'wall.window',position:[.5,.10,.5]},
  {part:'wall.solid',position:[-.5,.10,-.5],yaw:Math.PI},{part:'wall.louvre',position:[.5,.10,-.5],yaw:Math.PI},
  {part:'wall.window',position:[1,.10,0],yaw:Math.PI/2},{part:'wall.solid',position:[-1,.10,0],yaw:-Math.PI/2},
  {part:'roof.deck',position:[-.5,2.3,0]},{part:'roof.deck',position:[.5,2.3,0]},
  {part:'service.pipe',position:[.88,.12,-.64]},
];

export const HUB_CABINS:{point:Vec3;yaw:number;npc?:NpcId}[]=(['mica','sol'] as const).map(id=>{
 const up=new Vector3(...NPCS[id].position),front=new Vector3(0,1,.12).projectOnPlane(up).normalize();
 const site=up.clone().addScaledVector(front,-2.15/HUB_RADIUS).normalize(),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),site);
 const localFront=front.clone().projectOnPlane(site).normalize().applyQuaternion(q.clone().invert());
 return {point:site.toArray() as Vec3,yaw:Math.atan2(localFront.x,localFront.z),npc:id};
});
HUB_CABINS.push({point:normalize([.38,1,.48]),yaw:-Math.PI/2},{point:normalize([-.38,1,.48]),yaw:Math.PI/2});
export const HUB_TREES=([[.6,1,.1],[-.6,1,.1],[.82,.5,-.7],[-.7,.48,-.8],[.45,.5,.93],[-.44,.42,.94],[.95,-.2,.34],[-.9,-.3,.2],[.12,-.8,.55]] as Vec3[]).map(normalize);
const dockUp=new Vector3(...HUB_DOCK),away=new Vector3(0,0,-1).projectOnPlane(dockUp).normalize();
export const HUB_SHIP=dockUp.clone().addScaledVector(away,5/HUB_RADIUS).normalize().toArray() as Vec3;
