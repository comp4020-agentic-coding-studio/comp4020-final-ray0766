import * as T from 'three';
import { fieldOf,gradedField } from '../shared/terrain.ts';
import type { PlanetView } from '../shared/planets.ts';
import { RADIUS } from '../shared/world.ts';
// A bijective stereographic rescaling concentrates existing hub coordinates into a
// shallow district on a larger display sphere. Persistent positions never change.
export const HARBOUR_RADIUS=800;
export const HARBOUR_COMPRESSION=.048;
let harbour=true;let field=fieldOf();
export const groundField=()=>field;
export function useTerrain(planet:Pick<PlanetView,'environment'|'objects'|'blueprints'>){const raw=fieldOf(planet.environment);field=planet.environment?gradedField(raw,planet.objects,planet.blueprints):raw;}
export function setGroundWorld(publicHub:boolean,environment?:string|null){harbour=publicHub;field=fieldOf(environment);}
export function groundRadius(){return harbour?HARBOUR_RADIUS:RADIUS;}
export function mapNormal(p:T.Vector3,k:number){
  const d=1+p.y+k*k*(1-p.y);
  return new T.Vector3(2*k*p.x/d,(1+p.y-k*k*(1-p.y))/d,2*k*p.z/d).normalize();
}
export function surfaceNormal(p:T.Vector3){return harbour?mapNormal(p,HARBOUR_COMPRESSION):p.clone();}
export function logicalNormal(p:T.Vector3){return harbour?mapNormal(p,1/HARBOUR_COMPRESSION):p.clone();}
export function surfaceScale(p:T.Vector3){return harbour?HARBOUR_RADIUS/RADIUS*2*HARBOUR_COMPRESSION/(1+p.y+HARBOUR_COMPRESSION**2*(1-p.y)):1;}
export function surfaceTangent(p:T.Vector3,tangent:T.Vector3){
  if(!harbour)return tangent.clone().projectOnPlane(p).normalize();
  const e=.0001;
  return surfaceNormal(p.clone().addScaledVector(tangent,e).normalize()).sub(surfaceNormal(p.clone().addScaledVector(tangent,-e).normalize())).normalize();
}
export function surfaceOrientation(p:T.Vector3,facing:T.Vector3){
  const up=surfaceNormal(p),front=surfaceTangent(p,facing),right=new T.Vector3().crossVectors(up,front).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,front));
}
export function surfaceHeight(p:T.Vector3) {
  if(harbour)return 0;
  return field.heightAt(p.toArray() as [number,number,number]);
}
export function surfacePoint(p:T.Vector3,offset=0){return surfaceNormal(p).multiplyScalar(groundRadius()+surfaceHeight(p)+offset);}
