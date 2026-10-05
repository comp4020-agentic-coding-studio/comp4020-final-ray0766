import * as T from 'three';

// Resource ownership convention for all four modules:
//
// 1. Every factory returns a ModelHandle. Whoever holds the handle must call
//    dispose() exactly once; a second call is a no-op.
// 2. dispose() removes the object from its parent and frees every geometry,
//    material and texture the handle created, except resources registered with
//    markShared(). Shared resources (the style library's cached textures and the
//    environment map) belong to their library and are freed by it.
// 3. Tests count live resources with ResourceTracker; the browser demos read
//    renderer.info.memory. Both must return to their baseline after a
//    create/dispose cycle.

export interface Disposable { dispose(): void }

export interface ModelHandle<O extends T.Object3D = T.Object3D> extends Disposable {
  readonly object: O;
  readonly disposed: boolean;
}

const shared = new WeakSet<object>();
/** Mark a geometry/material/texture as owned by a library rather than a model. */
export function markShared<R extends object>(resource: R): R { shared.add(resource); return resource; }
export const isShared = (resource: object) => shared.has(resource);

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'clearcoatNormalMap', 'envMap', 'lightMap', 'displacementMap'] as const;

export function materialTextures(material: T.Material): T.Texture[] {
  const out: T.Texture[] = [];
  for (const slot of TEXTURE_SLOTS) {
    const t = (material as unknown as Record<string, unknown>)[slot];
    if (t instanceof T.Texture) out.push(t);
  }
  return out;
}

function materialsOf(object: T.Object3D): T.Material[] {
  const m = (object as T.Mesh).material as T.Material | T.Material[] | undefined;
  return m ? (Array.isArray(m) ? m : [m]) : [];
}

/** Free everything under `root` that is not shared, then detach it. Safe to call on partial trees. */
export function disposeObject3D(root: T.Object3D): void {
  const seen = new Set<object>();
  root.traverse(object => {
    const geometry = (object as T.Mesh).geometry as T.BufferGeometry | undefined;
    if (geometry && !shared.has(geometry) && !seen.has(geometry)) { seen.add(geometry); geometry.dispose(); }
    for (const material of materialsOf(object)) {
      if (shared.has(material) || seen.has(material)) continue;
      seen.add(material);
      for (const texture of materialTextures(material)) {
        if (!shared.has(texture) && !seen.has(texture)) { seen.add(texture); texture.dispose(); }
      }
      material.dispose();
    }
    if (object instanceof T.InstancedMesh) object.dispose();
  });
  root.removeFromParent();
}

/** Wrap an object as a handle that frees itself once. */
export function handleFor<O extends T.Object3D>(object: O, extra?: () => void): ModelHandle<O> {
  let disposed = false;
  return {
    object,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      disposed = true;
      extra?.();
      disposeObject3D(object);
    },
  };
}

export interface LiveCounts { geometries: number; materials: number; textures: number }

/**
 * Counts geometries, materials and textures reachable from tracked objects and
 * listens for their 'dispose' events. Works in Node without WebGL, which is how
 * the unit tests prove factories free what they make.
 */
export class ResourceTracker {
  private live = { geometries: new Set<object>(), materials: new Set<object>(), textures: new Set<object>() };
  private watch(kind: keyof LiveCounts, resource: T.EventDispatcher<{ dispose: object }> & object) {
    if (shared.has(resource) || this.live[kind].has(resource)) return;
    this.live[kind].add(resource);
    const onDispose = () => { this.live[kind].delete(resource); resource.removeEventListener('dispose', onDispose); };
    resource.addEventListener('dispose', onDispose);
  }
  track(root: T.Object3D): this {
    root.traverse(object => {
      const geometry = (object as T.Mesh).geometry as T.BufferGeometry | undefined;
      if (geometry) this.watch('geometries', geometry);
      for (const material of materialsOf(object)) {
        this.watch('materials', material);
        for (const texture of materialTextures(material)) this.watch('textures', texture);
      }
    });
    return this;
  }
  counts(): LiveCounts {
    return { geometries: this.live.geometries.size, materials: this.live.materials.size, textures: this.live.textures.size };
  }
}
