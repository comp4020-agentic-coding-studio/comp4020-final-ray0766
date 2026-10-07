import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from 'three';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { libraryMaterials } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { floraModel, instanceFlora, planFlora } from '../assets/claude-geometry/terrain/flora.ts';
import type { Clearing } from '../assets/claude-geometry/terrain/flora.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import type { TerrainKit } from '../assets/claude-geometry/terrain/kit.ts';
import { LOD } from '../assets/claude-geometry/style/lod.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import type { HomeSurfaceRoute } from '../shared/home-layout.ts';
import type { Vec3 } from '../shared/world.ts';
import { worldMaterials } from './shared-assets.ts';

export const ROUTE_SURFACE_OFFSET = .025;
const ROUTE_SEGMENT_LENGTH = .22;

/** Thin paving follows the same graded field as the ground and its physics.
 * This contains no collider or support surface. The common stone material is
 * also used by street.paving, so the route reads as part of the same kit. */
export function surfaceRouteGeometry(routes: readonly HomeSurfaceRoute[], field: HeightField) {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const indices: number[] = [];
  const write = (centre: Vector3, side: Vector3, offset: number, along: number) => {
    const radius = 10 + field.heightAt(centre.toArray() as Vec3);
    const dir = centre.clone().multiplyScalar(radius).addScaledVector(side, offset).normalize();
    const d = dir.toArray() as Vec3;
    positions.push(...dir.multiplyScalar(10 + field.heightAt(d) + ROUTE_SURFACE_OFFSET).toArray());
    normals.push(...field.normalAt(d));
    uv.push(offset, along);
  };
  for (const route of routes) {
    let along = 0;
    for (let leg = 1; leg < route.points.length; leg++) {
      const a = new Vector3(...route.points[leg - 1]), b = new Vector3(...route.points[leg]);
      const length = a.angleTo(b) * (10 + field.heightAt(a.toArray() as Vec3));
      if (length < .0001) continue;
      const steps = Math.max(1, Math.ceil(length / ROUTE_SEGMENT_LENGTH));
      const forward = b.clone().sub(a);
      for (let i = 0; i < steps; i++) {
        const start = a.clone().lerp(b, i / steps).normalize();
        const end = a.clone().lerp(b, (i + 1) / steps).normalize();
        const startSide = start.clone().cross(forward).normalize(), endSide = end.clone().cross(forward).normalize();
        const n = positions.length / 3;
        write(start, startSide, -route.width / 2, along + length * i / steps);
        write(start, startSide, route.width / 2, along + length * i / steps);
        write(end, endSide, route.width / 2, along + length * (i + 1) / steps);
        write(end, endSide, -route.width / 2, along + length * (i + 1) / steps);
        indices.push(n, n + 2, n + 1, n, n + 3, n + 2);
      }
      along += length;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function sampleLandscape(routes: readonly HomeSurfaceRoute[], field: HeightField) {
  const mesh = new Mesh(surfaceRouteGeometry(routes, field), libraryMaterials(worldMaterials()).get('pavers'));
  mesh.name = 'sample:surface-routes';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData = { decorativeTerrain: true, collision: false, support: false, routes: routes.map(route => route.id) };
  return mesh;
}

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
