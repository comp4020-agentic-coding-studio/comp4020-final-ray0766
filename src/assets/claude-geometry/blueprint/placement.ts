import { anchorQuaternion, localToPlanet } from '../core/anchor.ts';
import type { SurfaceAnchor } from '../core/anchor.ts';
import { fitGround, MAX_FOUNDATION_DEPTH } from '../core/ground.ts';
import type { Footprint, GroundFit, HeightField } from '../core/ground.ts';
import { propFootprint } from '../core/placement.ts';
import type { FootprintResolver, PlacementRules } from '../core/placement.ts';
import type { Quat, Vec3 } from '../core/vec.ts';
import type { ObjectSpec } from '../core/world.ts';
import { blueprintHash } from './codec.ts';
import { blueprintCovers, blueprintFootprint, blueprintGroundFootprint } from './model.ts';
import type { Blueprint, PartPlacement } from './model.ts';

// Blueprints on a planet. Structures are referenced by content hash, so the
// placement rules ask this registry for the footprint behind each hash, as the
// server would ask its blueprint store.

export class StructureRegistry {
  private byHash = new Map<string, Blueprint>();
  private footprints = new Map<string, Footprint>();
  private ground = new Map<string, { footprint: Footprint; covers: (x: number, z: number) => boolean }>();

  /**
   * Register (or re-register) a blueprint under its hash. Blueprints with the same
   * parts share a hash and a footprint; the latest one registered names it, so a
   * rename shows on structures already placed.
   */
  async register(bp: Blueprint): Promise<string> {
    const hash = await blueprintHash(bp);
    if (!this.footprints.has(hash)) {
      this.footprints.set(hash, blueprintFootprint(bp.parts));
      this.ground.set(hash, { footprint: blueprintGroundFootprint(bp.parts), covers: blueprintCovers(bp.parts) });
    }
    this.byHash.set(hash, bp);
    return hash;
  }
  get(hash: string): Blueprint | undefined { return this.byHash.get(hash); }
  footprintOf(hash: string): Footprint | null { return this.footprints.get(hash) ?? null; }
  /** Dense ground samples (blueprintGroundFootprint) for seating on real terrain; same radius as footprintOf. */
  groundFootprintOf(hash: string): Footprint | null { return this.ground.get(hash)?.footprint ?? null; }
  /** Pivot-relative test for "over a footprint cell", for grading terrain under the structure. */
  coversOf(hash: string): ((x: number, z: number) => boolean) | null { return this.ground.get(hash)?.covers ?? null; }

  /** Structures from this registry, props from the main project's radii. */
  readonly footprint: FootprintResolver = (spec: ObjectSpec) =>
    spec.kind === 'structure' ? this.footprintOf(spec.blueprintHash) : propFootprint(spec);
  /** As `footprint`, but structures resolve to their dense ground samples. */
  readonly groundFootprint: FootprintResolver = (spec: ObjectSpec) =>
    spec.kind === 'structure' ? this.groundFootprintOf(spec.blueprintHash) : propFootprint(spec);
}

export const structureRules = (registry: StructureRegistry, ground: HeightField): PlacementRules => ({ footprint: registry.footprint, ground });

/**
 * Placement rules for real terrain: the same spacing (radii are unchanged) but
 * every fit on the dense ground footprint, so a knoll between the sparse
 * corner-and-centre samples cannot rise through a floor (CONTRACTS §5).
 */
export const structureGroundRules = (registry: StructureRegistry, ground: HeightField): PlacementRules => ({ footprint: registry.groundFootprint, ground });

/** Where a placed structure's local origin sits, and how it is turned. */
export function placedTransform(anchor: SurfaceAnchor, fit: GroundFit): { position: Vec3; quaternion: Quat } {
  return { position: localToPlanet(anchor, fit.baseRadius, [0, 0, 0]), quaternion: anchorQuaternion(anchor) };
}

export const fitStructure = (field: HeightField, anchor: SurfaceAnchor, bp: Pick<Blueprint, 'parts'>) => fitGround(field, anchor, blueprintFootprint(bp.parts));
/** fitStructure on the dense ground footprint (blueprintGroundFootprint). */
export const fitStructureOnGround = (field: HeightField, anchor: SurfaceAnchor, bp: Pick<Blueprint, 'parts'>) => fitGround(field, anchor, blueprintGroundFootprint(bp.parts));

/** Yaw step for placing structures (15°). */
export const YAW_STEP = Math.PI / 12;

/** The planet with no relief and no sea: every point at PLANET_RADIUS. */
const SMOOTH_SPHERE: HeightField = { id: 'smooth-sphere', waterLevel: null, heightAt: () => 0, normalAt: dir => dir };
/** From this smooth-sphere foundation the workshop warns that a blueprint is near the 0.6 m limit (a threshold chosen here). */
export const NEAR_FOUNDATION_LIMIT = 0.45;

/**
 * The foundation a blueprint needs on a smooth 10 m sphere, seated as the
 * planet view seats it (dense ground footprint): the gap between its flat
 * floor and the curved ground under its farthest sample, from curvature alone
 * (a 5 × 5 footprint needs 0.607 m). Real ground adds to this where it slopes
 * or falls away under the footprint (a crest) and takes from it in a hollow,
 * so above MAX_FOUNDATION_DEPTH a blueprint stands only where the ground is
 * hollow enough, and near it the rest of the 0.6 m is all that is left for
 * slopes and crests. 0 for a blueprint with no cells.
 */
export function smoothSphereFoundation(parts: readonly PartPlacement[]): number {
  if (!parts.length) return 0;
  return fitGround(SMOOTH_SPHERE, { dir: [0, 1, 0], yaw: 0 }, blueprintGroundFootprint(parts)).foundationDepth;
}

/**
 * What the workshop says about a footprint whose curvature gap nearly uses up
 * (or passes) the 0.6 m foundation limit, or null. Over the limit it fits only
 * in hollows (a 5 × 5 slab fits 38 of 400 spots on the main project's terrain);
 * near it, slopes and crests can refuse it (a 5 × 4 slab fits 228 of 400;
 * `legacyFits` in docs/samples/blueprint-figures.json).
 */
export function curvatureWarning(parts: readonly PartPlacement[]): string | null {
  const depth = smoothSphereFoundation(parts);
  if (depth > MAX_FOUNDATION_DEPTH) return `On a smooth 10 m planet this footprint needs a ${depth.toFixed(2)} m foundation from curvature alone, over the ${MAX_FOUNDATION_DEPTH} m limit: it will fit only in hollows.`;
  if (depth >= NEAR_FOUNDATION_LIMIT) return `On a smooth 10 m planet this footprint already needs a ${depth.toFixed(2)} m foundation from curvature alone (limit ${MAX_FOUNDATION_DEPTH} m): it may be refused on slopes and crests.`;
  return null;
}
