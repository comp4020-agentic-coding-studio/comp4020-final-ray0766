import * as T from 'three';

type Point = readonly [number, number, number];
type Box = { lo: number[]; hi: number[] };
export interface CourierFramingSource { root: T.Group; head: T.Group; parcel: T.Mesh }
export interface CourierUpperFramingEnvelope {
  /** Original upper-body order, walking then carrying: 19 + 23 mesh boxes. */
  readonly corners: readonly Point[];
  readonly selections: readonly { readonly carryingParcel: boolean; readonly meshes: number; readonly vertices: number }[];
  readonly rootLift: .018;
}

const points = (b: Box): number[][] => {
  const result: number[][] = [];
  for (const x of [b.lo[0], b.hi[0]]) for (const y of [b.lo[1], b.hi[1]]) for (const z of [b.lo[2], b.hi[2]]) result.push([x, y, z]);
  return result;
};
const bounds = (rows: number[][]): Box => ({
  lo: [0, 1, 2].map(i => Math.min(...rows.map(p => p[i]))),
  hi: [0, 1, 2].map(i => Math.max(...rows.map(p => p[i]))),
});
const range = (a: number, b: number, low: number, high: number): number[] => {
  const angles = [low, high], base = Math.atan2(b, a);
  for (let k = -2; k <= 2; k++) { const angle = base + k * Math.PI; if (angle > low && angle < high) angles.push(angle); }
  const values = angles.map(angle => a * Math.cos(angle) + b * Math.sin(angle));
  return [Math.min(...values), Math.max(...values)];
};
const rotate = (box: Box, axis: 'x' | 'y' | 'z', low: number, high: number): Box => {
  const rows: number[][] = [];
  for (const p of points(box)) {
    const q = p.map(v => [v, v]);
    if (axis === 'x') { q[1] = range(p[1], -p[2], low, high); q[2] = range(p[2], p[1], low, high); }
    else if (axis === 'y') { q[0] = range(p[0], p[2], low, high); q[2] = range(p[2], -p[0], low, high); }
    else { q[0] = range(p[0], -p[1], low, high); q[1] = range(p[1], p[0], low, high); }
    for (const x of q[0]) for (const y of q[1]) for (const z of q[2]) rows.push([x, y, z]);
  }
  return bounds(rows);
};
const move = (box: Box, p: number[]): Box => ({ lo: box.lo.map((v, i) => v + p[i]), hi: box.hi.map((v, i) => v + p[i]) });

/** Call once immediately after courier creation, before gameplay animation.
 * Temporary hierarchy clones share the existing geometry/material resources;
 * only immutable numbers escape. No actor, geometry or material is created.
 * Euler XYZ applies local Z before X. Analytic interval extrema preserve the
 * original continuous head/shoulder/torso/bob envelope and both carry states.
 */
export function createCourierUpperFramingEnvelope(source: CourierFramingSource): CourierUpperFramingEnvelope {
  const corners: Point[] = [], selections: { carryingParcel: boolean; meshes: number; vertices: number }[] = [];
  for (const carry of [false, true]) {
    const root = source.root.clone(true), originals: T.Object3D[] = [], clones: T.Object3D[] = [];
    source.root.traverse(o => originals.push(o)); root.traverse(o => clones.push(o));
    const head = clones[originals.indexOf(source.head)] as T.Group | undefined;
    const parcel = clones[originals.indexOf(source.parcel)] as T.Mesh | undefined;
    const torso = head?.parent, rig = torso?.parent;
    if (!head || !parcel || !torso || !rig || rig.parent !== root) throw new Error('Courier upper framing hierarchy changed');
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
    rig.position.y = 0; torso.rotation.set(0, 0, 0); head.rotation.y = 0; parcel.visible = carry;
    const selected: { mesh: T.Mesh; kind: 'head' | 'torso' | 'shoulder'; bone: T.Object3D }[] = [];
    head.traverse(o => { if (o instanceof T.Mesh) selected.push({ mesh: o, kind: 'head', bone: head }); });
    let shoulderIndex = 0;
    for (const child of torso.children) {
      if (child === head) continue;
      if (child instanceof T.Mesh) child.traverse(o => { if (o instanceof T.Mesh) selected.push({ mesh: o, kind: 'torso', bone: torso }); });
      else {
        child.rotation.x = carry ? -.9 : 0;
        child.rotation.z = (shoulderIndex++ ? 1 : -1) * .06;
        for (const shoulder of child.children) if (shoulder instanceof T.Mesh) selected.push({ mesh: shoulder, kind: 'shoulder', bone: child });
      }
    }
    if (selected.length !== 23 || !selected.some(row => row.mesh === parcel) || shoulderIndex !== 2) throw new Error('Courier original upper framing membership changed');
    root.updateMatrixWorld(true);
    let vertices = 0, meshes = 0;
    for (const { mesh, kind, bone } of selected) {
      let shown = true;
      for (let object: T.Object3D | null = mesh; object; object = object.parent) shown = shown && object.visible;
      if (!shown) continue;
      const positions = mesh.geometry.getAttribute('position'), inverse = bone.matrixWorld.clone().invert(), rows: number[][] = [];
      if (!positions || positions.count === 0) throw new Error('Courier framing missing vertex geometry');
      for (let i = 0; i < positions.count; i++) {
        const vertex = new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) throw new Error('Courier framing nonfinite vertex');
        let box: Box = { lo: vertex.toArray(), hi: vertex.toArray() }; vertices++;
        if (kind === 'head') box = move(rotate(box, 'y', -.055, .055), head.position.toArray());
        else if (kind === 'shoulder') {
          box = rotate(box, 'z', bone.rotation.z, bone.rotation.z);
          box = rotate(box, 'x', carry ? -.9 : -.42, carry ? -.9 : .42);
          box = move(box, bone.position.toArray());
        }
        box = rotate(rotate(box, 'z', -.02, .02), 'x', 0, .045);
        box = move(box, torso.position.toArray()); box.hi[1] += .025;
        rows.push(...points(box));
      }
      corners.push(...points(bounds(rows)).map(p => Object.freeze(p) as unknown as Point)); meshes++;
    }
    if (meshes !== (carry ? 23 : 19)) throw new Error('Courier original upper framing visibility changed');
    selections.push(Object.freeze({ carryingParcel: carry, meshes, vertices }));
  }
  return Object.freeze({ corners: Object.freeze(corners), selections: Object.freeze(selections), rootLift: .018 });
}

/** Reuse the same output vectors each frame. The root already includes the
 * surface facing basis and .018 lift; applying the lift here would double it.
 */
export function projectCourierUpperFramingPoints(envelope: CourierUpperFramingEnvelope, matrixWorld: T.Matrix4, target: T.Vector3[]): T.Vector3[] {
  target.length = envelope.corners.length;
  for (let i = 0; i < envelope.corners.length; i++) (target[i] ??= new T.Vector3()).fromArray(envelope.corners[i]).applyMatrix4(matrixWorld);
  return target;
}
