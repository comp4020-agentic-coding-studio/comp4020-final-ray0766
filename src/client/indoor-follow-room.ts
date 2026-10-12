import { Box3, Ray, Vector3 } from 'three';
import type { GroundWorld } from '../shared/physics/world.ts';

type Body = GroundWorld['bodies'][number];
type Floor = Body['colliders'][number];
export interface FollowRoom { id: string; constrainEye: (eye: Vector3) => Vector3 }

// Camera-only reuse of the existing structural floor/ceiling OBBs. No physics writes.
function ceilingAbove(body: Body, point: Vector3, up: Vector3) {
  for (const c of body.colliders) {
    if (!(c.tag.includes('roof') || c.tag === 'floor' || c.tag.includes('ceiling'))) continue;
    const origin=point.clone().sub(c.center).applyQuaternion(c.inverse);
    const direction=up.clone().applyQuaternion(c.inverse);
    const hit=new Ray(origin,direction).intersectBox(new Box3(c.half.clone().negate(),c.half),new Vector3());
    if (hit) { const height=hit.clone().sub(origin).dot(direction); if(height>1.75&&height<4.2)return true; }
  }
  return false;
}
function coveredFloors(body: Body, feet: Vector3, up: Vector3) {
  return body.colliders.filter(c=>c.tag==='floor'&&Math.abs(c.center.clone().sub(feet).dot(up)+c.half.y)<.3
    &&ceilingAbove(body,c.center.clone().addScaledVector(up,c.half.y+.02),up));
}
function onFloor(floor: Floor, feet: Vector3, margin: number) {
  const local=feet.clone().sub(floor.center).applyQuaternion(floor.inverse);
  return Math.abs(local.x)<=floor.half.x+margin&&Math.abs(local.z)<=floor.half.z+margin;
}
function room(body: Body, floors: Floor[]): FollowRoom {
  return {id:body.objectId,constrainEye(eye) {
    let nearest=eye.clone(),distance=Infinity;
    for(const floor of floors) {
      const local=eye.clone().sub(floor.center).applyQuaternion(floor.inverse);
      local.x=Math.max(-floor.half.x+.10,Math.min(floor.half.x-.10,local.x));
      local.z=Math.max(-floor.half.z+.10,Math.min(floor.half.z-.10,local.z));
      const candidate=local.applyQuaternion(floor.q).add(floor.center),d=candidate.distanceToSquared(eye);
      if(d<distance){nearest=candidate;distance=d;}
    }
    return nearest;
  }};
}

/** Entry confirmation and a wider exit boundary prevent doorway chatter. */
export class IndoorFollowRooms {
  private world?: GroundWorld;
  private active: FollowRoom|null=null;
  private pendingId: string|null=null;
  private pendingSeconds=0;
  private outsideSeconds=0;
  update(world: GroundWorld|null, feet: Vector3, up: Vector3, dt: number): FollowRoom|null {
    if(world!==this.world){this.world=world??undefined;this.active=null;this.pendingId=null;this.pendingSeconds=0;this.outsideSeconds=0;}
    if(!world)return null;
    let candidate: FollowRoom|null=null;
    for(const body of world.bodies) {
      if(body.dir.angleTo(feet.clone().normalize())*world.baseRadius>body.broad+1)continue;
      const floors=coveredFloors(body,feet,up);
      const margin=this.active?.id===body.objectId ? .12:-.06;
      if(floors.some(floor=>onFloor(floor,feet,margin))&&ceilingAbove(body,feet,up)){candidate=room(body,floors);break;}
    }
    const elapsed=Math.min(.05,Math.max(0,dt));
    if(candidate?.id===this.active?.id&&candidate){this.active=candidate;this.outsideSeconds=0;return this.active;}
    if(this.active){this.outsideSeconds+=elapsed;if(this.outsideSeconds<.25)return this.active;this.active=null;}
    if(!candidate){this.pendingId=null;this.pendingSeconds=0;return null;}
    if(this.pendingId!==candidate.id){this.pendingId=candidate.id;this.pendingSeconds=0;}
    this.pendingSeconds+=elapsed;
    if(this.pendingSeconds>=.12){this.active=candidate;this.outsideSeconds=0;}
    return this.active;
  }
}
