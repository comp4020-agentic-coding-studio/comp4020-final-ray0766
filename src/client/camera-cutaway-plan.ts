import type { Vector3 } from 'three';
import type { GroundWorld } from '../shared/physics/world.ts';
import type { CameraCutawayHit, CameraCutawayMask } from './camera-cutaway.ts';

export const CAMERA_CUTAWAY_CAPSULE_RADIUS = .22 as const;
export const CAMERA_CUTAWAY_MAX_SWEEP = 1 as const;
export type CameraCutawayPoint = readonly [number, number, number];
export interface CameraCutawayFrameInput {
  world: GroundWorld; eye: Vector3; previousEye?: Vector3 | null;
  feet: Vector3; up: Vector3; direction: Vector3; dt: number;
  /** Only true for the isolated, explicitly approved local camera exception. */
  cameraException?: boolean;
  /** Actual upper-body mesh box corners in consecutive groups of eight. */
  opticalTargetPoints?: readonly CameraCutawayPoint[];
  diagnostics?: boolean;
}
export interface CameraCutawayFrameMask extends CameraCutawayMask {
  /** This frame's complete sphere/sweep has an immediate, unscaled .22 cut. */
  physical: boolean;
  /** Full part provenance, independently verified against the actual world. */
  colliderIndices: readonly number[];
  colliderBoundsContained: boolean;
}
export interface CameraCutawayOpticalCandidate {
  objectId: string; colliderIndex: number; category: CameraCutawayMask['category'];
  /** False proves separation; true includes conservative near-plane ambiguity. */
  avatarShadowOverlap: boolean; mappingValid: boolean; eligible: boolean; partSlot: number; maskKey: string | null;
}
/** A frame certificate references one immutable world and exact camera pose.
 * It is not an ignore-list: each exception still intersects this local volume. */
export interface CameraCutawayFramePlan {
  frameId: number; world: GroundWorld; worldRevision: number; planetId: string;
  bindingVersion: number; continuityGeneration: number;
  eye: CameraCutawayPoint; previousEye: CameraCutawayPoint | null;
  feet: CameraCutawayPoint; up: CameraCutawayPoint; direction: CameraCutawayPoint;
  cameraCapsule: { start: CameraCutawayPoint; end: CameraCutawayPoint; radius: .22; length: number; maxLength: 1 };
  visualCone: { eye: CameraCutawayPoint; target: CameraCutawayPoint; length: number;
    radiusAtEye: number; radiusAtTarget: number; endOffset: number; minHeight: number };
  masks: readonly CameraCutawayFrameMask[];
  mandatoryParts: readonly { key: string; objectId: string; partSlot: number; colliderIndices: readonly number[] }[];
  visualRequiredParts: readonly { key: string; objectId: string; partSlot: number; sourceColliderIndices: readonly number[] }[];
  opticalTargetPoints: readonly CameraCutawayPoint[]; opticalCandidates: readonly CameraCutawayOpticalCandidate[];
  rayTargets: readonly CameraCutawayPoint[]; rawHits: readonly CameraCutawayHit[];
  overflow: { objects: number; masks: number; protected: 0 };
  cameraException: boolean; ready: boolean; reasons: readonly string[];
}
