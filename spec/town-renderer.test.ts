import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { createTownRenderer, createTownRendererAsync, townSphereOccluded } from '../src/client/town-renderer.ts';
import type { TownRenderDistrict, TownRenderModel } from '../src/client/town-renderer.ts';
import type { PlacedObject } from '../src/shared/planets.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { buildBlueprintModel } from '../src/shared/blueprint-model3d.ts';
import { villageCottage } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { disposeObject3D } from '../src/assets/claude-geometry/core/dispose.ts';

const object = (id: string, position: Vec3): PlacedObject => ({ id, kind: 'tree', position, rotation: 0, version: 1 });
const district = (id: string, objects: PlacedObject[]): TownRenderDistrict => ({ id, center: objects[0].position, objectIds: objects.map(o => o.id) });
function fixture() {
  const made: { objectId: string; lod: string; geometry: T.BufferGeometry; material: T.Material; freed: ReturnType<typeof vi.fn>; materialFreed: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
  const shared = new T.MeshBasicMaterial(); shared.userData.sharedResource = true;
  const buildObject = (o: PlacedObject, lod: 'low' | 'medium'): TownRenderModel => {
    const root = new T.Group(), geometry = new T.BoxGeometry(1, lod === 'low' ? 2 : 2.1, 1), material = shared;
    const freed = vi.fn(), materialFreed = vi.fn(); geometry.addEventListener('dispose', freed); material.addEventListener('dispose', materialFreed);
    if (o.id === 'covered') geometry.setAttribute('cover', new T.Float32BufferAttribute(Array(geometry.attributes.position.count).fill(1), 1));
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); root.position.fromArray(o.position).multiplyScalar(22);
    const dispose = vi.fn(() => disposeObject3D(root)); made.push({ objectId: o.id, lod, geometry, material, freed, materialFreed, dispose });
    return { object: root, dispose };
  };
  return { made, shared, buildObject };
}

describe('town render cache', () => {
  it('shares a bounded frame between cheap models without dropping objects', async () => {
    const objects = [object('a', [0, 1, 0]), object('b', [-.09, .99594, 0]), object('c', [0, -1, 0])], f = fixture();
    let clock = 0, yields = 0;
    const timer = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    let town: ReturnType<typeof createTownRenderer> | undefined;
    try {
      town = await createTownRendererAsync({ objects, planetRadius: 21.6, buildObject: (o, lod) => {
        const model = f.buildObject(o, lod); clock += 4; return model;
      } }, { budgetMs: 6, yieldFrame: async () => { yields++; } });
      expect(yields).toBe(2); expect(f.made.map(model => model.objectId).sort()).toEqual(['a', 'b', 'c']);
      expect(town.stats().totalObjects).toBe(3);
    } finally { timer.mockRestore(); town?.dispose(); f.shared.dispose(); }
    for (const model of f.made) expect(model.freed).toHaveBeenCalledTimes(1);
  });

  it('prepares the identical complete low town with a yield before each ordinary model', async () => {
    const objects = [object('covered', [0, 1, 0]), object('outside', [-.09, .99594, 0]), object('south', [0, -1, 0])];
    const districts = [district('north', objects.slice(0, 2)), district('south', objects.slice(2))], sync = fixture(), async = fixture();
    const options = { objects, districts, planetRadius: 21.6, mediumCacheChunks: 0 };
    const reference = createTownRenderer({ ...options, buildObject: sync.buildObject });
    let yields = 0; const progress: number[] = [];
    const pending = createTownRendererAsync({ ...options, buildObject: async.buildObject }, {
      yieldFrame: async () => { expect(async.made).toHaveLength(yields); yields++; },
      onProgress: p => { progress.push(p.readyObjects); expect(p.readyObjects).toBeLessThanOrEqual(yields); },
    });
    expect(async.made).toHaveLength(0);
    const town = await pending;
    expect(yields).toBe(3); expect(progress).toEqual([0, 1, 2, 3]);
    const geometry = (root: T.Group) => {
      const result: Record<string, number[]>[] = [];
      root.traverse(node => { if (node instanceof T.Mesh) result.push(Object.fromEntries(Object.entries(node.geometry.attributes as Record<string, T.BufferAttribute>).map(([name, attribute]) => [name, Array.from(attribute.array)]))); });
      return result;
    };
    expect(geometry(town.root)).toEqual(geometry(reference.root));
    expect(town.stats()).toMatchObject({ totalObjects: 3, totalChunks: 2, activeTriangles: reference.stats().activeTriangles, residentGeometryBytes: reference.stats().residentGeometryBytes });
    expect(town.update(new T.Vector3(0, 80, 0), undefined, { globalLow: true })).toMatchObject({ visibleObjects: 3, globalLowBatch: true });
    town.dispose(); reference.dispose(); sync.shared.dispose(); async.shared.dispose();
  });

  it('cancels while a yield is suspended and frees both finished chunks and staged low models', async () => {
    const objects = [object('a', [0, 1, 0]), object('b', [0, -1, 0]), object('c', [.09, -.99594, 0])], f = fixture();
    const controller = new AbortController(), reason = new Error('Leave town'); let yields = 0;
    const pending = createTownRendererAsync({ objects, districts: [district('a', objects.slice(0, 1)), district('b', objects.slice(1))], planetRadius: 21.6, buildObject: f.buildObject }, {
      signal: controller.signal,
      yieldFrame: () => { yields++; if (yields < 3) return Promise.resolve(); controller.abort(reason); return new Promise<void>(() => {}); },
    });
    await expect(pending).rejects.toBe(reason); expect(f.made).toHaveLength(2);
    for (const model of f.made) { expect(model.dispose).toHaveBeenCalledTimes(1); expect(model.freed).toHaveBeenCalledTimes(1); expect(model.materialFreed).not.toHaveBeenCalled(); }
    f.shared.dispose();
  });

  it('releases prepared models when the next low factory or loading callback fails', async () => {
    const objects = [object('a', [0, 1, 0]), object('b', [-.09, .99594, 0])];
    for (const failure of ['factory', 'progress'] as const) {
      const f = fixture(), reason = new Error(failure);
      const pending = createTownRendererAsync({ objects, districts: [district('same', objects)], planetRadius: 21.6,
        buildObject: (o, lod) => { if (failure === 'factory' && f.made.length) throw reason; return f.buildObject(o, lod); },
      }, { yieldFrame: () => Promise.resolve(), onProgress: p => { if (failure === 'progress' && p.readyObjects === 2) throw reason; } });
      await expect(pending).rejects.toBe(reason);
      for (const model of f.made) { expect(model.dispose).toHaveBeenCalledTimes(1); expect(model.freed).toHaveBeenCalledTimes(1); }
      f.shared.dispose();
    }
  });

  it('keeps every ledger object in one spatial chunk and rejects missing or duplicate district assignments', () => {
    const objects = [object('a', [0, 1, 0]), object('b', [0, -1, 0])], f = fixture();
    expect(() => createTownRenderer({ objects, districts: [district('north', [objects[0]])], planetRadius: 21.6, buildObject: f.buildObject })).toThrow('Every town object');
    expect(() => createTownRenderer({ objects, districts: [district('north', objects), district('copy', [objects[0]])], planetRadius: 21.6, buildObject: f.buildObject })).toThrow('membership');
    expect(f.made).toHaveLength(0);
    const before = JSON.stringify(objects), town = createTownRenderer({ objects, planetRadius: 21.6, buildObject: f.buildObject });
    expect(town.stats().totalObjects).toBe(2); expect(town.stats().totalChunks).toBe(2);
    town.update(new T.Vector3(0, 24, 0)); expect(JSON.stringify(objects)).toBe(before);
    town.dispose(); f.shared.dispose();
  });

  it('retains cover attributes and maps actual ray hits through material batching to the original object ids', () => {
    const a = object('covered', [0, 1, 0]), b = object('outside', [-.09, .99594, 0]), objects = [a, b], f = fixture();
    const town = createTownRenderer({ objects, districts: [district('same', objects)], planetRadius: 21.6, buildObject: f.buildObject, mediumCacheChunks: 0 });
    town.root.updateWorldMatrix(true, true);
    const meshes: T.Mesh[] = []; town.root.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
    expect(meshes).toHaveLength(1);
    const cover = meshes[0].geometry.getAttribute('cover');
    expect(Array.from(cover.array).filter(x => x === 1)).toHaveLength(36);
    expect(Array.from(cover.array).filter(x => x === 0)).toHaveLength(36);
    for (const o of objects) {
      const ray = new T.Raycaster(new T.Vector3(o.position[0] * 22, o.position[1] * 22, 5), new T.Vector3(0, 0, -1));
      const hits = ray.intersectObject(town.root, true); expect(hits.length).toBeGreaterThan(0); expect(town.pick(hits[0])).toBe(o.id);
    }
    town.dispose(); f.shared.dispose();
  });

  it('never drops a visible object while medium detail is queued and evicts only unused cached detail', () => {
    const objects = [object('a', [0, 1, 0]), object('b', [1, 0, 0]), object('c', [0, -1, 0])], f = fixture();
    const town = createTownRenderer({ objects, districts: objects.map((o, i) => district(String(i), [o])), planetRadius: 21.6, buildObject: f.buildObject, nearRange: 4, mediumCacheChunks: 1 });
    for (const o of objects) {
      const point = new T.Vector3(...o.position).multiplyScalar(24), stats = town.update(point);
      expect(stats.visibleObjects).toBe(3); expect(stats.mediumChunks).toBe(1); expect(stats.cachedMediumChunks).toBe(1);
      expect(stats.activeTriangles).toBe(36);
    }
    const retiredMedium = f.made.filter(m => m.lod === 'medium' && m.objectId !== 'c');
    expect(retiredMedium).toHaveLength(2); for (const m of retiredMedium) expect(m.dispose).toHaveBeenCalledTimes(1);
    const orbit = town.update(new T.Vector3(0, 80, 0), undefined, { lowOnly: true });
    expect(orbit.mediumChunks).toBe(0); expect(orbit.visibleObjects).toBe(3); expect(orbit.cachedMediumChunks).toBe(1);
    town.dispose(); f.shared.dispose();
  });

  it('releases replaced source geometry and all cached resources once, preserving borrowed materials', () => {
    const f = fixture(), objects = [object('a', [0, 1, 0])], town = createTownRenderer({ objects, planetRadius: 21.6, buildObject: f.buildObject });
    expect(f.made[0].freed).toHaveBeenCalledTimes(1); expect(f.made[0].materialFreed).not.toHaveBeenCalled();
    town.update(new T.Vector3(0, 24, 0));
    const buffers: ReturnType<typeof vi.fn>[] = [];
    town.root.traverse(o => { if (o instanceof T.Mesh) { const freed = vi.fn(); buffers.push(freed); o.geometry.addEventListener('dispose', freed); } });
    town.dispose(); town.dispose();
    for (const m of f.made) { expect(m.dispose).toHaveBeenCalledTimes(1); expect(m.freed).toHaveBeenCalledTimes(1); expect(m.materialFreed).not.toHaveBeenCalled(); }
    for (const freed of buffers) expect(freed).toHaveBeenCalledTimes(1);
    expect(town.root.children).toHaveLength(0); expect(town.stats().residentGeometryBytes).toBe(0); f.shared.dispose();
  });

  it('builds at most one ordinary medium model per frame while a whole multi-object chunk remains visible', () => {
    const objects = [object('a', [0, 1, 0]), object('b', [-.08, .9968, 0])], f = fixture();
    const town = createTownRenderer({ objects, districts: [district('same', objects)], planetRadius: 21.6, buildObject: f.buildObject });
    expect(town.update(new T.Vector3(0, 24, 0))).toMatchObject({ visibleObjects: 2, mediumChunks: 0, pendingMediumChunks: 1, stagedMediumObjects: 1 });
    expect(f.made.filter(m => m.lod === 'medium')).toHaveLength(1);
    expect(town.update(new T.Vector3(0, 24, 0))).toMatchObject({ visibleObjects: 2, mediumChunks: 1, pendingMediumChunks: 0, stagedMediumObjects: 0 });
    expect(f.made.filter(m => m.lod === 'medium')).toHaveLength(2);
    town.dispose(); f.shared.dispose();
  });

  it('keeps distinct shadow flags when materials are shared', () => {
    const f = fixture(), original = f.buildObject, objects = [object('a', [0, 1, 0]), object('b', [-.08, .9968, 0])];
    const town = createTownRenderer({ objects, districts: [district('same', objects)], planetRadius: 21.6, mediumCacheChunks: 0,
      buildObject(o, lod) { const model = original(o, lod); model.object.children[0].castShadow = o.id === 'a'; return model; } });
    const meshes: T.Mesh[] = []; town.root.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
    expect(meshes).toHaveLength(2); expect(meshes.map(m => m.castShadow).sort()).toEqual([false, true]);
    town.update(new T.Vector3(0, -24, 0)); expect(meshes.every(m => !m.castShadow)).toBe(true);
    town.update(new T.Vector3(0, 24, 0)); expect(meshes.map(m => m.castShadow).sort()).toEqual([false, true]);
    town.dispose(); f.shared.dispose();
  });

  it('merges existing low batches for orbit without rebuilding models, retains picks, and frees the extra copy on return', () => {
    const objects = [object('north', [0, 1, 0]), object('south', [0, -1, 0])], f = fixture();
    const town = createTownRenderer({ objects, planetRadius: 21.6, mediumCacheChunks: 0, buildObject: f.buildObject });
    const originalBytes = town.stats().residentGeometryBytes;
    const orbit = town.update(new T.Vector3(0, 80, 0), undefined, { globalLow: true });
    expect(orbit).toMatchObject({ totalObjects: 2, visibleObjects: 2, globalLowBatch: true, activeDrawCalls: 1, activeTriangles: 24 });
    expect(f.made).toHaveLength(2); expect(orbit.residentGeometryBytes).toBe(originalBytes * 2);
    const batch = town.root.getObjectByName('town:global-low')!; town.root.updateWorldMatrix(true, true);
    const geometries: T.BufferGeometry[] = []; batch.traverse(o => { if (o instanceof T.Mesh) geometries.push(o.geometry); });
    const freed = vi.fn(); geometries[0].addEventListener('dispose', freed);
    for (const o of objects) {
      const hits = new T.Raycaster(new T.Vector3(0, o.position[1] * 22, 5), new T.Vector3(0, 0, -1)).intersectObject(batch, true);
      expect(town.pick(hits[0])).toBe(o.id);
    }
    town.update(new T.Vector3(0, 80, 0), undefined, { globalLow: true }); expect(f.made).toHaveLength(2); expect(freed).not.toHaveBeenCalled();
    expect(town.update(new T.Vector3(0, 24, 0))).toMatchObject({ globalLowBatch: false, residentGeometryBytes: originalBytes });
    expect(freed).toHaveBeenCalledTimes(1); town.dispose(); expect(freed).toHaveBeenCalledTimes(1); f.shared.dispose();
  });

  it('batches the actual village blueprint at both tiers without changing its structure or shader hooks', () => {
    const blueprint = villageCottage(), before = JSON.stringify(blueprint);
    const libraries = { low: new StyleLibrary('low', { look: 'village' }), medium: new StyleLibrary('medium', { look: 'village' }) };
    const objects = [object('real-village', [0, 1, 0])];
    const town = createTownRenderer({ objects, planetRadius: 21.6, buildObject(o, lod) {
      const model = buildBlueprintModel(blueprint.parts, libraries[lod], lod, { foundationDepth: .3, sockets: false });
      model.object.position.fromArray(o.position).multiplyScalar(22); return model;
    } });
    const low = town.stats(); expect(low.activeTriangles).toBeGreaterThan(3000); expect(low.activeDrawCalls).toBeLessThanOrEqual(10);
    const medium = town.update(new T.Vector3(0, 24, 0)); expect(medium.mediumChunks).toBe(1); expect(medium.activeTriangles).toBeGreaterThan(low.activeTriangles);
    let covered = 0; town.root.traverseVisible(o => { if (o instanceof T.Mesh) { expect(o.geometry.getAttribute('cover')).toBeDefined(); if ((o.material as T.Material).userData.interior) covered++; } });
    expect(covered).toBeGreaterThan(0); expect(JSON.stringify(blueprint)).toBe(before);
    const sourceMaterials = new Set<T.Material>(); town.root.traverse(o => { if (o instanceof T.Mesh) sourceMaterials.add(o.material as T.Material); });
    town.update(new T.Vector3(0, 80, 0), undefined, { globalLow: true });
    let indoorVertices = 0; town.root.traverseVisible(o => { if (o instanceof T.Mesh) {
      expect(sourceMaterials.has(o.material as T.Material)).toBe(true);
      const cover = o.geometry.getAttribute('cover'); expect(cover).toBeDefined();
      indoorVertices += Array.from(cover.array).filter(value => value === 1).length;
    } });
    expect(indoorVertices).toBeGreaterThan(0);
    town.dispose(); libraries.low.dispose(); libraries.medium.dispose();
  });
});

describe('town horizon culling', () => {
  it('hides only a wholly occluded sphere, retaining near, horizon, tall and inside-eye cases', () => {
    const eye = new T.Vector3(0, 24, 0);
    expect(townSphereOccluded(eye, new T.Sphere(new T.Vector3(0, -23, 0), 2), 20)).toBe(true);
    expect(townSphereOccluded(eye, new T.Sphere(new T.Vector3(0, 23, 0), 2), 20)).toBe(false);
    expect(townSphereOccluded(eye, new T.Sphere(new T.Vector3(20, 10, 0), 5), 20)).toBe(false);
    expect(townSphereOccluded(eye, new T.Sphere(new T.Vector3(30, 0, 0), 10), 20)).toBe(false);
    expect(townSphereOccluded(new T.Vector3(0, 19, 0), new T.Sphere(new T.Vector3(0, -23, 0), 2), 20)).toBe(false);
  });

  it('only culls bounds whose sampled surface points are all occluded by the solid sphere', () => {
    const eye = new T.Vector3(0, 25.6, 0), solid = new T.Sphere(new T.Vector3(), 20.13);
    for (let latitude = -80; latitude <= 80; latitude += 10) for (const r of [1, 3, 6, 10]) {
      const angle = latitude * Math.PI / 180, bounds = new T.Sphere(new T.Vector3(24 * Math.cos(angle), 24 * Math.sin(angle), 0), r);
      if (!townSphereOccluded(eye, bounds, solid.radius)) continue;
      for (let i = 0; i < 200; i++) {
        const y = 1 - 2 * (i + .5) / 200, azimuth = i * 2.399963229728653, width = Math.sqrt(1 - y * y);
        const point = new T.Vector3(width * Math.cos(azimuth), y, width * Math.sin(azimuth)).multiplyScalar(r).add(bounds.center);
        const ray = new T.Ray(eye, point.clone().sub(eye).normalize()), hit = ray.intersectSphere(solid, new T.Vector3());
        expect(hit).not.toBeNull(); expect(eye.distanceTo(hit!)).toBeLessThan(eye.distanceTo(point));
      }
    }
  });

  it('retains the complete object count while visibility changes between opposite hemispheres', () => {
    const objects = [object('north', [0, 1, 0]), object('south', [0, -1, 0])], f = fixture();
    const town = createTownRenderer({ objects, planetRadius: 21.6, occluderRadius: 20, mediumCacheChunks: 0, buildObject: f.buildObject });
    expect(town.update(new T.Vector3(0, 24, 0))).toMatchObject({ totalObjects: 2, visibleObjects: 1 });
    expect(town.update(new T.Vector3(0, -24, 0))).toMatchObject({ totalObjects: 2, visibleObjects: 1 });
    expect(town.stats().residentTriangles).toBe(24); town.dispose(); f.shared.dispose();
  });
});
