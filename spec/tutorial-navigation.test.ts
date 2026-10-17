import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { MAIN_PLANET_LEDGER } from '../src/shared/planet-plan/main-planet.ts';
import { arc, dirOf } from '../src/shared/planet-plan/sphere.ts';
import { NPCS, SPAWN } from '../src/shared/world.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { FIXED_STEP, STEP_HEIGHT } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { stationSites } from '../src/shared/teleport.ts';
import { routeToTutorialTarget, sampleTutorialRoute, canWalkTutorialConnector, tutorialStationApproaches, TUTORIAL_NAVIGATION_BUDGET } from '../src/shared/tutorial-navigation.ts';
import { generateHomeManifest, homeManifestScene } from '../src/shared/home-generation.ts';
import { TELEPORT_STATION } from '../src/shared/planet-plan/compositions.ts';
import { structureSize } from '../src/shared/blueprints.ts';
import type { Vec3 } from '../src/shared/world.ts';

describe('tutorial navigation consumes the real frozen paths', () => {
  it('routes Mica to Sol along the public paths through their common root, never a direct wall-crossing arc', () => {
    const result = routeToTutorialTarget({ position: NPCS.mica.position, target: { kind: 'sol', position: NPCS.sol.position, planetId: 'hub' }, planetId: 'hub', radius: 21.6, canConnect: () => false });
    expect(result.connected).toBe(true); expect(result.sourceRoutes).toEqual(['public-post', 'public-orchard']);
    expect(result.points.some(p => arc(p, SPAWN, 21.6) < .01)).toBe(true);
    expect(result.points.at(-1)).toEqual(NPCS.sol.position);
    const allowed = MAIN_PLANET_LEDGER.routes.filter(r => ['public-post', 'public-orchard'].includes(r.id));
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1], b = result.points[i];
      expect(allowed.some(route => route.points.some((p, j) => j > 0 &&
        ((arc(p, a, 21.6) < .01 && arc(route.points[j - 1], b, 21.6) < .01) ||
         (arc(p, b, 21.6) < .01 && arc(route.points[j - 1], a, 21.6) < .01))))).toBe(true);
    }
  });
  it('never guesses an off-route connection, and can select a farther actually reachable segment', () => {
    const position = dirOf(70, 320), target = { kind: 'mica' as const, position: NPCS.mica.position, planetId: 'hub' };
    expect(routeToTutorialTarget({ position, target, radius: 21.6, planetId: 'hub', canConnect: () => false }).points).toEqual([]);
    let checks = 0;
    const result = routeToTutorialTarget({ position, target, radius: 21.6, planetId: 'hub', canConnect: () => ++checks === 2 });
    expect(checks).toBeGreaterThan(1); expect(checks).toBeLessThanOrEqual(12); expect(result.connected).toBe(true);
  });
  it('refuses a destination on another planet and proves a legacy home approach before drawing it', () => {
    const position: Vec3 = [0, 1, 0], target = { kind: 'home' as const, position: dirOf(88, 0), planetId: 'own-home' };
    expect(routeToTutorialTarget({ position, target, radius: 21.6, planetId: 'hub' }).reason).toBe('different-planet');
    expect(routeToTutorialTarget({ position, target, radius: 21.6, planetId: 'own-home' }).connected).toBe(false);
    const proven = routeToTutorialTarget({ position, target, radius: 21.6, planetId: 'own-home', canConnect: () => true });
    expect(proven.connected).toBe(true); expect(proven.points.at(-1)).toEqual(target.position);
  });
  it('caps arrow count and distance while preserving unit, finite tangent frames at both poles', () => {
    for (const points of [[dirOf(86, 0), [0, 1, 0] as Vec3, dirOf(86, 180)], [dirOf(-86, 0), [0, -1, 0] as Vec3, dirOf(-86, 180)]]) {
      const samples = sampleTutorialRoute(points, 21.6, .02, 1000, 30);
      expect(samples.length).toBe(40);
      for (const sample of samples) {
        expect(Math.hypot(...sample.position)).toBeCloseTo(1, 10); expect(Math.hypot(...sample.forward)).toBeCloseTo(1, 8);
        expect(sample.position.reduce((sum, n, i) => sum + n * sample.forward[i], 0)).toBeCloseTo(0, 8);
        expect([...sample.position, ...sample.forward].every(Number.isFinite)).toBe(true); expect(sample.distance).toBeLessThanOrEqual(30);
      }
    }
  });
  it('replays local connectors with ordinary physics without mutating the supplied world or source pose', () => {
    const world = new GroundWorld({ id: 'tutorial-proof-test', radius: 10, revision: 0, objects: [] });
    const from: Vec3 = [0, 1, 0], to = dirOf(88, 0), before = JSON.stringify(from), bodies = world.bodies;
    expect(canWalkTutorialConnector(world, from, to)).toBe(true);
    expect(canWalkTutorialConnector(world, from, dirOf(0, 0))).toBe(false);
    expect(JSON.stringify(from)).toBe(before); expect(world.bodies).toBe(bodies);
  });
});

it('selects and continuously walks the three tutorial legs against the real v15 hub and its real gate', () => {
  const planet = { id: 'hub', radius: 21.6, revision: 1015, objects: [], blueprints: {}, environment: null };
  const world = new GroundWorld(planet), gate = stationSites(planet)[0]; expect(gate).toBeDefined();
  const targets = [{ kind: 'mica' as const, position: NPCS.mica.position, planetId: 'hub' },
    { kind: 'sol' as const, position: NPCS.sol.position, planetId: 'hub' },
    { kind: 'gate' as const, position: gate.interact, planetId: 'hub' }];
  let pose: GroundPose = { ...world.pose(SPAWN), radius: world.support(SPAWN, world.radius(SPAWN) + STEP_HEIGHT).radius };
  for (const target of targets) {
    const result = routeToTutorialTarget({ position: pose.position, target, planetId: 'hub', radius: 21.6,
      // This test proves reachability independent of machine speed. Runtime's
      // measured replan budget and cached continuation are separate concerns.
      clock: () => 0, canConnect: (from, to) => canWalkTutorialConnector(world, from, to) });
    expect(result.connected, JSON.stringify({ target, reason: result.reason })).toBe(true);
    expect(result.points.length).toBeGreaterThan(1);
    for (const point of result.points.slice(1)) {
      let reached = false;
      for (let step = 0; step < 2000; step++) {
        const remaining = arc(pose.position, point, 21.6);
        if (remaining < .035) { reached = true; break; }
        const next = new Vector3(...pose.position).lerp(new Vector3(...point), Math.min(1, .045 / remaining)).normalize().toArray() as Vec3;
        const before = pose; pose = world.move(pose, next, FIXED_STEP);
        expect(world.blocked(pose), JSON.stringify({ target: target.kind, point, pose })).toBe(false);
        if (arc(before.position, pose.position, 21.6) < 1e-6) break;
      }
      expect(reached, JSON.stringify({ target: target.kind, point, pose })).toBe(true);
    }
    expect(arc(pose.position, target.position, 21.6)).toBeLessThan(.035);
  }
}, 30000);

it('replays the failed phone seed with its ordinary registered station: arrival and interrupted position safely bend around the pot, then return to the gate', () => {
  // Sanitized reconstruction of the self-created phone fixture. Only the
  // generator seed, registered station site and test-driver feet position are
  // retained: no cookie, identity, name or copied private design document.
  const radius = 21.6, manifest = generateHomeManifest(radius, 1498645664), scene = homeManifestScene(manifest);
  const parts = TELEPORT_STATION.blueprint.parts, stationPosition: Vec3 = [-.23193928957943097, .8515567763813229, .47016510137231415];
  const planet = { id: 'phone-navigation-regression', radius, revision: 1, environment: manifest.environment,
    blueprints: { ...scene.blueprints, 'fixture-station': parts },
    objects: [...scene.objects, { id: 'fixture-station', kind: 'structure' as const, blueprintHash: 'fixture-station', position: stationPosition, rotation: 2.324052587322063, version: 1, ...structureSize(parts) }],
    homeDoor: { buildingId: 'generated-structure-0', partNumber: 1, open: true, version: 0 } };
  const world = new GroundWorld(planet), station = stationSites(planet)[0], home = manifest.routes.find(r => r.id === 'home')!.points.at(-1)!;
  const saved: Vec3 = [-.16443420439038595, .9514623254040018, .26015540694613776];
  expect(canWalkTutorialConnector(world, station.arrival, SPAWN)).toBe(false);
  for (const [start, kind, destination] of [[station.arrival, 'home', home], [saved, 'home', home], [home, 'gate', station.interact]] as const) {
    const cache = new Map<string, boolean>(); let result: ReturnType<typeof routeToTutorialTarget> | undefined;
    for (let round = 0; round < 16; round++) {
      let proofs = 0;
      result = routeToTutorialTarget({ position: start, target: { kind, position: destination, planetId: planet.id }, planetId: planet.id, radius,
        homeRoutes: structuredClone(manifest.routes), stationApproaches: tutorialStationApproaches(planet), clock: () => 0,
        readProofCache: (a, b) => cache.get(JSON.stringify([a, b])), canConnect: (a, b) => {
          proofs++; const safe = canWalkTutorialConnector(world, a, b); cache.set(JSON.stringify([a, b]), safe); return safe;
        } });
      expect(proofs).toBeLessThanOrEqual(TUTORIAL_NAVIGATION_BUDGET.connectorChecks);
      if (result.connected || !proofs) break;
    }
    expect(result?.connected, `${kind}: ${result?.reason}`).toBe(true);
    expect(result!.points.length).toBeGreaterThan(3);
    let pose: GroundPose = { ...world.pose(start), radius: world.support(start, world.radius(start) + STEP_HEIGHT).radius };
    for (const target of result!.points.slice(1)) {
      let reached = false;
      for (let tick = 0; tick < 2000; tick++) {
        const remaining = arc(pose.position, target, radius); if (remaining < .035) { reached = true; break; }
        const before = pose; pose = world.move(pose, new Vector3(...pose.position).lerp(new Vector3(...target), Math.min(1, .045 / remaining)).normalize().toArray() as Vec3, FIXED_STEP);
        expect(world.blocked(pose)).toBe(false); if (arc(before.position, pose.position, radius) < 1e-6) break;
      }
      expect(reached, `${kind}: ordinary walk stopped`).toBe(true);
    }
    expect(arc(pose.position, destination, radius)).toBeLessThan(.035);
  }
}, 30000);
