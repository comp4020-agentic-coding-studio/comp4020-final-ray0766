import * as T from 'three';
import { disposeObject3D } from '../core/dispose.ts';
import type { ModelHandle } from '../core/dispose.ts';
import { PartBuilder } from '../style/geometry.ts';
import type { LodTier } from '../style/lod.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { groundCells, partTransform, pivotOf } from './model.ts';
import type { PartPlacement } from './model.ts';
import { PARTS } from './parts/catalogue.ts';
import { libraryMaterials, makeKit, SLAB } from './parts/kit.ts';

// The placed form of a blueprint: every part emitted into one PartBuilder, so
// the whole building merges into one mesh per kit material (≤ 14 draw calls,
// ≤ 10 at low LOD). Local origin at the pivot (centre of the occupied cells,
// y = 0 on the level-0 slab), +Z is the front.
//
// Each part also leaves an empty Object3D "socket" named part:<n> at its local
// transform. Sockets carry no geometry; they let tests and tools read where
// every part ended up after the model is anchored on a planet.

export interface BlueprintModelOptions {
  /** Ground fit's foundation depth; when given, a concrete plinth fills the gap under the level-0 cells. */
  foundationDepth?: number;
  /** Add part sockets (default true). */
  sockets?: boolean;
  /** Local origin in grid metres; defaults to the blueprint's pivot. The workshop uses the grid centre. */
  pivot?: { x: number; z: number };
}

export interface BlueprintModel extends ModelHandle<T.Group> {
  triangles: number;
  drawCalls: number;
  /** Milliseconds spent generating and merging geometry. */
  buildMs: number;
}

/** How far the plinth reaches below the deepest foundation gap, so it never shows a seam at the ground. */
export const PLINTH_EMBED = 0.3;

export function buildBlueprintModel(parts: readonly PartPlacement[] | { parts: readonly PartPlacement[] }, lib: StyleLibrary, lod: LodTier = lib.lod, options: BlueprintModelOptions = {}): BlueprintModel {
  const list = 'parts' in parts ? parts.parts : parts;
  const begin = performance.now();
  const b = new PartBuilder(lod);
  const source = libraryMaterials(lib);
  const kit = makeKit(b, source);
  const pivot = options.pivot ?? pivotOf(list);
  const ordered = [...list].sort((a, c) => a.n - c.n);
  for (const p of ordered) {
    const t = partTransform(p, pivot);
    b.within({ position: t.position, rotation: [0, t.yaw, 0] }, () => PARTS[p.part].emit(kit));
  }
  if (options.foundationDepth !== undefined) {
    const depth = Math.max(0, options.foundationDepth) + PLINTH_EMBED;
    for (const [x, z] of groundCells(list)) {
      b.box(kit.m('concrete'), [1.0, depth, 1.0], { position: [x + 0.5 - pivot.x, -SLAB - depth / 2, z + 0.5 - pivot.z] }, 0);
    }
  }
  const built = b.build('blueprint');
  const group = built.group;
  if (options.sockets !== false) {
    for (const p of ordered) {
      const t = partTransform(p, pivot);
      const socket = new T.Object3D();
      socket.name = `part:${p.n}`;
      socket.userData = { n: p.n, part: p.part };
      socket.position.set(...t.position);
      socket.rotation.y = t.yaw;
      group.add(socket);
    }
  }
  const owned = source.owned();
  let disposed = false;
  return {
    object: group,
    triangles: built.triangles,
    drawCalls: built.drawCalls,
    buildMs: performance.now() - begin,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      disposed = true;
      // The lamp may have been swapped off its mesh (ghost previews), so free owned materials explicitly.
      const attached = new Set<T.Material>();
      group.traverse(o => { const m = (o as T.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => attached.add(x)); });
      disposeObject3D(group);
      for (const m of owned) if (!attached.has(m)) m.dispose();
    },
  };
}
