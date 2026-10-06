import type { Footprint } from '../core/ground.ts';
import type { BlueprintId } from '../core/ids.ts';
import type { Vec3 } from '../core/vec.ts';
import { BUDGET, LOD_TIERS } from '../style/lod.ts';
import type { LodTier } from '../style/lod.ts';
import { partCost, PARTS } from './parts/catalogue.ts';
import type { PartId } from './parts/catalogue.ts';
import { STOREY } from './parts/kit.ts';

// A blueprint is a list of parts on an integer grid. Every part names a cell
// (x, z), a level and a quarter turn; its mount type turns that into the slots
// it fills:
//
//   cell parts    the cell's deck (walking surface) and/or space (volume above it)
//   edge parts    one cell edge, the one the part's +Z faces from its cell
//   vertex parts  one grid vertex, the cell corner its +X+Z corner turns to
//
// Slots are named canonically, so a wall placed on the shared edge of two cells
// is the same slot whichever cell it was placed from (only its facing differs).
// Occupancy, support and bounds are checked on these slots.

export const GRID = { cells: 5, levels: 3, maxParts: 120 } as const;
export type Rot = 0 | 1 | 2 | 3;

export interface PartPlacement {
  /** Instance number, unique within the blueprint; groups and messages refer to it. */
  n: number;
  part: PartId;
  x: number;
  level: number;
  z: number;
  rot: Rot;
}
export interface BlueprintGroup { name: string; members: number[] }
export interface Blueprint { id: BlueprintId; name: string; parts: PartPlacement[]; groups: BlueprintGroup[] }

export const QUARTER = Math.PI / 2;
/** Local +Z after `rot` quarter turns about +Y, as a grid step (dx, dz). Matches three's rotation.y. */
export function rotDir(rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 0: return [0, 1];
    case 1: return [1, 0];
    case 2: return [0, -1];
    default: return [-1, 0];
  }
}
/** The local (+X, +Z) corner after `rot` quarter turns, as signs. */
function rotCorner(rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 0: return [1, 1];
    case 1: return [1, -1];
    case 2: return [-1, -1];
    default: return [-1, 1];
  }
}

export const inGrid = (x: number, z: number) => x >= 0 && z >= 0 && x < GRID.cells && z < GRID.cells;
export const inLevels = (level: number) => level >= 0 && level < GRID.levels;

const deckKey = (x: number, z: number, l: number) => `deck ${x},${z} L${l}`;
const spaceKey = (x: number, z: number, l: number) => `space ${x},${z} L${l}`;
/** Canonical edge: 'h' edges lie on z = const between x and x+1; 'v' edges on x = const. */
export function edgeKey(x: number, z: number, rot: number, level: number): string {
  const [dx, dz] = rotDir(rot);
  if (dz !== 0) return `edge h${x},${dz > 0 ? z + 1 : z} L${level}`;
  return `edge v${dx > 0 ? x + 1 : x},${z} L${level}`;
}
export function vertexOf(x: number, z: number, rot: number): [number, number] {
  const [sx, sz] = rotCorner(rot);
  return [x + (sx > 0 ? 1 : 0), z + (sz > 0 ? 1 : 0)];
}
export const vertexKey = (vx: number, vz: number, level: number) => `vertex ${vx},${vz} L${level}`;

/** Second cell of a stair (behind the first, along local −Z). */
export function stairTop(p: Pick<PartPlacement, 'x' | 'z' | 'rot'>): [number, number] {
  const [dx, dz] = rotDir(p.rot + 2);
  return [p.x + dx, p.z + dz];
}

const cellKey = (x: number, z: number, l: number) => `cell ${x},${z} L${l}`;

/** A slot a part needs left empty, and how to say so from either side. */
export interface ClearSlot { key: string; its: string; own: string }

/**
 * Conditions a part sets on the edge parts beside it (a stair's sides, its
 * landing edge and top exit, the stairwell above). Each condition matches a
 * clash found in the geometry (tests/unit/blueprint/clearance.test.ts).
 */
export interface EdgeRule {
  key: string;
  /** Where the edge is, for the refusal message. */
  place: 'stair side' | 'landing edge' | 'stairwell' | 'top exit';
  /** Cells an edge part here must not face into (its outside detail would cut into the stair). */
  faceAway: string[];
  guards: boolean;
  doors: boolean;
  /** Only a door may stand here. */
  doorOnly: boolean;
}

export interface Slots {
  /** Slots this part fills exclusively. */
  occupies: string[];
  /** Slots that must stay empty for this part (a gutter's side, a stair's foot) but that others like it may share. */
  keepsClear: ClearSlot[];
  /** Conditions this part sets on edge parts beside it. */
  edgeRules: EdgeRule[];
  /** Edge parts: their edge slot, the cell their outside (+Z) faces, and what kind of edge part they are. */
  edge: { key: string; faces: string; guard: boolean; door: boolean } | null;
  /** Cells this part stands over, for the footprint and the plinth. */
  cells: [number, number][];
  /** Why the part does not fit the build volume, if it does not. */
  outside: string | null;
}

export function slotsOf(p: PartPlacement): Slots {
  const def = PARTS[p.part];
  const { x, z, level: l, rot } = p;
  const outside = !inGrid(x, z) || !inLevels(l) ? `Outside the build volume (${GRID.cells} × ${GRID.cells} cells, levels 0–${GRID.levels - 1}).` : null;
  const plain = (occupies: string[]): Slots => ({ occupies, keepsClear: [], edgeRules: [], edge: null, cells: [[x, z]], outside });
  switch (def.role) {
    case 'deck': return plain([deckKey(x, z, l)]);
    case 'equipment': return plain([spaceKey(x, z, l)]);
    case 'wall': case 'guard': {
      const [dx, dz] = rotDir(rot);
      const key = edgeKey(x, z, rot, l);
      return { ...plain([key]), edge: { key, faces: cellKey(x + dx, z + dz, l), guard: def.role === 'guard', door: !!def.door } };
    }
    case 'column': {
      const [vx, vz] = vertexOf(x, z, rot);
      return plain([vertexKey(vx, vz, l)]);
    }
    case 'slope': {
      const [dx, dz] = rotDir(rot);
      const keepsClear: ClearSlot[] = [{ key: edgeKey(x, z, rot, l), its: 'its gutter side', own: 'this roof’s gutter side' }];
      if (inGrid(x + dx, z + dz)) keepsClear.push({ key: deckKey(x + dx, z + dz, l), its: 'its gutter side', own: 'this roof’s gutter side' });
      return { ...plain([deckKey(x, z, l), spaceKey(x, z, l)]), keepsClear };
    }
    case 'stair': {
      // Bottom cell (x, z), top cell (x2, z2) behind it; the foot faces local +Z, the landing edge local −Z.
      const [x2, z2] = stairTop(p);
      const occupies = [spaceKey(x, z, l), spaceKey(x2, z2, l), edgeKey(x, z, rot + 2, l), deckKey(x, z, l + 1), deckKey(x2, z2, l + 1)];
      const keepsClear: ClearSlot[] = [{ key: edgeKey(x, z, rot, l), its: 'its foot', own: 'this stair’s foot' }];
      const here = [cellKey(x, z, l), cellKey(x2, z2, l)];
      const rule = (key: string, place: EdgeRule['place'], faceAway: string[], guards: boolean, doorOnly = false): EdgeRule => ({ key, place, faceAway, guards, doors: doorOnly, doorOnly });
      const edgeRules: EdgeRule[] = [];
      for (const [cx, cz] of [[x, z], [x2, z2]]) for (const side of [1, 3]) edgeRules.push(rule(edgeKey(cx, cz, rot + side, l), 'stair side', here, false));
      edgeRules.push(rule(edgeKey(x2, z2, rot + 2, l), 'landing edge', [], true));
      // Near the top the handrails rise into the level above.
      for (const side of [1, 3]) edgeRules.push(rule(edgeKey(x2, z2, rot + side, l + 1), 'stairwell', [cellKey(x2, z2, l + 1)], true));
      edgeRules.push(rule(edgeKey(x2, z2, rot + 2, l + 1), 'top exit', [], false, true));
      const why = outside ?? (!inGrid(x2, z2) ? 'The stair runs out of the build area; turn it or move it inwards.'
        : !inLevels(l + 1) ? `A stair needs a level above it; level ${GRID.levels - 1} is the top.` : null);
      return { occupies, keepsClear, edgeRules, edge: null, cells: [[x, z], [x2, z2]], outside: why };
    }
  }
}

/** Why edge part `e` may not stand where `rule` applies, or null. */
function breaks(rule: EdgeRule, e: NonNullable<Slots['edge']>): string | null {
  if (rule.doorOnly) return e.door ? null : 'its top exit must stay clear; only a door may stand there';
  if (e.door && !rule.doors) {
    return rule.place === 'stair side' ? 'a door cannot open onto the side of a stair'
      : rule.place === 'stairwell' ? 'a door cannot open into a stairwell' : 'a door cannot open under the top of a stair';
  }
  if (e.guard && !rule.guards) return 'a stair has its own handrails; no railing or parapet along its sides';
  if (e.guard || !rule.faceAway.includes(e.faces)) return null;
  return rule.place === 'stairwell' ? 'walls round a stairwell must face away from it, or their sills and kick plates hit the handrails'
    : 'walls beside a stair must face away from it, or their sills, hoods and conduits cut into it';
}

export const partName = (p: Pick<PartPlacement, 'part' | 'n'>) => `${PARTS[p.part].label} #${p.n}`;

/** What stops a part from going in: the part in the way and, when it is not plain overlap, why. */
export interface Blocker { part: PartPlacement; why: string }
export const overlapMessage = (b: Blocker) => `Overlaps ${partName(b.part)}${b.why ? ` (${b.why})` : ''}.`;

/** Indexed view of a part list for occupancy and support queries. */
export class Layout {
  readonly parts: readonly PartPlacement[];
  private occupied = new Map<string, PartPlacement>();
  private clear = new Map<string, { part: PartPlacement; slot: ClearSlot }[]>();
  private rules = new Map<string, { part: PartPlacement; rule: EdgeRule }[]>();
  constructor(parts: readonly PartPlacement[]) {
    this.parts = parts;
    for (const p of parts) {
      const s = slotsOf(p);
      for (const k of s.occupies) if (!this.occupied.has(k)) this.occupied.set(k, p);
      for (const slot of s.keepsClear) this.clear.set(slot.key, [...(this.clear.get(slot.key) ?? []), { part: p, slot }]);
      for (const rule of s.edgeRules) this.rules.set(rule.key, [...(this.rules.get(rule.key) ?? []), { part: p, rule }]);
    }
  }
  at(key: string): PartPlacement | undefined { return this.occupied.get(key); }

  /** First part that blocks `p`, ignoring parts in `ignore` (and `p` itself by number). */
  blocker(p: PartPlacement, ignore: ReadonlySet<number> = new Set()): Blocker | null {
    const skip = (o: PartPlacement | undefined) => !o || o.n === p.n || ignore.has(o.n);
    const s = slotsOf(p);
    for (const k of s.occupies) {
      const o = this.occupied.get(k);
      if (!skip(o)) return { part: o!, why: '' };
      for (const c of this.clear.get(k) ?? []) if (!skip(c.part)) return { part: c.part, why: `${c.slot.its} must stay clear` };
    }
    for (const c of s.keepsClear) {
      const o = this.occupied.get(c.key);
      if (!skip(o)) return { part: o!, why: `${c.own} must stay clear` };
    }
    if (s.edge) {
      for (const r of this.rules.get(s.edge.key) ?? []) {
        const why = skip(r.part) ? null : breaks(r.rule, s.edge);
        if (why) return { part: r.part, why };
      }
    }
    for (const rule of s.edgeRules) {
      const o = this.occupied.get(rule.key);
      const e = o && !skip(o) ? slotsOf(o).edge : null;
      const why = e ? breaks(rule, e) : null;
      if (why) return { part: o!, why };
    }
    return null;
  }

  private floorAt(x: number, z: number, l: number) {
    const o = inGrid(x, z) && inLevels(l) ? this.occupied.get(deckKey(x, z, l)) : undefined;
    return !!o && !!PARTS[o.part].floor && PARTS[o.part].role === 'deck';
  }
  private wallAt(key: string) { const o = this.occupied.get(key); return !!o && PARTS[o.part].role === 'wall'; }
  private columnAt(key: string) { const o = this.occupied.get(key); return !!o && PARTS[o.part].role === 'column'; }
  /** A wall under one of the cell's edges or a column under one of its corners, one level down. */
  private carried(x: number, z: number, l: number) {
    if (l <= 0) return false;
    for (let r = 0; r < 4; r++) {
      if (this.wallAt(edgeKey(x, z, r, l - 1))) return true;
      const [vx, vz] = vertexOf(x, z, r);
      if (this.columnAt(vertexKey(vx, vz, l - 1))) return true;
    }
    return false;
  }

  /** Why `p` would not be supported in this layout, or null. Uses the layout as it stands. */
  supportProblem(p: PartPlacement): string | null {
    const def = PARTS[p.part];
    const { x, z, level: l, rot } = p;
    switch (def.role) {
      case 'deck': case 'slope':
        if (l === 0 && !def.roof) return null;
        return this.carried(x, z, l) ? null : `${def.roof ? 'A roof' : 'An upper floor'} needs a wall or column below one of its edges or corners.`;
      case 'wall': case 'guard': {
        const [dx, dz] = rotDir(rot);
        if (this.floorAt(x, z, l) || this.floorAt(x + dx, z + dz, l)) return null;
        if (l > 0 && this.wallAt(edgeKey(x, z, rot, l - 1))) return null;
        return `${def.role === 'wall' ? 'A wall' : `A ${def.label.toLowerCase()}`} needs a floor beside it or a wall below it.`;
      }
      case 'column': {
        const [vx, vz] = vertexOf(x, z, rot);
        for (const [cx, cz] of [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]]) if (this.floorAt(cx, cz, l)) return null;
        if (l > 0 && this.columnAt(vertexKey(vx, vz, l - 1))) return null;
        return 'A column needs a floor at its foot or a column below it.';
      }
      case 'stair': {
        const [x2, z2] = stairTop(p);
        return this.floorAt(x, z, l) && this.floorAt(x2, z2, l) ? null : 'A stair needs a floor under both of its cells.';
      }
      case 'equipment':
        return this.floorAt(x, z, l) ? null : `${def.id === 'roof.plant' ? 'Plant' : `A ${def.label.toLowerCase()}`} needs a floor or roof deck under it.`;
    }
  }
}

export interface Problem { kind: 'bounds' | 'overlap' | 'support' | 'limit' | 'budget'; message: string; blocker?: number }

/** Every part that is not supported, in instance order. */
export function supportIssues(parts: readonly PartPlacement[]): { n: number; message: string }[] {
  const layout = new Layout(parts);
  return [...parts].sort((a, b) => a.n - b.n).flatMap(p => {
    const m = layout.supportProblem(p);
    return m ? [{ n: p.n, message: `${partName(p)} (cell ${p.x},${p.z}, level ${p.level}): ${m}` }] : [];
  });
}

/** Footprint cells: cells under any cell part; parts on edges and vertices count their own cell only when there are none. */
export function footprintCells(parts: readonly PartPlacement[]): [number, number][] {
  const seen = new Map<string, [number, number]>();
  const cellParts = parts.filter(p => PARTS[p.part].mount === 'cell');
  for (const p of cellParts.length ? cellParts : parts) for (const c of slotsOf(p).cells) seen.set(`${c[0]},${c[1]}`, c);
  return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Cells that stand on the ground (level-0 cell parts); they get the foundation plinth. */
export function groundCells(parts: readonly PartPlacement[]): [number, number][] {
  const seen = new Map<string, [number, number]>();
  for (const p of parts) if (p.level === 0 && PARTS[p.part].mount === 'cell') for (const c of slotsOf(p).cells) seen.set(`${c[0]},${c[1]}`, c);
  return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Centre of the occupied XZ bounds, in grid metres. y = 0 is the level-0 slab top. */
export function pivotOf(parts: readonly PartPlacement[]): { x: number; z: number } {
  const cells = footprintCells(parts);
  if (!cells.length) return { x: GRID.cells / 2, z: GRID.cells / 2 };
  const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]);
  return { x: (Math.min(...xs) + Math.max(...xs) + 1) / 2, z: (Math.min(...zs) + Math.max(...zs) + 1) / 2 };
}

/** Where a part's local origin sits relative to a pivot, and its yaw. */
export function partTransform(p: PartPlacement, pivot: { x: number; z: number }): { position: Vec3; yaw: number } {
  let ox = 0, oz = 0;
  const mount = PARTS[p.part].mount;
  if (mount === 'edge') { const [dx, dz] = rotDir(p.rot); ox = dx / 2; oz = dz / 2; }
  if (mount === 'vertex') { const [sx, sz] = rotCorner(p.rot); ox = sx / 2; oz = sz / 2; }
  return { position: [p.x + 0.5 + ox - pivot.x, p.level * STOREY, p.z + 0.5 + oz - pivot.z], yaw: p.rot * QUARTER };
}

/** Margin added to the footprint radius for gutters, copings and wall skins past the cell lines. */
export const FOOTPRINT_MARGIN = 0.15;

/** Ground samples (cell corners and centres) relative to the pivot, for fitGround and spacing. */
export function blueprintFootprint(parts: readonly PartPlacement[]): Footprint {
  const pivot = pivotOf(parts);
  const seen = new Map<string, [number, number]>();
  for (const [x, z] of footprintCells(parts)) {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      const s: [number, number] = [x + u - pivot.x, z + v - pivot.z];
      seen.set(`${s[0]},${s[1]}`, s);
    }
  }
  const samples = [...seen.values()];
  if (!samples.length) samples.push([0, 0]);
  const radius = Math.max(...samples.map(([a, b]) => Math.hypot(a, b))) + FOOTPRINT_MARGIN;
  return { samples, radius };
}

/**
 * Spacing of the dense ground samples under a placed structure, metres: the
 * terrain module's pad spacing (PAD_SAMPLE_STEP), under half the ground-mesh
 * vertex spacing at LOD high. docs/CONTRACTS.md §5 asks for no coarser than
 * 0.25 m; blueprintFootprint keeps its corners-and-centres samples for
 * spacing and quick checks.
 */
export const BLUEPRINT_SAMPLE_STEP = 0.075;

/**
 * Ground samples for seating a structure on real terrain: every footprint
 * cell sampled on a square grid no coarser than `step` (cell edges and
 * corners included), relative to the pivot, with blueprintFootprint's radius.
 */
export function blueprintGroundFootprint(parts: readonly PartPlacement[], step = BLUEPRINT_SAMPLE_STEP): Footprint {
  const pivot = pivotOf(parts);
  const m = Math.max(1, Math.ceil(1 / step - 1e-9));
  const seen = new Map<string, [number, number]>();
  for (const [x, z] of footprintCells(parts)) {
    for (let i = 0; i <= m; i++) for (let k = 0; k <= m; k++) {
      const s: [number, number] = [x + i / m - pivot.x, z + k / m - pivot.z];
      seen.set(`${s[0].toFixed(6)},${s[1].toFixed(6)}`, s);
    }
  }
  const samples = [...seen.values()];
  if (!samples.length) samples.push([0, 0]);
  return { samples, radius: blueprintFootprint(parts).radius };
}

/** True when a pivot-relative (x, z) point lies over a footprint cell (1 mm tolerance); used to grade terrain under a structure. */
export function blueprintCovers(parts: readonly PartPlacement[]): (x: number, z: number) => boolean {
  const pivot = pivotOf(parts);
  const cells = new Set(footprintCells(parts).map(([x, z]) => `${x},${z}`));
  const e = 1e-3;
  return (x, z) => {
    const gx = x + pivot.x, gz = z + pivot.z;
    for (const cx of [Math.floor(gx - e), Math.floor(gx + e)]) for (const cz of [Math.floor(gz - e), Math.floor(gz + e)]) {
      if (cells.has(`${cx},${cz}`) && gx >= cx - e && gx <= cx + 1 + e && gz >= cz - e && gz <= cz + 1 + e) return true;
    }
    return false;
  };
}

/** Plinth triangles: one hard box per ground cell. */
export const PLINTH_TRIANGLES_PER_CELL = 12;

/** Triangles of the merged model at a tier, including the foundation plinth. */
export function blueprintTriangles(parts: readonly PartPlacement[], lod: LodTier): number {
  return parts.reduce((s, p) => s + partCost(p.part, lod).triangles, 0) + groundCells(parts).length * PLINTH_TRIANGLES_PER_CELL;
}

/** The placed-building budget a layout breaks, if any. */
export function budgetProblem(parts: readonly PartPlacement[]): string | null {
  for (const lod of LOD_TIERS) {
    const t = blueprintTriangles(parts, lod), max = BUDGET.building[lod].triangles;
    if (t > max) return `Over the placed-building budget at LOD ${lod}: ${t.toLocaleString('en')} of ${max.toLocaleString('en')} triangles.`;
  }
  return null;
}

/**
 * Whether `p` can join `parts` (ignoring the parts numbered in `ignore`, which
 * are being moved). Bounds first, then overlap naming the blocking part, then
 * support, then capacity and budget.
 */
export function placementProblem(parts: readonly PartPlacement[], p: PartPlacement, ignore: ReadonlySet<number> = new Set()): Problem | null {
  const s = slotsOf(p);
  if (s.outside) return { kind: 'bounds', message: s.outside };
  const rest = parts.filter(o => !ignore.has(o.n) && o.n !== p.n);
  const layout = new Layout(rest);
  const blocker = layout.blocker(p);
  if (blocker) return { kind: 'overlap', message: overlapMessage(blocker), blocker: blocker.part.n };
  const support = layout.supportProblem(p);
  if (support) return { kind: 'support', message: support };
  if (rest.length + 1 > GRID.maxParts) return { kind: 'limit', message: `A blueprint holds at most ${GRID.maxParts} parts.` };
  const budget = budgetProblem([...rest, p]);
  if (budget) return { kind: 'budget', message: budget };
  return null;
}

/**
 * All structural problems of a finished layout, for the codec: bounds and
 * overlaps (each part against the ones before it), then support, capacity and
 * budget. Every stage runs, so several problems show at once. Parts refused by
 * an earlier stage are left out of the later ones, and so are `leftOut` parts
 * the caller could not read at all; support messages judged without them say
 * so, because a part that stood on a refused one may be fine once it is fixed.
 * `indices` maps each part to its index in the document, for the JSON paths.
 */
export function layoutErrors(parts: readonly PartPlacement[], path = '$.parts', options: { indices?: readonly number[]; leftOut?: number } = {}): string[] {
  const at = (k: number) => `${path}[${options.indices?.[k] ?? k}]`;
  const errors: string[] = [];
  const seen: PartPlacement[] = [];
  const kept: { p: PartPlacement; k: number }[] = [];
  parts.forEach((p, k) => {
    const s = slotsOf(p);
    if (s.outside) { errors.push(`${at(k)}: ${s.outside}`); return; }
    const blocker = new Layout(seen).blocker(p);
    if (blocker) errors.push(`${at(k)}: ${partName(p)} overlaps ${partName(blocker.part)}${blocker.why ? ` (${blocker.why})` : ''}.`);
    else kept.push({ p, k });
    seen.push(p);
  });
  const refused = (options.leftOut ?? 0) + parts.length - kept.length;
  const judged = (m: string) => (refused ? `${m.replace(/\.$/, '')} (judged without the ${refused} part${refused === 1 ? '' : 's'} refused above).` : m);
  const layout = new Layout(kept.map(x => x.p));
  for (const { p, k } of kept) { const m = layout.supportProblem(p); if (m) errors.push(`${at(k)}: ${partName(p)}: ${judged(m)}`); }
  if (parts.length + (options.leftOut ?? 0) > GRID.maxParts) errors.push(`${path}: at most ${GRID.maxParts} parts`);
  // Over budget without the refused parts means over budget with them too.
  const budget = budgetProblem(kept.map(x => x.p));
  if (budget) errors.push(`${path}: ${budget}`);
  return errors;
}
