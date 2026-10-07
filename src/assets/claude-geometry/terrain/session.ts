import { createHeightField } from './field.ts';
import type { TerrainField } from './field.ts';
import { canonicalEnvironment, encodeEnvironment, environmentId } from './env.ts';
import type { PlanetEnvironment } from './env.ts';
import { checkTerrainChange } from './policy.ts';
import type { AnchoredObject, TerrainChangeCheck } from './policy.ts';
import type { GroundFit } from '../core/ground.ts';

// The applied terrain of one planet and the objects anchored on it, with the
// RESTRICT policy as the only way to change it. Pure state, no rendering, so
// the same rules can run in a browser demo, a test or a server handler.
// A preview is just a field the caller builds; only apply() changes state,
// and only when every object still fits.

export type ApplyResult =
  | { ok: true; check: TerrainChangeCheck; previous: PlanetEnvironment }
  | { ok: false; check: TerrainChangeCheck };

export class TerrainSession {
  private appliedEnv: PlanetEnvironment;
  private appliedField: TerrainField;
  private readonly objectList: AnchoredObject[];
  /** Seats on the applied field, derived once per applied field (fits are deterministic). */
  private seatCache: Map<string, GroundFit> | null = null;

  constructor(env: PlanetEnvironment, objects: readonly AnchoredObject[], field?: TerrainField) {
    this.appliedEnv = canonicalEnvironment(env);
    // A passed field is only reused when it was made from this very environment.
    this.appliedField = field && field.id === environmentId(this.appliedEnv) ? field : createHeightField(this.appliedEnv);
    this.objectList = objects.map(o => ({ ...o, anchor: { dir: [...o.anchor.dir], yaw: o.anchor.yaw }, footprint: { radius: o.footprint.radius, samples: o.footprint.samples.map(s => [s[0], s[1]] as [number, number]) } }));
  }

  get env(): PlanetEnvironment { return canonicalEnvironment(this.appliedEnv); }
  get field(): TerrainField { return this.appliedField; }
  get objects(): readonly AnchoredObject[] { return this.objectList; }
  /** Canonical JSON of the applied environment: what a server would store. */
  get json(): string { return encodeEnvironment(this.appliedEnv); }

  /** Current seat of every object, derived from the applied field. */
  seats(): Map<string, GroundFit> {
    this.seatCache ??= new Map(checkTerrainChange(this.appliedField, this.objectList).refits.map(r => [r.id, r.fit]));
    return new Map(this.seatCache);
  }

  /** The applied field's own check: every object at its current seat, no change. */
  appliedCheck(): TerrainChangeCheck {
    const seats = this.seats();
    const refits = this.objectList.map(o => ({ id: o.id, label: o.label, fit: seats.get(o.id)!, change: 0 }));
    const conflicts = refits.filter(r => r.fit.problem).map(r => ({ id: r.id, label: r.label, problem: r.fit.problem!, message: r.fit.message ?? r.fit.problem!, fit: r.fit }));
    return { ok: conflicts.length === 0, refits, conflicts };
  }

  /** What applying `next` would do, without changing anything. */
  check(next: PlanetEnvironment | TerrainField): TerrainChangeCheck {
    const field = 'heightAt' in next ? next : createHeightField(next);
    return checkTerrainChange(field, this.objectList, this.seats());
  }

  /** Apply new terrain under RESTRICT: refused (and nothing changes) if any object would not fit. */
  apply(next: PlanetEnvironment, field?: TerrainField): ApplyResult {
    const env = canonicalEnvironment(next);
    const nextField = field && field.id === environmentId(env) ? field : createHeightField(env);
    const check = checkTerrainChange(nextField, this.objectList, this.seats());
    if (!check.ok) return { ok: false, check };
    const previous = this.appliedEnv;
    this.appliedEnv = env;
    this.appliedField = nextField;
    this.seatCache = new Map(check.refits.map(r => [r.id, r.fit]));
    return { ok: true, check, previous };
  }
}
