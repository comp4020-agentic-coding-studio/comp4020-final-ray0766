import { beforeAll, describe, expect, it } from 'vitest';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { layoutErrors, partTransform, pivotOf, placementProblem as partProblem } from '../src/assets/claude-geometry/blueprint/model.ts';
import { decodeEnvironment, defaultEnvironment, encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import { structureFit, structureSize, MAX_STRUCTURES } from '../src/shared/blueprints.ts';
import { HOME_DOOR_PART, HOME_VARIANTS, homeVariant } from '../src/shared/home-layout.ts';
import { SHORT_STREET_ENVIRONMENT, districtHome, districtPlan, districtWorkshop } from '../src/shared/district-layout.ts';
import { generateHomeManifest, HOME_GENERATION_BUDGET, HOME_GENERATOR_VERSION, homeManifestScene, homePavingRoutes, homeRouteClearings, homeRoutesWalkable, walkHomeRoute } from '../src/shared/home-generation.ts';
import type { GeneratedHomeManifest } from '../src/shared/home-generation.ts';
import { HOME_SAMPLE_RADIUS } from '../src/shared/home.ts';
import { MAX_OBJECTS, objectRadius, placementProblem } from '../src/shared/planets.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { fieldOf, objectSeat } from '../src/shared/terrain.ts';
import { distance, SPAWN } from '../src/shared/world.ts';
import { planRoutePaths } from '../src/shared/path-layout.ts';
import { PathPlacementCache } from '../src/shared/path-structure-placement.ts';

const radius = HOME_SAMPLE_RADIUS;
const seeds = [0, 1, 2, 4, 5, 6, 8, 20261008, 0xffffffff, 0x80000000, 97531];
const fixtures = new Map<number, GeneratedHomeManifest>();
const worldOf = (manifest: GeneratedHomeManifest) => new GroundWorld({ id: 'generation-test', revision: 1, radius, environment: manifest.environment, ...homeManifestScene(manifest) });
beforeAll(() => {
  for (const seed of seeds) fixtures.set(seed, generateHomeManifest(radius, seed));
}, 30000);

describe('versioned, constrained home neighbourhoods', () => {
  it.each(seeds)('seed %i uses legal player parts and placement with reserved build capacity', seed => {
    const manifest = fixtures.get(seed)!, { objects, blueprints } = homeManifestScene(manifest), field = fieldOf(manifest.environment, radius), cache = new PathPlacementCache();
    expect(manifest).toMatchObject({ generator: 'home-neighbourhood', version: HOME_GENERATOR_VERSION, seed, catalogueVersion: 'district-kit-v2', environment: SHORT_STREET_ENVIRONMENT, fallback: false });
    expect(manifest.infrastructure).toHaveLength(3);
    expect(objects.length).toBeLessThanOrEqual(HOME_GENERATION_BUDGET.maxObjects);
    expect(MAX_OBJECTS - objects.length).toBeGreaterThanOrEqual(HOME_GENERATION_BUDGET.reservedObjects);
    expect(MAX_STRUCTURES - (1 + manifest.infrastructure.length)).toBeGreaterThanOrEqual(HOME_GENERATION_BUDGET.reservedStructures);
    expect(manifest.home.blueprint.parts.filter(p => p.part === 'wall.door.open').map(p => p.n)).toEqual([HOME_DOOR_PART]);
    for (const site of [manifest.home, ...manifest.infrastructure]) {
      expect(site.blueprint.parts.length).toBeLessThanOrEqual(120);
      expect(layoutErrors(site.blueprint.parts)).toEqual([]);
      for (const part of site.blueprint.parts) expect(partProblem(site.blueprint.parts, part)).toBeNull();
    }
    for (const site of manifest.infrastructure) expect(site.blueprint.parts.some(p => p.part === 'wall.door.open')).toBe(false);
    for (const object of objects) {
      expect(placementProblem(object.kind, object.position, objects, object.id, object.radius, radius, 2,
        { rotation: object.rotation, blueprintHash: object.blueprintHash, blueprints, field, cache }), object.id).toBeNull();
      const fit = objectSeat(field, object, blueprints);
      expect(fit.problem, object.id).toBeNull();
      expect(fit.underwater, object.id).toBe(false);
    }
    // The compact recipe is its own saved custom composition. Legacy remodels
    // still go through their normal preview collision check before any write.
    const oldDoor = homeVariant('starter').parts.find(part => part.n === HOME_DOOR_PART)!;
    const newDoor = manifest.home.blueprint.parts.find(part => part.n === HOME_DOOR_PART)!;
    expect(newDoor).toEqual(oldDoor);
    expect(partTransform(newDoor, pivotOf(manifest.home.blueprint.parts)))
      .toEqual(partTransform(oldDoor, pivotOf(homeVariant('starter').parts)));
    const clearings = homeRouteClearings(manifest.routes, radius);
    for (const object of objects.filter(o => o.kind !== 'structure' && o.kind !== 'path')) for (const clearing of clearings)
      expect(distance(object.position, clearing.dir, radius)).toBeGreaterThanOrEqual(clearing.radius + objectRadius(object) + .15 - 1e-8);
  });

  it('uses normal persisted path objects first, including their landing and building restrictions', () => {
    // Every seed's placement is checked above. Exercise the object contract
    // here on both lane orientations without repeating every exact fit.
    for (const manifest of [fixtures.get(0)!, fixtures.get(4)!]) {
      expect(manifest.version).toBe(5);
      const { objects, blueprints } = homeManifestScene(manifest), field = fieldOf(manifest.environment, radius), cache = new PathPlacementCache();
      const paths = objects.filter(object => object.kind === 'path');
      const scenery = objects.filter(object => object.kind !== 'path' && object.kind !== 'structure');
      expect(paths.length).toBeGreaterThanOrEqual(manifest.routes.length * 2);
      expect(scenery.length).toBeGreaterThanOrEqual(HOME_GENERATION_BUDGET.minSceneryObjects);
      // These are complete ordinary object specs, not a render-only route mesh
      // or enlarged/invisible collision substitutes.
      for (const path of paths) {
        expect(path.assetVersion).toBe(2);
        expect(path.blueprintHash).toBeUndefined();
        expect(path.radius).toBeUndefined();
        expect(path.height).toBeUndefined();
        expect(distance(path.position, SPAWN, radius)).toBeGreaterThanOrEqual(objectRadius(path) + 1 - 1e-8);
        expect(placementProblem('path', path.position, objects, path.id, undefined, radius, 2,
          { rotation: path.rotation, blueprints, field, cache })).toBeNull();
        // The same owner operation can retain or rotate this individual tile.
        expect(objectSeat(fieldOf(manifest.environment, radius), { ...path, rotation: (path.rotation + Math.PI / 2) % (2 * Math.PI) }).problem).toBeNull();
      }
      expect(manifest.objects.slice(0, paths.length).every(object => object.kind === 'path')).toBe(true);
      expect(manifest.objects.slice(paths.length).every(object => object.kind !== 'path')).toBe(true);
      for (const route of manifest.routes) {
        const routeSamples = homeRouteClearings([route], radius);
        const tiles = paths.filter(path => routeSamples.some(sample => distance(path.position, sample.dir, radius) < .2));
        expect(tiles.length, route.id).toBeGreaterThanOrEqual(2);
      }
      const first = paths[0];
      expect(placementProblem('path', SPAWN, objects, first.id, undefined, radius, 2)).not.toBeNull();
      expect(placementProblem('path', manifest.home.position, objects, first.id, undefined, radius, 2)).not.toBeNull();
    }
  });

  it('recreates exactly the same result for the same seed, including edge uint32 seeds', () => {
    for (const seed of [0, 20261008, 0xffffffff]) expect(generateHomeManifest(radius, seed)).toEqual(fixtures.get(seed));
  }, 10000);

  it('fits all four compact remodels into the six saved streets without moving the door or neighbours', () => {
    const legacy = HOME_VARIANTS.map(kind => homeVariant(kind));
    for (const seed of [0, 1, 2, 4, 5, 6]) for (const kind of HOME_VARIANTS) {
      const manifest = fixtures.get(seed)!, original = homeManifestScene(manifest);
      const blueprint = districtHome(kind, districtPlan(seed).reflected), parts = blueprint.parts;
      const home = { ...original.objects[0], ...structureSize(parts) };
      const blueprints = { ...original.blueprints, [home.blueprintHash!]: parts };
      const objects = [home, ...original.objects.slice(1)], field = fieldOf(manifest.environment, radius);
      expect(layoutErrors(parts), `${seed}: ${kind}`).toEqual([]);
      for (const part of parts) expect(partProblem(parts, part)).toBeNull();
      expect(pivotOf(parts)).toEqual(pivotOf(manifest.home.blueprint.parts));
      expect(parts.find(part => part.n === HOME_DOOR_PART)).toEqual(manifest.home.blueprint.parts.find(part => part.n === HOME_DOOR_PART));
      expect(structureFit(parts, home.position, home.rotation, field).problem).toBeNull();
      expect(placementProblem('structure', home.position, objects, home.id, home.radius, radius, 2,
        { rotation: home.rotation, blueprintHash: home.blueprintHash, blueprints, field }), `${seed}: ${kind}`).toBeNull();
      expect(homeRoutesWalkable(new GroundWorld({ id: 'remodel-check', revision: 1, radius, environment: manifest.environment, objects, blueprints }),
        manifest.routes.filter(route => route.id === 'home')), `${seed}: ${kind}`).toBe(true);
      if (kind === 'extension') expect(parts.filter(part => part.part === 'floor.deck')).toHaveLength(7);
      expect(objects.slice(1)).toEqual(original.objects.slice(1));
    }
    expect(HOME_VARIANTS.map(kind => homeVariant(kind))).toEqual(legacy);
    expect(districtHome().parts).toEqual(fixtures.get(0)!.home.blueprint.parts);
  }, 15000);

  it('still refuses the compact extension when a player has built beside the original house', () => {
    const manifest = fixtures.get(0)!, scene = homeManifestScene(manifest), home = scene.objects[0];
    const field = fieldOf(manifest.environment, radius);
    const base = structureFit(manifest.home.blueprint.parts, home.position, home.rotation, field).baseRadius;
    const parts = [{ n: 1, part: 'floor.deck' as const, x: 2, z: 2, rot: 0 as const, level: 0 }];
    const added = { id: 'player-side-pad', kind: 'structure' as const, version: 1, blueprintHash: 'player-side-pad',
      position: localToDir({ dir: home.position, yaw: home.rotation }, base, [2.3, 0, 0]), rotation: home.rotation, ...structureSize(parts) };
    const blueprints = { ...scene.blueprints, [added.blueprintHash]: parts };
    expect(placementProblem('structure', added.position, scene.objects, undefined, added.radius, radius, 2,
      { rotation: added.rotation, blueprintHash: added.blueprintHash, blueprints, field })).toBeNull();
    const extension = districtHome('extension').parts, changed = { ...home, ...structureSize(extension) };
    expect(placementProblem('structure', changed.position, [changed, ...scene.objects.slice(1), added], changed.id, changed.radius, radius, 2,
      { rotation: changed.rotation, blueprintHash: changed.blueprintHash,
        blueprints: { ...blueprints, [changed.blueprintHash!]: extension }, field })).not.toBeNull();
    expect(manifest.home.blueprint.parts).toEqual(districtHome().parts);
  });

  it('keeps actual paving continuous to each support edge after saving the complete scene', () => {
    for (const manifest of fixtures.values()) {
      const scene = homeManifestScene(manifest);
      const result = planRoutePaths({ routes: manifest.routes, pavingRoutes: homePavingRoutes(manifest, radius, manifest.environment),
        radius, environment: manifest.environment, ...scene, maxObjects: scene.objects.length, spacing: .85 });
      expect(result.objects).toEqual([]);
      for (const coverage of result.coverage) {
        expect(coverage.connected, `${manifest.seed}: ${coverage.id}`).toBe(true);
        expect(coverage.maxGap).toBeLessThanOrEqual(.24);
        expect(coverage.endDistance).toBeLessThanOrEqual(.25);
      }
    }
  }, 15000);

  it('chooses complete authored courts with solid, tall, sheltered and open destinations', () => {
    const manifests = [...fixtures.values()];
    expect(new Set(manifests.map(m => JSON.stringify([m.home, ...m.infrastructure].map(site => site.position)))).size).toBe(6);
    expect(new Set(seeds.map(seed => districtPlan(seed).prototype)).size).toBe(3);
    for (const manifest of manifests) {
      expect(manifest.home.blueprint.parts).toEqual(districtHome().parts);
      expect(manifest.home.blueprint.parts).toHaveLength(34);
      expect(homeVariant('starter').parts).toHaveLength(54);
      expect(manifest.infrastructure[0].blueprint.parts.filter(part => part.part === 'step.entry')).toHaveLength(2);
      expect(districtWorkshop().parts.filter(part => part.part === 'step.entry')).toHaveLength(1);
      expect(manifest.infrastructure[0].blueprint.parts).toHaveLength(79);
      expect(manifest.infrastructure[0].blueprint.parts.some(part => part.part === 'stair.straight')).toBe(true);
      expect(Math.max(...manifest.infrastructure[0].blueprint.parts.map(part => part.level))).toBe(2);
      expect(manifest.infrastructure[1].blueprint.parts.some(part => part.part.startsWith('wall.'))).toBe(false);
      expect(manifest.infrastructure[2].blueprint.parts.some(part => part.part.startsWith('roof.'))).toBe(false);
      expect(manifest.objects.filter(object => object.kind === 'tree').length).toBeGreaterThanOrEqual(5);
      expect(manifest.objects.some(object => object.kind === 'bench')).toBe(true);
      // The lane turns before arriving; destinations do not radiate directly
      // from the landing point. That point itself remains untouched.
      expect(manifest.routes.every(route => route.points.length >= 4)).toBe(true);
    }
  });

  it('ends each home route at its actual fitted door approach rather than an estimated bearing', () => {
    for (const manifest of fixtures.values()) {
      const site = manifest.home, parts = site.blueprint.parts;
      const door = partTransform(parts.find(p => p.n === HOME_DOOR_PART)!, pivotOf(parts));
      const fit = structureFit(parts, site.position, site.rotation, fieldOf(manifest.environment, radius));
      const expected = localToDir({ dir: site.position, yaw: site.rotation }, fit.baseRadius,
        [door.position[0] + Math.sin(door.yaw) * .9, 0, door.position[2] + Math.cos(door.yaw) * .9]);
      const route = manifest.routes.find(route => route.id === 'home')!;
      expect(distance(route.points.at(-1)!, expected, radius)).toBeLessThan(1e-6);
      expect(manifest.routes.length).toBe(manifest.infrastructure.length + 1);
      for (const route of manifest.routes) expect(route.points[0]).toEqual(SPAWN);
    }
  });

  it('walks every saved route forwards and back with lateral clearance under real collision rules', () => {
    for (const manifest of fixtures.values()) {
      const world = worldOf(manifest);
      expect(world.blocked(world.pose(SPAWN))).toBe(false);
      expect(homeRoutesWalkable(world, manifest.routes)).toBe(true);
      for (const route of manifest.routes) {
        const end = walkHomeRoute(world, route)!;
        expect(end.grounded).toBe(true);
        expect(world.blocked(end)).toBe(false);
        expect(distance(end.position, route.points.at(-1)!, radius)).toBeLessThan(.06);
        const returned = walkHomeRoute(world, { ...route, points: [...route.points].reverse() }, end)!;
        expect(returned.grounded).toBe(true);
        expect(distance(returned.position, SPAWN, radius)).toBeLessThan(.06);
      }
    }
  }, 30000);

  it('does not certify a route that crosses a real wall', () => {
    const manifest = fixtures.get(0)!, site = manifest.home, world = worldOf(manifest);
    const base = structureFit(site.blueprint.parts, site.position, site.rotation, fieldOf(manifest.environment, radius)).baseRadius;
    const at = (z: number) => localToDir({ dir: site.position, yaw: site.rotation }, base, [1, 0, z]);
    expect(walkHomeRoute(world, { id: 'blocked-wall', width: .96, points: [at(4.2), at(-1)] })).toBeNull();
  });

  it('walks the real exterior workshop stair to the second floor and back in both orientations', () => {
    for (const manifest of [fixtures.get(0)!, fixtures.get(4)!]) {
      const site = manifest.infrastructure[0], parts = site.blueprint.parts, world = worldOf(manifest);
      const stair = partTransform(parts.find(part => part.part === 'stair.straight')!, pivotOf(parts));
      const base = structureFit(parts, site.position, site.rotation, fieldOf(manifest.environment, radius)).baseRadius;
      const at = (forward: number, y: number) => localToDir({ dir: site.position, yaw: site.rotation }, base,
        [stair.position[0] + Math.sin(stair.yaw) * forward, y, stair.position[2] + Math.cos(stair.yaw) * forward]);
      const route = { id: 'workshop-stair', width: .6, points: [at(1.5, 0), at(.4, 0), at(-1.6, 2.2), at(-2.1, 2.2)] };
      const upstairs = walkHomeRoute(world, route);
      expect(upstairs).not.toBeNull();
      expect(upstairs!.grounded).toBe(true);
      expect(upstairs!.radius - base).toBeGreaterThan(2.05);
      expect(walkHomeRoute(world, { ...route, points: [...route.points].reverse() }, upstairs!)).not.toBeNull();
    }
  });

  it('falls back deterministically from a malformed terrain document to a fully checked meadow', () => {
    const fallback = generateHomeManifest(radius, 8, '{bad-json');
    expect(fallback).toMatchObject({ environment: SHORT_STREET_ENVIRONMENT, fallback: true, fallbackReason: 'invalid-environment', seed: 8 });
    const { fallback: flag, fallbackReason: reason, ...result } = fallback;
    expect(flag).toBe(true); expect(reason).toBe('invalid-environment');
    const { fallback: regular, ...expected } = fixtures.get(8)!;
    expect(regular).toBe(false); expect(result).toEqual(expected);
    expect(homeRoutesWalkable(worldOf(fallback), fallback.routes)).toBe(true);
  });

  it.each(['ocean', 'temperate'] as const)('refuses unsafe %s terrain and returns an ordinary legal fallback', style => {
    const terrain = defaultEnvironment(style, 1);
    Object.assign(terrain.params, { relief: 1.4, roughness: 1, waterLevel: style === 'ocean' ? .7 : .3 });
    const requested = encodeEnvironment(terrain), fallback = generateHomeManifest(radius, 8, requested);
    expect(fallback).toMatchObject({ environment: SHORT_STREET_ENVIRONMENT, fallback: true, fallbackReason: 'unsafe-environment', seed: 8 });
    expect(fallback.environment).not.toBe(requested);
    const { objects, blueprints } = homeManifestScene(fallback);
    for (const object of objects) expect(objectSeat(fieldOf(fallback.environment, radius), object, blueprints).problem).toBeNull();
    expect(homeRoutesWalkable(worldOf(fallback), fallback.routes)).toBe(true);
  }, 10000);

  it('falls back from dry but uneven terrain without weakening the foundation or walk rules', () => {
    const terrain = defaultEnvironment('temperate', 1);
    Object.assign(terrain.params, { relief: 1.4, roughness: 1, waterLevel: null, outcrops: 1 });
    const document = encodeEnvironment(terrain), candidate = fieldOf(document, radius);
    expect(candidate.waterLevel).toBeNull();
    const nominal = fixtures.get(8)!.infrastructure[0];
    expect(structureFit(nominal.blueprint.parts, nominal.position, nominal.rotation, candidate).problem).toBe('too-uneven');
    const fallback = generateHomeManifest(radius, 8, document);
    expect(fallback).toMatchObject({ environment: SHORT_STREET_ENVIRONMENT, fallback: true, fallbackReason: 'unsafe-environment' });
    expect(homeRoutesWalkable(worldOf(fallback), fallback.routes)).toBe(true);
  });

  it('accepts an explicitly supplied legal terrain and rejects invalid inputs without producing a plan', () => {
    const decoded = decodeEnvironment(SHORT_STREET_ENVIRONMENT);
    if (!decoded.ok) throw new Error('Authored environment is invalid');
    decoded.value.params.vegetation = .4;
    const document = encodeEnvironment(decoded.value), manifest = generateHomeManifest(radius, 8, document);
    expect(manifest.environment).toBe(document);
    expect(manifest.fallback).toBe(false);
    expect(homeRoutesWalkable(worldOf(manifest), manifest.routes)).toBe(true);
    for (const bad of [NaN, Infinity, -1, 0]) expect(() => generateHomeManifest(bad, 0)).toThrow(RangeError);
    for (const bad of [NaN, Infinity, -1, .1, 0x100000000]) expect(() => generateHomeManifest(radius, bad)).toThrow(RangeError);
    expect(() => generateHomeManifest(1, 0)).toThrow('No legal home neighbourhood');
  }, 10000);
});
