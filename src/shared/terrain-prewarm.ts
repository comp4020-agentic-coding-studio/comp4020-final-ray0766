import { structureFit } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import { fieldOf, objectSeat } from './terrain.ts';
import type { PlacedObject } from './planets.ts';
import type { GroundFit } from '../assets/claude-geometry/core/ground.ts';

export interface TerrainPreparation {
  environment?: string | null;
  radius: number;
  objects: readonly PlacedObject[];
  blueprints?: BlueprintContents;
}
export interface TerrainPreparationOptions {
  /** The client supplies a real frame boundary, not a resolved microtask. */
  yieldFrame: () => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  budgetMs?: number;
}

/** Prepare the exact same support fits used by rendering and GroundWorld.
 * Cancellation never commits a scene or changes the player's saved contents.
 * A single vendor fit is atomic; maxTaskMs exposes that remaining lower bound.
 */
export async function prewarmTerrainFits(planet: TerrainPreparation, options: TerrainPreparationOptions) {
  const field = fieldOf(planet.environment, planet.radius), total = planet.objects.length;
  const budget = options.budgetMs ?? 6;
  if (!Number.isFinite(budget) || budget < 0) throw Error('Invalid terrain preparation budget.');
  let completed = 0, maxTaskMs = 0;
  const fits = new Map<string, GroundFit>();
  options.onProgress?.(completed, total);
  await options.yieldFrame();
  let started = performance.now();
  for (const object of planet.objects) {
    if (options.signal?.aborted) break;
    const before = performance.now();
    if (object.kind === 'structure') {
      const parts = planet.blueprints?.[object.blueprintHash!];
      if (!parts) throw Error('Structure content is missing during terrain preparation.');
      fits.set(object.id, structureFit(parts, object.position, object.rotation, field));
    } else fits.set(object.id, objectSeat(field, object, planet.blueprints));
    maxTaskMs = Math.max(maxTaskMs, performance.now() - before);
    completed++;
    options.onProgress?.(completed, total);
    if (performance.now() - started >= budget && completed < total) {
      await options.yieldFrame();
      started = performance.now();
    }
  }
  return { field, fits, completed, total, cancelled: !!options.signal?.aborted, maxTaskMs };
}
