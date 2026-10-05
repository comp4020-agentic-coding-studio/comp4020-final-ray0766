// Plain tuple maths shared by browser and server code. No three.js here, so the
// server can validate placements and replay history without a renderer.

/** Same shape as the main project's `Vec3` (src/shared/world.ts @ a76575a). */
export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w], the order three.js uses. */
export type Quat = [number, number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (!(l > 0) || !Number.isFinite(l)) throw new RangeError('Cannot normalise a zero or non-finite vector.');
  return [a[0] / l, a[1] / l, a[2] / l];
}

export const isFiniteVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));

/** Unit-length check with the main project's tolerance (validPosition uses 0.001). */
export const isUnitVec3 = (v: unknown, tolerance = 1e-3): v is Vec3 =>
  isFiniteVec3(v) && Math.abs(length(v) - 1) < tolerance;

/** Angle in radians between two unit vectors, clamped for rounding. */
export const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Great-circle distance between two surface directions on a sphere. */
export const arcDistance = (a: Vec3, b: Vec3, radius: number): number => angleBetween(a, b) * radius;

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l === 0 ? [0, 0, 0, 1] : [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // Same arithmetic as three's Vector3.applyQuaternion.
  const [qx, qy, qz, qw] = q, [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

export const quatConjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/**
 * Port of three's Quaternion.setFromUnitVectors, kept bit-for-bit so a frame
 * computed here matches `group.quaternion.setFromUnitVectors(Y, n)` in the
 * main project's `locate()` and `anchor()` helpers.
 */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  let r = dot(from, to) + 1;
  let x: number, y: number, z: number;
  if (r < 1e-8) {
    r = 0;
    if (Math.abs(from[0]) > Math.abs(from[2])) { x = -from[1]; y = from[0]; z = 0; }
    else { x = 0; y = -from[2]; z = from[1]; }
  } else {
    x = from[1] * to[2] - from[2] * to[1];
    y = from[2] * to[0] - from[0] * to[2];
    z = from[0] * to[1] - from[1] * to[0];
  }
  return quatNormalize([x, y, z, r]);
}

/** Round to a fixed number of decimals and drop negative zero; used by canonical JSON. */
export function quantize(n: number, decimals = 6): number {
  const f = 10 ** decimals;
  const q = Math.round(n * f) / f;
  return Object.is(q, -0) ? 0 : q;
}
