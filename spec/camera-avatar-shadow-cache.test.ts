import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createCameraAvatarShadowTest } from '../src/client/camera-avatar-shadow.ts';
import { createCameraAvatarShadowTest as baseline } from './fixtures/camera-avatar-shadow-baseline.ts';
import type { CameraAvatarShadowCollider } from '../src/client/camera-avatar-shadow.ts';
const boxes = [{ label: 'body', corners: [-1, 1].flatMap(x => [-.5, .5].flatMap(y => [3, 5].map(z => [x, y, z] as const))) }];
const pose = { eye: new Vector3(), direction: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) };
function shape(): CameraAvatarShadowCollider { return { center: new Vector3(1, .1, 2.5), half: new Vector3(.2, .3, .4),
  q: new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), .8) }; }
describe('pose-independent collider geometry cache', () => {
  it.each(['center.x','center.y','center.z','half.x','half.y','half.z','q.x','q.y','q.z','q.w'])('matches fresh original calculation after in-place %s mutation', component => {
    const c = shape();
    const [field, axis] = component.split('.') as ['center'|'half'|'q', 'x'|'y'|'z'|'w'];
    for (let i = 0; i < 40; i++) {
      c.center.set((i % 7 - 3) * .6, (i % 5 - 2) * .2, .5 + (i % 11) * .5);
      c.half.set(.1 + (i % 3) * .1, .1 + (i % 4) * .1, .1 + (i % 6) * .1);
      c.q.setFromAxisAngle(new Vector3(1, 2, 3).normalize(), i * .17);
      const test = createCameraAvatarShadowTest(pose, boxes);
      expect(test(c)).toBe(baseline(pose, boxes)(c));
      if (field === 'q') c.q[axis] *= -1;
      else (c[field] as unknown as Record<string, number>)[axis] += field === 'half' ? .6 : 1.5;
      expect(test(c)).toBe(baseline(pose, boxes)(c));
    }
  });
  it('recomputes pose-dependent projection and support separation on every call', () => {
    const c = shape();
    for (let i = 0; i < 50; i++) {
      const moving = { ...pose, eye: new Vector3((i % 5 - 2) * .1, .1, -i * .02), direction: new Vector3(.1, .03, 1).normalize() };
      expect(createCameraAvatarShadowTest(moving, boxes)(c)).toBe(baseline(moving, boxes)(c));
    }
  });
  it('retains invalid input and degenerate collider rejection after previously valid cache fill', () => {
    const c = shape(), test = createCameraAvatarShadowTest(pose, boxes); test(c);
    c.half.x = 0; expect(test(c)).toBe(false); c.half.x = .2;
    c.q.x = NaN; expect(test(c)).toBe(false); c.q.identity();
    c.center.x = Infinity; expect(test(c)).toBe(false); c.center.x = -0;
    expect(test(c)).toBe(baseline(pose, boxes)(c)); c.center.x = 0;
    expect(test(c)).toBe(baseline(pose, boxes)(c));
  });
});
