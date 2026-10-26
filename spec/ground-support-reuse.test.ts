import { expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { SHORT_STREET_ENVIRONMENT } from '../src/shared/district-layout.ts';
import { FIXED_STEP, GroundWorld, STEP_HEIGHT } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { normalize, SPAWN } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';

type Support = ReturnType<GroundWorld['support']>;
type RadialMethod = (pose: GroundPose, position: Vec3, dt: number, support?: Support) => GroundPose;

it.each(['walking', 'falling', 'sliding'] as const)('reuses an exact support query with unchanged %s poses', mode => {
  const dir = normalize([.55, 1, .4]), parts = industrialCabin().parts;
  const base = structureFit(parts, dir, 0).baseRadius;
  const cabin = { id: 'support-reuse', revision: 1, blueprints: { kit: parts }, objects: [
    { id: 'cabin', kind: 'structure' as const, position: dir, rotation: 0, version: 1, blueprintHash: 'kit', ...structureSize(parts) },
  ] };
  const meadow = { id: 'support-reuse', revision: 1, radius: 12, environment: SHORT_STREET_ENVIRONMENT, objects: [] };
  const world = new GroundWorld(mode === 'sliding' ? cabin : meadow);
  const reference = new GroundWorld(mode === 'sliding' ? cabin : meadow);
  const at = (x: number, z: number) => localToDir({ dir: mode === 'sliding' ? dir : SPAWN, yaw: 0 },
    mode === 'sliding' ? base : world.radius(SPAWN), [x, 0, z]);
  const start = mode === 'sliding' ? at(-.45, 0) : SPAWN;
  let pose = world.pose(start);
  pose.radius = world.support(start, mode === 'sliding' ? base + STEP_HEIGHT : pose.radius + STEP_HEIGHT).radius;
  if (mode === 'falling') pose = { ...pose, radius: pose.radius + 1.2, grounded: false, verticalSpeed: -.2 };
  let previous = structuredClone(pose), landed = false, airborne = false, deflected = false;
  expect(world.blocked(pose)).toBe(false);

  // Recreate the former execution path: ignore the already computed support,
  // making radial perform its original identical query. No solver is mocked.
  const internal = reference as unknown as { radial: RadialMethod };
  const radial = internal.radial.bind(reference); let recomputations = 0;
  internal.radial = (old, position, dt, support) => {
    if (support !== undefined) recomputations++;
    return radial(old, position, dt);
  };
  const optimizedCalls = vi.spyOn(world, 'support'), referenceCalls = vi.spyOn(reference, 'support');
  const destination = mode === 'sliding' ? at(1.5, .6) : at(.8, -.2);
  for (let frame = 0; frame < 90; frame++) {
    const from = new Vector3(...pose.position), target = new Vector3(...destination);
    const distance = from.angleTo(target) * pose.radius;
    const next = from.lerp(target, Math.min(1, 2.5 * FIXED_STEP / Math.max(distance, .00001))).normalize().toArray() as Vec3;
    previous = reference.move(previous, next, FIXED_STEP);
    const before = pose; pose = world.move(pose, next, FIXED_STEP);
    expect(pose).toStrictEqual(previous);
    expect(world.blocked(pose)).toBe(false);
    airborne ||= !pose.grounded; landed ||= airborne && pose.grounded;
    deflected ||= new Vector3(...pose.position).angleTo(new Vector3(...next)) > 1e-5
      && new Vector3(...pose.position).angleTo(new Vector3(...before.position)) > 1e-6;
  }
  expect(recomputations).toBeGreaterThan(0);
  expect(referenceCalls.mock.calls.length).toBe(optimizedCalls.mock.calls.length + recomputations);
  if (mode === 'falling') { expect(airborne).toBe(true); expect(landed).toBe(true); }
  if (mode === 'sliding') expect(deflected).toBe(true);
  if (mode === 'walking') expect(new Vector3(...pose.position).angleTo(new Vector3(...start)) * world.baseRadius).toBeGreaterThan(.5);
  optimizedCalls.mockRestore(); referenceCalls.mockRestore();
});
