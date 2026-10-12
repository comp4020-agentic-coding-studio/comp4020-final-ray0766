import { describe, expect, it } from 'vitest';
import { GroundWorld, cameraTerrainRadiusUpperBound } from '../src/shared/physics/world.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { HEIGHT_LIMITS } from '../src/assets/claude-geometry/terrain/field.ts';
import type { HeightField } from '../src/assets/claude-geometry/core/ground.ts';

const radius = 21.6, environment = samplePublicVillage(radius).environment;
const generated = () => new GroundWorld({ id: 'camera-bound-test', radius, revision: 1, objects: [], blueprints: {}, environment });
const mutableField = (field: HeightField) => field as { heightAt: HeightField['heightAt'] };
describe('trusted generated camera terrain upper bound', () => {
  it('bounds exact generated radius while retaining the exact radius function and revision', () => {
    const world = generated(), originalRadius = world.radius, originalHeight = world.ground.heightAt;
    const upper = cameraTerrainRadiusUpperBound(world);
    expect(upper).not.toBeNull(); expect(upper!).toBeGreaterThanOrEqual(radius + .78525);
    expect(upper! - (radius + .78525)).toBeLessThan(1e-7);
    for (const direction of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [.6, -.8, 0]] as const)
      expect(world.radius([...direction])).toBeLessThanOrEqual(upper!);
    expect(world.radius).toBe(originalRadius); expect(world.ground.heightAt).toBe(originalHeight); expect(world.revision).toBe(1);
  });
  it('does not issue provenance for legacy or unknown worlds', () => {
    const legacy = new GroundWorld({ id: 'camera-bound-legacy', radius: 12, revision: 1, objects: [], blueprints: {} });
    expect(cameraTerrainRadiusUpperBound(legacy)).toBeNull();
    expect(cameraTerrainRadiusUpperBound(Object.create(GroundWorld.prototype) as GroundWorld)).toBeNull();
  });
  it('rejects instance radius, field/ground objects and heightAt replacements', () => {
    const a = generated(); a.radius = () => 1000; expect(cameraTerrainRadiusUpperBound(a)).toBeNull();
    const b = generated(), groundHeight = b.ground.heightAt;
    try { mutableField(b.ground).heightAt = () => 1000; expect(cameraTerrainRadiusUpperBound(b)).toBeNull(); }
    finally { mutableField(b.ground).heightAt = groundHeight; }
    const c = generated(), fieldHeight = c.field.heightAt;
    try { mutableField(c.field).heightAt = () => 1000; expect(cameraTerrainRadiusUpperBound(c)).toBeNull(); }
    finally { mutableField(c.field).heightAt = fieldHeight; }
    const d = generated(); Object.defineProperty(d, 'ground', { value: { ...d.ground } }); expect(cameraTerrainRadiusUpperBound(d)).toBeNull();
    const e = generated(); Object.defineProperty(e, 'field', { value: { ...e.field } }); expect(cameraTerrainRadiusUpperBound(e)).toBeNull();
    const f = generated(); Object.defineProperty(f, 'baseRadius', { value: 30 }); expect(cameraTerrainRadiusUpperBound(f)).toBeNull();
  });
  it('rejects a shared generated field monkeypatched before world construction', () => {
    const field = fieldOf(environment, radius), original = field.heightAt;
    try { mutableField(field).heightAt = () => 1000; expect(cameraTerrainRadiusUpperBound(generated())).toBeNull(); }
    finally { mutableField(field).heightAt = original; }
  });
  it('invalidates the bound if the source clamp constants change', () => {
    const world = generated(), limits = HEIGHT_LIMITS as { ceiling: number }, original = limits.ceiling;
    try { limits.ceiling = original + 1; expect(cameraTerrainRadiusUpperBound(world)).toBeNull(); }
    finally { limits.ceiling = original; }
  });
});
