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
  const certificate = () => certifyCameraFrame({ eye, direction, up, feet, probeRadius: .2 }, plan, { world, avatarBounds: bounds,
    avatarMeshes: [{ label: 'upper', geometry: new BoxGeometry(1, 1, 1), matrixWorld: new Matrix4().makeTranslation(0, 2, 4) }],
    planCurrent: () => true, frameRenderGeometry: provider, probeParked: (a, b) => a.distanceTo(b), probeParkedSafety: (a, b) => a.distanceTo(b) });
  return { certificate, provider, plan };
}
describe('lazy exact residual frame integration', () => {
  it('retains all nine original uncovered raw hits while separately proving complete residual disjointness', () => {
    const f = frame(), c = f.certificate();
    expect(c.accepted).toBe(true); expect(f.plan.rawHits).toHaveLength(9); expect(c.diagnostics.optical.raw).toBe(9);
    expect(c.diagnostics.exactResidual.originalResidual).toHaveLength(9); expect(c.diagnostics.optical.covered).toBe(0);
    expect(c.diagnostics.optical.residual).toHaveLength(0); expect(c.diagnostics.exactResidual.clearedGuardHits).toBe(9);
    expect(c.diagnostics.exactResidual.calls).toBe(1); expect(f.provider).toHaveBeenCalledTimes(1);
    expect(c.diagnostics.exactResidual.proofs[0].triangles).toBe(1);
  });
  it('rejects a nearby true rendered wall triangle and preserves every original hit', () => {
    const f = frame(2.1), c = f.certificate();
    expect(c.accepted).toBe(false); expect(c.diagnostics.optical.residual).toHaveLength(9);
    expect(c.diagnostics.exactResidual.originalResidual).toHaveLength(9); expect(c.diagnostics.exactResidual.clearedGuardHits).toBe(0);
  });
  it('does zero exact work when existing interval coverage already proves the frame', () => {
    const f = frame(1.9, 1.95), c = f.certificate();
    expect(c.accepted).toBe(true); expect(c.diagnostics.exactResidual.calls).toBe(0); expect(c.diagnostics.exactResidual.proofs).toHaveLength(0);
    expect(f.provider).not.toHaveBeenCalled();
  });
});
