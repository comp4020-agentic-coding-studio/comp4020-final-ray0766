import { MathUtils, Quaternion, Vector3 } from 'three';
import type { GroundCameraInput, GroundCameraPose } from './ground-camera.ts';
import type { FollowRoom } from './indoor-follow-room.ts';

/** Third-person follow arm. Scenery never changes distance, opacity or movement. */
export class SimpleFollowCameraRig {
  private previousUp?: Vector3;
  private heading?: Vector3;
  private pitch = 0;

  reset() { this.previousUp = undefined; this.heading = undefined; this.pitch = 0; }

  update(input: GroundCameraInput & {room?: FollowRoom|null}): GroundCameraPose {
    const up = input.up.clone().normalize();
    const transported = this.heading?.clone();
    if (transported && this.previousUp) transported.applyQuaternion(new Quaternion().setFromUnitVectors(this.previousUp, up));
    const desired = input.heading.clone().projectOnPlane(up);
    if (desired.lengthSq() < 1e-10) desired.copy(transported ?? new Vector3(0, 0, -1)).projectOnPlane(up);
    if (desired.lengthSq() < 1e-10) desired.set(1, 0, 0).projectOnPlane(up);
    desired.normalize();
    const instant = input.instant || !transported;
    const response = 1 - Math.exp(-12 * Math.max(0, input.dt));
    const heading = instant ? desired : transported!.projectOnPlane(up).normalize();
    if (!instant) {
      const turn = Math.atan2(up.dot(new Vector3().crossVectors(heading, desired)), heading.dot(desired));
      heading.applyAxisAngle(up, turn * response).projectOnPlane(up).normalize();
    }
    const pitch = MathUtils.clamp(input.pitch, input.room ? -.1 : -.3, input.room ? .2 : .7);
    this.pitch = instant ? pitch : MathUtils.lerp(this.pitch, pitch, response);
    this.heading = heading.clone(); this.previousUp = up.clone();
    const large = input.radius > 20;
    const back = input.room ? .85 : large ? (input.portrait ? 8 : 7.2) : (input.portrait ? 9 : 6.8);
    const height = input.room ? 1.65 : large ? (input.portrait ? 3.8 : 3.6) : (input.portrait ? 6.4 : 4.6);
    const anchor = input.feet.clone().addScaledVector(up, 1.15);
    const right = new Vector3().crossVectors(heading, up).normalize();
    const arm = heading.clone().multiplyScalar(-back).addScaledVector(up, height - 1.15).applyAxisAngle(right, this.pitch);
    const target = anchor.clone().add(heading.clone().multiplyScalar(input.room ? .5 : large ? 1.1 : 1.6)
      .addScaledVector(up, large ? 0 : -.3).applyAxisAngle(right, this.pitch));
    const desiredEye = anchor.clone().add(arm);
    const position = input.room ? input.room.constrainEye(desiredEye) : desiredEye, distance = position.distanceTo(anchor);
    // These fields preserve the existing optional diagnostic snapshot shape.
    // No collision/visibility probe or certificate is requested by this rig.
    return { position, target, up, direction: target.clone().sub(position).normalize(), heading, pitch: this.pitch,
      distance, desiredDistance: distance, probeRadius: 0, centerDistance: distance, shoulder: 0,
      avoidanceYaw: 0, avoidanceTargetYaw: 0, framingLimited: false, warningDistance: distance,
      opticalDistance: distance, eyeClear: true, frameWidth: 0, frameHeight: 0, avatarClearance: 0, framingPitch: 0 };
  }
}
