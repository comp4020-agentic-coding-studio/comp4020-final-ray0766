import * as T from 'three';
import type { SurfaceAnchor } from '../../core/anchor.ts';
import { markShared } from '../../core/dispose.ts';
import type { GroundFit, HeightField } from '../../core/ground.ts';
import type { ObjectId } from '../../core/ids.ts';
import { placementProblem } from '../../core/placement.ts';
import type { Vec3 } from '../../core/vec.ts';
import { objectList } from '../../core/world.ts';
import type { WorldState } from '../../core/world.ts';
import type { Stage } from '../../shell/stage.ts';
import { UI, VILLAGE_UI } from '../../style/tokens.ts';
import { buildBlueprintModel } from '../model3d.ts';
import type { BlueprintModel } from '../model3d.ts';
import { fitStructureOnGround, placedTransform, structureGroundRules } from '../placement.ts';
import type { StructureRegistry } from '../placement.ts';
import type { GroundSeat } from './ground-view.ts';

// Placed structures on the planet, drawn from the world state the local
// authority keeps, plus the placement ghost. Each structure is one merged model
// with a concrete plinth sized by its ground fit; it is rebuilt whenever its
// anchor or the ground changes, because the fit (and so the plinth) changes
// with it. Fits use the dense ground footprint (blueprintGroundFootprint,
// samples every 0.075 m), as CONTRACTS §5 asks of every structure footprint.

/**
 * Centres of the lamp boxes in a merged model, in the model's local frame, read
 * from the merged geometry itself (not the sockets). Each lamp is an unbevelled
 * box: 36 vertices in a row of the lamp mesh. Tests use them to check where the
 * door geometry actually ended up.
 */
function lampCentres(root: T.Object3D): Vec3[] {
  const mesh = root.children.find(c => (c as T.Mesh).isMesh && ((c as T.Mesh).material as T.Material).name === 'blueprint:lamp') as T.Mesh | undefined;
  if (!mesh) return [];
  const p = mesh.geometry.getAttribute('position');
  const out: Vec3[] = [];
  for (let i = 0; i + 36 <= p.count; i += 36) {
    let x = 0, y = 0, z = 0;
    for (let k = i; k < i + 36; k++) { x += p.getX(k); y += p.getY(k); z += p.getZ(k); }
    out.push([x / 36, y / 36, z / 36]);
  }
  return out;
}

interface Placed { model: BlueprintModel; key: string; hash: string; anchor: SurfaceAnchor; fit: GroundFit }
export interface GhostState { fit: GroundFit; problem: string | null }

/** Object id the ghost checks against when it is a new structure. */
const NEW_OBJECT = '00000000-0000-4000-8000-000000000000' as ObjectId;

export class StructuresView {
  readonly root = new T.Group();
  private readonly stage: Stage;
  private field: HeightField;
  private readonly registry: StructureRegistry;
  private placed = new Map<string, Placed>();
  private ghost: { model: BlueprintModel; key: string; ok: boolean } | null = null;
  private ring: T.LineLoop;
  private ghostRing: T.LineLoop;
  private selectedId: string | null = null;
  private owned: { dispose(): void }[] = [];
  private ghostFill: Record<'ok' | 'bad', T.Material>;
  private ringMat: Record<'sel' | 'ok' | 'bad', T.LineBasicMaterial>;

  constructor(stage: Stage, field: HeightField, registry: StructureRegistry) {
    this.stage = stage; this.field = field; this.registry = registry;
    this.root.name = 'structures';
    const own = <M extends { dispose(): void }>(m: M) => { this.owned.push(m); return markShared(m); };
    // A faint tint, no glow: the model's form stays readable and whatever stands behind it stays visible.
    // The village look draws it flat and unlit, in its own state colours (tokens.ts VILLAGE_UI.scene).
    const village = stage.look === 'village', S = VILLAGE_UI.scene;
    const fill = (c: string) => own(village
      ? new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false })
      : new T.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.7, metalness: 0 }));
    const [sel, ok, bad] = village ? [S.select, S.ok, S.bad] : [UI.info, UI.ok, UI.danger];
    this.ghostFill = { ok: fill(ok), bad: fill(bad) };
    // No depth from overlay lines: the village look draws its own lines from depth and would ink round them.
    const line = (c: string) => own(new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    this.ringMat = { sel: line(sel), ok: line(ok), bad: line(bad) };
    const circle = own(new T.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, i) => new T.Vector3(Math.cos(i / 64 * Math.PI * 2), 0, Math.sin(i / 64 * Math.PI * 2)))));
    this.ring = new T.LineLoop(circle, this.ringMat.sel);
    this.ghostRing = new T.LineLoop(circle, this.ringMat.ok);
    for (const r of [this.ring, this.ghostRing]) { r.visible = false; r.renderOrder = 12; this.root.add(r); }
    stage.scene.add(this.root);
  }

  private build(hash: string, anchor: SurfaceAnchor): { model: BlueprintModel; fit: GroundFit } {
    const bp = this.registry.get(hash);
    if (!bp) throw new Error(`Blueprint ${hash.slice(0, 8)} is not registered.`);
    const fit = fitStructureOnGround(this.field, anchor, bp);
    const model = buildBlueprintModel(bp, this.stage.library, this.stage.lod, { foundationDepth: fit.foundationDepth });
    const t = placedTransform(anchor, fit);
    model.object.position.set(...t.position);
    model.object.quaternion.set(...t.quaternion);
    return { model, fit };
  }

  /**
   * Stand every structure on new ground: each is re-fitted and rebuilt (its
   * plinth depends on the fit). The caller has already checked that every
   * structure fits there (RESTRICT); the ghost is dropped.
   */
  setField(field: HeightField, state: WorldState) {
    this.field = field;
    this.hideGhost();
    for (const p of this.placed.values()) p.key = '';
    this.sync(state);
  }

  /** Where each placed structure's floor sits, for grading the ground under it. */
  seats(): GroundSeat[] {
    return [...this.placed.values()].map(p => ({ anchor: p.anchor, fit: p.fit, radius: this.registry.groundFootprintOf(p.hash)!.radius, covers: this.registry.coversOf(p.hash)! }));
  }

  /** Current seat of every placed structure by object id. */
  fits(): Map<string, GroundFit> { return new Map([...this.placed].map(([id, p]) => [id, p.fit])); }

  /** Match the drawn structures to the world state. */
  sync(state: WorldState) {
    const live = new Set<string>();
    for (const o of objectList(state)) {
      if (o.spec.kind !== 'structure') continue;
      live.add(o.id);
      const key = `${o.spec.blueprintHash}|${o.anchor.dir.join(',')}|${o.anchor.yaw}`;
      const old = this.placed.get(o.id);
      if (old?.key === key) continue;
      old?.model.dispose();
      const { model, fit } = this.build(o.spec.blueprintHash, o.anchor);
      model.object.userData.objectId = o.id;
      this.root.add(model.object);
      this.placed.set(o.id, { model, key, hash: o.spec.blueprintHash, anchor: o.anchor, fit });
    }
    for (const [id, p] of this.placed) if (!live.has(id)) { p.model.dispose(); this.placed.delete(id); }
    if (this.selectedId && !this.placed.has(this.selectedId)) this.selectedId = null;
    this.placeRing(this.ring, this.selectedId ? this.placed.get(this.selectedId)! : null);
  }

  private placeRing(ring: T.LineLoop, p: { hash: string; anchor: SurfaceAnchor; fit: GroundFit } | null) {
    ring.visible = !!p;
    if (!p) return;
    const t = placedTransform(p.anchor, p.fit);
    ring.position.set(...t.position);
    ring.quaternion.set(...t.quaternion);
    const r = this.registry.footprintOf(p.hash)?.radius ?? 1;
    ring.scale.setScalar(r);
    ring.translateY(0.03);
  }

  /**
   * Show where `hash` would stand at `anchor` and why it would be refused.
   * The check is the same placement rule the authority applies.
   */
  showGhost(state: WorldState, hash: string, anchor: SurfaceAnchor, movingId: string | null = null): GhostState {
    const problem = placementProblem(structureGroundRules(this.registry, this.field), state, (movingId ?? NEW_OBJECT) as ObjectId, { kind: 'structure', blueprintHash: hash }, anchor);
    const ok = problem === null;
    const key = `${hash}|${anchor.dir.join(',')}|${anchor.yaw}|${ok}`;
    if (this.ghost?.key !== key) {
      this.ghost?.model.dispose();
      const { model, fit } = this.build(hash, anchor);
      const bounds = new T.Box3();
      model.object.traverse(o => {
        const m = o as T.Mesh;
        // A ghost is a tinted volume; its fill writes no depth, so the village look's lines leave it alone.
        if (m.isMesh) {
          m.material = this.ghostFill[ok ? 'ok' : 'bad']; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 6;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          bounds.union(m.geometry.boundingBox!);
        }
        o.raycast = () => {};
      });
      // The outline carries the verdict; its geometry is the ghost's own and goes with model.dispose().
      const box = new T.BoxGeometry(...bounds.getSize(new T.Vector3()).toArray()).translate(...bounds.getCenter(new T.Vector3()).toArray());
      const outline = new T.LineSegments(new T.EdgesGeometry(box), this.ringMat[ok ? 'ok' : 'bad']);
      box.dispose();
      outline.renderOrder = 12; outline.raycast = () => {};
      model.object.add(outline);
      this.root.add(model.object);
      this.ghost = { model, key, ok };
      this.ghostRing.material = this.ringMat[ok ? 'ok' : 'bad'];
      this.placeRing(this.ghostRing, { hash, anchor, fit });
      return { fit, problem };
    }
    return { fit: fitStructureOnGround(this.field, anchor, this.registry.get(hash)!), problem };
  }

  hideGhost() { this.ghost?.model.dispose(); this.ghost = null; this.ghostRing.visible = false; }

  select(id: string | null) {
    this.selectedId = id && this.placed.has(id) ? id : null;
    this.placeRing(this.ring, this.selectedId ? this.placed.get(this.selectedId)! : null);
  }
  get selected() { return this.selectedId; }

  /** The placed structure under a ray, or null. */
  pick(ray: T.Raycaster): string | null {
    const hit = ray.intersectObjects([...this.placed.values()].map(p => p.model.object), true)[0];
    let o: T.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.objectId) o = o.parent;
    return (o?.userData.objectId as string | undefined) ?? null;
  }

  /**
   * What the scene graph says about each structure: where its root is, and the
   * world transform of every part socket relative to that root.
   */
  inspect() {
    const inv = new T.Matrix4(), rel = new T.Matrix4();
    const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    return [...this.placed.entries()].map(([id, x]) => {
      const root = x.model.object;
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      const sockets = root.children.filter(c => c.name.startsWith('part:')).map(c => {
        rel.multiplyMatrices(inv, c.matrixWorld).decompose(p, q, s);
        const front = new T.Vector3(0, 0, 1).transformDirection(c.matrixWorld);
        return { n: c.userData.n as number, part: c.userData.part as string, position: p.toArray() as Vec3, quaternion: q.toArray() as [number, number, number, number], worldFront: front.toArray() as Vec3 };
      });
      // Lowest point of the merged geometry in the model's frame: the plinth bottom when there is one.
      let plinthBottom = Infinity;
      for (const c of root.children) {
        const m = c as T.Mesh;
        if (!m.isMesh) continue;
        m.geometry.computeBoundingBox();
        plinthBottom = Math.min(plinthBottom, m.geometry.boundingBox!.min.y);
      }
      return { id, hash: x.hash, anchor: x.anchor, baseRadius: x.fit.baseRadius, foundationDepth: x.fit.foundationDepth, plinthBottom, position: root.position.toArray() as Vec3, quaternion: root.quaternion.toArray() as [number, number, number, number], triangles: x.model.triangles, drawCalls: x.model.drawCalls, buildMs: x.model.buildMs, sockets, lamps: lampCentres(root) };
    });
  }

  /** Screen-independent anchor of a placed structure, for lists. */
  anchorOf(id: string) { return this.placed.get(id)?.anchor ?? null; }

  dispose() {
    this.hideGhost();
    for (const p of this.placed.values()) p.model.dispose();
    this.placed.clear();
    this.root.removeFromParent();
    for (const m of this.owned) m.dispose();
    this.owned = [];
  }
}
