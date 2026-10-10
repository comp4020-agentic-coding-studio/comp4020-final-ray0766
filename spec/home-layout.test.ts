import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, HOME_VARIANTS, homeVariant, starterManifest } from '../src/shared/home-layout.ts';
import { layoutErrors, partTransform, pivotOf, placementProblem as partProblem } from '../src/shared/blueprint-model.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import type { BlueprintContents } from '../src/shared/blueprints.ts';
import { MAX_OBJECTS, placementProblem } from '../src/shared/planets.ts';
import type { PlacedObject } from '../src/shared/planets.ts';
import { fieldOf, objectSeat } from '../src/shared/terrain.ts';
import { planRoutePaths } from '../src/shared/path-layout.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { terrainModel } from '../src/client/terrain-model.ts';
import { BUDGET } from '../src/assets/claude-geometry/style/lod.ts';
import { anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { BODY_RADIUS, FIXED_STEP, GroundWorld, STEP_HEIGHT } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import type { HomeManifestSite } from '../src/shared/home-layout.ts';
import { distance, SPAWN } from '../src/shared/world.ts';

const radius = 21.6;
function scene() {
  const manifest = starterManifest(radius), blueprints: BlueprintContents = {};
  const structures: PlacedObject[] = [manifest.home, ...manifest.infrastructure].map((site, i) => {
    const hash = `sample-structure-${i}`;
    blueprints[hash] = site.blueprint.parts;
    return { id: hash, kind: 'structure', blueprintHash: hash, position: site.position, rotation: site.rotation, version: 1, ...structureSize(site.blueprint.parts) };
  });
  const objects: PlacedObject[] = [...structures, ...manifest.objects.map((object, i) => ({ ...object, id: `sample-prop-${i}`, assetVersion: 2 as const, version: 1 }))];
  return { manifest, blueprints, objects };
}

function siteFrame(site: HomeManifestSite) {
  const anchor = { dir: site.position, yaw: site.rotation };
  const base = structureFit(site.blueprint.parts, site.position, site.rotation, fieldOf(HOME_ENVIRONMENT, radius)).baseRadius;
  const inverse = new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
  return {
    base,
    at: (x: number, z: number, y = 0) => localToDir(anchor, base, [x, y, z]),
    local: (pose: Pick<GroundPose, 'position' | 'radius'>) => new Vector3(...pose.position).multiplyScalar(pose.radius)
      .addScaledVector(new Vector3(...site.position), -base).applyQuaternion(inverse),
  };
}

function walkingScene() {
  const fixture = scene(), frame = siteFrame(fixture.manifest.home);
  const world = new GroundWorld({ id: 'home-sample', revision: 1, radius, environment: HOME_ENVIRONMENT, objects: fixture.objects, blueprints: fixture.blueprints });
  // Same fixed-step, bounded 2.5-unit/s steering used by physics.test.ts.
  // Every accepted position comes from move(), with no teleport to a target.
  function walk(pose: GroundPose, x: number, z: number, seconds: number, onStep: (pose: GroundPose, before: GroundPose) => void) {
    for (let i = 0; i < seconds / FIXED_STEP; i++) {
      const here = frame.local(pose), target = frame.at(x, z, here.y);
      const a = new Vector3(...pose.position), b = new Vector3(...target), distance = a.angleTo(b) * pose.radius;
      const next = a.lerp(b, Math.min(1, 2.5 * FIXED_STEP / Math.max(.00001, distance))).normalize().toArray() as Vec3;
      const before = pose;
      pose = world.move(pose, next, FIXED_STEP);
      onStep(pose, before);
    }
    return pose;
  }
  return { ...fixture, ...frame, world, walk };
}

it('makes four distinct supported kit homes without moving or duplicating the durable entrance', () => {
  const documents = HOME_VARIANTS.map(homeVariant), first = documents[0];
  const entrance = first.parts.find(part => part.n === HOME_DOOR_PART)!;
  const doorTransform = partTransform(entrance, pivotOf(first.parts));
  for (const blueprint of documents) {
    expect(blueprint.parts.length).toBeLessThanOrEqual(120);
    expect(layoutErrors(blueprint.parts)).toEqual([]);
    // Each part can be selected/replaced under the same workshop validator.
    for (const part of blueprint.parts) expect(partProblem(blueprint.parts, part)).toBeNull();
    const doors = blueprint.parts.filter(part => part.part === 'wall.door.open');
    expect(doors).toEqual([entrance]);
    expect(partTransform(doors[0], pivotOf(blueprint.parts))).toEqual(doorTransform);
    expect(pivotOf(blueprint.parts)).toEqual({ x: 2.5, z: 2.5 });
  }
  expect(new Set(documents.map(blueprint => JSON.stringify(blueprint.parts))).size).toBe(4);
});

it('seats the bounded starter sample dry on one shared field with room for the same remodels', () => {
  const { manifest, objects, blueprints } = scene(), field = fieldOf(HOME_ENVIRONMENT, radius);
  expect(starterManifest(radius)).toEqual(manifest);
  // New geometry can reject a decorative candidate. Routes and usable sites
  // are the contract; an old persisted manifest is never regenerated here.
  expect(manifest.infrastructure).toHaveLength(2);
  expect(objects.filter(object=>object.kind==='structure')).toHaveLength(3);
  expect(objects.filter(object=>object.kind==='path').length).toBeGreaterThan(12);
  expect(objects.length).toBeLessThan(MAX_OBJECTS);
  for (const object of objects) {
    expect(placementProblem(object.kind, object.position, objects, object.id, object.radius, radius, 2,{rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints,field})).toBeNull();
    const fit = objectSeat(field, object, blueprints);
    expect(fit.problem, object.id).toBeNull();
    expect(fit.underwater, object.id).toBe(false);
  }
  for (const variant of HOME_VARIANTS) {
    const fit = structureFit(homeVariant(variant).parts, manifest.home.position, manifest.home.rotation, field);
    expect(fit.problem).toBeNull();
    expect(fit.underwater).toBe(false);
    expect(fit.foundationDepth).toBeLessThan(.6);
  }
  for (const site of manifest.infrastructure) {
    expect(layoutErrors(site.blueprint.parts)).toEqual([]);
    expect(site.blueprint.parts.some(part => part.part === 'wall.door.open')).toBe(false);
  }
});

it('retains historical navigation endpoints while planning only ordinary bounded Path objects', () => {
  const { manifest, objects, blueprints } = scene();
  expect(manifest.routes.map(route => route.id)).toEqual(['home', 'lookout', 'orchard']);
  for (const route of manifest.routes) expect(new Vector3(...route.points[0]).distanceTo(new Vector3(...SPAWN))).toBeLessThan(1e-10);
  const sites = [manifest.home, ...manifest.infrastructure];
  const ends = manifest.routes.map((route, i) => siteFrame(sites[i]).local({ position: route.points.at(-1)!, radius: siteFrame(sites[i]).base }));
  // Preserve historical destination bearings independently of how an owner
  // chooses to pave them. No special route mesh exists in the renderer.
  for (let i = 0; i < 2; i++) {
    const part = sites[i].blueprint.parts.find(part => part.part === 'step.entry')!;
    const step = partTransform(part, pivotOf(sites[i].blueprint.parts)).position;
    expect(Math.abs(ends[i].x - step[0])).toBeLessThan(.45);
    expect(ends[i].z - step[2]).toBeGreaterThan(0);
    expect(ends[i].z - step[2]).toBeLessThan(.7);
  }
  expect(ends[2].x).toBeGreaterThan(1.2);
  expect(ends[2].x).toBeLessThan(1.5);
  expect(Math.abs(ends[2].z)).toBeLessThan(.5);
  const before = JSON.stringify({manifest, objects, blueprints});
  const options = {routes:manifest.routes, radius, environment:HOME_ENVIRONMENT, objects, blueprints};
  const plan = planRoutePaths(options), field = fieldOf(HOME_ENVIRONMENT, radius);
  // Historical tiles retain their seats. The precise geometry rule may fill
  // former circle-exclusion gaps, but cannot duplicate an existing tile.
  for(const path of plan.objects){
    expect(objects.filter(object=>object.kind==='path').every(old=>distance(old.position,path.position,radius)>=.48)).toBe(true);
    expect(placementProblem('path',path.position,[...objects,...plan.objects],path.id,undefined,radius,2,{rotation:path.rotation,blueprints,field})).toBeNull();
  }
  expect(objects.length+plan.added).toBeLessThanOrEqual(MAX_OBJECTS);
  expect(plan.coverage.some(route=>route.covered>0)).toBe(true);
  const bareObjects = objects.filter(object=>object.kind!=='path');
  const additions = planRoutePaths({...options,objects:bareObjects});
  expect(additions.added).toBeGreaterThan(0);
  expect(bareObjects.length + additions.added).toBeLessThanOrEqual(MAX_OBJECTS);
  for (const object of additions.objects) {
    expect(object.kind).toBe('path');
    expect(object.radius).toBeUndefined();expect(object.height).toBeUndefined();
    expect(placementProblem(object.kind, object.position, bareObjects, undefined, undefined, radius,2,{rotation:object.rotation,blueprints,field})).toBeNull();
    expect(objectSeat(field, object, blueprints).problem).toBeNull();
  }
  // A legacy visual width cannot grant larger tiles or wider clearings.
  expect(planRoutePaths({...options,routes:manifest.routes.map(route=>({...route,width:100}))})).toEqual(plan);
  expect(JSON.stringify({manifest, objects, blueprints})).toBe(before);
});

it('walks from the real door approach over the court to natural ground and back up the entry steps at radius 21.6', () => {
  const f = walkingScene(), parts = f.manifest.home.blueprint.parts;
  const door = partTransform(parts.find(part => part.n === HOME_DOOR_PART)!, pivotOf(parts));
  const start = { x: door.position[0] + Math.sin(door.yaw) * .9, z: door.position[2] + Math.cos(door.yaw) * .9 };
  let pose = f.world.recover(f.world.pose(f.at(start.x, start.z)));
  expect(f.world.blocked(pose)).toBe(false);
  const supports = new Set<string>();
  const checkStep = (next: GroundPose, before: GroundPose) => {
    expect([...next.position, next.radius, next.verticalSpeed].every(Number.isFinite)).toBe(true);
    expect(f.world.blocked(next)).toBe(false);
    expect(next.grounded).toBe(true);
    // Stairs are discrete supports: bound the support change by the actual
    // step contract, rather than demanding an artificially smooth floor.
    expect(Math.abs(next.radius - before.radius)).toBeLessThanOrEqual(STEP_HEIGHT + .002);
    const support = f.world.support(next.position, next.radius + .004);
    expect(next.radius).toBeCloseTo(support.radius, 4);
    supports.add(support.tag);
  };
  pose = f.walk(pose, 0, 4.5, 2, checkStep);
  expect(f.local(pose).z).toBeCloseTo(4.5, 2);
  expect(pose.radius).toBeCloseTo(f.world.radius(pose.position), 4);
  expect(pose.verticalSpeed).toBe(0);
  pose = f.walk(pose, start.x, start.z, 2, checkStep);
  expect(f.local(pose).z).toBeCloseTo(start.z, 2);
  expect(f.local(pose).y).toBeCloseTo(0, 2);
  expect(supports).toEqual(new Set(['floor', 'terrain', 'step.entry']));
});

it('approaches the house from sloped natural ground but cannot walk through its front wall', () => {
  const f = walkingScene();
  let pose = f.world.pose(f.at(1, 3.8));
  expect(f.world.blocked(pose)).toBe(false);
  expect(Math.abs(f.world.radius(f.at(1, 3.8)) - f.world.radius(f.at(1, 3.1)))).toBeGreaterThan(.005);
  const wallPart = f.manifest.home.blueprint.parts.find(part => part.part === 'wall.window' && part.x === 3 && part.z === 2 && part.rot === 0)!;
  const wallZ = partTransform(wallPart, pivotOf(f.manifest.home.blueprint.parts)).position[2];
  const supports = new Set<string>();
  pose = f.walk(pose, 1, -1, 3, (next, before) => {
    expect(f.world.blocked(next)).toBe(false);
    expect(next.grounded).toBe(true);
    expect(Math.abs(next.radius - before.radius)).toBeLessThanOrEqual(STEP_HEIGHT + .002);
    expect(f.local(next).z).toBeGreaterThanOrEqual(wallZ + BODY_RADIUS);
    supports.add(f.world.support(next.position, next.radius + .004).tag);
  });
  expect(f.local(pose).z).toBeLessThan(1);
  expect(f.local(pose).z).toBeGreaterThan(wallZ + BODY_RADIUS);
  expect(f.local(pose).x).toBeCloseTo(1, 1);
  expect(supports).toEqual(new Set(['terrain', 'floor']));
});

it('retains seeded vegetation within the terrain budget, ignores historical road widths and disposes terrain once', () => {
  const { manifest, objects, blueprints } = scene();
  const model = terrainModel(HOME_ENVIRONMENT, objects, blueprints, 'medium', true, radius, manifest.routes);
  const withoutRoutes = terrainModel(HOME_ENVIRONMENT, objects, blueprints, 'medium', true, radius);
  const instances = (root:import('three').Object3D) => {
    const matrices:number[][]=[];
    root.getObjectByName('flora')!.traverse(object=>{
      if ('isInstancedMesh' in object && object.isInstancedMesh) matrices.push(Array.from((object as import('three').InstancedMesh).instanceMatrix.array));
    });
    return matrices;
  };
  let groundDisposals = 0;
  model.ground.geometry.addEventListener('dispose', () => groundDisposals++);
  try {
    expect(model.object.getObjectByName('sample:surface-routes')).toBeUndefined();
    expect(Object.values(model.stats.vegetation).reduce((sum, count) => sum + (count ?? 0), 0)).toBeGreaterThan(10);
    expect(model.stats.triangles).toBeLessThanOrEqual(BUDGET.terrain.medium.triangles);
    expect(model.stats.drawCalls).toBeLessThanOrEqual(BUDGET.terrain.medium.drawCalls);
    expect(model.stats.vegetation).toEqual(withoutRoutes.stats.vegetation);
    expect(instances(model.object).length).toBeGreaterThan(0);
    expect(instances(model.object)).toEqual(instances(withoutRoutes.object));
    expect(model.stats.triangles).toBe(withoutRoutes.stats.triangles);
    expect(model.stats.drawCalls).toBe(withoutRoutes.stats.drawCalls);
    expect(model.ground.geometry.getAttribute('position').array).toEqual(withoutRoutes.ground.geometry.getAttribute('position').array);
  } finally { model.dispose(); model.dispose(); withoutRoutes.dispose(); }
  expect(groundDisposals).toBe(1);
});
