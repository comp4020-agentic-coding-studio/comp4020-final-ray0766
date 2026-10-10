import { expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { PartBuilder } from '../src/assets/claude-geometry/style/geometry.ts';
import { countingMaterials, makeKit } from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import { wideEntrySteps } from '../src/shared/blueprint-wide-entry-geometry.ts';

it('has the same four real tread heights across its centre and both approach lanes at every LOD', () => {
  for (const lod of ['low', 'medium', 'high'] as const) {
    const materials = countingMaterials(lod, 'village'), builder = new PartBuilder(lod);
    wideEntrySteps(makeKit(builder, materials));
    const built = builder.build('wide-entry-contract');
    built.group.updateMatrixWorld(true);
    // Both former cell centres and their join are usable tread, not coping.
    for (const x of [-.2, 0, .49, .5, .51, 1, 1.2]) {
      for (const [z, expected] of [[-.375, -.15], [-.125, -.3], [.125, -.45], [.375, -.6]]) {
        const ray = new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0));
        const first = ray.intersectObject(built.group, true)[0];
        expect(first, `${lod} x=${x} z=${z}`).toBeDefined();
        expect(first.point.y).toBeCloseTo(expected, 6);
      }
    }
    const bounds = new Box3().setFromObject(built.group);
    for (const [actual, expected] of bounds.min.toArray().map((n, i) => [n, [-.5, -.9, -.5][i]])) expect(actual).toBeCloseTo(expected, 6);
    for (const [actual, expected] of bounds.max.toArray().map((n, i) => [n, [1.5, -.15, .5][i]])) expect(actual).toBeCloseTo(expected, 6);
    built.group.traverse(node => { if (node instanceof Mesh) node.geometry.dispose(); });
    materials.dispose();
  }
});
