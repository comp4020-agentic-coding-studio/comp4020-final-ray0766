// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { Colony } from '../src/client/colony.ts';
import { TownCameraCutaway } from '../src/client/camera-cutaway.ts';
import { CAMERA_PART_ATTRIBUTE, cameraBlueprintRegistry } from '../src/client/camera-blueprint-model.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { disposeGeometry } from '../src/client/build-art.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import type { PlanetView, PlacedObject } from '../src/shared/planets.ts';
import type { HomeDoorState } from '../src/shared/home-door.ts';

const up = new T.Vector3(0, 1, 0);
type DoorId = 'wall.door.open' | 'wall.door-wide.open';
function fixture(doorId: DoorId = 'wall.door-wide.open', open = false) {
  const parts: PartPlacement[] = [
    { n: 60, part: 'wall.solid', x: 1, z: 1, level: 0, rot: 2 },
    { n: 2, part: doorId, x: 1, z: 2, level: 0, rot: 0 },
    ...[[1, 1], [2, 1], [1, 2], [2, 2]].map(([x, z], i) => ({ n: 10 + i, part: 'floor.deck' as const, x, z, level: 0, rot: 0 as const })),
    { n: 90, part: 'roof.deck', x: 1, z: 1, level: 1, rot: 0 },
    { n: 91, part: 'roof.deck', x: 2, z: 1, level: 1, rot: 0 },
    { n: 5, part: 'step.entry-wide', x: 1, z: 3, level: 0, rot: 0 },
  ];
  const object: PlacedObject = { id: 'fixture-saved-home', kind: 'structure', position: [0, 1, 0], rotation: 0, version: 7, blueprintHash: 'fixture-kit', ...structureSize(parts) };
  const homeDoor: HomeDoorState = { buildingId: object.id, partNumber: 2, open, version: 3 };
  const planet: PlanetView = { id: 'fixture-private-planet', kind: 'garden', name: 'Synthetic private fixture', center: [0, 0, 0],
    slot: 1, claimed: true, mine: true, revision: 8, radius: 12, environment: null, objectCount: 1, objects: [object], blueprints: { 'fixture-kit': parts }, homeDoor };
  const registry = cameraBlueprintRegistry(object, parts, structureFit(parts, object.position, object.rotation, fieldOf(null, 12)), homeDoor);
  return { parts, object, planet, homeDoor, registry };
}
function query(world: GroundWorld) {
  const body = world.bodies.find(body => body.objectId === 'fixture-saved-home')!;
  const wall = body.colliders.find(c => c.tag === 'wall.solid') ?? body.colliders[0];
  const camera = new T.PerspectiveCamera(54, 1.44, .08, 100), target = wall.center.clone().add(new T.Vector3(0, 0, 3));
  camera.position.copy(wall.center).add(new T.Vector3(0, 0, -3)); camera.up.copy(up); camera.lookAt(target); camera.updateMatrixWorld(true);
  return { world, camera, feet: target.clone().addScaledVector(up, -1.16), up, dt: .016, enabled: true };
}
function allMeshes(root: T.Object3D) {
  const meshes: T.Mesh<T.BufferGeometry, T.Material>[] = [];
  root.traverse(node => { if (node instanceof T.Mesh) meshes.push(node as T.Mesh<T.BufferGeometry, T.Material>); });
  return meshes;
}
function fakeColony(enabled = true) {
  document.body.innerHTML = '<select id="built-list"></select><canvas></canvas>';
  const layer = new T.Group(), obstacles = vi.fn();
  // Avoid the UI constructor/poll timer: exercise the actual production saved
  // preparation/commit/model factories with the minimum rendering bridge.
  const colony = Object.assign(Object.create(Colony.prototype), {
    bridge: { canvas: document.querySelector('canvas'), obstacles, cameraCutaway: enabled }, layer,
    objects: new Map(), painted: '', selected: null, localParts: {},
    shadows: { clear: vi.fn(), replace: vi.fn() }, previewPaths: vi.fn(),
  }) as Colony;
  return { colony, layer, obstacles };
}
const immediate = () => Promise.resolve();
const options = () => ({ signal: new AbortController().signal, yieldFrame: immediate, budgetMs: Infinity });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('private cutaway provenance and atomic saved-model lifetime (CPU only)', () => {
  it.each(['wall.door.open', 'wall.door-wide.open'] as const)('matches both authoritative %s endpoints without making the door cuttable', id => {
    const f = fixture(id), before = JSON.stringify(f.planet), cut = new TownCameraCutaway([f.object.id], f.registry, f.planet.id);
    const door = f.registry.find(p => p.partNumber === 2)!;
    expect(door.partSlot).toBe(0); expect(door.category).toBe('protected');
    expect(door.expectedColliderStates?.map(s => s.state)).toEqual(['closed', 'open']);
    for (const open of [false, true, false]) {
      const world = new GroundWorld({ ...f.planet, homeDoor: { ...f.homeDoor, open } });
      const d = cut.update(query(world));
      expect(d.enabled).toBe(true); expect(d.rawHits.length).toBeGreaterThan(0); expect(d.mappingProblems).toEqual([]);
      expect(d.rawHits.every(h => h.mappingValid)).toBe(true);
      expect(d.partInventory.find(p => p.partNumber === 2)?.colliderState).toBe(open ? 'open' : 'closed');
      expect(d.partInventory.find(p => p.partNumber === 2)?.qualified).toBe(false);
      expect(d.masks.some(p => p.partNumber === 2)).toBe(false);
      const shapeState = door.expectedColliderStates!.find(s => s.state === (open ? 'open' : 'closed'))!;
      for (const e of shapeState.colliders) {
        const actual = world.bodies[0].colliders[e.index];
        expect(actual.tag).toBe(e.tag); expect(actual.center.distanceTo(new T.Vector3(...e.center))).toBeLessThan(1e-9);
        expect(actual.half.distanceTo(new T.Vector3(...e.half))).toBeLessThan(1e-9);
        expect(1 - Math.abs(actual.inverse.dot(new T.Quaternion(...e.inverseQuaternion)))).toBeLessThan(1e-12);
      }
      expect(d.renderClearVerified).toBe(false);
    }
    // A controller is planet-scoped; opting into this private world does not
    // authorize masks on hub or another private world with colliding object IDs.
    for (const planetId of ['hub', 'other-fixture-private']) {
      const world = new GroundWorld({ ...f.planet, id: planetId });
      expect(cut.update(query(world)).enabled).toBe(false);
    }
    expect(new TownCameraCutaway([f.object.id], f.registry).update(query(new GroundWorld(f.planet))).enabled).toBe(false);
    expect(JSON.stringify(f.planet)).toBe(before); cut.dispose();
  });

  it.each(['wall.door.open', 'wall.door-wide.open'] as const)('rejects a mixed %s leaf endpoint for the whole owner, including old held masks', id => {
    const f = fixture(id), cut = new TownCameraCutaway([f.object.id], f.registry, f.planet.id), shut = new GroundWorld(f.planet);
    expect(cut.update(query(shut)).active).toBe(true);
    const open = new GroundWorld({ ...f.planet, homeDoor: { ...f.homeDoor, open: true } });
    const mixed = new GroundWorld(f.planet), indices = f.registry.find(p => p.partNumber === 2)!.expectedColliders
      .filter(e => /leaf/.test(e.tag)).map(e => e.index);
    expect(indices.length).toBeGreaterThanOrEqual(2);
    mixed.bodies[0].colliders[indices[0]] = open.bodies[0].colliders[indices[0]];
    const d = cut.update(query(mixed));
    expect(d.mappingProblems.some(p => p.reason === 'part-collider-state-mismatch')).toBe(true);
    expect(d.masks).toEqual([]); expect(d.active).toBe(false); expect(d.rawHits.every(h => !h.mappingValid && h.partSlot === 0)).toBe(true);
    cut.dispose();
  });

  it('only grants door endpoints to the exact authoritative building and part', () => {
    const f = fixture(), fit = structureFit(f.parts, f.object.position, f.object.rotation, fieldOf(null, 12));
    for (const state of [undefined, { ...f.homeDoor, buildingId: 'another-home' }, { ...f.homeDoor, partNumber: 60 }]) {
      const registry = cameraBlueprintRegistry(f.object, f.parts, fit, state);
      expect(registry.every(p => p.expectedColliderStates === undefined)).toBe(true);
    }
  });

  it('prepares real saved geometry privately and commits controller and models together, restoring old sources first', async () => {
    const f = fixture(), before = JSON.stringify(f.planet), { colony, layer } = fakeColony();
    const first = await colony.prepareObjects(f.planet, options());
    expect(colony.cutaway).toBeUndefined(); expect(layer.children).toEqual([]); expect(first.cutaway?.planetId).toBe(f.planet.id);
    const meshes = allMeshes(first.root); expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every(m => m.geometry.hasAttribute('townCameraOwner') && m.geometry.hasAttribute(CAMERA_PART_ATTRIBUTE))).toBe(true);
    expect(meshes.some(m => m.material.userData.townCameraCutaway)).toBe(true);
    first.commit(); expect(colony.cutaway).toBe(first.cutaway); const oldChildren = [...layer.children];
    first.dispose(); expect(layer.children).toEqual(oldChildren);
    const oldDispose = vi.spyOn(first.cutaway!, 'dispose'); let restoredAtGeometryDispose = false;
    const oldModel = layer.children[0], original = oldModel.userData.disposeOwned as () => void;
    oldModel.userData.disposeOwned = () => { restoredAtGeometryDispose = allMeshes(oldModel).every(m => !m.material.userData.townCameraCutaway); original(); };
    const secondPlanet = { ...f.planet, revision: 9, homeDoor: { ...f.homeDoor, open: true } };
    const second = await colony.prepareObjects(secondPlanet, options());
    expect(colony.cutaway).toBe(first.cutaway); expect(layer.children).toEqual(oldChildren); expect(oldDispose).not.toHaveBeenCalled();
    second.commit(); expect(colony.cutaway).toBe(second.cutaway); expect(oldDispose).toHaveBeenCalledTimes(1); expect(restoredAtGeometryDispose).toBe(true);
    expect(layer.children).not.toEqual(oldChildren); expect(JSON.stringify(f.planet)).toBe(before);
    second.cutaway!.dispose(); for (const child of [...layer.children]) disposeGeometry(child); layer.clear();
  });

  it('cancels staged real models without changing the committed controller or saved data', async () => {
    const f = fixture(), before = JSON.stringify(f.planet), { colony, layer } = fakeColony();
    const old = await colony.prepareObjects(f.planet, options()); old.commit(); const oldChildren = [...layer.children];
    const controller = new AbortController(), dispose = vi.spyOn(TownCameraCutaway.prototype, 'dispose');
    const later = { ...f.planet, objects: [...f.planet.objects, { ...f.object, id: 'second-fixture-object' }] };
    await expect(colony.prepareObjects(later, { ...options(), signal: controller.signal,
      onProgress: done => { if (done === 1) controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispose).toHaveBeenCalledTimes(1); expect(dispose.mock.instances[0]).not.toBe(old.cutaway);
    expect(colony.cutaway).toBe(old.cutaway); expect(layer.children).toEqual(oldChildren); expect(JSON.stringify(f.planet)).toBe(before);
    old.cutaway!.dispose(); for (const child of [...layer.children]) disposeGeometry(child); layer.clear();
  });

  it('disposing prepared geometry before commit prevents a later stale commit, with previews and default mode unchanged', async () => {
    const f = fixture(), { colony, layer } = fakeColony();
    const prepared = await colony.prepareObjects(f.planet, options()), dispose = vi.spyOn(prepared.cutaway!, 'dispose');
    prepared.dispose(); prepared.dispose(); prepared.commit(); expect(dispose).toHaveBeenCalledTimes(1); expect(layer.children).toEqual([]); expect(colony.cutaway).toBeUndefined();
    const plain = fakeColony(false), ordinary = await plain.colony.prepareObjects(f.planet, options());
    expect(ordinary.cutaway).toBeUndefined();
    expect(allMeshes(ordinary.root).every(m => !m.geometry.hasAttribute('townCameraOwner') && !m.geometry.hasAttribute(CAMERA_PART_ATTRIBUTE) && !m.material.userData.townCameraCutaway)).toBe(true);
    ordinary.dispose();
    const render = colony as unknown as { renderObject(object: PlacedObject, planet: PlanetView): T.Group };
    const preview = render.renderObject(f.object, f.planet);
    expect(allMeshes(preview).every(m => !m.geometry.hasAttribute('townCameraOwner') && !m.geometry.hasAttribute(CAMERA_PART_ATTRIBUTE) && !m.material.userData.townCameraCutaway)).toBe(true);
    disposeGeometry(preview);
  });
});
