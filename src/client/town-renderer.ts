import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlacedObject } from '../shared/planets.ts';
import type { Vec3 } from '../shared/world.ts';

export interface TownRenderDistrict { id: string; center: Vec3; objectIds: readonly string[] }
export interface TownRenderModel { object: T.Group; dispose(): void }
export interface TownRendererOptions {
  objects: readonly PlacedObject[];
  districts?: readonly TownRenderDistrict[];
  planetRadius: number;
  /** Radius of a sphere entirely inside the terrain. Omit to disable occlusion. */
  occluderRadius?: number;
  /** Same ordinary-object factory as the editable world; owns each returned handle.
   * Geometry must be single-material meshes. Shared resources must be marked. */
  buildObject(object: PlacedObject, lod: 'low' | 'medium'): TownRenderModel;
  nearRange?: number;
  /** Maximum radius of placement anchors in one batch. Actual mesh bounds,
   * including roofs and foundations, still decide conservative visibility. */
  maxChunkRadius?: number;
  mediumCacheChunks?: number;
  /** Ordinary models to generate per update, not entire multi-object chunks. */
  maxBuildsPerUpdate?: number;
  shadowRange?: number;
}
export interface TownRenderStats {
  totalObjects: number; totalChunks: number; visibleObjects: number; visibleChunks: number;
  mediumChunks: number; cachedMediumChunks: number; pendingMediumChunks: number;
  stagedMediumObjects: number;
  globalLowBatch: boolean;
  activeTriangles: number; activeDrawCalls: number; residentTriangles: number;
  residentGeometryBytes: number; initialBuildMs: number; lastBuildMs: number;
}
export interface TownRenderProgress {
  readyObjects: number; totalObjects: number; readyChunks: number; totalChunks: number;
  lastBuildMs: number; totalBuildMs: number;
}
export interface TownRenderPreparation {
  onProgress?: (progress: TownRenderProgress) => void;
  /** The host keeps its current scene/loading UI until the returned town is ready. */
  yieldFrame?: () => Promise<void>;
  /** Optional CPU budget shared by cheap models; zero yields for every model. */
  budgetMs?: number;
  signal?: AbortSignal;
}
interface FaceRange { first: number; count: number; objectId: string }
interface Batch {
  root: T.Group; models: TownRenderModel[]; triangles: number; bytes: number;
  meshes: T.Mesh[]; bounds: T.Box3;
}
interface Chunk {
  id: string; objects: PlacedObject[]; low: Batch; medium?: Batch;
  staged?: TownRenderModel[];
  bounds: T.Sphere; visible: boolean; detailed: boolean; used: number;
}

/** A conservative test: a whole bounding sphere is beyond the terrain horizon.
 * Tall roofs, chunk edges and an eye inside the conservative sphere stay drawn. */
export function townSphereOccluded(eye: T.Vector3, bounds: T.Sphere, solidRadius: number): boolean {
  const eyeRadius = eye.length();
  if (!(solidRadius > 0) || eyeRadius <= solidRadius) return false;
  const delta = bounds.center.clone().sub(eye), axis = eye.clone().multiplyScalar(-1 / eyeRadius);
  const along = delta.dot(axis), across = Math.sqrt(Math.max(0, delta.lengthSq() - along * along));
  const sine = solidRadius / eyeRadius, cosine = Math.sqrt(1 - sine * sine);
  // The entire sphere must be inside the terrain's tangent cone and behind
  // its tangent plane. This avoids the much looser sum of angular caps.
  const tangentPlane = eyeRadius * (1 - sine * sine);
  return along - bounds.radius > tangentPlane && along * sine - across * cosine > bounds.radius + 1e-4;
}

function geometryBytes(geometry: T.BufferGeometry) {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
}

function splitChunks(objects: readonly PlacedObject[], districts: readonly TownRenderDistrict[] | undefined, radius: number, maxChunkRadius: number) {
  const ids = new Set<string>();
  for (const object of objects) {
    if (ids.has(object.id)) throw new Error(`Duplicate town object: ${object.id}`);
    ids.add(object.id);
  }
  const memberships = new Map<string, TownRenderDistrict>();
  for (const district of districts ?? []) for (const id of district.objectIds) {
    if (!ids.has(id) || memberships.has(id)) throw new Error(`Invalid town district membership: ${id}`);
    memberships.set(id, district);
  }
  if (districts && memberships.size !== objects.length) throw new Error('Every town object must belong to exactly one district.');
  const groups = new Map<string, PlacedObject[]>();
  for (const object of objects) {
    const direction = new T.Vector3(...object.position).normalize(), district = memberships.get(object.id);
    let key: string;
    if (district) {
      const up = new T.Vector3(...district.center).normalize();
      if (up.lengthSq() < .5) throw new Error(`Invalid town district center: ${district.id}`);
      const reference = Math.abs(up.y) < .95 ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1);
      const right = reference.cross(up).normalize(), front = new T.Vector3().crossVectors(up, right);
      key = `${district.id}:${direction.dot(right) >= 0 ? 1 : 0}:${direction.dot(front) >= 0 ? 1 : 0}`;
    } else {
      const values = direction.toArray(), axis = values.map(Math.abs).indexOf(Math.max(...values.map(Math.abs)));
      const others = [0, 1, 2].filter(value => value !== axis);
      key = `${axis}:${values[axis] >= 0 ? 1 : 0}:${values[others[0]] >= 0 ? 1 : 0}:${values[others[1]] >= 0 ? 1 : 0}`;
    }
    const group = groups.get(key) ?? []; group.push(object); groups.set(key, group);
  }
  const result: [string, PlacedObject[]][] = [];
  for (const [id, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const bins: { bounds: T.Sphere; members: PlacedObject[] }[] = [];
    for (const object of members) {
      const point = new T.Vector3(...object.position).normalize().multiplyScalar(radius);
      const candidates = bins.map(bin => ({ bin, bounds: bin.bounds.clone().expandByPoint(point) }))
        .filter(candidate => candidate.bounds.radius <= maxChunkRadius).sort((a, b) => a.bounds.radius - b.bounds.radius);
      if (candidates.length) { candidates[0].bin.bounds = candidates[0].bounds; candidates[0].bin.members.push(object); }
      else bins.push({ bounds: new T.Sphere(point, 0), members: [object] });
    }
    bins.forEach((bin, index) => result.push([`${id}:${index}`, bin.members]));
  }
  return result;
}

/** Render-only cache of the complete ordinary-object ledger. Neither LOD nor
 * occlusion changes saved objects, authority, placement, supports or collision. */
function townRendererState(options: TownRendererOptions) {
  const root = new T.Group(); root.name = 'town-renderer';
  const empty = new T.BufferGeometry(); empty.userData.sharedResource = true;
  const nearRange = options.nearRange ?? 12, cacheLimit = Math.max(0, Math.floor(options.mediumCacheChunks ?? 8));
  const buildLimit = Math.max(0, Math.floor(options.maxBuildsPerUpdate ?? 1));
  const shadowRange = options.shadowRange ?? 18;
  const chunks: Chunk[] = [];
  let queued: [string, PlacedObject[]][];
  try { queued = splitChunks(options.objects, options.districts, options.planetRadius, options.maxChunkRadius ?? Infinity); }
  catch (error) { empty.dispose(); throw error; }
  let lowIndex = 0, builtLowObjects = 0, lastLowBuildMs = 0, stagedLow: TownRenderModel[] = [];
  let globalLow: Batch | null = null, globalShadowKey = '';
  let disposed = false, clock = 0, initialBuildMs = 0, lastBuildMs = 0, pending = 0;

  function release(batch: Batch) {
    for (const mesh of batch.meshes) mesh.geometry.dispose();
    for (const model of batch.models) model.dispose();
    batch.root.removeFromParent(); batch.root.clear();
  }

  /** Overview/orbit only: reuse already-built low vertices and materials. One
   * optional merged copy exists, is counted, and is freed on returning to the
   * street. No model factory, fitting, decoration or collision runs here. */
  function buildGlobalLow(): Batch {
    const batch: Batch = { root: new T.Group(), models: [], meshes: [], triangles: 0, bytes: 0, bounds: new T.Box3() };
    batch.root.name = 'town:global-low';
    const buckets = new Map<string, { source: T.Mesh; geometries: T.BufferGeometry[]; ranges: FaceRange[]; faces: number }>();
    const temporary: T.BufferGeometry[] = [];
    try {
      for (const chunk of chunks) for (const mesh of chunk.low.meshes) {
        const material = mesh.material as T.Material, key = `${material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}`;
        let bucket = buckets.get(key);
        if (!bucket) { bucket = { source: mesh, geometries: [], ranges: [], faces: 0 }; buckets.set(key, bucket); }
        for (const range of mesh.userData.townFaceRanges as FaceRange[]) bucket.ranges.push({ ...range, first: range.first + bucket.faces });
        bucket.faces += mesh.geometry.attributes.position.count / 3;
        bucket.geometries.push(mesh.geometry);
      }
      for (const bucket of buckets.values()) {
        const attributes = new Map<string, T.BufferAttribute>();
        for (const geometry of bucket.geometries) for (const [name, attribute] of Object.entries(geometry.attributes)) {
          if (!(attribute instanceof T.BufferAttribute)) throw new Error('Interleaved town attributes need an explicit adapter.');
          const prior = attributes.get(name);
          if (prior && (prior.itemSize !== attribute.itemSize || prior.normalized !== attribute.normalized || prior.array.constructor !== attribute.array.constructor))
            throw new Error(`Incompatible global town attribute: ${name}`);
          attributes.set(name, attribute);
        }
        const geometries = bucket.geometries.map(original => {
          if ([...attributes.keys()].every(name => original.getAttribute(name))) return original;
          const geometry = original.clone(); temporary.push(geometry);
          for (const [name, attribute] of attributes) if (!geometry.getAttribute(name)) {
            const array = new (attribute.array.constructor as Float32ArrayConstructor)(geometry.attributes.position.count * attribute.itemSize);
            geometry.setAttribute(name, new T.BufferAttribute(array, attribute.itemSize, attribute.normalized));
          }
          return geometry;
        });
        const geometry = mergeGeometries(geometries);
        if (!geometry) throw new Error('Global town merge failed.');
        const mesh = new T.Mesh(geometry, bucket.source.material);
        mesh.castShadow = bucket.source.castShadow; mesh.receiveShadow = bucket.source.receiveShadow; mesh.renderOrder = bucket.source.renderOrder;
        mesh.userData.townFaceRanges = bucket.ranges;
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        batch.bounds.union(geometry.boundingBox!); batch.bytes += geometryBytes(geometry); batch.triangles += bucket.faces;
        batch.meshes.push(mesh); batch.root.add(mesh);
      }
      batch.root.userData.emitters = chunks.flatMap(chunk => chunk.low.root.userData.emitters ?? []);
      return batch;
    } catch (error) { release(batch); throw error; }
    finally { for (const geometry of temporary) geometry.dispose(); }
  }

  function build(objects: readonly PlacedObject[], lod: 'low' | 'medium', prepared: readonly TownRenderModel[] = []): Batch {
    const batch: Batch = { root: new T.Group(), models: [...prepared], meshes: [], triangles: 0, bytes: 0, bounds: new T.Box3() };
    batch.root.name = `town:${lod}`;
    const buckets = new Map<string, { material: T.Material; cast: boolean; receive: boolean; order: number; geometries: T.BufferGeometry[]; ranges: FaceRange[]; faces: number }>();
    const scratch: T.BufferGeometry[] = [];
    const emitters: { kind: string; position: number[]; direction: number[]; color?: string }[] = [];
    try {
      for (const [index, object] of objects.entries()) {
        const model = prepared[index] ?? options.buildObject(object, lod); if (!prepared[index]) batch.models.push(model);
        model.object.updateWorldMatrix(true, true);
        model.object.traverseVisible(node => {
          const sourceEmitters = node.userData.emitters as { kind: string; position: Vec3; direction: Vec3; color?: string }[] | undefined;
          for (const emitter of sourceEmitters ?? []) emitters.push({ ...emitter,
            position: new T.Vector3(...emitter.position).applyMatrix4(node.matrixWorld).toArray(),
            direction: new T.Vector3(...emitter.direction).transformDirection(node.matrixWorld).toArray() });
          if (node instanceof T.Line || node instanceof T.Points || node instanceof T.InstancedMesh)
            throw new Error(`Town factory must return ordinary merged meshes: ${object.id}`);
          if (!(node instanceof T.Mesh)) return;
          if (Array.isArray(node.material)) throw new Error(`Town mesh needs one material: ${object.id}`);
          const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
          scratch.push(geometry); geometry.applyMatrix4(node.matrixWorld);
          if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
          if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
          const key = `${node.material.uuid}:${node.castShadow}:${node.receiveShadow}:${node.renderOrder}`;
          let bucket = buckets.get(key);
          if (!bucket) { bucket = { material: node.material, cast: node.castShadow, receive: node.receiveShadow, order: node.renderOrder, geometries: [], ranges: [], faces: 0 }; buckets.set(key, bucket); }
          const count = geometry.attributes.position.count / 3;
          bucket.ranges.push({ first: bucket.faces, count, objectId: object.id }); bucket.faces += count;
          bucket.geometries.push(geometry);
        });
      }
      for (const bucket of buckets.values()) {
        // Preserve the village's cover and any other vertex attributes. Props
        // without an attribute get zeros, instead of dropping indoor shading.
        const attributes = new Map<string, T.BufferAttribute>();
        for (const geometry of bucket.geometries) for (const [name, attribute] of Object.entries(geometry.attributes)) {
          if (!(attribute instanceof T.BufferAttribute)) throw new Error('Interleaved town attributes need an explicit adapter.');
          const prior = attributes.get(name);
          if (prior && (prior.itemSize !== attribute.itemSize || prior.normalized !== attribute.normalized || prior.array.constructor !== attribute.array.constructor))
            throw new Error(`Incompatible town attribute: ${name}`);
          attributes.set(name, attribute);
        }
        for (const geometry of bucket.geometries) for (const [name, attribute] of attributes) if (!geometry.getAttribute(name)) {
          const array = new (attribute.array.constructor as Float32ArrayConstructor)(geometry.attributes.position.count * attribute.itemSize);
          geometry.setAttribute(name, new T.BufferAttribute(array, attribute.itemSize, attribute.normalized));
        }
        const geometry = mergeGeometries(bucket.geometries);
        if (!geometry) throw new Error('Town geometry merge failed.');
        const mesh = new T.Mesh(geometry, bucket.material);
        mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive; mesh.renderOrder = bucket.order;
        mesh.userData.townCastsShadow = bucket.cast; mesh.userData.townFaceRanges = bucket.ranges;
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        batch.bounds.union(geometry.boundingBox!); batch.bytes += geometryBytes(geometry); batch.triangles += bucket.faces;
        batch.meshes.push(mesh); batch.root.add(mesh);
      }
      batch.root.userData.emitters = emitters;
      // Handles retain owned materials (notably lamps) until this batch is
      // retired. Drop their now-baked vertex arrays, retaining material hooks.
      const freed = new Set<T.BufferGeometry>();
      for (const model of batch.models) model.object.traverse(node => {
        if (!(node instanceof T.Mesh)) return;
        const geometry = node.geometry;
        if (!geometry.userData.sharedResource && !freed.has(geometry)) { geometry.dispose(); freed.add(geometry); }
        node.geometry = empty;
      });
      return batch;
    } catch (error) { release(batch); throw error; }
    finally { for (const geometry of scratch) geometry.dispose(); }
  }

  /** One ordinary model per preparation step. Completing that model's chunk
   * also bakes only that chunk, never the entire town in one final operation. */
  function prepareLowStep() {
    if (disposed || lowIndex >= queued.length) return;
    const start = performance.now();
    try {
      const [id, objects] = queued[lowIndex];
      stagedLow.push(options.buildObject(objects[stagedLow.length], 'low')); builtLowObjects++;
      if (stagedLow.length < objects.length) return;
      const prepared = stagedLow; stagedLow = [];
      const low = build(objects, 'low', prepared); root.add(low.root);
      // Extra metre keeps tiny LOD silhouette differences inside culling bounds.
      const bounds = low.bounds.isEmpty() ? new T.Sphere(new T.Vector3(...objects[0].position).multiplyScalar(options.planetRadius), 5)
        : low.bounds.clone().expandByScalar(1).getBoundingSphere(new T.Sphere());
      chunks.push({ id, objects, low, bounds, visible: true, detailed: false, used: 0 });
      lowIndex++;
    } catch (error) { dispose(); throw error; }
    finally { lastLowBuildMs = performance.now() - start; initialBuildMs += lastLowBuildMs; }
  }

  function stats(): TownRenderStats {
    const active = chunks.filter(chunk => chunk.visible);
    let stagedBytes = 0, stagedTriangles = 0;
    const stagedGeometry = new Set<T.BufferGeometry>();
    for (const chunk of chunks) for (const model of chunk.staged ?? []) model.object.traverse(node => {
      if (!(node instanceof T.Mesh) || stagedGeometry.has(node.geometry)) return;
      stagedGeometry.add(node.geometry); stagedBytes += geometryBytes(node.geometry);
      stagedTriangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    });
    return {
      totalObjects: options.objects.length, totalChunks: chunks.length,
      visibleObjects: globalLow ? options.objects.length : active.reduce((sum, chunk) => sum + chunk.objects.length, 0), visibleChunks: globalLow ? 1 : active.length,
      mediumChunks: active.filter(chunk => chunk.detailed).length, cachedMediumChunks: chunks.filter(chunk => chunk.medium).length,
      pendingMediumChunks: pending,
      stagedMediumObjects: chunks.reduce((sum, chunk) => sum + (chunk.staged?.length ?? 0), 0),
      globalLowBatch: !!globalLow,
      activeTriangles: globalLow?.triangles ?? active.reduce((sum, chunk) => sum + (chunk.detailed ? chunk.medium! : chunk.low).triangles, 0),
      activeDrawCalls: globalLow?.meshes.length ?? active.reduce((sum, chunk) => sum + (chunk.detailed ? chunk.medium! : chunk.low).meshes.length, 0),
      residentTriangles: stagedTriangles + (globalLow?.triangles ?? 0) + chunks.reduce((sum, chunk) => sum + chunk.low.triangles + (chunk.medium?.triangles ?? 0), 0),
      residentGeometryBytes: stagedBytes + (globalLow?.bytes ?? 0) + chunks.reduce((sum, chunk) => sum + chunk.low.bytes + (chunk.medium?.bytes ?? 0), 0),
      initialBuildMs, lastBuildMs,
    };
  }

  function update(eye: T.Vector3, feet = eye, view: { lowOnly?: boolean; globalLow?: boolean } = {}) {
    if (disposed) return stats();
    clock++; lastBuildMs = 0;
    for (const chunk of chunks) chunk.visible = !townSphereOccluded(eye, chunk.bounds, options.occluderRadius ?? 0);
    const distance = (chunk: Chunk) => Math.max(0, chunk.bounds.center.distanceTo(feet) - chunk.bounds.radius);
    const wanted = new Set(view.lowOnly || view.globalLow ? [] : chunks.filter(chunk => chunk.visible && distance(chunk) <= nearRange + (chunk.detailed ? 2 : 0))
      .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id)).slice(0, cacheLimit));
    for (const chunk of chunks) if (chunk.staged && !wanted.has(chunk)) {
      for (const model of chunk.staged) model.dispose(); chunk.staged = undefined;
    }
    let built = 0;
    for (const chunk of wanted) {
      chunk.used = clock;
      if (chunk.medium || built >= buildLimit) continue;
      if (chunks.filter(item => item.medium).length >= cacheLimit) {
        const victim = chunks.filter(item => item.medium && !wanted.has(item)).sort((a, b) => a.used - b.used)[0];
        if (!victim) continue;
        release(victim.medium!); victim.medium = undefined; victim.detailed = false;
      }
      const start = performance.now(); chunk.staged ??= [];
      try {
        while (chunk.staged.length < chunk.objects.length && built < buildLimit) {
          chunk.staged.push(options.buildObject(chunk.objects[chunk.staged.length], 'medium')); built++;
        }
      } catch (error) {
        for (const model of chunk.staged) model.dispose(); chunk.staged = undefined; throw error;
      }
      if (chunk.staged.length < chunk.objects.length) { lastBuildMs += performance.now() - start; continue; }
      const prepared = chunk.staged; chunk.staged = undefined;
      chunk.medium = build(chunk.objects, 'medium', prepared); lastBuildMs += performance.now() - start;
      root.add(chunk.medium.root);
      if (!chunk.medium.bounds.isEmpty()) chunk.bounds = chunk.low.bounds.clone().union(chunk.medium.bounds).expandByScalar(1).getBoundingSphere(new T.Sphere());
    }
    pending = [...wanted].filter(chunk => !chunk.medium).length;
    for (const chunk of chunks) {
      chunk.detailed = wanted.has(chunk) && !!chunk.medium;
      chunk.low.root.visible = !view.globalLow && chunk.visible && !chunk.detailed;
      if (chunk.medium) chunk.medium.root.visible = chunk.visible && chunk.detailed;
      for (const batch of [chunk.low, chunk.medium]) if (batch) for (const mesh of batch.meshes)
        mesh.castShadow = !!mesh.userData.townCastsShadow && distance(chunk) <= shadowRange;
    }
    if (view.globalLow) {
      // Preserve the same per-chunk shadow selection as the street renderer;
      // material identity and caster flags remain separate batch keys.
      const shadowKey = chunks.map(chunk => distance(chunk) <= shadowRange ? '1' : '0').join('');
      if (!globalLow || globalShadowKey !== shadowKey) {
        if (globalLow) release(globalLow);
        globalLow = null;
        const start = performance.now(); globalLow = buildGlobalLow(); lastBuildMs += performance.now() - start;
        globalShadowKey = shadowKey; root.add(globalLow.root);
      }
    } else if (globalLow) { release(globalLow); globalLow = null; globalShadowKey = ''; }
    return stats();
  }

  function pick(hit: T.Intersection): string | null {
    if (hit.faceIndex == null) return null;
    const ranges = hit.object.userData.townFaceRanges as FaceRange[] | undefined;
    return ranges?.find(range => hit.faceIndex! >= range.first && hit.faceIndex! < range.first + range.count)?.objectId ?? null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (globalLow) release(globalLow); globalLow = null;
    for (const model of stagedLow) model.dispose(); stagedLow = [];
    for (const chunk of chunks) { release(chunk.low); if (chunk.medium) release(chunk.medium); for (const model of chunk.staged ?? []) model.dispose(); }
    chunks.length = 0; pending = 0; empty.dispose(); root.removeFromParent(); root.clear();
  }
  root.userData.disposeOwned = dispose;
  return {
    renderer: { root, update, stats, pick, dispose }, prepareLowStep,
    ready: () => lowIndex >= queued.length,
    progress: (): TownRenderProgress => ({ readyObjects: builtLowObjects, totalObjects: options.objects.length, readyChunks: chunks.length, totalChunks: queued.length, lastBuildMs: lastLowBuildMs, totalBuildMs: initialBuildMs }),
  };
}

export function createTownRenderer(options: TownRendererOptions) {
  const state = townRendererState(options);
  while (!state.ready()) state.prepareLowStep();
  return state.renderer;
}

/** Prepare the exact same complete low town while allowing loading UI and the
 * previous scene to render between ordinary objects. No partial town escapes
 * this function; cancellation and failed factories release all owned work. */
export async function createTownRendererAsync(options: TownRendererOptions, preparation: TownRenderPreparation = {}) {
  const budget = preparation.budgetMs ?? 0;
  if (!Number.isFinite(budget) || budget < 0) throw new Error('Invalid town preparation budget.');
  const state = townRendererState(options), { signal, onProgress } = preparation;
  const yieldFrame = preparation.yieldFrame ?? (() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const checkAbort = () => { if (signal?.aborted) throw signal.reason ?? new Error('Town construction cancelled.'); };
  // An abort also settles preparation while a hidden-tab rAF is suspended.
  const yieldToHost = () => new Promise<void>((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal?.reason ?? new Error('Town construction cancelled.')); };
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    Promise.resolve().then(yieldFrame).then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
  });
  try {
    checkAbort(); onProgress?.(state.progress());
    let started = -Infinity;
    while (!state.ready()) {
      if (performance.now() - started >= budget) {
        await yieldToHost(); started = performance.now();
      }
      checkAbort();
      state.prepareLowStep(); onProgress?.(state.progress());
    }
    checkAbort();
    return state.renderer;
  } catch (error) { state.renderer.dispose(); throw error; }
}
