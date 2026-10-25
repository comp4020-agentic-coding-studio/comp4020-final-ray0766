import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { courier } from './fixtures/original-courier.ts';
import { surfaceOrientation } from '../src/client/terrain.ts';
import { createCourierUpperFramingEnvelope, projectCourierUpperFramingPoints } from '../src/client/camera-courier-framing.ts';
const snapshot = (root: T.Object3D) => {
  const rows: unknown[] = [];
  root.traverse(o => rows.push({ uuid: o.uuid, matrix: o.matrix.toArray(), position: o.position.toArray(), rotation: o.rotation.toArray(), visible: o.visible, children: o.children.map(c => c.uuid) }));
  return rows;
};

describe('original courier upper continuous framing envelope', () => {
  it('preserves byte-exact independently generated original checker corner order and values', () => {
    const envelope = createCourierUpperFramingEnvelope(courier('clay'));
    // Original independent prepareUpperBodyEnvelope output, verified against
    // its untouched source by the separate oracle receipt before installation.
    expect(createHash('sha256').update(JSON.stringify(envelope.corners)).digest('hex')).toBe('aec9025e87f3721c01fb0053097571ad00d39104eb3f4066e543e3c833c5ce33');
    expect(envelope.corners).toHaveLength(336);
    expect(envelope.selections).toEqual([{ carryingParcel: false, meshes: 19, vertices: 3991 }, { carryingParcel: true, meshes: 23, vertices: 4087 }]);
    expect(envelope.rootLift).toBe(.018);
  });
  it('does not mutate player bones, matrices, visibility or object membership', () => {
    const actor = courier('clay'), before = snapshot(actor.root);
    const envelope = createCourierUpperFramingEnvelope(actor);
    expect(snapshot(actor.root)).toEqual(before);
    expect(actor.parcel.visible).toBe(false);
    expect(Object.isFrozen(envelope) && Object.isFrozen(envelope.corners) && envelope.corners.every(Object.isFrozen)).toBe(true);
  });
  it('includes both parcel states independent of the current parcel visibility', () => {
    const actor = courier('clay'), normal = createCourierUpperFramingEnvelope(actor);
    actor.parcel.visible = true;
    expect(createCourierUpperFramingEnvelope(actor).corners).toEqual(normal.corners);
    expect(actor.parcel.visible).toBe(true);
  });
  it('retains original upper scope even if lower forearm geometry is changed', () => {
    const actor = courier('clay'), normal = createCourierUpperFramingEnvelope(actor);
    const shoulder = actor.head.parent!.children.find(c => !(c instanceof T.Mesh) && c !== actor.head)!;
    shoulder.children.find(c => c instanceof T.Group)!.position.y = -100;
    expect(createCourierUpperFramingEnvelope(actor).corners).toEqual(normal.corners);
  });
  it('projects through actual facing/root lift once, retaining output vector identities', () => {
    const actor = courier('clay'), envelope = createCourierUpperFramingEnvelope(actor), up = new T.Vector3(.31, .81, .49).normalize();
    const front = new T.Vector3(.64, .15, -.72).projectOnPlane(up).normalize(), right = new T.Vector3().crossVectors(up, front).normalize();
    const root = up.clone().multiplyScalar(21.6).addScaledVector(up, .018);
    actor.root.position.copy(root); actor.root.quaternion.copy(surfaceOrientation(up, front)); actor.root.updateMatrixWorld(true);
    const target: T.Vector3[] = [];
    expect(projectCourierUpperFramingPoints(envelope, actor.root.matrixWorld, target)).toBe(target);
    const identities = [...target];
    projectCourierUpperFramingPoints(envelope, actor.root.matrixWorld, target);
    for (let i = 0; i < target.length; i++) {
      expect(target[i]).toBe(identities[i]);
      const p = envelope.corners[i], expected = root.clone().addScaledVector(right, p[0]).addScaledVector(up, p[1]).addScaledVector(front, p[2]);
      expect(target[i].distanceTo(expected)).toBeLessThan(1e-9);
    }
  });
  it('encloses actual upper vertex positions over walking and idle animation for both carry states', () => {
    const actor = courier('clay'), envelope = createCourierUpperFramingEnvelope(actor), upper: T.Mesh[] = [];
    actor.head.traverse(o => { if (o instanceof T.Mesh) upper.push(o); });
    for (const child of actor.head.parent!.children) {
      if (child === actor.head) continue;
      if (child instanceof T.Mesh) child.traverse(o => { if (o instanceof T.Mesh) upper.push(o); });
      else for (const shoulder of child.children) if (shoulder instanceof T.Mesh) upper.push(shoulder);
    }
    let outside = 0;
    const v = new T.Vector3();
    for (const carry of [false, true]) {
      actor.parcel.visible = carry;
      for (let sample = 0; sample < 16; sample++) {
        actor.animate(sample * .19, sample < 8 ? 2.6 : 0, false, 0, true); actor.root.updateMatrixWorld(true);
        let visibleIndex = 0;
        for (const mesh of upper) {
          let shown = true;
          for (let o: T.Object3D | null = mesh; o; o = o.parent) shown = shown && o.visible;
          if (!shown) continue;
          const box = new T.Box3().setFromPoints(envelope.corners.slice((carry ? 19 + visibleIndex : visibleIndex) * 8, (carry ? 19 + visibleIndex : visibleIndex) * 8 + 8).map(p => new T.Vector3(...p))).expandByScalar(1e-9);
          const positions = mesh.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) if (!box.containsPoint(v.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld))) outside++;
          visibleIndex++;
        }
      }
    }
    expect(outside).toBe(0);
  });
  it('rejects changed upper hierarchy or visibility rather than shrinking the envelope', () => {
    const hidden = courier('clay'); hidden.head.visible = false;
    expect(() => createCourierUpperFramingEnvelope(hidden)).toThrow(/visibility changed/);
    const extra = courier('clay'); extra.head.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
    expect(() => createCourierUpperFramingEnvelope(extra)).toThrow(/membership changed/);
  });
});
