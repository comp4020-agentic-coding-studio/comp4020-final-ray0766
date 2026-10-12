import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { CameraShipCollision } from '../src/client/camera-ship-collision.ts';
import { createShipModel } from '../src/assets/claude-geometry/ship/factory.ts';
import { STARTERS } from '../src/assets/claude-geometry/ship/design.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';

const identity = new T.Matrix4();
function shipFixture(index = 0) {
  const library = new StyleLibrary('medium', { look: 'village', scans: false });
  const model = createShipModel(STARTERS[index], library, 'medium', { decal: () => new T.Texture() });
  model.setThrust(0); model.object.updateMatrixWorld(true);
  const solid = model.object.getObjectByName('hull-structure')!;
  const meshes: T.Mesh[] = []; solid.traverse(node => { if (node instanceof T.Mesh) meshes.push(node); });
  return { library, model, meshes, dispose() { model.dispose(); library.dispose(); } };
}
function vertices(meshes: T.Mesh[]) {
  const points: T.Vector3[] = [];
  for (const mesh of meshes) {
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) points.push(new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  }
  return points;
}
// Independent signed solid angle of the actual hull triangles. Used only to
// establish the one recorded start-inside counterexample, not as a runtime
// universal watertightness assumption for arbitrary decorative ship geometry.
function windingAt(meshes: T.Mesh[], point: T.Vector3) {
  let sum = 0;
  for (const mesh of meshes) {
    const p = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
    const count = indices?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(p, indices ? indices.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld).sub(point));
      const denominator = a.length() * b.length() * c.length() + a.dot(b) * c.length() + b.dot(c) * a.length() + c.dot(a) * b.length();
      sum += 2 * Math.atan2(a.dot(b.clone().cross(c)), denominator);
    }
  }
  return sum / (4 * Math.PI);
}
// Frozen old five-ray method retained as evidence, not used to validate the
// new guard. It does not mutate material sides, root geometry or collisions.
function oldFiveRay(root: T.Object3D, start: T.Vector3, end: T.Vector3, radius: number) {
  const delta = end.clone().sub(start), length = delta.length(); if (length < 1e-8) return 0;
  let limit = length;
  if (!new T.Box3().setFromObject(root).intersectsBox(new T.Box3().setFromPoints([start, end]).expandByScalar(radius))) return limit;
  const direction = delta.divideScalar(length), right = new T.Vector3().crossVectors(direction, start.clone().normalize());
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
  const vertical = new T.Vector3().crossVectors(right, direction).normalize(), raycaster = new T.Raycaster(); raycaster.far = length;
  for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    raycaster.set(start.clone().addScaledVector(right, x * radius).addScaledVector(vertical, y * radius), direction);
    const hit = raycaster.intersectObject(root, true).find(h => h.object instanceof T.Mesh);
    if (hit) limit = Math.min(limit, Math.max(0, hit.distance - radius));
  }
  return limit;
}

describe('parked ship camera-only conservative solid envelope', () => {
  it('keeps the actual closed-hull start-inside five-ray counterexample blocked', () => {
    const f = shipFixture();
    try {
      const inside = new T.Vector3(0, -.04, -.9), end = inside.clone().add(new T.Vector3(0, .001, 0));
      expect(Math.abs(windingAt(f.meshes, inside))).toBeGreaterThan(.5);
      expect(oldFiveRay(f.model.object, inside, end, .2)).toBeCloseTo(.001, 12);
      const guard = new CameraShipCollision(); guard.update(f.model.bounds, identity);
      expect(guard.distance(inside, end, .2)).toBe(0);
      expect(guard.distance(inside, end, 0)).toBe(0);
    } finally { f.dispose(); }
  });

  it.each([0, 1, 2])('encloses every real solid vertex for saved starter %i without including thrust effects', index => {
    const f = shipFixture(index);
    try {
      const guard = new CameraShipCollision(), bounds = f.model.bounds.clone(), points = vertices(f.meshes);
      expect(points.length).toBeGreaterThan(100); expect(points.every(p => bounds.containsPoint(p))).toBe(true);
      guard.update(f.model.bounds, identity);
      for (let i = 0; i < points.length; i += 37) {
        const p = points[i]; expect(guard.distance(p, p.clone().add(new T.Vector3(.001, .001, 0)), .2)).toBe(0);
      }
      f.model.setThrust(1); f.model.setNavLights(true);
      expect(f.model.bounds.equals(bounds)).toBe(true); // Factory bounds were measured before these effect meshes.
      const far = bounds.max.clone().addScalar(3), end = far.clone().add(new T.Vector3(0, .1, 0));
      expect(guard.distance(far, end, .2)).toBeCloseTo(.1, 12);
    } finally { f.dispose(); }
  });

  it('distinguishes a .2 endpoint sphere from the optical centre and clips a full crossing in both directions', () => {
    const f = shipFixture();
    try {
      const guard = new CameraShipCollision(), b = f.model.bounds, center = b.getCenter(new T.Vector3()); guard.update(b, identity);
      const near = new T.Vector3(b.max.x + .19, center.y, center.z), nearEnd = near.clone().add(new T.Vector3(0, .001, 0));
      expect(guard.distance(near, nearEnd, 0)).toBeCloseTo(.001, 12); expect(guard.distance(near, nearEnd, .2)).toBe(0);
      const clear = near.clone().setX(b.max.x + .201), clearEnd = clear.clone().add(new T.Vector3(0, .001, 0));
      expect(guard.distance(clear, clearEnd, .2)).toBeCloseTo(.001, 12);
      const a = center.clone().setX(b.min.x - 1), z = center.clone().setX(b.max.x + 1);
      expect(guard.distance(a, z, .2)).toBeCloseTo(.8, 10); expect(guard.distance(z, a, .2)).toBeCloseTo(.8, 10);
      a.y = z.y = b.max.y + .201; expect(guard.distance(a, z, .2)).toBeCloseTo(a.distanceTo(z), 10);
    } finally { f.dispose(); }
  });

  it.each([
    [[1, 1, 1], [.3, .7, -.2]], [[2, .5, 1.25], [-.8, .4, .6]], [[-.6, 1.8, .75], [.9, -.5, .2]],
  ] as const)('preserves world .2 radius under translated rotated scale %j', (scale, angles) => {
    const f = shipFixture();
    try {
      const matrix = new T.Matrix4().compose(new T.Vector3(8, 17, -11), new T.Quaternion().setFromEuler(new T.Euler(...angles)), new T.Vector3(...scale));
      const guard = new CameraShipCollision(), before = f.model.bounds.clone(); guard.update(f.model.bounds, matrix);
      const points = vertices(f.meshes), sphereDirections = [new T.Vector3(1, 0, 0), new T.Vector3(0, -1, 0), new T.Vector3(0, 0, 1), new T.Vector3(1, 2, -3).normalize()];
      // Every query centre here is at most .19 world metres from a genuine
      // ship vertex: a .2 sphere must never be falsely reported clear.
      for (let i = 0; i < points.length; i += 137) for (const d of sphereDirections) {
        const p = points[i].clone().applyMatrix4(matrix).addScaledVector(d, .19);
        expect(guard.distance(p, p.clone().addScaledVector(d, .001), .2)).toBe(0);
      }
      const normal = new T.Vector3(1, 0, 0).applyNormalMatrix(new T.Matrix3().getNormalMatrix(matrix)).normalize();
      const face = f.model.bounds.getCenter(new T.Vector3()).setX(f.model.bounds.max.x).applyMatrix4(matrix);
      const near = face.clone().addScaledVector(normal, .19), clear = face.clone().addScaledVector(normal, .201);
      expect(guard.distance(near, near.clone().addScaledVector(normal, .001), .2)).toBe(0);
      expect(guard.distance(clear, clear.clone().addScaledVector(normal, .001), .2)).toBeCloseTo(.001, 10);
      expect(f.model.bounds.equals(before)).toBe(true);
    } finally { f.dispose(); }
  });

  it('copies design and matrix inputs, follows replacements and rejects invalid snapshots instead of reusing stale bounds', () => {
    const a = shipFixture(0), b = shipFixture(1);
    try {
      const guard = new CameraShipCollision(), initial = a.model.bounds.getCenter(new T.Vector3()), step = new T.Vector3(.001, 0, 0);
      expect(guard.distance(initial, initial.clone().add(step), .2)).toBe(0);
      const bounds = a.model.bounds.clone(), matrix = new T.Matrix4(); guard.update(bounds, matrix);
      bounds.translate(new T.Vector3(100, 0, 0)); matrix.makeTranslation(200, 0, 0);
      expect(guard.distance(initial, initial.clone().add(step), .2)).toBe(0);
      const translated = new T.Matrix4().makeTranslation(30, 0, 0); guard.update(b.model.bounds, translated);
      expect(guard.distance(initial, initial.clone().add(step), .2)).toBeCloseTo(.001, 12);
      const current = b.model.bounds.getCenter(new T.Vector3()).applyMatrix4(translated);
      expect(guard.distance(current, current.clone().add(step), .2)).toBe(0);
      for (const bad of [new T.Matrix4().makeScale(0, 1, 1), new T.Matrix4().set(...Array(16).fill(NaN) as Parameters<T.Matrix4['set']>)]) {
        guard.update(b.model.bounds, bad); expect(guard.distance(initial, initial.clone().add(step), .2)).toBe(0);
      }
      guard.update(new T.Box3(), identity); expect(guard.distance(initial, initial.clone().add(step), .2)).toBe(0);
      guard.update(a.model.bounds, identity);
      for (const radius of [-.2, NaN, Infinity]) expect(guard.distance(initial, initial.clone().add(step), radius)).toBe(0);
      expect(guard.distance(new T.Vector3(NaN, 0, 0), initial, .2)).toBe(0);
    } finally { a.dispose(); b.dispose(); }
  });
});
