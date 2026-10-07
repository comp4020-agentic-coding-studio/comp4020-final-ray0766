import * as T from 'three';
import { fieldOf,gradedField } from '../shared/terrain.ts';
import type { PlanetView } from '../shared/planets.ts';
import { HUB_RADIUS } from '../shared/world-size.ts';
import { RADIUS } from '../shared/world.ts';
// Keep durable unit directions. The compact harbour uses the identity map; the
// old reversible map helper remains for the archived city layout.
export const HARBOUR_RADIUS=HUB_RADIUS;
export const HARBOUR_COMPRESSION=1;
let harbour=true,baseRadius=HUB_RADIUS;let field=fieldOf();
export const groundField=()=>field;
export function useTerrain(planet:Pick<PlanetView,'environment'|'objects'|'blueprints'|'radius'>){const raw=fieldOf(planet.environment,planet.radius??RADIUS);field=planet.environment?gradedField(raw,planet.objects,planet.blueprints):raw;}
export function setGroundWorld(publicHub:boolean,environment?:string|null,radius=publicHub?HUB_RADIUS:RADIUS){harbour=publicHub;baseRadius=radius;field=fieldOf(environment,radius);}
export function groundRadius(){return baseRadius;}
export function mapNormal(p:T.Vector3,k:number){
  const d=1+p.y+k*k*(1-p.y);
  return new T.Vector3(2*k*p.x/d,(1+p.y-k*k*(1-p.y))/d,2*k*p.z/d).normalize();
}
export function surfaceNormal(p:T.Vector3){return harbour?mapNormal(p,HARBOUR_COMPRESSION):p.clone();}
export function logicalNormal(p:T.Vector3){return harbour?mapNormal(p,1/HARBOUR_COMPRESSION):p.clone();}
export function surfaceScale(p:T.Vector3){return harbour?baseRadius/RADIUS*2*HARBOUR_COMPRESSION/(1+p.y+HARBOUR_COMPRESSION**2*(1-p.y)):baseRadius/RADIUS;}
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
  return field.heightAt(p.toArray() as [number,number,number])-(baseRadius-RADIUS);
}
export function surfacePoint(p:T.Vector3,offset=0){return surfaceNormal(p).multiplyScalar(groundRadius()+surfaceHeight(p)+offset);}
