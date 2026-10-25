import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { encodeBlueprint } from '../src/shared/blueprint-codec.ts';
import { GroundWorld, FIXED_STEP, JUMP_FLAG, PHYSICS_VERSION } from '../src/shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../src/shared/physics/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { normalize } from '../src/shared/world.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { surveyPost } from '../src/assets/claude-geometry/blueprint/samples.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';

// Small solver fixture using the real deck/guard geometry, without a saved world.
function balcony(): PartPlacement[] {
  const parts: PartPlacement[] = [];
  for (const level of [0, 1]) for (const x of [0, 1, 2]) for (const z of [0, 1, 2])
    parts.push({ n: parts.length + 1, part: 'floor.deck', x, z, level, rot: 0 });
  parts.push({ n: parts.length + 1, part: 'rail.guard', x: 1, z: 2, level: 1, rot: 0 });
  return parts;
}

function fixture(parts = balcony(), radius = 12, dir: Vec3 = [0, 1, 0], yaw = 0) {
  const anchor = { dir, yaw }, base = structureFit(parts, dir, yaw, fieldOf(null, radius)).baseRadius;
  const inverse = new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
  const world = new GroundWorld({ id: 'rail-fixture', radius, revision: 1, blueprints: { kit: parts },
    objects: [{ id: 'balcony', kind: 'structure', position: dir, rotation: yaw, version: 1, blueprintHash: 'kit', ...structureSize(parts) }] });
  const at = (x: number, z: number, y = 2.2) => localToDir(anchor, base, [x, y, z]);
  const local = (pose: GroundPose) => new Vector3(...pose.position).multiplyScalar(pose.radius)
    .addScaledVector(new Vector3(...dir), -base).applyQuaternion(inverse);
  const start = (x: number, z: number, y = 2.2): GroundPose => {
    const position = at(x, z, y);
    return { position, radius: world.support(position, base + y + .26).radius, verticalSpeed: 0, grounded: true, jumpHeld: false };
  };
  function walk(pose: GroundPose, x: number, z: number, frames = 120, jump = false) {
    for (let i = 0; i < frames; i++) {
      const from = new Vector3(...pose.position), target = new Vector3(...at(x, z, local(pose).y));
      const distance = from.angleTo(target) * pose.radius;
      const next = from.lerp(target, Math.min(1, 3 * FIXED_STEP / Math.max(distance, 1e-8))).normalize().toArray() as Vec3;
      pose = world.move(pose, next, FIXED_STEP, jump && i === 0 ? JUMP_FLAG : 0);
      expect(world.blocked(pose)).toBe(false);
    }
    return pose;
  }
  return { world, base, at, local, start, walk };
}

it.each([
  [12, [0, 1, 0], 0], [12, [0, -1, 0], .73], [36, normalize([.4, .7, .3]), 1.7],
] as [number, Vec3, number][])('restores a legacy guard-top pose and can retreat or continue without jumping (radius %s)', (radius, dir, yaw) => {
  const f = fixture(balcony(), radius, dir, yaw), launch = f.start(0, 1.05);
  expect(f.world.blocked(launch)).toBe(false);
  const rail = f.start(0, 1.44, 3.27);
  expect(f.local(rail).z).toBeCloseTo(1.44, 2);
  expect(rail.grounded).toBe(true);
  expect(rail.verticalSpeed).toBe(0);
  expect(f.local(rail).y).toBeCloseTo(3.27, 1);

  const back = f.walk(rail, 0, .5);
  expect(f.local(back).z).toBeCloseTo(.5, 2);
  expect(f.local(back).y).toBeCloseTo(2.2, 1);
  expect(back.grounded).toBe(true);
  const forward = f.walk(rail, 0, 2.5);
  expect(f.local(forward).z).toBeCloseTo(2.5, 2);
  expect(forward.grounded).toBe(true);
  expect(forward.radius).toBeCloseTo(f.world.radius(forward.position), 5);

  let pose = rail, peak = pose.radius;
  for (let i = 0; i < 100; i++) {
    pose = f.world.move(pose, pose.position, FIXED_STEP, i === 0 ? JUMP_FLAG : 0);
    peak = Math.max(peak, pose.radius);
    expect(f.world.blocked(pose)).toBe(false);
  }
  expect(peak - rail.radius).toBeCloseTo(0,6);
  expect(pose.grounded).toBe(true);
  expect(pose.radius).toBeCloseTo(rail.radius, 5);
});

it('keeps the guard solid when walking into it and lets the player reverse on the platform', () => {
  const f = fixture(), stopped = f.walk(f.start(0, .5), 0, 2.5);
  expect(f.local(stopped).z).toBeLessThan(1.25);
  expect(f.local(stopped).y).toBeCloseTo(2.2, 1);
  expect(stopped.grounded).toBe(true);
  expect(f.local(f.walk(stopped, 0, .5)).z).toBeCloseTo(.5, 2);
});

it('walks off a legacy Survey post guard-top save without remaining airborne', () => {
  const f = fixture(surveyPost().parts), rail = f.start(-1,1.44,3.27);
  expect(f.local(rail).y).toBeCloseTo(3.27, 1);
  expect(rail.grounded).toBe(true);
  expect(rail.verticalSpeed).toBe(0);
  expect(f.walk(rail, -1, 2.5).grounded).toBe(true);
  const back = f.walk(rail, -1, 1);
  expect(f.local(back).z).toBeCloseTo(1, 2);
  expect(f.local(back).y).toBeCloseTo(2.2, 1);
});


it('replays legacy guard-top movement on the server and recovers an old suspended save without moving its identity', () => {
  const store = openStore(':memory:');
  try {
    store.create('owner', 0);
    const planet = store.universe('owner').planets.find(p => p.kind === 'garden' && p.radius === 12)!;
    store.claim('owner', planet.id); store.visit('owner', planet.id);
    const dir: Vec3 = normalize([.55, 1, .4]);
    const blueprint = surveyPost(), entry = store.saveBlueprint('owner', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: 0 });
    store.createObject('owner', { planetId: planet.id, objectId: randomUUID(), kind: 'structure', blueprintHash: entry.hash, position: dir, rotation: 0 });
    const f = fixture(blueprint.parts, planet.radius, dir), start = f.start(-1, 1.44, 3.27);
    store.state('owner');
    store.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(start.position), 'owner');
    store.db.prepare('UPDATE ground_states SET position=?,radius=?,vertical_speed=0,grounded=1,jump_held=0 WHERE player_id=?').run(JSON.stringify(start.position), start.radius, 'owner');
    let state = store.state('owner'), pose = start, time = 0, batch: MotionStep[] = [];
    const flush = () => {
      if (!batch.length) return;
      state = store.move('owner', batch.at(-1)!.slice(0, 3) as Vec3, time, planet.id,
        { physicsVersion: PHYSICS_VERSION, sequence: state.ground!.sequence + 1, steps: batch });
      expect(state.ground!.radius).toBeCloseTo(pose.radius, 4);
      expect(state.ground!.grounded).toBe(pose.grounded);
      batch = [];
    };
    for (let i = 0; i < 100; i++) {
      pose = f.walk(pose, -1, 1.44, 1);
      time += FIXED_STEP * 1000;
      batch.push([...pose.position.map(n => Number(n.toFixed(7))), FIXED_STEP, 0] as MotionStep);
      if (batch.length === 20) flush();
    }
    flush();
    expect(state.ground!.grounded).toBe(true);
    expect(f.local(pose).y).toBeCloseTo(3.27, 1);
    expect(() => store.move('owner', state.position, time + 100, planet.id,
      { physicsVersion: PHYSICS_VERSION - 1, sequence: state.ground!.sequence + 1, steps: [[...state.position, FIXED_STEP]] })).toThrow('Reload');

    // Only this in-memory fixture is changed to the previous saved physics version.
    const before = store.state('owner'), contents = store.universe('owner').currentPlanet.objects;
    store.db.prepare('UPDATE ground_states SET radius=radius+0.001,vertical_speed=-0.8,grounded=0,physics_version=? WHERE player_id=?').run(PHYSICS_VERSION - 1, 'owner');
    const recovered = store.state('owner');
    expect(recovered.position).toEqual(before.position);
    expect(recovered.character).toBe(before.character);
    expect(recovered.quest).toBe(before.quest);
    // Existing compatibility deliberately preserves a valid airborne pose on read.
    expect(recovered.ground).toMatchObject({ grounded: false, verticalSpeed: -.8, physicsVersion: PHYSICS_VERSION });
    const settled = store.move('owner', recovered.position, time + 100, planet.id,
      { physicsVersion: PHYSICS_VERSION, sequence: recovered.ground!.sequence + 1, steps: [[...recovered.position, FIXED_STEP]] });
    expect(settled.position).toEqual(before.position);
    expect(settled.ground).toMatchObject({ grounded: true, verticalSpeed: 0 });
    expect(store.universe('owner').currentPlanet.objects).toEqual(contents);
  } finally { store.close(); }
});
