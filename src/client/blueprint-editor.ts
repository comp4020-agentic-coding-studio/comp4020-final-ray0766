import { BlueprintEditor as VendorEditor } from '../assets/claude-geometry/blueprint/editor.ts';
import type { EditResult } from '../assets/claude-geometry/blueprint/editor.ts';
import type { Blueprint as VendorBlueprint, PartPlacement as VendorPart } from '../assets/claude-geometry/blueprint/model.ts';
import { budgetProblem, layoutErrors, Layout, overlapMessage, partName, placementProblem, slotsOf, supportIssues } from '../shared/blueprint-model.ts';
import type { Blueprint, BlueprintGroup, PartPlacement, Problem, Rot } from '../shared/blueprint-model.ts';
import { isDoorPartId, isHostPartId, partLabel } from '../shared/blueprint-parts.ts';
import type { PartId } from '../shared/blueprint-parts.ts';

type HostDoc = { parts: PartPlacement[]; groups: BlueprintGroup[]; nextN: number };
/** The only access to the pinned source editor's internal command API. The
 * source owns cloning, undo/redo, dirty state, selection pruning and listeners.
 * No alternate document or history is retained by this adapter. */
function commandBridge(editor: VendorEditor) {
  const source = editor as unknown as { doc: HostDoc; commit(kind: 'add' | 'move' | 'rotate', label: string, after: HostDoc): void };
  if (typeof source.commit !== 'function' || !Array.isArray(source.doc?.parts) || !Number.isSafeInteger(source.doc.nextN))
    throw new Error('Blueprint editor command contract changed.');
  return { document: source.doc, commit: (kind: 'add' | 'move' | 'rotate', label: string, after: HostDoc) => {
    if (after.parts.some(p => p.n <= 0)) throw new Error('Rule proxies cannot enter the editor document.');
    source.commit(kind, label, after);
  } };
}
const hasWide = (parts: readonly PartPlacement[]) => parts.some(p => isHostPartId(p.part));

/** A command-admission boundary around the original editor. Accepted changes,
 * groups and undo/redo are still executed and recorded by that editor. Only
 * commands whose document contains host parts need the extended model. */
class ExtendedEditor extends VendorEditor {
  override load(bp: VendorBlueprint) {
    const issue = hasWide(bp.parts) ? layoutErrors(bp.parts)[0] : null;
    if (issue) throw new Error(issue);
    super.load(bp);
  }
  override placeProblem(draft: Omit<VendorPart, 'n'>): Problem | null {
    return placementProblem(this.parts, { ...draft, n: commandBridge(this).document.nextN });
  }
  override add(draft: Omit<VendorPart, 'n'>): EditResult {
    if (!hasWide(this.parts) && !isHostPartId(draft.part)) return super.add(draft);
    const problem = this.placeProblem(draft);
    if (problem) return { ok: false, message: problem.message, problem };
    const bridge = commandBridge(this), part = { ...draft, n: bridge.document.nextN }, label = `Add ${partName(part)}`;
    bridge.commit('add', label, { parts: [...bridge.document.parts, part], groups: bridge.document.groups, nextN: part.n + 1 });
    return { ok: true, message: `${label} at cell ${part.x},${part.z}, level ${part.level}.` };
  }
  override issues() { return supportIssues(this.parts); }
  override saveProblem() { return super.saveProblem() ?? (hasWide(this.parts) ? layoutErrors(this.parts)[0] ?? null : null); }
  replaceDoor(n: number, part: PartId): EditResult {
    const current = this.part(n);
    if (!current || !isDoorPartId(current.part) || !isDoorPartId(part)) return { ok: false, message: 'Select one existing door and choose a door tool.' };
    if (current.part === part) return { ok: true, message: 'This door already uses the selected type.' };
    const replacement: PartPlacement = { ...current, part }, next = this.parts.map(p => p.n === n ? replacement : p);
    const problem = placementProblem(this.parts, replacement);
    if (problem) return { ok: false, message: problem.message, problem };
    const unsupported = supportIssues(next)[0];
    if (unsupported) return { ok: false, message: unsupported.message, problem: { kind: 'support', message: unsupported.message } };
    const error = layoutErrors(next)[0];
    if (error) return { ok: false, message: error, problem: { kind: 'overlap', message: error } };
    const label = `Replace ${partName(current)} with ${partLabel(part, 'village')}`, bridge = commandBridge(this);
    // A replacement is stored as one source transform command. Its before/after
    // documents and label carry the exact change; no second history is created.
    bridge.commit('move', label, { ...bridge.document, parts: next });
    return { ok: true, message: `${label}.` };
  }
  private transform(kind: 'move' | 'rotate', label: string, change: (p: PartPlacement) => PartPlacement): EditResult {
    if (!this.selection.size) return { ok: false, message: 'Select parts first.' };
    const moved = this.parts.filter(p => this.selection.has(p.n)).map(change);
    const refuse = (problem: Problem): EditResult => ({ ok: false, message: `${label} refused: ${problem.message}`, problem });
    for (const part of moved) { const outside = slotsOf(part).outside; if (outside) return refuse({ kind: 'bounds', message: outside }); }
    const next = [...this.parts.filter(p => !this.selection.has(p.n)), ...moved];
    for (const part of moved) {
      const blocker = new Layout(next.filter(p => p.n !== part.n)).blocker(part);
      if (blocker) return refuse({ kind: 'overlap', message: overlapMessage(blocker), blocker: blocker.part.n });
    }
    const unsupported = new Set(this.issues().map(i => i.n));
    const lost = supportIssues(next).find(i => !unsupported.has(i.n));
    if (lost) return refuse({ kind: 'support', message: lost.message });
    const budget = budgetProblem(next); if (budget) return refuse({ kind: 'budget', message: budget });
    const bridge = commandBridge(this);
    bridge.commit(kind, label, { ...bridge.document, parts: next.sort((a, b) => a.n - b.n) });
    return { ok: true, message: `${label}.` };
  }
  override moveSelection(dx: number, dz: number, dLevel = 0): EditResult {
    if (!hasWide(this.parts)) return super.moveSelection(dx, dz, dLevel);
    return this.transform('move', `Move ${this.selection.size} parts`, p => ({ ...p, x: p.x + dx, z: p.z + dz, level: p.level + dLevel }));
  }
  override rotateSelection(): EditResult {
    if (!hasWide(this.parts)) return super.rotateSelection();
    const selected = this.parts.filter(p => this.selection.has(p.n));
    if (!selected.length) return { ok: false, message: 'Select parts first.' };
    // Same grid rotation convention as the source, using the actual two-cell
    // footprint when choosing its pivot. No proxy is selected or committed.
    const cells = selected.flatMap(p => slotsOf(p).cells);
    const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
    const minZ = Math.min(...cells.map(c => c[1])), maxZ = Math.max(...cells.map(c => c[1]));
    let cx = (minX + maxX + 1) / 2; const cz = (minZ + maxZ + 1) / 2;
    if ((maxX - minX - (maxZ - minZ)) % 2 !== 0) cx -= .5;
    return this.transform('rotate', `Rotate ${selected.length} parts 90°`, p => ({ ...p,
      x: Math.round(cx + p.z + .5 - cz - .5), z: Math.round(cz - (p.x + .5 - cx) - .5), rot: ((p.rot + 1) % 4) as Rot }));
  }
}
export interface BlueprintEditor extends Omit<VendorEditor, 'parts' | 'part' | 'load' | 'toBlueprint' | 'placeProblem' | 'add'> {
  readonly parts: readonly PartPlacement[];
  part(n: number): PartPlacement | undefined;
  load(bp: Blueprint): void;
  toBlueprint(): Blueprint;
  placeProblem(draft: Omit<PartPlacement, 'n'>): Problem | null;
  add(draft: Omit<PartPlacement, 'n'>): EditResult;
  replaceDoor(n: number, part: PartId): EditResult;
}
export const BlueprintEditor = ExtendedEditor as unknown as { new(): BlueprintEditor; readonly maxParts: number };
export const toVendorEditor = (editor: BlueprintEditor) => editor as unknown as VendorEditor;
