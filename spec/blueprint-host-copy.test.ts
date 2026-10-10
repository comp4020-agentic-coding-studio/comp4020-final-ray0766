// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { Workshop } from '../src/client/workshop.ts';
import type { BlueprintEditor } from '../src/client/blueprint-editor.ts';
import type { LibraryEntry } from '../src/shared/blueprints.ts';
import type { Blueprint } from '../src/shared/blueprint-model.ts';
import { assetConnections } from '../src/client/shared-assets.ts';

it('keeps a failed or invalid Save as copy bound to the original document, history and library version', async () => {
  const bp: Blueprint = { id: '11111111-1111-4111-8111-111111111111' as Blueprint['id'], name: 'Original home', groups: [], parts: [
    { n: 1, part: 'floor.deck', x: 2, z: 2, level: 0, rot: 0 },
    { n: 2, part: 'floor.deck', x: 3, z: 2, level: 0, rot: 0 },
    { n: 3, part: 'wall.door-wide.open', x: 2, z: 2, level: 0, rot: 0 },
  ] };
  const saved: LibraryEntry = { blueprint: bp, hash: 'a'.repeat(64), version: 7 };
  const save = vi.fn(async () => { throw new Error('Copy request failed.'); });
  const workshop = new Workshop({ read: async () => [saved], save, place: () => {}, allowed: () => true });
  const state = workshop as unknown as { editor: BlueprintEditor; saved: LibraryEntry | null };
  state.editor.load(bp); state.saved = saved;
  state.editor.add({ part: 'roof.deck', x: 3, z: 2, level: 1, rot: 0 }); state.editor.select(3);
  const before = state.editor.toBlueprint(), selection = [...state.editor.selection], undoLabel = state.editor.undoLabel;
  try {
    document.querySelector<HTMLButtonElement>('#ws-copy')!.click();
    await vi.waitFor(() => expect(document.querySelector('#ws-status')!.textContent).toBe('Copy request failed.'));
    expect(save).toHaveBeenCalledTimes(1);
    const request = save.mock.calls[0] as unknown as [{ expectedVersion: number; document: Blueprint }];
    expect(request[0].expectedVersion).toBe(0); expect(request[0].document.id).not.toBe(bp.id);
    expect(state.saved).toBe(saved); expect(state.saved?.version).toBe(7);
    expect(state.editor.toBlueprint()).toEqual(before); expect([...state.editor.selection]).toEqual(selection);
    expect(state.editor.undoLabel).toBe(undoLabel); expect(state.editor.dirty).toBe(true);
    state.editor.remove([2]); const invalid = state.editor.toBlueprint(); save.mockClear();
    document.querySelector<HTMLButtonElement>('#ws-copy')!.click(); await Promise.resolve();
    expect(save).not.toHaveBeenCalled(); expect(state.editor.toBlueprint()).toEqual(invalid); expect(state.saved).toBe(saved);
    expect(document.querySelector('#ws-status')!.textContent).toMatch(/Fix|floor|support/);
  } finally { document.querySelector('#workshop')?.remove(); }
});

it('keeps old connection hints unchanged and uses the wide pieces’ real horizontal extent', () => {
  expect(assetConnections('wall.door.open')).toEqual([{ name: 'left', position: [-.5, 0, 0] }, { name: 'right', position: [.5, 0, 0] }, { name: 'top', position: [0, 2.2, 0] }]);
  for (const part of ['wall.door-wide', 'wall.door-wide.open'] as const) {
    const map = Object.fromEntries(assetConnections(part).map(c => [c.name, c.position]));
    expect(map.left[0]).toBe(-.5); expect(map.right[0]).toBe(1.5); expect(map.top).toEqual([.5, 2.04, 0]);
  }
  const steps = Object.fromEntries(assetConnections('step.entry-wide').map(c => [c.name, c.position]));
  expect(steps.left[0]).toBe(-.5); expect(steps.right[0]).toBe(1.5);
  expect(steps.front).toEqual([.5, -.6, .5]); expect(steps.back).toEqual([.5, -.15, -.5]);
});
