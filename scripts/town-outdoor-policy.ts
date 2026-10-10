import type {GroundPose,GroundWorld} from '../src/shared/physics/world.ts';

/** Explicit permission for an actual supporting part in one frozen draft.
 * The index is the collider index in GroundWorld, not a guessed door/part ID.
 * An open public porch may be permitted without permitting its whole house. */
export interface TownPublicSupportPermission {objectId:string;colliderIndices:number[];tag:string;reason:string}
export interface TownOutdoorPolicy {publicSupports:TownPublicSupportPermission[]}
export interface TownSupportEvidence {objectId:string|null;tag:string;radius:number;colliderIndices:number[]}
export function townSupportEvidence(world:GroundWorld,pose:GroundPose):TownSupportEvidence{
 const support=world.support(pose.position,pose.radius+.025),colliderIndices:number[]=[];
 if(support.objectId){
  const body=world.bodies.find(b=>b.objectId===support.objectId);
  if(body)for(const [index,collider]of body.colliders.entries()){
   if(!collider.support||collider.tag!==support.tag)continue;
   // Ask the same support() implementation about one unchanged collider.
   // This is a read-only world view, not alternate movement physics.
   const isolated=Object.create(world) as GroundWorld;
   Object.defineProperty(isolated,'bodies',{value:[{...body,colliders:[collider]}]});
   const candidate=isolated.support(pose.position,pose.radius+.025);
   if(candidate.objectId===support.objectId&&Math.abs(candidate.radius-support.radius)<1e-6)colliderIndices.push(index);
  }
 }
 return {...support,colliderIndices};
}
export function townSupportPermitted(support:TownSupportEvidence,policy:TownOutdoorPolicy){
 if(support.objectId===null)return true;
 // Ambiguous overlapping support is only permitted if every possible
 // supporting part is explicitly public. Unknown support remains unknown.
 return support.colliderIndices.length>0&&support.colliderIndices.every(index=>policy.publicSupports.some(p=>p.objectId===support.objectId&&p.tag===support.tag&&p.colliderIndices.includes(index)));
}
export function validateTownOutdoorPolicy(world:GroundWorld,policy:TownOutdoorPolicy){
 if(!Array.isArray(policy.publicSupports))throw Error('Outdoor authoring needs an explicit public support list.');
 for(const permission of policy.publicSupports){
  const body=world.bodies.find(b=>b.objectId===permission.objectId);
  if(!body||!permission.reason||!permission.tag||!permission.colliderIndices?.length||permission.colliderIndices.some(i=>!Number.isInteger(i)||!body.colliders[i]?.support||body.colliders[i].tag!==permission.tag))throw Error('Invalid or stale public support permission: '+permission.objectId);
 }
}
