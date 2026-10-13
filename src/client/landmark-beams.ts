import * as T from 'three';
import type { Vec3 } from '../shared/world.ts';
import { surfacePoint } from './terrain.ts';

/** A soft column of light rising from a landmark so it can be found from across a small planet.
 * Drawing only: it starts above head and camera height and carries no collision. */
export function landmarkBeam(parent: T.Object3D, dir: Vec3, from: number, length: number, color: string) {
  const up = new T.Vector3(...dir).normalize();
  const geometry = new T.CylinderGeometry(1.3, .45, length, 16, 1, true);
  geometry.translate(0, from + length / 2, 0);
  const material = new T.MeshBasicMaterial({ color, transparent: true, opacity: .55, depthWrite: false, side: T.DoubleSide, fog: false });
  const beam = new T.Mesh(geometry, material);
  beam.name = 'landmark-beam'; beam.renderOrder = 5; beam.raycast = () => {};
  beam.position.copy(surfacePoint(up)); beam.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), up);
  parent.add(beam);
  let disposed = false;
  return { beam, dispose() { if (disposed) return; disposed = true; beam.removeFromParent(); geometry.dispose(); material.dispose(); } };
}
