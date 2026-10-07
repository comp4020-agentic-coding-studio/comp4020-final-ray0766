import { beforeAll, describe, expect, it } from 'vitest';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { layoutErrors, partTransform, pivotOf, placementProblem as partProblem } from '../src/assets/claude-geometry/blueprint/model.ts';
import { defaultEnvironment, encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import { structureFit, MAX_STRUCTURES } from '../src/shared/blueprints.ts';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, HOME_VARIANTS, homeVariant } from '../src/shared/home-layout.ts';
import { generateHomeManifest, HOME_GENERATION_BUDGET, HOME_GENERATOR_VERSION, homeManifestScene, homeRouteClearings, homeRoutesWalkable, walkHomeRoute } from '../src/shared/home-generation.ts';
import type { GeneratedHomeManifest } from '../src/shared/home-generation.ts';
import { HOME_SAMPLE_RADIUS } from '../src/shared/home.ts';
import { MAX_OBJECTS, objectRadius, placementProblem } from '../src/shared/planets.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { fieldOf, objectSeat } from '../src/shared/terrain.ts';
import { distance, SPAWN } from '../src/shared/world.ts';

const radius = HOME_SAMPLE_RADIUS;
const seeds = [...Array.from({ length: 20 }, (_, i) => i), 20261008, 0xffffffff, 0x80000000, 97531];
const fixtures = new Map<number, GeneratedHomeManifest>();
const worldOf = (manifest: GeneratedHomeManifest) => new GroundWorld({ id: 'generation-test', revision: 1, radius, environment: manifest.environment, ...homeManifestScene(manifest) });
beforeAll(() => {
  for (const seed of seeds) fixtures.set(seed, generateHomeManifest(radius, seed));
}, 30000);

describe('versioned, constrained home neighbourhoods', () => {
  it.each(seeds)('seed %i uses legal player parts and placement with room to expand', seed => {
    const manifest = fixtures.get(seed)!, { objects, blueprints } = homeManifestScene(manifest), field = fieldOf(manifest.environment, radius);
    expect(manifest).toMatchObject({ generator: 'home-neighbourhood', version: HOME_GENERATOR_VERSION, seed, catalogueVersion: 'home-kit-v1', environment: HOME_ENVIRONMENT, fallback: false });
    expect(manifest.infrastructure.length).toBeGreaterThanOrEqual(1);
    expect(manifest.infrastructure.length).toBeLessThanOrEqual(3);
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
      expect(placementProblem(object.kind, object.position, objects, object.id, object.radius, radius, 2), object.id).toBeNull();
      const fit = objectSeat(field, object, blueprints);
      expect(fit.problem, object.id).toBeNull();
      expect(fit.underwater, object.id).toBe(false);
    }
    // The advertised alterations still fit the same ordinary foundation; the
    // generator does not consume their room by moving neighbouring objects in.
    for (const variant of HOME_VARIANTS) expect(structureFit(homeVariant(variant).parts, manifest.home.position, manifest.home.rotation, field).problem).toBeNull();
    const clearings = homeRouteClearings(manifest.routes, radius);
    for (const object of objects.filter(o => o.kind !== 'structure')) for (const clearing of clearings)
      expect(distance(object.position, clearing.dir, radius)).toBeGreaterThanOrEqual(clearing.radius + objectRadius(object) + .15 - 1e-8);
  });

  it('recreates exactly the same result for the same seed, including edge uint32 seeds', () => {
    for (const seed of [0, 20261008, 0xffffffff]) expect(generateHomeManifest(radius, seed)).toEqual(fixtures.get(seed));
  }, 10000);

  it('varies both counts and positions, preserving one home for every seed', () => {
    const manifests = [...fixtures.values()];
    expect(new Set(manifests.map(m => m.infrastructure.length))).toEqual(new Set([1, 2, 3]));
    expect(new Set(manifests.map(m => m.objects.length)).size).toBeGreaterThan(5);
    expect(new Set(manifests.map(m => JSON.stringify(m.home.position))).size).toBe(seeds.length);
    expect(new Set(manifests.map(m => JSON.stringify(m.infrastructure.map(s => s.position)))).size).toBe(seeds.length);
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

  it('falls back deterministically from a malformed terrain document to a fully checked meadow', () => {
    const fallback = generateHomeManifest(radius, 8, '{bad-json');
    expect(fallback).toMatchObject({ environment: HOME_ENVIRONMENT, fallback: true, fallbackReason: 'invalid-environment', seed: 8 });
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
    expect(fallback).toMatchObject({ environment: HOME_ENVIRONMENT, fallback: true, fallbackReason: 'unsafe-environment', seed: 8 });
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
    const nominal = fixtures.get(8)!.home;
    expect(structureFit(nominal.blueprint.parts, nominal.position, nominal.rotation, candidate).problem).toBe('too-uneven');
    const fallback = generateHomeManifest(radius, 8, document);
    expect(fallback).toMatchObject({ environment: HOME_ENVIRONMENT, fallback: true, fallbackReason: 'unsafe-environment' });
    expect(homeRoutesWalkable(worldOf(fallback), fallback.routes)).toBe(true);
  });

  it('accepts an explicitly supplied legal terrain and rejects invalid inputs without producing a plan', () => {
    const terrain = defaultEnvironment('desert', 1);
    Object.assign(terrain.params, { relief: 1.4, roughness: 1 });
    const document = encodeEnvironment(terrain), manifest = generateHomeManifest(radius, 8, document);
    expect(manifest.environment).toBe(document);
    expect(manifest.fallback).toBe(false);
    expect(homeRoutesWalkable(worldOf(manifest), manifest.routes)).toBe(true);
    for (const bad of [NaN, Infinity, -1, 0]) expect(() => generateHomeManifest(bad, 0)).toThrow(RangeError);
    for (const bad of [NaN, Infinity, -1, .1, 0x100000000]) expect(() => generateHomeManifest(radius, bad)).toThrow(RangeError);
    expect(() => generateHomeManifest(1, 0)).toThrow('No legal home neighbourhood');
  }, 10000);
});
