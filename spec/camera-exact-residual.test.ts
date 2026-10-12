import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { clipCameraResidualPolygon, proveCameraExactResidual } from '../src/client/camera-exact-residual.ts';
import type { CameraExactRenderGeometry } from '../src/client/camera-exact-residual.ts';
import type { CameraCutawayFramePlan } from '../src/client/camera-cutaway-plan.ts';
function fixture(triangle = [-.1, 1.9, 2, .1, 1.9, 2, 0, 2.1, 2]) {
  const avatar = new BoxGeometry(1, 1, 1), matrixWorld = new Matrix4().makeTranslation(0, 2, 4);
  const corners = [];
  for (const x of [-.5, .5]) for (const y of [1.5, 2.5]) for (const z of [3.5, 4.5]) corners.push([x, y, z] as const);
  const mask = { key: 'test:1', objectId: 'test', ownerSlot: 1, partSlot: 1, amount: 1, physical: false,
    center: [0, 2, 2], half: [2, 3, 4], inverseQuaternion: [0, 0, 0, 1] } as unknown as CameraCutawayFramePlan['masks'][number];
  const plan = { frameId: 3, bindingVersion: 2, masks: [mask], eye: [0, 2, 0], feet: [0, 0, 0], up: [0, 1, 0],
    visualCone: { eye: [0, 2, 0], target: [0, 2, 4.5], length: 4.5, radiusAtEye: 1, radiusAtTarget: 1, minHeight: 0, endOffset: .1 },
    cameraCapsule: { start: [0, 2, 0], end: [0, 2, 0], radius: .22 } } as unknown as CameraCutawayFramePlan;
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(triangle, 3));
  const render: CameraExactRenderGeometry = { ready: true, reasons: [], frameId: 3, bindingVersion: 2, parts: [{ mask, batches: [{ geometry,
    positions: geometry.getAttribute('position'), triangleVertexIndices: new Uint32Array([0, 1, 2]), matrixWorld: new Matrix4(), geometryId: 'fixture-complete-part' }] }] };
  const input = { eye: new Vector3(0, 2, 0), bounds: [{ label: 'upper', corners }], avatarMeshes: [{ label: 'upper', geometry: avatar, matrixWorld }], plan, mask, render, capsuleAuthorized: false };
  return { input, proof: () => proveCameraExactResidual(input), geometry, avatar };
}
describe('strict complete rendered-part residual proof', () => {
  it('proves an interior complete real triangle, reuses static local hull and keeps references', () => {
    const f = fixture(); const first = f.proof(), second = f.proof();
    expect(first.covered).toBe(true); expect(first.intersections).toBe(1); expect(first.minimumMargin).toBeGreaterThan(0);
    expect(first.hullCacheBuilds).toBe(1); expect(second.hullCacheBuilds).toBe(0);
    expect(second.partGeometry[0].geometryId).toBe('fixture-complete-part'); expect(second.avatarGeometry[0].matrixWorld).toHaveLength(16);
    f.avatar.getAttribute('position').needsUpdate = true; expect(f.proof().hullCacheBuilds).toBe(1);
  });
  it('rejects neighboring genuinely surviving foreground geometry at the end plane', () => {
    const f = fixture([-.1, 1.9, 3, .1, 1.9, 3, 0, 2.1, 3]);
    f.input.plan.visualCone.endOffset = 1.51;
    expect(f.proof().reason).toBe('surviving-or-boundary-intersection');
  });
  it.each(['height', 'start', 'radial', 'amount', 'mask', 'end'] as const)('checks the %s shader boundary', boundary => {
    const f = fixture();
    if (boundary === 'height') f.input.plan.visualCone.minHeight = 2;
    if (boundary === 'start') { f.input.plan.visualCone.eye = [0, 2, 2.1]; f.input.plan.visualCone.length = 2.4; }
    if (boundary === 'radial') { f.input.plan.visualCone.radiusAtEye = .01; f.input.plan.visualCone.radiusAtTarget = .01; }
    if (boundary === 'amount') f.input.mask.amount = .01;
    if (boundary === 'mask') f.input.mask.half = [.01, 3, 4];
    if (boundary === 'end') f.input.plan.visualCone.endOffset = 2.5;
    expect(f.proof().covered).toBe(false);
  });
  it('never assigns different polygon vertices to different union components', () => {
    const f = fixture([.2, 2, 1.95, 0, 2, 2.4, .2, 2.02, 1.95]);
    f.input.mask.physical = true; f.input.capsuleAuthorized = true;
    f.input.plan.visualCone.target = [0, 2, 2.15]; f.input.plan.visualCone.length = 2.15;
    f.input.plan.cameraCapsule.start = [0, 2, 2.25]; f.input.plan.cameraCapsule.end = [0, 2, 2.5];
    expect(f.proof().covered).toBe(false);
  });
  it('requires independent physical authorization even when shader capsule contains every point', () => {
    const f = fixture(); f.input.mask.physical = true; f.input.plan.visualCone.minHeight = 9;
    f.input.plan.cameraCapsule.start = [0, 2, 1.5]; f.input.plan.cameraCapsule.end = [0, 2, 2.5];
    expect(f.proof().covered).toBe(false); f.input.capsuleAuthorized = true; expect(f.proof().covered).toBe(true);
  });
  it.each(['missing-avatar', 'wrong-label', 'bounds', 'generation', 'incomplete', 'wrong-mask', 'singular', 'nonfinite'] as const)('fails closed on %s', issue => {
    const f = fixture();
    if (issue === 'missing-avatar') f.input.avatarMeshes = [];
    if (issue === 'wrong-label') f.input.avatarMeshes[0].label = 'other';
    if (issue === 'bounds') f.input.bounds[0].corners = f.input.bounds[0].corners.map(p => [p[0] + .1, p[1], p[2]] as const);
    if (issue === 'generation') f.input.render.bindingVersion++;
    if (issue === 'incomplete') { f.input.render.ready = false; }
    if (issue === 'wrong-mask') f.input.render.parts = [{ ...f.input.render.parts[0], mask: { ...f.input.mask } }];
    if (issue === 'singular') f.input.avatarMeshes[0].matrixWorld.makeScale(0, 1, 1);
    if (issue === 'nonfinite') f.geometry.getAttribute('position').setX(0, NaN);
    expect(f.proof().covered).toBe(false);
  });
  it('retains exact point, line, and zero-area contact when clipping closed halfspaces', () => {
    const plane = { n: new Vector3(1, 0, 0), d: 0 };
    const point = clipCameraResidualPolygon([new Vector3(0, 0, 0), new Vector3(1, 1, 0), new Vector3(1, -1, 0)], [plane]);
    expect(point).toHaveLength(1);
    const line = clipCameraResidualPolygon([new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(1, 0, 0)], [plane]);
    expect(line).toHaveLength(2);
    expect(clipCameraResidualPolygon([new Vector3(0, 0, 0)], [plane])).toHaveLength(1);
  });
});
