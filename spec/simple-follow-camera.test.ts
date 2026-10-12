import { describe, expect, it, vi } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { SimpleFollowCameraRig } from '../src/client/simple-follow-camera.ts';

const input = () => ({ feet: new Vector3(0, 60, 0), up: new Vector3(0, 1, 0), heading: new Vector3(0, 0, -1),
  pitch: 0, portrait: false, radius: 60, dt: 1/60, probe: vi.fn(() => { throw new Error('Visibility must not govern following'); }) });
describe('simple follow camera', () => {
  it('keeps its arm under blocked scenery without probing or mutating the actor', () => {
    const rig = new SimpleFollowCameraRig(), value = input(), before = value.feet.clone();
    const pose = rig.update(value);
    expect(value.probe).not.toHaveBeenCalled(); expect(value.feet.equals(before)).toBe(true);
    expect(pose.position.toArray()).toEqual([0, 63.6, 7.2]);
    expect(pose.avoidanceYaw).toBe(0); expect(pose.distance).toBeCloseTo(pose.desiredDistance);
  });
  it('follows a turn while retaining distance', () => {
    const rig = new SimpleFollowCameraRig(), value = input(), first = rig.update(value);
    value.heading.set(1, 0, 0);
    let pose = first; for(let i=0;i<60;i++) pose=rig.update(value);
    expect(pose.heading.dot(value.heading)).toBeGreaterThan(.999);
    expect(pose.distance).toBeCloseTo(first.distance); expect(pose.position.x).toBeLessThan(-7);
  });
  it('transports its frame across the sphere and honors manual pitch', () => {
    const rig = new SimpleFollowCameraRig(), value = input(); rig.update(value);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), Math.PI/2);
    value.up.applyQuaternion(rotation); value.heading.applyQuaternion(rotation); value.feet.applyQuaternion(rotation);
    value.pitch=.3;
    const pose=rig.update(value);
    expect(pose.up.dot(value.up)).toBeCloseTo(1); expect(pose.heading.dot(value.up)).toBeCloseTo(0);
    expect(pose.heading.dot(value.heading)).toBeCloseTo(1); expect(pose.pitch).toBeGreaterThan(0);
    expect(pose.position.toArray().every(Number.isFinite)).toBe(true);
  });
});
