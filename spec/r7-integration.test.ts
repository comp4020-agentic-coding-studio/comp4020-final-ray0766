import { expect, it } from 'vitest';
import * as T from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { StyleLibrary } from '../src/assets/claude-geometry/style/materials.ts';
import { BUDGET } from '../src/assets/claude-geometry/style/lod.ts';
import { buildBlueprintModel } from '../src/assets/claude-geometry/blueprint/model3d.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { createShipModel, envelopeProblems } from '../src/assets/claude-geometry/ship/factory.ts';
import { cloneDesign, STARTERS } from '../src/assets/claude-geometry/ship/design.ts';
import { allPartCombinations, SHIP_ENVELOPE } from '../src/assets/claude-geometry/ship/spec.ts';
import { makePlacementPreview } from '../src/client/placement-preview.ts';
import { createWorldStyleLibrary } from '../src/client/presentation.ts';

it('keeps every vendored file byte-identical to its provenance and pins only the 32 R7 updates', () => {
  const root = new URL('../src/assets/claude-geometry/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('PROVENANCE.json', root), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.files)) expect(createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex'), file).toBe(hash);
  expect(Object.keys(manifest.files)).toHaveLength(79);
  expect(Object.values(manifest.fileCommits).filter(c => c === '5a73b228f13b8b20460ea6f9403167fdfedc08be')).toHaveLength(32);
  expect(manifest.commit).toBe('a4546bb120d969774776f1fbe2cb1c990a7c3e66');
});

it('draws every saved ship combination inside its envelope and medium budget without changing industrial defaults', () => {
  const library = createWorldStyleLibrary(), industrial = new StyleLibrary('medium', { scans: false });
  expect(library.look).toBe('village'); expect(industrial.look).toBe('industrial');
  const combinations = allPartCombinations(); expect(combinations).toHaveLength(729);
  const problems: string[] = [];
  try {
    for (const parts of combinations) {
      const design = { ...cloneDesign(STARTERS[0]), parts };
      const model = createShipModel(design, library, 'medium', { decal: null });
      try {
        const errors = envelopeProblems(model, SHIP_ENVELOPE);
        if (errors.length || model.stats.triangles > BUDGET.ship.medium.triangles || model.stats.drawCalls > BUDGET.ship.medium.drawCalls) problems.push(`${Object.values(parts).join('/')}: ${errors.join(';')} ${JSON.stringify(model.stats)}`);
      } finally { model.dispose(); }
    }
    expect(problems).toEqual([]);
  } finally { library.dispose(); industrial.dispose(); }
}, 120_000);

it('cancels and disposes an inked placement without executing ink callbacks on a tint or releasing shared materials', () => {
  const library = createWorldStyleLibrary(), model = buildBlueprintModel(industrialCabin(), library);
  const shell = model.object.getObjectByName('ink-shell') as T.Mesh;
  const lines = model.object.getObjectByName('ink-lines')!;
  expect(shell).toBeInstanceOf(T.Mesh); expect(lines).toBeInstanceOf(T.LineSegments);
  const ink = shell.material as T.Material; let sharedDisposals = 0, tintDisposals = 0;
  ink.addEventListener('dispose', () => sharedDisposals++);
  model.object.userData.disposeOwned = () => model.dispose();
  makePlacementPreview(model.object, false);
  expect(shell.visible).toBe(false); expect(lines.visible).toBe(false); expect(shell.material).toBe(ink);
  const solid = model.object.children.find(o => o instanceof T.Mesh && o !== shell) as T.Mesh;
  (solid.material as T.Material).addEventListener('dispose', () => tintDisposals++);
  const renderable: T.Object3D[] = []; model.object.traverseVisible(o => renderable.push(o));
  expect(renderable).not.toContain(shell); expect(model.object.userData.noPracticalLights).toBe(true);
  model.object.userData.disposeOwned(); model.object.userData.disposeOwned();
  expect(model.disposed).toBe(true); expect(tintDisposals).toBe(1); expect(sharedDisposals).toBe(0);
  library.dispose(); expect(sharedDisposals).toBe(1);
});
