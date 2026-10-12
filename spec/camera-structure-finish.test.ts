// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as T from 'three';
import { buildStructureFinish, planStructureFinish } from '../src/client/structure-finish.ts';
import { CAMERA_PART_ATTRIBUTE, cameraPartSlots } from '../src/client/camera-blueprint-model.ts';
import type { CameraCutawayPart } from '../src/client/camera-cutaway.ts';
import type { GroundWorld } from '../src/shared/physics/world.ts';
import { TownCameraCutaway } from '../src/client/camera-cutaway.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { Colony } from '../src/client/colony.ts';
import { disposeGeometry } from '../src/client/build-art.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { libraryMaterials } from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import { partTransform, pivotOf, rotDir } from '../src/shared/blueprint-model.ts';
import type { PartPlacement, Rot } from '../src/shared/blueprint-model.ts';
import type { PlacedObject, PlanetView } from '../src/shared/planets.ts';
import { VILLAGE_PART_BOUNDS } from '../src/shared/physics/village-bounds.ts';
import type { SamplePublicVillage } from '../src/shared/sample-public-village.ts';

const owned: { dispose(): void }[] = [];
afterEach(() => { for (const item of owned.splice(0).reverse()) item.dispose(); });
function fixture(rot: Rot = 0): PartPlacement[] {
  const [dx, dz] = rotDir(rot);
  // Intentionally reverse n order relative to placement at some rotations.
  return [
    { n: 90, part: 'wall.solid', x: 2, z: 2, level: 0, rot },
    { n: 2, part: 'floor.deck', x: 2, z: 2, level: 0, rot: 0 },
    { n: 7, part: 'wall.solid', x: 2 + dz, z: 2 - dx, level: 0, rot },
    { n: 4, part: 'floor.deck', x: 2 + dz, z: 2 - dx, level: 0, rot: 0 },
  ];
}
function library(lod: 'low' | 'medium') { const lib = new StyleLibrary(lod, { look: 'village', scans: false }); owned.push(lib); return lib; }
function meshes(root: T.Object3D) { const out: T.Mesh<T.BufferGeometry, T.Material>[] = []; root.traverse(o => { if (o instanceof T.Mesh) out.push(o as T.Mesh<T.BufferGeometry, T.Material>); }); return out; }
function area(geometry: T.BufferGeometry) {
  const p = geometry.getAttribute('position'), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(); let sum = 0;
  for (let i = 0; i < p.count; i += 3) sum += new T.Triangle(a.fromBufferAttribute(p, i), b.fromBufferAttribute(p, i + 1), c.fromBufferAttribute(p, i + 2)).getArea();
  return sum;
}
/** Every new vertex lies on the original visible surface, with its original
 * normal and barycentrically interpolated metre UV. This also rejects UV
 * restarting at the split; equal bounds alone would not detect that defect. */
function sameSurface(actual: T.BufferGeometry, original: T.BufferGeometry) {
  const p = actual.getAttribute('position'), n = actual.getAttribute('normal'), uv = actual.getAttribute('uv');
  const op = original.getAttribute('position'), on = original.getAttribute('normal'), ou = original.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const point = new T.Vector3().fromBufferAttribute(p, i), normal = new T.Vector3().fromBufferAttribute(n, i); let found = false;
    for (let j = 0; j < op.count; j += 3) {
      if (normal.distanceTo(new T.Vector3().fromBufferAttribute(on, j)) > 1e-7) continue;
      const triangle = new T.Triangle(...[j, j + 1, j + 2].map(k => new T.Vector3().fromBufferAttribute(op, k)) as [T.Vector3, T.Vector3, T.Vector3]);
      if (triangle.closestPointToPoint(point, new T.Vector3()).distanceTo(point) > 2e-7) continue;
      const b = triangle.getBarycoord(point, new T.Vector3())!;
      expect(uv.getX(i)).toBeCloseTo(ou.getX(j) * b.x + ou.getX(j + 1) * b.y + ou.getX(j + 2) * b.z, 6);
      expect(uv.getY(i)).toBeCloseTo(ou.getY(j) * b.x + ou.getY(j + 1) * b.y + ou.getY(j + 2) * b.z, 6);
      found = true; break;
    }
    expect(found).toBe(true);
  }
  expect(area(actual)).toBeCloseTo(area(original), 6);
}

it.each((['low', 'medium'] as const).flatMap(lod => ([0, 1, 2, 3] as Rot[]).map(rot => ({ lod, rot }))))('preserves the exterior surface and exact wall provenance at $lod / quarter turn $rot', ({ lod, rot }) => {
  const parts = fixture(rot), before = JSON.stringify(parts), lib = library(lod), slots = cameraPartSlots(parts);
  const plain = buildStructureFinish(parts, lib), cut = buildStructureFinish(parts, lib, { cameraPartSlots: slots }); owned.push(plain, cut);
  const joint = cut.segments.find(s => s.kind === 'existing-wall-joint')!;
  expect(joint).toBeDefined(); expect(cut.cameraBindings).toHaveLength(2);
  const ordered = parts.filter(p => p.part === 'wall.solid').sort((a, b) => a[joint.axis] - b[joint.axis]);
  expect(joint.wallNumbers).toEqual(ordered.map(p => p.n));
  expect(planStructureFinish([...parts].reverse())).toEqual(plain.segments);
  expect(plain.seed).toBe(cut.seed); expect(plain.version).toBe(cut.version); expect(JSON.stringify(parts)).toBe(before);
  expect(plain.triangles + 8).toBe(cut.triangles); expect(cut.drawCalls).toBe(2); expect(plain.drawCalls).toBe(2);
  expect(plain.cameraBindings).toEqual([]); expect(plain.object.userData.cameraBindings).toBeUndefined();
  const pivot = pivotOf(parts), middle = (joint.from + joint.to) / 2;
  for (const mesh of meshes(cut.object)) {
    const reference = meshes(plain.object).find(m => m.material === mesh.material)!;
    expect(reference.geometry.hasAttribute(CAMERA_PART_ATTRIBUTE)).toBe(false);
    expect(mesh.geometry.index).toBeNull(); expect(reference.geometry.index).toBeNull();
    sameSurface(mesh.geometry, reference.geometry);
    expect(mesh.geometry.drawRange).toEqual(reference.geometry.drawRange);
    expect(mesh.castShadow).toBe(false); expect(mesh.receiveShadow).toBe(true);
    const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal'), attr = mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE);
    expect(attr.array).toBeInstanceOf(Uint16Array);
    for (let i = 0; i < attr.count; i += 3) {
      const slot = attr.getX(i); expect(attr.getX(i + 1)).toBe(slot); expect(attr.getX(i + 2)).toBe(slot);
      if (mesh.material !== libraryMaterials(lib).get('post')) { expect(slot).toBe(0); continue; }
      const binding = cut.cameraBindings.find(b => b.partSlot === slot)!; expect(binding).toBeDefined();
      const wall = parts.find(p => p.n === binding.partNumber)!, transform = partTransform(wall, pivot);
      const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -transform.yaw), bounds = VILLAGE_PART_BOUNDS[wall.part];
      for (const k of [i, i + 1, i + 2]) {
        const point = new T.Vector3().fromBufferAttribute(p, k), along = point[joint.axis];
        expect(along).toBeGreaterThanOrEqual(binding.from - 1e-7); expect(along).toBeLessThanOrEqual(binding.to + 1e-7);
        point.sub(new T.Vector3(...transform.position)).applyQuaternion(turn);
        point.toArray().forEach((value, axis) => { expect(value).toBeGreaterThanOrEqual(bounds.min[axis] - .1); expect(value).toBeLessThanOrEqual(bounds.max[axis] + .1); });
      }
      const allOnSplit = [i, i + 1, i + 2].every(k => Math.abs((joint.axis === 'x' ? p.getX(k) : p.getZ(k)) - middle) < 1e-7);
      expect(allOnSplit && Math.abs(joint.axis === 'x' ? n.getX(i) : n.getZ(i)) > .9).toBe(false);
    }
    if (mesh.material === libraryMaterials(lib).get('post')) {
      expect(p.count / 3).toBe(20); expect(reference.geometry.getAttribute('position').count / 3).toBe(12);
    }
  }
});

it('keeps non-joint finish, missing wall identities, doors and explicit columns protected', () => {
  const lib = library('medium'), parts = fixture(), withoutOne = cameraPartSlots(parts); withoutOne.delete(90);
  const cut = buildStructureFinish(parts, lib, { cameraPartSlots: withoutOne }); owned.push(cut);
  expect(cut.cameraBindings.find(b => b.partNumber === 90)?.partSlot).toBe(0);
  for (const replacement of ['wall.door-wide.open', 'structure.column'] as const) {
    const protectedParts = parts.map(p => p.n === 7 ? { ...p, part: replacement } : p);
    const model = buildStructureFinish(protectedParts, lib, { cameraPartSlots: cameraPartSlots(protectedParts) }); owned.push(model);
    expect(model.cameraBindings).toEqual([]);
    for (const mesh of meshes(model.object)) expect([...mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).array].every(slot => slot === 0)).toBe(true);
  }
  const roof: PartPlacement[] = [0, 1].map(x => ({ n: x + 1, part: 'roof.slope', x, z: 0, level: 1, rot: 0 }));
  const eave = buildStructureFinish(roof, lib, { cameraPartSlots: cameraPartSlots(roof) }); owned.push(eave);
  expect(eave.segments.some(s => s.kind === 'existing-eave')).toBe(true);
  expect(eave.cameraBindings).toEqual([]); for (const mesh of meshes(eave.object)) expect([...mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).array].every(slot => slot === 0)).toBe(true);
});

it('uses complete saved-private identities while keeping the preview path and hidden home door unchanged', () => {
  const parts: PartPlacement[] = [...fixture(), { n: 1, part: 'wall.door-wide.open', x: 4, z: 4, level: 0, rot: 0 }];
  const object: PlacedObject = { id: 'saved', kind: 'structure', blueprintHash: 'fixture', position: [0, 1, 0], rotation: 0, version: 1 };
  const planet: PlanetView = { id: 'private', kind: 'garden', name: 'Fixture', center: [0, 0, 0], slot: 1, claimed: true, mine: true, revision: 1, radius: 12, environment: null, objectCount: 1, objects: [object], blueprints: { fixture: parts }, homeDoor: { buildingId: object.id, partNumber: 1, open: false, version: 1 } };
  const colony = Object.assign(Object.create(Colony.prototype), { localParts: {} }) as { renderObject(o: PlacedObject, p: PlanetView, camera?: boolean): T.Group };
  const saved = colony.renderObject(object, planet, true), preview = colony.renderObject(object, planet, false);
  try {
    const finish = saved.getObjectByName('structure:finish')!, oldFinish = preview.getObjectByName('structure:finish')!;
    expect(finish.userData.cameraBindings.map((b: { partNumber: number; partSlot: number }) => [b.partNumber, b.partSlot])).toEqual(planStructureFinish(parts).find(s => s.wallNumbers)!.wallNumbers!.map(n => [n, cameraPartSlots(parts).get(n)]));
    expect(cameraPartSlots(parts).get(7)).not.toBe(cameraPartSlots(parts.filter(p => p.n !== 1)).get(7));
    expect(oldFinish.userData.cameraBindings).toBeUndefined(); for (const mesh of meshes(oldFinish)) expect(mesh.geometry.hasAttribute(CAMERA_PART_ATTRIBUTE)).toBe(false);
    expect(saved.getObjectByName('part:1')).toBeUndefined(); expect(preview.getObjectByName('part:1')).toBeUndefined();
  } finally { disposeGeometry(saved); disposeGeometry(preview); }
});

it('retains wall half slots through real public low, medium and global material merges', () => {
  const parts = fixture(), object: PlacedObject = { id: 'fixture', kind: 'structure', blueprintHash: 'fixture', position: [0, 1, 0], rotation: 0, version: 1 };
  // Minimal ordinary public drawing ledger: no generated town or server writes.
  const village = { objects: [object], blueprints: { fixture: parts }, environment: null } as unknown as SamplePublicVillage;
  const town = createPublicTownArt(village, 21.6, { cameraCutaway: true }); owned.push(town);
  const inspect = () => {
    const visible = meshes(town.root).filter(mesh => { for (let p: T.Object3D | null = mesh; p; p = p.parent) if (!p.visible) return false; return mesh.material.name === 'custom:village:timber'; });
    expect(visible).toHaveLength(1);
    const mesh = visible[0], attr = mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE), owners = mesh.geometry.getAttribute('townCameraOwner');
    for (const slot of [cameraPartSlots(parts).get(7), cameraPartSlots(parts).get(90)]) expect([...attr.array].filter(v => v === slot)).toHaveLength(30);
    expect([...owners.array].every(v => v === town.cutaway!.ownerSlot(object.id))).toBe(true);
    for (let i = 0; i < attr.count; i += 3) { expect(attr.getX(i)).toBe(attr.getX(i + 1)); expect(attr.getX(i)).toBe(attr.getX(i + 2)); }
  };
  town.update(new T.Vector3(0, 28, 0), undefined, { lowOnly: true }); inspect();
  town.update(new T.Vector3(0, 25, 0), new T.Vector3(0, 22, 0)); inspect();
  town.update(new T.Vector3(0, 80, 0), undefined, { globalLow: true }); inspect();
});

it('borrows unchanged materials and restores them before one-time geometry disposal', () => {
  const lib = library('medium'), parts = fixture(), model = buildStructureFinish(parts, lib, { cameraPartSlots: cameraPartSlots(parts) }); owned.push(model);
  const cut = new TownCameraCutaway(['saved']); owned.push(cut);
  const snapshots = meshes(model.object).map(mesh => {
    const source = mesh.material, before = { opacity: source.opacity, transparent: source.transparent, depthWrite: source.depthWrite };
    const geometryDisposed = vi.fn(), materialDisposed = vi.fn(); mesh.geometry.addEventListener('dispose', geometryDisposed); source.addEventListener('dispose', materialDisposed);
    cut.writeOwnerAttribute(mesh.geometry, 'saved'); cut.registerMesh(mesh);
    expect({ opacity: mesh.material.opacity, transparent: mesh.material.transparent, depthWrite: mesh.material.depthWrite }).toEqual(before);
    return { mesh, source, geometryDisposed, materialDisposed };
  });
  cut.reset(); cut.dispose(); cut.dispose();
  for (const item of snapshots) expect(item.mesh.material).toBe(item.source);
  model.dispose(); model.dispose();
  for (const item of snapshots) { expect(item.geometryDisposed).toHaveBeenCalledTimes(1); expect(item.materialDisposed).not.toHaveBeenCalled(); }
});


it('cuts only the selected real half strip with installed uniforms, retaining the other wall and outside-cone surface', () => {
  const parts = fixture(), lib = library('medium'), model = buildStructureFinish(parts, lib, { cameraPartSlots: cameraPartSlots(parts) }); owned.push(model);
  const selected = model.cameraBindings[0], other = model.cameraBindings[1], wall = parts.find(p => p.n === selected.partNumber)!;
  const transform = partTransform(wall, pivotOf(parts)), bounds = VILLAGE_PART_BOUNDS[wall.part], q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), transform.yaw);
  const center = new T.Vector3(...bounds.min).add(new T.Vector3(...bounds.max)).multiplyScalar(.5).applyQuaternion(q).add(new T.Vector3(...transform.position));
  const half = new T.Vector3(...bounds.max).sub(new T.Vector3(...bounds.min)).multiplyScalar(.5), inverse = q.clone().invert();
  const part: CameraCutawayPart = { objectId: 'saved', partNumber: wall.n, partId: wall.part, level: 0, partSlot: selected.partSlot, category: 'wall',
    center: center.toArray(), half: half.toArray(), inverseQuaternion: inverse.toArray(), planePoint: transform.position, planeUp: [0, 1, 0],
    expectedColliders: [{ index: 0, tag: wall.part, center: center.toArray(), half: half.toArray(), inverseQuaternion: inverse.toArray() }] };
  const world = { planetId: 'hub', bodies: [{ objectId: 'saved', cameraBounds: new T.Box3(new T.Vector3(-10, -10, -10), new T.Vector3(10, 10, 10)),
    colliders: [{ objectId: 'saved', tag: wall.part, center, half, q, inverse, support: false }] }] } as unknown as GroundWorld;
  const cut = new TownCameraCutaway(['saved', 'neighbour'], [part]); owned.push(cut);
  const mesh = meshes(model.object).find(m => m.material === libraryMaterials(lib).get('post'))!;
  cut.writeOwnerAttribute(mesh.geometry, 'saved'); cut.registerMesh(mesh);
  type Shader = Parameters<T.Material['onBeforeCompile']>[0];
  const shader = { uniforms: T.UniformsUtils.clone(T.ShaderLib.standard.uniforms), vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader } as Shader;
  mesh.material.onBeforeCompile(shader, {} as T.WebGLRenderer);
  const point = new T.Vector3(...selected.center).add(new T.Vector3(0, 0, selected.half[2])), up = new T.Vector3(0, 1, 0);
  const camera = new T.PerspectiveCamera(54, 1.44, .08, 100), target = point.clone().add(new T.Vector3(0, 0, -3));
  camera.position.copy(point).add(new T.Vector3(0, 0, .5)); camera.lookAt(target); camera.updateMatrixWorld(true);
  const feet = target.clone().addScaledVector(up, -1.16), d = cut.update({ world, camera, feet, up, dt: .016, enabled: true });
  expect(d.masks).toHaveLength(1); expect(d.masks[0].partSlot).toBe(selected.partSlot);
  const hits = new T.Raycaster(point.clone().add(new T.Vector3(0, 0, 1)), new T.Vector3(0, 0, -1)).intersectObject(mesh);
  expect(hits[0].point.distanceTo(point)).toBeLessThan(1e-7); expect(mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).getX(hits[0].face!.a)).toBe(selected.partSlot);
  // Independent evaluation of the actual installed visual uniforms, without
  // the physical branch (this update has cameraException=false).
  const contains = (p: T.Vector3, owner: number, slot: number) => {
    const u = shader.uniforms, eye = u.uTownCutEye.value as T.Vector3, end = u.uTownCutTarget.value as T.Vector3;
    const axis = end.clone().sub(eye), length = axis.length(); axis.normalize();
    const delta = p.clone().sub(eye), along = delta.dot(axis), across = delta.addScaledVector(axis, -along).length();
    if (owner < .5 || slot < .5 || p.clone().sub(u.uTownCutFeet.value as T.Vector3).dot(u.uTownCutUp.value as T.Vector3) <= .30 || along < 0 || along >= length - .08) return false;
    for (let i = 0; i < Number(u.uTownCutCount.value); i++) {
      const c = (u.uTownCutCenter.value as T.Vector4[])[i], h = (u.uTownCutHalf.value as T.Vector4[])[i], q = (u.uTownCutInverse.value as T.Vector4[])[i];
      const local = p.clone().sub(new T.Vector3(c.x, c.y, c.z)).applyQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w));
      if (Math.abs(owner - c.w) < .25 && Math.abs(slot - (u.uTownCutPart.value as Float32Array)[i]) < .25 && Math.abs(local.x) <= h.x && Math.abs(local.y) <= h.y && Math.abs(local.z) <= h.z && across < (.28 + .68 * along / length) * h.w) return true;
    }
    return false;
  };
  const owner = cut.ownerSlot('saved');
  expect(contains(point, owner, selected.partSlot)).toBe(true);
  expect(contains(point, owner, other.partSlot)).toBe(false);
  expect(contains(new T.Vector3(...other.center).add(new T.Vector3(0, 0, other.half[2])), owner, other.partSlot)).toBe(false);
  expect(contains(point, cut.ownerSlot('neighbour'), selected.partSlot)).toBe(false);
  expect(contains(point.clone().addScaledVector(up, selected.half[1] * .95), owner, selected.partSlot)).toBe(false);
  cut.reset(); expect(contains(point, owner, selected.partSlot)).toBe(false);
});
