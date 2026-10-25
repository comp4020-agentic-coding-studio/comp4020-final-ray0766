import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { encodeBlueprint } from '../src/shared/blueprint-codec.ts';
import { GroundWorld, FIXED_STEP, PHYSICS_VERSION, SPRINT_FLAG } from '../src/shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../src/shared/physics/world.ts';
import { distance, normalize, SPEED, SPRINT_SPEED } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { structureFit } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { surveyPost } from '../src/assets/claude-geometry/blueprint/samples.ts';

// The actual Survey post stairs, on both the original and integrated scales.
// Use the client's fixed tick and wire quantization, then replay whole batches
// through the unchanged authoritative speed/collision checks.
it.each([12, 21.6].flatMap(radius => [-2, -1.85].flatMap(x => [0, SPRINT_FLAG].map(flags => ({ radius, x, flags })))))('replays stair descent and the integrated return route within the input speed: %j', ({ radius, x, flags }) => {
  const store = openStore(':memory:');
  try {
    store.create('walker', 0);
    const planet = store.universe('walker').planets.find(p => p.kind === 'garden' && p.radius === 12)!;
    store.db.prepare('UPDATE planets SET world_radius=?,revision=revision+1 WHERE id=?').run(radius, planet.id);
    store.claim('walker', planet.id); store.visit('walker', planet.id);
    const blueprint = surveyPost(), dir = normalize([.55, 1, .4]), anchor = { dir, yaw: 0 };
    const entry = store.saveBlueprint('walker', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: 0 });
    store.createObject('walker', { planetId: planet.id, objectId: randomUUID(), kind: 'structure', blueprintHash: entry.hash, position: dir, rotation: 0 });
    const world = new GroundWorld(store.universe('walker').currentPlanet);
    const base = structureFit(blueprint.parts, dir, 0, fieldOf(null, radius)).baseRadius;
    const inverse = new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
    const at = (z: number, y: number) => localToDir(anchor, base, [x, y, z]);
    const local = (p: GroundPose) => new Vector3(...p.position).multiplyScalar(p.radius)
      .addScaledVector(new Vector3(...dir), -base).applyQuaternion(inverse);
    const position = at(1, 2.2);
    let pose: GroundPose = { position, radius: world.support(position, base + 2.5).radius, verticalSpeed: 0, grounded: true };
    expect(world.blocked(pose)).toBe(false);
    store.state('walker');
    store.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(position), 'walker');
    store.db.prepare('UPDATE ground_states SET position=?,radius=?,vertical_speed=0,grounded=1,jump_held=0 WHERE player_id=?')
      .run(JSON.stringify(position), pose.radius, 'walker');
    let state = store.state('walker'), time = 0, batch: MotionStep[] = [];
    const speed = flags & SPRINT_FLAG ? SPRINT_SPEED : SPEED;
    const flush = () => {
      if (!batch.length) return;
      state = store.move('walker', batch.at(-1)!.slice(0, 3) as Vec3, time, planet.id,
        { physicsVersion: PHYSICS_VERSION, sequence: state.ground!.sequence + 1, steps: batch });
      expect(distance(state.position, pose.position, pose.radius)).toBeLessThan(.003);
      expect(state.ground!.radius).toBeCloseTo(pose.radius, 3);
      batch = [];
    };
    // The old radius-12 fixture has an existing first-riser approach higher
    // than STEP_HEIGHT. The deployed radius supports the full return route.
    for (const destination of radius > 20 ? [-2.8, 1] : [-2.8]) {
      for (let frame = 0; frame < 300; frame++) {
        const before = pose, from = new Vector3(...before.position), to = new Vector3(...at(destination, local(before).y));
        const requested = Math.min(from.angleTo(to), speed * FIXED_STEP / before.radius);
        const axis = new Vector3().crossVectors(from, to).normalize();
        const target = from.clone().applyAxisAngle(axis, requested).normalize().toArray() as Vec3;
        pose = world.move(before, target, FIXED_STEP, flags);
        expect(world.blocked(pose)).toBe(false);
        expect(distance(before.position, pose.position, before.radius)).toBeLessThanOrEqual(speed * FIXED_STEP + .00001);
        const step: MotionStep = [...pose.position.map(v => Number(v.toFixed(7))), Number(FIXED_STEP.toFixed(7)), flags] as MotionStep;
        time += FIXED_STEP * 1000; batch.push(step);
        if (batch.length === 20) flush();
      }
      flush();
      expect(local(pose).z).toBeCloseTo(destination, 1);
      expect(pose.grounded).toBe(true);
      if (destination < 0) expect(pose.radius).toBeCloseTo(world.radius(pose.position), 4);
      else expect(local(pose).y).toBeCloseTo(2.2, 1);
    }
    // The repair must not make a genuinely over-speed input acceptable.
    const from = new Vector3(...state.position), axis = new Vector3(1, 0, 0).cross(from).normalize();
    const tooFar = from.applyAxisAngle(axis, SPEED * FIXED_STEP * 2 / state.ground!.radius).toArray() as Vec3;
    expect(() => store.move('walker', tooFar, time + 1000, planet.id,
      { physicsVersion: PHYSICS_VERSION, sequence: state.ground!.sequence + 1, steps: [[...tooFar, FIXED_STEP]] }))
      .toThrow('Ground movement exceeded the walking speed.');
  } finally { store.close(); }
});
