import type { SurfaceAnchor } from '../core/anchor.ts';
import { fitGround } from '../core/ground.ts';
import type { Footprint, GroundFit, GroundProblem, HeightField } from '../core/ground.ts';

// Terrain-change policy: RESTRICT (docs/CONTRACTS.md §5).
//
// Before new terrain is applied, every placed object is re-fitted with
// fitGround on the new field. If any fit has a problem (a footprint sample
// under water, or ground falling away more than MAX_FOUNDATION_DEPTH), the
// change is refused as a whole and the conflicting objects are listed;
// nothing is applied. Otherwise each object re-seats on the new ground.
// Seats are never stored: a refit is exactly what fitGround returns for the
// object's anchor on that field.

export interface AnchoredObject {
  id: string;
  /** Human-readable name for refusal lists. */
  label: string;
  anchor: SurfaceAnchor;
  footprint: Footprint;
}

export interface Refit {
  id: string;
  label: string;
  fit: GroundFit;
  /** Change of base radius against the current field, metres (null when no current field was given). */
  change: number | null;
}

export interface Conflict {
  id: string;
  label: string;
  problem: GroundProblem;
  message: string;
  fit: GroundFit;
}

export interface TerrainChangeCheck {
  ok: boolean;
  refits: Refit[];
  conflicts: Conflict[];
}

/**
 * Re-fit every object on `nextField`. `current` (the field in force, or the
 * seats already derived from it) only feeds the reported change per object.
 */
export function checkTerrainChange(nextField: HeightField, objects: readonly AnchoredObject[], current?: HeightField | ReadonlyMap<string, GroundFit>): TerrainChangeCheck {
  const refits: Refit[] = [];
  const conflicts: Conflict[] = [];
  for (const o of objects) {
    const fit = fitGround(nextField, o.anchor, o.footprint);
    const before = !current ? null : 'heightAt' in current ? fitGround(current, o.anchor, o.footprint).baseRadius : current.get(o.id)?.baseRadius ?? null;
    refits.push({ id: o.id, label: o.label, fit, change: before === null ? null : fit.baseRadius - before });
    if (fit.problem) conflicts.push({ id: o.id, label: o.label, problem: fit.problem, message: fit.message ?? fit.problem, fit });
  }
  return { ok: conflicts.length === 0, refits, conflicts };
}

/** One line per conflict, for status text and logs. */
export const describeConflicts = (check: TerrainChangeCheck) =>
  check.conflicts.map(c => `${c.label}: ${c.problem === 'underwater' ? 'would be under water' : `ground drops ${c.fit.foundationDepth.toFixed(2)} m under it`}`);
