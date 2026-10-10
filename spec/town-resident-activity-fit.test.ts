import { expect, it } from 'vitest';
import * as T from 'three';
import { TownResidents } from '../src/client/town-residents.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { townResidents } from '../src/shared/town-residents.ts';
import { townWorksite } from '../src/shared/town-worksite-blueprints.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import type { Vec3 } from '../src/shared/world.ts';

// Inspect the actual production primitive transforms, rather than testing the
// chosen shoulder angles against themselves. These ordinary kit surfaces are
// finite; a hand floating beside the edge must not count as a working contact.
interface RigProbe {
  anchor: T.Group; body: T.Group; head: T.Group;
  leftArm: T.Group; rightArm: T.Group; leftForearm: T.Group; rightForearm: T.Group;
  workTool?: T.Group; wateringCan?: T.Group; water?: T.Object3D; sortingPaper?: T.Group;
  pieces: { node: T.Object3D; shape: string }[];
}
const geometries: Record<string, T.BufferGeometry> = {
  box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(.5, 10, 8),
  cylinder: new T.CylinderGeometry(.5, .5, 1, 8), cone: new T.ConeGeometry(.5, 1, 8),
};
function fixture(id: string, kind: 'repair' | 'counter' | 'garden', at: Vec3) {
  const radius = 21.6, position: Vec3 = [0, 1, 0], parts = townWorksite(kind).parts;
  const object = { id: 'actual-work-fixture', kind: 'structure' as const, position, rotation: 0, version: 1, blueprintHash: 'work', ...structureSize(parts) };
  const fit = structureFit(parts, position, 0, fieldOf(undefined, radius));
  const world = new GroundWorld({ id: 'activity-fit', revision: 0, radius, objects: [object], blueprints: { work: parts } });
  const definition = { ...townResidents().find(d => d.id === id)!, position: localToDir({ dir: position, yaw: 0 }, fit.baseRadius, at), facing: localToDir({ dir: position, yaw: 0 }, fit.baseRadius, [at[0], 0, -.18]) };
  const crowd = new TownResidents(new T.Group(), world, [definition]);
  const rig = (crowd as unknown as { residents: { rig: RigProbe }[] }).residents[0].rig;
  const camera = new T.PerspectiveCamera(65, 1, .05, 100), up = new T.Vector3(...definition.position), feet = up.clone().multiplyScalar(crowd.positions()[0].radius);
  camera.up.copy(up); camera.position.copy(feet).addScaledVector(up, 2).add(new T.Vector3(2, 0, 2)); camera.lookAt(feet.clone().addScaledVector(up, .9));
  const frame = (time: number) => crowd.update({ dt: .05, time, viewer: definition.position, camera, reducedMotion: false });
  const local = (point: T.Vector3) => point.sub(new T.Vector3(0, fit.baseRadius, 0));
  const vertices = (piece: RigProbe['pieces'][number]) => {
    const attribute = geometries[piece.shape].attributes.position;
    return Array.from({ length: attribute.count }, (_, i) => local(new T.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(piece.node.matrixWorld)));
  };
  expect(crowd.positions()[0].valid).toBe(true);
  return { crowd, rig, frame, local, vertices };
}

it('keeps all three repairers at metre scale and brings a real held tool over the finite ordinary counter', () => {
  for (const [id, kind, x] of [['ivo-repair', 'repair', -.5], ['repair-apprentice', 'counter', 0], ['south-maker', 'repair', -.5]] as const) {
    const scene = fixture(id, kind, [x, 0, .55]);
    try {
      const head = scene.rig.pieces.find(p => p.node.parent === scene.rig.workTool && p.node.position.z > .2)!;
      expect(head, `${id} requires a real held tool, including the apron-wearing maker`).toBeDefined();
      let nearest = Infinity, highest = -Infinity;
      for (let i = 0; i <= 120; i++) {
        scene.frame(i * .05);
        const vertices = scene.vertices(head), bottom = Math.min(...vertices.map(p => p.y));
        nearest = Math.min(nearest, bottom - .9); highest = Math.max(highest, bottom - .9);
        expect(bottom, `${id} tool may not cut through the counter`).toBeGreaterThanOrEqual(.899);
        expect(Math.min(...vertices.map(p => p.x))).toBeGreaterThan(x - .341);
        expect(Math.max(...vertices.map(p => p.x))).toBeLessThan(x + .341);
        expect(Math.min(...vertices.map(p => p.z))).toBeGreaterThan(-.364);
        expect(Math.max(...vertices.map(p => p.z))).toBeLessThan(-.034);
        for (const node of [scene.rig.anchor, scene.rig.body, scene.rig.head, scene.rig.leftArm, scene.rig.rightArm, scene.rig.leftForearm, scene.rig.rightForearm]) expect(node.scale.toArray()).toEqual([1, 1, 1]);
        expect(scene.rig.rightForearm.position.y).toBe(-.25);
      }
      expect(nearest).toBeLessThan(.025);
      expect(highest - nearest, 'A working cycle should lift the tool between strokes').toBeGreaterThan(.02);
      scene.frame(1.25); const beforeGreeting = scene.vertices(head).map(p => p.toArray());
      scene.crowd.greet(id, 1.25); scene.frame(1.25);
      expect(scene.vertices(head).map(p => p.toArray()), 'Greeting uses the free hand; a tool must not sweep toward the face').toEqual(beforeGreeting);
    } finally { scene.crowd.dispose(); }
  }
});

it('gives both gardeners a held can aimed into the actual bed and a stream that reaches its soil', () => {
  for (const id of ['nell-garden', 'garden-helper']) {
    const scene = fixture(id, 'garden', [-.5, 0, .95]);
    try {
      scene.frame(1.25);
      expect(scene.rig.wateringCan).toBeDefined(); expect(scene.rig.water).toBeDefined();
      const mouth = scene.local(scene.rig.wateringCan!.localToWorld(new T.Vector3(.10, -.04, .33)));
      const end = scene.local(scene.rig.water!.localToWorld(new T.Vector3(0, .5, 0)));
      for (const point of [mouth, end]) {
        expect(point.x).toBeGreaterThan(-.76); expect(point.x).toBeLessThan(-.24);
        expect(point.z).toBeGreaterThan(-.26); expect(point.z).toBeLessThan(.26);
      }
      expect(mouth.y).toBeGreaterThan(.6);
      expect(end.y).toBeLessThanOrEqual(.265); expect(end.y).toBeGreaterThan(.19);
      expect(scene.rig.leftForearm.position.y).toBe(-.25);
    } finally { scene.crowd.dispose(); }
  }
});

it('sorts a real held letter over the counter edge without stretching arms or changing identity text', () => {
  const before = JSON.stringify(townResidents()), scene = fixture('pax-courier', 'counter', [0, 0, .47]);
  try {
    const paper = scene.rig.pieces.find(p => p.node.parent === scene.rig.sortingPaper && p.node.scale.y > .005)!;
    expect(paper).toBeDefined(); let low = Infinity, high = -Infinity;
    for (let i = 0; i <= 120; i++) {
      scene.frame(i * .05); const points = scene.vertices(paper), bottom = Math.min(...points.map(p => p.y));
      low = Math.min(low, bottom); high = Math.max(high, bottom);
      expect(bottom).toBeGreaterThanOrEqual(.899);
      expect(Math.min(...points.map(p => p.z))).toBeLessThan(-.07);
      expect(Math.max(...points.map(p => Math.abs(p.x)))).toBeLessThan(.34);
    }
    expect(low - .9).toBeLessThan(.025); expect(high - low).toBeGreaterThan(.009);
    expect(JSON.stringify(townResidents())).toBe(before);
  } finally { scene.crowd.dispose(); }
});
