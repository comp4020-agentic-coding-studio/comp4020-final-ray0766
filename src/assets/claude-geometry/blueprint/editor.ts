import { newBlueprintId } from '../core/ids.ts';
import type { BlueprintId } from '../core/ids.ts';
import { NAME_MAX, canonicalGroups, canonicalParts } from './codec.ts';
import { budgetProblem, GRID, Layout, overlapMessage, partName, placementProblem, slotsOf, supportIssues } from './model.ts';
import type { Blueprint, BlueprintGroup, PartPlacement, Problem, Rot } from './model.ts';

// The blueprint editor without any DOM or three.js: a document, a command
// stack with undo/redo, and a selection. Every edit goes through a named
// command that records the document before and after, so undo restores exactly
// what was there (including groups dissolved as a side effect).
//
// Adding refuses anything that would not fit (bounds, overlap, support,
// capacity, budget). Moving and rotating a selection are refused as a whole if
// any part would leave the volume, overlap, or if any part that was supported
// would lose its support. Deleting is allowed even when it leaves parts
// unsupported; those show up in issues() and block saving until fixed.

export interface EditorDoc { parts: PartPlacement[]; groups: BlueprintGroup[]; nextN: number }
export type CommandKind = 'add' | 'remove' | 'move' | 'rotate' | 'group' | 'ungroup';
interface Entry { kind: CommandKind; label: string; before: EditorDoc; after: EditorDoc }
export type EditResult = { ok: true; message: string } | { ok: false; message: string; problem?: Problem };

const clone = (d: EditorDoc): EditorDoc => ({ parts: d.parts.map(p => ({ ...p })), groups: d.groups.map(g => ({ name: g.name, members: [...g.members] })), nextN: d.nextN });
const emptyDoc = (): EditorDoc => ({ parts: [], groups: [], nextN: 1 });

/** Drop missing members and dissolve groups left with fewer than two parts. */
function tidyGroups(groups: BlueprintGroup[], alive: Set<number>): BlueprintGroup[] {
  return groups.map(g => ({ name: g.name, members: g.members.filter(n => alive.has(n)) })).filter(g => g.members.length >= 2);
}

export class BlueprintEditor {
  id: BlueprintId = newBlueprintId();
  name = '';
  private doc: EditorDoc = emptyDoc();
  private done: Entry[] = [];
  private undone: Entry[] = [];
  private selected = new Set<number>();
  private listeners = new Set<() => void>();
  /** Changes since the last load or save. */
  dirty = false;

  get parts(): readonly PartPlacement[] { return this.doc.parts; }
  get groups(): readonly BlueprintGroup[] { return this.doc.groups; }
  get selection(): ReadonlySet<number> { return this.selected; }
  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  get undoLabel() { return this.done.at(-1)?.label ?? null; }
  get redoLabel() { return this.undone.at(-1)?.label ?? null; }
  part(n: number) { return this.doc.parts.find(p => p.n === n); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const fn of this.listeners) fn(); }

  /** Start over with an empty, unnamed blueprint (new id). */
  reset() {
    this.id = newBlueprintId(); this.name = ''; this.doc = emptyDoc();
    this.done = []; this.undone = []; this.selected.clear(); this.dirty = false;
    this.emit();
  }

  /** Replace the document with a saved blueprint; history starts empty. */
  load(bp: Blueprint) {
    this.id = bp.id; this.name = bp.name;
    this.doc = { parts: canonicalParts(bp.parts), groups: canonicalGroups(bp.groups), nextN: Math.max(0, ...bp.parts.map(p => p.n)) + 1 };
    this.done = []; this.undone = []; this.selected.clear(); this.dirty = false;
    this.emit();
  }

  toBlueprint(): Blueprint {
    return { id: this.id, name: this.name.trim(), parts: canonicalParts(this.doc.parts), groups: canonicalGroups(this.doc.groups) };
  }

  /** Unsupported parts, with messages that name them. */
  issues() { return supportIssues(this.doc.parts); }

  /** Why the current blueprint cannot be saved, or null. */
  saveProblem(): string | null {
    const name = this.name.trim();
    if (!name) return 'Give the blueprint a name before saving.';
    if (name.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`;
    if (!this.doc.parts.length) return 'Add at least one part before saving.';
    const issues = this.issues();
    if (issues.length) return `Fix ${issues.length} issue${issues.length === 1 ? '' : 's'} before saving: ${issues[0].message}`;
    const budget = budgetProblem(this.doc.parts);
    if (budget) return budget;
    return null;
  }
  markSaved() { this.dirty = false; this.emit(); }

  private commit(kind: CommandKind, label: string, after: EditorDoc) {
    const before = clone(this.doc);
    this.doc = clone(after);
    this.done.push({ kind, label, before, after: clone(after) });
    this.undone = [];
    this.dirty = true;
    this.pruneSelection();
    this.emit();
  }
  private pruneSelection() { for (const n of [...this.selected]) if (!this.part(n)) this.selected.delete(n); }

  undo(): EditResult {
    const e = this.done.pop();
    if (!e) return { ok: false, message: 'Nothing to undo.' };
    this.doc = clone(e.before); this.undone.push(e); this.dirty = true;
    this.pruneSelection(); this.emit();
    return { ok: true, message: `Undid: ${e.label}.` };
  }
  redo(): EditResult {
    const e = this.undone.pop();
    if (!e) return { ok: false, message: 'Nothing to redo.' };
    this.doc = clone(e.after); this.done.push(e); this.dirty = true;
    this.pruneSelection(); this.emit();
    return { ok: true, message: `Redid: ${e.label}.` };
  }

  // ------------------------------------------------------------- placing

  /** Ghost check: why a new part could not go here, or null. */
  placeProblem(p: Omit<PartPlacement, 'n'>): Problem | null {
    return placementProblem(this.doc.parts, { ...p, n: this.doc.nextN });
  }

  add(p: Omit<PartPlacement, 'n'>): EditResult {
    const part: PartPlacement = { ...p, n: this.doc.nextN };
    const problem = placementProblem(this.doc.parts, part);
    if (problem) return { ok: false, message: problem.message, problem };
    const label = `Add ${partName(part)}`;
    this.commit('add', label, { parts: [...this.doc.parts, part], groups: this.doc.groups, nextN: part.n + 1 });
    return { ok: true, message: `${label} at cell ${part.x},${part.z}, level ${part.level}.` };
  }

  remove(ns: Iterable<number> = this.selected): EditResult {
    const gone = new Set([...ns].filter(n => this.part(n)));
    if (!gone.size) return { ok: false, message: 'Select parts to delete first.' };
    const parts = this.doc.parts.filter(p => !gone.has(p.n));
    const alive = new Set(parts.map(p => p.n));
    const label = gone.size === 1 ? `Delete ${partName(this.part([...gone][0])!)}` : `Delete ${gone.size} parts`;
    this.commit('remove', label, { parts, groups: tidyGroups(this.doc.groups, alive), nextN: this.doc.nextN });
    const issues = this.issues().length;
    return { ok: true, message: issues ? `${label}. ${issues} part${issues === 1 ? ' is' : 's are'} now unsupported.` : `${label}.` };
  }

  /**
   * Apply a rigid change to the selected parts and accept it only if the whole
   * result is valid: inside the volume, no overlaps, and no part that was
   * supported before loses its support.
   */
  private transformSelection(kind: 'move' | 'rotate', label: string, change: (p: PartPlacement) => PartPlacement): EditResult {
    if (!this.selected.size) return { ok: false, message: 'Select parts first.' };
    const moved = this.doc.parts.filter(p => this.selected.has(p.n)).map(change);
    for (const m of moved) {
      const out = slotsOf(m).outside;
      if (out) return { ok: false, message: `${label} refused: ${partName(m)} would leave the build volume.`, problem: { kind: 'bounds', message: out } };
    }
    const next = [...this.doc.parts.filter(p => !this.selected.has(p.n)), ...moved];
    for (const m of moved) {
      const blocker = new Layout(next.filter(o => o.n !== m.n)).blocker(m);
      if (blocker) return { ok: false, message: `${label} refused: ${partName(m)} would overlap ${partName(blocker.part)}${blocker.why ? ` (${blocker.why})` : ''}.`, problem: { kind: 'overlap', message: overlapMessage(blocker), blocker: blocker.part.n } };
    }
    const before = new Set(supportIssues(this.doc.parts).map(i => i.n));
    const after = supportIssues(next).filter(i => !before.has(i.n));
    if (after.length) {
      const lost = after[0];
      return { ok: false, message: `${label} refused: ${lost.message}`, problem: { kind: 'support', message: lost.message } };
    }
    const budget = budgetProblem(next);
    if (budget) return { ok: false, message: `${label} refused: ${budget}`, problem: { kind: 'budget', message: budget } };
    this.commit(kind, label, { parts: next.sort((a, b) => a.n - b.n), groups: this.doc.groups, nextN: this.doc.nextN });
    return { ok: true, message: `${label}.` };
  }

  moveSelection(dx: number, dz: number, dLevel = 0): EditResult {
    const n = this.selected.size;
    const dir = dx > 0 ? '+X' : dx < 0 ? '−X' : dz > 0 ? '+Z' : dz < 0 ? '−Z' : dLevel > 0 ? 'up' : 'down';
    return this.transformSelection('move', `Move ${n === 1 ? partName(this.part([...this.selected][0])!) : `${n} parts`} ${dir}`,
      p => ({ ...p, x: p.x + dx, z: p.z + dz, level: p.level + dLevel }));
  }

  /**
   * Turn the selection a quarter (+90° about +Y, the same sense as a part's
   * rot) about the centre of the cells it covers. When the covered block has
   * one odd and one even side the centre is moved half a cell towards −X so
   * that cells still land on cells.
   */
  rotateSelection(): EditResult {
    const sel = this.doc.parts.filter(p => this.selected.has(p.n));
    if (!sel.length) return { ok: false, message: 'Select parts first.' };
    const cells = sel.flatMap(p => slotsOf(p).cells);
    const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
    const minZ = Math.min(...cells.map(c => c[1])), maxZ = Math.max(...cells.map(c => c[1]));
    let cx = (minX + maxX + 1) / 2;
    const cz = (minZ + maxZ + 1) / 2;
    if ((maxX - minX - (maxZ - minZ)) % 2 !== 0) cx -= 0.5;
    const label = `Rotate ${sel.length === 1 ? partName(sel[0]) : `${sel.length} parts`} 90°`;
    return this.transformSelection('rotate', label, p => {
      // +90° about +Y maps (x, z) to (z, −x) relative to the centre.
      const px = p.x + 0.5 - cx, pz = p.z + 0.5 - cz;
      return { ...p, x: Math.round(cx + pz - 0.5), z: Math.round(cz - px - 0.5), rot: ((p.rot + 1) % 4) as Rot };
    });
  }

  group(name?: string): EditResult {
    const members = [...this.selected].sort((a, b) => a - b);
    if (members.length < 2) return { ok: false, message: 'Select at least two parts to group.' };
    const taken = new Set(this.doc.groups.map(g => g.name));
    let k = this.doc.groups.length + 1;
    let gname = name?.trim() || `Group ${k}`;
    while (!name && taken.has(gname)) gname = `Group ${++k}`;
    if (taken.has(gname)) return { ok: false, message: `A group called "${gname}" already exists.` };
    const rest = this.doc.groups.map(g => ({ name: g.name, members: g.members.filter(n => !this.selected.has(n)) })).filter(g => g.members.length >= 2);
    this.commit('group', `Group ${members.length} parts as "${gname}"`, { parts: this.doc.parts, groups: [...rest, { name: gname, members }], nextN: this.doc.nextN });
    return { ok: true, message: `Grouped ${members.length} parts as "${gname}".` };
  }

  ungroup(): EditResult {
    const hit = this.doc.groups.filter(g => g.members.some(n => this.selected.has(n)));
    if (!hit.length) return { ok: false, message: 'The selection is not in a group.' };
    this.commit('ungroup', `Ungroup ${hit.map(g => `"${g.name}"`).join(', ')}`, { parts: this.doc.parts, groups: this.doc.groups.filter(g => !hit.includes(g)), nextN: this.doc.nextN });
    return { ok: true, message: `Ungrouped ${hit.map(g => `"${g.name}"`).join(', ')}.` };
  }

  // ------------------------------------------------------------ selection

  groupOf(n: number) { return this.doc.groups.find(g => g.members.includes(n)) ?? null; }

  /**
   * Click semantics. A part in a group selects its whole group. Plain clicks
   * replace the selection (null clears it); additive clicks toggle the part
   * (or its group) in and out.
   */
  select(n: number | null, additive = false) {
    if (n === null) { if (!additive) this.selected.clear(); this.emit(); return; }
    if (!this.part(n)) return;
    const unit = this.groupOf(n)?.members ?? [n];
    if (additive) {
      const all = unit.every(m => this.selected.has(m));
      for (const m of unit) if (all) this.selected.delete(m); else this.selected.add(m);
    } else {
      this.selected = new Set(unit);
    }
    this.emit();
  }
  selectAll(ns: Iterable<number>) { this.selected = new Set([...ns].filter(n => this.part(n))); this.emit(); }

  rename(name: string) { this.name = name; this.dirty = true; this.emit(); }

  /** Parts limit, for the interface. */
  static readonly maxParts = GRID.maxParts;
}
