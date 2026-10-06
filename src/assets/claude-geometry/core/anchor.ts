import { add, isUnitVec3, normalize, quatFromAxisAngle, quatFromUnitVectors, quatMultiply, quatRotate, scale } from './vec.ts';
import type { Quat, Vec3 } from './vec.ts';

/**
 * Planet constants mirrored from the main project at a76575a
 * (src/shared/world.ts). They are copied, not imported, so this repository
 * never depends on files that are still changing there.
 */
export const PLANET_RADIUS = 10;
export const SPAWN_DIR: Vec3 = normalize([0, 1, 0.27]);
/** Main project keeps `CATALOGUE[kind].radius + 1.0` clear of the landing spot. */
export const LANDING_CLEARANCE = 1.0;

/**
 * Where something sits on a planet: a unit direction from the planet centre and
 * a yaw about the local up axis. This is exactly the main project's
 * `PlacedObject.position` + `PlacedObject.rotation` pair.
 */
export interface SurfaceAnchor {
  dir: Vec3;
  /** Radians in [0, 2π). */
  yaw: number;
}

const TAU = Math.PI * 2;
export function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) throw new RangeError('Yaw must be finite.');
  const y = ((yaw % TAU) + TAU) % TAU;
  return y >= TAU - 1e-12 ? 0 : y;
}

export function isSurfaceAnchor(value: unknown): value is SurfaceAnchor {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return isUnitVec3(a.dir) && typeof a.yaw === 'number' && Number.isFinite(a.yaw) && a.yaw >= 0 && a.yaw < TAU;
}

/**
 * Local frame convention for anything anchored to the surface:
 *   +Y local = radial up, +Z local = the object's "front" (a building's main
 *   facade, matching the main project's cottage door at +Z), +X local = right.
 * The rotation is setFromUnitVectors(+Y, dir) followed by rotateY(yaw), the same
 * two calls the main project makes in `locate()`.
 */
export function anchorQuaternion(anchor: SurfaceAnchor): Quat {
  const base = quatFromUnitVectors([0, 1, 0], anchor.dir);
  return quatMultiply(base, quatFromAxisAngle([0, 1, 0], anchor.yaw));
}

export interface SurfaceFrame { up: Vec3; right: Vec3; front: Vec3; quaternion: Quat }
export function anchorFrame(anchor: SurfaceAnchor): SurfaceFrame {
  const q = anchorQuaternion(anchor);
  return { up: quatRotate(q, [0, 1, 0]), right: quatRotate(q, [1, 0, 0]), front: quatRotate(q, [0, 0, 1]), quaternion: q };
}

/**
 * Convert a point in an anchored object's local space into planet space.
 * `baseRadius` is the distance from the planet centre to the local origin
 * (surface radius plus whatever lift the ground fit decided).
 */
export function localToPlanet(anchor: SurfaceAnchor, baseRadius: number, local: Vec3): Vec3 {
  return add(scale(anchor.dir, baseRadius), quatRotate(anchorQuaternion(anchor), local));
}

/** Direction from the planet centre through a local point; used to sample ground under a footprint. */
export function localToDir(anchor: SurfaceAnchor, baseRadius: number, local: Vec3): Vec3 {
  return normalize(localToPlanet(anchor, baseRadius, local));
}
