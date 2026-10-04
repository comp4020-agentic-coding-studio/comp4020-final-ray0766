import { Matrix4, Quaternion, Vector3 } from 'three';
import { RADIUS, SPEED } from '../shared/world.ts';

export class SurfaceWalker {
  up: Vector3;
  north: Vector3;
  velocity = new Vector3();
  facing = new Vector3();
  constructor(position: number[]) {
    this.up = new Vector3().fromArray(position).normalize();
    this.north = new Vector3(0, 0, -1).projectOnPlane(this.up).normalize();
    if (this.north.lengthSq() < 0.1) this.north.set(1, 0, 0).projectOnPlane(this.up).normalize();
    this.facing.copy(this.north);
  }
  right() { return new Vector3().crossVectors(this.north, this.up).normalize(); }
  step(x: number, y: number, delta: number) {
    const dt = Math.min(0.05, Math.max(0, delta));
    const desired = this.right().multiplyScalar(x).addScaledVector(this.north, y);
    if (desired.length() > 1) desired.normalize();
    desired.multiplyScalar(SPEED);
    this.velocity.lerp(desired, 1 - Math.exp(-12 * dt));
    const speed = this.velocity.length();
    if (speed < 0.002) { this.velocity.set(0, 0, 0); return; }
    const dir = this.velocity.clone().normalize();
    const axis = new Vector3().crossVectors(this.up, dir).normalize();
    const rotation = new Quaternion().setFromAxisAngle(axis, speed * dt / RADIUS);
    this.up.applyQuaternion(rotation).normalize();
    this.north.applyQuaternion(rotation).projectOnPlane(this.up).normalize();
    this.velocity.applyQuaternion(rotation).projectOnPlane(this.up);
    this.facing.applyQuaternion(rotation).projectOnPlane(this.up).normalize();
    const heading = this.velocity.clone().normalize();
    const turn = Math.atan2(this.up.dot(new Vector3().crossVectors(this.facing, heading)), this.facing.dot(heading));
    this.facing.applyAxisAngle(this.up, turn * (1 - Math.exp(-14 * dt))).normalize();
  }
  orientation() {
    const right = new Vector3().crossVectors(this.up, this.facing).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, this.up, this.facing));
  }
}
export function cameraPose(walker: SurfaceWalker, portrait: boolean) {
  return {
    position: walker.up.clone().multiplyScalar(RADIUS + (portrait ? 14.7 : 11.2)).addScaledVector(walker.north, portrait ? -17 : -14),
    target: walker.up.clone().multiplyScalar(RADIUS - 1.4).addScaledVector(walker.north, 1.4),
  };
}
