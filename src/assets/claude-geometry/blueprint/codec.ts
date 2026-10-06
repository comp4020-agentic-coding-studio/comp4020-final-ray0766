import { canonicalize, Check, contentHash, decodeDoc, encodeDoc, FORMAT } from '../core/doc.ts';
import type { DocCodec, Result } from '../core/doc.ts';
import { UUID_PATTERN } from '../core/ids.ts';
import type { BlueprintId } from '../core/ids.ts';
import { GRID, layoutErrors } from './model.ts';
import type { Blueprint, BlueprintGroup, PartPlacement, Rot } from './model.ts';
import { PART_IDS } from './parts/catalogue.ts';

// Versioned JSON for blueprints (planet-modules/blueprint v1) and for an
// exported library of them (planet-modules/blueprint-library v1).
//
// Output is canonical: parts sorted by instance number, groups by name with
// sorted members, keys sorted by canonicalJson. A blueprint's identity on a
// planet is the SHA-256 of {format, version, parts}; its id, name and groups
// are left out, so renaming or regrouping never creates a new structure and
// editing parts always does.

export const BLUEPRINT_VERSION = 1;
export const NAME_MAX = 60;
export const GROUP_NAME_MAX = 40;
export const LIBRARY_MAX = 200;

const PART_FIELDS = ['n', 'part', 'x', 'level', 'z', 'rot'] as const;

/** Parts in canonical order, with exactly the saved fields. */
export function canonicalParts(parts: readonly PartPlacement[]): PartPlacement[] {
  return [...parts].sort((a, b) => a.n - b.n).map(p => ({ n: p.n, part: p.part, x: p.x, level: p.level, z: p.z, rot: p.rot }));
}
export function canonicalGroups(groups: readonly BlueprintGroup[]): BlueprintGroup[] {
  return [...groups].map(g => ({ name: g.name, members: [...g.members].sort((a, b) => a - b) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.members[0] - b.members[0]));
}

function writeBlueprint(bp: Blueprint): Record<string, unknown> {
  return { id: bp.id, name: bp.name, parts: canonicalParts(bp.parts), groups: canonicalGroups(bp.groups) };
}

/** Read one blueprint payload (no format/version) at `path`; every problem is reported with its path. */
export function readBlueprint(raw: unknown, check: Check, path = '$'): Blueprint {
  const o = check.obj(raw, path, ['id', 'name', 'parts', 'groups']);
  const id = check.str(o.id, `${path}.id`, { pattern: UUID_PATTERN }) as BlueprintId;
  const name = check.str(o.name, `${path}.name`, { min: 1, max: NAME_MAX });
  if (typeof o.name === 'string' && o.name.trim() !== o.name) check.problem(`${path}.name`, 'must not start or end with spaces');
  const parts: PartPlacement[] = [];
  /** Indices of parts whose values all read; an unexpected extra field does not count against a part. */
  const readable: number[] = [];
  const numbers = new Set<number>();
  check.arr(o.parts, `${path}.parts`, { max: GRID.maxParts }).forEach((rawPart, i) => {
    const at = `${path}.parts[${i}]`;
    const p = check.obj(rawPart, at, PART_FIELDS);
    const mark = check.errors.length;
    const n = check.num(p.n, `${at}.n`, { min: 1, max: 99_999, int: true });
    if (numbers.has(n)) check.problem(`${at}.n`, `instance number ${n} is used twice`);
    numbers.add(n);
    parts.push({
      n,
      part: check.oneOf(p.part, `${at}.part`, PART_IDS),
      x: check.num(p.x, `${at}.x`, { min: 0, max: GRID.cells - 1, int: true }),
      level: check.num(p.level, `${at}.level`, { min: 0, max: GRID.levels - 1, int: true }),
      z: check.num(p.z, `${at}.z`, { min: 0, max: GRID.cells - 1, int: true }),
      rot: check.num(p.rot, `${at}.rot`, { min: 0, max: 3, int: true }) as Rot,
    });
    if (check.errors.length === mark) readable.push(i);
  });
  // The layout rules judge the parts that read, so a malformed part does not hide
  // an overlap, support or budget problem elsewhere; messages judged without the
  // unreadable parts say so (layoutErrors).
  for (const e of layoutErrors(readable.map(i => parts[i]), `${path}.parts`, { indices: readable, leftOut: parts.length - readable.length })) check.errors.push(e);
  const groups: BlueprintGroup[] = [];
  const grouped = new Map<number, string>();
  const names = new Set<string>();
  check.arr(o.groups, `${path}.groups`, { max: GRID.maxParts }).forEach((rawGroup, i) => {
    const at = `${path}.groups[${i}]`;
    const g = check.obj(rawGroup, at, ['name', 'members']);
    const gname = check.str(g.name, `${at}.name`, { min: 1, max: GROUP_NAME_MAX });
    if (names.has(gname)) check.problem(`${at}.name`, `group name "${gname}" is used twice`);
    names.add(gname);
    const members: number[] = [];
    const list = check.arr(g.members, `${at}.members`, { max: GRID.maxParts });
    if (list.length < 2) check.problem(`${at}.members`, 'a group needs at least two parts');
    list.forEach((m, j) => {
      const n = check.num(m, `${at}.members[${j}]`, { min: 1, int: true });
      if (!numbers.has(n)) check.problem(`${at}.members[${j}]`, `no part #${n} in this blueprint`);
      else if (members.includes(n)) check.problem(`${at}.members[${j}]`, `part #${n} is listed twice`);
      else if (grouped.has(n)) check.problem(`${at}.members[${j}]`, `part #${n} is already in group "${grouped.get(n)}"`);
      else { members.push(n); grouped.set(n, gname); }
    });
    groups.push({ name: gname, members });
  });
  return { id, name, parts: canonicalParts(parts), groups: canonicalGroups(groups) };
}

export const blueprintCodec: DocCodec<Blueprint> = {
  format: FORMAT.blueprint,
  current: BLUEPRINT_VERSION,
  read: (raw, check) => readBlueprint(raw, check, '$'),
  write: writeBlueprint,
};

export interface BlueprintLibraryDoc { blueprints: Blueprint[] }
export const libraryCodec: DocCodec<BlueprintLibraryDoc> = {
  format: FORMAT.blueprintLibrary,
  current: 1,
  read(raw, check) {
    const o = check.obj(raw, '$', ['blueprints']);
    const ids = new Set<string>();
    const blueprints = check.arr(o.blueprints, '$.blueprints', { max: LIBRARY_MAX }).map((b, i) => {
      const bp = readBlueprint(b, check, `$.blueprints[${i}]`);
      if (ids.has(bp.id)) check.problem(`$.blueprints[${i}].id`, 'this id appears twice in the library');
      ids.add(bp.id);
      return bp;
    });
    return { blueprints };
  },
  write: lib => ({ blueprints: lib.blueprints.map(writeBlueprint) }),
};

/** A stored library read entry by entry: what loaded, and every entry left out with its problems. */
export interface StoredLibrary { blueprints: Blueprint[]; skipped: { index: number; errors: string[] }[] }

/**
 * Read a library back from browser storage. Imports use decodeLibrary and are
 * all or nothing; here each blueprint is judged on its own, so one that no
 * longer passes the rules (a part grew past its budget, a rule changed, the
 * text was edited by hand) is reported with its JSON path and left out while
 * the others still load. Entries past LIBRARY_MAX are left out the same way.
 * Only a broken container (not JSON, another format, a newer version) fails.
 */
export function decodeStoredLibrary(input: unknown): Result<StoredLibrary> {
  const codec: DocCodec<StoredLibrary> = {
    format: FORMAT.blueprintLibrary,
    current: libraryCodec.current,
    read(raw, check) {
      const o = check.obj(raw, '$', ['blueprints']);
      const ids = new Set<string>();
      const blueprints: Blueprint[] = [];
      const skipped: StoredLibrary['skipped'] = [];
      check.arr(o.blueprints, '$.blueprints').forEach((entry, i) => {
        const one = new Check();
        const bp = readBlueprint(entry, one, `$.blueprints[${i}]`);
        if (!one.errors.length && ids.has(bp.id)) one.problem(`$.blueprints[${i}].id`, 'this id appears twice in the library');
        if (!one.errors.length && blueprints.length >= LIBRARY_MAX) one.problem(`$.blueprints[${i}]`, `the library keeps at most ${LIBRARY_MAX} blueprints`);
        if (one.errors.length) { skipped.push({ index: i, errors: one.errors }); return; }
        ids.add(bp.id);
        blueprints.push(bp);
      });
      return { blueprints, skipped };
    },
    write: lib => libraryCodec.write({ blueprints: lib.blueprints }),
  };
  return decodeDoc(codec, input);
}

export const encodeBlueprint = (bp: Blueprint, pretty = false) => encodeDoc(blueprintCodec, bp, pretty);
export const decodeBlueprint = (input: unknown): Result<Blueprint> => decodeDoc(blueprintCodec, input);
export const encodeLibrary = (blueprints: Blueprint[], pretty = false) => encodeDoc(libraryCodec, { blueprints }, pretty);
export const decodeLibrary = (input: unknown): Result<BlueprintLibraryDoc> => decodeDoc(libraryCodec, input);

/** The content that identifies a placed structure: format, version and parts only. */
export const hashInput = (parts: readonly PartPlacement[]) => canonicalize({ format: FORMAT.blueprint, version: BLUEPRINT_VERSION, parts: canonicalParts(parts) });
export const blueprintHash = (bp: Pick<Blueprint, 'parts'>): Promise<string> => contentHash(hashInput(bp.parts));
