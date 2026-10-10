import type { HomeDoorPartId } from '../shared/home-door.ts';
import type { DatabaseSync } from 'node:sqlite';
import { Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../shared/world.ts';
import type { HomeDescriptor } from '../shared/home.ts';
import type { GroundWorld } from '../shared/physics/world.ts';
import { homeDoorSweepContains } from '../shared/home-door.ts';

/** Includes disconnected people; a presence timeout never makes a body safe to
 * close a door onto. This read-only guard runs within the caller's write lock. */
export function occupiedExteriorDoor(db:DatabaseSync,planetId:string,frame:NonNullable<HomeDescriptor['door']['frame']>,world:()=>GroundWorld,partId:HomeDoorPartId='wall.door.open'):boolean {
  const inverse=new Quaternion().fromArray(frame.quaternion).invert();
  let collisionWorld:GroundWorld|undefined;
  for(const p of db.prepare('SELECT id,position,flight FROM players WHERE planet_id=?').all(planetId)){
    const loc=db.prepare('SELECT document FROM home_locations WHERE player_id=?').get(String(p.id));
    if(loc&&JSON.parse(String(loc.document)).kind==='interior')continue;
    if(JSON.parse(String(p.flight??'{"mode":"ground"}')).mode!=='ground')continue;
    const dir=JSON.parse(String(p.position)) as Vec3;
    const saved=db.prepare('SELECT position,radius FROM ground_states WHERE player_id=? AND planet_id=?').get(String(p.id),planetId);
    let radius:number;
    if(saved&&saved.position===p.position)radius=Number(saved.radius);
    else {collisionWorld??=world();const base=collisionWorld.radius(dir);radius=collisionWorld.support(dir,base+.26).radius;}
    const feet=new Vector3(...dir).multiplyScalar(radius).sub(new Vector3(...frame.position)).applyQuaternion(inverse).toArray() as Vec3;
    const up=new Vector3(...dir).applyQuaternion(inverse).toArray() as Vec3;
    if(homeDoorSweepContains(feet,up,partId))return true;
  }
  return false;
}
