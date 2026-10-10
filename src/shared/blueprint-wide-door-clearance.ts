import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { partTransform } from '../assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement as VendorPart } from '../assets/claude-geometry/blueprint/model.ts';
import { isWideDoorPartId } from './blueprint-parts.ts';
import type { PartPlacement } from './blueprint-model.ts';
import { PART_COLLIDERS } from './physics/parts.ts';
import type { PartBox } from './physics/parts.ts';
import { wideDoorSweepBoxes } from './wide-door.ts';

const UP = new Vector3(0, 1, 0), RIGHT = new Vector3(1, 0, 0);
function oriented(part: PartPlacement, shape: PartBox) {
  const t = partTransform(part as VendorPart, { x: 0, z: 0 });
  const turn = new Quaternion().setFromAxisAngle(UP, t.yaw);
  const center = new Vector3(...shape.center).applyQuaternion(turn).add(new Vector3(...t.position));
  const rotation = new Quaternion().setFromAxisAngle(UP, t.yaw + (shape.yaw ?? 0)).multiply(new Quaternion().setFromAxisAngle(RIGHT, shape.pitch ?? 0));
  // Touching joints and floor tops are allowed; actual positive overlap is not.
  const half = new Vector3(...shape.half).addScalar(-1e-7).max(new Vector3());
  return new OBB(center, half, new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(rotation)));
}
/** Conservative continuous swept-leaf boxes against movement's authored
 * solids, including yaw and pitch. No terrain or world is loaded. */
export function wideDoorClearanceIssues(parts: readonly PartPlacement[]) {
  const issues: { n: number; blocker: number; message: string }[] = [];
  for (const door of parts.filter(p => isWideDoorPartId(p.part))) {
    const sweeps = wideDoorSweepBoxes().map(shape => oriented(door, shape));
    for (const other of parts) {
      if (other.n === door.n) continue;
      const hit = PART_COLLIDERS[other.part]().some(shape => sweeps.some(sweep => sweep.intersectsOBB(oriented(other, shape), 1e-10)));
      if (hit) issues.push({ n: door.n, blocker: other.n, message: `Wide double door #${door.n}: both inward leaf swings must stay clear of part #${other.n}.` });
    }
  }
  return issues;
}
