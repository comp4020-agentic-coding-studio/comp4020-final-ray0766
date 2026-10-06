// Level-of-detail tiers and the budgets every module is tested against.
// Budgets are ceilings for one item at that tier, counted in triangles and
// draw calls after per-material merging.

export type LodTier = 'high' | 'medium' | 'low';
export const LOD_TIERS: LodTier[] = ['high', 'medium', 'low'];

export interface LodSettings {
  /** Procedural texture edge length in pixels. */
  textureSize: number;
  /** Rounded-box segments on chamfered edges; 0 = hard box. */
  bevelSegments: number;
  /** Radial segments for bolts, pipes and nozzles. */
  radialSegments: number;
  /** Small hardware (bolts, rivets, cable clips). */
  hardware: boolean;
  shadows: boolean;
  bloom: boolean;
  pixelRatioCap: number;
  /** Icosphere subdivisions for terrain. */
  terrainSubdivisions: number;
  vegetationMax: number;
}

export const LOD: Record<LodTier, LodSettings> = {
  high: { textureSize: 512, bevelSegments: 3, radialSegments: 20, hardware: true, shadows: true, bloom: true, pixelRatioCap: 2, terrainSubdivisions: 6, vegetationMax: 900 },
  medium: { textureSize: 256, bevelSegments: 2, radialSegments: 12, hardware: true, shadows: true, bloom: false, pixelRatioCap: 1.5, terrainSubdivisions: 5, vegetationMax: 500 },
  low: { textureSize: 128, bevelSegments: 0, radialSegments: 8, hardware: false, shadows: false, bloom: false, pixelRatioCap: 1, terrainSubdivisions: 4, vegetationMax: 180 },
};

export interface Budget { triangles: number; drawCalls: number }
export const BUDGET: Record<'part' | 'building' | 'ship' | 'terrain' | 'scene', Record<LodTier, Budget>> = {
  /**
   * One blueprint module (wall, door, stair…). Its draw calls equal its distinct
   * materials (10 max); placed buildings merge per material across all parts,
   * so the building budget is what bounds real draw calls. Revised from 6 after
   * the first measurement: the door module needs 9 materials (glass, hazard, glow…).
   */
  part: { high: { triangles: 4_000, drawCalls: 10 }, medium: { triangles: 1_800, drawCalls: 10 }, low: { triangles: 500, drawCalls: 10 } },
  /**
   * A merged, placed blueprint of up to 120 parts: one draw call per kit
   * material. Raised from 14 to 17 when the street surfaces (pavers, asphalt,
   * marking) joined the kit; low LOD folds them into existing materials.
   */
  building: { high: { triangles: 150_000, drawCalls: 17 }, medium: { triangles: 70_000, drawCalls: 17 }, low: { triangles: 20_000, drawCalls: 10 } },
  /** One assembled ship including engine effects. */
  ship: { high: { triangles: 45_000, drawCalls: 16 }, medium: { triangles: 18_000, drawCalls: 14 }, low: { triangles: 5_000, drawCalls: 10 } },
  /** Planet ground + water + all vegetation instances. */
  terrain: { high: { triangles: 220_000, drawCalls: 12 }, medium: { triangles: 90_000, drawCalls: 10 }, low: { triangles: 30_000, drawCalls: 8 } },
  /** Whole demo scene. */
  scene: { high: { triangles: 600_000, drawCalls: 400 }, medium: { triangles: 250_000, drawCalls: 250 }, low: { triangles: 80_000, drawCalls: 120 } },
};

/** Pick a starting tier from the device; the demos let people override it. */
export function suggestLod(env: { deviceMemory?: number; hardwareConcurrency?: number; coarsePointer?: boolean; width?: number }): LodTier {
  if ((env.deviceMemory ?? 8) <= 2 || (env.hardwareConcurrency ?? 8) <= 2) return 'low';
  if (env.coarsePointer || (env.width ?? 1920) < 700) return 'medium';
  return 'high';
}
