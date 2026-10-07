import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { PlacedObjectShadows } from '../src/client/placed-shadows.ts';
import { makePlacementPreview } from '../src/client/placement-preview.ts';
import { disposeObject3D } from '../src/assets/claude-geometry/core/dispose.ts';

function object(x = 0, width = 2) {
  const root = new T.Group(); root.position.x = x; root.userData.objectId = 'saved';
  const body = new T.Mesh(new T.BoxGeometry(width, 2, 2), new T.MeshBasicMaterial());
  body.castShadow = true; body.receiveShadow = true; root.add(body);
  const ink = new T.Mesh(new T.BoxGeometry(width, 2, 2), new T.MeshBasicMaterial());
  ink.name = 'ink-shell'; ink.castShadow = false; root.add(ink);
  return { root, body, ink };
}

describe('placed-object shadow range', () => {
  it('reduces only the distant shadow pass, retaining visible geometry, ink and picking', () => {
    const { root, body, ink } = object(20), shadows = new PlacedObjectShadows();
    const geometry = body.geometry, material = body.material;
    const geometryDisposed = vi.fn(), materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed); material.addEventListener('dispose', materialDisposed);
    shadows.replace([['saved', root]]);
    expect(shadows.update(new T.Vector3())).toEqual({ active: 0, total: 1 });
    expect(body.castShadow).toBe(false); expect(body.receiveShadow).toBe(true);
    expect(root.visible && body.visible && ink.visible).toBe(true); expect(ink.castShadow).toBe(false);
    expect(new T.Raycaster(new T.Vector3(20, 0, 5), new T.Vector3(0, 0, -1)).intersectObject(root).length).toBeGreaterThan(0);
    shadows.update(new T.Vector3(10, 0, 0)); expect(body.castShadow).toBe(true);
    expect(body.geometry).toBe(geometry); expect(body.material).toBe(material);
    shadows.clear(); expect(geometryDisposed).not.toHaveBeenCalled(); expect(materialDisposed).not.toHaveBeenCalled();
    disposeObject3D(root); expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(materialDisposed).toHaveBeenCalledTimes(1);
  });

  it('uses hysteresis and keeps the selected saved object lit during editing', () => {
    const { root, body } = object(), shadows = new PlacedObjectShadows();
    shadows.replace([['saved', root]]);
    shadows.update(new T.Vector3(15, 0, 0)); expect(body.castShadow).toBe(true);
    shadows.update(new T.Vector3(16, 0, 0)); expect(body.castShadow).toBe(false);
    shadows.update(new T.Vector3(15, 0, 0)); expect(body.castShadow).toBe(false);
    shadows.update(new T.Vector3(13, 0, 0)); expect(body.castShadow).toBe(true);
    shadows.update(new T.Vector3(30, 0, 0), 'saved'); expect(body.castShadow).toBe(true);
    shadows.update(new T.Vector3(30, 0, 0)); expect(body.castShadow).toBe(false);
    shadows.clear(); expect(body.castShadow).toBe(true); disposeObject3D(root);
  });

  it('accounts for the complete building and transformed parent, and releases old references', () => {
    const large = object(20, 20), nested = object(10), parent = new T.Group(); parent.position.x = 40; parent.add(nested.root);
    const shadows = new PlacedObjectShadows(); shadows.replace([['large', large.root]]);
    shadows.update(new T.Vector3()); expect(large.body.castShadow).toBe(true);
    shadows.update(new T.Vector3(-40, 0, 0)); expect(large.body.castShadow).toBe(false);
    shadows.replace([['nested', nested.root]]); expect(large.body.castShadow).toBe(true);
    shadows.update(new T.Vector3()); expect(nested.body.castShadow).toBe(false);
    shadows.update(new T.Vector3(50, 0, 0)); expect(nested.body.castShadow).toBe(true);
    shadows.clear(); expect(shadows.update(new T.Vector3())).toEqual({ active: 0, total: 0 });
    disposeObject3D(large.root); disposeObject3D(nested.root);
  });

  it('never re-enables preview or original non-casting mesh shadows', () => {
    const { root, body, ink } = object(); makePlacementPreview(root, false);
    const shadows = new PlacedObjectShadows(); shadows.replace([['preview', root]]);
    expect(shadows.update(new T.Vector3(), 'preview')).toEqual({ active: 0, total: 0 });
    shadows.clear(); expect(body.castShadow).toBe(false); expect(ink.castShadow).toBe(false);
    root.userData.disposeOwned();
  });
});
