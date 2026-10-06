import { LANDING_CLEARANCE, PLANET_RADIUS, SPAWN_DIR } from './anchor.ts';
import type { SurfaceAnchor } from './anchor.ts';
import { circleFootprint, fitGround } from './ground.ts';
import type { Footprint, HeightField } from './ground.ts';
import type { ObjectId } from './ids.ts';
import { arcDistance } from './vec.ts';
import { PROP_RADIUS } from './world.ts';
import type { ObjectSpec, PlacementCheck, WorldState } from './world.ts';

/** Gap kept between neighbouring footprints, as in the main project (+ .06). */
export const PLACEMENT_MARGIN = 0.06;

/**
 * Where an object's footprint comes from. Props use the main project's radii;
 * structures ask the blueprint module (client) or the stored blueprint (server).
 * Returning null means the blueprint is unknown and the placement is refused.
 */
export type FootprintResolver = (spec: ObjectSpec) => Footprint | null;

export const propFootprint = (spec: ObjectSpec): Footprint | null =>
  spec.kind === 'prop' ? circleFootprint(PROP_RADIUS[spec.prop]) : null;

export interface PlacementRules {
  footprint: FootprintResolver;
  /** When present, every placement must also fit the ground (see ground.ts). */
  ground?: HeightField;
}

export function placementProblem(rules: PlacementRules, state: WorldState, objectId: ObjectId, spec: ObjectSpec, anchor: SurfaceAnchor): string | null {
  const own = rules.footprint(spec);
  if (!own) return 'This blueprint is not available on the server.';
  if (arcDistance(anchor.dir, SPAWN_DIR, PLANET_RADIUS) < own.radius + LANDING_CLEARANCE) return 'Leave space around the landing spot.';
  for (const other of Object.values(state.objects)) {
    if (other.id === objectId) continue;
    // Path stones may overlap one another to form routes, as in the main project.
    if (spec.kind === 'prop' && spec.prop === 'path' && other.spec.kind === 'prop' && other.spec.prop === 'path') continue;
    const theirs = rules.footprint(other.spec);
    if (!theirs) continue;
    if (arcDistance(anchor.dir, other.anchor.dir, PLANET_RADIUS) < own.radius + theirs.radius + PLACEMENT_MARGIN) return 'Too close to another object. Leave room between them.';
  }
  if (rules.ground) {
    const fit = fitGround(rules.ground, anchor, own);
    if (fit.problem) return fit.message;
  }
  return null;
}

export const placementCheck = (rules: PlacementRules): PlacementCheck =>
  (state, objectId, spec, anchor) => placementProblem(rules, state, objectId, spec, anchor);
