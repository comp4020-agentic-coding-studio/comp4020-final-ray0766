import {Vector3,Quaternion} from 'three';
import type {Vec3} from './world.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_RADIUS} from './world-size.ts';
import type {PartId} from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
export interface CabinPart {part:PartId|'service.pipe';position:Vec3;yaw?:number}
export const HABITAT_CABIN:readonly CabinPart[]=[
  {part:'floor.deck',position:[-.5,.10,0]},{part:'floor.deck',position:[.5,.10,0]},
  {part:'wall.door',position:[-.5,.10,.5]},{part:'wall.window',position:[.5,.10,.5]},
  {part:'wall.solid',position:[-.5,.10,-.5],yaw:Math.PI},{part:'wall.louvre',position:[.5,.10,-.5],yaw:Math.PI},
  {part:'wall.window',position:[1,.10,0],yaw:Math.PI/2},{part:'wall.solid',position:[-1,.10,0],yaw:-Math.PI/2},
  {part:'roof.deck',position:[-.5,2.3,0]},{part:'roof.deck',position:[.5,2.3,0]},
  {part:'service.pipe',position:[.88,.12,-.64]},
];


export const villagePoint=(x:number,z:number):Vec3=>{const d=Math.hypot(x,z),a=d/HUB_RADIUS,k=d?Math.sin(a)/d:0;return [x*k,Math.cos(a),z*k];};
export function facePoint(point:Vec3,toward:Vec3){const up=new Vector3(...point),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),up);const front=new Vector3(...toward).projectOnPlane(up).normalize().applyQuaternion(q.invert());return Math.round(Math.atan2(front.x,front.z)/(Math.PI/12))*Math.PI/12;}
export function localPoint(point:Vec3,yaw:number,x:number,z:number):Vec3{const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...point)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw));return new Vector3(x,0,z).applyQuaternion(q).addScaledVector(new Vector3(...point),HUB_RADIUS).normalize().toArray() as Vec3;}
const dockUp=new Vector3(...HUB_DOCK),away=new Vector3(0,0,-1).projectOnPlane(dockUp).normalize();
export const HUB_SHIP=dockUp.clone().addScaledVector(away,5/HUB_RADIUS).normalize().toArray() as Vec3;
