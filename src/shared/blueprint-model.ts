import { hostSecondCell, hostSideCells, isHostPartId, isWideDoorPartId, isWideEntryPartId, PARTS } from './blueprint-parts.ts';
import type { PartId } from './blueprint-parts.ts';
import * as legacy from '../assets/claude-geometry/blueprint/model.ts';
import { wideDoorClearanceIssues } from './blueprint-wide-door-clearance.ts';
export * from '../assets/claude-geometry/blueprint/model.ts';
export { wideDoorClearanceIssues } from './blueprint-wide-door-clearance.ts';
export interface PartPlacement extends Omit<legacy.PartPlacement, 'part'> { part: PartId }
export interface Blueprint extends Omit<legacy.Blueprint, 'parts'> { parts: PartPlacement[] }
export interface Blocker extends Omit<legacy.Blocker, 'part'> { part: PartPlacement }
export const toVendorPart = (part: PartPlacement) => part as legacy.PartPlacement;
export const toVendorParts = (parts: readonly PartPlacement[]) => parts as readonly legacy.PartPlacement[];
export const toVendorBlueprint = (blueprint: Blueprint) => blueprint as legacy.Blueprint;

/** Further cells along local +X (wide doors/steps, the teleport portal) or behind along local −Z (long
 * roofs and their verges). Proxies are confined to rule evaluation:
 * never in documents, geometry, counts, budgets, hashes or saved groups. */
function ruleParts(part: PartPlacement): legacy.PartPlacement[] {
  const second = hostSecondCell(part.part);
  if (!second) return [toVendorPart(part)];
  const [dx, dz] = legacy.rotDir(part.rot + (second === 'side' ? 1 : 2)), cells = second === 'side' ? hostSideCells(part.part) : 2;
  return [toVendorPart(part), ...Array.from({ length: cells - 1 }, (_, i) => ({ ...toVendorPart(part), n: -part.n, x: part.x + dx * (i + 1), z: part.z + dz * (i + 1) }))];
}
const projected = (parts: readonly PartPlacement[]) => parts.flatMap(ruleParts);
const owner = (parts: readonly PartPlacement[], proxy: legacy.PartPlacement) => parts.find(p => p.n === Math.abs(proxy.n))!;
const hasWide = (parts: readonly PartPlacement[]) => parts.some(p => isHostPartId(p.part));
export function slotsOf(p: PartPlacement): legacy.Slots {
  const proxies = ruleParts(p), all = proxies.map(legacy.slotsOf), first = all[0];
  if (all.length === 1) return first;
  const second = proxies[1];
  return { ...first, occupies: [...new Set(all.flatMap(s => s.occupies))],
    keepsClear: [...all.flatMap(s => s.keepsClear), ...(isWideDoorPartId(p.part) ? [{ key: `side ${second.x},${second.z} ${(p.rot + 1) % 4} L${p.level}`, its: 'the swing of its right leaf', own: 'the swing of this right leaf' }] : [])],
    edgeRules: all.flatMap(s => s.edgeRules),
    cells: all.flatMap(s => s.cells), outside: all.find(s => s.outside)?.outside ?? null };
}
export const partTransform = (p: PartPlacement, pivot: Parameters<typeof legacy.partTransform>[1]) => legacy.partTransform(toVendorPart(p), pivot);
export const partName = (p: Pick<PartPlacement, 'part' | 'n'>) => legacy.partName(p as Pick<legacy.PartPlacement, 'part' | 'n'>);
export const pivotOf = (p: readonly PartPlacement[]) => legacy.pivotOf(projected(p));
export const groundCells = (p: readonly PartPlacement[]) => legacy.groundCells(projected(p));
export const footprintCells = (p: readonly PartPlacement[]) => legacy.footprintCells(projected(p));
export const blueprintFootprint = (p: readonly PartPlacement[]) => legacy.blueprintFootprint(projected(p));
export const blueprintGroundFootprint = (p: readonly PartPlacement[], step?: number) => legacy.blueprintGroundFootprint(projected(p), step);
export const blueprintCovers = (p: readonly PartPlacement[]) => legacy.blueprintCovers(projected(p));
export const blueprintTriangles = (p: readonly PartPlacement[], lod: Parameters<typeof legacy.blueprintTriangles>[1]) => legacy.blueprintTriangles(toVendorParts(p), lod);
export const budgetProblem = (p: readonly PartPlacement[]) => legacy.budgetProblem(toVendorParts(p));

export class Layout {
  private source: legacy.Layout;
  readonly parts: readonly PartPlacement[];
  constructor(parts: readonly PartPlacement[]) { this.parts = parts; this.source = new legacy.Layout(projected(parts)); }
  at(key: string): PartPlacement | undefined { const p = this.source.at(key); return p ? owner(this.parts, p) : undefined; }
  blocker(p: PartPlacement, ignore: ReadonlySet<number> = new Set()): Blocker | null {
    const omit = new Set([...ignore].flatMap(n => [n, -n])); omit.add(p.n); omit.add(-p.n);
    for (const proxy of ruleParts(p)) {
      const b = this.source.blocker(proxy, omit);
      if (b) return { part: owner(this.parts, b.part), why: b.why };
    }
    const rest = this.parts.filter(o => o.n !== p.n && !ignore.has(o.n));
    for (const other of rest) if (isWideDoorPartId(p.part) || isWideDoorPartId(other.part)) {
      const a = slotsOf(p), b = slotsOf(other);
      if (a.keepsClear.some(c => b.occupies.includes(c.key)) || b.keepsClear.some(c => a.occupies.includes(c.key)))
        return { part: other, why: 'both inward door leaf swings must stay clear' };
    }
    // Only clashes involving this candidate can block it. Existing unsupported
    // or overlapping drafts remain inspectable and removable in the editor.
    const clash = wideDoorClearanceIssues([...rest, p]).find(i => i.n === p.n || i.blocker === p.n);
    if (clash) return { part: rest.find(o => o.n === (clash.n === p.n ? clash.blocker : clash.n))!, why: 'both inward door leaf swings must stay clear' };
    return null;
  }
  supportProblem(p: PartPlacement): string | null {
    if (isWideEntryPartId(p.part)) return ruleParts(p).every(proxy => !this.source.supportProblem(proxy)) ? null : 'Wide entrance steps need a ground-floor deck behind both cells.';
    if (hostSecondCell(p.part) === 'back' || (hostSecondCell(p.part) === 'side' && PARTS[p.part].role === 'equipment')) {
      const problem = ruleParts(p).map(proxy => this.source.supportProblem(proxy)).find(Boolean);
      return problem ? `${problem.replace(/\.$/, '')} (every cell of this multi-cell part).` : null;
    }
    if (isWideDoorPartId(p.part)) {
      const floors = ruleParts(p).every(cell => {
        const floor = this.at(`deck ${cell.x},${cell.z} L${cell.level}`);
        return floor && PARTS[floor.part].role === 'deck' && PARTS[floor.part].floor;
      });
      return floors ? null : 'A wide double door needs a floor under both of its cells.';
    }
    return this.source.supportProblem(toVendorPart(p));
  }
}
export function supportIssues(parts: readonly PartPlacement[]) {
  if (!hasWide(parts)) return legacy.supportIssues(toVendorParts(parts));
  const layout = new Layout(parts);
  return [...parts].sort((a, b) => a.n - b.n).flatMap(p => {
    const m = layout.supportProblem(p);
    return m ? [{ n: p.n, message: `${partName(p)} (cell ${p.x},${p.z}, level ${p.level}): ${m}` }] : [];
  });
}
export const overlapMessage = (b: Blocker) => `Overlaps ${partName(b.part)}${b.why ? ` (${b.why})` : ''}.`;
export function placementProblem(parts: readonly PartPlacement[], p: PartPlacement, ignore: ReadonlySet<number> = new Set()): legacy.Problem | null {
  if (!hasWide([...parts, p])) return legacy.placementProblem(toVendorParts(parts), toVendorPart(p), ignore);
  const s = slotsOf(p); if (s.outside) return { kind: 'bounds', message: s.outside };
  const rest = parts.filter(o => o.n !== p.n && !ignore.has(o.n)), layout = new Layout(rest), blocker = layout.blocker(p);
  if (blocker) return { kind: 'overlap', message: overlapMessage(blocker), blocker: blocker.part.n };
  const support = layout.supportProblem(p); if (support) return { kind: 'support', message: support };
  if (rest.length + 1 > legacy.GRID.maxParts) return { kind: 'limit', message: `A blueprint holds at most ${legacy.GRID.maxParts} parts.` };
  const budget = budgetProblem([...rest, p]); return budget ? { kind: 'budget', message: budget } : null;
}
export function layoutErrors(parts: readonly PartPlacement[], path = '$.parts', options: { indices?: readonly number[]; leftOut?: number } = {}): string[] {
  if (!hasWide(parts)) return legacy.layoutErrors(toVendorParts(parts), path, options);
  const at = (k: number) => `${path}[${options.indices?.[k] ?? k}]`, errors: string[] = [], seen: PartPlacement[] = [], kept: { p: PartPlacement; k: number }[] = [];
  parts.forEach((p, k) => {
    const s = slotsOf(p); if (s.outside) { errors.push(`${at(k)}: ${s.outside}`); return; }
    const blocker = new Layout(seen).blocker(p);
    if (blocker) errors.push(`${at(k)}: ${partName(p)} overlaps ${partName(blocker.part)}${blocker.why ? ` (${blocker.why})` : ''}.`);
    else kept.push({ p, k }); seen.push(p);
  });
  const refused = (options.leftOut ?? 0) + parts.length - kept.length;
  const layout = new Layout(kept.map(x => x.p));
  for (const { p, k } of kept) {
    const m = layout.supportProblem(p);
    if (m) errors.push(`${at(k)}: ${partName(p)}: ${refused ? `${m.replace(/\.$/, '')} (judged without the ${refused} part${refused === 1 ? '' : 's'} refused above).` : m}`);
  }
  if (parts.length + (options.leftOut ?? 0) > legacy.GRID.maxParts) errors.push(`${path}: at most ${legacy.GRID.maxParts} parts`);
  const budget = budgetProblem(kept.map(x => x.p)); if (budget) errors.push(`${path}: ${budget}`);
  return errors;
}
