import { Vector3 } from 'three';
import type { Quaternion } from 'three';

export type CameraAvatarPoint = readonly [number, number, number];
export interface CameraFrameAvatarBound { label: string; corners: readonly CameraAvatarPoint[] }
export interface CameraAvatarShadowPose { eye: Vector3; direction: Vector3; up: Vector3 }
export interface CameraAvatarShadowCollider { center: Vector3; half: Vector3; q: Quaternion }
// Only pose-independent world OBB geometry is cached. Every numerical
// collider component is compared, even when its Vector/Quaternion identity
// is unchanged. Projection and all strict support tests remain per pose.
const colliderGeometry = new WeakMap<CameraAvatarShadowCollider, {
  signature: number[]; corners: CameraAvatarPoint[]; axes: Vector3[];
}>();
function colliderWorldGeometry(collider: CameraAvatarShadowCollider) {
  const signature = [collider.center.x, collider.center.y, collider.center.z,
    collider.half.x, collider.half.y, collider.half.z, collider.q.x, collider.q.y, collider.q.z, collider.q.w];
  const cached = colliderGeometry.get(collider);
  if (cached && signature.every((v, i) => Object.is(v, cached.signature[i]))) return cached;
  const corners: CameraAvatarPoint[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new Vector3(x * collider.half.x, y * collider.half.y, z * collider.half.z)
    .applyQuaternion(collider.q).add(collider.center).toArray());
  if (corners.some(corner => !corner.every(Number.isFinite))) return null;
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
    .map(axis => axis.applyQuaternion(collider.q).normalize());
  const result = { signature, corners, axes }; colliderGeometry.set(collider, result); return result;
}
const point = (p: CameraAvatarPoint) => new Vector3(...p);
const SHADOW_EPSILON = 1e-7;
const finiteVector = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Corners use the same x/y/z nested order as the actual mesh bounds. */
function boxEdges(corners: readonly Vector3[]) {
  const edges = [4, 2, 1].map(index => corners[index].clone().sub(corners[0]));
  if (edges.some(edge => !finiteVector(edge) || edge.lengthSq() <= 1e-20)) return null;
  edges.forEach(edge => edge.normalize());
  return Math.abs(edges[0].dot(new Vector3().crossVectors(edges[1], edges[2]))) > 1e-10 ? edges : null;
}

/** Any strict support-interval separation is sufficient. We intentionally use
 * only a small finite set of axes: failure to find one remains blocked. All
 * nine shadow vertices include the eye; testing only the avatar box could
 * incorrectly admit a real foreground occluder. Coordinates are eye-relative. */
function finiteShadowDisjoint(body: { corners: Vector3[]; shadowEdges: Vector3[]; faceNormals: Vector3[] },
  blockerCorners: readonly Vector3[], blockerAxes: readonly Vector3[]) {
  const separated = (axis: Vector3) => {
    if (!finiteVector(axis) || axis.lengthSq() <= 1e-20) return false;
    const normal = axis.clone().normalize();
    let shadowMin = 0, shadowMax = 0, blockerMin = Infinity, blockerMax = -Infinity;
    for (const corner of body.corners) {
      const projection = corner.dot(normal);
      shadowMin = Math.min(shadowMin, projection); shadowMax = Math.max(shadowMax, projection);
    }
    for (const corner of blockerCorners) {
      const projection = corner.dot(normal);
      blockerMin = Math.min(blockerMin, projection); blockerMax = Math.max(blockerMax, projection);
    }
    return blockerMin > shadowMax + SHADOW_EPSILON || shadowMin > blockerMax + SHADOW_EPSILON;
  };
  if (blockerAxes.some(separated) || body.faceNormals.some(separated)) return true;
  // At most 3 + 3 + 3*(3 + 8) = 39 axes. These include box edges and the
  // eye-to-corner edges of the finite shadow hull, without building that hull.
  return blockerAxes.some(axis => body.shadowEdges.some(edge => separated(new Vector3().crossVectors(axis, edge))));
}

/** Shared selection/certification test. True proves no avatar-box shadow
 * overlap; false includes unresolved near-plane cases and must not be treated
 * as evidence that a selected part's complete rendered volume is cut. */
type Point2 = readonly [number, number];
function convexHull(points: Point2[]): Point2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const chain = (rows: Point2[]) => { const out: Point2[] = []; for (const p of rows) {
    while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop(); out.push(p);
  } return out; };
  return [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
}
function polygonsDisjoint(a: readonly Point2[], b: readonly Point2[]) {
  if (a.length < 3 || b.length < 3) return false;
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis: Point2 = [p[1] - q[1], q[0] - p[0]];
    const project = (points: readonly Point2[]) => points.map(v => v[0] * axis[0] + v[1] * axis[1]);
    const one = project(a), two = project(b);
    if (Math.max(...one) < Math.min(...two) - 1e-9 || Math.max(...two) < Math.min(...one) - 1e-9) return true;
  }
  return false;
}
/** Perspective projection of a convex box is the convex hull of its vertices
 * when the complete box is in front of the eye. A crossing blocker requires
 * a strict 3D side-plane proof; unresolved near-plane cases remain blocked. */
export function createCameraAvatarShadowTest(proposal: CameraAvatarShadowPose, boxes: readonly CameraFrameAvatarBound[]) {
  if (![proposal.eye, proposal.direction, proposal.up].every(finiteVector) || proposal.direction.lengthSq() <= 1e-20
    || !boxes.length || boxes.some(box => box.corners.length !== 8
      || box.corners.some(corner => corner.length !== 3 || !corner.every(Number.isFinite)))) return () => false;
  const forward = proposal.direction.clone().normalize(), right = new Vector3().crossVectors(forward, proposal.up);
  if (!finiteVector(right) || right.lengthSq() <= 1e-20) return () => false;
  right.normalize();
  const vertical = new Vector3().crossVectors(right, forward).normalize();
  const project = (corners: readonly CameraAvatarPoint[]) => {
    let near = Infinity, far = -Infinity;
    const points = corners.map(corner => { const p = point(corner).sub(proposal.eye), depth = p.dot(forward);
      near = Math.min(near, depth); far = Math.max(far, depth);
      return [p.dot(right) / depth, p.dot(vertical) / depth] as const;
    });
    return { near, far, polygon: near > 1e-7 ? convexHull(points) : [] };
  };
  const projected = boxes.map(box => {
    const body = project(box.corners), corners = box.corners.map(corner => point(corner).sub(proposal.eye));
    const edges = boxEdges(corners);
    const faceNormals = edges ? [new Vector3().crossVectors(edges[1], edges[2]),
      new Vector3().crossVectors(edges[2], edges[0]), new Vector3().crossVectors(edges[0], edges[1])] : [];
    // A positive-depth avatar box defines a convex cone from the eye. Its
    // side planes can separate a complete blocker OBB even when that OBB
    // crosses the eye plane, where perspective division is not valid.
    const sidePlanes = body.polygon.map((p, i) => {
      const q = body.polygon[(i + 1) % body.polygon.length];
      return right.clone().multiplyScalar(p[1] - q[1])
        .addScaledVector(vertical, q[0] - p[0])
        .addScaledVector(forward, q[1] * p[0] - q[0] * p[1]);
    }).filter(normal => normal.lengthSq() > 1e-20).map(normal => normal.normalize());
    const shadowEdges = [...(edges ?? []), ...corners.map(corner => corner.clone().normalize())];
    return { ...body, sidePlanes, corners, edges, faceNormals, shadowEdges };
  });
  // Empty, invalid, degenerate or eye-plane-crossing avatar bounds cannot
  // establish a conservative view shadow; do not let a legacy shortcut pass.
  if (projected.some(body => !body.edges || !Number.isFinite(body.near) || !Number.isFinite(body.far) || body.near <= SHADOW_EPSILON
    || !body.corners.every(finiteVector))) return () => false;
  return (collider: CameraAvatarShadowCollider) => {
    if (![collider.center, collider.half].every(finiteVector)
      || collider.half.x <= 0 || collider.half.y <= 0 || collider.half.z <= 0
      || !collider.q.toArray().every(Number.isFinite) || Math.abs(collider.q.lengthSq() - 1) > 1e-6) return false;
    const geometry = colliderWorldGeometry(collider); if (!geometry) return false;
    const { corners, axes: blockerAxes } = geometry;
    const blocker = project(corners);
    if (blocker.far < 0) return true;
    const relativeCorners = corners.map(corner => point(corner).sub(proposal.eye));
    if (!relativeCorners.every(finiteVector)) return false;
    return projected.every(body => blocker.near > body.far + 1e-7
      || (body.near > 1e-7 && blocker.near > 1e-7 && polygonsDisjoint(body.polygon, blocker.polygon))
      // Every corner must be strictly outside the same cone side plane.
      // Convexity then proves the complete OBB is outside. Unresolved cases
      // still return false; no near-plane corner is dropped or clipped.
      || (body.near > 1e-7 && blocker.near <= 1e-7
        && body.sidePlanes.some(normal => relativeCorners.every(corner => corner.dot(normal) < -1e-7)))
      // The projected polygon plus one global depth interval can overlap even
      // when the finite 3D shadow and collider do not. Prove separation using
      // all their vertices; no collider/body size or eligibility is changed.
      || finiteShadowDisjoint(body, relativeCorners, blockerAxes));
  };
}

