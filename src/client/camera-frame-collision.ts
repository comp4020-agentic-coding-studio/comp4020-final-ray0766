import { Box3, Quaternion, Vector3 } from 'three';
import { proveCameraExactResidual } from './camera-exact-residual.ts';
import type { CameraExactAvatarMesh, CameraExactRenderGeometry, CameraExactResidualEvidence } from './camera-exact-residual.ts';
import { createCameraAvatarShadowTest } from './camera-avatar-shadow.ts';
import { createCameraExactAvatarShadowTest } from './camera-exact-avatar-shadow.ts';
import type { CameraFrameAvatarBound } from './camera-avatar-shadow.ts';
export type { CameraFrameAvatarBound } from './camera-avatar-shadow.ts';
import { cameraTerrainRadiusUpperBound } from '../shared/physics/world.ts';
import type { GroundWorld } from '../shared/physics/world.ts';
import { CAMERA_CUTAWAY_MAX_SWEEP } from './camera-cutaway-plan.ts';
import type { CameraCutawayFrameMask, CameraCutawayFramePlan, CameraCutawayPoint } from './camera-cutaway-plan.ts';

export const CAMERA_FRAME_RADIUS = .2;
export const CAMERA_FRAME_MAX_SWEEP = CAMERA_CUTAWAY_MAX_SWEEP;
export interface GroundCameraFrameProposal {
  previousEye?: Vector3; eye: Vector3; direction: Vector3; feet: Vector3; up: Vector3; probeRadius: number;
}
export interface CameraFrameContact {
  objectId: string; colliderIndex: number; tag: string; fraction: number;
  authorized: boolean; maskKey: string | null;
}
export interface CameraFrameQueryEvidence {
  rawClear: boolean; clear: boolean; terrainClear: boolean; shipClear: boolean;
  rawShipClear: boolean; shipSafetyClear: boolean; shipDistance: number; shipSafetyDistance: number;
  raw: CameraFrameContact[]; authorized: CameraFrameContact[]; residual: CameraFrameContact[];
}
export interface CameraFrameCertificate {
  accepted: boolean; plan: CameraCutawayFramePlan;
  endpointClear: boolean; sweepClear: boolean; protectedOpticalClear: boolean;
  rawEndpointClear: boolean; rawSweepClear: boolean;
  diagnostics: {
    schema: 'local-camera-frame-v1'; frameId: number; worldRevision: number; planetId: string;
    bindingVersion: number; continuityGeneration: number; exceptionsExplicit: boolean;
    eye: number[]; previousEye: number[] | null; radius: number; sweepLength: number; maximumSweep: number;
    endpoint: CameraFrameQueryEvidence; sweep: CameraFrameQueryEvidence;
    avatarOptical: { mode: 'guard-rays' | 'current-avatar-boxes'; boxes: number; tested: number; reused: number; disjointGuardHits: { objectId: string; colliderIndex: number; rayIndex: number }[]; intersections: { objectId: string; colliderIndex: number; reason: string }[] };
    /** Coarse original intersections above remain raw; only strict current
     * avatar geometry vs complete original collider separation refines them. */
    avatarGeometrySeparation?: {
      proofs: { frameId: number; objectId: string; colliderIndex: number; coarseReason: string;
        collider: { center: number[]; half: number[]; quaternion: number[] };
        evidence: ReturnType<ReturnType<typeof createCameraExactAvatarShadowTest>> }[];
      cleared: { objectId: string; colliderIndex: number; reason: string }[];
      remaining: { objectId: string; colliderIndex: number; reason: string }[];
      providerErrors: string[];
    };
    terrainSamples: { tested: number; skippedByUpperBound: number; exactHeightQueries: number };
    exactResidual: { requiredRayIndices?: readonly number[]; providerErrors: string[]; calls: number; elapsedMs: number; clearedGuardHits: number; originalResidual: { objectId: string; colliderIndex: number; rayIndex: number; reason: string }[]; proofs: CameraExactResidualEvidence[] };
    externalOptical: { rayIndex: number; terrainClear: boolean; shipClear: boolean; rawShipClear: boolean; shipSafetyClear: boolean; shipDistance: number; shipSafetyDistance: number; length: number }[];
    optical: { raw: number; covered: number; residual: { objectId: string; colliderIndex: number; rayIndex: number; reason: string }[] };
    visibilityPolicy?: { mode: CameraFrameVisibilityPolicy; requiredRayIndices: number[]; avatarShadowRequired: boolean;
      requiredOpticalResidual: CameraFrameCertificate['diagnostics']['optical']['residual']; requiredExternalBlockedRayIndices: number[];
      avatarGeometryTested: boolean };
    reasons: string[];
  };
}
export type CameraFrameVisibilityPolicy = 'strict-avatar' | 'playable-central';
export interface CameraFrameCollisionContext {
  /** Explicit camera-only readability policy; omitted preserves the strict certificate. */
  visibilityPolicy?: CameraFrameVisibilityPolicy;
  /** Optional expensive whole-avatar forensics under the playable policy. */
  avatarGeometryDiagnostics?: boolean;
  world: GroundWorld;
  /** Actual animated, visible upper-body mesh bounds; absent keeps strict guards. */
  avatarBounds?: readonly CameraFrameAvatarBound[];
  /** Complete visible upper meshes, bound one-to-one to avatarBounds. */
  avatarMeshes?: readonly CameraExactAvatarMesh[];
  /** Issuing controller's authenticated, complete current rendered parts. Lazy. */
  frameRenderGeometry?: (plan: CameraCutawayFramePlan) => CameraExactRenderGeometry;
  /** Must authenticate against the issuing controller's private registry. */
  planCurrent: (plan: CameraCutawayFramePlan) => boolean;
  /** The parked ship is never covered by a building's local cut. */
  probeParked: (start: Vector3, end: Vector3, radius: number) => number;
  /** Closed solid-volume camera guard, separate from the preserved visual rays. */
  probeParkedSafety: (start: Vector3, end: Vector3, radius: number) => number;
}
type Collider = GroundWorld['bodies'][number]['colliders'][number];
const axes = ['x', 'y', 'z'] as const;
const point = (p: CameraCutawayPoint) => new Vector3(...p);
const same = (a: Vector3, b: CameraCutawayPoint) => a.x === b[0] && a.y === b[1] && a.z === b[2];
const finite = (v: Vector3) => v.toArray().every(Number.isFinite);
function interval(c: Collider, start: Vector3, end: Vector3, radius: number) {
  const p = start.clone().sub(c.center).applyQuaternion(c.inverse);
  const d = end.clone().sub(start).applyQuaternion(c.inverse);
  let low = 0, high = 1;
  for (const axis of axes) {
    const half = c.half[axis] + radius;
    if (Math.abs(d[axis]) < 1e-8) { if (Math.abs(p[axis]) > half) return null; }
    else { const a = (-half - p[axis]) / d[axis], b = (half - p[axis]) / d[axis];
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); }
    if (low > high) return null;
  }
  return low <= 1 && high >= 0 ? [low, high] as const : null;
}
/** Independent sufficient containment proof, not a first-hit/centre test. */
function containsCollider(mask: CameraCutawayFrameMask, c: Collider) {
  const inverse = new Quaternion(...mask.inverseQuaternion), center = point(mask.center);
  if (!mask.half.every(v => Number.isFinite(v) && v > 0)) return false;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const p = new Vector3(x * c.half.x, y * c.half.y, z * c.half.z).applyQuaternion(c.q).add(c.center).sub(center).applyQuaternion(inverse);
    if (axes.some((axis, i) => Math.abs(p[axis]) > mask.half[i] - 1e-7)) return false;
  }
  return true;
}
function insideMask(p: Vector3, mask: CameraCutawayFrameMask) {
  const local = p.clone().sub(point(mask.center)).applyQuaternion(new Quaternion(...mask.inverseQuaternion));
  return axes.every((axis, i) => Math.abs(local[axis]) <= mask.half[i] - 1e-7);
}
function insideCapsule(p: Vector3, plan: CameraCutawayFramePlan) {
  const a = point(plan.cameraCapsule.start), delta = point(plan.cameraCapsule.end).sub(a), lengthSq = delta.lengthSq();
  const closest = a.addScaledVector(delta, lengthSq ? Math.max(0, Math.min(1, p.clone().sub(a).dot(delta) / lengthSq)) : 0);
  return p.distanceToSquared(closest) < (plan.cameraCapsule.radius - 1e-7) ** 2;
}
function insideCone(p: Vector3, mask: CameraCutawayFrameMask, plan: CameraCutawayFramePlan) {
  const cone = plan.visualCone, a = point(cone.eye), delta = point(cone.target).sub(a), length = delta.length();
  if (length < 1e-8 || p.clone().sub(point(plan.feet)).dot(point(plan.up)) <= cone.minHeight) return false;
  const axis = delta.divideScalar(length), offset = p.clone().sub(a), along = offset.dot(axis);
  if (along < 0 || along >= length - cone.endOffset) return false;
  const radius = (cone.radiusAtEye + (cone.radiusAtTarget - cone.radiusAtEye) * along / length) * mask.amount;
  return offset.addScaledVector(axis, -along).length() < radius - 1e-7;
}

/** Certifies only this exact frame's endpoint and sweep. No reusable ignore-list
 * or arbitrary segment/radius query is exposed. Raw collisions remain evidence. */
export function certifyCameraFrame(proposal: GroundCameraFrameProposal, plan: CameraCutawayFramePlan,
  context: CameraFrameCollisionContext): CameraFrameCertificate {
  const { world } = context, { eye, previousEye, feet, up, direction } = proposal;
  const playable = context.visibilityPolicy === 'playable-central';
  const requiredRayIndices = playable ? [0, 1] : plan.rayTargets.map((_, index) => index);
  const avatarGeometryTested = !playable || context.avatarGeometryDiagnostics === true;
  const start = previousEye ?? eye, sweepLength = start.distanceTo(eye), reasons: string[] = [];
  const authentic = context.planCurrent(plan);
  if (!authentic) reasons.push('plan-not-current-or-authentic');
  if (plan.world !== world || plan.worldRevision !== world.revision || plan.planetId !== world.planetId) reasons.push('world-binding');
  if (![eye, start, feet, up, direction].every(finite) || proposal.probeRadius !== CAMERA_FRAME_RADIUS) reasons.push('invalid-query');
  if (!same(eye, plan.eye) || !same(feet, plan.feet) || !same(up, plan.up) || !same(direction, plan.direction)
    || (previousEye ? !plan.previousEye || !same(previousEye, plan.previousEye) : plan.previousEye !== null)) reasons.push('pose-binding');
  if (!same(start, plan.cameraCapsule.start) || !same(eye, plan.cameraCapsule.end) || plan.cameraCapsule.radius !== .22
    || plan.cameraCapsule.maxLength !== CAMERA_FRAME_MAX_SWEEP || Math.abs(plan.cameraCapsule.length - sweepLength) > 1e-9) reasons.push('capsule-binding');
  if (sweepLength > CAMERA_FRAME_MAX_SWEEP + 1e-7) reasons.push('sweep-volume-limit');
  if (!plan.ready || plan.reasons.length) reasons.push(...plan.reasons, 'plan-not-ready');
  if (plan.masks.length > 12 || new Set(plan.masks.map(m => m.objectId)).size > 4
    || plan.overflow.objects || plan.overflow.masks || new Set(plan.masks.map(m => m.key)).size !== plan.masks.length) reasons.push('mask-budget');
  if (plan.mandatoryParts.some(part => !plan.masks.some(mask => mask.physical && mask.key === part.key
    && mask.objectId === part.objectId && mask.partSlot === part.partSlot && part.colliderIndices.every(i => mask.colliderIndices.includes(i))))) reasons.push('mandatory-part-not-selected');
  const avatarBounds = context.avatarBounds;
  if (avatarBounds && (!avatarBounds.length || avatarBounds.some(box => box.corners.length !== 8 || box.corners.some(p => p.length !== 3 || !p.every(Number.isFinite))))) reasons.push('invalid-avatar-bounds');
  const actualPoints = avatarBounds?.flatMap(box => [...box.corners]);
  if (actualPoints && (actualPoints.length !== plan.opticalTargetPoints.length
    || actualPoints.some((p, i) => p.some((v, axis) => v !== plan.opticalTargetPoints[i]?.[axis])))) reasons.push('avatar-plan-binding');
  const bindingValid = !reasons.length;
  const masks = new Map<string, CameraCutawayFrameMask>();
  if (bindingValid && plan.cameraException) for (const mask of plan.masks) {
    if (!mask.physical || !mask.colliderBoundsContained || mask.amount !== 1 || mask.ownerSlot <= 0 || mask.partSlot <= 0
      || (mask.category !== 'wall' && mask.category !== 'roof')) continue;
    const body = world.bodies.find(b => b.objectId === mask.objectId);
    if (!body || !mask.colliderIndices.length) continue;
    const valid = mask.colliderIndices.every(index => Number.isInteger(index) && !!body.colliders[index]
      && !/door|leaf|foundation|floor|deck|beam|step|stair/i.test(body.colliders[index].tag)
      && containsCollider(mask, body.colliders[index]));
    if (valid) for (const index of mask.colliderIndices) masks.set(`${mask.objectId}:${index}`, mask);
  }
  const terrainSamples = { tested: 0, skippedByUpperBound: 0, exactHeightQueries: 0 };
  const query = (a: Vector3, b: Vector3, endpoint: boolean): CameraFrameQueryEvidence => {
    const raw: CameraFrameContact[] = [];
    const bounds = new Box3().setFromPoints([a, b]).expandByScalar((CAMERA_FRAME_RADIUS - .06) * Math.sqrt(3));
    for (const body of world.bodies) {
      if (body.cameraBounds && !body.cameraBounds.intersectsBox(bounds)) continue;
      body.colliders.forEach((c, index) => {
        const hit = interval(c, a, b, CAMERA_FRAME_RADIUS); if (!hit) return;
        const mask = masks.get(`${body.objectId}:${index}`);
        raw.push({ objectId: body.objectId, colliderIndex: index, tag: c.tag, fraction: hit[0], authorized: !!mask, maskKey: mask?.key ?? null });
      });
    }
    let terrainClear = true;
    const terrainCeiling = cameraTerrainRadiusUpperBound(world);
    for (let i = 0; i <= (endpoint ? 0 : 32); i++) {
      const p = a.clone().lerp(b, endpoint ? 0 : i / 32), radius = p.length();
      terrainSamples.tested++;
      if (terrainCeiling !== null && Number.isFinite(terrainCeiling) && radius >= terrainCeiling + CAMERA_FRAME_RADIUS) {
        terrainSamples.skippedByUpperBound++; continue;
      }
      terrainSamples.exactHeightQueries++;
      if (radius < world.radius(p.normalize().toArray() as [number, number, number]) + CAMERA_FRAME_RADIUS) { terrainClear = false; break; }
    }
    // A short outward ray preserves the existing ship endpoint contract while
    // the building endpoint above is an exact zero-length sphere query.
    const shipEnd = endpoint ? b.clone().addScaledVector(up, .001) : b;
    const shipLength = a.distanceTo(shipEnd), shipDistance = context.probeParked(a.clone(), shipEnd.clone(), CAMERA_FRAME_RADIUS);
    const rawShipClear = Number.isFinite(shipDistance) && shipDistance >= shipLength - 1e-7;
    const shipSafetyDistance = context.probeParkedSafety?.(a.clone(), shipEnd.clone(), CAMERA_FRAME_RADIUS) ?? -1;
    const shipSafetyClear = Number.isFinite(shipSafetyDistance) && shipSafetyDistance >= shipLength - 1e-7;
    const shipClear = rawShipClear && shipSafetyClear;
    const authorized = raw.filter(c => c.authorized), residual = raw.filter(c => !c.authorized);
    return { rawClear: !raw.length && terrainClear && rawShipClear, clear: !residual.length && terrainClear && shipClear,
      terrainClear, shipClear, rawShipClear, shipSafetyClear, shipDistance, shipSafetyDistance, raw, authorized, residual };
  };
  const endpoint = query(eye, eye, true), sweep = query(start, eye, false);
  const opticalResidual: CameraFrameCertificate['diagnostics']['optical']['residual'] = [];
  const avatarOptical: CameraFrameCertificate['diagnostics']['avatarOptical'] = { mode: avatarBounds ? 'current-avatar-boxes' : 'guard-rays',
    boxes: avatarBounds?.length ?? 0, tested: 0, reused: 0, disjointGuardHits: [], intersections: [] };
  const avatarShadowEnabled = bindingValid && !!avatarBounds;
  // The issuer freezes these exact pose/bounds-derived results. Existing
  // bindingValid checks still require authentic current plan, exact world
  // identity/revision, pose and every flat actual avatar corner number.
  const reusePlanShadow = avatarShadowEnabled && !!actualPoints && Object.isFrozen(plan)
    && Object.isFrozen(plan.opticalTargetPoints) && plan.opticalTargetPoints.every(Object.isFrozen)
    && Object.isFrozen(plan.opticalCandidates) && plan.opticalCandidates.every(Object.isFrozen);
  const candidateShadow = new Map<string, boolean>();
  const ambiguousCandidates = new Set<string>();
  if (reusePlanShadow) for (const candidate of plan.opticalCandidates) {
    const key = `${candidate.objectId}:${candidate.colliderIndex}`;
    if (typeof candidate.avatarShadowOverlap !== 'boolean' || ambiguousCandidates.has(key)) continue;
    const result = !candidate.avatarShadowOverlap;
    if (candidateShadow.has(key) && candidateShadow.get(key) !== result) {
      candidateShadow.delete(key); ambiguousCandidates.add(key);
    } else candidateShadow.set(key, result);
  }
  let disjoint: ReturnType<typeof createCameraAvatarShadowTest> | undefined;
  const shadowCache = new Map<string, boolean>();
  const outsideAvatar = (objectId: string, index: number) => {
    if (!avatarShadowEnabled) return false;
    const key = `${objectId}:${index}`, cached = shadowCache.get(key); if (cached !== undefined) return cached;
    const reused = candidateShadow.get(key);
    if (reused !== undefined) {
      shadowCache.set(key, reused); avatarOptical.tested++; avatarOptical.reused++; return reused;
    }
    disjoint ??= createCameraAvatarShadowTest(proposal, avatarBounds!);
    const c = world.bodies.find(b => b.objectId === objectId)?.colliders[index];
    const result = !!c && disjoint(c); shadowCache.set(key, result); avatarOptical.tested++; return result;
  };
  const exactResidual: CameraFrameCertificate['diagnostics']['exactResidual'] = { ...(playable ? { requiredRayIndices } : {}), providerErrors: [], calls: 0, elapsedMs: 0, clearedGuardHits: 0, originalResidual: [], proofs: [] };
  const exactCache = new Map<string, boolean>();
  let renderGeometry: CameraExactRenderGeometry | undefined;
  const exactCovered = (mask: CameraCutawayFrameMask, objectId: string, colliderIndex: number) => {
    if (!bindingValid || !avatarBounds || !context.avatarMeshes || !context.frameRenderGeometry) return false;
    // The physical component must be the same independently authorized
    // collider exception. Keep this bit in the cache key; never broaden it.
    const capsuleAuthorized = masks.get(`${objectId}:${colliderIndex}`) === mask;
    const key = `${mask.key}:${Number(capsuleAuthorized)}`, cached = exactCache.get(key);
    if (cached !== undefined) return cached;
    const started = performance.now(); exactResidual.calls++;
    try {
      renderGeometry ??= context.frameRenderGeometry(plan);
      const proof = proveCameraExactResidual({ eye, bounds: avatarBounds, avatarMeshes: context.avatarMeshes,
        plan, mask, render: renderGeometry, capsuleAuthorized });
      exactResidual.proofs.push(proof); exactCache.set(key, proof.covered); return proof.covered;
    } catch (error) { exactResidual.providerErrors.push(error instanceof Error ? error.message : 'render-provider-error'); exactCache.set(key, false); return false; }
    finally { exactResidual.elapsedMs += performance.now() - started; }
  };
  for (const hit of plan.rawHits) {
    const mask = bindingValid && hit.mappingValid && hit.eligible ? plan.masks.find(m => m.key === hit.maskKey) : undefined;
    const target = plan.rayTargets[hit.rayIndex], ray = target ? point(target).sub(eye).normalize() : undefined;
    const a = ray?.clone().multiplyScalar(hit.enter).add(eye), b = ray?.clone().multiplyScalar(hit.exit).add(eye);
    // Each of these sets is convex. Both interval endpoints in the same set
    // prove the entire hit interval is discarded, including start-inside hits.
    const covered = !!(mask && a && b && insideMask(a, mask) && insideMask(b, mask)
      && ((insideCone(a, mask, plan) && insideCone(b, mask, plan))
        || (mask.physical && masks.has(`${hit.objectId}:${hit.colliderIndex}`) && insideCapsule(a, plan) && insideCapsule(b, plan))));
    if (!covered && outsideAvatar(hit.objectId, hit.colliderIndex)) {
      avatarOptical.disjointGuardHits.push({ objectId: hit.objectId, colliderIndex: hit.colliderIndex, rayIndex: hit.rayIndex });
      continue;
    }
    if (!covered) {
      const original = { objectId: hit.objectId, colliderIndex: hit.colliderIndex, rayIndex: hit.rayIndex,
        reason: !hit.eligible || !hit.mappingValid ? hit.reason : 'hit-not-fully-covered-by-selected-render-volume' };
      exactResidual.originalResidual.push(original);
      // Peripheral contacts remain raw diagnostics under the playable policy.
      // Only required central rays may spend exact proof work or clear a guard.
      if (mask && (!playable || requiredRayIndices.includes(hit.rayIndex)) && exactCovered(mask, hit.objectId, hit.colliderIndex)) { exactResidual.clearedGuardHits++; continue; }
      opticalResidual.push(original);
    }
  }
  const avatarGeometrySeparation: NonNullable<CameraFrameCertificate['diagnostics']['avatarGeometrySeparation']> = {
    proofs: [], cleared: [], remaining: [], providerErrors: [],
  };
  let exactAvatarShadow: ReturnType<typeof createCameraExactAvatarShadowTest> | undefined;
  const exactAvatarSeparationCache = new Map<string, boolean>();
  const actualAvatarDisjoint = (objectId: string, colliderIndex: number, coarseReason: string) => {
    if (!avatarGeometryTested || !bindingValid || !avatarBounds || !context.avatarMeshes) return false;
    const key = `${objectId}:${colliderIndex}`, cached = exactAvatarSeparationCache.get(key);
    if (cached !== undefined) return cached;
    const collider = world.bodies.find(body => body.objectId === objectId)?.colliders[colliderIndex];
    if (!collider) return false;
    let separated = false;
    try {
      exactAvatarShadow ??= createCameraExactAvatarShadowTest(proposal, avatarBounds, context.avatarMeshes, plan.frameId);
      const evidence = exactAvatarShadow(collider);
      avatarGeometrySeparation.proofs.push({ frameId: plan.frameId, objectId, colliderIndex, coarseReason,
        collider: { center: collider.center.toArray(), half: collider.half.toArray(), quaternion: collider.q.toArray() }, evidence });
      separated = evidence.disjoint;
    } catch (error) {
      avatarGeometrySeparation.providerErrors.push(error instanceof Error ? error.message : 'actual-avatar-separation-provider-error');
    }
    exactAvatarSeparationCache.set(key, separated); return separated;
  };
  // The guard rays alone can miss a narrow protected object between rays.
  // Inspect every classified collider in the actual-avatar broadphase too.
  if (avatarShadowEnabled) for (const candidate of plan.opticalCandidates) {
    if (candidate.mappingValid && candidate.eligible && candidate.maskKey
      && plan.masks.some(mask => mask.key === candidate.maskKey)) continue;
    if (outsideAvatar(candidate.objectId, candidate.colliderIndex)) continue;
    const intersection = { objectId: candidate.objectId, colliderIndex: candidate.colliderIndex,
      reason: !candidate.mappingValid || !candidate.eligible ? 'protected-avatar-shadow-overlap' : 'unselected-avatar-shadow-overlap' };
    // Preserve the original box-shadow negative. This grants no render mask,
    // physical exemption, missing-geometry permission or guard-ray clearance.
    avatarOptical.intersections.push(intersection);
    if (actualAvatarDisjoint(candidate.objectId, candidate.colliderIndex, intersection.reason)) avatarGeometrySeparation.cleared.push(intersection);
    else avatarGeometrySeparation.remaining.push(intersection);
  }
  if (!playable && avatarGeometrySeparation.remaining.length) reasons.push('actual-avatar-optical-blocked');
  const externalOptical = plan.rayTargets.map((target, rayIndex) => {
    const end = point(target), length = eye.distanceTo(end);
    let terrainClear = true;
    const terrainCeiling = cameraTerrainRadiusUpperBound(world);
    for (let i = 0; i <= 32; i++) {
      const p = eye.clone().lerp(end, i / 32), radius = p.length();
      terrainSamples.tested++;
      if (terrainCeiling !== null && Number.isFinite(terrainCeiling) && radius >= terrainCeiling + .12) {
        terrainSamples.skippedByUpperBound++; continue;
      }
      terrainSamples.exactHeightQueries++;
      if (radius < world.radius(p.normalize().toArray() as [number, number, number]) + .12) { terrainClear = false; break; }
    }
    const shipDistance = context.probeParked(eye.clone(), end.clone(), 0);
    const rawShipClear = Number.isFinite(shipDistance) && shipDistance >= length - 1e-7;
    const shipSafetyDistance = context.probeParkedSafety?.(eye.clone(), end.clone(), 0) ?? -1;
    const shipSafetyClear = Number.isFinite(shipSafetyDistance) && shipSafetyDistance >= length - 1e-7;
    const shipClear = rawShipClear && shipSafetyClear;
    return { rayIndex, terrainClear, shipClear, rawShipClear, shipSafetyClear, shipDistance, shipSafetyDistance, length };
  });
  const requiredExternal = requiredRayIndices.map(index => externalOptical[index]);
  const requiredExternalBlockedRayIndices = requiredRayIndices.filter((_, index) => !requiredExternal[index]
    || !requiredExternal[index].terrainClear || !requiredExternal[index].shipClear);
  if (!requiredExternal.length || requiredExternalBlockedRayIndices.length) reasons.push('external-optical-blocked');
  if (!endpoint.clear) reasons.push('endpoint-blocked');
  if (!sweep.clear) reasons.push('sweep-blocked');
  const requiredOpticalResidual = playable ? opticalResidual.filter(hit => requiredRayIndices.includes(hit.rayIndex)) : opticalResidual;
  if (requiredOpticalResidual.length) reasons.push('protected-or-uncovered-optical');
  const diagnostics: CameraFrameCertificate['diagnostics'] = { schema: 'local-camera-frame-v1', frameId: plan.frameId,
    worldRevision: plan.worldRevision, planetId: plan.planetId, bindingVersion: plan.bindingVersion, continuityGeneration: plan.continuityGeneration,
    exceptionsExplicit: endpoint.authorized.length + sweep.authorized.length > 0,
    eye: eye.toArray(), previousEye: previousEye?.toArray() ?? null, radius: proposal.probeRadius, sweepLength, maximumSweep: CAMERA_FRAME_MAX_SWEEP,
    endpoint, sweep, avatarOptical,
    ...(playable ? { visibilityPolicy: { mode: 'playable-central' as const, requiredRayIndices, avatarShadowRequired: false,
      requiredOpticalResidual, requiredExternalBlockedRayIndices, avatarGeometryTested: exactAvatarSeparationCache.size > 0 } } : {}),
    // Preserve the existing diagnostic shape unless exact-avatar refinement
    // has a provider and an original coarse intersection to investigate.
    ...(context.avatarMeshes && avatarOptical.intersections.length ? { avatarGeometrySeparation } : {}), terrainSamples, exactResidual, externalOptical, optical: { raw: plan.rawHits.length, covered: plan.rawHits.length - exactResidual.originalResidual.length - avatarOptical.disjointGuardHits.length, residual: opticalResidual }, reasons };
  return { accepted: reasons.length === 0, plan, endpointClear: endpoint.clear, sweepClear: sweep.clear,
    protectedOpticalClear: !requiredOpticalResidual.length && (playable || !avatarGeometrySeparation.remaining.length)
      && !!requiredExternal.length && !requiredExternalBlockedRayIndices.length, rawEndpointClear: endpoint.rawClear, rawSweepClear: sweep.rawClear, diagnostics };
}
