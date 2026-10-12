import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { createCameraAvatarShadowTest } from '../src/client/camera-avatar-shadow.ts';
import type { CameraAvatarPoint, CameraAvatarShadowCollider, CameraFrameAvatarBound } from '../src/client/camera-avatar-shadow.ts';

const v = (p: readonly number[]) => new Vector3(p[0], p[1], p[2]);
const pose = { eye: new Vector3(), direction: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) };
function bound(min: CameraAvatarPoint, max: CameraAvatarPoint, label = 'body'): CameraFrameAvatarBound {
  const corners: CameraAvatarPoint[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  return { label, corners };
}
function collider(min: CameraAvatarPoint, max: CameraAvatarPoint): CameraAvatarShadowCollider {
  return { center: v(min).add(v(max)).multiplyScalar(.5), half: v(max).sub(v(min)).multiplyScalar(.5), q: new Quaternion() };
}
function colliderCorners(c: CameraAvatarShadowCollider) {
  const points: Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new Vector3(x * c.half.x, y * c.half.y, z * c.half.z).applyQuaternion(c.q).add(c.center));
  return points;
}
// Independent complete convex-hull SAT reference: hull faces, blocker faces,
// and every hull-edge/blocker-edge cross. The product builds no convex hull.
function referenceGap(eye: Vector3, body: CameraFrameAvatarBound, c: CameraAvatarShadowCollider) {
  const shadow = [new Vector3(), ...body.corners.map(p => v(p).sub(eye))], blocker = colliderCorners(c).map(p => p.sub(eye));
  const hull = new ConvexHull().setFromPoints(shadow);
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map(a => a.applyQuaternion(c.q));
  const candidates = [...axes];
  for (const face of hull.faces) {
    candidates.push(face.normal.clone());
    let edge = face.edge;
    do {
      const delta = edge.head().point.clone().sub(edge.tail().point);
      for (const axis of axes) candidates.push(new Vector3().crossVectors(delta, axis));
      edge = edge.next;
    } while (edge !== face.edge);
  }
  let gap = -Infinity;
  for (const candidate of candidates) {
    if (candidate.lengthSq() <= 1e-20) continue;
    const axis = candidate.clone().normalize(), one = shadow.map(p => p.dot(axis)), two = blocker.map(p => p.dot(axis));
    gap = Math.max(gap, Math.min(...one) - Math.max(...two), Math.min(...two) - Math.max(...one));
  }
  return gap;
}
const body = bound([1, -.1, 2], [2, .1, 4]);

describe('finite actual-avatar shadow separation', () => {
  it('clears depth-coupled 2D overlap only when the complete 3D shadow separates', () => {
    const c = collider([2.1, -.01, 3], [2.2, .01, 3.1]);
    // Projected x/z ranges overlap and global z intervals overlap. Yet every
    // eye/body-hull point has x <= 2 while every blocker point has x >= 2.1.
    expect(2.1 / 3.1).toBeLessThan(2 / 2);
    expect(2.2 / 3).toBeGreaterThan(1 / 4);
    expect(referenceGap(pose.eye, body, c)).toBeGreaterThan(.099);
    expect(createCameraAvatarShadowTest(pose, [body])(c)).toBe(true);
  });

  it.each([
    [[1.45, -.02, 2.9], [1.55, .02, 3.1]],
    [[.74, -.02, 1.49], [.76, .02, 1.51]],
    [[-.01, -.01, -.01], [.01, .01, .01]],
  ] as [CameraAvatarPoint, CameraAvatarPoint][])('retains foreground/body/eye contact at %j', (min, max) => {
    const c = collider(min, max);
    expect(referenceGap(pose.eye, body, c)).toBeLessThanOrEqual(1e-7);
    expect(createCameraAvatarShadowTest(pose, [body])(c)).toBe(false);
  });

  it('requires a proof for every avatar box, not one separated mesh', () => {
    const c = collider([2.1, -.01, 3], [2.2, .01, 3.1]);
    const second = bound([2, -.1, 2.9], [2.3, .1, 3.2], 'other-visible-mesh');
    expect(createCameraAvatarShadowTest(pose, [body])(c)).toBe(true);
    expect(createCameraAvatarShadowTest(pose, [body, second])(c)).toBe(false);
    expect(createCameraAvatarShadowTest(pose, [second, body])(c)).toBe(false);
  });

  it.each([0, 5e-8])('keeps touching or sub-epsilon separation conservative (%s)', gap => {
    const c = collider([2 + gap, -.01, 3.9], [2.1, .01, 4.1]);
    expect(referenceGap(pose.eye, body, c)).toBeLessThanOrEqual(1e-7);
    expect(createCameraAvatarShadowTest(pose, [body])(c)).toBe(false);
  });

  it('preserves complete-behind-eye and crossing-blocker side-plane proofs', () => {
    expect(createCameraAvatarShadowTest(pose, [body])(collider([-1, -1, -2], [1, 1, -1]))).toBe(true);
    expect(createCameraAvatarShadowTest(pose, [body])(collider([3, -.1, -.1], [3.1, .1, .1]))).toBe(true);
  });

  it('does not resolve invalid, degenerate or eye-plane avatar data by a shortcut', () => {
    const c = collider([3, -.1, -.1], [3.1, .1, .1]);
    const invalid = [[], [bound([1, -.1, 0], [2, .1, 4])], [bound([1, 0, 2], [2, 0, 4])],
      [{ ...body, corners: body.corners.slice(0, 7) }],
      [{ ...body, corners: body.corners.map((p, i) => i ? p : [NaN, p[1], p[2]] as const) }]];
    for (const boxes of invalid) expect(createCameraAvatarShadowTest(pose, boxes)(c)).toBe(false);
    expect(createCameraAvatarShadowTest({ ...pose, direction: new Vector3() }, [body])(c)).toBe(false);
    expect(createCameraAvatarShadowTest({ ...pose, up: pose.direction }, [body])(c)).toBe(false);
    expect(createCameraAvatarShadowTest({ ...pose, eye: new Vector3(Infinity, 0, 0) }, [body])(c)).toBe(false);
  });

  it('rejects nonfinite/degenerate collider data and invalid quaternions', () => {
    const c = collider([2.1, -.01, 3], [2.2, .01, 3.1]);
    for (const invalid of [{ ...c, center: new Vector3(NaN, 0, 3) }, { ...c, half: new Vector3(0, 1, 1) },
      { ...c, half: new Vector3(-1, 1, 1) }, { ...c, q: new Quaternion(0, 0, 0, 0) },
      { ...c, q: new Quaternion(0, 0, 0, 2) }, { ...c, q: new Quaternion(NaN, 0, 0, 1) }]) {
      expect(createCameraAvatarShadowTest(pose, [body])(invalid)).toBe(false);
    }
  });

  it('keeps strict separation and real obstruction invariant under rigid world transforms', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.17), offset = new Vector3(-7, -19, -13);
    const world = (p: Vector3) => p.applyQuaternion(q).add(offset);
    const transformedPose = { eye: offset, direction: pose.direction.clone().applyQuaternion(q), up: pose.up.clone().applyQuaternion(q) };
    const transformedBody = { ...body, corners: body.corners.map(p => world(v(p)).toArray()) };
    for (const [c, clear] of [[collider([2.1, -.01, 3], [2.2, .01, 3.1]), true],
      [collider([.74, -.02, 1.49], [.76, .02, 1.51]), false]] as const) {
      const transformed = { center: world(c.center.clone()), half: c.half, q: q.clone().multiply(c.q) };
      expect(createCameraAvatarShadowTest(transformedPose, [transformedBody])(transformed)).toBe(clear);
    }
  });

  it('agrees with independent full SAT for captured actual19 and continuous42 at the held old pose', () => {
    const data = JSON.parse(readFileSync(new URL('./fixtures/camera-avatar-shadow-back.json', import.meta.url), 'utf8')) as {
      scope: string; actual19: CameraFrameAvatarBound[]; envelope42: CameraFrameAvatarBound[];
      pose: { eye: number[]; direction: number[]; up: number[] };
      colliders: { center: number[]; half: number[]; q: [number, number, number, number] }[];
    };
    expect(data.scope).toContain('not an exact failure replay');
    expect(data.actual19).toHaveLength(19); expect(data.envelope42).toHaveLength(42);
    const actualPose = { eye: v(data.pose.eye), direction: v(data.pose.direction), up: v(data.pose.up) };
    for (const bounds of [data.actual19, data.envelope42]) {
      for (const row of data.colliders) {
        const c = { center: v(row.center), half: v(row.half), q: new Quaternion(...row.q) };
        expect(createCameraAvatarShadowTest(actualPose, bounds)(c)).toBe(true);
        for (const b of bounds) expect(referenceGap(actualPose.eye, b, c)).toBeGreaterThan(.35);
      }
      // A small real blocker on the line to a visible mesh must still reject
      // even though every other mesh may admit a different separating axis.
      const center = bounds[0].corners.reduce((sum, p) => sum.add(v(p)), new Vector3()).multiplyScalar(1 / 8);
      center.lerp(actualPose.eye, .5);
      const obstruction = { center, half: new Vector3(.015, .015, .015), q: new Quaternion() };
      expect(createCameraAvatarShadowTest(actualPose, bounds)(obstruction)).toBe(false);
    }
  });
});
