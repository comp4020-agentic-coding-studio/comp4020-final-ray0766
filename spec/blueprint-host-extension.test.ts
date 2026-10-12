import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BlueprintEditor } from '../src/client/blueprint-editor.ts';
import { BlueprintEditor as VendorEditor } from '../src/assets/claude-geometry/blueprint/editor.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import * as oldCodec from '../src/assets/claude-geometry/blueprint/codec.ts';
import { blueprintHash, decodeBlueprint, encodeBlueprint, hashInput } from '../src/shared/blueprint-codec.ts';
import { blueprintTriangles, footprintCells, groundCells, Layout, layoutErrors, partTransform, pivotOf, placementProblem, rotDir, slotsOf, supportIssues } from '../src/shared/blueprint-model.ts';
import type { Blueprint, PartPlacement, Rot } from '../src/shared/blueprint-model.ts';
import { HOST_PART_IDS, LEGACY_PART_IDS, PART_IDS, PART_INFO, PARTS, partCost, partLabel } from '../src/shared/blueprint-parts.ts';
import { VILLAGE_KIT_IDS } from '../src/shared/village-kit/parts.ts';
import { WIDE_DOOR_IDS } from '../src/shared/wide-door.ts';
import { wideDoorClearanceIssues } from '../src/shared/blueprint-wide-door-clearance.ts';
import { buildBlueprintModel } from '../src/shared/blueprint-model3d.ts';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';

const piece = (n: number, part: PartPlacement['part'], x = 2, z = 2, rot: Rot = 0, level = 0): PartPlacement => ({ n, part, x, z, rot, level });
function base(rot: Rot = 0): PartPlacement[] {
  const [dx, dz] = rotDir(rot + 1);
  return [piece(1, 'floor.deck'), piece(2, 'floor.deck', 2 + dx, 2 + dz), piece(3, 'wall.door-wide.open', 2, 2, rot)];
}
const blueprint = (parts = base()): Blueprint => ({ id: industrialCabin().id, name: 'Two-cell door test', parts, groups: [{ name: 'Entrance', members: [1, 2, 3] }] });
const roundtrip = (parts: PartPlacement[]) => decodeBlueprint(encodeBlueprint({ ...blueprint(parts), groups: [] }));

describe('formal host catalogue and legacy contract', () => {
  it('pins the source command API and strict legacy codec; never changes vendor bytes', () => {
    for (const [file, digest] of [['editor.ts', '9f84b0d3f72662e30dec6b47d51cdb6acfbc11a40a7e0a10bbdf89129fb63c90'], ['codec.ts', 'ddf2d5c619e9e0f173d301e36b97dd4bb45625023f6f4617cbc1fca90ea1114c']])
      expect(createHash('sha256').update(readFileSync(new URL('../src/assets/claude-geometry/blueprint/' + file, import.meta.url))).digest('hex')).toBe(digest);
  });
  it('appends three wide IDs, then the seventeen R12 village kit IDs, with names, geometry costs and bounds', () => {
    expect(LEGACY_PART_IDS).toHaveLength(45); expect(PART_IDS).toHaveLength(65);
    expect(PART_IDS.slice(0, 45)).toEqual(LEGACY_PART_IDS); expect(new Set(PART_IDS).size).toBe(65);
    expect(HOST_PART_IDS.slice(0, 3)).toEqual(['wall.door-wide', 'wall.door-wide.open', 'step.entry-wide']);
    expect(PART_IDS.slice(45)).toEqual(HOST_PART_IDS); expect(HOST_PART_IDS.slice(3)).toEqual([...VILLAGE_KIT_IDS]);
    for (const id of VILLAGE_KIT_IDS) {
      expect(PART_INFO[id].zh.name.length, id).toBeGreaterThan(0);
      expect(partCost(id, 'high').triangles, id).toBeGreaterThan(0);
      expect(PART_INFO[id].envelope?.village, id).toBeDefined();
    }
    for (const id of WIDE_DOOR_IDS) {
      expect(PARTS[id].mount).toBe('edge'); expect(partLabel(id, 'village')).toMatch(/wide double door/i);
      expect(PART_INFO[id].zh.name).toContain('宽门');
      expect(PART_INFO[id].envelope?.village?.max).toEqual([1.5, 2.04, .07]);
      expect(PART_INFO[id].envelope?.village?.min[0]).toBe(-.5);
      expect(PART_INFO[id].envelope?.village?.min[2]).toBeCloseTo(-.698, 3);
      expect(partCost(id, 'high').triangles).toBeGreaterThan(0);
    }
    expect(PARTS['step.entry-wide']).toMatchObject({ mount: 'cell', role: 'entry', cells: 1 });
    expect(PART_INFO['step.entry-wide'].zh.name).toBe('双格入口台阶');
    expect(partCost('step.entry-wide', 'high').triangles).toBeGreaterThan(0);
  });
  it('keeps old JSON, hash input and hashes byte-equivalent', async () => {
    const old = industrialCabin();
    expect(encodeBlueprint(old)).toBe(oldCodec.encodeBlueprint(old));
    expect(hashInput(old.parts)).toEqual(oldCodec.hashInput(old.parts));
    expect(await blueprintHash(old)).toBe(await oldCodec.blueprintHash(old));
    expect(decodeBlueprint(encodeBlueprint(old))).toEqual(oldCodec.decodeBlueprint(oldCodec.encodeBlueprint(old)));
  });
  it('uses the original editor implementation for old-only command sequences', () => {
    const source = new VendorEditor(), host = new BlueprintEditor(), old = industrialCabin();
    source.load(old); host.load(old); source.select(1); host.select(1);
    expect(host.remove()).toEqual(source.remove()); expect(host.undo()).toEqual(source.undo());
    expect(host.toBlueprint()).toEqual(source.toBlueprint()); expect(host.redo()).toEqual(source.redo());
    expect(host.toBlueprint()).toEqual(source.toBlueprint());
  });
});

describe.each([0, 1, 2, 3] as const)('continuous two-cell entry at quarter turn %i', rot => {
  const step = () => { const [dx, dz] = rotDir(rot); return piece(4, 'step.entry-wide', 2 + dx, 2 + dz, rot); };
  it('supports both lanes behind the step, owns both cells, and adds no stair foundation plinth', () => {
    const parts = [...base(rot), step()];
    expect(layoutErrors(parts)).toEqual([]); expect(roundtrip(parts).ok).toBe(true);
    expect(slotsOf(step()).cells).toHaveLength(2); expect(slotsOf(step()).occupies).toHaveLength(4);
    expect(slotsOf(step()).edgeRules).toHaveLength(2);
    expect(footprintCells(parts)).toHaveLength(4); expect(groundCells(parts)).toEqual(groundCells(base(rot)));
    expect(blueprintTriangles(parts, 'high') - blueprintTriangles(base(rot), 'high')).toBe(partCost('step.entry-wide', 'high').triangles);
  });
  it('requires both rear floors even without a wide door, and reserves both top and foot edges', () => {
    const floors = base(rot).slice(0, 2), stair = step(), second = slotsOf(stair).cells[1];
    expect(placementProblem([floors[0]], stair)?.kind).toBe('support');
    expect(roundtrip([floors[0], stair]).ok).toBe(false);
    const topWall = piece(5, 'wall.solid', floors[1].x, floors[1].z, rot);
    expect(placementProblem([...floors, stair], topWall)?.kind).toBe('overlap');
    expect(placementProblem([...floors, topWall], stair)?.kind).toBe('overlap');
    expect(placementProblem([...floors, stair], piece(5, 'rail.guard', second[0], second[1], rot))?.kind).toBe('overlap');
  });
  it('rejects upper-level placement and a second cell outside the grid', () => {
    expect(placementProblem(base(rot), { ...step(), level: 1 })?.kind).toBe('bounds');
    const [dx, dz] = rotDir(rot + 1);
    const outside = { ...step(), x: dx > 0 ? 4 : dx < 0 ? 0 : 2, z: dz > 0 ? 4 : dz < 0 ? 0 : 2 };
    expect(placementProblem([], outside)?.kind).toBe('bounds');
  });
});

describe.each([0, 1, 2, 3] as const)('two-edge rules at quarter turn %i', rot => {
  it('occupies the actual second edge and supports a roof over that cell', () => {
    const parts = base(rot), door = parts[2], second = parts[1];
    expect(slotsOf(door).cells).toEqual([[2, 2], [second.x, second.z]]);
    expect(slotsOf(door).occupies).toHaveLength(2);
    expect(new Layout(parts).at(slotsOf(door).occupies[1])?.n).toBe(door.n);
    expect(layoutErrors(parts)).toEqual([]);
    const roof = piece(4, 'roof.deck', second.x, second.z, 0, 1);
    expect(placementProblem(parts, roof)).toBeNull(); expect(supportIssues([...parts, roof])).toEqual([]);
    expect(roundtrip([...parts, roof]).ok).toBe(true);
  });
  it('refuses a missing second floor, a second-edge wall and an internal dividing wall', () => {
    const parts = base(rot), second = parts[1], door = parts[2];
    expect(placementProblem([parts[0]], door)?.kind).toBe('support');
    expect(roundtrip([parts[0], door]).ok).toBe(false);
    expect(placementProblem(parts, piece(4, 'wall.solid', second.x, second.z, rot))?.kind).toBe('overlap');
    const dividing = piece(4, 'wall.solid', 2, 2, ((rot + 1) % 4) as Rot);
    expect(wideDoorClearanceIssues([...parts, dividing])).toHaveLength(1);
    expect(placementProblem(parts, dividing)?.kind).toBe('overlap');
    expect(placementProblem([...parts.slice(0, 2), dividing], door)?.kind).toBe('overlap');
  });
  it('refuses when the real second cell runs outside the grid', () => {
    const [dx, dz] = rotDir(rot + 1), x = dx > 0 ? 4 : dx < 0 ? 0 : 2, z = dz > 0 ? 4 : dz < 0 ? 0 : 2;
    expect(placementProblem([], piece(1, 'wall.door-wide', x, z, rot))?.kind).toBe('bounds');
  });
});

describe('new plans, command stack and strict saves', () => {
  it('adds, rotates, undoes and saves a real continuous step without virtual parts or lost groups', () => {
    const editor = new BlueprintEditor(); editor.load({ ...blueprint(base().slice(0, 2)), groups: [] });
    expect(editor.add({ part: 'step.entry-wide', x: 2, z: 3, rot: 0, level: 0 }).ok).toBe(true);
    expect(editor.parts.at(-1)?.n).toBe(3); expect(editor.parts).toHaveLength(3);
    expect(editor.add({ part: 'wall.door-wide.open', x: 2, z: 2, rot: 0, level: 0 }).ok).toBe(true);
    editor.selectAll(editor.parts.map(p => p.n)); expect(editor.group('Wide entrance').ok).toBe(true);
    const before = editor.toBlueprint(); expect(editor.rotateSelection().ok).toBe(true);
    expect(layoutErrors(editor.parts)).toEqual([]); expect(editor.undo().ok).toBe(true);
    expect(editor.toBlueprint()).toEqual(before); expect(editor.redo().ok).toBe(true);
    const decoded = decodeBlueprint(encodeBlueprint(editor.toBlueprint())); expect(decoded.ok).toBe(true);
    if (decoded.ok) { expect(decoded.value.parts).toHaveLength(4); expect(decoded.value.parts.every(p => p.n > 0)).toBe(true); expect(decoded.value.groups).toEqual(before.groups); }
  });
  it('atomically replaces a narrow door with a wide one, preserving identity, groups, placement and original undo/redo', () => {
    const bp = blueprint(base().map(p => p.n === 3 ? { ...p, part: 'wall.door.open' as const } : p));
    const editor = new BlueprintEditor(); editor.load(bp); editor.select(3);
    const selected = [...editor.selection]; let events = 0; editor.onChange(() => events++);
    expect(editor.replaceDoor(3, 'wall.door-wide.open').ok).toBe(true);
    expect(events).toBe(1); expect(editor.parts).toHaveLength(3);
    expect(editor.part(3)).toEqual({ ...bp.parts[2], part: 'wall.door-wide.open' });
    expect(editor.groups).toEqual(bp.groups); expect([...editor.selection]).toEqual(selected);
    const replaced = editor.toBlueprint(); expect(editor.undoLabel).toMatch(/^Replace /);
    expect(editor.undo().ok).toBe(true); expect(editor.toBlueprint()).toEqual(bp);
    expect(editor.redo().ok).toBe(true); expect(editor.toBlueprint()).toEqual(replaced);
    expect(editor.add({ part: 'floor.deck', x: 1, z: 2, rot: 0, level: 0 }).ok).toBe(true);
    expect(editor.parts.at(-1)?.n).toBe(4);
  });
  it('rejects replacements blocked by a second-edge wall, without any editor state change', () => {
    const parts = base().map(p => p.n === 3 ? { ...p, part: 'wall.door.open' as const } : p);
    parts.push(piece(4, 'wall.solid', 3, 2));
    const editor = new BlueprintEditor(); editor.load(blueprint(parts)); editor.select(3);
    const before = editor.toBlueprint(), selected = [...editor.selection]; let events = 0; editor.onChange(() => events++);
    expect(editor.replaceDoor(3, 'wall.door-wide.open').ok).toBe(false);
    expect(editor.toBlueprint()).toEqual(before); expect([...editor.selection]).toEqual(selected);
    expect(editor.canUndo).toBe(false); expect(editor.canRedo).toBe(false); expect(editor.dirty).toBe(false); expect(events).toBe(0);
  });
  it('rejects narrowing a door when that would remove the second roof support, and rejects non-door tools', () => {
    const editor = new BlueprintEditor(); editor.load(blueprint([...base(), piece(4, 'roof.deck', 3, 2, 0, 1)]));
    const before = editor.toBlueprint();
    expect(editor.replaceDoor(3, 'wall.door.open')).toMatchObject({ ok: false, problem: { kind: 'support' } });
    expect(editor.replaceDoor(3, 'wall.solid').ok).toBe(false);
    expect(editor.replaceDoor(1, 'wall.door-wide').ok).toBe(false);
    expect(editor.toBlueprint()).toEqual(before); expect(editor.canUndo).toBe(false);
  });
  it('keeps open/closed blueprint poses as explicit reversible choices with the same part number', () => {
    const editor = new BlueprintEditor(); editor.load(blueprint());
    expect(editor.replaceDoor(3, 'wall.door-wide').ok).toBe(true);
    expect(editor.part(3)?.part).toBe('wall.door-wide'); expect(editor.parts).toHaveLength(3);
    expect(roundtrip([...editor.parts]).ok).toBe(true);
    expect(editor.undo().ok).toBe(true); expect(editor.part(3)?.part).toBe('wall.door-wide.open');
  });
  it('wires the visible replacement button to the host command and keeps bound home blueprint doors open', () => {
    const ui = readFileSync(new URL('../src/client/workshop.ts', import.meta.url), 'utf8');
    const colony = readFileSync(new URL('../src/client/colony.ts', import.meta.url), 'utf8');
    expect(ui).toContain('id="ws-replace-door"'); expect(ui).toContain("this.on('replace-door',()=>this.replaceSelectedDoor())");
    expect(ui).toContain('this.editor.replaceDoor(doors[0].n,part)');
    expect(ui).toContain('doors[0].n===this.homeDoorPartNumber&&!isOpenDoorPartId(part)');
    expect(colony).toContain('homeDoorPartNumber:u.currentPlanet.homeDoor.partNumber');
  });
  it('matches host pivots for isolated and supported wide doors, while preserving explicit view pivots', () => {
    const library = new StyleLibrary('low', { scans: false, look: 'village' });
    try {
      for (const rot of [0, 1, 2, 3] as const) for (const supported of [false, true]) {
        const parts = supported ? base(rot) : [base(rot)[2]];
        for (const explicit of [undefined, { x: 2.5, z: 2.5 }]) {
          const model = buildBlueprintModel(parts, library, 'low', explicit ? { pivot: explicit } : undefined);
          try {
            for (const part of parts) expect(model.object.getObjectByName(`part:${part.n}`)?.position.toArray()).toEqual(partTransform(part, explicit ?? pivotOf(parts)).position);
          } finally { model.dispose(); }
        }
      }
    } finally { library.dispose(); }
  });
  it('saves a single part and real groups, without rule proxies or doubled geometry budget', () => {
    const bp = blueprint(), text = encodeBlueprint(bp), decoded = decodeBlueprint(text);
    expect(decoded.ok).toBe(true); if (!decoded.ok) return;
    expect(decoded.value).toEqual(bp); expect(encodeBlueprint(decoded.value)).toBe(text);
    expect(decoded.value.parts.filter(p => p.part.startsWith('wall.door-wide'))).toHaveLength(1);
    expect(decoded.value.parts.every(p => p.n > 0)).toBe(true);
    const realCost = bp.parts.reduce((sum, p) => sum + partCost(p.part, 'high').triangles, 0) + 2 * 12;
    expect(blueprintTriangles(bp.parts, 'high')).toBe(realCost);
  });
  it.each(['unknown ID', 'negative n', 'duplicate n', 'extra field', 'bad group', 'missing floor', 'second-edge overlap'])('rejects malformed host document: %s', kind => {
    const doc = JSON.parse(encodeBlueprint(blueprint()));
    if (kind === 'unknown ID') doc.parts[0].part = 'wall.invented';
    if (kind === 'negative n') doc.parts[0].n = -1;
    if (kind === 'duplicate n') doc.parts[0].n = 2;
    if (kind === 'extra field') doc.parts[0].hiddenProxy = true;
    if (kind === 'bad group') doc.groups[0].members.push(999);
    if (kind === 'missing floor') doc.parts.splice(1, 1);
    if (kind === 'second-edge overlap') doc.parts.push(piece(4, 'wall.solid', 3, 2));
    expect(decodeBlueprint(doc).ok).toBe(false);
  });
  it('can add a roof carried only by the second edge, undo, redo and preserve nextN', () => {
    const editor = new BlueprintEditor(); editor.load(blueprint());
    const result = editor.add({ part: 'roof.deck', x: 3, z: 2, level: 1, rot: 0 });
    expect(result.ok).toBe(true); const after = editor.toBlueprint();
    expect(after.parts.at(-1)?.n).toBe(4); expect(editor.canUndo).toBe(true);
    expect(editor.undo().ok).toBe(true); expect(editor.toBlueprint()).toEqual(blueprint());
    expect(editor.redo().ok).toBe(true); expect(editor.toBlueprint()).toEqual(after);
    expect(editor.saveProblem()).toBeNull();
  });
  it('refuses movement that removes either floor without changing history, selection or dirty state', () => {
    const editor = new BlueprintEditor(); editor.load({ ...blueprint(), groups: [] }); editor.select(2);
    const before = editor.toBlueprint(); expect(editor.moveSelection(0, -1).ok).toBe(false);
    expect(editor.toBlueprint()).toEqual(before); expect(editor.canUndo).toBe(false);
    expect([...editor.selection]).toEqual([2]); expect(editor.dirty).toBe(false);
  });
  it('rotates and moves a complete grouped entrance with real parts, then restores it exactly', () => {
    const editor = new BlueprintEditor(); editor.load(blueprint()); editor.select(3);
    let events = 0; editor.onChange(() => events++);
    expect(editor.rotateSelection().ok).toBe(true); expect(events).toBe(1);
    expect(layoutErrors(editor.parts)).toEqual([]); expect(editor.parts).toHaveLength(3);
    expect(editor.parts.every(p => p.n > 0)).toBe(true); expect(editor.groups).toEqual(blueprint().groups);
    expect(editor.undo().ok).toBe(true); expect(editor.toBlueprint()).toEqual(blueprint());
    expect(editor.redo().ok).toBe(true); expect(editor.moveSelection(0, -1).ok).toBe(true);
    expect(editor.undo().ok).toBe(true); expect(editor.undo().ok).toBe(true);
    expect(editor.toBlueprint()).toEqual(blueprint());
  });
  it('refuses a blocked leaf during load and editor add; preserves safe outer flank walls', () => {
    const parts = base(), interior = piece(4, 'wall.solid', 2, 2, 1);
    expect(() => new BlueprintEditor().load({ ...blueprint([...parts, interior]), groups: [] })).toThrow(/overlap|swing/);
    const editor = new BlueprintEditor(); editor.load(blueprint());
    expect(editor.add({ part: interior.part, x: 2, z: 2, rot: 1, level: 0 }).ok).toBe(false); expect(editor.canUndo).toBe(false);
    expect(placementProblem(parts, piece(4, 'wall.solid', 2, 2, 3))).toBeNull();
    expect(placementProblem(parts, piece(5, 'wall.solid', 3, 2, 1))).toBeNull();
    expect(partTransform(parts[2], { x: 0, z: 0 }).position).toEqual([2.5, 0, 3]);
  });
});
