import { Box3, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, BufferAttribute, InterleavedBufferAttribute } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import type { CameraFrameAvatarBound } from './camera-avatar-shadow.ts';
import type { CameraCutawayFrameMask, CameraCutawayFramePlan } from './camera-cutaway-plan.ts';

export interface CameraExactAvatarMesh { label: string; geometryId?: string; geometry: BufferGeometry; matrixWorld: Matrix4 }
/** This must be supplied by the issuing controller's authenticated registry,
 * not by a caller constructing selected-mask geometry from collider boxes. */
export interface CameraExactRenderGeometry {
  frameId: number; bindingVersion: number; ready: boolean; reasons: readonly string[];
  parts: readonly { mask: CameraCutawayFrameMask; batches: readonly {
    geometry: BufferGeometry; positions: BufferAttribute | InterleavedBufferAttribute;
    triangleVertexIndices: Uint32Array; matrixWorld: Matrix4; geometryId?: string;
  }[] }[];
}
export interface CameraExactResidualEvidence {
  schema: 'camera-exact-residual-v1'; maskKey: string; covered: boolean; reason: string;
  avatarGeometry: { label: string; geometryId: string; matrixWorld: number[] }[];
  partGeometry: { geometryId: string; matrixWorld: number[]; triangles: number }[];
  triangles: number; intersections: number; planes: number; minimumMargin: number | null;
  elapsedMs: number; hullCacheBuilds: number; shadowCacheHits: number; partCacheBuilds: number; supportExpansion: number; shaderGuard: number; capsuleAuthorized: boolean;
  shadowPlanes: { label: string; geometryId: string; transformError: number; planes: { normal: number[]; offset: number }[] }[];
}
type Plane = { n: Vector3; d: number };
type CachedHull = { position: BufferAttribute | InterleavedBufferAttribute; version: number;
  vertices: Vector3[]; bounds: Box3; centroid: Vector3; planes: Plane[]; edges: { a: Vector3; b: Vector3; faces: [number, number] }[] };
const cache = new WeakMap<BufferGeometry, CachedHull>();
const frameShadows = new WeakMap<CameraCutawayFramePlan, Map<string, {
  hull: CachedHull; matrix: number[]; eye: number[]; shadow: { planes: Plane[]; error: number };
}>>();
const partCache = new WeakMap<BufferGeometry, { positions: BufferAttribute | InterleavedBufferAttribute; version: number;
  subsets: WeakMap<Uint32Array, Vector3[][]> }>();
const EPS = 1e-9;
const finite = (v: Vector3) => v.toArray().every(Number.isFinite);
function attributeVersion(p: BufferAttribute | InterleavedBufferAttribute) { return 'data' in p ? p.data.version : p.version; }
function validMatrix(m: Matrix4) {
  const e = m.elements;
  return e.every(Number.isFinite) && e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1
    && Number.isFinite(m.determinant()) && Math.abs(m.determinant()) > 1e-12;
}
function localHull(geometry: BufferGeometry): { hull: CachedHull; built: boolean } {
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3 || position.normalized || position.count < 4) throw Error('invalid-avatar-position');
  const version = attributeVersion(position), old = cache.get(geometry);
  if (old && old.position === position && old.version === version) return { hull: old, built: false };
  const vertices = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
  if (!vertices.every(finite)) throw Error('nonfinite-avatar-geometry');
  const hull = new ConvexHull().setFromPoints(vertices), faces = hull.faces;
  if (faces.length < 4) throw Error('degenerate-avatar-hull');
  const planes = faces.map(face => {
    const n = face.normal.clone().normalize();
    if (!finite(n) || n.lengthSq() < .99) throw Error('invalid-avatar-hull-plane');
    return { n, d: Math.max(...vertices.map(v => n.dot(v))) };
  });
  const faceIndex = new Map(faces.map((f, i) => [f, i]));
  const edges: CachedHull['edges'] = [];
  faces.forEach((face, index) => { let edge = face.edge;
    do { const neighbor = faceIndex.get(edge.twin.face);
      if (neighbor === undefined) throw Error('open-avatar-hull');
      if (index < neighbor) edges.push({ a: edge.tail().point.clone(), b: edge.head().point.clone(), faces: [index, neighbor] });
      edge = edge.next;
    } while (edge !== face.edge);
  });
  const result = { position, version, vertices, planes, edges, bounds: new Box3().setFromPoints(vertices), centroid: vertices.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(vertices.length) };
  cache.set(geometry, result); return { hull: result, built: true };
}
/** Bound model-matrix Float32 multiply/add and uniform rounding. This is a
 * conservative geometric expansion, never a tolerance for surviving pixels. */
function localTriangles(batch: CameraExactRenderGeometry['parts'][number]['batches'][number]) {
  const { geometry, positions, triangleVertexIndices: indices } = batch;
  if (positions !== geometry.getAttribute('position') || positions.itemSize !== 3 || positions.normalized
    || !indices.length || indices.length % 3) throw Error('invalid-part-batch');
  const version = attributeVersion(positions);
  let cached = partCache.get(geometry);
  if (!cached || cached.positions !== positions || cached.version !== version) {
    cached = { positions, version, subsets: new WeakMap() }; partCache.set(geometry, cached);
  }
  const old = cached.subsets.get(indices); if (old) return { triangles: old, built: false };
  const result: Vector3[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [0, 1, 2].map(k => {
      const index = indices[i + k]; if (!Number.isInteger(index) || index >= positions.count) throw Error('invalid-part-index');
      return new Vector3().fromBufferAttribute(positions, index);
    });
    if (!triangle.every(finite)) throw Error('nonfinite-part-triangle'); result.push(triangle);
  }
  cached.subsets.set(indices, result); return { triangles: result, built: true };
}
function transformError(vertices: readonly Vector3[], matrix: Matrix4) {
  const e = matrix.elements, maxima = [0, 0, 0];
  for (const p of vertices) for (let r = 0; r < 3; r++) maxima[r] = Math.max(maxima[r],
    Math.abs(e[r] * p.x) + Math.abs(e[4 + r] * p.y) + Math.abs(e[8 + r] * p.z) + Math.abs(e[12 + r]));
  return Math.hypot(...maxima) * 16 * 2 ** -24 + EPS;
}
function shadowPlanes(hull: CachedHull, matrix: Matrix4, eye: Vector3) {
  const localEye = eye.clone().applyMatrix4(matrix.clone().invert());
  if (!finite(localEye)) throw Error('invalid-local-eye');
  const visible = hull.planes.map(p => p.n.dot(localEye) > p.d);
  const local = hull.planes.filter((_, i) => !visible[i]).map(p => ({ n: p.n.clone(), d: p.d }));
  for (const edge of hull.edges) {
    if (visible[edge.faces[0]] === visible[edge.faces[1]]) continue;
    const n = new Vector3().crossVectors(edge.b.clone().sub(edge.a), localEye.clone().sub(edge.a));
    if (!finite(n) || n.lengthSq() < 1e-24) throw Error('degenerate-shadow-edge');
    n.normalize();
    // The silhouette normal points outwards. An independent all-vertex
    // support scan expands it, including floating-point hull omissions.
    const centroid = hull.centroid;
    if (n.dot(centroid.clone().sub(edge.a)) > 0) n.negate();
    local.push({ n, d: Math.max(n.dot(localEye), ...hull.vertices.map(v => n.dot(v))) });
  }
  if (local.length < 4) throw Error('degenerate-shadow-planes');
  const normals = new Matrix3().getNormalMatrix(matrix), error = transformError(hull.vertices, matrix);
  const world = local.map(p => {
    const n = p.n.clone().applyMatrix3(normals), scale = n.length();
    if (!Number.isFinite(scale) || scale < 1e-12) throw Error('invalid-world-plane');
    n.divideScalar(scale);
    const d = n.dot(p.n.clone().multiplyScalar(p.d).applyMatrix4(matrix));
    return { n, d: Math.max(d, n.dot(eye)) + error + EPS };
  });
  return { planes: world, error };
}
/** Closed clipping retains points, lines and zero-area intersections. */
export function clipCameraResidualPolygon(polygon: readonly Vector3[], planes: readonly Plane[], expansion = 0): Vector3[] {
  let result = [...polygon];
  for (const plane of planes) {
    const next: Vector3[] = [];
    for (let i = 0; i < result.length; i++) {
      const a = result[i], b = result[(i + 1) % result.length];
      const da = plane.n.dot(a) - plane.d - expansion, db = plane.n.dot(b) - plane.d - expansion;
      if (!Number.isFinite(da) || !Number.isFinite(db)) throw Error('nonfinite-clip');
      if (da <= 0) next.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) next.push(a.clone().lerp(b, da / (da - db)));
    }
    result = next; if (!result.length) break;
  }
  return result;
}
function discardMargins(p: Vector3, mask: CameraCutawayFrameMask, plan: CameraCutawayFramePlan) {
  const local = p.clone().sub(new Vector3(...mask.center)).applyQuaternion(new Quaternion(...mask.inverseQuaternion));
  const obb = Math.min(...local.toArray().map((v, i) => mask.half[i] - Math.abs(v)));
  const cone = plan.visualCone, offset = p.clone().sub(new Vector3(...cone.eye));
  const delta = new Vector3(...cone.target).sub(new Vector3(...cone.eye)), length = delta.length();
  const axis = delta.divideScalar(length), along = offset.dot(axis);
  const radius = (cone.radiusAtEye + (cone.radiusAtTarget - cone.radiusAtEye) * along / length) * mask.amount;
  const visual = Math.min(along, length - cone.endOffset - along,
    p.clone().sub(new Vector3(...plan.feet)).dot(new Vector3(...plan.up)) - cone.minHeight,
    radius - offset.addScaledVector(axis, -along).length());
  const start = new Vector3(...plan.cameraCapsule.start), capsuleDelta = new Vector3(...plan.cameraCapsule.end).sub(start);
  const squared = capsuleDelta.lengthSq();
  const closest = start.addScaledVector(capsuleDelta, Math.max(0, Math.min(1, p.clone().sub(start).dot(capsuleDelta) / Math.max(squared, 1e-8))));
  return { obb, visual, capsule: plan.cameraCapsule.radius - p.distanceTo(closest) };
}
export function proveCameraExactResidual(input: {
  eye: Vector3; bounds: readonly CameraFrameAvatarBound[]; avatarMeshes: readonly CameraExactAvatarMesh[];
  plan: CameraCutawayFramePlan; mask: CameraCutawayFrameMask; render: CameraExactRenderGeometry;
  capsuleAuthorized: boolean;
}): CameraExactResidualEvidence {
  const started = performance.now(), { plan, mask, render } = input;
  const result: CameraExactResidualEvidence = { schema: 'camera-exact-residual-v1', maskKey: mask.key, covered: false,
    reason: 'unresolved', avatarGeometry: [], partGeometry: [], triangles: 0, intersections: 0,
    planes: 0, minimumMargin: null, elapsedMs: 0, hullCacheBuilds: 0, shadowCacheHits: 0, partCacheBuilds: 0, supportExpansion: EPS, shaderGuard: 0, capsuleAuthorized: input.capsuleAuthorized, shadowPlanes: [] };
  try {
    if (!render.ready || render.reasons.length || render.frameId !== plan.frameId || render.bindingVersion !== plan.bindingVersion) throw Error('render-binding');
    if (!finite(input.eye) || input.eye.toArray().some((v, i) => v !== plan.eye[i])) throw Error('eye-binding');
    const part = render.parts.find(p => p.mask === mask);
    if (!part || !part.batches.length || !plan.masks.includes(mask) || mask.ownerSlot <= 0 || mask.partSlot <= 0) throw Error('part-binding');
    if (!input.avatarMeshes.length || input.avatarMeshes.length !== input.bounds.length
      || new Set(input.avatarMeshes.map(m => m.label)).size !== input.avatarMeshes.length) throw Error('avatar-completeness');
    const allUniforms = [...plan.eye, ...plan.feet, ...plan.up, ...plan.visualCone.eye, ...plan.visualCone.target,
      plan.visualCone.length, plan.visualCone.radiusAtEye, plan.visualCone.radiusAtTarget, plan.visualCone.endOffset,
      plan.visualCone.minHeight, ...mask.center, ...mask.half, ...mask.inverseQuaternion, mask.amount,
      ...plan.cameraCapsule.start, ...plan.cameraCapsule.end, plan.cameraCapsule.radius];
    if (!allUniforms.every(Number.isFinite) || mask.amount <= 0 || mask.amount > 1 || mask.half.some(v => v <= 0)
      || Math.abs(new Quaternion(...mask.inverseQuaternion).lengthSq() - 1) > 1e-6
      || Math.abs(new Vector3(...plan.up).length() - 1) > 1e-6 || plan.visualCone.length <= 1e-4
      || Math.abs(new Vector3(...plan.visualCone.eye).distanceTo(new Vector3(...plan.visualCone.target)) - plan.visualCone.length) > 1e-8
      || plan.visualCone.radiusAtEye < 0 || plan.visualCone.radiusAtTarget < 0
      || plan.visualCone.endOffset < 0 || plan.visualCone.endOffset >= plan.visualCone.length) throw Error('invalid-discard-volume');
    // Keep normalize/dot/length arithmetic well conditioned. The exact path
    // has no authority outside this conservative numeric regime.
    if (plan.visualCone.length < 1 || plan.visualCone.radiusAtEye > plan.visualCone.length
      || plan.visualCone.radiusAtTarget > plan.visualCone.length) throw Error('unsupported-numeric-regime');
    // Reject arithmetic close to shader boundaries. Inflation accounts for
    // uniforms, subtract/dot/length and quaternion arithmetic, not pixels.
    const shaderGuard = Math.max(1e-7, Math.max(...allUniforms.map(Math.abs), 1) * 128 * 2 ** -24);
    result.shaderGuard = shaderGuard;
    const shadows = input.avatarMeshes.map((mesh, i) => {
      if (!validMatrix(mesh.matrixWorld) || mesh.label !== input.bounds[i].label) throw Error('avatar-matrix-binding');
      const { hull, built } = localHull(mesh.geometry); result.hullCacheBuilds += Number(built);
      const actual: number[][] = [];
      for (const x of [hull.bounds.min.x, hull.bounds.max.x]) for (const y of [hull.bounds.min.y, hull.bounds.max.y]) for (const z of [hull.bounds.min.z, hull.bounds.max.z]) actual.push(new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).toArray());
      if (input.bounds[i].corners.length !== 8 || actual.some((p, j) => p.some((v, k) => Math.abs(v - input.bounds[i].corners[j][k]) > 1e-9))) throw Error('avatar-bounds-binding');
      let perFrame = frameShadows.get(plan);
      if (!perFrame) { perFrame = new Map(); frameShadows.set(plan, perFrame); }
      const previous = perFrame.get(mesh.label), eyeArray = input.eye.toArray();
      const shadow = previous && previous.hull === hull && previous.matrix.every((v, j) => v === mesh.matrixWorld.elements[j])
        && previous.eye.every((v, j) => v === eyeArray[j]) ? previous.shadow : shadowPlanes(hull, mesh.matrixWorld, input.eye);
      if (shadow !== previous?.shadow) perFrame.set(mesh.label, { hull, matrix: mesh.matrixWorld.toArray(), eye: eyeArray, shadow });
      if (shadow === previous?.shadow) result.shadowCacheHits++;
      result.planes += shadow.planes.length;
      const geometryId = mesh.geometryId ?? `${mesh.geometry.uuid}:${attributeVersion(hull.position)}`;
      result.avatarGeometry.push({ label: mesh.label, geometryId, matrixWorld: mesh.matrixWorld.toArray() });
      result.shadowPlanes.push({ label: mesh.label, geometryId, transformError: shadow.error,
        planes: shadow.planes.map(p => ({ normal: p.n.toArray(), offset: p.d })) });
      return shadow;
    });
    let minMargin = Infinity;
    for (const batch of part.batches) {
      const { positions, triangleVertexIndices: indices, matrixWorld } = batch;
      if (!validMatrix(matrixWorld) || positions !== batch.geometry.getAttribute('position') || positions.itemSize !== 3 || positions.normalized
        || !indices.length || indices.length % 3) throw Error('invalid-part-batch');
      result.partGeometry.push({ geometryId: batch.geometryId ?? `${batch.geometry.uuid}:${attributeVersion(positions)}`, matrixWorld: matrixWorld.toArray(), triangles: indices.length / 3 });
      const localPart = localTriangles(batch); result.partCacheBuilds += Number(localPart.built);
      for (const local of localPart.triangles) {
        const error = transformError(local, matrixWorld), triangle = local.map(p => p.clone().applyMatrix4(matrixWorld)); result.triangles++;
        for (const shadow of shadows) {
          const polygon = clipCameraResidualPolygon(triangle, shadow.planes, error);
          if (!polygon.length) continue; result.intersections++;
          const guard = shaderGuard + error * (4 + Math.abs((plan.visualCone.radiusAtTarget - plan.visualCone.radiusAtEye) / plan.visualCone.length));
          const margins = polygon.map(p => discardMargins(p, mask, plan));
          const obb = Math.min(...margins.map(m => m.obb));
          const cone = Math.min(...margins.map(m => m.visual));
          const capsule = input.capsuleAuthorized && mask.physical ? Math.min(...margins.map(m => m.capsule)) : -Infinity;
          // Every vertex must be in the SAME convex component. A polygon
          // straddling cone/capsule union remains blocked.
          const margin = Math.min(obb, Math.max(cone, capsule)) - guard;
          result.minimumMargin = result.minimumMargin === null ? margin : Math.min(result.minimumMargin, margin);
          if (!Number.isFinite(margin) || margin <= 0) throw Error('surviving-or-boundary-intersection');
          minMargin = Math.min(minMargin, margin);
        }
      }
    }
    result.minimumMargin = minMargin === Infinity ? null : minMargin;
    result.covered = true; result.reason = 'complete-rendered-part-residual-disjoint';
  } catch (error) { result.reason = error instanceof Error ? error.message : 'exact-proof-error'; }
  result.elapsedMs = performance.now() - started; return result;
}
