import * as T from 'three';
import { isShared, markShared } from '../../core/dispose.ts';
import type { StyleLibrary } from '../../style/materials.ts';
import { buildPart } from '../parts/catalogue.ts';
import type { PartId } from '../parts/catalogue.ts';

// One built copy of each part, shared by every editing instance of it. The
// workshop shows parts individually (so they can be picked and highlighted),
// and cloning a template costs no geometry: clones reference the template's
// buffers, which are marked shared and freed only by PartTemplates.dispose().

export interface PartTemplate {
  group: T.Group;
  /** Local bounds of the part, for outlines and selection boxes. */
  box: T.Box3;
  outline: T.BufferGeometry;
  fill: T.BufferGeometry;
  triangles: number;
  drawCalls: number;
}

export class PartTemplates {
  private readonly lib: StyleLibrary;
  private cache = new Map<PartId, PartTemplate>();
  private owned: (T.BufferGeometry | T.Material)[] = [];
  constructor(lib: StyleLibrary) { this.lib = lib; }

  get(id: PartId): PartTemplate {
    let t = this.cache.get(id);
    if (!t) {
      const built = buildPart(id, this.lib);
      built.group.traverse(o => {
        const mesh = o as T.Mesh;
        if (!mesh.isMesh) return;
        this.owned.push(markShared(mesh.geometry));
        const m = mesh.material as T.Material;
        // The lamp glow is the one material a part owns; the template keeps it.
        if (!isShared(m)) this.owned.push(markShared(m));
      });
      const box = new T.Box3().setFromObject(built.group);
      box.expandByScalar(0.02);
      const size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3());
      const shape = new T.BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z);
      const outline = markShared(new T.EdgesGeometry(shape));
      const fill = markShared(shape);
      this.owned.push(outline, fill);
      t = { group: built.group, box, outline, fill, triangles: built.triangles, drawCalls: built.drawCalls };
      this.cache.set(id, t);
    }
    return t;
  }

  /** A new group that draws the part with the template's shared buffers. */
  instance(id: PartId): T.Group {
    const g = this.get(id).group.clone(true);
    g.userData = { part: id };
    return g;
  }

  dispose() {
    for (const r of this.owned) r.dispose();
    this.owned = [];
    this.cache.clear();
  }
}
