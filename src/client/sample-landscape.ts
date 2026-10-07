import { BufferGeometry, Float32BufferAttribute, Mesh, Raycaster, Vector3 } from 'three';
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

/** Overlapping clearing discs keep generated flora away from the saved paths.
 * They affect appearance only; the terrain remains the walking surface. */
export function routeClearings(routes: readonly HomeSurfaceRoute[], radius: number): Clearing[] {
  const clearings: Clearing[] = [];
  for(const route of routes) for(let leg=1;leg<route.points.length;leg++){
    const start=new Vector3(...route.points[leg-1]),end=new Vector3(...route.points[leg]);
    const steps=Math.max(1,Math.ceil(start.angleTo(end)*(radius+2)/.4));
    for(let i=0;i<=steps;i++)clearings.push({dir:start.clone().lerp(end,i/steps).normalize().toArray() as Vec3,radius:route.width/2+.3});
  }
  return clearings;
}

/** Thin paving follows the same graded field as the ground and its physics.
 * This contains no collider or support surface. The common stone material is
 * also used by street.paving, so the route reads as part of the same kit. */
export function surfaceRouteGeometry(routes: readonly HomeSurfaceRoute[], field: HeightField, renderedGround?: Mesh) {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const indices: number[] = [];
  const ray=new Raycaster(),projected=new Map<string,number>();
  renderedGround?.updateWorldMatrix(true,false);
  // The generated mesh interpolates across its finite terrain triangles. A
  // road sampled only from the mathematical field can disappear under those
  // faces near slopes and graded foundations. Project this decoration onto
  // the actual displayed ground; the authoritative walking field is unchanged.
  const visibleRadius=(dir:Vector3)=>{
    const d=dir.toArray() as Vec3,fieldRadius=10+field.heightAt(d);
    if(!renderedGround)return fieldRadius;
    const key=d.map(n=>n.toFixed(7)).join(','),saved=projected.get(key);if(saved!==undefined)return saved;
    ray.set(dir.clone().multiplyScalar(fieldRadius+4),dir.clone().negate());ray.far=8;
    const hit=ray.intersectObject(renderedGround,false)[0],radius=hit?hit.point.length():fieldRadius;
    projected.set(key,radius);return radius;
  };
  const write = (centre: Vector3, side: Vector3, offset: number, along: number) => {
    const radius = 10 + field.heightAt(centre.toArray() as Vec3);
    const dir = centre.clone().multiplyScalar(radius).addScaledVector(side, offset).normalize();
    const d = dir.toArray() as Vec3;
    positions.push(...dir.multiplyScalar(visibleRadius(dir) + ROUTE_SURFACE_OFFSET).toArray());
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
      // Subdivide across the road as well. Two edge samples alone bridge over
      // the centre of a transverse rise, letting terrain pierce the paving.
      // An even count retains a sample on the route's centre bearing.
      const across=Math.max(2,Math.ceil(route.width/ROUTE_SEGMENT_LENGTH/2)*2),stride=across+1,base=positions.length/3;
      for(let i=0;i<=steps;i++){
        const centre=a.clone().lerp(b,i/steps).normalize(),side=centre.clone().cross(forward).normalize();
        for(let j=0;j<=across;j++)write(centre,side,(j/across-.5)*route.width,along+length*i/steps);
      }
      for(let i=0;i<steps;i++)for(let j=0;j<across;j++){
        const n=base+i*stride+j;indices.push(n,n+stride+1,n+1,n,n+stride,n+stride+1);
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

export function sampleLandscape(routes: readonly HomeSurfaceRoute[], field: HeightField, renderedGround?: Mesh) {
  const source=libraryMaterials(worldMaterials()).get('pavers'),material=source.clone();
  // Kit faces use positive depth bias so their ink edges win. A thin ground
  // decoration has no ink; that bias can push it behind the terrain at grazing
  // angles. Keep its palette/cel hooks and shared textures, but own this one
  // unbiased material so disposing a planet never disposes the kit palette.
  material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
  material.polygonOffset=false;material.polygonOffsetFactor=0;material.polygonOffsetUnits=0;
  material.userData={...source.userData,ownedResource:true};delete material.userData.sharedResource;
  const mesh = new Mesh(surfaceRouteGeometry(routes, field, renderedGround), material);
  mesh.name = 'sample:surface-routes';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData = { decorativeTerrain: true, collision: false, support: false, routeProjection:renderedGround?'rendered-ground':'height-field', routes: routes.map(route => route.id) };
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
