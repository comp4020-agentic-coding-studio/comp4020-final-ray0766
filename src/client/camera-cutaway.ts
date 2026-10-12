import * as T from 'three';
import type { GroundWorld } from '../shared/physics/world.ts';
import { STEP_HEIGHT, GROUND_SKIN } from '../shared/physics/body.ts';
import { createCameraAvatarShadowTest } from './camera-avatar-shadow.ts';
import { CAMERA_PART_ATTRIBUTE } from './camera-blueprint-model.ts';
import type { CameraPartCategory } from './camera-blueprint-model.ts';
import { CAMERA_CUTAWAY_CAPSULE_RADIUS, CAMERA_CUTAWAY_MAX_SWEEP } from './camera-cutaway-plan.ts';
import type { CameraCutawayFrameInput, CameraCutawayFrameMask, CameraCutawayFramePlan, CameraCutawayOpticalCandidate } from './camera-cutaway-plan.ts';

/** Render-only, per-part saved-building occlusion. Collisions and saved contents
 * never change. Slot zero is immutable, even inside another part's bounds. */
export const CAMERA_CUTAWAY_LIMITS = { objects: 4, masks: 12, protectedMasks: 0 } as const;
export const CAMERA_CUTAWAY_DECK_CLEARANCE = STEP_HEIGHT + GROUND_SKIN;
export type CameraCutawayCollider = Readonly<GroundWorld['bodies'][number]['colliders'][number]>;
type Triple = [number, number, number];
type Quad = [number, number, number, number];
export interface CameraCutawayExpectedCollider { index: number; tag: string; center: Triple; half: Triple; inverseQuaternion: Quad }
export interface CameraCutawayPart {
  objectId: string; partNumber: number; partId: string; level: number; partSlot: number; category: CameraPartCategory;
  planePoint: Triple; planeUp: Triple;
  center: Triple; half: Triple; inverseQuaternion: Quad;
  expectedColliders: readonly CameraCutawayExpectedCollider[];
  expectedColliderStates?: readonly { state: 'open' | 'closed'; colliders: readonly CameraCutawayExpectedCollider[] }[];
}
export interface CameraCutawayInput { world: GroundWorld; camera: T.PerspectiveCamera; feet: T.Vector3; up: T.Vector3; dt: number; enabled: boolean; diagnostics?: boolean }
export interface CameraCutawayMask {
  key: string; objectId: string; ownerSlot: number; partSlot: number; partNumber: number; partId: string; category: CameraPartCategory;
  tag: string; center: Triple; half: Triple; inverseQuaternion: Quad; amount: number; sourceColliderIndices: number[];
}
export interface CameraCutawayHit {
  objectId: string; colliderIndex: number; tag: string; rayIndex: number; enter: number; exit: number;
  partSlot: number; partNumber: number | null; partId: string | null; category: CameraPartCategory; mappingValid: boolean;
  eligible: boolean; maskKey: string | null; reason: string;
}
export interface CameraCutawayDiagnostics {
  schema: 'part-slots-v2'; enabled: boolean; active: boolean; objects: string[]; masks: CameraCutawayFrameMask[]; protectedMasks: never[];
  partInventory: (Omit<CameraCutawayPart, 'expectedColliders' | 'expectedColliderStates'> & { colliderState: 'open' | 'closed' | null; ownerSlot: number; colliderIndices: number[]; qualified: boolean; feetBelowPlane: number; clearanceThreshold: number })[];
  mappingProblems: { objectId: string; colliderIndex: number; reason: string }[];
  corridor: { eye: Triple; target: Triple; feet: Triple; up: Triple; length: number; radiusAtEye: number; radiusAtTarget: number; endOffset: number; minHeight: number } | null;
  rayTargets: Triple[]; rawHits: CameraCutawayHit[]; remainingHits: CameraCutawayHit[];
  overflow: { objects: number; masks: number; protected: 0 }; limits: typeof CAMERA_CUTAWAY_LIMITS;
  boundMeshes: number; clonedMaterials: number; unsupportedMaterials: number; extraGeometryBytes: number;
  bindings: { mesh: string; geometry: string; sourceMaterial: string; material: string; ownerSlots: number[]; partPairs: { ownerSlot: number; partSlot: number }[] }[];
  framePlan?: { frameId: number; worldRevision: number; planetId: string; cameraException: boolean;
    eye: CameraCutawayFramePlan['eye']; feet: CameraCutawayFramePlan['feet']; up: CameraCutawayFramePlan['up']; direction: CameraCutawayFramePlan['direction'];
    bindingVersion: number; continuityGeneration: number; previousEye: CameraCutawayFramePlan['previousEye']; cameraCapsule: CameraCutawayFramePlan['cameraCapsule']; mandatoryParts: CameraCutawayFramePlan['mandatoryParts']; visualRequiredParts: CameraCutawayFramePlan['visualRequiredParts']; opticalTargetPoints: CameraCutawayFramePlan['opticalTargetPoints']; opticalCandidates: CameraCutawayFramePlan['opticalCandidates']; ready: boolean; reasons: readonly string[] };
  transparentMaterials: number; existingTransparentMaterials: number; addedTransparency: number; depthWriteDisabled: number; terrainTested: false; renderClearVerified: false;
}
/** Local triangles from the current registered render batches, including finishes.
 * References and cached vertex indices stay stable; only the world matrix is
 * copied per plan. Consumers must treat geometry and index arrays as read-only. */
export interface CameraCutawayRenderBatch {
  mesh: T.Mesh; geometry: T.BufferGeometry; geometryId: string;
  positions: T.BufferAttribute | T.InterleavedBufferAttribute;
  triangleVertexIndices: Uint32Array; matrixWorld: T.Matrix4; side: T.Side;
}
export interface CameraCutawayFrameRenderPart { mask: CameraCutawayFrameMask; batches: readonly CameraCutawayRenderBatch[] }
export type CameraCutawayFrameRenderBatch = CameraCutawayRenderBatch;
export interface CameraCutawayRenderGeometry {
  frameId: number; bindingVersion: number; ready: boolean; reasons: readonly string[];
  parts: readonly CameraCutawayFrameRenderPart[];
}
export interface CameraCutawayRenderRegistryCatalog {
  schema: 'camera-cutaway-render-registry-v1'; revision: number; bindingVersion: number;
  registry: readonly { mesh: string; name: string; geometry: string; geometryId: string | null;
    material: string | null; sourceMaterial: string | null; ownerSlots: readonly number[];
    partPairs: readonly { ownerSlot: number; partSlot: number }[]; staticGeometry: boolean; registrationOrder: number }[];
}
export type CameraCutawayFrameRenderGeometry = CameraCutawayRenderGeometry;
type GeometryStamp = readonly unknown[];
interface RenderGeometryCache { geometryId: string; stamp: GeometryStamp; pairs: Map<string, Uint32Array>; reasons: string[] }
interface RenderMeshSnapshot { mesh: T.Mesh; geometry: T.BufferGeometry; stamp: GeometryStamp; material: T.Material | T.Material[]; visible: boolean; matrixWorld: T.Matrix4; materialVisible: boolean; depthWrite: boolean; side: T.Side | null; materialVersion: number; compile: T.Material['onBeforeCompile'] | null; beforeRender: T.Material['onBeforeRender'] | null; meshBeforeRender: T.Object3D['onBeforeRender']; displacementMap: T.Texture | null | undefined }
interface RenderPlanSnapshot { result: CameraCutawayRenderGeometry; meshes: RenderMeshSnapshot[] }
function renderVisible(mesh: T.Mesh) {
  for (let node: T.Object3D | null = mesh; node; node = node.parent) if (!node.visible) return false;
  return !Array.isArray(mesh.material) && mesh.material.visible;
}
function renderGeometryStamp(geometry: T.BufferGeometry): GeometryStamp {
  const attributes = [geometry.getAttribute('position'), geometry.getIndex(), geometry.getAttribute(VERTEX_ATTRIBUTE), geometry.getAttribute(CAMERA_PART_ATTRIBUTE)];
  return [...attributes.flatMap(attribute => attribute ? [attribute, attribute.array, attribute.count, attribute.itemSize, attribute.normalized,
    attribute instanceof T.InterleavedBufferAttribute ? attribute.data.version : attribute.version] : [null]),
    geometry.drawRange.start, geometry.drawRange.count, JSON.stringify(geometry.groups), JSON.stringify(Object.keys(geometry.morphAttributes))];
}
function sameGeometryStamp(a: GeometryStamp, b: GeometryStamp) { return a.length === b.length && a.every((value, index) => value === b[index]); }
interface Region { key: string; part: CameraCutawayPart; ownerSlot: number; amount: number; lastSeen: number; indices: number[] }
interface PlanState { time: number; held: Map<string, Region>; report: boolean; inventoryOwners: Set<string> | null; selectedParts: readonly CameraCutawayPart[]; render?: RenderPlanSnapshot }
interface Entry { collider: CameraCutawayCollider; index: number; bounds: T.Box3; part?: CameraCutawayPart }
const VERTEX_ATTRIBUTE = 'townCameraOwner';
const EYE_RADIUS = .28, TARGET_RADIUS = .96, END_OFFSET = .08, MIN_HEIGHT = .30, MASK_PADDING = .10;
const HOLD_SECONDS = .20, CLOSE_SECONDS = .24;
const axes = ['x', 'y', 'z'] as const;
function feetBelowPlane(part: CameraCutawayPart, feet: T.Vector3) { return new T.Vector3(...part.planePoint).sub(feet).dot(new T.Vector3(...part.planeUp)); }
/** A raised deck can be a ceiling to a lower viewer, but a current or lower
 * walking plane is never cut. Its own plane avoids radial sphere-tilt errors. */
export function cameraCutawayEligible(part: CameraCutawayPart, feet: T.Vector3): boolean {
  if (!part.partSlot || part.category === 'protected') return false;
  if (part.category === 'deck' || part.category === 'beam') return feetBelowPlane(part, feet) > CAMERA_CUTAWAY_DECK_CLEARANCE;
  return true;
}
function boundsOf(collider: CameraCutawayCollider) {
  const extent = new T.Vector3();
  for (const axis of axes) { const vector = new T.Vector3(); vector[axis] = collider.half[axis]; vector.applyQuaternion(collider.q); extent.add(new T.Vector3(Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z))); }
  return new T.Box3(collider.center.clone().sub(extent), collider.center.clone().add(extent));
}
function intersect(collider: CameraCutawayCollider, start: T.Vector3, end: T.Vector3): [number, number] | null {
  const a = start.clone().sub(collider.center).applyQuaternion(collider.inverse), delta = end.clone().sub(start), length = delta.length();
  if (length < 1e-8) return null; delta.divideScalar(length).applyQuaternion(collider.inverse);
  let enter = 0, exit = length;
  for (const axis of axes) {
    const half = collider.half[axis];
    if (Math.abs(delta[axis]) < 1e-9) { if (Math.abs(a[axis]) > half) return null; continue; }
    const one = (-half - a[axis]) / delta[axis], two = (half - a[axis]) / delta[axis];
    enter = Math.max(enter, Math.min(one, two)); exit = Math.min(exit, Math.max(one, two)); if (enter > exit) return null;
  }
  return exit >= 0 && enter < length - END_OFFSET ? [enter, exit] : null;
}
function plain(region: Region): CameraCutawayMask {
  const part = region.part;
  return { key: region.key, objectId: part.objectId, ownerSlot: region.ownerSlot, partSlot: part.partSlot, partNumber: part.partNumber, partId: part.partId, category: part.category,
    tag: part.partId, center: [...part.center], half: part.half.map(value => value + MASK_PADDING) as Triple, inverseQuaternion: [...part.inverseQuaternion], amount: region.amount, sourceColliderIndices: [...region.indices] };
}
function requireReplace(source: string, target: string, replacement: string) { if (!source.includes(target)) throw new Error(`Town camera cutaway shader chunk changed: ${target}`); return source.replace(target, replacement); }
const fragmentDeclarations = /* glsl */ `
varying vec3 vTownCutWorld;
varying float vTownCutOwner;
varying float vTownCutPart;
uniform int uTownCutCount;
uniform vec4 uTownCutCenter[${CAMERA_CUTAWAY_LIMITS.masks}];
uniform vec4 uTownCutHalf[${CAMERA_CUTAWAY_LIMITS.masks}];
uniform vec4 uTownCutInverse[${CAMERA_CUTAWAY_LIMITS.masks}];
uniform float uTownCutPart[${CAMERA_CUTAWAY_LIMITS.masks}];
uniform float uTownCutPhysical[${CAMERA_CUTAWAY_LIMITS.masks}];
uniform vec3 uTownCutCapsuleStart;
uniform vec3 uTownCutCapsuleEnd;
uniform vec3 uTownCutEye;
uniform vec3 uTownCutTarget;
uniform vec3 uTownCutFeet;
uniform vec3 uTownCutUp;
vec3 townCutRotate(vec4 q, vec3 p) { vec3 t = 2.0 * cross(q.xyz, p); return p + q.w * t + cross(q.xyz, t); }
`;
const fragmentDiscard = /* glsl */ `
if (uTownCutCount > 0 && vTownCutOwner > .5 && vTownCutPart > .5) {
  vec3 townCutAxis = uTownCutTarget - uTownCutEye;
  float townCutLength = length(townCutAxis);
  townCutAxis /= max(townCutLength, .0001);
  vec3 townCutDelta = vTownCutWorld - uTownCutEye;
  float townCutAlong = dot(townCutDelta, townCutAxis);
  float townCutAcross = length(townCutDelta - townCutAxis * townCutAlong);
  float townCutRadius = mix(${EYE_RADIUS.toFixed(3)}, ${TARGET_RADIUS.toFixed(3)}, clamp(townCutAlong / max(townCutLength, .0001), 0.0, 1.0));
  bool townCutVisual = dot(vTownCutWorld - uTownCutFeet, uTownCutUp) > ${MIN_HEIGHT.toFixed(3)}
    && townCutAlong >= 0.0 && townCutAlong < townCutLength - ${END_OFFSET.toFixed(3)};
  vec3 townCapsuleAxis = uTownCutCapsuleEnd - uTownCutCapsuleStart;
  float townCapsuleT = clamp(dot(vTownCutWorld - uTownCutCapsuleStart, townCapsuleAxis) / max(dot(townCapsuleAxis, townCapsuleAxis), .00000001), 0.0, 1.0);
  bool townCutCapsule = distance(vTownCutWorld, uTownCutCapsuleStart + townCapsuleT * townCapsuleAxis) <= ${CAMERA_CUTAWAY_CAPSULE_RADIUS.toFixed(3)};
  for (int i = 0; i < ${CAMERA_CUTAWAY_LIMITS.masks}; i++) {
    if (i >= uTownCutCount) break;
    if (abs(vTownCutOwner - uTownCutCenter[i].w) < .25 && abs(vTownCutPart - uTownCutPart[i]) < .25
      && all(lessThanEqual(abs(townCutRotate(uTownCutInverse[i], vTownCutWorld - uTownCutCenter[i].xyz)), uTownCutHalf[i].xyz))
      && ((townCutVisual && townCutAcross < townCutRadius * uTownCutHalf[i].w) || (uTownCutPhysical[i] > .5 && townCutCapsule))) discard;
  }
}
`;
export class TownCameraCutaway {
  readonly planetId: string;
  private readonly slots: Map<string, number>;
  private readonly registered = new Set<T.Mesh>();
  private readonly registration = new Map<T.Mesh, { bytes: number; order: number; ownerSlots: number[] }>();
  private readonly meshesByOwner = new Map<number, Set<T.Mesh>>();
  private registrationOrder = 0;
  private extraGeometryBytes = 0;
  private materialBudget = { transparentMaterials: 0, existingTransparentMaterials: 0, addedTransparency: 0, depthWriteDisabled: 0 };
  private readonly bindings = new Map<T.Mesh, { source: T.Material; clone: T.Material; ownerSlots: number[]; partPairs: { ownerSlot: number; partSlot: number }[]; staticGeometry: boolean; compile: T.Material['onBeforeCompile'] }>();
  private readonly materials = new Map<T.Material, { clone: T.Material; references: number }>();
  private readonly originals = new WeakMap<T.Material, T.Material>();
  private readonly unsupported = new Map<T.Mesh, { material: T.Material; ownerSlots: number[] }>();
  private readonly uniforms = {
    uTownCutCount: { value: 0 }, uTownCutCenter: { value: Array.from({ length: CAMERA_CUTAWAY_LIMITS.masks }, () => new T.Vector4()) },
    uTownCutHalf: { value: Array.from({ length: CAMERA_CUTAWAY_LIMITS.masks }, () => new T.Vector4()) },
    uTownCutInverse: { value: Array.from({ length: CAMERA_CUTAWAY_LIMITS.masks }, () => new T.Vector4()) },
    uTownCutPart: { value: new Float32Array(CAMERA_CUTAWAY_LIMITS.masks) },
    uTownCutPhysical: { value: new Float32Array(CAMERA_CUTAWAY_LIMITS.masks) },
    uTownCutCapsuleStart: { value: new T.Vector3() }, uTownCutCapsuleEnd: { value: new T.Vector3() },
    uTownCutEye: { value: new T.Vector3() }, uTownCutTarget: { value: new T.Vector3() }, uTownCutFeet: { value: new T.Vector3() }, uTownCutUp: { value: new T.Vector3(0, 1, 0) },
  };
  private world: GroundWorld | null = null;
  private bindingVersion = 0;
  private continuityGeneration = 0;
  private frameId = 0;
  private lastCommittedEye: T.Vector3 | null = null;
  private readonly plans = new WeakMap<CameraCutawayFramePlan, PlanState>();
  private renderGeometryGeneration = 0;
  private renderRegistryRevision = 0;
  private renderRegistryCatalog: { signature: string; value: CameraCutawayRenderRegistryCatalog } | null = null;
  private readonly renderGeometryCache = new WeakMap<T.BufferGeometry, RenderGeometryCache>();
  private containedParts = new Map<CameraCutawayPart, boolean>();
  private entries = new Map<string, Entry[]>();
  private readonly partsByOwner = new Map<string, CameraCutawayPart[]>();
  private mappingProblems: CameraCutawayDiagnostics['mappingProblems'] = [];
  private validOwners = new Set<string>();
  private colliderStates = new Map<CameraCutawayPart, 'open' | 'closed'>();
  private held = new Map<string, Region>();
  private time = 0;
  private disposed = false;
  constructor(objectIds: readonly string[], parts: readonly CameraCutawayPart[] = [], planetId = 'hub') {
    this.planetId = planetId;
    this.slots = new Map([...objectIds].sort().map((id, index) => [id, index + 1]));
    for (const part of parts) { const owner = this.partsByOwner.get(part.objectId) ?? []; owner.push(part); this.partsByOwner.set(part.objectId, owner); }
  }
  ownerSlot(objectId: string) { return this.slots.get(objectId) ?? 0; }
  writeOwnerAttribute(geometry: T.BufferGeometry, objectId: string) {
    geometry.setAttribute(VERTEX_ATTRIBUTE, new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(this.ownerSlot(objectId)), 1));
    // Props, foundation and unannotated finishes cannot be cut.
    if (!geometry.getAttribute(CAMERA_PART_ATTRIBUTE)) geometry.setAttribute(CAMERA_PART_ATTRIBUTE, new T.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count), 1));
  }
  /** staticGeometry certifies the caller's frozen factory has geometry-preserving
   * shader hooks. Unknown custom hooks remain unsupported by exact proofs. */
  registerMesh(mesh: T.Mesh, options: { staticGeometry?: true } = {}) {
    if (this.disposed || this.registered.has(mesh)) return;
    this.registered.add(mesh); this.bindingVersion++;
    const bytes = (mesh.geometry.getAttribute(VERTEX_ATTRIBUTE)?.array.byteLength ?? 0) + (mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE)?.array.byteLength ?? 0);
    const registration = { bytes, order: this.registrationOrder++, ownerSlots: [] as number[] };
    this.registration.set(mesh, registration); this.extraGeometryBytes += bytes;
    if (Array.isArray(mesh.material)) throw new Error('Town cutaway requires the existing single-material batches.');
    const source = this.originals.get(mesh.material) ?? mesh.material;
    const ownerAttribute = mesh.geometry.getAttribute(VERTEX_ATTRIBUTE);
    if (!ownerAttribute) throw new Error('Town cutaway batch is missing stable owner slots.');
    const partAttribute = mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE);
    if (!partAttribute) throw new Error('Town cutaway batch is missing part provenance.');
    const partPairs = new Map<string, { ownerSlot: number; partSlot: number }>();
    for (let index = 0; index < ownerAttribute.count; index++) {
      const ownerSlot = ownerAttribute.getX(index), partSlot = partAttribute.getX(index);
      if (ownerSlot > 0) partPairs.set(`${ownerSlot}:${partSlot}`, { ownerSlot, partSlot });
    }
    const ownerSlots = [...new Set(Array.from(ownerAttribute.array))].filter(value => value > 0).sort((a, b) => a - b);
    registration.ownerSlots = ownerSlots;
    for (const slot of ownerSlots) { const meshes = this.meshesByOwner.get(slot) ?? new Set<T.Mesh>(); meshes.add(mesh); this.meshesByOwner.set(slot, meshes); }
    if (!ownerSlots.length) return;
    if (!source.depthWrite) { this.unsupported.set(mesh, { material: source, ownerSlots }); return; }
    let record = this.materials.get(source);
    if (!record) {
      const clone = source.clone();
      if ('defines' in source) (clone as T.MeshStandardMaterial).defines = { ...(source as T.MeshStandardMaterial).defines };
      const before = source.onBeforeCompile, cacheKey = source.customProgramCacheKey;
      clone.onBeforeCompile = (shader, renderer) => {
        before.call(source, shader, renderer); Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = requireReplace(shader.vertexShader, '#include <common>', '#include <common>\nattribute float townCameraOwner;\nattribute float townCameraPart;\nvarying float vTownCutOwner;\nvarying float vTownCutPart;\nvarying vec3 vTownCutWorld;');
        shader.vertexShader = requireReplace(shader.vertexShader, '#include <project_vertex>', '#include <project_vertex>\nvTownCutOwner = townCameraOwner;\nvTownCutPart = townCameraPart;\nvTownCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = requireReplace(shader.fragmentShader, '#include <common>', `#include <common>\n${fragmentDeclarations}`);
        shader.fragmentShader = requireReplace(shader.fragmentShader, '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${fragmentDiscard}`);
      };
      clone.customProgramCacheKey = () => `${cacheKey.call(source)}|town-local-cutaway-v4-frame-plan`;
      clone.userData = { ...clone.userData, sharedResource: true, townCameraCutaway: true };
      record = { clone, references: 0 }; this.materials.set(source, record); this.originals.set(clone, source); this.refreshMaterialBudget();
    }
    record.references++; mesh.material = record.clone; this.bindings.set(mesh, { source, clone: record.clone, ownerSlots, partPairs: [...partPairs.values()],
      staticGeometry: options.staticGeometry === true || source.onBeforeCompile === T.Material.prototype.onBeforeCompile, compile: record.clone.onBeforeCompile });
  }
  unregisterMesh(mesh: T.Mesh) {
    if (this.registered.delete(mesh)) this.bindingVersion++; this.unsupported.delete(mesh);
    this.renderGeometryCache.delete(mesh.geometry);
    const registration = this.registration.get(mesh);
    if (registration) {
      this.extraGeometryBytes -= registration.bytes; this.registration.delete(mesh);
      for (const slot of registration.ownerSlots) { const meshes = this.meshesByOwner.get(slot)!; meshes.delete(mesh); if (!meshes.size) this.meshesByOwner.delete(slot); }
    }
    const binding = this.bindings.get(mesh); if (!binding) return;
    mesh.material = binding.source; this.bindings.delete(mesh);
    const record = this.materials.get(binding.source)!;
    if (--record.references === 0) { record.clone.dispose(); this.materials.delete(binding.source); this.refreshMaterialBudget(); }
  }
  reset() {
    this.held.clear(); this.lastCommittedEye = null; this.continuityGeneration++;
    this.uniforms.uTownCutCount.value = 0; this.uniforms.uTownCutPhysical.value.fill(0);
    this.uniforms.uTownCutCapsuleStart.value.set(0, 0, 0); this.uniforms.uTownCutCapsuleEnd.value.set(0, 0, 0);
  }
  dispose() {
    if (this.disposed) return; this.reset();
    for (const mesh of [...this.registered]) this.unregisterMesh(mesh);
    this.entries.clear(); this.mappingProblems = []; this.validOwners.clear(); this.colliderStates.clear(); this.world = null; this.unsupported.clear(); this.disposed = true;
  }
  private cache(world: GroundWorld) {
    if (this.world === world) return;
    const previousEye = this.world?.planetId === world.planetId ? this.lastCommittedEye?.clone() ?? null : null;
    this.reset(); this.lastCommittedEye = previousEye; this.world = world; this.entries.clear(); this.mappingProblems = []; this.validOwners.clear(); this.colliderStates.clear(); this.containedParts.clear();
    for (const body of world.bodies) {
      const parts = this.partsByOwner.get(body.objectId), byIndex = new Map<number, CameraCutawayPart>();
      const problems: CameraCutawayDiagnostics['mappingProblems'] = [];
      const matches = (expected: CameraCutawayExpectedCollider) => {
        const actual = body.colliders[expected.index], q = new T.Quaternion(...expected.inverseQuaternion);
        return !byIndex.has(expected.index) && !!actual && actual.tag === expected.tag && actual.center.distanceTo(new T.Vector3(...expected.center)) <= 1e-6
          && actual.half.distanceTo(new T.Vector3(...expected.half)) <= 1e-6 && 1 - Math.abs(actual.inverse.dot(q)) <= 1e-10;
      };
      for (const part of parts ?? []) {
        let expected = part.expectedColliders;
        const states = part.expectedColliderStates;
        if (states) {
          const validStates = part.partSlot === 0 && part.category === 'protected' && (part.partId === 'wall.door.open' || part.partId === 'wall.door-wide.open')
            && states.length === 2 && states.some(state => state.state === 'closed') && states.some(state => state.state === 'open')
            && states.every(state => state.colliders.length === expected.length && state.colliders.every((shape, index) => shape.index === expected[index].index && shape.tag === expected[index].tag));
          const matched = validStates ? states.find(state => state.colliders.every(matches)) : undefined;
          if (!matched) {
            problems.push({ objectId: body.objectId, colliderIndex: expected[0]?.index ?? -1, reason: validStates ? 'part-collider-state-mismatch' : 'invalid-protected-door-states' });
            continue;
          }
          expected = matched.colliders; this.colliderStates.set(part, matched.state);
        }
        for (const shape of expected) {
          if (!matches(shape)) problems.push({ objectId: body.objectId, colliderIndex: shape.index, reason: 'part-collider-mapping-mismatch' });
          else byIndex.set(shape.index, part);
        }
      }
      if (parts) for (const [index, collider] of body.colliders.entries()) if (!byIndex.has(index) && collider.tag !== 'foundation')
        problems.push({ objectId: body.objectId, colliderIndex: index, reason: 'unexpected-unmapped-collider' });
      if (parts?.length && !problems.length) this.validOwners.add(body.objectId); else if (this.ownerSlot(body.objectId) && !parts?.length)
        problems.push({ objectId: body.objectId, colliderIndex: -1, reason: 'missing-part-registry' });
      this.mappingProblems.push(...problems);
      this.entries.set(body.objectId, body.colliders.map((collider, index) => ({ collider, index, bounds: boundsOf(collider), part: this.validOwners.has(body.objectId) ? byIndex.get(index) : undefined })));
    }
  }
  /** These flags and attributes are fixed for a registered batch. Recompute
   * resource totals only when that batch/material enters or leaves the host. */
  private refreshMaterialBudget() {
    const counts = { transparentMaterials: 0, existingTransparentMaterials: 0, addedTransparency: 0, depthWriteDisabled: 0 };
    for (const [source, { clone }] of this.materials) {
      counts.transparentMaterials += Number(clone.transparent); counts.existingTransparentMaterials += Number(source.transparent);
      counts.addedTransparency += Number(!source.transparent && clone.transparent); counts.depthWriteDisabled += Number(!clone.depthWrite);
    }
    this.materialBudget = counts;
  }
  private budget(owners: ReadonlySet<string> = new Set()) {
    const candidates = new Set<T.Mesh>();
    for (const owner of owners) for (const mesh of this.meshesByOwner.get(this.ownerSlot(owner)) ?? []) candidates.add(mesh);
    const visible = (mesh: T.Object3D) => { for (let node: T.Object3D | null = mesh; node; node = node.parent) if (!node.visible) return false; return true; };
    const bindings: CameraCutawayDiagnostics['bindings'] = [], unsupportedMaterials = new Set<T.Material>();
    // The owner index avoids scanning every town batch. Visibility is read now
    // so LOD, overview and inherited visibility can never leave a stale report.
    for (const mesh of [...candidates].sort((a, b) => this.registration.get(a)!.order - this.registration.get(b)!.order)) {
      if (!visible(mesh)) continue;
      const binding = this.bindings.get(mesh);
      if (binding) bindings.push({ mesh: mesh.uuid, geometry: mesh.geometry.uuid, sourceMaterial: binding.source.uuid, material: binding.clone.uuid,
        ownerSlots: binding.ownerSlots, partPairs: binding.partPairs });
      const unsupported = this.unsupported.get(mesh); if (unsupported) unsupportedMaterials.add(unsupported.material);
    }
    return { boundMeshes: this.bindings.size, clonedMaterials: this.materials.size, unsupportedMaterials: unsupportedMaterials.size,
      extraGeometryBytes: this.extraGeometryBytes, bindings, ...this.materialBudget };
  }
  private partContainsColliders(part: CameraCutawayPart) {
    const cached = this.containedParts.get(part); if (cached !== undefined) return cached;
    const inverse = new T.Quaternion(...part.inverseQuaternion), center = new T.Vector3(...part.center);
    const entries = this.entries.get(part.objectId) ?? [];
    let contained = part.expectedColliders.length > 0;
    for (const expected of part.expectedColliders) {
      const collider = entries[expected.index]?.collider;
      if (!collider) { contained = false; break; }
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const point = new T.Vector3(x * collider.half.x, y * collider.half.y, z * collider.half.z).applyQuaternion(collider.q)
          .add(collider.center).sub(center).applyQuaternion(inverse);
        if (Math.abs(point.x) > part.half[0] + MASK_PADDING + 1e-7 || Math.abs(point.y) > part.half[1] + MASK_PADDING + 1e-7 || Math.abs(point.z) > part.half[2] + MASK_PADDING + 1e-7) contained = false;
      }
    }
    this.containedParts.set(part, contained); return contained;
  }
  private partIsBound(part: CameraCutawayPart) {
    const owner = this.ownerSlot(part.objectId); let found = false;
    for (const mesh of this.meshesByOwner.get(owner) ?? []) {
      let visible = true; for (let node: T.Object3D | null = mesh; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      const attribute = mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE), owners = mesh.geometry.getAttribute(VERTEX_ATTRIBUTE);
      const binding = this.bindings.get(mesh);
      let includesPart = binding?.partPairs.some(pair => pair.ownerSlot === owner && pair.partSlot === part.partSlot) ?? false;
      if (!binding) for (let i = 0; i < attribute.count && !includesPart; i++) includesPart = owners.getX(i) === owner && attribute.getX(i) === part.partSlot;
      if (!includesPart) continue;
      if (!binding || mesh.material !== binding.clone || !binding.clone.depthWrite) return false;
      found = true;
    }
    return found;
  }
  /** Pure candidate planning: no candidate writes held state, time or uniforms.
   * One selected, current plan must be committed before presenting its pose. */
  planFrame(input: CameraCutawayFrameInput): CameraCutawayFramePlan {
    const { world, eye, feet, up, direction } = input, report = input.diagnostics !== false, cameraException = input.cameraException === true;
    if (world.planetId === this.planetId && !this.disposed) this.cache(world);
    const time = this.time + (Number.isFinite(input.dt) ? Math.max(0, Math.min(.1, input.dt)) : 0), target = feet.clone().addScaledVector(up, 1.16);
    const previous = cameraException && input.previousEye ? input.previousEye.clone() : null;
    const start = previous ?? eye;
    const right = new T.Vector3().crossVectors(direction, up).normalize();
    const rayTargets = [[0, 1.16], [0, 1.73], [0, .55], [-.62, 1.16], [.62, 1.16], [-.38, 1.62], [.38, 1.62], [-.48, .75], [.48, .75]]
      .map(([side, height]) => feet.clone().addScaledVector(up, height).addScaledVector(right, side));
    const corridorBounds = new T.Box3().setFromPoints([eye, ...rayTargets]).expandByScalar(.22);
    const opticalTargetPoints = (input.opticalTargetPoints ?? []).map(point => new T.Vector3(...point));
    const validOpticalBoxes = opticalTargetPoints.length > 0 && opticalTargetPoints.length % 8 === 0;
    const avatarDisjoint = validOpticalBoxes ? createCameraAvatarShadowTest({ eye, direction, up },
      Array.from({ length: opticalTargetPoints.length / 8 }, (_, i) => ({ label: `upper-mesh-${i}`, corners: opticalTargetPoints.slice(i * 8, (i + 1) * 8).map(point => point.toArray()) }))) : undefined;
    const opticalBounds = corridorBounds.clone(); for (const point of opticalTargetPoints) opticalBounds.expandByPoint(point);
    const capsuleBounds = new T.Box3().setFromPoints([start, eye]).expandByScalar(CAMERA_CUTAWAY_CAPSULE_RADIUS * Math.sqrt(3));
    const candidates = new Map<string, Region>(), mandatory = new Set<string>(), visualRequired = new Map<string, Set<number>>(), opticalCandidates: CameraCutawayOpticalCandidate[] = [];
    const rawHits: CameraCutawayHit[] = [], inventoryOwners = report ? new Set<string>() : null, reasons: string[] = [];
    if (this.disposed || world.planetId !== this.planetId) reasons.push('world-or-controller-inactive');
    if (opticalTargetPoints.length && !validOpticalBoxes) reasons.push('invalid-avatar-box-groups');
    if (![eye, feet, up, direction, ...(previous ? [previous] : []), ...opticalTargetPoints].every(vector => vector.toArray().every(Number.isFinite))
      || !Number.isFinite(input.dt) || Math.abs(up.lengthSq() - 1) > 1e-5 || direction.lengthSq() < 1e-10 || right.lengthSq() < 1e-10) reasons.push('invalid-camera-input');
    if (cameraException && (!!previous !== !!this.lastCommittedEye || previous && this.lastCommittedEye && previous.distanceTo(this.lastCommittedEye) > 1e-6)) reasons.push('camera-continuity-mismatch');
    // A long reposition is a reset/entry, never permission for a tube through
    // a neighbourhood. The rig must constrain ordinary movement to this cap.
    if (cameraException && start.distanceTo(eye) > CAMERA_CUTAWAY_MAX_SWEEP + 1e-7) reasons.push('camera-sweep-too-long');
    const consider = (entry: Entry, objectId: string) => {
      const part = entry.part; if (!part || !this.ownerSlot(objectId) || !cameraCutawayEligible(part, feet)) return null;
      const key = `${objectId}|part:${part.partSlot}`;
      let region = candidates.get(key);
      if (!region) { region = { key, part, ownerSlot: this.ownerSlot(objectId), indices: [], amount: 1, lastSeen: 0 }; candidates.set(key, region); }
      if (!region.indices.includes(entry.index)) region.indices.push(entry.index);
      return key;
    };
    const sweptContact = (collider: CameraCutawayCollider) => {
      const p = start.clone().sub(collider.center).applyQuaternion(collider.inverse), delta = eye.clone().sub(start).applyQuaternion(collider.inverse);
      let lo = 0, hi = 1;
      for (const axis of axes) {
        const half = collider.half[axis] + CAMERA_CUTAWAY_CAPSULE_RADIUS;
        if (Math.abs(delta[axis]) < 1e-9) { if (Math.abs(p[axis]) > half) return false; }
        else { const a = (-half - p[axis]) / delta[axis], b = (half - p[axis]) / delta[axis]; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      }
      return lo <= hi && lo <= 1 && hi >= 0;
    };
    for (const body of world.bodies) {
      const visual = !!body.cameraBounds?.intersectsBox(corridorBounds), physical = cameraException && !!body.cameraBounds?.intersectsBox(capsuleBounds);
      const optical = opticalTargetPoints.length > 0 && !!body.cameraBounds?.intersectsBox(opticalBounds);
      if (!visual && !physical && !optical) continue;
      for (const entry of this.entries.get(body.objectId) ?? []) {
        const part = entry.part;
        // Actual body projections can expose eligible blockers between the
        // nine guard rays. Selection stays per-part and inside the same volume.
        if (optical && entry.bounds.intersectsBox(opticalBounds)) {
          const eligible = !!part && this.ownerSlot(body.objectId) > 0 && cameraCutawayEligible(part, feet);
          const avatarShadowOverlap = avatarDisjoint ? !avatarDisjoint(entry.collider) : true;
          opticalCandidates.push({ objectId: body.objectId, colliderIndex: entry.index, category: part?.category ?? 'protected', avatarShadowOverlap,
            mappingValid: this.validOwners.has(body.objectId), eligible, partSlot: part?.partSlot ?? 0, maskKey: eligible ? `${body.objectId}|part:${part!.partSlot}` : null });
          if (eligible && avatarShadowOverlap && avatarDisjoint) {
            const key = consider(entry, body.objectId)!;
            const indices = visualRequired.get(key) ?? new Set<number>(); indices.add(entry.index); visualRequired.set(key, indices);
          }
        }
        if (physical && part && (part.category === 'wall' || part.category === 'roof') && sweptContact(entry.collider)) {
          const key = consider(entry, body.objectId); if (key) mandatory.add(key);
        }
        if (!visual || !entry.bounds.clone().expandByScalar(.10).intersectsBox(corridorBounds)) continue;
        for (const [rayIndex, end] of rayTargets.entries()) {
          const hit = intersect(entry.collider, eye, end); if (!hit) continue;
          inventoryOwners?.add(body.objectId);
          const key = consider(entry, body.objectId), ownerSlot = this.ownerSlot(body.objectId), eligible = key !== null;
          rawHits.push({ objectId: body.objectId, colliderIndex: entry.index, tag: entry.collider.tag, rayIndex, enter: hit[0], exit: hit[1],
            partSlot: part?.partSlot ?? 0, partNumber: part?.partNumber ?? null, partId: part?.partId ?? null, category: part?.category ?? 'protected', mappingValid: this.validOwners.has(body.objectId),
            eligible, maskKey: key, reason: eligible ? 'eligible-raw-obstruction' : ownerSlot ? 'protected-or-unmapped-part' : 'unregistered-owner' });
        }
      }
    }
    const distance = (region: Region) => new T.Vector3(...region.part.center).distanceToSquared(eye);
    const sorted = [...candidates.values()].sort((a, b) => Number(mandatory.has(b.key)) - Number(mandatory.has(a.key)) || Number(visualRequired.has(b.key)) - Number(visualRequired.has(a.key)) || distance(a) - distance(b) || a.key.localeCompare(b.key));
    const allOwners = [...new Set(sorted.map(region => region.part.objectId))], allowedOwners = new Set(allOwners.slice(0, CAMERA_CUTAWAY_LIMITS.objects));
    const wanted = sorted.filter(region => allowedOwners.has(region.part.objectId)).slice(0, CAMERA_CUTAWAY_LIMITS.masks);
    const held = new Map([...this.held].map(([key, region]) => [key, { ...region }]));
    for (const [key, region] of held) if (!this.validOwners.has(region.part.objectId) || !cameraCutawayEligible(region.part, feet)) held.delete(key);
    for (const region of wanted) {
      const prior = held.get(region.key); region.amount = mandatory.has(region.key) || visualRequired.has(region.key) ? 1 : prior ? Math.min(1, prior.amount + Math.max(0, input.dt) * 5) : .90;
      region.lastSeen = time; held.set(region.key, region);
    }
    const wantedKeys = new Set(wanted.map(region => region.key));
    for (const [key, region] of held) if (!wantedKeys.has(key)) {
      const elapsed = time - region.lastSeen;
      if (elapsed > HOLD_SECONDS) region.amount = Math.min(region.amount, Math.max(0, 1 - (elapsed - HOLD_SECONDS) / CLOSE_SECONDS));
      if (region.amount <= 0) held.delete(key);
    }
    const regions: Region[] = [], actualOwners = new Set<string>();
    for (const region of [...wanted, ...[...held.values()].filter(region => !wantedKeys.has(region.key))]) {
      if (regions.length >= CAMERA_CUTAWAY_LIMITS.masks || (!actualOwners.has(region.part.objectId) && actualOwners.size >= CAMERA_CUTAWAY_LIMITS.objects)) continue;
      regions.push(region); actualOwners.add(region.part.objectId); inventoryOwners?.add(region.part.objectId);
    }
    const activeKeys = new Set(regions.map(region => region.key));
    for (const key of mandatory) if (!activeKeys.has(key)) reasons.push(`mandatory-mask-budget:${key}`);
    for (const key of visualRequired.keys()) if (!activeKeys.has(key)) reasons.push(`visual-mask-budget:${key}`);
    const masks: CameraCutawayFrameMask[] = regions.map(region => {
      const physical = cameraException && mandatory.has(region.key), contained = physical && this.partContainsColliders(region.part);
      if (physical && !contained) reasons.push(`collider-not-contained:${region.key}`);
      if (cameraException && !this.partIsBound(region.part)) reasons.push(`part-not-bound:${region.key}`);
      return { ...plain(region), physical, colliderIndices: region.part.expectedColliders.map(collider => collider.index), colliderBoundsContained: contained };
    });
    for (const hit of rawHits) {
      if (hit.maskKey && !activeKeys.has(hit.maskKey)) { hit.maskKey = null; hit.reason = 'mask-budget-overflow'; }
      else if (hit.maskKey) hit.reason = 'selector-covered-needs-pixel-verification';
    }
    for (const candidate of opticalCandidates) if (candidate.maskKey && !activeKeys.has(candidate.maskKey)) candidate.maskKey = null;
    const point = (vector: T.Vector3) => Object.freeze(vector.toArray()) as unknown as readonly [number, number, number];
    for (const mask of masks) { Object.freeze(mask.center); Object.freeze(mask.half); Object.freeze(mask.inverseQuaternion); Object.freeze(mask.sourceColliderIndices); Object.freeze(mask.colliderIndices); Object.freeze(mask); }
    const plan: CameraCutawayFramePlan = Object.freeze({ frameId: ++this.frameId, world, worldRevision: world.revision, planetId: world.planetId,
      bindingVersion: this.bindingVersion, continuityGeneration: this.continuityGeneration, eye: point(eye), previousEye: previous ? point(previous) : null,
      feet: point(feet), up: point(up), direction: point(direction), cameraException,
      cameraCapsule: Object.freeze({ start: point(start), end: point(eye), radius: CAMERA_CUTAWAY_CAPSULE_RADIUS, length: start.distanceTo(eye), maxLength: CAMERA_CUTAWAY_MAX_SWEEP }),
      visualCone: Object.freeze({ eye: point(eye), target: point(target), length: eye.distanceTo(target), radiusAtEye: EYE_RADIUS, radiusAtTarget: TARGET_RADIUS, endOffset: END_OFFSET, minHeight: MIN_HEIGHT }),
      visualRequiredParts: Object.freeze([...visualRequired].map(([key, indices]) => { const part = candidates.get(key)!.part;
        return Object.freeze({ key, objectId: part.objectId, partSlot: part.partSlot, sourceColliderIndices: Object.freeze([...indices]) }); })),
      opticalTargetPoints: Object.freeze(opticalTargetPoints.map(point)), opticalCandidates: Object.freeze(opticalCandidates.map(candidate => Object.freeze(candidate))),
      masks: Object.freeze(masks), mandatoryParts: Object.freeze([...mandatory].map(key => { const part = candidates.get(key)!.part;
        return Object.freeze({ key, objectId: part.objectId, partSlot: part.partSlot, colliderIndices: Object.freeze(part.expectedColliders.map(collider => collider.index)) }); })), rayTargets: Object.freeze(rayTargets.map(point)), rawHits: Object.freeze(rawHits.map(hit => Object.freeze(hit))),
      overflow: Object.freeze({ objects: Math.max(0, allOwners.length - CAMERA_CUTAWAY_LIMITS.objects), masks: Math.max(0, sorted.filter(region => allowedOwners.has(region.part.objectId)).length - CAMERA_CUTAWAY_LIMITS.masks), protected: 0 as const }),
      ready: reasons.length === 0, reasons: Object.freeze(reasons) });
    this.plans.set(plan, { time, held, report, inventoryOwners, selectedParts: regions.map(region => region.part) }); return plan;
  }
  private cachedRenderGeometry(geometry: T.BufferGeometry): RenderGeometryCache {
    const stamp = renderGeometryStamp(geometry);
    let cached = this.renderGeometryCache.get(geometry);
    if (!cached || !sameGeometryStamp(cached.stamp, stamp)) {
      const knownSlots = new Set(this.slots.values());
      const knownPairs = new Set([...this.partsByOwner].flatMap(([objectId, ownerParts]) => ownerParts.map(part => `${this.ownerSlot(objectId)}:${part.partSlot}`)));
      const pairs = new Map<string, number[]>(), problems: string[] = [];
      let contentHash = 2166136261;
      const words = new DataView(new ArrayBuffer(8));
      const hashScalar = (value: number) => { words.setFloat64(0, value, true);
        contentHash = Math.imul(contentHash ^ words.getUint32(0, true), 16777619) >>> 0;
        contentHash = Math.imul(contentHash ^ words.getUint32(4, true), 16777619) >>> 0; };
      const positions = geometry.getAttribute('position'), owners = geometry.getAttribute(VERTEX_ATTRIBUTE), slots = geometry.getAttribute(CAMERA_PART_ATTRIBUTE), index = geometry.getIndex();
      const count = index?.count ?? positions?.count ?? 0, start = geometry.drawRange.start, end = Math.min(count, start + geometry.drawRange.count);
      if (!positions || positions.itemSize !== 3 || !owners || !slots || owners.itemSize !== 1 || slots.itemSize !== 1 || owners.count !== positions.count || slots.count !== positions.count
        || !Number.isInteger(start) || start < 0 || start % 3 !== 0 || !Number.isInteger(end) || end % 3 !== 0 || end < start
        || geometry.groups.some(group => (group.materialIndex ?? 0) !== 0)
        || Object.keys(geometry.morphAttributes).length) problems.push('unsupported-triangle-layout');
      else for (let offset = start; offset < end; offset += 3) {
        const vertices = [0, 1, 2].map(i => index ? index.getX(offset + i) : offset + i);
        if (vertices.some(vertex => !Number.isInteger(vertex) || vertex < 0 || vertex >= positions.count
          || ![positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)].every(Number.isFinite))) { problems.push('invalid-triangle-vertex'); break; }
        const owner = owners.getX(vertices[0]), slot = slots.getX(vertices[0]);
        if (!Number.isInteger(owner) || owner < 0 || !Number.isInteger(slot) || slot < 0 || (owner > 0 && (!knownSlots.has(owner) || (slot > 0 && !knownPairs.has(`${owner}:${slot}`))))
          || (owner === 0 && slot !== 0)) { problems.push('unknown-triangle-identity'); break; }
        if (vertices.some(vertex => owners.getX(vertex) !== owner || slots.getX(vertex) !== slot)) { problems.push('mixed-triangle-identity'); break; }
        hashScalar(owner); hashScalar(slot);
        for (const vertex of vertices) { hashScalar(vertex); hashScalar(positions.getX(vertex)); hashScalar(positions.getY(vertex)); hashScalar(positions.getZ(vertex)); }
        if (owner > 0 && slot > 0) { const key = `${owner}:${slot}`, list = pairs.get(key) ?? []; list.push(...vertices); pairs.set(key, list); }
      }
      cached = { geometryId: `${geometry.uuid}:${++this.renderGeometryGeneration}:${contentHash.toString(16)}`, stamp, pairs: new Map([...pairs].map(([key, vertices]) => [key, new Uint32Array(vertices)])), reasons: problems };
      this.renderGeometryCache.set(geometry, cached);
    }
    return cached;
  }
  /** Resolve only the masks selected by an authentic, current plan. Missing or
   * ambiguous provenance never grants a render exception. A first query seals
   * render identity, visibility and transforms for the subsequent plan commit. */
  frameRenderGeometry(plan: CameraCutawayFramePlan): CameraCutawayRenderGeometry {
    const state = this.plans.get(plan);
    const failure = (reason: string): CameraCutawayRenderGeometry => ({ frameId: plan.frameId, bindingVersion: plan.bindingVersion, ready: false, reasons: [reason], parts: [] });
    if (!state || !this.validateFramePlan(plan) || !plan.ready) return failure('stale-or-unsafe-render-plan');
    if (state.render) return this.renderSnapshotValid(state.render) ? state.render.result : failure('render-snapshot-changed');
    const reasons: string[] = [], meshes: RenderMeshSnapshot[] = [];
    const parts = plan.masks.map(mask => ({ mask, batches: [] as CameraCutawayRenderBatch[] }));
    const knownPairs = new Set([...this.partsByOwner].flatMap(([objectId, ownerParts]) => ownerParts.map(part => `${this.ownerSlot(objectId)}:${part.partSlot}`)));
    for (const mesh of this.registered) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry, stamp = renderGeometryStamp(geometry), material = mesh.material, visible = renderVisible(mesh);
      meshes.push({ mesh, geometry, stamp, material, visible, matrixWorld: mesh.matrixWorld.clone(),
        materialVisible: !Array.isArray(material) && material.visible, depthWrite: !Array.isArray(material) && material.depthWrite, side: Array.isArray(material) ? null : material.side,
        materialVersion: Array.isArray(material) ? -1 : material.version, compile: Array.isArray(material) ? null : material.onBeforeCompile,
        beforeRender: Array.isArray(material) ? null : material.onBeforeRender, meshBeforeRender: mesh.onBeforeRender,
        displacementMap: Array.isArray(material) ? null : (material as T.MeshStandardMaterial).displacementMap });
      if (!visible) continue;
      if (!mesh.matrixWorld.elements.every(Number.isFinite) || Math.abs(mesh.matrixWorld.determinant()) < 1e-12) reasons.push(`invalid-render-transform:${mesh.uuid}`);
      const cached = this.cachedRenderGeometry(geometry);
      // Even malformed unrelated provenance is not evidence that a batch lacks
      // a selected part. Fail closed instead of silently dropping triangles.
      reasons.push(...cached.reasons.map(reason => `${reason}:${mesh.uuid}`));
      for (const part of parts) {
        const triangles = cached.pairs.get(`${part.mask.ownerSlot}:${part.mask.partSlot}`); if (!triangles?.length) continue;
        const binding = this.bindings.get(mesh);
        if (!binding || material !== binding.clone || !binding.clone.depthWrite || !binding.staticGeometry || binding.clone.onBeforeCompile !== binding.compile || (mesh as T.InstancedMesh).isInstancedMesh || (mesh as T.SkinnedMesh).isSkinnedMesh
          || ((binding.source as T.MeshStandardMaterial).displacementMap || (binding.clone as T.MeshStandardMaterial).displacementMap) || (binding.source as T.ShaderMaterial).isShaderMaterial
          || mesh.onBeforeRender !== T.Object3D.prototype.onBeforeRender || binding.source.onBeforeRender !== T.Material.prototype.onBeforeRender) {
          reasons.push(`unsupported-render-binding:${mesh.uuid}`); continue;
        }
        part.batches.push(Object.freeze({ mesh, geometry, geometryId: cached.geometryId, positions: geometry.getAttribute('position'), triangleVertexIndices: triangles,
          matrixWorld: mesh.matrixWorld.clone(), side: binding.clone.side }));
      }
    }
    for (const part of parts) if (!part.batches.length || part.mask.ownerSlot !== this.ownerSlot(part.mask.objectId)
      || !knownPairs.has(`${part.mask.ownerSlot}:${part.mask.partSlot}`)) reasons.push(`incomplete-render-part:${part.mask.key}`);
    const result: CameraCutawayRenderGeometry = Object.freeze({ frameId: plan.frameId, bindingVersion: plan.bindingVersion, ready: reasons.length === 0,
      reasons: Object.freeze(reasons), parts: Object.freeze(parts.map(part => Object.freeze({ mask: part.mask, batches: Object.freeze(part.batches) }))) });
    if (result.ready) state.render = { result, meshes }; return result;
  }
  private renderSnapshotValid(snapshot: RenderPlanSnapshot): boolean {
    if (!snapshot.result.ready || snapshot.meshes.length !== this.registered.size) return false;
    return snapshot.meshes.every(record => {
      const mesh = record.mesh; mesh.updateWorldMatrix(true, false);
      return this.registered.has(mesh) && mesh.geometry === record.geometry && mesh.material === record.material && renderVisible(mesh) === record.visible
        && !Array.isArray(mesh.material) && mesh.material.visible === record.materialVisible && mesh.material.depthWrite === record.depthWrite && mesh.material.side === record.side
        && mesh.material.version === record.materialVersion && mesh.material.onBeforeCompile === record.compile && mesh.material.onBeforeRender === record.beforeRender
        && mesh.onBeforeRender === record.meshBeforeRender && (mesh.material as T.MeshStandardMaterial).displacementMap === record.displacementMap
        && sameGeometryStamp(renderGeometryStamp(mesh.geometry), record.stamp) && mesh.matrixWorld.equals(record.matrixWorld);
    });
  }
  /** Capture all registered identities every frame, but copy raw assets only
   * upon first actual visibility. A hidden unbuilt asset may have a null ID;
   * its first visible frame supplies both a stable ID and the complete raw
   * geometry delta. Original provenance inventories live in a cached catalog.
   * The caller adds delta IDs only after saving its assets atomically. */
  captureFrameRenderEvidence(plan: CameraCutawayFramePlan, knownGeometryIds: ReadonlySet<string>) {
    const resolved = this.frameRenderGeometry(plan);
    const geometryDelta: ReturnType<TownCameraCutaway['captureRenderAsset']>[] = [];
    const emitted = new Set<string>();
    const registry = [...this.registered].map(mesh => {
      const visible = renderVisible(mesh), geometry = mesh.geometry;
      if (visible) mesh.updateWorldMatrix(true, false);
      // Never index or hash invisible LODs merely to capture diagnostics.
      const previous = this.renderGeometryCache.get(geometry);
      const cached = visible ? this.cachedRenderGeometry(geometry) : previous && sameGeometryStamp(previous.stamp, renderGeometryStamp(geometry)) ? previous : null;
      const material = mesh.material, binding = this.bindings.get(mesh);
      if (visible && cached && !knownGeometryIds.has(cached.geometryId) && !emitted.has(cached.geometryId)) {
        geometryDelta.push(this.captureRenderAsset(geometry, cached)); emitted.add(cached.geometryId);
      }
      return { mesh: mesh.uuid, geometry: geometry.uuid, geometryId: cached?.geometryId ?? null,
        material: Array.isArray(material) ? null : material.uuid,
        sourceMaterial: binding?.source.uuid ?? this.unsupported.get(mesh)?.material.uuid ?? (Array.isArray(material) ? null : material.uuid),
        visible, materialVisible: !Array.isArray(material) && material.visible, matrixWorld: mesh.matrixWorld.toArray(),
        side: Array.isArray(material) ? null : material.side, depthWrite: !Array.isArray(material) && material.depthWrite,
        staticGeometry: binding?.staticGeometry ?? false, bound: !!binding && material === binding.clone,
        geometryReady: cached ? cached.reasons.length === 0 : null, geometryReasons: cached ? [...cached.reasons] : [] };
    });
    const signature = `${this.bindingVersion}|${registry.map(record => `${record.mesh}:${record.geometry}:${record.geometryId ?? ''}`).join('|')}`;
    if (!this.renderRegistryCatalog || this.renderRegistryCatalog.signature !== signature) {
      const registeredByUuid = new Map([...this.registered].map(mesh => [mesh.uuid, mesh]));
      const catalog: CameraCutawayRenderRegistryCatalog = Object.freeze({ schema: 'camera-cutaway-render-registry-v1', revision: ++this.renderRegistryRevision,
        bindingVersion: this.bindingVersion, registry: Object.freeze(registry.map(record => {
          const mesh = registeredByUuid.get(record.mesh)!, binding = this.bindings.get(mesh), registration = this.registration.get(mesh)!;
          return Object.freeze({ mesh: record.mesh, name: mesh.name, geometry: record.geometry, geometryId: record.geometryId,
            material: binding?.clone.uuid ?? record.material, sourceMaterial: record.sourceMaterial, ownerSlots: Object.freeze([...registration.ownerSlots]),
            partPairs: Object.freeze(binding?.partPairs.map(pair => Object.freeze({ ...pair })) ?? []),
            staticGeometry: binding?.staticGeometry ?? false, registrationOrder: registration.order });
        })) });
      this.renderRegistryCatalog = { signature, value: catalog };
    }
    const registryCatalog = this.renderRegistryCatalog.value;
    const frame = { schema: 'camera-cutaway-render-geometry-v1' as const, frameId: resolved.frameId, bindingVersion: resolved.bindingVersion,
      registryRevision: registryCatalog.revision, ready: resolved.ready && this.validateFramePlan(plan), reasons: resolved.reasons, registry,
      parts: resolved.parts.map(part => ({ mask: part.mask, batches: part.batches.map(batch => ({ mesh: batch.mesh.uuid, geometry: batch.geometry.uuid,
        geometryId: batch.geometryId, matrixWorld: batch.matrixWorld.toArray(), side: batch.side, triangleVertexIndices: Array.from(batch.triangleVertexIndices) })) })) };
    return { frame, geometryDelta, registryCatalog };
  }
  private captureRenderAsset(geometry: T.BufferGeometry, cached: RenderGeometryCache) {
    const positions = geometry.getAttribute('position'), owners = geometry.getAttribute(VERTEX_ATTRIBUTE), parts = geometry.getAttribute(CAMERA_PART_ATTRIBUTE);
    const version = (attribute: T.BufferAttribute | T.InterleavedBufferAttribute | undefined) => !attribute ? null : attribute instanceof T.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
    return { geometry: geometry.uuid, geometryId: cached.geometryId,
      hashAlgorithm: 'fnv1a32-f64le-wordmix-drawn-triangles-v1' as const,
      drawRange: { start: geometry.drawRange.start, count: Math.min(geometry.drawRange.count, (geometry.index?.count ?? positions?.count ?? 0) - geometry.drawRange.start) },
      groups: geometry.groups.map(group => ({ ...group })),
      attributes: { positionVersion: version(positions), indexVersion: geometry.index?.version ?? null, ownerVersion: version(owners), partVersion: version(parts) },
      positions: positions ? Array.from({ length: positions.count }, (_, i) => [positions.getX(i), positions.getY(i), positions.getZ(i)]) : [],
      index: geometry.index ? Array.from(geometry.index.array) : null,
      owners: owners ? Array.from({ length: owners.count }, (_, i) => owners.getX(i)) : [],
      partSlots: parts ? Array.from({ length: parts.count }, (_, i) => parts.getX(i)) : [] };
  }
  /** Explicit complete one-time capture. Prefer delta evidence for frame loops. */
  captureRenderGeometryManifest(plan: CameraCutawayFramePlan) {
    const { frame, geometryDelta, registryCatalog } = this.captureFrameRenderEvidence(plan, new Set());
    const assets = new Map(geometryDelta.map(asset => [asset.geometryId, asset]));
    return { ...frame, registryCatalog, geometries: geometryDelta,
      parts: frame.parts.map(part => ({ mask: part.mask, batches: part.batches.map(batch => ({ ...assets.get(batch.geometryId), ...batch })) })) };
  }
  validateFramePlan(plan: CameraCutawayFramePlan): boolean {
    return !this.disposed && this.plans.has(plan) && plan.world === this.world && plan.world.planetId === this.planetId && plan.world.revision === plan.worldRevision
      && plan.bindingVersion === this.bindingVersion && plan.continuityGeneration === this.continuityGeneration
      && (!plan.cameraException || this.plans.get(plan)!.selectedParts.every(part => this.partIsBound(part)))
      && (!this.plans.get(plan)!.render || this.renderSnapshotValid(this.plans.get(plan)!.render!));
  }
  commitFrame(plan: CameraCutawayFramePlan): CameraCutawayDiagnostics | null {
    if (!this.validateFramePlan(plan) || !plan.ready) throw new Error('Stale or unsafe camera cutaway frame plan.');
    const state = this.plans.get(plan)!;
    // No selection or budget changes after certification. These are the exact
    // same bounded masks and capsule that the physical predicate inspected.
    this.uniforms.uTownCutEye.value.fromArray(plan.eye); this.uniforms.uTownCutTarget.value.fromArray(plan.visualCone.target);
    this.uniforms.uTownCutFeet.value.fromArray(plan.feet); this.uniforms.uTownCutUp.value.fromArray(plan.up);
    this.uniforms.uTownCutCapsuleStart.value.fromArray(plan.cameraCapsule.start); this.uniforms.uTownCutCapsuleEnd.value.fromArray(plan.cameraCapsule.end);
    plan.masks.forEach((mask, index) => {
      this.uniforms.uTownCutCenter.value[index].set(...mask.center, mask.ownerSlot);
      this.uniforms.uTownCutHalf.value[index].set(...mask.half, mask.amount);
      this.uniforms.uTownCutInverse.value[index].fromArray(mask.inverseQuaternion); this.uniforms.uTownCutPart.value[index] = mask.partSlot;
      this.uniforms.uTownCutPhysical.value[index] = plan.cameraException && mask.physical ? 1 : 0;
    });
    this.uniforms.uTownCutCount.value = plan.masks.length; this.held = state.held; this.time = state.time;
    this.lastCommittedEye = plan.cameraException ? new T.Vector3(...plan.eye) : null; this.continuityGeneration++;
    if (!state.report) return null;
    const feet = new T.Vector3(...plan.feet), inventoryOwners = state.inventoryOwners!;
    const partInventory = [...inventoryOwners].flatMap(owner => this.partsByOwner.get(owner) ?? []).map(part => {
      const { expectedColliders, expectedColliderStates, ...identity } = part; void expectedColliderStates;
      return { ...identity, colliderState: this.colliderStates.get(part) ?? null, ownerSlot: this.ownerSlot(part.objectId), colliderIndices: expectedColliders.map(collider => collider.index),
        qualified: this.validOwners.has(part.objectId) && cameraCutawayEligible(part, feet), feetBelowPlane: feetBelowPlane(part, feet), clearanceThreshold: CAMERA_CUTAWAY_DECK_CLEARANCE };
    });
    const objects = [...new Set(plan.masks.map(mask => mask.objectId))], { eye: coneEye, ...cone } = plan.visualCone;
    return { schema: 'part-slots-v2', limits: CAMERA_CUTAWAY_LIMITS, terrainTested: false, renderClearVerified: false, ...this.budget(new Set(objects)), enabled: true,
      active: plan.masks.length > 0, objects, masks: [...plan.masks], protectedMasks: [], partInventory, mappingProblems: this.mappingProblems,
      corridor: { ...cone, eye: [...coneEye], target: [...plan.visualCone.target], feet: [...plan.feet], up: [...plan.up] }, rayTargets: plan.rayTargets.map(point => [...point]),
      rawHits: [...plan.rawHits], remainingHits: plan.rawHits.filter(hit => !hit.maskKey), overflow: { ...plan.overflow },
      ...(plan.cameraException ? { framePlan: { frameId: plan.frameId, worldRevision: plan.worldRevision, planetId: plan.planetId, cameraException: plan.cameraException,
        eye: plan.eye, feet: plan.feet, up: plan.up, direction: plan.direction, bindingVersion: plan.bindingVersion, continuityGeneration: plan.continuityGeneration,
        previousEye: plan.previousEye, cameraCapsule: plan.cameraCapsule, mandatoryParts: plan.mandatoryParts, visualRequiredParts: plan.visualRequiredParts, opticalTargetPoints: plan.opticalTargetPoints, opticalCandidates: plan.opticalCandidates, ready: plan.ready, reasons: plan.reasons } } : {}) };
  }
  update(input: CameraCutawayInput & { diagnostics: false }): null;
  update(input: CameraCutawayInput & { diagnostics?: true }): CameraCutawayDiagnostics;
  update(input: CameraCutawayInput): CameraCutawayDiagnostics | null;
  update(input: CameraCutawayInput): CameraCutawayDiagnostics | null {
    if (!input.enabled || this.disposed || input.world.planetId !== this.planetId) {
      this.reset(); if (input.diagnostics === false) return null;
      return { schema: 'part-slots-v2', limits: CAMERA_CUTAWAY_LIMITS, ...this.budget(), terrainTested: false, renderClearVerified: false,
        enabled: false, active: false, objects: [], masks: [], protectedMasks: [], partInventory: [], mappingProblems: [], corridor: null,
        rayTargets: [], rawHits: [], remainingHits: [], overflow: { objects: 0, masks: 0, protected: 0 } };
    }
    return this.commitFrame(this.planFrame({ world: input.world, eye: input.camera.position, feet: input.feet, up: input.up,
      direction: input.camera.getWorldDirection(new T.Vector3()), dt: input.dt, diagnostics: input.diagnostics, cameraException: false }));
  }
}
