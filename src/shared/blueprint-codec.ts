import { isHostPartId, PART_IDS } from './blueprint-parts.ts';
import { GRID, layoutErrors, toVendorBlueprint, toVendorParts } from './blueprint-model.ts';
import type { Blueprint, BlueprintGroup, PartPlacement, Rot } from './blueprint-model.ts';
import * as legacy from '../assets/claude-geometry/blueprint/codec.ts';
import { decodeDoc, encodeDoc } from '../assets/claude-geometry/core/doc.ts';
import type { Check, DocCodec, Result } from '../assets/claude-geometry/core/doc.ts';
import { UUID_PATTERN } from '../assets/claude-geometry/core/ids.ts';
import type { BlueprintId } from '../assets/claude-geometry/core/ids.ts';
export { BLUEPRINT_VERSION, NAME_MAX, GROUP_NAME_MAX, LIBRARY_MAX, canonicalGroups } from '../assets/claude-geometry/blueprint/codec.ts';
export const canonicalParts = (p: readonly PartPlacement[]): PartPlacement[] => legacy.canonicalParts(toVendorParts(p));
export function readBlueprint(raw: unknown, check: Check, path = '$'): Blueprint {
  const hasHostPart = raw && typeof raw === 'object' && 'parts' in raw && Array.isArray(raw.parts) && raw.parts.some(p => p && typeof p === 'object' && isHostPartId(p.part));
  // Keep the original parser and diagnostic behavior exactly for old plans.
  if (!hasHostPart) return legacy.readBlueprint(raw, check, path);
  // Same strict v1 field contract, then the extended model. The original
  // parser's lexical single-edge layout check cannot validate two-edge support.
  const o = check.obj(raw, path, ['id', 'name', 'parts', 'groups']);
  const id = check.str(o.id, `${path}.id`, { pattern: UUID_PATTERN }) as BlueprintId;
  const name = check.str(o.name, `${path}.name`, { min: 1, max: legacy.NAME_MAX });
  if (typeof o.name === 'string' && o.name.trim() !== o.name) check.problem(`${path}.name`, 'must not start or end with spaces');
  const parts: PartPlacement[] = [], readable: number[] = [], numbers = new Set<number>();
  check.arr(o.parts, `${path}.parts`, { max: GRID.maxParts }).forEach((rawPart, i) => {
    const at = `${path}.parts[${i}]`, p = check.obj(rawPart, at, ['n', 'part', 'x', 'level', 'z', 'rot']), mark = check.errors.length;
    const n = check.num(p.n, `${at}.n`, { min: 1, max: 99_999, int: true });
    if (numbers.has(n)) check.problem(`${at}.n`, `instance number ${n} is used twice`); numbers.add(n);
    parts.push({ n, part: check.oneOf(p.part, `${at}.part`, PART_IDS),
      x: check.num(p.x, `${at}.x`, { min: 0, max: GRID.cells - 1, int: true }),
      level: check.num(p.level, `${at}.level`, { min: 0, max: GRID.levels - 1, int: true }),
      z: check.num(p.z, `${at}.z`, { min: 0, max: GRID.cells - 1, int: true }),
      rot: check.num(p.rot, `${at}.rot`, { min: 0, max: 3, int: true }) as Rot });
    if (check.errors.length === mark) readable.push(i);
  });
  check.errors.push(...layoutErrors(readable.map(i => parts[i]), `${path}.parts`, { indices: readable, leftOut: parts.length - readable.length }));
  const groups: BlueprintGroup[] = [], grouped = new Map<number, string>(), names = new Set<string>();
  check.arr(o.groups, `${path}.groups`, { max: GRID.maxParts }).forEach((rawGroup, i) => {
    const at = `${path}.groups[${i}]`, g = check.obj(rawGroup, at, ['name', 'members']);
    const gname = check.str(g.name, `${at}.name`, { min: 1, max: legacy.GROUP_NAME_MAX });
    if (names.has(gname)) check.problem(`${at}.name`, `group name "${gname}" is used twice`); names.add(gname);
    const members: number[] = [], list = check.arr(g.members, `${at}.members`, { max: GRID.maxParts });
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
  return { id, name, parts: canonicalParts(parts), groups: legacy.canonicalGroups(groups) };
}
export const blueprintCodec: DocCodec<Blueprint> = { ...legacy.blueprintCodec, read: readBlueprint, write: bp => legacy.blueprintCodec.write(toVendorBlueprint(bp)) };
export const encodeBlueprint = (bp: Blueprint, pretty = false) => encodeDoc(blueprintCodec, bp, pretty);
export const decodeBlueprint = (input: unknown): Result<Blueprint> => decodeDoc(blueprintCodec, input);
export const hashInput = (p: readonly PartPlacement[]) => legacy.hashInput(toVendorParts(p));
export const blueprintHash = (bp: Pick<Blueprint, 'parts'>) => legacy.blueprintHash({ parts: toVendorParts(bp.parts) as legacy.BlueprintLibraryDoc['blueprints'][number]['parts'] });
