import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { certifyCameraFrame, CAMERA_FRAME_MAX_SWEEP, CAMERA_FRAME_RADIUS } from '../src/client/camera-frame-collision.ts';
import type { GroundCameraFrameProposal } from '../src/client/camera-frame-collision.ts';
import type { CameraCutawayFramePlan } from '../src/client/camera-cutaway-plan.ts';
import { TownCameraCutaway } from '../src/client/camera-cutaway.ts';
import { buildCameraBlueprintModel, cameraBlueprintRegistry } from '../src/client/camera-blueprint-model.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import type { PartId } from '../src/shared/blueprint-parts.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import type { PlacedObject } from '../src/shared/planets.ts';
import { cameraEyePenetration } from './ground-camera-safety.ts';
import { CameraShipCollision } from '../src/client/camera-ship-collision.ts';
import { createShipModel } from '../src/assets/claude-geometry/ship/factory.ts';
import { STARTERS } from '../src/assets/claude-geometry/ship/design.ts';
import { createCameraAvatarShadowTest } from '../src/client/camera-avatar-shadow.ts';

const up = new T.Vector3(0, 1, 0), direction = new T.Vector3(0, 0, 1);
const noShip = (start: T.Vector3, end: T.Vector3) => start.distanceTo(end);
function fixture(partId: PartId = 'wall.solid', count = 1, ownerCount = 1, undersize = false) {
  // Coincident distinct parts/owners are deliberate only in capacity tests;
  // no saved building or placement rules are changed by these CPU fixtures.
  const parts: PartPlacement[] = Array.from({ length: count }, (_, n) => ({ n: n + 1, part: partId, x: 2, z: 2,
    level: partId.startsWith('roof.') ? 1 : 0, rot: 0 }));
  const objects: PlacedObject[] = Array.from({ length: ownerCount }, (_, n) => ({ id: `frame-owner-${n}`, kind: 'structure', position: [0, 1, 0],
    rotation: 0, version: 1, blueprintHash: 'frame-kit', ...structureSize(parts) }));
  const planet = { id: 'frame-world', revision: 4, radius: 12, environment: null, objects, blueprints: { 'frame-kit': parts } };
  const world = new GroundWorld(planet), library = new StyleLibrary('medium', { look: 'village', scans: false });
  const registry = objects.flatMap(object => cameraBlueprintRegistry(object, parts, structureFit(parts, object.position, object.rotation, fieldOf(null, 12))));
  if (undersize) registry[0].half = registry[0].half.map(v => v * .25) as [number, number, number];
  const cut = new TownCameraCutaway(objects.map(o => o.id), registry, planet.id);
  const models = objects.map(object => {
    const model = buildCameraBlueprintModel(parts, library, 'medium');
    model.object.traverse(node => { if (node instanceof T.Mesh) { cut.writeOwnerAttribute(node.geometry, object.id); cut.registerMesh(node); } });
    return model;
  });
  const collider = world.bodies[0].colliders.find(c => c.tag !== 'foundation')!;
  const eye = collider.center.clone(), feet = eye.clone().addScaledVector(direction, 2).addScaledVector(up, -1.16);
  const proposal = (point = eye, previousEye?: T.Vector3): GroundCameraFrameProposal => ({ eye: point.clone(), previousEye: previousEye?.clone(), feet: feet.clone(), up: up.clone(), direction: direction.clone(), probeRadius: .2 });
  const plan = (p: GroundCameraFrameProposal, cameraException = true, diagnostics = true) => cut.planFrame({ ...p, world, dt: 1 / 60, cameraException, diagnostics });
  const certify = (p: GroundCameraFrameProposal, selected: CameraCutawayFramePlan, parked: (start: T.Vector3, end: T.Vector3, radius: number) => number = noShip) => certifyCameraFrame(p, selected,
    { world, planCurrent: candidate => cut.validateFramePlan(candidate), probeParked: parked, probeParkedSafety: noShip });
  return { parts, objects, planet, world, library, registry, cut, models, collider, eye, feet, proposal, plan, certify,
    dispose() { cut.dispose(); for (const model of models) model.dispose(); library.dispose(); } };
}
function contained(collider: GroundWorld['bodies'][number]['colliders'][number], mask: CameraCutawayFramePlan['masks'][number]) {
  const inverse = new T.Quaternion(...mask.inverseQuaternion), center = new T.Vector3(...mask.center);
  // Independent all-eight-corner sufficient proof. A collider centre alone
  // cannot authorize a larger rotated collision proxy through a small mask.
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const local = new T.Vector3(x * collider.half.x, y * collider.half.y, z * collider.half.z)
      .applyQuaternion(collider.q).add(collider.center).sub(center).applyQuaternion(inverse);
    if (local.toArray().some((v, i) => Math.abs(v) > mask.half[i] + 1e-9)) return false;
  }
  return true;
}

describe('authenticated same-frame local camera collision exception', () => {
  it.each(['wall.solid', 'roof.slope'] as const)('retains raw start-inside %s contacts and certifies only its bound .22 eye sphere', part => {
    const f = fixture(part);
    try {
      const p = f.proposal(), selected = f.plan(p), raw = cameraEyePenetration(f.world, p.eye, .2);
      expect(raw.depth).toBeGreaterThan(0); expect(CAMERA_FRAME_RADIUS).toBe(.2);
      expect(selected.cameraCapsule.start).toEqual(p.eye.toArray()); expect(selected.cameraCapsule.end).toEqual(p.eye.toArray());
      expect(selected.cameraCapsule.radius).toBe(.22); expect(selected.ready).toBe(true);
      const physical = selected.masks.filter(m => m.physical); expect(physical.length).toBeGreaterThan(0);
      for (const mask of physical) for (const i of mask.colliderIndices) expect(contained(f.world.bodies[0].colliders[i], mask)).toBe(true);
      const result = f.certify(p, selected);
      expect(result.accepted).toBe(true); expect(result.rawEndpointClear).toBe(false); expect(result.rawSweepClear).toBe(false);
      expect(result.diagnostics.endpoint.raw.length).toBeGreaterThan(0); expect(result.diagnostics.endpoint.authorized).toEqual(result.diagnostics.endpoint.raw);
      expect(result.diagnostics.endpoint.residual).toEqual([]); expect(result.diagnostics.exceptionsExplicit).toBe(true);
      expect(result.plan).toBe(selected); f.cut.commitFrame(selected);
      expect(f.cut.validateFramePlan(selected)).toBe(false); // A consumed generation cannot authorize another frame.
    } finally { f.dispose(); }
  });

  it('keeps an actual raw wall sweep blocked while certifying only the same complete short sweep', () => {
    const f = fixture();
    try {
      const start = f.eye.clone().addScaledVector(direction, -.4), end = f.eye.clone().addScaledVector(direction, .4);
      const initial = f.proposal(start), initialPlan = f.plan(initial); expect(f.certify(initial, initialPlan).accepted).toBe(true); f.cut.commitFrame(initialPlan);
      const p = f.proposal(end, start), selected = f.plan(p), result = f.certify(p, selected);
      expect(f.world.cameraDistance(start, end, .2)).toBeLessThan(start.distanceTo(end));
      expect(cameraEyePenetration(f.world, end, .2).depth).toBe(0);
      expect(result.rawSweepClear).toBe(false); expect(result.diagnostics.sweep.raw.length).toBeGreaterThan(0);
      expect(result.sweepClear).toBe(true); expect(result.accepted).toBe(true);
      for (const changed of [f.proposal(end.clone().addScaledVector(direction, .001), start),
        f.proposal(end, start.clone().addScaledVector(direction, -.001)), { ...p, probeRadius: .200001 }]) {
        const rejected = f.certify(changed, selected); expect(rejected.accepted).toBe(false);
        expect(rejected.diagnostics.endpoint.authorized).toEqual([]); expect(rejected.diagnostics.sweep.authorized).toEqual([]);
      }
    } finally { f.dispose(); }
  });

  it('rejects a greater than 1m volume even if all touched walls are selected', () => {
    const f = fixture();
    try {
      expect(CAMERA_FRAME_MAX_SWEEP).toBe(1);
      const initial = f.proposal(f.eye.clone().addScaledVector(direction, -.6)), first = f.plan(initial); f.cut.commitFrame(first);
      const p = f.proposal(f.eye.clone().addScaledVector(direction, .6), initial.eye), selected = f.plan(p), result = f.certify(p, selected);
      expect(selected.ready).toBe(false); expect(result.accepted).toBe(false); expect(result.diagnostics.reasons).toContain('sweep-volume-limit');
      expect(result.diagnostics.sweep.authorized).toEqual([]); expect(result.diagnostics.sweep.raw.length).toBeGreaterThan(0);
      expect(() => f.cut.commitFrame(selected)).toThrow();
    } finally { f.dispose(); }
  });

  it.each(['wall.door.open', 'wall.door-wide.open', 'floor.deck', 'roof.deck', 'structure.beam', 'step.entry-wide'] as const)('never certifies initial overlap with protected %s', part => {
      const f = fixture(part);
      try {
        const p = f.proposal(), selected = f.plan(p), result = f.certify(p, selected);
        expect(result.rawEndpointClear).toBe(false); expect(result.accepted).toBe(false);
        expect(result.diagnostics.endpoint.authorized).toEqual([]); expect(result.diagnostics.endpoint.residual.length).toBeGreaterThan(0);
      } finally { f.dispose(); }
    });

  it('does not waive terrain or parked ship contacts under an otherwise valid wall plan', () => {
    const f = fixture();
    try {
      const p = f.proposal(), selected = f.plan(p), ship = f.certify(p, selected, () => 0);
      expect(ship.accepted).toBe(false); expect(ship.diagnostics.endpoint.shipClear).toBe(false);
      expect(ship.diagnostics.endpoint.raw.length).toBeGreaterThan(0); // Building evidence survives the additional hard blocker.
      const below = f.proposal(new T.Vector3(0, 11.9, 0)), groundPlan = f.plan(below), ground = f.certify(below, groundPlan);
      expect(ground.accepted).toBe(false); expect(ground.diagnostics.endpoint.terrainClear).toBe(false);
    } finally { f.dispose(); }
  });

  it('keeps ship-only optical obstruction hard even when endpoint and sweep are safe', () => {
    const f = fixture();
    try {
      const p = f.proposal(), selected = f.plan(p);
      const result = f.certify(p, selected, (start, end, radius) => radius === 0 ? 0 : start.distanceTo(end));
      expect(result.endpointClear).toBe(true); expect(result.sweepClear).toBe(true);
      expect(result.accepted).toBe(false); expect(result.protectedOpticalClear).toBe(false);
      expect(result.diagnostics.externalOptical.every(ray => !ray.shipClear)).toBe(true);
      expect(result.diagnostics.reasons).toContain('external-optical-blocked');
    } finally { f.dispose(); }
  });

  it('keeps terrain-only optical obstruction hard with clear camera endpoints', () => {
    const world = new GroundWorld({ id: 'optical-sphere-fixture', revision: 1, radius: 12, environment: null, objects: [], blueprints: {} });
    const cut = new TownCameraCutaway([], [], world.planetId);
    const p: GroundCameraFrameProposal = { eye: new T.Vector3(0, 13, 0), feet: new T.Vector3(0, -12, 0),
      up: new T.Vector3(0, -1, 0), direction: new T.Vector3(0, -1, 0), probeRadius: .2 };
    try {
      const selected = cut.planFrame({ ...p, world, dt: .016, cameraException: true });
      const result = certifyCameraFrame(p, selected, { world, planCurrent: plan => cut.validateFramePlan(plan), probeParked: noShip, probeParkedSafety: noShip });
      expect(result.rawEndpointClear).toBe(true); expect(result.rawSweepClear).toBe(true);
      expect(result.diagnostics.endpoint.terrainClear).toBe(true); expect(result.accepted).toBe(false);
      expect(result.diagnostics.externalOptical.some(ray => !ray.terrainClear)).toBe(true);
    } finally { cut.dispose(); }
  });

  it('retains raw ship-ray clearance but rejects a real factory solid envelope containing the eye', () => {
    const f = fixture(), model = createShipModel(STARTERS[0], f.library, 'medium', { decal: () => new T.Texture() });
    try {
      const p = f.proposal(), selected = f.plan(p), guard = new CameraShipCollision();
      const offset = p.eye.clone().sub(new T.Vector3(0, -.04, -.9));
      guard.update(model.bounds, new T.Matrix4().makeTranslation(offset.x, offset.y, offset.z));
      const result = certifyCameraFrame(p, selected, { world: f.world, planCurrent: plan => f.cut.validateFramePlan(plan),
        probeParked: noShip, probeParkedSafety: (a, b, radius) => guard.distance(a, b, radius) });
      expect(result.diagnostics.endpoint.rawShipClear).toBe(true);
      expect(result.diagnostics.endpoint.shipDistance).toBeCloseTo(.001, 10);
      expect(result.diagnostics.endpoint.shipSafetyClear).toBe(false);
      expect(result.diagnostics.endpoint.shipSafetyDistance).toBe(0);
      expect(result.accepted).toBe(false); expect(result.endpointClear).toBe(false);
      expect(result.diagnostics.reasons).toContain('endpoint-blocked');
      expect(result.diagnostics.endpoint.authorized.length).toBeGreaterThan(0); // The wall exception never includes the ship.
    } finally { model.dispose(); f.dispose(); }
  });

  it('requires complete collision OBB containment, not a contained centre or class label', () => {
    const f = fixture('wall.solid', 1, 1, true);
    try {
      const p = f.proposal(), selected = f.plan(p), result = f.certify(p, selected);
      expect(selected.masks.some(mask => mask.physical && !contained(f.collider, mask))).toBe(true);
      expect(selected.ready).toBe(false); expect(result.accepted).toBe(false);
      expect(result.diagnostics.endpoint.authorized).toEqual([]); expect(result.diagnostics.endpoint.residual.length).toBeGreaterThan(0);
    } finally { f.dispose(); }
  });

  it.each([[13, 1], [1, 5]])('fails before commit when %i parts across %i owners cannot retain all mandatory masks', (parts, owners) => {
    const f = fixture('wall.solid', parts, owners);
    try {
      const p = f.proposal(), selected = f.plan(p), result = f.certify(p, selected);
      expect(selected.masks.length).toBeLessThanOrEqual(12); expect(new Set(selected.masks.map(m => m.objectId)).size).toBeLessThanOrEqual(4);
      expect(selected.reasons.some(reason => reason.startsWith('mandatory-mask-budget:'))).toBe(true);
      expect(selected.ready).toBe(false); expect(result.accepted).toBe(false); expect(() => f.cut.commitFrame(selected)).toThrow();
    } finally { f.dispose(); }
  });

  it('rejects structurally copied, foreign, stale and wrong-world plans without losing raw evidence', () => {
    const f = fixture(), foreign = fixture();
    try {
      const p = f.proposal(), selected = f.plan(p), clone = { ...selected }, otherWorld = new GroundWorld(f.planet);
      expect(f.cut.validateFramePlan(clone)).toBe(false); expect(foreign.cut.validateFramePlan(selected)).toBe(false);
      expect(f.certify(p, clone).accepted).toBe(false);
      expect(certifyCameraFrame(p, selected, { world: otherWorld, planCurrent: plan => f.cut.validateFramePlan(plan), probeParked: noShip, probeParkedSafety: noShip }).accepted).toBe(false);
      f.cut.reset(); const stale = f.certify(p, selected);
      expect(stale.accepted).toBe(false); expect(stale.diagnostics.endpoint.raw.length).toBeGreaterThan(0); expect(stale.diagnostics.endpoint.authorized).toEqual([]);
      const next = f.plan(p); f.cut.dispose(); expect(f.cut.validateFramePlan(next)).toBe(false); expect(f.certify(p, next).accepted).toBe(false);
    } finally { f.dispose(); foreign.dispose(); }
  });

  it('requires current visible shader bindings and preserves hard collision without explicit opt-in', () => {
    const f = fixture();
    try {
      const p = f.proposal(), visualOnly = f.plan(p, false), denied = f.certify(p, visualOnly);
      expect(denied.accepted).toBe(false); expect(denied.diagnostics.endpoint.authorized).toEqual([]);
      f.models[0].object.visible = false; const hidden = f.plan(p);
      expect(hidden.ready).toBe(false); expect(hidden.reasons.some(reason => reason.startsWith('part-not-bound:'))).toBe(true);
      expect(f.certify(p, hidden).accepted).toBe(false);
    } finally { f.dispose(); }
  });
});

// Deliberately simple protected-box fixtures isolate optical classification;
// they do not alter the saved public world or pretend to reconstruct seq95.
function shadowFixture(center: number[], half: number[]) {
  const world = new GroundWorld({ id: 'shadow-isolated', revision: 3, radius: 12, environment: null, objects: [], blueprints: {} });
  const c = { objectId: 'protected-column', tag: 'structure.column', center: new T.Vector3(...center), half: new T.Vector3(...half),
    q: new T.Quaternion(), inverse: new T.Quaternion(), support: false };
  world.bodies.push({ objectId: c.objectId, dir: up.clone(), broad: 5, colliders: [c],
    cameraBounds: new T.Box3(c.center.clone().sub(c.half), c.center.clone().add(c.half)).expandByScalar(.06) });
  const cut = new TownCameraCutaway([], [], world.planetId);
  const proposal: GroundCameraFrameProposal = { eye: new T.Vector3(0, 31.16, -6), feet: new T.Vector3(0, 30, 0),
    up: up.clone(), direction: direction.clone(), probeRadius: .2 };
  const corners = (width: number) => [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x * width, 31.16 + y * .1, z * .05] as [number, number, number])));
  const plan = (points?: [number, number, number][]) => cut.planFrame({ ...proposal, world, dt: .016, cameraException: true, opticalTargetPoints: points });
  const certify = (selected: CameraCutawayFramePlan, points?: [number, number, number][]) => certifyCameraFrame(proposal, selected,
    { world, planCurrent: candidate => cut.validateFramePlan(candidate), probeParked: noShip, probeParkedSafety: noShip,
      ...(points ? { avatarBounds: [{ label: 'actual-upper-box', corners: points }] } : {}) });
  return { world, c, cut, proposal, corners, plan, certify };
}

describe('current avatar optical classification preserves raw protected geometry', () => {
  it('classifies a protected guard hit outside the actual projected body without authorizing any physical exception', () => {
    const f = shadowFixture([.31, 31.16, -3], [.025, .1, .05]);
    try {
      const points = f.corners(.1), strict = f.plan(), selected = f.plan(points);
      expect(strict.rawHits.length).toBeGreaterThan(0); expect(f.certify(strict).accepted).toBe(false);
      // Independent actual PerspectiveCamera projection: the complete narrow
      // body box and complete column are separated along screen x.
      const camera = new T.PerspectiveCamera(54, 1.44, .08, 100); camera.position.copy(f.proposal.eye);
      camera.up.copy(up); camera.lookAt(camera.position.clone().add(direction)); camera.updateMatrixWorld(true);
      const bodyX = points.map(p => new T.Vector3(...p).project(camera).x), columnX: number[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) columnX.push(new T.Vector3(x * f.c.half.x, y * f.c.half.y, z * f.c.half.z).add(f.c.center).project(camera).x);
      expect(Math.max(...columnX)).toBeLessThan(Math.min(...bodyX));
      const result = f.certify(selected, points);
      expect(result.accepted).toBe(true); expect(result.diagnostics.optical.raw).toBeGreaterThan(0);
      expect(result.diagnostics.avatarOptical.disjointGuardHits.length).toBeGreaterThan(0);
      expect(result.diagnostics.endpoint.authorized).toEqual([]); expect(selected.masks).toEqual([]);
      expect(result.diagnostics.avatarOptical.intersections).toEqual([]);
    } finally { f.cut.dispose(); }
  });

  it('rejects a narrow protected shadow between the nine old guard rays', () => {
    const f = shadowFixture([.10, 31.16, -3], [.012, .012, .02]);
    try {
      const points = f.corners(.3), selected = f.plan(points), result = f.certify(selected, points);
      expect(selected.rawHits).toEqual([]); // A sparse ray-only oracle would miss this obstruction.
      expect(selected.opticalCandidates).toHaveLength(1); expect(selected.opticalCandidates[0].eligible).toBe(false);
      expect(result.endpointClear).toBe(true); expect(result.sweepClear).toBe(true);
      expect(result.accepted).toBe(false); expect(result.protectedOpticalClear).toBe(false);
      expect(result.diagnostics.reasons).toContain('actual-avatar-optical-blocked');
      expect(result.diagnostics.avatarOptical.intersections).toHaveLength(1);
    } finally { f.cut.dispose(); }
  });

  it('keeps a genuine eye-plane-crossing shadow blocked and rejects unbound body points', () => {
    const f = shadowFixture([.31, 31.16, -3], [.025, .1, 3.1]);
    try {
      const points = f.corners(.3), selected = f.plan(points), result = f.certify(selected, points);
      const target = new T.Vector3(.295, 31.16, 0), ray = new T.Ray(f.proposal.eye.clone(), target.clone().sub(f.proposal.eye).normalize());
      const hit = ray.intersectBox(new T.Box3(f.c.center.clone().sub(f.c.half), f.c.center.clone().add(f.c.half)), new T.Vector3());
      expect(hit).not.toBeNull();expect(hit!.distanceTo(f.proposal.eye)).toBeLessThan(target.distanceTo(f.proposal.eye));
      expect(result.endpointClear).toBe(true); expect(result.accepted).toBe(false);
      expect(result.diagnostics.avatarOptical.intersections).toHaveLength(1);
      const changed = points.map(p => [...p] as [number, number, number]); changed[0][0] += .001;
      expect(f.certify(selected, changed).diagnostics.reasons).toContain('avatar-plan-binding');
      expect(f.certify(selected, []).diagnostics.reasons).toContain('invalid-avatar-bounds');
    } finally { f.cut.dispose(); }
  });
});


describe('strict three-dimensional separation at the camera eye plane', () => {
  const eye = new T.Vector3(), body = { label: 'upper-body', corners: [-.3, .3].flatMap(x => [-.1, .1].flatMap(y => [5.95, 6.05].map(z => [x, y, z] as [number, number, number]))) };
  const pose = { eye, direction: new T.Vector3(0, 0, 1), up: new T.Vector3(0, 1, 0) };

  it('proves disjoint only when all eight blocker corners remain outside an actual avatar cone side', () => {
    const collider = { center: new T.Vector3(.31, .5, 0), half: new T.Vector3(.025, .1, .1), q: new T.Quaternion() };
    const corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => new T.Vector3(x * collider.half.x, y * collider.half.y, z * collider.half.z).add(collider.center))));
    expect(Math.min(...corners.map(p => p.z))).toBeLessThan(0);expect(Math.max(...corners.map(p => p.z))).toBeGreaterThan(0);
    // Independent analytic upper cone bound for this known rectangular body:
    // y <= (.1 / 5.95) z. Every blocker corner is strictly above that plane.
    expect(body.corners.every(p => p[1] <= (.1 / 5.95) * p[2] + 1e-12)).toBe(true);
    expect(Math.min(...corners.map(p => p.y - (.1 / 5.95) * p.z))).toBeGreaterThan(.39);
    expect(createCameraAvatarShadowTest(pose, [body])(collider)).toBe(true);
  });

  it('retains a blocker crossing the eye plane that actually intercepts a ray to the body', () => {
    const collider = { center: new T.Vector3(.31, 0, 3), half: new T.Vector3(.025, .1, 3.1), q: new T.Quaternion() };
    const target = new T.Vector3(.295, 0, 6), bounds = new T.Box3(collider.center.clone().sub(collider.half), collider.center.clone().add(collider.half));
    const hit = new T.Ray(eye.clone(), target.clone().normalize()).intersectBox(bounds, new T.Vector3());
    expect(bounds.min.z).toBeLessThan(0);expect(bounds.max.z).toBeGreaterThan(0);
    expect(bounds.distanceToPoint(eye)).toBeGreaterThan(.2); // Endpoint safety alone does not prove optical clearance.
    expect(hit).not.toBeNull();expect(hit!.z).toBeLessThan(5.95);expect(hit!.length()).toBeLessThan(target.length());
    expect(createCameraAvatarShadowTest(pose, [body])(collider)).toBe(false);
  });
});
