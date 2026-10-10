import { expect, it } from 'vitest';
import { cacheImmutableField, seatedFit } from '../src/shared/ground-fit-cache.ts';
import { fitGround, rectFootprint } from '../src/assets/claude-geometry/core/ground.ts';
import type { HeightField } from '../src/assets/claude-geometry/core/ground.ts';

const anchor = { dir: [0, 1, 0] as [number, number, number], yaw: 0 };
it('reuses exact immutable terrain fits while isolating changed placements, samples and results', () => {
  let samples = 0;
  const field = cacheImmutableField<HeightField>({ id: 'terrain', waterLevel: null,
    heightAt: p => { samples++; return p[0] * .2 + p[2] * .1; }, normalAt: p => p });
  const footprint = rectFootprint(-1, 1, -1, 1);
  const expected = fitGround(field, anchor, footprint), first = seatedFit(field, anchor, footprint), before = samples;
  first.baseRadius = -123;
  expect(seatedFit(field, anchor, footprint)).toEqual(expected);
  expect(samples).toBe(before);
  const turned = { ...anchor, yaw: .5 };
  expect(seatedFit(field, turned, footprint)).toEqual(fitGround(field, turned, footprint));
  footprint.samples.push([4, 4]);
  expect(seatedFit(field, anchor, footprint)).toEqual(fitGround(field, anchor, footprint));
});
it('does not share fields by label or cache a mutable caller field', () => {
  let height = 0;
  const field: HeightField = { id: 'same', waterLevel: .5, heightAt: () => height, normalAt: p => p };
  const footprint = rectFootprint(-1, 1, -1, 1);
  expect(seatedFit(field, anchor, footprint).problem).toBe('underwater');
  height = 1;
  expect(seatedFit(field, anchor, footprint).problem).toBe(null);
  cacheImmutableField(field);
  const another = cacheImmutableField({ ...field, heightAt: () => -.5 });
  expect(seatedFit(another, anchor, footprint).problem).toBe('underwater');
  expect(seatedFit(field, anchor, footprint).problem).toBe(null);
});
