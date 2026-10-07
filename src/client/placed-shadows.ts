import * as T from 'three';

interface Entry { id: string; bounds: T.Sphere; meshes: T.Mesh[]; active: boolean }

/** Limit only distant saved-object shadow passes. Visible geometry, ink, picking
 * and received shadows are unchanged. Bounds include the whole model, so a large
 * nearby building keeps its shadows even when its placement origin is far away.
 * This helper borrows meshes; it never owns or disposes their render resources. */
export class PlacedObjectShadows {
  private entries: Entry[] = [];
  constructor(private nearRange = 12, private hysteresis = 2) {}

  clear() {
    for (const entry of this.entries) for (const mesh of entry.meshes) mesh.castShadow = true;
    this.entries = [];
  }

  replace(objects: Iterable<readonly [string, T.Group]>) {
    this.clear();
    for (const [id, root] of objects) {
      // Preview objects carry this flag and must never regain shadow casting.
      if (root.userData.noPracticalLights) continue;
      const meshes: T.Mesh[] = [];
      root.traverse(object => { if (object instanceof T.Mesh && object.castShadow) meshes.push(object); });
      if (!meshes.length) continue;
      root.updateWorldMatrix(true, true);
      const box = new T.Box3().setFromObject(root);
      if (box.isEmpty()) continue;
      this.entries.push({ id, bounds: box.getBoundingSphere(new T.Sphere()), meshes, active: true });
    }
  }

  update(feet: T.Vector3, selected: string | null = null) {
    let active = 0;
    for (const entry of this.entries) {
      const reach = this.nearRange + entry.bounds.radius + (entry.active ? this.hysteresis : 0);
      const next = entry.id === selected || entry.bounds.center.distanceToSquared(feet) <= reach * reach;
      if (entry.active !== next) {
        for (const mesh of entry.meshes) mesh.castShadow = next;
        entry.active = next;
      }
      if (entry.active) active++;
    }
    return { active, total: this.entries.length };
  }
}
