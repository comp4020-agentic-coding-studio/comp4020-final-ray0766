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

it('keeps every source module and model manifest byte-identical to the pinned village handover', () => {
  const root = new URL('../src/assets/claude-geometry/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('PROVENANCE.json', root), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.files)) expect(createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex'), file).toBe(hash);
  expect(Object.keys(manifest.files)).toHaveLength(114);
  expect(new Set(Object.values(manifest.fileCommits))).toEqual(new Set([manifest.commit]));
  expect(manifest.commit).toBe('14e244f0852195da5fff4a83fdc824229a47021d');
  for (const [file, data] of Object.entries(manifest.r9.data) as [string,{sha256:string}][]) expect(createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex'),file).toBe(data.sha256);
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

it('cancels a depth-free placement and restores the actual indoor material twins before disposal', () => {
  const library = createWorldStyleLibrary(), model = buildBlueprintModel(industrialCabin(), library);
  expect(model.object.getObjectByName('ink-shell')).toBeUndefined();
  expect(model.object.getObjectByName('ink-lines')).toBeUndefined();
  const solid=model.object.children.find(o=>o instanceof T.Mesh&&(o.material as T.Material).userData.interior) as T.Mesh;
  expect(solid).toBeInstanceOf(T.Mesh);expect(solid.geometry.getAttribute('cover')).toBeDefined();
  const original=solid.material as T.Material;let sharedDisposals=0,tintDisposals=0;
  original.addEventListener('dispose',()=>sharedDisposals++);
  model.object.userData.disposeOwned = () => model.dispose();
  makePlacementPreview(model.object, false);
  expect((solid.material as T.Material).depthWrite).toBe(false);expect(solid.material).not.toBe(original);
  (solid.material as T.Material).addEventListener('dispose', () => tintDisposals++);
  expect(model.object.userData.noPracticalLights).toBe(true);
  model.object.userData.disposeOwned(); model.object.userData.disposeOwned();
  expect(model.disposed).toBe(true);expect(solid.material).toBe(original); expect(tintDisposals).toBe(1); expect(sharedDisposals).toBe(0);
  library.dispose(); expect(sharedDisposals).toBe(1);
});
