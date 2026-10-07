import { floraModel, instanceFlora, planFlora } from '../assets/claude-geometry/terrain/flora.ts';
import type { Clearing } from '../assets/claude-geometry/terrain/flora.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import type { TerrainKit } from '../assets/claude-geometry/terrain/kit.ts';
import { LOD } from '../assets/claude-geometry/style/lod.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';

/** The library's plant ceiling is relative to its original 10-unit globe.
 * Plan with relative altitude and water, retaining this globe's true normal
 * and slope. Then restore radial placement; neither plants nor relief scale. */
export function rebasedTerrainFlora(field: TerrainField, radius: number, kit: TerrainKit, lod: LodTier, clearings: readonly Clearing[], triangleBudget: number) {
  const offset = radius - 10;
  const relative: TerrainField = {
    ...field,
    waterLevel: field.waterLevel === null ? null : field.waterLevel - offset,
    sample: dir => { const sample = field.sample(dir); return { ...sample, height: sample.height - offset }; },
  };
  const triangles: Record<string, number> = {};
  for (const rule of field.program.flora) triangles[rule.kind] = floraModel(rule.kind, kit).triangles;
  const plans = planFlora(relative, field.program.flora, { vegetationMax: LOD[lod].vegetationMax, triangleBudget, triangles });
  for (const plan of plans) {
    // Use this planet's actual arc radius. The stock planner's clearing test
    // is tied to 10 and would enlarge every object clearing with the globe.
    plan.instances = plan.instances.filter(instance => !clearings.some(c => {
      const reach = c.radius + instance.height * .5;
      const chordSquared = instance.dir.reduce((sum, value, i) => sum + (value - c.dir[i]) ** 2, 0);
      return chordSquared < 2 - 2 * Math.cos(reach / radius);
    }));
    for (const instance of plan.instances) instance.base += offset;
  }
  return { object: instanceFlora(plans, kit, LOD[lod].shadows), vegetation: Object.fromEntries(plans.map(plan => [plan.kind, plan.instances.length])) };
}
