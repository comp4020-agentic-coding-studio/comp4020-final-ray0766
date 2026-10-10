import * as T from 'three';
import { handleFor, isShared, markShared } from '../core/dispose.ts';
import type { ModelHandle } from '../core/dispose.ts';
import { PROP_KINDS, PROP_RADIUS } from '../core/world.ts';
import type { PropKind } from '../core/world.ts';
import { PartBuilder } from '../style/geometry.ts';
import type { BuiltPart } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { buildBench } from './bench.ts';
import { buildDeckPad } from './deck-pad.ts';
import { buildHabitat } from './habitat.ts';
import { buildPlanter } from './planter.ts';
import { buildConifer } from './conifer.ts';
import { buildWorkLight } from './work-light.ts';
import { libraryPropMaterials, VILLAGE_PROP_BUILDERS, VILLAGE_PROP_NAMES } from './village.ts';
import type { Look } from '../style/look.ts';

// Industrial versions of the main project's six catalogue kinds (a76575a
// src/shared/planets.ts CATALOGUE). The kind keys stay the same so placed
// objects, events and the main project's tables need no translation; only
// the art changes. Every model is kit-built with PartBuilder: local origin on
// the ground at the footprint centre, +Y up, +Z front, metre UVs, one mesh per
// material.

export interface PropInfo {
  kind: PropKind;
  /** What the model is in this style. */
  name: string;
  /** Short label for lists and buttons. */
  short: string;
  /** Placement footprint radius, unchanged from the main project. */
  radius: number;
  /** Furthest horizontal reach of the model from its origin (overhangs such as branches may pass the footprint). */
  reach: number;
  /** Approximate height in metres, for camera framing. */
  height: number;
}

export const PROP_INFO: Record<PropKind, PropInfo> = {
  cottage: { kind: 'cottage', name: 'Habitat module', short: 'Habitat', radius: PROP_RADIUS.cottage, reach: 1.05, height: 2.8 },
  tree: { kind: 'tree', name: 'Hardy conifer', short: 'Conifer', radius: PROP_RADIUS.tree, reach: 0.5, height: 2.45 },
  path: { kind: 'path', name: 'Deck stepping pad', short: 'Deck pad', radius: PROP_RADIUS.path, reach: 0.44, height: 0.1 },
  flowers: { kind: 'flowers', name: 'Planter box', short: 'Planter', radius: PROP_RADIUS.flowers, reach: 0.3, height: 0.7 },
  bench: { kind: 'bench', name: 'Steel bench', short: 'Bench', radius: PROP_RADIUS.bench, reach: 0.66, height: 0.9 },
  lamp: { kind: 'lamp', name: 'Sodium work light', short: 'Work light', radius: PROP_RADIUS.lamp, reach: 0.37, height: 2.2 },
};

/** Kinds too small to be worth a shadow draw below high LOD (village look). */
const SHADOWLESS_SMALL: ReadonlySet<PropKind> = new Set(['flowers', 'path']);

/** Short names of the village look's props, for buttons and lists. */
export const VILLAGE_PROP_SHORT: Record<PropKind, string> = {
  cottage: 'Cottage', tree: 'Tree', path: 'Stepping stones', flowers: 'Flower pot', bench: 'Bench', lamp: 'Lantern',
};

/** A kind's catalogue entry as a look shows it: the village look names its own models; sizes are the same. */
export function propInfo(kind: PropKind, look: Look = 'industrial'): PropInfo {
  return look === 'village' ? { ...PROP_INFO[kind], name: VILLAGE_PROP_NAMES[kind], short: VILLAGE_PROP_SHORT[kind] } : PROP_INFO[kind];
}

const BUILDERS: Record<PropKind, (lib: StyleLibrary, b: PartBuilder) => void> = {
  cottage: buildHabitat,
  tree: buildConifer,
  path: buildDeckPad,
  flowers: buildPlanter,
  bench: buildBench,
  lamp: buildWorkLight,
};

/** Build one prop with fresh, owned geometry (and owned glow materials), in the library's look. */
export function buildProp(kind: PropKind, lib: StyleLibrary): BuiltPart {
  const b = new PartBuilder(lib.lod);
  if (lib.look === 'village') VILLAGE_PROP_BUILDERS[kind](libraryPropMaterials(lib), b);
  else BUILDERS[kind](lib, b);
  const part = b.build(`prop.${kind}`);
  // Village look, medium and low: the smallest kinds cast no shadow. A pot's or a stepping
  // stone's shadow is a few pixels on a phone, and every caster is drawn again in the shadow map.
  if (lib.look === 'village' && lib.lod !== 'high' && SHADOWLESS_SMALL.has(kind)) part.group.traverse(o => { o.castShadow = false; });
  // Village look: a lantern's glass is the light, so it casts no shadow (it would also shade its own lamp).
  if (lib.look === 'village') part.group.traverse(o => { const m = (o as T.Mesh).material as T.Material | undefined; if (m && isOwnedGlow(m)) o.castShadow = false; });
  part.group.userData.propKind = kind;
  return part;
}

/** A standalone prop whose handle frees its own geometry and glow materials. */
export function createProp(kind: PropKind, lib: StyleLibrary): ModelHandle<T.Group> {
  return handleFor(buildProp(kind, lib).group);
}

/** Glow materials are the only materials a freshly built prop owns; everything else comes from the library. */
const isOwnedGlow = (m: T.Material): m is T.MeshStandardMaterial =>
  m instanceof T.MeshStandardMaterial && !isShared(m) && m.emissive.getHex() !== 0;

/**
 * Builds each kind once and hands out copies that share its geometry, so a
 * planet with 64 objects (or a history scrub that rebuilds them) costs one
 * geometry per kind. Copies own only their glow materials, which they free on
 * dispose; the kit frees the shared geometry in its own dispose().
 */
export class PropKit {
  readonly lib: StyleLibrary;
  private templates = new Map<PropKind, BuiltPart>();
  private owned: { dispose(): void }[] = [];
  private glows = new Set<T.Material>();
  private live = 0;
  private disposed = false;
  /** Milliseconds spent building each template, for the performance notes. */
  readonly buildMs = new Map<PropKind, number>();

  constructor(lib: StyleLibrary) { this.lib = lib; }

  template(kind: PropKind): BuiltPart {
    if (this.disposed) throw new Error('PropKit has been disposed.');
    let t = this.templates.get(kind);
    if (!t) {
      const start = performance.now();
      t = buildProp(kind, this.lib);
      this.buildMs.set(kind, performance.now() - start);
      t.group.traverse(o => {
        const mesh = o as T.Mesh;
        if (!mesh.isMesh) return;
        markShared(mesh.geometry); this.owned.push(mesh.geometry);
        const m = mesh.material as T.Material;
        if (isOwnedGlow(m)) { markShared(m); this.owned.push(m); this.glows.add(m); }
      });
      this.templates.set(kind, t);
    }
    return t;
  }

  create(kind: PropKind): ModelHandle<T.Group> {
    const t = this.template(kind);
    const copy = t.group.clone(true);
    copy.userData = { propKind: kind };
    copy.traverse(o => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as T.MeshStandardMaterial;
      // A per-model glow, so a lamp can dim or pulse without touching the others.
      if (this.glows.has(m)) mesh.material = this.lib.createGlow(`#${m.emissive.getHexString()}`, m.emissiveIntensity);
    });
    this.live++;
    const handle = handleFor(copy, () => { this.live--; });
    return handle;
  }

  /** templateMeshes: geometries the kit owns (one per material per built kind); live: copies not yet disposed. */
  stats() {
    const triangles: Partial<Record<PropKind, number>> = {};
    let templateMeshes = 0;
    for (const [k, t] of this.templates) { triangles[k] = t.triangles; templateMeshes += t.group.children.length; }
    return { templates: this.templates.size, templateMeshes, live: this.live, triangles };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const r of this.owned) r.dispose();
    this.owned = [];
    this.glows.clear();
    this.templates.clear();
  }
}

export { PROP_KINDS };
export type { PropKind };
