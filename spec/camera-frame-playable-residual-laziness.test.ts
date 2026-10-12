import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { certifyCameraFrame } from '../src/client/camera-frame-collision.ts';
import type { CameraCutawayFramePlan } from '../src/client/camera-cutaway-plan.ts';
import type { GroundWorld } from '../src/shared/physics/world.ts';
function frame(triangleZ = 1.9, proxyEnd = 2.2) {
  const eye = new Vector3(0, 2, 0), direction = new Vector3(0, 0, 1), up = new Vector3(0, 1, 0), feet = new Vector3();
  const collider = { center: new Vector3(0, 2, (1.8 + proxyEnd) / 2), half: new Vector3(.1, .1, (proxyEnd - 1.8) / 2), q: new Quaternion(), inverse: new Quaternion(), tag: 'wall.solid' };
  const world = { planetId: 'mock-world', revision: 1, radius: () => 0, bodies: [{ objectId: 'test', colliders: [collider] }] } as unknown as GroundWorld;
  const mask = { key: 'test:1', objectId: 'test', ownerSlot: 1, partSlot: 1, amount: 1, physical: false,
    category: 'wall', center: [0, 2, 2], half: [2, 3, 4], inverseQuaternion: [0, 0, 0, 1], colliderIndices: [0] } as unknown as CameraCutawayFramePlan['masks'][number];
  const corners = [];
  for (const x of [-.5, .5]) for (const y of [1.5, 2.5]) for (const z of [3.5, 4.5]) corners.push([x, y, z] as const);
  const bounds = [{ label: 'upper', corners }];
  const plan = { frameId: 3, bindingVersion: 2, continuityGeneration: 0, world, worldRevision: 1, planetId: 'mock-world', masks: [mask],
    eye: eye.toArray(), previousEye: null, feet: feet.toArray(), up: up.toArray(), direction: direction.toArray(),
    ready: true, reasons: [], cameraException: false, mandatoryParts: [], visualRequiredParts: [], opticalCandidates: [],
    opticalTargetPoints: corners, overflow: { objects: 0, masks: 0, protected: 0 },
    rayTargets: Array.from({ length: 9 }, () => [0, 2, 4]), rawHits: Array.from({ length: 9 }, (_, rayIndex) => ({ objectId: 'test', colliderIndex: 0,
      rayIndex, enter: 1.8, exit: proxyEnd, eligible: true, mappingValid: true, maskKey: mask.key, reason: 'eligible' })),
    visualCone: { eye: eye.toArray(), target: [0, 2, 4], length: 4, radiusAtEye: 1, radiusAtTarget: 1, minHeight: 0, endOffset: 1.95 },
    cameraCapsule: { start: eye.toArray(), end: eye.toArray(), radius: .22, length: 0, maxLength: 1 } } as unknown as CameraCutawayFramePlan;
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-.1, 1.9, triangleZ, .1, 1.9, triangleZ, 0, 2.1, triangleZ], 3));
  const provider = vi.fn(() => ({ ready: true, reasons: [], frameId: 3, bindingVersion: 2, parts: [{ mask, batches: [{ geometry,
    positions: geometry.getAttribute('position'), triangleVertexIndices: new Uint32Array([0, 1, 2]), matrixWorld: new Matrix4(), geometryId: 'complete-mock-part' }] }] }));
  const certificate = (visibilityPolicy: 'strict-avatar' | 'playable-central' = 'strict-avatar', selected = plan) => certifyCameraFrame({ eye, direction, up, feet, probeRadius: .2 }, selected, { visibilityPolicy, world, avatarBounds: bounds,
    avatarMeshes: [{ label: 'upper', geometry: new BoxGeometry(1, 1, 1), matrixWorld: new Matrix4().makeTranslation(0, 2, 4) }],
    planCurrent: () => true, frameRenderGeometry: provider, probeParked: (a, b) => a.distanceTo(b), probeParkedSafety: (a, b) => a.distanceTo(b) });
  return { certificate, provider, plan };
}
describe('playable camera avoids diagnostic-only exact residual work', () => {
  it('retains every peripheral raw residual without calling the render provider', () => {
    const f = frame(), plan = { ...f.plan, rawHits: f.plan.rawHits.filter(hit => hit.rayIndex >= 2) };
    const result = f.certificate('playable-central', plan);
    expect(result.accepted).toBe(true); expect(result.diagnostics.exactResidual.requiredRayIndices).toEqual([0,1]); expect(result.diagnostics.exactResidual.calls).toBe(0);
    expect(f.provider).not.toHaveBeenCalled(); expect(result.diagnostics.exactResidual.proofs).toEqual([]);
    expect(result.diagnostics.exactResidual.clearedGuardHits).toBe(0);
    expect(result.diagnostics.exactResidual.originalResidual).toHaveLength(7);
    expect(result.diagnostics.optical.residual).toEqual(result.diagnostics.exactResidual.originalResidual);
    expect(result.diagnostics.visibilityPolicy!.requiredOpticalResidual).toEqual([]);
    expect(result.diagnostics.optical.raw).toBe(7); expect(result.diagnostics.optical.covered).toBe(0);
  });
  it('still obtains complete exact geometry for central rays and preserves peripheral negatives', () => {
    const f = frame(), result = f.certificate('playable-central');
    expect(result.accepted).toBe(true); expect(f.provider).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.exactResidual.calls).toBe(1); expect(result.diagnostics.exactResidual.proofs).toHaveLength(1);
    expect(result.diagnostics.exactResidual.clearedGuardHits).toBe(2);
    expect(result.diagnostics.exactResidual.originalResidual).toHaveLength(9);
    expect(result.diagnostics.optical.residual.map(hit => hit.rayIndex)).toEqual([2,3,4,5,6,7,8]);
    expect(result.diagnostics.visibilityPolicy!.requiredOpticalResidual).toEqual([]);
    const strict = f.certificate(); expect(strict.accepted).toBe(true); expect(strict.diagnostics.exactResidual).not.toHaveProperty('requiredRayIndices');
    expect(strict.diagnostics.exactResidual.clearedGuardHits).toBe(9); expect(strict.diagnostics.optical.residual).toEqual([]);
  });
  it('keeps failed central rendered-geometry proof hard', () => {
    const f = frame(2.1), result = f.certificate('playable-central');
    expect(f.provider).toHaveBeenCalledTimes(1); expect(result.accepted).toBe(false);
    expect(result.diagnostics.reasons).toContain('protected-or-uncovered-optical');
    expect(result.diagnostics.visibilityPolicy!.requiredOpticalResidual.map(hit => hit.rayIndex)).toEqual([0,1]);
    expect(result.diagnostics.optical.residual).toHaveLength(9); expect(result.diagnostics.exactResidual.clearedGuardHits).toBe(0);
  });
});
