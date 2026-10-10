import { afterEach, expect, it } from 'vitest';
import { Box3, Mesh } from 'three';
import type { PartPlacement, Rot } from '../src/assets/claude-geometry/blueprint/model.ts';
import { rotDir } from '../src/assets/claude-geometry/blueprint/model.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { libraryMaterials, STOREY, WALL_H, WALL_T } from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import { KOSHI, TOP_BAND } from '../src/assets/claude-geometry/blueprint/parts/village/walls.ts';
import { buildStructureFinish, planStructureFinish, STRUCTURE_FINISH_MAX_PROJECTION } from '../src/client/structure-finish.ts';
import { homeVariant } from '../src/shared/home-layout.ts';

const resources: { dispose(): void }[] = [];
const library = () => { const lib = new StyleLibrary('medium', { look: 'village' }); resources.push(lib); return lib; };
const floor = (n: number, x: number, z: number, level = 0): PartPlacement => ({ n, part: 'floor.deck', x, z, level, rot: 0 });
const wall = (n: number, x: number, z: number, rot: Rot = 0, level = 0): PartPlacement => ({ n, part: 'wall.solid', x, z, level, rot });
const joints = (parts: readonly PartPlacement[]) => planStructureFinish(parts).filter(s => s.kind === 'existing-wall-joint');
afterEach(() => { for (const resource of resources.splice(0).reverse()) resource.dispose(); });

it('finishes a joined floor as four continuous outside runs, never a grid of inner seams', () => {
  const parts = [floor(1, 1, 1), floor(2, 2, 1)];
  const strips = planStructureFinish(parts);
  expect(strips).toHaveLength(4);
  expect(strips.filter(s => s.axis === 'x').every(s => s.from === -1 && s.to === 1)).toBe(true);
  expect(strips.filter(s => s.axis === 'z').map(s => s.line).sort()).toEqual([-1.005, 1.005]);
  expect(strips.every(s => s.kind === 'slab-edge' && s.y < 0)).toBe(true);
});

it('leaves an enclosed missing floor cell and its opening boundary untouched', () => {
  const parts: PartPlacement[] = [];
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) if (x !== 1 || z !== 1) parts.push(floor(parts.length + 1, x, z));
  const strips = planStructureFinish(parts);
  expect(strips).toHaveLength(4);
  expect(strips.every(s => Math.abs(s.line) > 1.5 && s.to - s.from === 3)).toBe(true);
});

it.each([0, 1, 2, 3] as Rot[])('preserves door, step and ramp approach edges at quarter turn %i', rot => {
  const [dx, dz] = rotDir(rot), deck = floor(1, 2, 2);
  const scenarios: PartPlacement[][] = [
    [{ n: 2, part: 'wall.door.open', x: 2, z: 2, level: 0, rot }],
    [{ n: 2, part: 'wall.door', x: 2, z: 2, level: 0, rot }],
    [{ n: 2, part: 'step.entry', x: 2 + dx, z: 2 + dz, level: 0, rot }],
    [{ n: 2, part: 'ramp.entry', x: 2 + dx, z: 2 + dz, level: 0, rot }],
  ];
  for (const opening of scenarios) {
    // Fixed pivot makes the expected doorway side independent of footprint growth.
    const strips = planStructureFinish([deck, ...opening], { x: 2.5, z: 2.5 });
    expect(strips).toHaveLength(3);
    expect(strips.some(s => s.axis === (dz ? 'x' : 'z') && Math.abs(s.line - (dz || dx) * .505) < 1e-8)).toBe(false);
  }
});

it('leaves the upper stair landing edge clear as well as the lower entrance', () => {
  const parts: PartPlacement[] = [floor(1, 2, 0, 1), floor(2, 2, 3),
    { n: 3, part: 'stair.straight', x: 2, z: 2, level: 0, rot: 0 }];
  const strips = planStructureFinish(parts, { x: 2.5, z: 2.5 });
  expect(strips.filter(s => s.y > 0)).toHaveLength(3);
  expect(strips.some(s => s.y > 0 && s.axis === 'x' && Math.abs(s.line + 1.495) < 1e-8)).toBe(false);
  expect(strips.filter(s => s.y < 0)).toHaveLength(3);
  expect(strips.some(s => s.y < 0 && s.axis === 'x' && Math.abs(s.line - .495) < 1e-8)).toBe(false);
});

it('does not duplicate an authored kerb or trim, and treats adjacent paving as a joined surface', () => {
  const parts: PartPlacement[] = [floor(1, 1, 1), { n: 2, part: 'street.paving', x: 2, z: 1, level: 0, rot: 0 },
    { n: 3, part: 'street.kerb', x: 1, z: 1, level: 0, rot: 0 }];
  expect(planStructureFinish(parts)).toHaveLength(2);
});

it('adds one continuous facing only on an existing straight eave and skips roof corner profiles', () => {
  const parts: PartPlacement[] = [0, 1, 2].map(x => ({ n: x + 1, part: 'roof.slope', x, z: 1, level: 1, rot: 0 }));
  const strips = planStructureFinish(parts);
  expect(strips).toHaveLength(1);
  expect(strips[0]).toMatchObject({ kind: 'existing-eave', axis: 'x', from: -1.5, to: 1.5, line: .607, material: 'post' });
  expect(strips[0].y).toBeLessThan(STOREY);
  const corner: PartPlacement = { n: 4, part: 'roof.slope.hip', x: 1, z: 1, level: 1, rot: 0 };
  expect(planStructureFinish([parts[0], corner])).toEqual([]);
  expect(planStructureFinish([{ ...corner, part: 'roof.slope.valley' }])).toEqual([]);
  expect(planStructureFinish([parts[0], { ...parts[0], n: 5, part: 'roof.verge.left' }])).toEqual([]);
});

it.each([0, 1, 2, 3] as Rot[])('covers only the existing exterior solid-wall post seam at quarter turn %i', rot => {
  const [dx, dz] = rotDir(rot), level = 1;
  const parts = [floor(1, 2, 2, level), floor(2, 2 + dz, 2 - dx, level),
    wall(3, 2, 2, rot, level), wall(4, 2 + dz, 2 - dx, rot, level)];
  const caps = joints(parts);
  expect(caps).toHaveLength(1);
  expect(caps[0].to - caps[0].from).toBeCloseTo(.04);
  const lib = library(), finish = buildStructureFinish(parts, lib); resources.push(finish);
  const material = libraryMaterials(lib).get('post');
  const capMesh = finish.object.children.find(child => (child as Mesh).material === material)!;
  const bounds = new Box3().setFromObject(capMesh);
  expect(bounds.min.y).toBeCloseTo(level * STOREY + KOSHI);
  expect(bounds.max.y).toBeCloseTo(level * STOREY + WALL_H - TOP_BAND);
  const coordinate = dz ? 'z' : 'x', normal = dz || dx;
  const outerFace = Math.max(normal * bounds.min[coordinate], normal * bounds.max[coordinate]);
  // The supporting floor edge is at half a metre on the normal axis.
  const existingPostFace = .5 + WALL_T / 2 + .015;
  expect(outerFace - existingPostFace).toBeCloseTo(.014);
  expect(outerFace - existingPostFace).toBeLessThan(STRUCTURE_FINISH_MAX_PROJECTION);
  expect(finish.drawCalls).toBe(2);
  const geometry = (capMesh as Mesh).geometry;
  expect((geometry.index?.count ?? geometry.getAttribute('position').count) / 3).toBe(12);
});

it('never dresses opening profiles, isolated wall ends, inward walls or courtyard voids', () => {
  const parts = [floor(1, 1, 1), floor(2, 2, 1), wall(3, 1, 1), wall(4, 2, 1)];
  for (const part of ['wall.door', 'wall.door.open', 'wall.window', 'wall.louvre', 'wall.corrugated'] as const) {
    expect(joints([...parts.slice(0, 3), { ...parts[3], part }])).toEqual([]);
  }
  expect(joints(parts.slice(0, 3))).toEqual([]);
  expect(joints([...parts, floor(5, 1, 2), floor(6, 2, 2)])).toEqual([]);
  const courtyard: PartPlacement[] = [];
  for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) if (z !== 1 || x === 0 || x === 3) courtyard.push(floor(courtyard.length + 1, x, z));
  courtyard.push(wall(20, 1, 0), wall(21, 2, 0));
  expect(joints(courtyard)).toEqual([]);
});

it('leaves corners, explicit posts and trim, entrances, stairs and opposite-facing joins alone', () => {
  const parts = [floor(1, 1, 1), floor(2, 2, 1), wall(3, 1, 1), wall(4, 2, 1)];
  const blockers: PartPlacement[] = [
    wall(5, 1, 1, 1),
    { n: 5, part: 'structure.column', x: 1, z: 1, level: 0, rot: 0 },
    { n: 5, part: 'structure.beam', x: 1, z: 1, level: 0, rot: 1 },
    { n: 5, part: 'street.kerb.corner', x: 1, z: 1, level: 0, rot: 0 },
    { n: 5, part: 'step.entry', x: 2, z: 2, level: 0, rot: 0 },
    { n: 5, part: 'stair.straight', x: 2, z: 2, level: 0, rot: 0 },
  ];
  for (const blocker of blockers) expect(joints([...parts, blocker])).toEqual([]);
  expect(joints([...parts.slice(0, 3), wall(4, 2, 2, 2), floor(5, 2, 2)])).toEqual([]);
});

it('bounds a full straight facade to one 12-triangle cover per join and keeps the two-material budget', () => {
  const parts = Array.from({ length: 5 }, (_, x) => [floor(x * 2 + 1, x, 1), wall(x * 2 + 2, x, 1)]).flat();
  const lib = library(), finish = buildStructureFinish(parts, lib); resources.push(finish);
  expect(joints(parts)).toHaveLength(4);
  expect(finish.drawCalls).toBe(2);
  // Three continuous slab runs plus four existing-post covers, each a box.
  expect(finish.triangles).toBe((3 + 4) * 12);
  expect(finish.segments).toEqual(planStructureFinish([...parts].reverse()));
});

it('bounds added reach to two centimetres below the existing walking surface and reuses palette ownership', () => {
  const lib = library(), source = libraryMaterials(lib), material = source.get('concrete');
  const finish = buildStructureFinish([floor(1, 0, 0)], lib); resources.push(finish);
  const bounds = new Box3().setFromObject(finish.object);
  expect(bounds.max.y).toBeLessThan(0); expect(bounds.min.y).toBeGreaterThan(-.16);
  expect(Math.max(bounds.max.x, bounds.max.z, -bounds.min.x, -bounds.min.z) - .5).toBeLessThanOrEqual(STRUCTURE_FINISH_MAX_PROJECTION);
  expect(finish.drawCalls).toBe(1); expect(finish.triangles).toBe(48);
  const mesh = finish.object.children[0] as Mesh;
  expect(mesh.material).toBe(material); expect(mesh.castShadow).toBe(false);
  let geometryDisposals = 0, materialDisposals = 0;
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  finish.dispose(); finish.dispose();
  expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(0); expect(finish.disposed).toBe(true);
});

it('is deterministic under part order and does not mutate the structural document', () => {
  const parts = homeVariant('terrace').parts, before = JSON.stringify(parts);
  parts.forEach(Object.freeze); Object.freeze(parts);
  const lib = library(), first = buildStructureFinish(parts, lib), reordered = buildStructureFinish([...parts].reverse(), lib);
  resources.push(first, reordered);
  expect(first.seed).toBe(reordered.seed); expect(first.segments).toEqual(reordered.segments);
  expect(first.drawCalls).toBeLessThanOrEqual(2);
  expect(first.object.userData).toMatchObject({ decorative: true, collision: false, support: false, finishVersion: 3 });
  expect(JSON.stringify(parts)).toBe(before);
  const attributes = (handle: typeof first) => handle.object.children.map(child => Array.from((child as Mesh).geometry.getAttribute('position').array));
  expect(attributes(first)).toEqual(attributes(reordered));
});

it('adds nothing for an empty document or a non-village geometry profile', () => {
  const lib = new StyleLibrary('medium'); resources.push(lib);
  const finish = buildStructureFinish([floor(1, 0, 0)], lib); resources.push(finish);
  expect(planStructureFinish([])).toEqual([]); expect(finish.drawCalls).toBe(0); expect(finish.object.children).toEqual([]);
});
