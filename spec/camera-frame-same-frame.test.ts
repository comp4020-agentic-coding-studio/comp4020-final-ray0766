import { describe, expect, it, vi } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { certifyCameraFrame } from '../src/client/camera-frame-collision.ts';
import { certifyCameraFrame as baseline } from './fixtures/camera-frame-collision-baseline.ts';
import { createCameraAvatarShadowTest as originalShadow } from './fixtures/camera-avatar-shadow-baseline.ts';
import type { CameraFrameCollisionContext, GroundCameraFrameProposal } from '../src/client/camera-frame-collision.ts';
import type { CameraCutawayFramePlan } from '../src/client/camera-cutaway-plan.ts';
import type { GroundWorld } from '../src/shared/physics/world.ts';
// Synthetic ceiling answers test only the collision implication. Production
// provenance/identity checks belong to the separately tested world helper.
vi.mock('../src/shared/physics/world.ts', () => ({ cameraTerrainRadiusUpperBound: (world: { testTerrainCeiling?: number | null }) => world.testTerrainCeiling ?? null }));
function fixture(x = 0, frozen = true, listed = true) {
  const proposal: GroundCameraFrameProposal = { eye: new Vector3(0, 2, 0), direction: new Vector3(0, 0, 1),
    up: new Vector3(0, 1, 0), feet: new Vector3(), probeRadius: .2 };
  const collider = { center: new Vector3(x, 2, 2), half: new Vector3(.1, .1, .2), q: new Quaternion(), inverse: new Quaternion(), tag: 'protected' };
  const world = { planetId: 'mock-world', revision: 1, radius: () => 0, bodies: [{ objectId: 'test', colliders: [collider] }] } as unknown as GroundWorld;
  const corners: [number, number, number][] = [];
  for (const a of [-.5, .5]) for (const b of [1.5, 2.5]) for (const c of [3.5, 4.5]) corners.push([a, b, c]);
  const bounds = [{ label: 'actual', corners }];
  const plan = { frameId: 3, bindingVersion: 2, continuityGeneration: 0, world, worldRevision: 1, planetId: 'mock-world', masks: [],
    eye: proposal.eye.toArray(), previousEye: null, feet: proposal.feet.toArray(), up: proposal.up.toArray(), direction: proposal.direction.toArray(),
    ready: true, reasons: [], cameraException: false, mandatoryParts: [], visualRequiredParts: [],
    opticalCandidates: listed ? [{ objectId: 'test', colliderIndex: 0, category: 'protected', mappingValid: false,
      eligible: false, partSlot: 0, maskKey: null, avatarShadowOverlap: !originalShadow(proposal, bounds)(collider) }] : [],
    opticalTargetPoints: corners.map(p => [...p]), overflow: { objects: 0, masks: 0, protected: 0 },
    rayTargets: Array.from({ length: 9 }, () => [0, 2, 4]), rawHits: Array.from({ length: 9 }, (_, rayIndex) => ({ objectId: 'test', colliderIndex: 0,
      rayIndex, enter: 1.8, exit: 2.2, eligible: false, mappingValid: false, maskKey: null, reason: 'protected' })),
    visualCone: { eye: proposal.eye.toArray(), target: [0, 2, 4], length: 4, radiusAtEye: 1, radiusAtTarget: 1, minHeight: 0, endOffset: .08 },
    cameraCapsule: { start: proposal.eye.toArray(), end: proposal.eye.toArray(), radius: .22, length: 0, maxLength: 1 } } as unknown as CameraCutawayFramePlan;
  if (frozen) { plan.opticalTargetPoints.forEach(Object.freeze); Object.freeze(plan.opticalTargetPoints);
    plan.opticalCandidates.forEach(Object.freeze); Object.freeze(plan.opticalCandidates); Object.freeze(plan); }
  const context: CameraFrameCollisionContext = { world, avatarBounds: bounds, planCurrent: () => true,
    probeParked: (a, b) => a.distanceTo(b), probeParkedSafety: (a, b) => a.distanceTo(b) };
  return { proposal, plan, context, collider };
}
function comparable(c: ReturnType<typeof certifyCameraFrame> | ReturnType<typeof baseline>) {
  const copy = JSON.parse(JSON.stringify({ ...c, plan: undefined })); delete copy.diagnostics.avatarOptical.reused;
  // Optional workload counters do not alter the original certificate evidence.
  delete copy.diagnostics.terrainSamples;
  return copy;
}
describe('same-frame authenticated optical candidate reuse', () => {
  it.each([0, .1, .25, .5, 1, 3, -3])('exactly preserves prior certificate for collider x=%s', x => {
    const f = fixture(x), before = baseline(f.proposal, f.plan, f.context), after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(comparable(after)).toEqual(comparable(before)); expect(after.diagnostics.avatarOptical.reused).toBe(1);
    expect(after.diagnostics.avatarOptical.tested).toBe(1);
  });
  it('keeps original calculation for a raw collider absent from the candidate list', () => {
    const f = fixture(3, true, false), before = baseline(f.proposal, f.plan, f.context), after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(comparable(after)).toEqual(comparable(before)); expect(after.diagnostics.avatarOptical.reused).toBe(0);
  });
  it('does not trust mutable plans or their mutable derived result lists', () => {
    const f = fixture(0, false); f.plan.opticalCandidates[0].avatarShadowOverlap = false;
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(after.accepted).toBe(false); expect(after.diagnostics.avatarOptical.reused).toBe(0);
    expect(comparable(after)).toEqual(comparable(baseline(f.proposal, f.plan, f.context)));
  });
  it.each(['auth', 'revision', 'world', 'pose', 'bounds'] as const)('refuses reuse when %s binding fails', failure => {
    const f = fixture(3);
    if (failure === 'auth') f.context.planCurrent = () => false;
    if (failure === 'revision') Object.defineProperty(f.context.world, 'revision', { value: 2 });
    if (failure === 'world') f.context.world = { ...f.context.world } as GroundWorld;
    if (failure === 'pose') f.proposal.eye.x += 1e-12;
    if (failure === 'bounds') (f.context.avatarBounds![0].corners[0] as unknown as number[])[0] += 1e-12;
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(after.accepted).toBe(false); expect(after.diagnostics.avatarOptical.reused).toBe(0);
    expect(comparable(after)).toEqual(comparable(baseline(f.proposal, f.plan, f.context)));
  });
});

describe('conservative terrain ceiling implication', () => {
  it('skips height queries at exact padding equality while preserving all 331 original sample positions', () => {
    const f = fixture(3); let calls = 0;
    f.context.world.radius = () => { calls++; return 1.8; };
    Object.assign(f.context.world, { testTerrainCeiling: 1.8 });
    const before = baseline(f.proposal, f.plan, f.context), baselineCalls = calls; calls = 0;
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(comparable(after)).toEqual(comparable(before)); expect(baselineCalls).toBe(331); expect(calls).toBe(0);
    expect(after.diagnostics.terrainSamples).toEqual({ tested: 331, skippedByUpperBound: 331, exactHeightQueries: 0 });
  });
  it('keeps original exact queries near the terrain and preserves early blocking', () => {
    const f = fixture(3); let calls = 0;
    f.context.world.radius = () => { calls++; return 1.95; };
    Object.assign(f.context.world, { testTerrainCeiling: 2.5 });
    const before = baseline(f.proposal, f.plan, f.context); calls = 0;
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(comparable(after)).toEqual(comparable(before));
    expect(after.endpointClear).toBe(false); expect(after.diagnostics.terrainSamples.skippedByUpperBound).toBe(0);
    expect(calls).toBe(after.diagnostics.terrainSamples.tested);
  });
  it('keeps exact near samples and skips only provably high samples in the same dense loop', () => {
    const f = fixture(3); let calls = 0;
    f.context.world.radius = () => { calls++; return 1.7; }; Object.assign(f.context.world, { testTerrainCeiling: 2.5 });
    const before = baseline(f.proposal, f.plan, f.context); calls = 0;
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(comparable(after)).toEqual(comparable(before)); expect(after.diagnostics.terrainSamples.tested).toBe(331);
    expect(after.diagnostics.terrainSamples.skippedByUpperBound).toBeGreaterThan(0);
    expect(after.diagnostics.terrainSamples.exactHeightQueries).toBeGreaterThan(0);
    expect(calls).toBe(after.diagnostics.terrainSamples.exactHeightQueries);
    expect(after.diagnostics.terrainSamples.exactHeightQueries + after.diagnostics.terrainSamples.skippedByUpperBound).toBe(331);
  });
  it.each([null, NaN, Infinity])('falls back completely for unavailable/invalid upper bound %s', ceiling => {
    const f = fixture(3); let calls = 0;
    f.context.world.radius = () => { calls++; return 0; }; Object.assign(f.context.world, { testTerrainCeiling: ceiling });
    const after = certifyCameraFrame(f.proposal, f.plan, f.context);
    expect(after.diagnostics.terrainSamples).toEqual({ tested: 331, skippedByUpperBound: 0, exactHeightQueries: 331 });
    expect(calls).toBe(331);
  });
});
