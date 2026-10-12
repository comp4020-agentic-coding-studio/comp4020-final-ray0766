import { Box3, Matrix4, Vector3 } from 'three';

/** Camera-only conservative guard around the factory's solid ship bounds.
 * The bounds exclude the plume. Empty hull/wing gaps inside this envelope
 * remain conservatively solid; this never changes player or flight physics. */
export class CameraShipCollision {
  private readonly bounds = new Box3();
  private readonly inverse = new Matrix4();
  private readonly radiusScale = new Vector3();
  private ready = false;

  /** Copy the current design's body-frame bounds and actual parked-root world
   * matrix. Call after its transform/bob updates, and after replacing a design. */
  update(solidBounds: Box3, matrixWorld: Matrix4): void {
    this.ready = false;
    if (solidBounds.isEmpty() || ![...solidBounds.min.toArray(), ...solidBounds.max.toArray(), ...matrixWorld.elements].every(Number.isFinite)) return;
    const m = matrixWorld.elements;
    if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1 || Math.abs(matrixWorld.determinant()) < 1e-12) return;
    this.bounds.copy(solidBounds); this.inverse.copy(matrixWorld).invert();
    const e = this.inverse.elements;
    if (!e.every(Number.isFinite)) return;
    // A world-space sphere becomes an ellipsoid under a non-uniform inverse
    // transform. Each row's norm gives its exact extent along one local axis;
    // their enclosing box is a sufficient (conservative) collision envelope.
    this.radiusScale.set(Math.hypot(e[0], e[4], e[8]), Math.hypot(e[1], e[5], e[9]), Math.hypot(e[2], e[6], e[10]));
    this.ready = true;
  }

  /** Maximum clear world distance along this segment. A start inside the
   * expanded envelope returns zero, even for a 1mm endpoint check or a ray
   * facing away from every FrontSide triangle. Invalid data fails closed. */
  distance(start: Vector3, end: Vector3, radius: number): number {
    if (!this.ready || !Number.isFinite(radius) || radius < 0 || ![...start.toArray(), ...end.toArray()].every(Number.isFinite)) return 0;
    const length = start.distanceTo(end);
    if (!Number.isFinite(length) || length === 0) return 0;
    const localStart = start.clone().applyMatrix4(this.inverse), localEnd = end.clone().applyMatrix4(this.inverse);
    if (![...localStart.toArray(), ...localEnd.toArray()].every(Number.isFinite)) return 0;
    const delta = localEnd.sub(localStart);
    let enter = 0, leave = 1;
    for (const axis of ['x', 'y', 'z'] as const) {
      const padding = radius * this.radiusScale[axis], low = this.bounds.min[axis] - padding, high = this.bounds.max[axis] + padding;
      if (!Number.isFinite(low) || !Number.isFinite(high)) return 0;
      const origin = localStart[axis], step = delta[axis];
      if (step === 0) { if (origin < low || origin > high) return length; }
      else {
        const a = (low - origin) / step, b = (high - origin) / step;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        if (enter > leave) return length;
      }
    }
    return Math.max(0, Math.min(length, enter * length));
  }
}
