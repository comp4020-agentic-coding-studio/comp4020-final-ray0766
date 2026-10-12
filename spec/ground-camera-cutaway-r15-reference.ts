// Frozen installed r15 solver; preserves the captured failure.
import { MathUtils, Quaternion, Vector3 } from 'three';
import type { GroundCameraInput, GroundCameraPose } from '../src/client/ground-camera';
import { CAMERA_FRAME_MAX_SWEEP } from '../src/client/camera-frame-collision.ts';
import type { CameraFrameCertificate, GroundCameraFrameProposal } from '../src/client/camera-frame-collision.ts';

/** Optional plain evidence sink. No reference to world, controller, or plan. */
export interface GroundCameraCutawayDiagnostics {
  schema: 'ground-camera-attempt-v1';
  status?: 'running' | 'accepted' | 'conflict';
  context?: Record<string, unknown>;
  selectedCandidate?: number;
  reasons?: readonly string[];
  candidates: {
    index: number; goal: number[]; eye: number[];
    status: 'fit-rejected' | 'frame-rejected' | 'raw-physical-rejected' | 'margin-dominated' | 'accepted';
    rankUpperBound?: { reserve: number; nominalDistance: number };
    armDistance: number; avatarClearance: number;
    direction?: number[]; projection?: { width: number; height: number; extent: number; good: boolean };
    margins?: { guardEnd: number | null; optical: number | null; arm: number; composition: number;
      angular: number | null; step: number; maximumSweep: number; endpointRawClear: boolean; sweepRawClear: boolean;
      reserve: number; protectedCentral: number | null; nominalDistance: number; guardEndpoints: { objectId: string; colliderIndex: number; rayIndex: number;
        endpoint: 'enter' | 'exit'; end: number; radial: number; height: number; part: number; capsule: number; }[] };
    frameCertificate?: CameraFrameCertificate['diagnostics'];
  }[];
}

export interface GroundCameraCutawayInput extends GroundCameraInput {
  /** Original upper-body conservative animation envelope, transformed by the caller into this frame. */
  framingPoints?: readonly Vector3[];
  /** Measure-only capture supplied by the caller; absent has no trace work. */
  diagnostics?: GroundCameraCutawayDiagnostics;
  certifyFrame?: (proposal: GroundCameraFrameProposal) => CameraFrameCertificate;
  commitFrame?: (certificate: CameraFrameCertificate) => boolean;
}
export class GroundCameraConflict extends Error {
  readonly name = 'GroundCameraConflict';
  readonly reasons: readonly string[];
  readonly evidence?: CameraFrameCertificate['diagnostics'];
  constructor(reasons: readonly string[], evidence?: CameraFrameCertificate['diagnostics']) {
    super(`Cutaway camera conflict: ${reasons.join(', ')}`);
    this.reasons = reasons; this.evidence = evidence;
  }
}

export interface GroundCameraCutawayPose extends GroundCameraPose {
  strategy: 'cutaway';
  /** Raw occlusion still requires a separately verified local render cutaway. */
  cutawayRequired: boolean;
  frameCertificate?: CameraFrameCertificate;
  rawEyeClear: boolean;
  exceptionsExplicit: boolean;
}

const CHEST = 1.15, BODY_RADIUS = .2;
const RINGS = [[.69, .59], [1.035, .59], [1.20, .355], [1.30, .20],
  [1.45, .30], [1.60, .20], [1.685, .04]] as const;
/** Exact segment-to-original OBB distance; ranking only, never authorization. */
function segmentBoxReserve(start: Vector3, end: Vector3,
  collider: { center: Vector3; inverse: Quaternion; half: Vector3 }) {
  const a = start.clone().sub(collider.center).applyQuaternion(collider.inverse);
  const delta = end.clone().sub(start).applyQuaternion(collider.inverse);
  const cuts = [0, 1];
  for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(delta[axis]) > 1e-12)
    for (const sign of [-1, 1]) {
      const t = (sign * collider.half[axis] - a[axis]) / delta[axis];
      if (t > 0 && t < 1) cuts.push(t);
    }
  cuts.sort((x, y) => x - y);
  const distanceSquared = (t: number) => {
    let squared = 0;
    for (const axis of ['x', 'y', 'z'] as const) {
      const excess = Math.max(0, Math.abs(a[axis] + delta[axis] * t) - collider.half[axis]);
      squared += excess * excess;
    }
    return squared;
  };
  let best = Math.min(distanceSquared(0), distanceSquared(1));
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1]!, high = cuts[i]!, middle = (low + high) / 2;
    let numerator = 0, denominator = 0;
    for (const axis of ['x', 'y', 'z'] as const) {
      const at = a[axis] + delta[axis] * middle;
      if (Math.abs(at) <= collider.half[axis]) continue;
      const offset = a[axis] - Math.sign(at) * collider.half[axis];
      numerator += delta[axis] * offset; denominator += delta[axis] ** 2;
    }
    best = Math.min(best, distanceSquared(denominator ? MathUtils.clamp(-numerator / denominator, low, high) : middle));
  }
  return Math.sqrt(best);
}

const clamp = MathUtils.clamp;
const finiteVector = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const tangent = (v: Vector3, up: Vector3, fallback = new Vector3(0, 0, -1)) => {
  const result = finiteVector(v) ? v.clone().projectOnPlane(up) : new Vector3();
  if (result.lengthSq() < 1e-10) result.copy(finiteVector(fallback) ? fallback : new Vector3(0, 0, -1)).projectOnPlane(up);
  if (result.lengthSq() < 1e-10) result.set(1, 0, 0).projectOnPlane(up);
  return result.normalize();
};

/** Isolated B: physical camera motion and composition; occlusion is render data. */
export class GroundCameraCutawayRig {
  private up?: Vector3;
  private heading?: Vector3;
  private pitch = 0;
  private eye?: Vector3;
  private view?: Vector3;
  private feet?: Vector3;

  reset() {
    this.up = this.heading = this.eye = this.view = this.feet = undefined;
    this.pitch = 0;
  }

  update(input: GroundCameraCutawayInput): GroundCameraCutawayPose {
    const up = finiteVector(input.up) && input.up.lengthSq() > 1e-10
      ? input.up.clone().normalize() : this.up?.clone() ?? new Vector3(0, 1, 0);
    const transport = this.up ? new Quaternion().setFromUnitVectors(this.up, up) : new Quaternion();
    const oldHeading = this.heading?.clone().applyQuaternion(transport);
    const oldView = this.view?.clone().applyQuaternion(transport);
    const desiredHeading = tangent(input.heading, up, oldHeading);
    const heading = oldHeading ? tangent(oldHeading, up) : desiredHeading.clone();
    const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, .05) : 0;
    // Only reset/first entry has no motion history. A repeated instant hint
    // must never bypass the swept movement or visual angular-rate contract.
    const instant = !oldHeading || !this.eye;
    const pendingYaw = Math.atan2(up.dot(new Vector3().crossVectors(heading, desiredHeading)), heading.dot(desiredHeading));
    if (instant) heading.copy(desiredHeading);
    else heading.applyAxisAngle(up, pendingYaw * (1 - Math.exp(-12 * dt))).normalize();
    const yawStep = oldHeading ? Math.atan2(up.dot(new Vector3().crossVectors(oldHeading, heading)), oldHeading.dot(heading)) : 0;
    const oldPitch = this.pitch, desiredPitch = clamp(Number.isFinite(input.pitch) ? input.pitch : oldPitch, -.3, .7);
    const pitch = instant ? desiredPitch : MathUtils.lerp(oldPitch, desiredPitch, 1 - Math.exp(-12 * dt));
    const pitchStep = Math.abs(pitch - oldPitch), angleBudget = 3 * dt + Math.abs(yawStep) + pitchStep;
    const anchor = input.feet.clone().addScaledVector(up, CHEST);
    const right = new Vector3().crossVectors(heading, up).normalize();
    const large = input.radius > 20;
    const back = large ? (input.portrait ? 8 : 7.2) : (input.portrait ? 9 : 6.8);
    const height = large ? (input.portrait ? 3.8 : 3.6) : (input.portrait ? 6.4 : 4.6);
    const shoulder = input.portrait ? .22 : .35;
    const arm = heading.clone().multiplyScalar(-back).addScaledVector(up, height - CHEST).applyAxisAngle(right, pitch)
      .addScaledVector(right, shoulder);
    const aim = heading.clone().multiplyScalar(large ? 1.1 : 1.6).addScaledVector(up, large ? 0 : -.3)
      .applyAxisAngle(right, pitch).addScaledVector(right, shoulder);
    const nominal = aim.clone().sub(arm).normalize();
    const nominalElevation = Math.asin(clamp(nominal.dot(up), -1, 1));
    const desiredDistance = arm.length(), nominalEye = anchor.clone().add(arm);
    const fov = input.fov !== undefined && Number.isFinite(input.fov) && input.fov > 1 && input.fov < 179
      ? input.fov : input.portrait ? 62 : 54;
    const aspect = input.aspect !== undefined && Number.isFinite(input.aspect) && input.aspect > 0
      ? input.aspect : input.portrait ? 390 / 844 : 1.3;
    const tv = Math.tan(MathUtils.degToRad(fov) / 2), th = tv * aspect;
    const points: Vector3[] = [];
    for (const [y, radius] of RINGS) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = radius / Math.cos(Math.PI / 8);
      points.push(input.feet.clone().addScaledVector(up, y).addScaledVector(right, Math.cos(a) * r)
        .addScaledVector(heading, Math.sin(a) * r));
    }
    // Keep all original56 supports, and constrain the same fit intervals by
    // the existing upper-body animation envelope when supplied by the host.
    // This is framing only: no new collider, mesh or cutaway exemption exists.
    if (input.framingPoints) {
      if (input.framingPoints.some(point => !finiteVector(point))) throw new GroundCameraConflict(['invalid-original-upper-framing-points']);
      points.push(...input.framingPoints.map(point => point.clone()));
    }
    const separation = (p: Vector3) => {
      const offset = p.clone().sub(input.feet), y = offset.dot(up);
      return Math.hypot(Math.max(0, offset.projectOnPlane(up).length() - .60), Math.max(.65 - y, y - 1.71, 0));
    };
    const yaw = (look: Vector3) => {
      const h = tangent(look, up, heading);
      return Math.atan2(up.dot(new Vector3().crossVectors(heading, h)), heading.dot(h));
    };
    const project = (p: Vector3, look: Vector3) => {
      const r = new Vector3().crossVectors(look, up).normalize(), u = new Vector3().crossVectors(r, look).normalize();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, depth = Infinity;
      for (const point of points) {
        const v = point.clone().sub(p), z = v.dot(look), x = v.dot(r) / (z * th), y = v.dot(u) / (z * tv);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); depth = Math.min(depth, z);
      }
      const width = (maxX - minX) / 2, frameHeight = (maxY - minY) / 2;
      const extent = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
      return { width, height: frameHeight, extent, good: depth > .12 && extent < .95
        && width <= .75 && frameHeight <= .75 };
    };
    const fit = (p: Vector3) => {
      if (p.distanceTo(anchor) < 1.25 || p.distanceTo(anchor) > desiredDistance + .25 || separation(p) < .55) return undefined;
      const inward = tangent(anchor.clone().sub(p), up, heading), inwardYaw = yaw(inward);
      // Optical aim follows the occupied eye without commanding the character.
      // Every bearing still solves the same projection/pitch/rate intervals.
      const solveBearing = (bearing: number, rateLimited: boolean) => {
        const h = heading.clone().applyAxisAngle(up, bearing), r = new Vector3().crossVectors(h, up).normalize();
        let low = nominalElevation - .30, high = Math.min(nominalElevation + .30, Math.max(0, nominalElevation));
        let minBeta = Infinity, maxBeta = -Infinity;
        const half = Math.atan(tv * (.95 - 1e-6));
        for (const point of points) {
          const v = point.clone().sub(p), x = v.dot(r), z = v.dot(h), y = v.dot(up), range = Math.hypot(z, y), beta = Math.atan2(y, z);
          const d = Math.max(.12, Math.abs(x) / (th * (.95 - 1e-6)));
          if (range <= d) { low = 1; high = 0; break; }
          const horizontalHalf = Math.acos(clamp(d / range, -1, 1));
          low = Math.max(low, beta - half, beta - horizontalHalf); high = Math.min(high, beta + half, beta + horizontalHalf);
          minBeta = Math.min(minBeta, beta); maxBeta = Math.max(maxBeta, beta);
        }
        const delta = (maxBeta - minBeta) / 2, middle = (minBeta + maxBeta) / 2;
        const spanCosine = Math.sin(2 * delta) / (.75 * tv) - Math.cos(2 * delta);
        if (spanCosine > 1 || low > high) return undefined;
        const spanHalf = .5 * Math.acos(clamp(spanCosine, -1, 1));
        low = Math.max(low, middle - spanHalf); high = Math.min(high, middle + spanHalf);
        if (rateLimited && !instant && oldView) {
          const a = oldView.dot(h), b = oldView.dot(up), range = Math.hypot(a, b), cosine = Math.cos(Math.min(Math.PI, angleBudget));
          if (range < cosine) return undefined;
          const beta = Math.atan2(b, a), rateHalf = Math.acos(clamp(cosine / range, -1, 1));
          low = Math.max(low, beta - rateHalf); high = Math.min(high, beta + rateHalf);
        }
        if (low > high) return undefined;
        const angles = [clamp(nominalElevation, low, high), ...Array.from({ length: 7 }, (_, i) => low + (high - low) * i / 6)];
        for (const a of angles) {
          const direction = h.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).normalize();
          const frame = project(p, direction);
          if (frame.good && (!rateLimited || instant || !oldView || oldView.angleTo(direction) <= angleBudget + 1e-7)) return { direction, frame };
        }
        return undefined;
      };
      const control = solveBearing(0, true);
      // Follow the safe eye's inward bearing continuously, before the avatar
      // reaches a viewport edge. A displaced eye with a control-aligned look
      // spends its optical/turn margin while standing and can dead-end on the
      // next ordinary step. The same solve and true 3D rate bound below apply.
      const inwardBearing = clamp(inwardYaw, -Math.PI / 2, Math.PI / 2);
      const target = solveBearing(inwardBearing, false) ?? control;
      if (!target) return undefined;
      if (instant || !oldView || oldView.angleTo(target.direction) <= angleBudget + 1e-7) return target;
      // Intersect the desired framing correction with the true 3D angular
      // budget, then solve its pitch interval again. A tiny legal correction
      // must not be rejected because the fully centred view is too far away.
      const turn = oldView.angleTo(target.direction);
      const rotation = new Quaternion().setFromUnitVectors(oldView, target.direction);
      const bounded = oldView.clone().applyQuaternion(new Quaternion().slerp(rotation, angleBudget / turn)).normalize();
      return solveBearing(clamp(yaw(bounded), -Math.PI / 2, Math.PI / 2), true) ?? control;
    };
    const cache = new Map<string, number>();
    const probe = (a: Vector3, b: Vector3, radius: number) => {
      const key = `${radius}|${a.toArray()}|${b.toArray()}`;
      const old = cache.get(key); if (old !== undefined) return old;
      const raw = input.probe(a.clone(), b.clone(), radius), distance = a.distanceTo(b);
      const value = Number.isNaN(raw) ? 0 : clamp(raw, 0, distance); cache.set(key, value); return value;
    };
    const occupied = (p: Vector3) => probe(p, p.clone().addScaledVector(up, .001), BODY_RADIUS) < .001 - 1e-7;
    let lastFrameCertificate: CameraFrameCertificate | undefined;
    const diagnostics = input.diagnostics;
    const certify = (p: Vector3, goal: Vector3, composition = fit(p)) => {
      const attempt: GroundCameraCutawayDiagnostics['candidates'][number] | undefined = diagnostics ? {
        index: diagnostics.candidates.length, goal: goal.toArray(), eye: p.toArray(),
        status: 'fit-rejected', armDistance: p.distanceTo(anchor), avatarClearance: separation(p),
      } : undefined;
      if (attempt) diagnostics!.candidates.push(attempt);
      if (!composition) return undefined;
      if (attempt) { attempt.direction = composition.direction.toArray(); attempt.projection = { ...composition.frame }; }
      if (input.certifyFrame) {
        const frameCertificate = input.certifyFrame({ previousEye: this.eye?.clone(), eye: p.clone(),
          direction: composition.direction.clone(), feet: input.feet.clone(), up: up.clone(), probeRadius: BODY_RADIUS });
        lastFrameCertificate = frameCertificate;
        if (attempt) { attempt.frameCertificate = structuredClone(frameCertificate.diagnostics); attempt.status = frameCertificate.accepted ? 'accepted' : 'frame-rejected'; }
        if (!frameCertificate.accepted) return undefined;
        return { ...composition, frameCertificate, attemptIndex: attempt?.index };
      }
      // Non-exception use keeps the unfiltered collision contract. It cannot
      // acquire permissions merely by constructing this rig.
      if (occupied(p) || (this.eye && probe(this.eye, p, BODY_RADIUS) < this.eye.distanceTo(p) - 1e-7)) {
        if (attempt) attempt.status = 'raw-physical-rejected';
        return undefined;
      }
      if (attempt) attempt.status = 'accepted';
      return { ...composition, frameCertificate: undefined, attemptIndex: attempt?.index };
    };
    const origin = this.eye ?? nominalEye;
    const translation = this.feet ? this.feet.distanceTo(input.feet) : 0;
    const maximumStep = Math.min(CAMERA_FRAME_MAX_SWEEP,
      12 * dt + desiredDistance * (Math.abs(yawStep) + pitchStep) + translation);
    const stepToward = (goal: Vector3) => !this.eye ? goal.clone()
      : origin.clone().lerp(goal, Math.min(1, maximumStep / Math.max(1e-10, origin.distanceTo(goal))));
    if (diagnostics) {
      diagnostics.status = 'running'; diagnostics.candidates.length = 0;
      delete diagnostics.selectedCandidate; delete diagnostics.reasons;
      diagnostics.context = {
        input: { feet: input.feet.toArray(), up: input.up.toArray(), heading: input.heading.toArray(),
          pitch: input.pitch, radius: input.radius, dt: input.dt, portrait: input.portrait, fov: input.fov, aspect: input.aspect, instant: input.instant },
        history: { up: this.up?.toArray() ?? null, heading: this.heading?.toArray() ?? null,
          eye: this.eye?.toArray() ?? null, view: this.view?.toArray() ?? null, feet: this.feet?.toArray() ?? null, pitch: this.pitch },
        resolved: { up: up.toArray(), heading: heading.toArray(), pitch, dt, instant, transport: transport.toArray(),
          oldHeading: oldHeading?.toArray() ?? null, oldView: oldView?.toArray() ?? null,
          yawStep, pitchStep, angleBudget, anchor: anchor.toArray(), right: right.toArray(),
          nominalEye: nominalEye.toArray(), nominalDirection: nominal.toArray(), nominalElevation,
          desiredDistance, maximumStep, translation, fov, aspect },
      };
    }
    // Rank only the existing bounded goals. Certification remains the hard
    // gate; these distances are preferences and grant no new exception.
    const margins = (p: Vector3, result: NonNullable<ReturnType<typeof certify>>) => {
      const frame = result.frameCertificate, plan = frame?.plan;
      let optical = Infinity, guardEnd = Infinity, protectedCentral = Infinity;
      // The explicit playable policy protects chest/head rays. Preserve a
      // visibility reserve before a column reaches either ray: raw hits alone
      // detect the obstruction only after every rate-bounded eye can be trapped.
      // Existing optical broadphase candidates bound this preference's work.
      if (plan && frame?.diagnostics.visibilityPolicy?.mode === 'playable-central') {
        const bodies = new Map(plan.world.bodies.map(body => [body.objectId, body]));
        for (const candidate of plan.opticalCandidates) {
          if (candidate.eligible) continue;
          const collider = bodies.get(candidate.objectId)?.colliders[candidate.colliderIndex];
          if (!collider) continue;
          for (const target of plan.rayTargets.slice(0, 2))
            protectedCentral = Math.min(protectedCentral, segmentBoxReserve(p, new Vector3(...target), collider));
        }
      }
      const guardEndpoints: NonNullable<GroundCameraCutawayDiagnostics['candidates'][number]['margins']>['guardEndpoints'] = [];
      if (plan) {
        const cone = plan.visualCone, coneEye = new Vector3(...cone.eye);
        const axis = new Vector3(...cone.target).sub(coneEye).normalize();
        const capsuleStart = new Vector3(...plan.cameraCapsule.start);
        const capsuleDelta = new Vector3(...plan.cameraCapsule.end).sub(capsuleStart), capsuleLengthSq = capsuleDelta.lengthSq();
        const slope = (cone.radiusAtTarget - cone.radiusAtEye) / cone.length;
        for (const hit of plan.rawHits) {
          const mask = plan.masks.find(value => value.key === hit.maskKey);
          const target = plan.rayTargets[hit.rayIndex];
          if (!mask || !target) continue;
          const ray = new Vector3(...target).sub(p).normalize();
          const disjoint = frame!.diagnostics.avatarOptical.disjointGuardHits.some(value => value.objectId === hit.objectId
            && value.colliderIndex === hit.colliderIndex && value.rayIndex === hit.rayIndex);
          let coneReserve = Infinity, partReserve = Infinity, capsuleReserve = Infinity;
          for (const endpoint of ['enter', 'exit'] as const) {
            const point = p.clone().addScaledVector(ray, hit[endpoint]), offset = point.clone().sub(coneEye), along = offset.dot(axis);
            const end = cone.length - cone.endOffset - along;
            const radial = (cone.radiusAtEye + slope * along) * mask.amount - offset.clone().addScaledVector(axis, -along).length();
            const height = point.clone().sub(input.feet).dot(up) - cone.minHeight;
            const local = point.clone().sub(new Vector3(...mask.center)).applyQuaternion(new Quaternion(...mask.inverseQuaternion));
            const part = Math.min(mask.half[0] - Math.abs(local.x), mask.half[1] - Math.abs(local.y), mask.half[2] - Math.abs(local.z));
            const closest = capsuleStart.clone().addScaledVector(capsuleDelta, capsuleLengthSq
              ? clamp(point.clone().sub(capsuleStart).dot(capsuleDelta) / capsuleLengthSq, 0, 1) : 0);
            const capsule = plan.cameraCapsule.radius - point.distanceTo(closest);
            guardEnd = Math.min(guardEnd, end);
            if (diagnostics) guardEndpoints.push({ objectId: hit.objectId, colliderIndex: hit.colliderIndex, rayIndex: hit.rayIndex,
              endpoint, end, radial, height, part, capsule });
            coneReserve = Math.min(coneReserve, along, end, height, radial / Math.hypot(1, slope * mask.amount));
            partReserve = Math.min(partReserve, part); capsuleReserve = Math.min(capsuleReserve, capsule);
          }
          // A truly avatar-disjoint guard need not be cut. Otherwise use the
          // complete interval's reserve in either already-certified convex set.
          if (!disjoint) optical = Math.min(optical, partReserve, Math.max(coneReserve,
            mask.physical && mask.colliderBoundsContained && mask.amount === 1 ? capsuleReserve : -Infinity));
        }
      }
      const distance = p.distanceTo(anchor);
      const armReserve = Math.min(distance - 1.25, desiredDistance + .25 - distance);
      // Convert the projection reserve to distance at the occupied arm. This
      // avoids adding unlike metre and viewport units to a weighted score.
      const composition = Math.min(.95 - result.frame.extent, .75 - result.frame.width, .75 - result.frame.height) * distance * Math.min(tv, th);
      const angular = oldView ? angleBudget - oldView.angleTo(result.direction) : null;
      const step = maximumStep - p.distanceTo(origin), maximumSweep = CAMERA_FRAME_MAX_SWEEP - p.distanceTo(origin);
      return { guardEnd: Number.isFinite(guardEnd) ? guardEnd : null, optical: Number.isFinite(optical) ? optical : null,
        arm: armReserve, composition, angular, step, maximumSweep,
        endpointRawClear: frame?.rawEndpointClear ?? true, sweepRawClear: frame?.rawSweepClear ?? true,
        reserve: Math.min(optical, armReserve, composition, protectedCentral),
        protectedCentral: Number.isFinite(protectedCentral) ? protectedCentral : null, nominalDistance: p.distanceTo(nominalEye), guardEndpoints };
    };
    let position = stepToward(nominalEye), certificate = certify(position, nominalEye);
    let selectedMargins = certificate ? margins(position, certificate) : undefined;
    if (certificate && diagnostics && certificate.attemptIndex !== undefined) diagnostics.candidates[certificate.attemptIndex]!.margins = selectedMargins;
    // An ordinary, fully raw-clear nominal return needs no mask or exception.
    // Other accepted eyes still compete with all existing goals before commit.
    const clearNominal = certificate && (!certificate.frameCertificate || (certificate.frameCertificate.rawEndpointClear
      && certificate.frameCertificate.rawSweepClear && certificate.frameCertificate.plan.rawHits.length === 0
      && certificate.frameCertificate.plan.mandatoryParts.length === 0 && certificate.frameCertificate.plan.visualRequiredParts.length === 0))
      && (selectedMargins?.protectedCentral === null || selectedMargins?.protectedCentral === undefined
        || selectedMargins.protectedCentral > Math.min(selectedMargins.arm, selectedMargins.composition));
    if (!clearNominal) {
      const followed = this.eye && this.feet
        ? input.feet.clone().add(this.eye.clone().sub(this.feet).applyQuaternion(transport).applyAxisAngle(up, yawStep))
        : nominalEye.clone();
      const side = Math.sign(followed.clone().sub(nominalEye).dot(right)) || 1;
      const boundedSide = (sign: number) => anchor.clone().add(
        followed.clone().addScaledVector(right, sign * maximumStep).sub(anchor)
          .clampLength(0, desiredDistance + .25 - 1e-6));
      const goals = [followed, boundedSide(side), boundedSide(-side)];
      if (this.eye && this.feet) {
        const offset = input.feet.clone().add(this.eye.clone().sub(this.feet)
          .applyQuaternion(transport)).sub(anchor);
        const horizontal = offset.clone().projectOnPlane(up);
        horizontal.setLength(Math.max(0, horizontal.length() - maximumStep));
        goals.push(anchor.clone().add(horizontal).addScaledVector(up, offset.dot(up)));
      }
      for (const scale of [.85, .65, .45]) goals.push(anchor.clone().add(arm.clone().projectOnPlane(up).multiplyScalar(scale)).addScaledVector(up, arm.dot(up)));
      // Stable local support directions add the vertical degree of freedom
      // absent from the original followed/side/retracted goals. Every eye
      // remains inside the same per-frame step sphere and hard fit/cert gates.
      const inwardSupport = tangent(anchor.clone().sub(origin), up, heading);
      const desiredSupport = tangent(nominalEye.clone().sub(origin), up, heading);
      for (const sign of [-1, 1]) goals.push(origin.clone().addScaledVector(up, sign * maximumStep));
      for (const horizontal of [inwardSupport, desiredSupport]) for (const sign of [-1, 1])
        goals.push(origin.clone().add(horizontal.clone().addScaledVector(up, sign).normalize().multiplyScalar(maximumStep)));
      for (const goal of goals) {
        const candidate = stepToward(goal), composition = fit(candidate);
        if (composition && certificate && selectedMargins) {
          const distance = candidate.distanceTo(anchor);
          const upperBound = Math.min(distance - 1.25, desiredDistance + .25 - distance,
            Math.min(.95 - composition.frame.extent, .75 - composition.frame.width, .75 - composition.frame.height)
              * distance * Math.min(tv, th));
          const nominalDistance = candidate.distanceTo(nominalEye);
          // The exact score is min(optical, arm, composition), hence it cannot
          // exceed this bound. A candidate can win only by >tolerance reserve,
          // or by a reserve tie with strictly better nominal proximity.
          // Keep every candidate that could win either branch of that rule.
          const canImproveReserve = upperBound > selectedMargins.reserve + 1e-7;
          const canImproveTie = upperBound >= selectedMargins.reserve - 1e-7
            && nominalDistance < selectedMargins.nominalDistance - 1e-7;
          if (!canImproveReserve && !canImproveTie) {
            if (diagnostics) diagnostics.candidates.push({ index: diagnostics.candidates.length,
              goal: goal.toArray(), eye: candidate.toArray(), status: 'margin-dominated', armDistance: distance,
              avatarClearance: separation(candidate), direction: composition.direction.toArray(), projection: { ...composition.frame },
              rankUpperBound: { reserve: upperBound, nominalDistance } });
            continue;
          }
        }
        const result = certify(candidate, goal, composition);
        if (!result) continue;
        const candidateMargins = margins(candidate, result);
        if (diagnostics && result.attemptIndex !== undefined) diagnostics.candidates[result.attemptIndex]!.margins = candidateMargins;
        // The tolerance only resolves floating-point ties; it is never a
        // clearance threshold. Stable goal order is the final tie breaker.
        if (!certificate || !selectedMargins || candidateMargins.reserve > selectedMargins.reserve + 1e-7
          || (Math.abs(candidateMargins.reserve - selectedMargins.reserve) <= 1e-7
            && candidateMargins.nominalDistance < selectedMargins.nominalDistance - 1e-7)) {
          position = candidate; certificate = result; selectedMargins = candidateMargins;
        }
      }
    }
    if (!certificate) {
      if (diagnostics) { diagnostics.status = 'conflict'; diagnostics.reasons = lastFrameCertificate?.diagnostics.reasons ?? ['composition-or-physical-domain']; }
      throw new GroundCameraConflict(lastFrameCertificate?.diagnostics.reasons ?? ['composition-or-physical-domain'], lastFrameCertificate?.diagnostics);
    }
    if (certificate.frameCertificate && (!input.commitFrame || !input.commitFrame(certificate.frameCertificate))) {
      if (diagnostics) { diagnostics.status = 'conflict'; diagnostics.reasons = ['frame-commit-rejected']; }
      throw new GroundCameraConflict(['frame-commit-rejected'], certificate.frameCertificate.diagnostics);
    }
    if (diagnostics) { diagnostics.status = 'accepted'; diagnostics.selectedCandidate = certificate.attemptIndex; }
    const direction = certificate.direction, distance = position.distanceTo(anchor);
    const opticalDistance = probe(anchor, position, 0), cutawayRequired = opticalDistance < distance - 1e-7;
    const framingPitch = Math.asin(clamp(direction.dot(up), -1, 1)) - nominalElevation;
    this.up = up.clone(); this.heading = heading.clone(); this.pitch = pitch;
    this.eye = position.clone(); this.view = direction.clone(); this.feet = input.feet.clone();
    return { position, target: position.clone().add(direction), up, direction, heading, pitch,
      distance, desiredDistance, probeRadius: BODY_RADIUS, centerDistance: probe(anchor, nominalEye, BODY_RADIUS),
      shoulder: shoulder / desiredDistance, avoidanceYaw: yaw(direction), avoidanceTargetYaw: 0,
      framingLimited: false, warningDistance: probe(anchor, nominalEye, .4), opticalDistance, eyeClear: true,
      frameWidth: certificate.frame.width, frameHeight: certificate.frame.height, avatarClearance: separation(position),
      framingPitch, strategy: 'cutaway', cutawayRequired, frameCertificate: certificate.frameCertificate,
      rawEyeClear: certificate.frameCertificate?.rawEndpointClear ?? !occupied(position),
      exceptionsExplicit: certificate.frameCertificate?.diagnostics.exceptionsExplicit ?? false };
  }
}
