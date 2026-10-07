import type { GroundFit, HeightField } from '../core/ground.ts';
import { legacyHeightField } from '../core/ground.ts';
import { objectList } from '../core/world.ts';
import type { WorldState } from '../core/world.ts';
import { decodeEnvironment, defaultEnvironment, encodeEnvironment, HERO_SEED, SAVED_ENVIRONMENT_KEY, STYLE_SPECS } from '../terrain/env.ts';
import type { PlanetEnvironment, TerrainStyle } from '../terrain/env.ts';
import { checkTerrainChange } from '../terrain/policy.ts';
import type { AnchoredObject, TerrainChangeCheck } from '../terrain/policy.ts';
import type { StructureRegistry } from './placement.ts';

// The ground a planet view stands structures on, and the RESTRICT rule for
// changing it. Pure data: no three.js and no DOM, so the rules are unit
// tested in Node exactly as the demo applies them.
//
// A ground is either the main project's terrain at a76575a (legacyHeightField)
// or a terrain-module environment. Placed structures are anchors only; their
// seats are derived from whichever ground is in force (CONTRACTS §5), so a
// change of ground re-fits every structure on its dense footprint first and
// is refused as a whole, with the structures named, if any would end up under
// water or on ground that drops more than 0.6 m.

export type GroundChoice = 'legacy' | TerrainStyle | 'import' | 'saved';

/** What the planet view offers, in menu order. */
export const GROUND_CHOICES: readonly { id: GroundChoice; label: string }[] = [
  { id: 'legacy', label: 'Main project terrain (legacy, a76575a)' },
  { id: 'ocean', label: `Ocean · seed ${HERO_SEED}` },
  { id: 'desert', label: `Desert · seed ${HERO_SEED}` },
  { id: 'ice', label: `Ice · seed ${HERO_SEED}` },
  { id: 'temperate', label: `Temperate · seed ${HERO_SEED}` },
  { id: 'import', label: 'Import environment JSON' },
  { id: 'saved', label: 'Use the environment saved in the terrain demo' },
];

export type GroundSource =
  | { kind: 'legacy'; choice: 'legacy'; label: string }
  | { kind: 'terrain'; choice: GroundChoice; label: string; env: PlanetEnvironment };

export const LEGACY_GROUND: GroundSource = { kind: 'legacy', choice: 'legacy', label: 'Main project terrain (legacy, a76575a)' };

/** Short description of an environment for status lines: "Ocean · seed 20261005". */
export const environmentLabel = (env: PlanetEnvironment) => `${STYLE_SPECS[env.style].label} · seed ${env.seed}`;

export type ResolvedGround = { ok: true; source: GroundSource } | { ok: false; message: string; errors: string[] };

/** Read-only view of a localStorage-like store. */
export interface ReadableStore { getItem(key: string): string | null }

/**
 * Turn a menu choice into a ground. `importText` is the pasted document for
 * 'import'; `store` is this browser's localStorage (or null where reading it
 * throws) for 'saved'. Absent or unreadable documents come back as a message
 * plus every validation error with its JSON path; nothing is guessed.
 */
export function resolveGround(choice: GroundChoice, input: { importText?: string; store?: ReadableStore | null } = {}): ResolvedGround {
  if (choice === 'legacy') return { ok: true, source: LEGACY_GROUND };
  if (choice === 'import') {
    const text = input.importText?.trim() ?? '';
    if (!text) return { ok: false, message: 'Paste a planet-modules/planet-environment document first (Export in the terrain demo writes one).', errors: [] };
    const r = decodeEnvironment(text);
    if (!r.ok) return { ok: false, message: 'That environment document cannot be used:', errors: r.errors };
    return { ok: true, source: { kind: 'terrain', choice, label: `${environmentLabel(r.value)} (imported)`, env: r.value } };
  }
  if (choice === 'saved') {
    const blocked = { ok: false as const, message: 'This browser does not let the page read its storage, so the terrain demo\'s saved planet cannot be read here.', errors: [] };
    if (!input.store) return blocked;
    let text: string | null;
    try { text = input.store.getItem(SAVED_ENVIRONMENT_KEY); } catch { return blocked; }
    if (text === null) return { ok: false, message: 'The terrain demo has not saved a planet in this browser yet. Open Terrain, shape a planet and press Save, then come back.', errors: [] };
    const r = decodeEnvironment(text);
    if (!r.ok) return { ok: false, message: `The planet the terrain demo saved (${SAVED_ENVIRONMENT_KEY}) cannot be read:`, errors: r.errors };
    return { ok: true, source: { kind: 'terrain', choice, label: `${environmentLabel(r.value)} (saved in the terrain demo)`, env: r.value } };
  }
  const env = defaultEnvironment(choice, HERO_SEED);
  return { ok: true, source: { kind: 'terrain', choice, label: environmentLabel(env), env } };
}

/** Identity of a ground, for "is this already in force": the canonical environment, or the legacy field id. */
export const groundKey = (source: GroundSource) => (source.kind === 'legacy' ? legacyHeightField().id : encodeEnvironment(source.env));

/**
 * Every placed structure as the RESTRICT policy sees it: its anchor, its
 * dense ground footprint and a name people can read. Copies of the same
 * blueprint are numbered in the order they were placed ("Relay hut 1",
 * "Relay hut 2"); the name is the latest one registered for the hash, so a
 * rename shows here too. Structures whose blueprint is not registered are
 * reported in `unknown` (they cannot be checked, so a change must be refused).
 */
export function anchoredStructures(state: WorldState, registry: StructureRegistry): { objects: AnchoredObject[]; unknown: string[] } {
  const count = new Map<string, number>();
  const objects: AnchoredObject[] = [];
  const unknown: string[] = [];
  for (const o of objectList(state)) {
    if (o.spec.kind !== 'structure') continue;
    const hash = o.spec.blueprintHash;
    const footprint = registry.groundFootprintOf(hash);
    const name = registry.get(hash)?.name ?? `Structure ${hash.slice(0, 8)}`;
    const k = (count.get(name) ?? 0) + 1;
    count.set(name, k);
    if (!footprint) { unknown.push(`${name} ${k}`); continue; }
    objects.push({ id: o.id, label: `${name} ${k}`, anchor: o.anchor, footprint });
  }
  return { objects, unknown };
}

/** Labels of every placed structure by object id, as anchoredStructures numbers them. */
export function structureLabels(state: WorldState, registry: StructureRegistry): Map<string, string> {
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const o of objectList(state)) {
    if (o.spec.kind !== 'structure') continue;
    const name = registry.get(o.spec.blueprintHash)?.name ?? `Structure ${o.spec.blueprintHash.slice(0, 8)}`;
    const k = (count.get(name) ?? 0) + 1;
    count.set(name, k);
    out.set(o.id, `${name} ${k}`);
  }
  return out;
}

export interface GroundChange extends TerrainChangeCheck {
  /** Structures whose blueprint is not registered here; any makes the change refused. */
  unknown: string[];
}

/**
 * What changing the ground to `next` would do to the placed structures,
 * without changing anything: a fresh fitGround of each on its dense footprint
 * (checkTerrainChange). `current` feeds the reported change of each seat.
 */
export function checkGroundChange(next: HeightField, state: WorldState, registry: StructureRegistry, current?: HeightField | ReadonlyMap<string, GroundFit>): GroundChange {
  const { objects, unknown } = anchoredStructures(state, registry);
  const check = checkTerrainChange(next, objects, current);
  return { ...check, ok: check.ok && unknown.length === 0, unknown };
}
