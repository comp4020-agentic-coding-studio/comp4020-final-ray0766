import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import type { BlueprintModel, BlueprintModelOptions } from '../src/shared/blueprint-model3d.ts';
import { buildBlueprintModel } from '../src/shared/blueprint-model3d.ts';
import { PART_IDS } from '../src/shared/blueprint-parts.ts';
import type { PartId } from '../src/shared/blueprint-parts.ts';
import { groundCells } from '../src/shared/blueprint-model.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import {
  buildCameraBlueprintModel, cameraPartCategory, cameraPartSlots, CAMERA_PART_ATTRIBUTE,
} from '../src/client/camera-blueprint-model.ts';

const piece = (n: number, part: PartId, x = 2, z = 2, level = 0, rot: 0 | 1 | 2 | 3 = 0): PartPlacement => ({ n, part, x, z, level, rot });
const meshes = (root: T.Object3D) => {
  const result: T.Mesh<T.BufferGeometry, T.Material>[] = [];
  root.traverse(node => { if (node instanceof T.Mesh) result.push(node as T.Mesh<T.BufferGeometry, T.Material>); });
  return result;
};
function bytes(attribute: T.BufferAttribute) {
  return { type: attribute.array.constructor.name, count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
    sha256: createHash('sha256').update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)).digest('hex') };
}
function materialSnapshot(material: T.Material) {
  const json = material.toJSON();
  // Unique runtime UUIDs do not affect drawing. All art properties and the
  // actual source hooks are compared; the adapter may not lose cel/cover.
  delete (json as Partial<typeof json>).uuid;
  return { json, compile: material.onBeforeCompile.toString(), program: material.customProgramCacheKey(),
    beforeRender: material.onBeforeRender.toString() };
}
function meshSnapshot(mesh: T.Mesh<T.BufferGeometry, T.Material>) {
  // WebGLRenderer only reads geometry.groups for material arrays. Both factories
  // emit one material per mesh, so unused BoxGeometry face groups do not draw.
  // Keep the effective draw range and every submitted attribute/index exact.
  expect(Array.isArray(mesh.material)).toBe(false);
  return { attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
    .filter(([name]) => name !== CAMERA_PART_ATTRIBUTE).map(([name, value]) => [name, bytes(value as T.BufferAttribute)])),
    index: mesh.geometry.index ? bytes(mesh.geometry.index) : null, drawRange: mesh.geometry.drawRange,
    material: materialSnapshot(mesh.material), castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow,
    position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray() };
}
function socketSnapshot(root: T.Object3D) {
  return root.children.filter(child => !(child instanceof T.Mesh)).map(child => ({ name: child.name, userData: child.userData,
    position: child.position.toArray(), quaternion: child.quaternion.toArray(), scale: child.scale.toArray() }));
}
function equalDrawing(actual: BlueprintModel, ordinary: BlueprintModel) {
  expect(actual.triangles).toBe(ordinary.triangles);
  expect(actual.drawCalls).toBe(ordinary.drawCalls);
  expect(meshes(actual.object).map(meshSnapshot)).toEqual(meshes(ordinary.object).map(meshSnapshot));
  expect(actual.object.userData.emitters ?? []).toEqual(ordinary.object.userData.emitters ?? []);
  expect(socketSnapshot(actual.object)).toEqual(socketSnapshot(ordinary.object));
}
function checkPair(parts: readonly PartPlacement[], library: StyleLibrary, lod: 'low' | 'medium', options: BlueprintModelOptions = {}) {
  const original = JSON.stringify(parts), ordinary = buildBlueprintModel(parts, library, lod, options);
  const actual = buildCameraBlueprintModel(parts, library, lod, options);
  try { equalDrawing(actual, ordinary); expect(JSON.stringify(parts)).toBe(original); }
  finally { actual.dispose(); ordinary.dispose(); }
}
// The reference is the real host facade, whose registered catalogue includes
// both wide-door poses and the continuous two-cell stairs. No vendor-only
// replacement, bounding-box stand-in, or second copy of the building is used.
describe('public camera part provenance preserves ordinary blueprint drawing', () => {
  it.each(['low', 'medium'] as const)('matches every catalogue part at %s LOD, including host wide parts', lod => {
    const library = new StyleLibrary('medium', { look: 'village', scans: false });
    try {
      expect(PART_IDS).toContain('wall.door-wide');
      expect(PART_IDS).toContain('wall.door-wide.open');
      expect(PART_IDS).toContain('step.entry-wide');
      for (const [index, id] of PART_IDS.entries()) {
        checkPair([piece(index + 1, id, 2, 2, id.startsWith('roof.') ? 1 : 0, (index % 4) as 0 | 1 | 2 | 3)], library, lod,
          { pivot: { x: 2.5, z: 2.5 } });
      }
    } finally { library.dispose(); }
  });

  it.each(['low', 'medium'] as const)('keeps one foundation, cover, emitters and sockets for a mixed %s building', lod => {
    const library = new StyleLibrary('medium', { look: 'village', scans: false });
    const parts = [piece(41, 'wall.door-wide.open', 1, 3), piece(7, 'floor.deck', 1, 3), piece(12, 'floor.deck', 2, 3),
      piece(9, 'floor.deck', 1, 2), piece(13, 'floor.deck', 2, 2), piece(63, 'step.entry-wide', 1, 4),
      piece(28, 'wall.window', 1, 2, 0, 2), piece(25, 'wall.solid', 2, 2, 0, 2),
      piece(52, 'roof.deck', 1, 3, 1), piece(53, 'roof.deck', 2, 3, 1), piece(54, 'roof.deck', 1, 2, 1), piece(55, 'roof.deck', 2, 2, 1),
      piece(68, 'structure.beam', 1, 2, 1), piece(70, 'light.wall', 2, 2, 0, 2), piece(72, 'furniture.bench', 1, 2)];
    const options = { foundationDepth: .37, pivot: { x: 2.5, z: 2.5 }, sockets: true };
    const bare = buildCameraBlueprintModel(parts, library, lod, { pivot: options.pivot });
    const founded = buildCameraBlueprintModel(parts, library, lod, options);
    const ordinary = buildBlueprintModel(parts, library, lod, options);
    try {
      equalDrawing(founded, ordinary);
      expect(founded.triangles - bare.triangles).toBe(groundCells(parts).length * 12);
      expect(socketSnapshot(founded.object)).toHaveLength(parts.length);
      expect(founded.object.userData.emitters.length).toBeGreaterThan(0);
      expect(meshes(founded.object).some(mesh => Array.from((mesh.geometry.getAttribute('cover') as T.BufferAttribute).array).includes(1))).toBe(true);
      const noSockets = buildCameraBlueprintModel({ parts }, library, lod, { ...options, sockets: false });
      try { expect(socketSnapshot(noSockets.object)).toEqual([]); expect(meshes(noSockets.object).map(meshSnapshot)).toEqual(meshes(founded.object).map(meshSnapshot)); }
      finally { noSockets.dispose(); }
      for (const mesh of meshes(founded.object)) {
        const attribute = mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE) as T.BufferAttribute;
        expect(attribute.array).toBeInstanceOf(Uint16Array);
        expect(attribute.count).toBe(mesh.geometry.getAttribute('position').count);
        for (let i = 0; i < attribute.count; i += 3) {
          expect(attribute.getX(i)).toBe(attribute.getX(i + 1)); expect(attribute.getX(i)).toBe(attribute.getX(i + 2));
        }
      }
      expect(meshes(founded.object).length).toBe(founded.drawCalls);
    } finally { bare.dispose(); founded.dispose(); ordinary.dispose(); library.dispose(); }
  });

  it('uses stable n-order slots while every door, ground floor, stair and prop stays zero', () => {
    const walls = new Set<PartId>(['wall.solid', 'wall.window', 'wall.louvre', 'wall.corrugated']);
    const roofs = new Set<PartId>(['roof.slope', 'roof.slope.hip', 'roof.slope.valley', 'roof.verge.left', 'roof.verge.right', 'roof.parapet']);
    const decks = new Set<PartId>(['floor.deck', 'floor.grate', 'roof.deck']);
    for (const level of [0, 1]) for (const id of PART_IDS) {
      const expected = walls.has(id) ? 'wall' : roofs.has(id) ? 'roof' : decks.has(id) && level > 0 ? 'deck' : id === 'structure.beam' ? 'beam' : 'protected';
      expect(cameraPartCategory(piece(1, id, 2, 2, level))).toBe(expected);
    }
    const parts = [piece(90, 'wall.window'), piece(4, 'step.entry-wide'), piece(36, 'roof.deck', 2, 2, 1), piece(1, 'wall.door-wide.open'), piece(18, 'floor.deck')];
    const expected = new Map([[1, 0], [4, 0], [18, 0], [36, 4], [90, 5]]);
    expect(cameraPartSlots(parts)).toEqual(expected); expect(cameraPartSlots([...parts].reverse())).toEqual(expected);
    expect(() => cameraPartSlots([...parts, { ...parts[0] }])).toThrow();
  });

  it.each(['low', 'medium'] as const)('marks exact whole parts and keeps all foundation vertices protected at %s', lod => {
    const library = new StyleLibrary('medium', { look: 'village', scans: false });
    const parts = [piece(20, 'wall.solid'), piece(3, 'floor.deck'), piece(71, 'wall.door-wide.open', 1, 3), piece(45, 'roof.deck', 2, 2, 1)];
    const options = { pivot: { x: 2.5, z: 2.5 } }, slots = cameraPartSlots(parts);
    const model = buildCameraBlueprintModel(parts, library, lod, options);
    const counts = new Map<number, number>();
    try {
      for (const mesh of meshes(model.object)) for (const slot of (mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE) as T.BufferAttribute).array) counts.set(slot, (counts.get(slot) ?? 0) + 1);
      const expected = new Map<number, number>();
      for (const part of parts) {
        const ordinary = buildBlueprintModel([part], library, lod, options);
        try { const slot = slots.get(part.n)!; expected.set(slot, (expected.get(slot) ?? 0) + ordinary.triangles * 3); }
        finally { ordinary.dispose(); }
      }
      expect(counts).toEqual(expected);
      const founded = buildCameraBlueprintModel(parts, library, lod, { ...options, foundationDepth: .4 });
      try {
        const next = new Map<number, number>();
        for (const mesh of meshes(founded.object)) for (const slot of (mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE) as T.BufferAttribute).array) next.set(slot, (next.get(slot) ?? 0) + 1);
        expect(next.get(0)! - counts.get(0)!).toBe(groundCells(parts).length * 36);
        for (const [slot, count] of counts) if (slot !== 0) expect(next.get(slot)).toBe(count);
      } finally { founded.dispose(); }
      const disposeEvents = meshes(model.object).map(mesh => { const count = vi.fn(); mesh.geometry.addEventListener('dispose', count); return count; });
      model.dispose(); model.dispose();
      expect(model.disposed).toBe(true); for (const count of disposeEvents) expect(count).toHaveBeenCalledTimes(1);
    } finally { model.dispose(); library.dispose(); }
  });
});


describe('private saved models keep complete-blueprint identities without drawing the bound door', () => {
  it.each([
    ['low', 'wall.door.open'], ['medium', 'wall.door.open'],
    ['low', 'wall.door-wide.open'], ['medium', 'wall.door-wide.open'],
  ] as const)('preserves ordinary visible geometry for %s / %s', (lod, doorId) => {
    const library = new StyleLibrary('medium', { look: 'village', scans: false });
    // Deliberately non-n-ordered input, with the separately drawn door before
    // later wall/roof ordinal identities. It must not shift those slots down.
    const parts = [piece(90, 'roof.deck', 2, 2, 1), piece(2, doorId, 1, 3), piece(17, 'wall.window', 1, 2, 0, 2),
      piece(1, 'floor.deck', 1, 2), piece(3, 'floor.deck', 1, 3), piece(4, 'floor.deck', 2, 3), piece(8, 'light.wall', 1, 2, 0, 2)];
    const visible = parts.filter(part => part.n !== 2), before = JSON.stringify(parts);
    const options = { foundationDepth: .32, pivot: { x: 2, z: 2.5 }, sockets: true };
    const ordinary = buildBlueprintModel(visible, library, lod, options);
    const actual = buildCameraBlueprintModel(visible, library, lod, { ...options, identityParts: parts });
    try {
      equalDrawing(actual, ordinary);
      const actualSlots = new Set(meshes(actual.object).flatMap(mesh => Array.from(mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).array)));
      expect(actualSlots).toEqual(new Set([0, 6, 7]));
      expect(socketSnapshot(actual.object).some(socket => socket.name === 'part:2')).toBe(false);
      expect(JSON.stringify(parts)).toBe(before);
    } finally { actual.dispose(); ordinary.dispose(); library.dispose(); }
  });
  it('rejects missing or changed identity before constructing a differently tagged saved part', () => {
    const library = new StyleLibrary('medium', { look: 'village', scans: false }), part = piece(20, 'wall.solid');
    try {
      for (const identities of [[], [{ ...part, rot: 1 as const }], [{ ...part, x: 1 }], [{ ...part, part: 'wall.window' as const }]]) {
        expect(() => buildCameraBlueprintModel([part], library, 'medium', { identityParts: identities })).toThrow('identity');
      }
    } finally { library.dispose(); }
  });
});
