import type { PlayerState } from '../shared/world.ts';
import type { Universe } from '../shared/planets.ts';

/** One door revision can refresh collision without dropping a held walk. */
export function isDoorOnlyRevision(current:PlayerState|undefined,next:PlayerState):boolean {
  return !!current?.home && !!next.home && !!current.ground && !!next.ground &&
    current.planetId===next.planetId && current.environment===next.environment && current.worldRadius===next.worldRadius &&
    current.flight.mode==='ground' && next.flight.mode==='ground' && current.location?.visitEpoch===next.location?.visitEpoch &&
    current.home.interiorId===next.home.interiorId && current.home.buildingVersion===next.home.buildingVersion &&
    next.home.interior.doorVersion===current.home.interior.doorVersion+1 &&
    next.ground.sceneRevision===current.ground.sceneRevision+1 && next.ground.physicsVersion===current.ground.physicsVersion;
}

/** Ground sequence, scene and physics version all fence stale responses. */
export function canAcceptPlayer(current:PlayerState|undefined,next:PlayerState):boolean {
  if(!current)return true;
  const epoch=current.location?.visitEpoch??0,nextEpoch=next.location?.visitEpoch??0;
  if(nextEpoch<epoch)return false;
  if(nextEpoch===epoch&&current.location?.kind==='interior'){
    if(next.location?.kind!=='interior'||next.location.interiorId!==current.location.interiorId||next.location.sequence<current.location.sequence)return false;
  }
  if(next.revision<current.revision||next.flight.journey<current.flight.journey)return false;
  // Room edits and shared door actions have independent optimistic versions.
  // Polls started before either action must not restore the previous contents.
  if(current.home&&next.home&&current.home.interiorId===next.home.interiorId){
    if(next.home.interior.version<current.home.interior.version||(next.home.interior.doorVersion??0)<(current.home.interior.doorVersion??0))return false;
  }
  const sameVisit=next.planetId===current.planetId&&next.flight.mode===current.flight.mode&&next.flight.journey===current.flight.journey;
  if(!sameVisit)return next.revision>current.revision;
  if(next.flight.sequence<current.flight.sequence)return false;
  if(current.ground&&nextEpoch===epoch&&next.location?.kind!=='interior'){
    if(!next.ground)return false;
    if(next.ground.physicsVersion<current.ground.physicsVersion||next.ground.sceneRevision<current.ground.sceneRevision||next.ground.sequence<current.ground.sequence)return false;
  }
  return true;
}

/** Reject stale scenes before applying their player pose or rendering anything. */
export function canAcceptUniverse(current:Universe|null,next:Universe):boolean {
  if(next.currentPlanet.id!==next.player.planetId)return false;
  if(next.player.ground&&next.player.ground.sceneRevision!==next.currentPlanet.revision)return false;
  if(current?.currentPlanet.id===next.currentPlanet.id&&next.currentPlanet.revision<current.currentPlanet.revision)return false;
  return canAcceptPlayer(current?.player,next.player);
}
