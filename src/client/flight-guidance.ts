import { spaceDistance } from '../shared/flight.ts';
import type { SpaceBody } from '../shared/flight.ts';
import type { Vec3 } from '../shared/world.ts';
import { landingRadius, safeRadius } from '../shared/world-size.ts';

/** A stopped ship near another world's collision shell needs a way around it. */
export function needsFlightDetour(position:Vec3,speed:number,closest:SpaceBody,target:SpaceBody):boolean {
  return closest.id!==target.id && speed<.2 &&
    spaceDistance(position,closest.center)<=safeRadius(closest)+2 &&
    spaceDistance(position,target.center)>landingRadius(target);
}
