import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { anchorQuaternion } from '../src/assets/claude-geometry/core/anchor.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { GroundWorld, BODY_HEIGHT } from '../src/shared/physics/world.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { normalize } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';

function wallFixture(position: Vec3, rotation: number, doorway = false) {
  const radius = 21.6;
  const parts: PartPlacement[] = [
    { n: 1, part: 'floor.deck', x: 2, z: 2, rot: 0, level: 0 },
    { n: 2, part: doorway ? 'wall.door.open' : 'wall.solid', x: 2, z: 2, rot: 0, level: 0 },
  ];
  const object = { id: 'ordinary-neighbour', kind: 'structure' as const, position, rotation,
    version: 1, blueprintHash: 'kit', ...structureSize(parts) };
  const fit = structureFit(parts, position, rotation, fieldOf(undefined, radius));
  const turn = new Quaternion().fromArray(anchorQuaternion({ dir: position, yaw: rotation }));
  const world = new GroundWorld({ id: 'camera-fixture', revision: 1, radius, objects: [object], blueprints: { kit: parts } });
  const point = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(turn)
    .addScaledVector(new Vector3(...position), fit.baseRadius);
  return { world, point, radius };
}

it('clips a real neighbour along the camera boom even when its anchor is outside the start-only query', () => {
  for (const position of [[0, 1, 0], [0, -1, 0], normalize([.8, .4, .7])] as Vec3[]) for (const rotation of [0, .7]) {
    const { world, point, radius } = wallFixture(position, rotation);
    const start = point(0, 1.35, 5), end = point(0, 1.35, -1), body = world.bodies[0];
    expect(body.dir.angleTo(start.clone().normalize()) * radius).toBeGreaterThan(body.broad + BODY_HEIGHT * .5);
    expect(start.distanceTo(end)).toBeCloseTo(6, 8);
    // The ordinary wall is centred at z=.5, half depth=.105. Retain the
    // existing .06 camera padding and .08 clearance before its front face.
    expect(world.cameraDistance(start, end)).toBeCloseTo(5 - (.5 + .105 + .06) - .08, 8);
    expect(world.cameraDistance(end, start)).toBeCloseTo(.5 - .105 - .06 + 1 - .08, 8);
  }
});

it('keeps clear sightlines around the neighbour and through an ordinary open door', () => {
  const position = normalize([.8, .4, .7]);
  for (const rotation of [0, .7]) {
    const { world, point } = wallFixture(position, rotation);
    for (const [start, end] of [
      [point(1.2, 1.35, 5), point(1.2, 1.35, -1)], // Beside the wall, inside the coarse body bounds.
      [point(0, 1.35, 5), point(0, 1.35, 1)], // Ends before the wall.
      [point(0, 2.5, 5), point(0, 2.5, -1)], // Above the wall.
    ]) expect(world.cameraDistance(start, end)).toBeCloseTo(start.distanceTo(end), 8);
    const open = wallFixture(position, rotation, true), start = open.point(0, 1.35, 5), end = open.point(0, 1.35, -1);
    expect(open.world.cameraDistance(start, end)).toBeCloseTo(start.distanceTo(end), 8);
  }
});
