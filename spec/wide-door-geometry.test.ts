import { expect, it } from 'vitest';
import { Box3, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { PartBuilder } from '../src/assets/claude-geometry/style/geometry.ts';
import { countingMaterials, makeKit } from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import { wideDoorClosed, wideDoorOpen } from '../src/shared/blueprint-wide-door-geometry.ts';
import { WIDE_DOOR, wideDoorEnvelope, wideDoorFrame, wideDoorLeaves, wideDoorLeavesAt, wideDoorSweepBoxes } from '../src/shared/wide-door.ts';
import type { WideDoorBox } from '../src/shared/wide-door.ts';

const vec = (a: readonly number[]) => new Vector3(...a);
function corners(box: WideDoorBox) {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0,1,0), box.yaw ?? 0);
  return [-1,1].flatMap(x => [-1,1].flatMap(y => [-1,1].map(z =>
    new Vector3(x*box.half[0], y*box.half[1], z*box.half[2]).applyQuaternion(q).add(vec(box.center)))));
}
function contains(box: WideDoorBox, point: Vector3) {
  const local = point.clone().sub(vec(box.center)).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0,1,0), -(box.yaw ?? 0)));
  return ['x','y','z'].every((axis,index) => Math.abs(local[axis as 'x'|'y'|'z']) <= box.half[index]+1e-7);
}

it('keeps every actual leaf and frame triangle inside its physical boxes at every LOD', () => {
  for (const lod of ['low','medium','high'] as const) for (const open of [false,true]) {
    const materials = countingMaterials(lod, 'village'), b = new PartBuilder(lod);
    (open ? wideDoorOpen : wideDoorClosed)(makeKit(b,materials));
    const built = b.build('wide-door-geometry-contract');
    const boxes = [...wideDoorFrame(), ...wideDoorLeaves(open)];
    const bounds = new Box3(vec(wideDoorEnvelope.min), vec(wideDoorEnvelope.max)).expandByScalar(1e-7);
    let triangles = 0;
    built.group.updateMatrixWorld(true);
    built.group.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const p = node.geometry.getAttribute('position'), index = node.geometry.index;
      const count = index?.count ?? p.count;
      for (let i=0; i<count; i+=3) {
        const vertices = [0,1,2].map(j => new Vector3().fromBufferAttribute(p,index ? index.getX(i+j) : i+j).applyMatrix4(node.matrixWorld));
        expect(vertices.every(point => bounds.containsPoint(point))).toBe(true);
        expect(boxes.some(box => vertices.every(point => contains(box,point)))).toBe(true);
        triangles++;
      }
      node.geometry.dispose();
    });
    expect(triangles).toBe(built.triangles);
    expect(triangles).toBeGreaterThan(100);
    materials.dispose();
  }
});

it('reserves the full continuous swing, including the intermediate arc bulge', () => {
  const sweeps = wideDoorSweepBoxes();
  for (let i=0; i<=360; i++) for (const leaf of wideDoorLeavesAt(i*Math.PI/720))
    for (const point of corners(leaf)) expect(sweeps.some(box => contains(box,point))).toBe(true);
  const union = new Box3().setFromPoints(wideDoorLeaves(true).flatMap(corners));
  expect(union.min.z).toBeCloseTo(-.698, 8);
  const opening = (corners(wideDoorLeaves(true)[1]).reduce((min,p)=>Math.min(min,p.x),Infinity)-WIDE_DOOR.centerX)*2;
  expect(opening).toBeCloseTo(WIDE_DOOR.clearOpenWidth, 8);
  expect(opening).toBeGreaterThan(1.38);
});

it('leaves the central passage open and closes it with visible solid leaves', () => {
  const occupied = (point: Vector3, open: boolean) => [...wideDoorFrame(),...wideDoorLeaves(open)].some(box=>contains(box,point));
  for (const z of [-.4,-.2,0,.05]) for (const x of [-.4,0,.4])
    expect(occupied(new Vector3(WIDE_DOOR.centerX+x,1,z),true)).toBe(false);
  for (const x of [-.4,-.2,.2,.4]) expect(occupied(new Vector3(WIDE_DOOR.centerX+x,1,0),false)).toBe(true);
  // The same local opening transforms correctly on all four grid orientations.
  for (let rot=0;rot<4;rot++) {
    const matrix = new Matrix4().makeRotationY(rot*Math.PI/2);
    const points = wideDoorLeaves(true).flatMap(corners).map(p=>p.applyMatrix4(matrix));
    const bounds = new Box3().setFromPoints(points);
    expect(rot%2 ? bounds.max.z-bounds.min.z : bounds.max.x-bounds.min.x).toBeCloseTo(1.416,8);
  }
});
