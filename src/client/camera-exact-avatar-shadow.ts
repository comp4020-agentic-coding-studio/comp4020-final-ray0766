import { Box3, Matrix3, Matrix4, Vector3 } from 'three';
import type { BufferGeometry, BufferAttribute, InterleavedBufferAttribute } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { createCameraAvatarShadowTest } from './camera-avatar-shadow.ts';
import type { CameraAvatarShadowCollider, CameraAvatarShadowPose, CameraFrameAvatarBound } from './camera-avatar-shadow.ts';

/** Supplied only by the existing trusted actual-avatar collector. The collector
 * authenticates static courier geometry/materials and current world matrices.
 * This function additionally binds every geometry to every same-frame bound.
 */
export interface CameraExactShadowAvatarMesh { label: string; geometryId?: string; geometry: BufferGeometry; matrixWorld: Matrix4 }
export interface CameraExactAvatarShadowWitness {
  label: string; geometryId: string; matrixWorld: number[]; axis: number[];
  direction: 'avatar-before-blocker' | 'blocker-before-avatar';
  gap: number; supportExpansion: number; avatarInterval: number[]; blockerInterval: number[];
}
export interface CameraExactAvatarShadowEvidence {
  schema: 'camera-exact-avatar-shadow-v1'; frameId: number; disjoint: boolean; coarseDisjoint: boolean; reason: string;
  avatarGeometry: { label: string; geometryId: string; matrixWorld: number[]; vertexCount: number; positionVersion: number; positionFingerprint: string }[];
  meshWitnesses: CameraExactAvatarShadowWitness[]; elapsedMs: number; hullCacheBuilds: number;
}
type Attribute = BufferAttribute | InterleavedBufferAttribute;
type LocalGeometry = { position: Attribute; positionArray: ArrayLike<number>; indexArray: ArrayLike<number> | null; index: BufferAttribute | null; stamp: string; vertices: Vector3[];
  bounds: Box3; fingerprint: string; hullEdges?: Vector3[]; hullNormals?: Vector3[] };
const localCache = new WeakMap<BufferGeometry, LocalGeometry>();
const registeredGeometry = new WeakMap<BufferGeometry, LocalGeometry>();
const EPS = 1e-7;
const finite = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const version = (a: Attribute) => 'data' in a ? a.data.version : a.version;
function geometryStamp(g: BufferGeometry, p: Attribute, index: BufferAttribute | null) {
  return JSON.stringify([p.itemSize, p.normalized, index?.itemSize ?? 0, index?.normalized ?? false, version(p), index?.version ?? -1, p.count, index?.count ?? 0,
    g.drawRange.start, g.drawRange.count === Infinity ? 'all' : g.drawRange.count,
    g.groups.map(group => [group.start, group.count, group.materialIndex])]);
}
/** FNV-1a32 of every XYZ coordinate encoded Float64 little-endian. */
function positionFingerprint(vertices: readonly Vector3[]) {
  const bytes = new Uint8Array(8), view = new DataView(bytes.buffer); let hash = 0x811c9dc5;
  for (const vertex of vertices) for (const value of [vertex.x, vertex.y, vertex.z]) {
    view.setFloat64(0, value, true);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function validMatrix(m: Matrix4) {
  const e = m.elements;
  return e.every(Number.isFinite) && e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1 && Number.isFinite(m.determinant()) && Math.abs(m.determinant()) > 1e-12;
}
function checkedLocal(g: BufferGeometry): LocalGeometry {
  const p = g.getAttribute('position'), index = g.getIndex();
  if (!p || p.itemSize !== 3 || p.normalized || p.count < 4 || g.morphAttributes.position?.length) throw Error('invalid-avatar-position');
  const count = index?.count ?? p.count, start = g.drawRange.start, drawn = g.drawRange.count === Infinity ? count - start : g.drawRange.count;
  if (!Number.isInteger(start) || !Number.isInteger(drawn) || start < 0 || drawn <= 0 || start + drawn > count || start % 3 || drawn % 3) throw Error('invalid-avatar-draw-range');
  if (index && (index.itemSize !== 1 || index.normalized)) throw Error('invalid-avatar-index');
  for (let i = 0; i < (index?.count ?? 0); i++) {
    const n = index!.getX(i); if (!Number.isInteger(n) || n < 0 || n >= p.count) throw Error('invalid-avatar-index');
  }
  for (const group of g.groups) if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count < 0 || group.start + group.count > count || group.start % 3 || group.count % 3) throw Error('invalid-avatar-group');
  const stamp = geometryStamp(g, p, index), old = localCache.get(g);
  // Compare every coordinate even if a caller forgot needsUpdate/version.
  // Including unused vertices is conservative for every active triangle.
  if (old && old.position === p && old.index === index && old.stamp === stamp && old.vertices.length === p.count) {
    let unchanged = true;
    for (let i = 0; i < p.count; i++) if (p.getX(i) !== old.vertices[i].x || p.getY(i) !== old.vertices[i].y || p.getZ(i) !== old.vertices[i].z) { unchanged = false; break; }
    if (unchanged) return old;
  }
  const vertices = Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(p, i));
  if (!vertices.every(finite)) throw Error('nonfinite-avatar-position');
  const bounds = new Box3().setFromPoints(vertices), size = bounds.getSize(new Vector3());
  if (Math.min(size.x, size.y, size.z) <= 1e-12) throw Error('degenerate-avatar-geometry');
  const result = { position: p, positionArray: 'data' in p ? p.data.array : p.array, indexArray: index?.array ?? null, index, stamp, vertices, bounds, fingerprint: positionFingerprint(vertices) }; localCache.set(g, result); return result;
}
export interface CameraExactAvatarGeometryIdentity { vertexCount: number; positionVersion: number; positionFingerprint: string }
/** Creation-only registration by the trusted static courier factory caller.
 * No runtime vertex writes are supported by this contract. Snapshot all local
 * coordinates once; later admission checks attribute/buffer identities and
 * versions, index/count, groups and draw range. Arbitrary unversioned writes
 * outside the factory contract are not claimed to be observable here.
 */
export function registerCameraExactAvatarShadowGeometry(geometry: BufferGeometry): CameraExactAvatarGeometryIdentity {
  const previous = registeredGeometry.get(geometry);
  const local = previous ? registeredLocal(geometry) : checkedLocal(geometry);
  registeredGeometry.set(geometry, local);
  return Object.freeze({ vertexCount: local.vertices.length, positionVersion: version(local.position), positionFingerprint: local.fingerprint });
}
function registeredLocal(g: BufferGeometry): LocalGeometry {
  const local = registeredGeometry.get(g), position = g.getAttribute('position'), index = g.getIndex();
  if (!local) throw Error('unregistered-avatar-geometry');
  if (position !== local.position || index !== local.index || !position || ('data' in position ? position.data.array : position.array) !== local.positionArray || (index?.array ?? null) !== local.indexArray || geometryStamp(g, position, index) !== local.stamp || g.morphAttributes.position?.length) throw Error('registered-avatar-geometry-changed');
  return local;
}
function hullAxes(local: LocalGeometry) {
  if (local.hullEdges && local.hullNormals) return false;
  const hull = new ConvexHull().setFromPoints(local.vertices);
  if (hull.faces.length < 4) throw Error('degenerate-avatar-hull');
  local.hullNormals = hull.faces.map(face => face.normal.clone()); local.hullEdges = [];
  for (const face of hull.faces) { let edge = face.edge;
    do { if (!edge.twin) throw Error('open-avatar-hull'); local.hullEdges.push(edge.head().point.clone().sub(edge.tail().point)); edge = edge.next; } while (edge !== face.edge);
  }
  return true;
}
function roundingExpansion(vertices: readonly Vector3[], m: Matrix4) {
  const e = m.elements, maxima = [0, 0, 0];
  for (const p of vertices) for (let r = 0; r < 3; r++) maxima[r] = Math.max(maxima[r], Math.abs(e[r] * p.x) + Math.abs(e[r + 4] * p.y) + Math.abs(e[r + 8] * p.z) + Math.abs(e[r + 12]));
  return Math.hypot(...maxima) * 16 * 2 ** -24 + EPS;
}

/** A strict support axis proves separation of the finite shadow (eye plus all
 * actual vertices) from the complete original collider OBB. No mask, collider,
 * camera volume or safety threshold changes. Failure to find an axis blocks.
 * The existing coarse result remains separately recorded in the evidence.
 */
export function createCameraExactAvatarShadowTest(proposal: CameraAvatarShadowPose, bounds: readonly CameraFrameAvatarBound[], avatarMeshes: readonly CameraExactShadowAvatarMesh[], frameId: number) {
  const eye = proposal.eye.clone(), direction = proposal.direction.clone(), up = proposal.up.clone();
  const coarse = createCameraAvatarShadowTest({ eye, direction, up }, bounds);
  let problem = '', prepared: { mesh: CameraExactShadowAvatarMesh; local: LocalGeometry; label: string; geometryId: string; matrix: Matrix4; world: Vector3[]; corners: Vector3[]; expansion: number }[] = [];
  try {
    if (!Number.isInteger(frameId) || frameId < 1 || ![eye, direction, up].every(finite) || direction.lengthSq() < 1e-20 || new Vector3().crossVectors(direction, up).lengthSq() < 1e-20 || !bounds.length || bounds.length !== avatarMeshes.length) throw Error('invalid-avatar-pose-or-membership');
    const labels = new Set<string>();
    prepared = avatarMeshes.map((mesh, i) => {
      const bound = bounds[i];
      if (!mesh.label || labels.has(mesh.label) || bound.label !== mesh.label || bound.corners.length !== 8 || !validMatrix(mesh.matrixWorld)) throw Error('avatar-bound-mesh-mismatch');
      labels.add(mesh.label);
      const local = registeredLocal(mesh.geometry), matrix = mesh.matrixWorld.clone(), corners: Vector3[] = [];
      for (const x of [local.bounds.min.x, local.bounds.max.x]) for (const y of [local.bounds.min.y, local.bounds.max.y]) for (const z of [local.bounds.min.z, local.bounds.max.z]) corners.push(new Vector3(x, y, z).applyMatrix4(matrix));
      if (bound.corners.some((p, k) => p.length !== 3 || !p.every(Number.isFinite) || corners[k].distanceTo(new Vector3(...p)) > 1e-9)) throw Error('avatar-current-matrix-bounds-mismatch');
      return { mesh, local, label: mesh.label, geometryId: mesh.geometryId ?? `${mesh.geometry.uuid}:${version(local.position)}`, matrix, corners, world: local.vertices.map(v => v.clone().applyMatrix4(matrix)), expansion: Math.max(roundingExpansion(local.vertices, matrix), eye.length() * 16 * 2 ** -24 + 1e-9) };
    });
  } catch (error) { problem = error instanceof Error ? error.message : 'avatar-geometry-invalid'; }
  return (collider: CameraAvatarShadowCollider): CameraExactAvatarShadowEvidence => {
    const started = performance.now();
    const evidence: CameraExactAvatarShadowEvidence = { schema: 'camera-exact-avatar-shadow-v1', frameId, disjoint: false, coarseDisjoint: coarse(collider), reason: problem || 'actual-avatar-shadow-not-separated', avatarGeometry: [], meshWitnesses: [], elapsedMs: 0, hullCacheBuilds: 0 };
    try {
      if (problem) return evidence;
      if (![collider.center, collider.half].every(finite) || Math.min(collider.half.x, collider.half.y, collider.half.z) <= 0 || !collider.q.toArray().every(Number.isFinite) || Math.abs(collider.q.lengthSq() - 1) > 1e-6) throw Error('invalid-original-collider');
      const blockerAxes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map(a => a.applyQuaternion(collider.q));
      const blocker: Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) blocker.push(new Vector3(x * collider.half.x, y * collider.half.y, z * collider.half.z).applyQuaternion(collider.q).add(collider.center));
      for (const row of prepared) {
        if (row.mesh.label !== row.label || (row.mesh.geometryId ?? `${row.mesh.geometry.uuid}:${version(row.local.position)}`) !== row.geometryId || registeredLocal(row.mesh.geometry) !== row.local || row.mesh.matrixWorld.elements.some((n, i) => n !== row.matrix.elements[i])) throw Error('avatar-geometry-changed-after-pose-binding');
        const { mesh, local, matrix, world, corners, expansion } = row, geometryId = row.geometryId;
        evidence.avatarGeometry.push({ label: mesh.label, geometryId, matrixWorld: matrix.toArray(), vertexCount: local.vertices.length, positionVersion: version(local.position), positionFingerprint: local.fingerprint });
        let witness: CameraExactAvatarShadowWitness | undefined;
        const separated = (axis: Vector3) => {
          if (witness || !finite(axis) || axis.lengthSq() < 1e-20) return !!witness;
          const normal = axis.clone().normalize(); let amin = eye.dot(normal), amax = amin, bmin = Infinity, bmax = -Infinity;
          for (const p of world) { const n = p.dot(normal); amin = Math.min(amin, n); amax = Math.max(amax, n); }
          for (const p of blocker) { const n = p.dot(normal); bmin = Math.min(bmin, n); bmax = Math.max(bmax, n); }
          const gap = Math.max(bmin - amax, amin - bmax);
          const supportExpansion = expansion + Math.hypot(...blocker.reduce((maxima, p) => maxima.map((n, i) => Math.max(n, Math.abs(p.getComponent(i)))), [0, 0, 0])) * 16 * 2 ** -24 + EPS;
          if (!Number.isFinite(gap) || !Number.isFinite(supportExpansion) || gap <= supportExpansion + EPS) return false;
          witness = { label: mesh.label, geometryId, matrixWorld: matrix.toArray(), axis: normal.toArray(), direction: bmin > amax ? 'avatar-before-blocker' : 'blocker-before-avatar', gap, supportExpansion, avatarInterval: [amin, amax], blockerInterval: [bmin, bmax] }; return true;
        };
        const edges = [4, 2, 1].map(i => corners[i].clone().sub(corners[0]));
        blockerAxes.some(separated);
        if (!witness) [new Vector3().crossVectors(edges[1], edges[2]), new Vector3().crossVectors(edges[2], edges[0]), new Vector3().crossVectors(edges[0], edges[1])].some(separated);
        if (!witness) blockerAxes.some(a => [...edges, ...corners.map(p => p.clone().sub(eye))].some(edge => separated(new Vector3().crossVectors(a, edge))));
        if (!witness) {
          if (hullAxes(local)) evidence.hullCacheBuilds++;
          const normalMatrix = new Matrix3().getNormalMatrix(matrix), linear = new Matrix3().setFromMatrix4(matrix);
          local.hullNormals!.some(n => separated(n.clone().applyMatrix3(normalMatrix)));
          if (!witness) blockerAxes.some(a => local.hullEdges!.some(edge => separated(new Vector3().crossVectors(a, edge.clone().applyMatrix3(linear)))));
          if (!witness) blockerAxes.some(a => world.some(p => separated(new Vector3().crossVectors(a, p.clone().sub(eye)))));
        }
        if (!witness) return evidence;
        evidence.meshWitnesses.push(witness);
      }
      evidence.disjoint = true; evidence.reason = 'actual-avatar-shadow-disjoint'; return evidence;
    } catch (error) { evidence.reason = error instanceof Error ? error.message : 'avatar-shadow-proof-error'; return evidence; }
    finally { evidence.elapsedMs = performance.now() - started; }
  };
}
