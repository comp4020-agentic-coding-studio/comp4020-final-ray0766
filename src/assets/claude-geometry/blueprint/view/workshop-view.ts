import * as T from 'three';
import { disposeObject3D, markShared } from '../../core/dispose.ts';
import type { Stage } from '../../shell/stage.ts';
import { PALETTE, UI } from '../../style/tokens.ts';
import type { BlueprintEditor } from '../editor.ts';
import { buildBlueprintModel } from '../model3d.ts';
import type { BlueprintModel } from '../model3d.ts';
import { GRID, inGrid, partTransform, rotDir } from '../model.ts';
import type { PartPlacement, Rot } from '../model.ts';
import { PARTS } from '../parts/catalogue.ts';
import type { PartId } from '../parts/catalogue.ts';
import { STOREY } from '../parts/kit.ts';
import type { PartTemplates } from './templates.ts';

// The workshop: an assembly bay with the 5 × 5 build grid, the building drawn
// as one merged model per level (at most 14 draw calls each, faded as a whole
// above the active level), the active level's grid, a ghost for the part being
// placed and a selection highlight. Each part also has an invisible instance
// that shares the part template's buffers; it is never drawn and exists only
// so the pointer can pick individual parts. Grid cell (x, z) spans world
// x ∈ [x − 2.5, x − 1.5], so the bay is centred on the origin.

export type Draft = Omit<PartPlacement, 'n'>;
const HALF = GRID.cells / 2;

interface Instance { object: T.Group; key: string; part: PartId; level: number; selected: T.Object3D[] }
interface LevelModel { model: BlueprintModel; key: string; faded: boolean }

export class WorkshopView {
  readonly root = new T.Group();
  private readonly stage: Stage;
  private readonly editor: BlueprintEditor;
  private readonly templates: PartTemplates;
  private instances = new Map<number, Instance>();
  private levels: (LevelModel | null)[] = Array.from({ length: GRID.levels }, () => null);
  /** Milliseconds the last level rebuild took, for the performance notes. */
  lastBuildMs = 0;
  private ghost: { object: T.Group; key: string } | null = null;
  private levelGrid: T.LineSegments;
  private owned: { dispose(): void }[] = [];
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  level = 0;

  private faded: T.MeshStandardMaterial;
  private selLine: T.LineBasicMaterial;
  private selFill: T.MeshBasicMaterial;
  private ghostMat: Record<'ok' | 'bad', { fill: T.MeshStandardMaterial; line: T.LineBasicMaterial }>;

  constructor(stage: Stage, editor: BlueprintEditor, templates: PartTemplates) {
    this.stage = stage; this.editor = editor; this.templates = templates;
    this.root.name = 'workshop';
    const own = <M extends { dispose(): void }>(m: M): M => { this.owned.push(m); return m; };
    this.faded = own(markShared(new T.MeshStandardMaterial({ color: '#7d8a93', transparent: true, opacity: 0.13, depthWrite: false, roughness: 0.7, metalness: 0 })));
    this.selLine = own(markShared(new T.LineBasicMaterial({ color: UI.info, transparent: true, opacity: 0.95, depthTest: false })));
    // Selection is the outline; the fill is only a breath of tint so the part's detail stays readable.
    this.selFill = own(markShared(new T.MeshBasicMaterial({ color: UI.info, transparent: true, opacity: 0.035, depthWrite: false })));
    // Ghosts: a faint lit tint without glow, so the part's form reads and what is behind it stays visible.
    const ghost = (c: string) => ({
      fill: own(markShared(new T.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.7, metalness: 0 }))),
      line: own(markShared(new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthTest: false }))),
    });
    this.ghostMat = { ok: ghost(UI.ok), bad: ghost(UI.danger) };

    // Assembly bay: a dark sealed-concrete floor under the slabs and a hazard border round the build area.
    const lib = stage.library;
    const floor = new T.Mesh(new T.PlaneGeometry(40, 40), lib.custom('blueprint:bay-floor', { finish: 'concrete', pattern: 'concrete', color: PALETTE.graphite, relief: 0.6 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.172; floor.receiveShadow = true;
    floor.geometry.setAttribute('uv', new T.Float32BufferAttribute(floor.geometry.getAttribute('uv').array.map((v: number) => v * 20), 2));
    this.root.add(floor);
    const border = new T.Group();
    for (const [x, z, w, d] of [[0, -HALF - 0.05, GRID.cells + 0.2, 0.1], [0, HALF + 0.05, GRID.cells + 0.2, 0.1], [-HALF - 0.05, 0, 0.1, GRID.cells], [HALF + 0.05, 0, 0.1, GRID.cells]]) {
      const strip = new T.Mesh(new T.BoxGeometry(w, 0.004, d), lib.hazard());
      strip.position.set(x, -0.169, z); strip.receiveShadow = true;
      border.add(strip);
    }
    this.root.add(border);
    // Faint floor grid at level 0 and a brighter grid on the active level.
    this.root.add(this.gridLines(-0.168, new T.LineBasicMaterial({ color: '#3b454e', transparent: true, opacity: 0.8 })));
    this.levelGrid = this.gridLines(0.004, new T.LineBasicMaterial({ color: UI.info, transparent: true, opacity: 0.32, depthWrite: false }));
    this.root.add(this.levelGrid);
    stage.scene.add(this.root);
    this.editor.onChange(() => this.sync());
    this.sync();
  }

  private gridLines(y: number, material: T.LineBasicMaterial) {
    const pts: number[] = [];
    for (let i = 0; i <= GRID.cells; i++) {
      pts.push(i - HALF, y, -HALF, i - HALF, y, HALF);
      pts.push(-HALF, y, i - HALF, HALF, y, i - HALF);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const lines = new T.LineSegments(g, material);
    lines.renderOrder = 2;
    return lines;
  }

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(GRID.levels - 1, level));
    this.levelGrid.position.y = this.level * STOREY;
    this.sync();
  }

  /** Bring the drawn levels and the pick proxies in line with the editor. */
  sync() {
    const live = new Set<number>();
    for (const p of this.editor.parts) {
      live.add(p.n);
      const key = `${p.part}|${p.x}|${p.level}|${p.z}|${p.rot}`;
      let inst = this.instances.get(p.n);
      if (inst && inst.part !== p.part) { this.dropInstance(inst); this.instances.delete(p.n); inst = undefined; }
      if (!inst) {
        // A pick proxy: shares the template's buffers and is never drawn.
        const object = this.templates.instance(p.part);
        object.visible = false;
        object.userData.n = p.n;
        this.root.add(object);
        inst = { object, key: '', part: p.part, level: p.level, selected: [] };
        this.instances.set(p.n, inst);
      }
      if (inst.key !== key) {
        const t = partTransform(p, { x: HALF, z: HALF });
        inst.object.position.set(...t.position);
        inst.object.rotation.set(0, t.yaw, 0);
        inst.object.updateMatrix();
        inst.key = key; inst.level = p.level;
        for (const o of inst.selected) { o.position.copy(inst.object.position); o.rotation.copy(inst.object.rotation); }
      }
      this.setSelected(inst, this.editor.selection.has(p.n));
    }
    for (const [n, inst] of this.instances) if (!live.has(n)) { this.dropInstance(inst); this.instances.delete(n); }
    for (let level = 0; level < GRID.levels; level++) this.syncLevel(level);
  }

  private syncLevel(level: number) {
    const parts = this.editor.parts.filter(p => p.level === level);
    const key = parts.map(p => `${p.n}:${p.part}:${p.x}:${p.z}:${p.rot}`).join('|');
    let entry = this.levels[level];
    if (entry && entry.key !== key) { entry.model.dispose(); entry = this.levels[level] = null; }
    if (!entry && parts.length) {
      const begin = performance.now();
      const model = buildBlueprintModel(parts, this.stage.library, this.stage.lod, { sockets: false, pivot: { x: HALF, z: HALF } });
      this.lastBuildMs = performance.now() - begin;
      model.object.name = `level-${level}`;
      model.object.traverse(o => { o.raycast = () => {}; });
      this.root.add(model.object);
      entry = this.levels[level] = { model, key, faded: false };
    }
    if (entry) this.setFaded(entry, level > this.level);
  }

  private setFaded(entry: LevelModel, faded: boolean) {
    if (entry.faded === faded) return;
    entry.faded = faded;
    entry.model.object.traverse(o => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      if (faded) { mesh.userData.base ??= mesh.material; mesh.material = this.faded; mesh.castShadow = false; }
      else if (mesh.userData.base) { mesh.material = mesh.userData.base as T.Material; mesh.castShadow = this.stage.renderer.shadowMap.enabled && !(mesh.material as T.Material).transparent; }
    });
  }

  private dropInstance(inst: Instance) {
    inst.selected.forEach(o => o.removeFromParent());
    disposeObject3D(inst.object);
  }

  private setSelected(inst: Instance, selected: boolean) {
    if (selected === inst.selected.length > 0) return;
    if (!selected) { inst.selected.forEach(o => o.removeFromParent()); inst.selected = []; return; }
    const t = this.templates.get(inst.part);
    const line = new T.LineSegments(t.outline, this.selLine);
    const fill = new T.Mesh(t.fill, this.selFill);
    for (const o of [line, fill]) {
      o.userData.overlay = true; o.renderOrder = 10; o.raycast = () => {};
      o.position.copy(inst.object.position); o.rotation.copy(inst.object.rotation);
      this.root.add(o);
    }
    inst.selected = [line, fill];
  }

  /** Show `draft` as a green (fits) or red (refused) ghost; null hides it. */
  setGhost(draft: Draft | null, ok = true) {
    const key = draft ? `${draft.part}|${ok}` : '';
    if (this.ghost && this.ghost.key !== key) { disposeObject3D(this.ghost.object); this.ghost = null; }
    if (!draft) return;
    if (!this.ghost) {
      const object = this.templates.instance(draft.part);
      const mats = this.ghostMat[ok ? 'ok' : 'bad'];
      object.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { m.material = mats.fill; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5; } });
      const line = new T.LineSegments(this.templates.get(draft.part).outline, mats.line);
      line.renderOrder = 11;
      object.add(line);
      object.traverse(o => { o.raycast = () => {}; });
      this.root.add(object);
      this.ghost = { object, key };
    }
    const t = partTransform({ ...draft, n: 0 }, { x: HALF, z: HALF });
    this.ghost.object.position.set(...t.position);
    this.ghost.object.rotation.set(0, t.yaw, 0);
  }

  private rayFrom(clientX: number, clientY: number) {
    this.stage.camera.updateMatrixWorld();
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.stage.camera);
    return this.ray;
  }

  /** Grid coordinates (cells, fractional) where the pointer meets the active level, or null. */
  pointToGrid(clientX: number, clientY: number): { gx: number; gz: number } | null {
    this.plane.constant = -this.level * STOREY;
    const hit = this.rayFrom(clientX, clientY).ray.intersectPlane(this.plane, new T.Vector3());
    if (!hit) return null;
    const gx = hit.x + HALF, gz = hit.z + HALF;
    return gx >= 0 && gz >= 0 && gx < GRID.cells && gz < GRID.cells ? { gx, gz } : null;
  }

  /**
   * The placement a pointer at (gx, gz) asks for. Cell parts take the tool's
   * turn; edge parts take the nearest edge of the cell under the pointer and
   * face out of that cell (flip faces them into it); vertex parts take the
   * nearest corner.
   */
  slotAt(part: PartId, gx: number, gz: number, toolRot: Rot, flip: boolean): Draft | null {
    const x = Math.floor(gx), z = Math.floor(gz), fx = gx - x, fz = gz - z;
    if (!inGrid(x, z)) return null;
    const level = this.level;
    switch (PARTS[part].mount) {
      case 'cell': return { part, x, level, z, rot: toolRot };
      case 'vertex': {
        const rot: Rot = fx >= 0.5 ? (fz >= 0.5 ? 0 : 1) : (fz >= 0.5 ? 3 : 2);
        return { part, x, level, z, rot };
      }
      case 'edge': {
        const options: [number, Rot][] = [[1 - fz, 0], [fz, 2], [1 - fx, 1], [fx, 3]];
        const rot = options.sort((a, b) => a[0] - b[0])[0][1];
        if (flip) {
          const [dx, dz] = rotDir(rot);
          if (inGrid(x + dx, z + dz)) return { part, x: x + dx, level, z: z + dz, rot: ((rot + 2) % 4) as Rot };
        }
        return { part, x, level, z, rot };
      }
    }
  }

  /** Grid point that slotAt maps back to `draft` (unflipped), for tests and tooling. */
  pointFor(draft: Draft): { gx: number; gz: number } {
    const cx = draft.x + 0.5, cz = draft.z + 0.5;
    switch (PARTS[draft.part].mount) {
      case 'cell': return { gx: cx, gz: cz };
      case 'edge': { const [dx, dz] = rotDir(draft.rot); return { gx: cx + dx * 0.32, gz: cz + dz * 0.32 }; }
      case 'vertex': {
        const [sx, sz] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][draft.rot];
        return { gx: cx + sx * 0.3, gz: cz + sz * 0.3 };
      }
    }
  }

  /** Client (CSS pixel) position of a grid point on a level. */
  gridToClient(gx: number, level: number, gz: number): { x: number; y: number; visible: boolean } {
    this.stage.camera.updateMatrixWorld();
    const v = new T.Vector3(gx - HALF, level * STOREY, gz - HALF).project(this.stage.camera);
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
  }

  /** The part under the pointer, on the active level or below (faded upper levels are not pickable). */
  pickPart(clientX: number, clientY: number): number | null {
    const targets = [...this.instances.values()].filter(i => i.level <= this.level).map(i => i.object);
    const hit = this.rayFrom(clientX, clientY).intersectObjects(targets, true).find(h => !h.object.userData.overlay);
    let o: T.Object3D | null = hit?.object ?? null;
    while (o && o.userData.n === undefined) o = o.parent;
    return o ? (o.userData.n as number) : null;
  }

  /** Read-only view of what is drawn, for tests. */
  inspect() {
    return {
      level: this.level,
      instances: [...this.instances.entries()].map(([n, i]) => ({ n, part: i.part, level: i.level, selected: i.selected.length > 0, position: i.object.position.toArray(), yaw: i.object.rotation.y })),
      levels: this.levels.map((l, i) => (l ? { level: i, faded: l.faded, triangles: l.model.triangles, drawCalls: l.model.drawCalls } : null)),
      lastBuildMs: this.lastBuildMs,
      ghost: this.ghost ? { key: this.ghost.key, position: this.ghost.object.position.toArray(), yaw: this.ghost.object.rotation.y } : null,
    };
  }

  setVisible(visible: boolean) { this.root.visible = visible; }

  dispose() {
    this.setGhost(null);
    for (const inst of this.instances.values()) this.dropInstance(inst);
    this.instances.clear();
    for (const l of this.levels) l?.model.dispose();
    this.levels = [];
    disposeObject3D(this.root);
    for (const m of this.owned) m.dispose();
    this.owned = [];
  }
}
