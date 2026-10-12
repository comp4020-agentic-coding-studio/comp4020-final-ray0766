import { MathUtils, Quaternion, Vector3 } from 'three';

export interface GroundCameraInput {
  feet: Vector3;
  up: Vector3;
  heading: Vector3;
  /** Radians relative to the default downward view. Positive looks upward. */
  pitch: number;
  portrait: boolean;
  radius: number;
  /** Actual renderer projection; omitted values retain the hub defaults. */
  fov?: number;
  aspect?: number;
  dt: number;
  instant?: boolean;
  /** Maximum safe distance from start toward end, including the probe radius. */
  probe: (start: Vector3, end: Vector3, radius: number) => number;
}

export interface GroundCameraPose {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  direction: Vector3;
  /** Smoothed control orientation, independent of the resolved camera eye. */
  heading: Vector3;
  pitch: number;
  distance: number;
  desiredDistance: number;
  probeRadius: number;
  /** Central arm clearance, before the bounded shoulder shift. */
  centerDistance: number;
  shoulder: number;
  /** Visual avoidance only; never fed back into control heading. Radians. */
  avoidanceYaw: number;
  avoidanceTargetYaw: number;
  /** The courier upper-body silhouette cannot be framed in safe space. */
  framingLimited: boolean;
  /** Wider warning probe, not the collision radius used by the resolved eye. */
  warningDistance: number;
  /** Thin visibility ray; the camera body still uses probeRadius. */
  opticalDistance: number;
  eyeClear: boolean;
  /** Upper-body projected bounds, as fractions of the viewport. */
  frameWidth: number;
  frameHeight: number;
  /** Separation from the conservative upper-body occupied volume, metres. */
  avatarClearance: number;
  /** Visual pitch correction relative to the independent control view. */
  framingPitch: number;
}

const CHEST_HEIGHT = 1.15;
const PROBE_RADIUS = .2;
const OPTICAL_RADIUS = 0;
const ENDPOINT_STEP = .001;
const LOOK_RESPONSE = 12;
const RECOVERY_RESPONSE = 3;
const SHOULDER_RESPONSE = 8;
const MIN_PITCH = -.3;
const MAX_PITCH = .7;
const EPSILON = 1e-10;
const WARNING_RADIUS = .4;
const AVOIDANCE_RESPONSE = 10;
const RETURN_RESPONSE = 3;
const CANDIDATE_ANGLES = [30, 45, 60, 75, 90];

// Circumscribed horizontal rings cover the courier's head, ears, shoulder
// coat and rear satchel regardless of the actor's current facing. Heights
// include the root offset and walking bob; this is not a camera-distance cap.
const BODY_RINGS = [[.69, .59], [1.035, .59], [1.20, .355], [1.30, .20],
  [1.45, .30], [1.60, .20], [1.685, .04]] as const;
const FRAME_MARGIN = .95;
const FRAME_NEAR = .12;
const MAX_FRAME_PITCH = .30;
const MAX_FRAME_SPAN = .75;
const MIN_OBSERVATION_DISTANCE = 1.25;
const MIN_AVATAR_CLEARANCE = .55;

function upperBody(feet: Vector3, up: Vector3, heading: Vector3) {
  const right = new Vector3().crossVectors(heading, up).normalize();
  const points: Vector3[] = [];
  for (const [height, radius] of BODY_RINGS) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const bound = radius / Math.cos(Math.PI / 8);
      points.push(feet.clone().addScaledVector(up, height)
        .addScaledVector(right, Math.cos(angle) * bound)
        .addScaledVector(heading, Math.sin(angle) * bound));
    }
  }
  return points;
}

const finiteVector = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function tangent(heading: Vector3, up: Vector3, previous?: Vector3) {
  const result = finiteVector(heading) ? heading.clone().projectOnPlane(up) : new Vector3();
  if (result.lengthSq() < EPSILON && previous) result.copy(previous).projectOnPlane(up);
  if (result.lengthSq() < EPSILON) {
    result.set(0, 0, -1).projectOnPlane(up);
    if (result.lengthSq() < EPSILON) result.set(1, 0, 0).projectOnPlane(up);
  }
  return result.normalize();
}

/** Ground-only control frame and collision-resolved follow arm. No player mutation. */
export class GroundCameraRig {
  private previousUp?: Vector3;
  private heading?: Vector3;
  private pitch = 0;
  private distance?: number;
  private shoulder = 0;
  private eye?: Vector3;
  private viewDirection?: Vector3;
  private previousFeet?: Vector3;
  private avoidance = 0;
  private clearTime = 0;
  private returning = false;
  private route?: { yaw: number; radius: number; height: number };

  reset() {
    this.previousUp = undefined;
    this.heading = undefined;
    this.pitch = 0;
    this.distance = undefined;
    this.shoulder = 0;
    this.eye = undefined;
    this.viewDirection = undefined;
    this.previousFeet = undefined;
    this.avoidance = 0;
    this.clearTime = 0;
    this.returning = false;
    this.route = undefined;
  }

  update(input: GroundCameraInput): GroundCameraPose {
    const up = finiteVector(input.up) && input.up.lengthSq() > EPSILON
      ? input.up.clone().normalize() : this.previousUp?.clone() ?? new Vector3(0, 1, 0);
    const priorView = this.viewDirection?.clone();
    if (priorView && this.previousUp) priorView.applyQuaternion(new Quaternion().setFromUnitVectors(this.previousUp, up));
    const transported = this.heading?.clone();
    if (transported && this.previousUp) {
      transported.applyQuaternion(new Quaternion().setFromUnitVectors(this.previousUp, up));
    }
    const desiredHeading = tangent(input.heading, up, transported);
    const desiredPitch = MathUtils.clamp(Number.isFinite(input.pitch) ? input.pitch : this.pitch, MIN_PITCH, MAX_PITCH);
    const dt = Number.isFinite(input.dt) ? Math.max(0, input.dt) : 0;
    const instant = input.instant || !transported;
    const heading = instant ? desiredHeading : tangent(transported!, up);
    if (!instant) {
      const turn = Math.atan2(up.dot(new Vector3().crossVectors(heading, desiredHeading)), heading.dot(desiredHeading));
      heading.applyAxisAngle(up, turn * (1 - Math.exp(-LOOK_RESPONSE * dt))).projectOnPlane(up).normalize();
    }
    const previousPitch = this.pitch;
    this.pitch = instant ? desiredPitch : MathUtils.lerp(this.pitch, desiredPitch, 1 - Math.exp(-LOOK_RESPONSE * dt));
    const oldControl = transported ? tangent(transported, up) : heading;
    const controlYaw = Math.atan2(up.dot(new Vector3().crossVectors(oldControl, heading)), oldControl.dot(heading));
    const controlTurn = Math.abs(controlYaw);
    const maxViewTurn = 3 * dt + controlTurn + Math.abs(this.pitch - previousPitch);
    this.heading = heading.clone();

    const degrees = input.fov !== undefined && Number.isFinite(input.fov) && input.fov > 1 && input.fov < 179
      ? input.fov : input.portrait ? 62 : 54;
    const aspect = input.aspect !== undefined && Number.isFinite(input.aspect) && input.aspect > 0
      ? input.aspect : input.portrait ? 390 / 844 : 1.3;
    const halfHeight = Math.tan(MathUtils.degToRad(degrees) / 2);
    const halfWidth = halfHeight * aspect;
    const bodyPoints = upperBody(input.feet, up, heading);
    const avatarClearance = (eye: Vector3) => {
      const offset = eye.clone().sub(input.feet), height = offset.dot(up);
      const radial = offset.clone().projectOnPlane(up).length();
      // Includes the rear satchel and the possible forward parcel. This is a
      // visual separation guard, not a change to the avatar collision shape.
      return Math.hypot(Math.max(0, radial - .60), Math.max(.65 - height, height - 1.71, 0));
    };
    const observationSafe = (eye: Vector3) => eye.distanceTo(input.feet.clone().addScaledVector(up, CHEST_HEIGHT)) >= MIN_OBSERVATION_DISTANCE - 1e-7
      && avatarClearance(eye) >= MIN_AVATAR_CLEARANCE - 1e-7;
    const projection = (eye: Vector3, look: Vector3) => {
      const viewRight = new Vector3().crossVectors(look, up).normalize();
      const vertical = new Vector3().crossVectors(viewRight, look).normalize();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, inside = true;
      for (const point of bodyPoints) {
        const offset = point.clone().sub(eye), depth = offset.dot(look);
        const x = offset.dot(viewRight) / (depth * halfWidth), y = offset.dot(vertical) / (depth * halfHeight);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (depth <= FRAME_NEAR || Math.abs(x) >= FRAME_MARGIN || Math.abs(y) >= FRAME_MARGIN) inside = false;
      }
      return { inside, width: (maxX - minX) / 2, height: (maxY - minY) / 2 };
    };
    const isFramed = (eye: Vector3, look: Vector3) => {
      const bounds = projection(eye, look);
      return observationSafe(eye) && bounds.inside && bounds.width <= MAX_FRAME_SPAN && bounds.height <= MAX_FRAME_SPAN;
    };
    const visualYaw = (look: Vector3) => {
      const visualHeading = tangent(look, up, heading);
      return Math.atan2(up.dot(new Vector3().crossVectors(heading, visualHeading)), heading.dot(visualHeading));
    };
    const directionBounded = (look: Vector3) => Math.abs(visualYaw(look)) <= Math.PI / 2 + 1e-7
      && (instant || !priorView || priorView.angleTo(look) <= maxViewTurn + 1e-7);
    const fitLook = (eye: Vector3, nominal: Vector3, rateLimited = false) => {
      if (!observationSafe(eye)) return { direction: nominal.clone(), framed: false };
      const inwardYaw = visualYaw(nominal);
      const limit = Math.PI / 2 - 1e-6;
      const bounded = MathUtils.clamp(inwardYaw, -limit, limit);
      const bearings = [bounded];
      if (Math.abs(inwardYaw) > MathUtils.degToRad(75)) {
        for (const angle of [75, 80, 85, 89]) bearings.push(Math.sign(inwardYaw) * MathUtils.degToRad(angle));
        if (rateLimited && priorView) {
          const priorYaw = visualYaw(priorView);
          for (const scale of [0, .5, 1]) bearings.push(MathUtils.clamp(priorYaw + Math.sign(bounded - priorYaw) * maxViewTurn * scale, -limit, limit));
        }
        bearings.sort((a, b) => Math.abs(a) - Math.abs(b));
      }
      const fitBearing = (bearing: number) => {
      const horizontal = heading.clone().applyAxisAngle(up, bearing);
      const viewRight = new Vector3().crossVectors(horizontal, up).normalize();
      const nominalPitch = Math.asin(MathUtils.clamp(nominal.dot(up), -1, 1));
      let low = nominalPitch - MAX_FRAME_PITCH;
      // Automatic correction may look less downward, but never turns an
      // otherwise level/downward manual view toward the sky.
      let high = Math.min(nominalPitch + MAX_FRAME_PITCH, Math.max(0, nominalPitch));
      const solveMargin = FRAME_MARGIN - 1e-6;
      const verticalHalfAngle = Math.atan(halfHeight * solveMargin);
      let minBeta = Infinity, maxBeta = -Infinity;
      for (const point of bodyPoints) {
        const offset = point.clone().sub(eye);
        const x = offset.dot(viewRight), z = offset.dot(horizontal), y = offset.dot(up);
        const range = Math.hypot(z, y), beta = Math.atan2(y, z);
        minBeta = Math.min(minBeta, beta); maxBeta = Math.max(maxBeta, beta);
        const requiredDepth = Math.max(FRAME_NEAR, Math.abs(x) / (halfWidth * solveMargin));
        if (range <= requiredDepth) return { direction: nominal.clone(), framed: false };
        const horizontalHalfAngle = Math.acos(MathUtils.clamp(requiredDepth / range, -1, 1));
        low = Math.max(low, beta - verticalHalfAngle, beta - horizontalHalfAngle);
        high = Math.min(high, beta + verticalHalfAngle, beta + horizontalHalfAngle);
        if (low > high) return { direction: nominal.clone(), framed: false };
      }
      // For a fixed horizontal bearing the vertical NDC span depends only on
      // the extreme elevation angles. Intersect its exact <=75% interval.
      const halfSpan = (maxBeta - minBeta) / 2, middle = (minBeta + maxBeta) / 2;
      const spanCosine = Math.sin(2 * halfSpan) / (MAX_FRAME_SPAN * halfHeight) - Math.cos(2 * halfSpan);
      if (spanCosine > 1) return { direction: nominal.clone(), framed: false };
      const spanPitch = .5 * Math.acos(MathUtils.clamp(spanCosine, -1, 1));
      low = Math.max(low, middle - spanPitch); high = Math.min(high, middle + spanPitch);
      if (low > high) return { direction: nominal.clone(), framed: false };
      if (rateLimited && !instant && priorView) {
        const a = priorView.dot(horizontal), b = priorView.dot(up);
        const range = Math.hypot(a, b), cosine = Math.cos(Math.min(Math.PI, maxViewTurn));
        if (range < cosine) return { direction: nominal.clone(), framed: false };
        const beta = Math.atan2(b, a), half = Math.acos(MathUtils.clamp(cosine / range, -1, 1));
        low = Math.max(low, beta - half); high = Math.min(high, beta + half);
        if (low > high) return { direction: nominal.clone(), framed: false };
      }
      const makeDirection = (pitch: number) => horizontal.clone().multiplyScalar(Math.cos(pitch))
        .addScaledVector(up, Math.sin(pitch)).normalize();
      const pitch = MathUtils.clamp(nominalPitch, low + Math.min(1e-7, (high - low) / 2), high - Math.min(1e-7, (high - low) / 2));
      let direction = makeDirection(pitch);
      if (isFramed(eye, direction)) return { direction, framed: true };
      // Horizontal span also depends on point depth. Search only this already
      // bounded pitch interval, and choose the closest valid correction.
      const pitches = Array.from({ length: 9 }, (_, i) => low + (high - low) * i / 8)
        .sort((a, b) => Math.abs(a - nominalPitch) - Math.abs(b - nominalPitch));
      for (const candidate of pitches) {
        direction = makeDirection(candidate);
        if (isFramed(eye, direction)) return { direction, framed: true };
      }
      return { direction: nominal.clone(), framed: false };
      };
      for (const bearing of [...new Set(bearings)]) {
        const fit = fitBearing(bearing);
        if (fit.framed) return fit;
      }
      return { direction: nominal.clone(), framed: false };
    };

    const large = input.radius > 20;
    const back = large ? (input.portrait ? 8 : 7.2) : (input.portrait ? 9 : 6.8);
    const height = large ? (input.portrait ? 3.8 : 3.6) : (input.portrait ? 6.4 : 4.6);
    const anchor = input.feet.clone().addScaledVector(up, CHEST_HEIGHT);
    const maxEyeUp = height - CHEST_HEIGHT + .4;
    const right = new Vector3().crossVectors(heading, up).normalize();
    const arm = heading.clone().multiplyScalar(-back).addScaledVector(up, height - CHEST_HEIGHT)
      .applyAxisAngle(right, this.pitch);
    const targetOffset = heading.clone().multiplyScalar(large ? 1.1 : 1.6)
      .addScaledVector(up, large ? 0 : .85 - CHEST_HEIGHT).applyAxisAngle(right, this.pitch);
    const baseDistance = arm.length();
    const centerProbe = input.probe(anchor.clone(), anchor.clone().add(arm), PROBE_RADIUS);
    const centerDistance = Number.isNaN(centerProbe) ? 0 : MathUtils.clamp(centerProbe, 0, baseDistance);
    // Central clearance drives the shoulder amount, so the shifted probe cannot
    // feed its own shortening back into an ever larger lateral correction.
    const shoulderTarget = (input.portrait ? .18 : .25) * (1 - MathUtils.smoothstep(centerDistance, 1, 2.4));
    this.shoulder = instant ? shoulderTarget
      : MathUtils.lerp(this.shoulder, shoulderTarget, 1 - Math.exp(-SHOULDER_RESPONSE * dt));
    const shoulderOffset = right.clone().multiplyScalar(baseDistance * this.shoulder);
    arm.add(shoulderOffset);
    targetOffset.add(shoulderOffset);
    const desiredDistance = arm.length();
    // Recheck the complete shifted arm. It is never allowed to borrow clearance
    // from the central candidate; both eye and aim then use the same safe ratio.
    const probeDistance = this.shoulder === 0 ? centerDistance
      : input.probe(anchor.clone(), anchor.clone().add(arm), PROBE_RADIUS);
    const conservativeAllowed = Number.isNaN(probeDistance) ? 0 : MathUtils.clamp(probeDistance, 0, desiredDistance);
    const probeCache = new Map<string, number>();
    const safeProbe = (start: Vector3, end: Vector3, radius = PROBE_RADIUS) => {
      // Exact coordinates only: no geometric quantization of collision input.
      const key = `${radius}|${start.x},${start.y},${start.z}|${end.x},${end.y},${end.z}`;
      const cached = probeCache.get(key);
      if (cached !== undefined) return cached;
      const value = input.probe(start.clone(), end.clone(), radius);
      const result = Number.isNaN(value) ? 0 : MathUtils.clamp(value, 0, start.distanceTo(end));
      probeCache.set(key, result);
      return result;
    };
    const endpointClear = (eye: Vector3) => safeProbe(eye, eye.clone().addScaledVector(up, ENDPOINT_STEP), PROBE_RADIUS) >= ENDPOINT_STEP - 1e-7;
    const warningDistance = safeProbe(anchor, anchor.clone().add(arm), WARNING_RADIUS);
    // The wider shell only warns. In a corner the chest may be inside that
    // shell while the actual camera sphere and the player are both clear.
    const followedEye = this.eye && this.previousFeet && this.previousUp
      ? this.eye.clone().sub(this.previousFeet.clone().addScaledVector(this.previousUp, CHEST_HEIGHT))
        .applyQuaternion(new Quaternion().setFromUnitVectors(this.previousUp, up)).applyAxisAngle(up, controlYaw).add(anchor)
      : this.eye?.clone();
    const movement = this.previousFeet && dt > 0
      ? input.feet.clone().sub(this.previousFeet).multiplyScalar(.6 / dt).clampLength(0, 1.5)
      : new Vector3();
    this.previousFeet = input.feet.clone();
    const pendingYaw = Math.atan2(up.dot(new Vector3().crossVectors(heading, desiredHeading)), heading.dot(desiredHeading));
    const forecasts = [.5, 1].map(fraction => {
      const feet = input.feet.clone().addScaledVector(movement, fraction).normalize().multiplyScalar(input.feet.length());
      const normal = feet.clone().normalize();
      return { anchor: feet.addScaledVector(normal, CHEST_HEIGHT), normal, yaw: pendingYaw * (1 - Math.exp(-LOOK_RESPONSE * fraction * .15)),
        transport: new Quaternion().setFromUnitVectors(up, normal) };
    });
    const nominalHeight = Math.min(arm.dot(up), maxEyeUp);
    const nominalHorizontal = arm.clone().projectOnPlane(up);
    const nominalRadius = nominalHorizontal.length();
    const goalRadii = [...new Set([nominalRadius, nominalRadius * .85, nominalRadius * .7,
      nominalRadius * .55, 3.5, 3, 2.6, 2.3, 2.2, 2, 1.7].filter(r => r <= nominalRadius))]
      .sort((a, b) => b - a);
    const evaluate = (yaw: number) => {
      const horizontal = nominalHorizontal.clone().normalize().applyAxisAngle(up, yaw);
      const nominalDirection = targetOffset.clone().sub(arm).normalize().applyAxisAngle(up, yaw);
      const currentHeight = followedEye ? Math.min(followedEye.clone().sub(anchor).dot(up), maxEyeUp) : nominalHeight;
      // Radius and eye height are independent coordinates. Prefer the original
      // eye height while contracting; scaling a whole boom lowers a safe eye
      // behind a wall even when the horizontal contraction remains clear.
      const heights = [...new Set([nominalHeight, currentHeight, maxEyeUp, (nominalHeight + maxEyeUp) / 2, nominalHeight * .75,
        nominalHeight * .5, nominalHeight * .25, 0])];
      let fallback: { yaw: number; position: Vector3; direction: Vector3; nominalDirection: Vector3;
        clearance: number; forecast: number; framed: boolean; forecastFramed: boolean } | undefined;
      for (const vertical of heights) for (const radius of goalRadii) {
        const offset = horizontal.clone().multiplyScalar(radius).addScaledVector(up, vertical);
        const position = anchor.clone().add(offset), clearance = offset.length();
        if (clearance > desiredDistance + .25 || !endpointClear(position)
          || safeProbe(anchor, position, OPTICAL_RADIUS) < clearance - 1e-7) continue;
        const fit = fitLook(position, nominalDirection);
        if (!fit.framed) continue;
        let forecast = clearance, forecastFramed = true;
        for (const future of forecasts) {
          const futureOffset = offset.clone().applyQuaternion(future.transport).applyAxisAngle(future.normal, future.yaw);
          const futureEye = future.anchor.clone().add(futureOffset);
          const futureClearance = safeProbe(future.anchor, futureEye, OPTICAL_RADIUS);
          forecast = Math.min(forecast, futureClearance);
          if (!endpointClear(futureEye) || futureClearance < clearance - 1e-7) forecastFramed = false;
        }
        const candidate = { yaw, position, direction: fit.direction, nominalDirection, clearance,
          forecast, framed: true, forecastFramed };
        fallback ??= candidate;
        if (forecastFramed) return candidate;
      }
      return fallback ?? { yaw, position: anchor.clone().add(horizontal.multiplyScalar(nominalRadius)).addScaledVector(up, nominalHeight),
        direction: nominalDirection.clone(), nominalDirection, clearance: 0, forecast: 0, framed: false, forecastFramed: false };
    };
    const center = evaluate(0);
    let chosen = this.avoidance === 0 ? center : evaluate(this.avoidance);
    const threatened = conservativeAllowed < desiredDistance - .1 || warningDistance < desiredDistance - .1 || center.forecast < desiredDistance - .1 || !center.framed;
    this.clearTime = !threatened && center.clearance > 3 ? this.clearTime + dt : 0;
    if (this.avoidance !== 0 && this.clearTime > .75) chosen = center;
    else if ((this.avoidance === 0 && threatened)
      || !chosen.framed || !chosen.forecastFramed) {
      const side = Math.sign(this.avoidance) || 1;
      const candidates = CANDIDATE_ANGLES.flatMap(angle => [side, -side].map(sign => evaluate(MathUtils.degToRad(angle) * sign)));
      const viable = candidates.filter(c => c.framed && c.forecastFramed
        && (this.avoidance !== 0 || c.clearance > center.clearance + .25
          || c.forecast > center.forecast + .25 || !center.framed
          || (warningDistance < desiredDistance - .1 && c.clearance >= center.clearance - .05)));
      // Keep a side once selected. The angle may grow as the corner turns;
      // recovering to the original input heading requires stable centre room.
      viable.sort((a, b) => (Math.sign(a.yaw) === side ? 0 : 1) - (Math.sign(b.yaw) === side ? 0 : 1)
        || Math.abs(a.yaw) - Math.abs(b.yaw));
      if (viable[0]) chosen = viable[0];
    }
    const wasAvoiding = this.avoidance !== 0;
    this.avoidance = chosen.yaw;
    let position: Vector3;
    let direction: Vector3;
    // Ordinary follow uses the same independently resolved radius/height
    // endpoint. Restore outward slowly; inward movement still goes through the
    // swept resolver when a direct transition is not safe.
    const normalPosition = center.position.clone();
    if (!instant && followedEye) {
      const previousOffset = followedEye.clone().sub(anchor), nextOffset = normalPosition.clone().sub(anchor);
      const previousRadius = previousOffset.clone().projectOnPlane(up).length();
      const nextRadius = nextOffset.clone().projectOnPlane(up).length();
      if (nextRadius > previousRadius) {
        normalPosition.copy(anchor).add(nextOffset.clone().projectOnPlane(up).normalize()
          .multiplyScalar(MathUtils.lerp(previousRadius, nextRadius, 1 - Math.exp(-RECOVERY_RESPONSE * dt))))
          .addScaledVector(up, MathUtils.lerp(previousOffset.dot(up), nextOffset.dot(up), 1 - Math.exp(-RECOVERY_RESPONSE * dt)));
      }
    }
    const normalDistance = normalPosition.distanceTo(anchor);
    const normalFit = fitLook(normalPosition, center.nominalDirection, true);
    const normalSafe = endpointClear(normalPosition)
      && safeProbe(anchor, normalPosition, OPTICAL_RADIUS) >= normalDistance - 1e-7
      && (!this.eye || safeProbe(this.eye, normalPosition) >= this.eye.distanceTo(normalPosition) - 1e-7)
      && normalFit.framed;
    this.returning = this.avoidance === 0 && (wasAvoiding || this.returning || !normalSafe);
    const transitioning = this.avoidance !== 0 || this.returning;
    if (!transitioning) {
      // Clear manual orbit retains its immediate control response. An unsafe
      // ordinary orbit/extension enters the same swept resolver as avoidance.
      this.distance = normalDistance;
      position = normalPosition;
      direction = normalFit.direction;
    } else {
      let response = this.avoidance === 0 ? RETURN_RESPONSE : AVOIDANCE_RESPONSE;
      // The transition must preserve a view as well as collision clearance.
      // A Cartesian chord between opposite sides can pass above the head: its
      // full 3D length remains large while its horizontal bearing becomes zero.
      const nominalInward = arm.clone().negate().projectOnPlane(up).normalize();
      const nominalLook = center.nominalDirection.clone().projectOnPlane(up).normalize();
      const correction = Math.atan2(up.dot(new Vector3().crossVectors(nominalInward, nominalLook)), nominalInward.dot(nominalLook));
      const nominalDirection = targetOffset.clone().sub(arm).normalize();
      const elevation = nominalDirection.dot(up);
      const nominalFrom = (p: Vector3) => {
        const inward = anchor.clone().sub(p).projectOnPlane(up);
        if (inward.lengthSq() < EPSILON) return heading.clone().multiplyScalar(Math.sqrt(Math.max(0, 1 - elevation * elevation))).addScaledVector(up, elevation).normalize();
        return inward.normalize().applyAxisAngle(up, correction)
          .multiplyScalar(Math.sqrt(Math.max(0, 1 - elevation * elevation))).addScaledVector(up, elevation).normalize();
      };
      const lookCache = new Map<string, ReturnType<typeof fitLook>>();
      const fittedFrom = (p: Vector3) => {
        const key = `${p.x},${p.y},${p.z}`;
        let fit = lookCache.get(key);
        if (!fit) { fit = fitLook(p, nominalFrom(p), true); lookCache.set(key, fit); }
        return fit;
      };
      const lookFrom = (p: Vector3) => fittedFrom(p).direction;
      const valid = (p: Vector3) => {
        // The optical line is thin; the physical camera remains a .2 m
        // sphere at its endpoint and along the entire actual eye movement.
        // Requiring a .2 m tube all the way to the player strands a clear eye
        // at wall edges even when both its body and the view are unobstructed.
        if (safeProbe(anchor, p, OPTICAL_RADIUS) < anchor.distanceTo(p) - 1e-7
          || !endpointClear(p)
          || (this.eye && safeProbe(this.eye, p) < this.eye.distanceTo(p) - 1e-7)) return false;
        const look = lookFrom(p);
        if (!fittedFrom(p).framed) return false;
        if (!instant && priorView) {
          if (priorView.angleTo(look) > maxViewTurn + 1e-7) return false;
        }
        return true;
      };
      const boundedTurn = (from: Vector3, to: Vector3) => {
        const fromYaw = visualYaw(nominalFrom(anchor.clone().add(from)));
        const toYaw = visualYaw(nominalFrom(anchor.clone().add(to)));
        // The allowed control-relative domain is [-90,+90]. Crossing from
        // one side to the other goes through zero, never around the back.
        return toYaw - fromYaw;
      };
      const origin = this.eye?.clone() ?? chosen.position.clone();
      const actualOffset = origin.clone().sub(anchor);
      const actualHorizontal = actualOffset.clone().projectOnPlane(up);
      const actualHeight = actualOffset.dot(up);
      const currentRadius = actualHorizontal.length();
      type Route = { yaw: number; radius: number; height: number };
      const routePoints = (route: Route) => {
        const radial = actualHorizontal.clone().normalize().multiplyScalar(route.radius);
        const prepare = anchor.clone().add(radial).addScaledVector(up, actualHeight);
        const elevated = anchor.clone().add(radial).addScaledVector(up, route.height);
        const targetHorizontal = nominalHorizontal.clone().normalize().applyAxisAngle(up, route.yaw).multiplyScalar(route.radius);
        const endpoint = anchor.clone().add(targetHorizontal).addScaledVector(up, route.height);
        return [prepare, elevated, endpoint];
      };
      const routeCertificate = (route: Route) => {
        const points = routePoints(route);
        let previous = origin;
        const check = (point: Vector3) => {
          if (point.distanceTo(anchor) > desiredDistance + .25 || !endpointClear(point)
            || safeProbe(anchor, point, OPTICAL_RADIUS) < anchor.distanceTo(point) - 1e-7
            || safeProbe(previous, point) < previous.distanceTo(point) - 1e-7
            || !fitLook(point, nominalFrom(point)).framed) return false;
          previous = point; return true;
        };
        // Radius/height preparation are explicit legs. A safe endpoint at a
        // different height is never replaced by a same-height turn.
        for (let leg = 0; leg < 2; leg++) {
          const start = previous.clone(), end = points[leg];
          const count = Math.max(1, Math.ceil(start.distanceTo(end) / .35));
          for (let i = 1; i <= count; i++) if (!check(start.clone().lerp(end, i / count))) return undefined;
        }
        const start = previous.clone().sub(anchor), finish = points[2].clone().sub(anchor);
        const angle = boundedTurn(start, finish), horizontal = start.clone().projectOnPlane(up);
        const count = Math.max(1, Math.ceil(Math.abs(angle) / .08));
        for (let i = 1; i <= count; i++) {
          if (!check(anchor.clone().add(horizontal.clone().applyAxisAngle(up, angle * i / count))
            .addScaledVector(up, route.height))) return undefined;
        }
        // Check the known remaining manual rotation as a continuous prefix,
        // not only its endpoint. This predicts no future user input.
        const advance = pendingYaw * (1 - Math.exp(-LOOK_RESPONSE * .15));
        const endOffset = finish.clone().projectOnPlane(up);
        const forecastSteps = Math.max(1, Math.ceil(Math.abs(advance) / .05));
        for (let i = 1; i <= forecastSteps; i++) {
          const point = anchor.clone().add(endOffset.clone().applyAxisAngle(up, advance * i / forecastSteps)).addScaledVector(up, route.height);
          // The control frame advances by this same angle during the forecast;
          // actual yaw bounds are checked on each emitted real frame instead.
          const old = previous;
          if (!endpointClear(point) || safeProbe(anchor, point, OPTICAL_RADIUS) < anchor.distanceTo(point) - 1e-7
            || safeProbe(old, point) < old.distanceTo(point) - 1e-7) return undefined;
          previous = point;
        }
        return points;
      };
      let route = this.route;
      let routePath = route && routeCertificate(route);
      if (!routePath) {
        const side = Math.sign(this.avoidance) || 1;
        const yaws = [...new Set([chosen.yaw, 0, ...CANDIDATE_ANGLES.flatMap(a => [side, -side].map(sign => MathUtils.degToRad(a) * sign))])];
        const heights = [...new Set([Math.min(actualHeight, maxEyeUp), nominalHeight, maxEyeUp,
          (nominalHeight + maxEyeUp) / 2, nominalHeight * .75, nominalHeight * .5, nominalHeight * .25, 0])];
        const radii = [...new Set([Math.min(currentRadius, nominalRadius), 4, 3.5, 3, 2.6, 2.3, 2.2, 2, 1.7])]
          .filter(r => r <= nominalRadius).sort((a, b) => b - a);
        outer: for (const yaw of yaws) for (const height of heights) for (const radius of radii) {
          const candidate = { yaw, radius, height };
          const path = routeCertificate(candidate);
          if (path) { route = candidate; routePath = path; break outer; }
        }
        this.route = routePath ? route : undefined;
      }
      let goalPosition = chosen.position;
      if (route && routePath) {
        this.avoidance = route.yaw;
        goalPosition = routePath.find(point => point.distanceTo(origin) > .04) ?? routePath[2];
      }
      if (routePath && goalPosition !== routePath[2]) response = AVOIDANCE_RESPONSE;
      let amount = instant || !this.eye ? 1 : 1 - Math.exp(-response * dt);
      if (!instant && this.eye) {
        const angle = origin.clone().sub(anchor).normalize().angleTo(goalPosition.clone().sub(anchor).normalize());
        if (angle > EPSILON) amount = Math.min(amount, maxViewTurn / angle);
      }
      const choices = [1, .5, .25, .125].map(scale => origin.clone().lerp(goalPosition, amount * scale));
      // If the chord is unframeable, take a bounded local-up arc. Each actual
      // small chord is still sphere-swept and checked from the chest anchor;
      // the arc is never assumed clear merely because its endpoint is clear.
      const fromOffset = origin.clone().sub(anchor), toOffset = goalPosition.clone().sub(anchor);
      const fromHorizontal = fromOffset.clone().projectOnPlane(up), toHorizontal = toOffset.clone().projectOnPlane(up);
      if (fromHorizontal.lengthSq() > EPSILON && toHorizontal.lengthSq() > EPSILON) {
        const angle = boundedTurn(fromOffset, toOffset);
        const turn = MathUtils.clamp(angle * (1 - Math.exp(-response * dt)), -maxViewTurn, maxViewTurn);
        for (const scale of [1, .5, .25, .125]) {
          const horizontal = fromHorizontal.clone().normalize().applyAxisAngle(up, turn * scale)
            .multiplyScalar(MathUtils.lerp(fromHorizontal.length(), toHorizontal.length(), amount * scale));
          choices.push(anchor.clone().add(horizontal)
            .addScaledVector(up, MathUtils.lerp(fromOffset.dot(up), toOffset.dot(up), amount * scale)));
        }
      }
      if (followedEye) {
        choices.push(followedEye);
        const length = followedEye.distanceTo(anchor);
        const clearance = safeProbe(anchor, followedEye, OPTICAL_RADIUS);
        if (length > EPSILON) choices.push(anchor.clone().addScaledVector(followedEye.clone().sub(anchor), clearance / length));
      }
      // A small safe expansion can preserve the framing margin as the player
      // moves. It stays within the intended boom and receives the same gates.
      if (!fittedFrom(origin).framed) {
        for (const factor of [1.01, 1.02]) {
          if (origin.distanceTo(anchor) * factor <= desiredDistance) choices.push(anchor.clone().lerp(origin, factor));
        }
      }
      // Any contraction is also a candidate and must pass the exact same
      // sweep/framing gate. No last-minute anchor clip bypasses the resolver.
      for (const factor of [.98, .95, .9, .8]) {
        const offset = origin.clone().sub(anchor), vertical = offset.dot(up);
        choices.push(anchor.clone().add(offset.projectOnPlane(up).multiplyScalar(factor)).addScaledVector(up, vertical));
      }
      // A visible endpoint can be on the far side of an occluded sector.
      // Try local tangent steps on either side of the transported prior eye,
      // rather than repeatedly steering straight at that unreachable endpoint.
      const localBase = followedEye ?? origin;
      const localOffset = localBase.clone().sub(anchor);
      for (const scale of [.5, 1]) for (const side of [1, -1]) {
        choices.push(anchor.clone().add(localOffset.clone().applyAxisAngle(up, side * maxViewTurn * scale)));
      }
      // Search in the transported local camera frame before an occluding
      // corner closes. The distant preferred endpoint alone says nothing about
      // whether its connecting angular sector is visible.
      const radialStep = Math.min(.2, 8 * dt);
      const localHorizontal = localOffset.clone().projectOnPlane(up);
      const localLength = localHorizontal.length();
      const localHeight = localOffset.dot(up);
      const verticalStep = Math.min(.08, 4 * dt);
      // One bounded local 3D stencil allows a wall-edge escape to combine
      // angle, radius and elevation. Every combination uses the same complete
      // certificate; no dimension has a separate unverified fallback.
      for (const turn of [-1, -.5, 0, .5, 1]) for (const radial of [-1, 0, 1]) for (const vertical of [-1, 0, 1]) {
        const offset = localHorizontal.clone().applyAxisAngle(up, turn * maxViewTurn);
        if (localLength > EPSILON) offset.multiplyScalar(Math.min(desiredDistance, Math.max(0, localLength + radial * radialStep)) / localLength);
        offset.addScaledVector(up, Math.min(maxEyeUp, localHeight + vertical * verticalStep));
        choices.push(anchor.clone().add(offset));
      }
      // Project onto an active yaw constraint as well as sampling uniform
      // angles. A narrow legal wall-edge step may lie between grid angles.
      const localYaw = visualYaw(nominalFrom(localBase));
      if (Math.abs(localYaw) > Math.PI / 2 - maxViewTurn) {
        for (const margin of [.0001, .001, .01]) {
          const angle = Math.sign(localYaw) * (Math.PI / 2 - margin) - localYaw;
          if (Math.abs(angle) > maxViewTurn) continue;
          for (const radial of [.5, .75, 1]) for (const vertical of [-1, -.5, 0, .5, 1]) {
            const offset = localHorizontal.clone().applyAxisAngle(up, angle);
            if (localLength > EPSILON) offset.multiplyScalar(Math.min(desiredDistance, localLength + radial * radialStep) / localLength);
            offset.addScaledVector(up, Math.min(maxEyeUp, localHeight + vertical * verticalStep));
            choices.push(anchor.clone().add(offset));
          }
        }
      }
      const nextFeet = input.feet.clone().addScaledVector(movement, .05 / .6).normalize().multiplyScalar(input.feet.length());
      const nextUp = nextFeet.clone().normalize();
      const nextAnchor = nextFeet.addScaledVector(nextUp, CHEST_HEIGHT);
      const nextTransport = new Quaternion().setFromUnitVectors(up, nextUp);
      const nextControlYaw = pendingYaw * (1 - Math.exp(-LOOK_RESPONSE * .05));
      const continues = (p: Vector3) => {
        const nextEye = p.clone().sub(anchor).applyQuaternion(nextTransport).applyAxisAngle(nextUp, nextControlYaw).add(nextAnchor);
        return endpointClear(nextEye) && safeProbe(p, nextEye) >= p.distanceTo(nextEye) - 1e-7
          && safeProbe(nextAnchor, nextEye, OPTICAL_RADIUS) >= nextAnchor.distanceTo(nextEye) - 1e-7;
      };
      const futureFraction = (p: Vector3) => {
        const offset = p.clone().sub(anchor);
        const length = offset.length();
        if (length < EPSILON) return 0;
        return Math.min(...forecasts.map(future => {
          const futureEye = future.anchor.clone().add(offset.clone().applyQuaternion(future.transport).applyAxisAngle(future.normal, future.yaw));
          const fraction = safeProbe(future.anchor, futureEye, OPTICAL_RADIUS) / length;
          return fraction;
        }));
      };
      // Evaluate closest goals first. Once a valid candidate has the maximum
      // future bucket, later (farther) goals cannot beat it. Stable ties retain
      // generation order, exactly as a complete bucket/goal sort would.
      const ordered = choices.map((p, index) => ({ p, index, goal: p.distanceTo(goalPosition) }))
        .sort((a, b) => a.goal - b.goal || a.index - b.index);
      let best: Vector3 | undefined;
      let bestBucket = -1, bestContinuation = false;
      for (const candidate of ordered) {
        if (candidate.p.distanceTo(anchor) > desiredDistance + .25 || !valid(candidate.p)) continue;
        const continuation = continues(candidate.p);
        const bucket = Math.floor(MathUtils.clamp(futureFraction(candidate.p), 0, 1) * 100);
        if ((continuation && !bestContinuation) || continuation === bestContinuation && bucket > bestBucket) {
          best = candidate.p; bestBucket = bucket; bestContinuation = continuation;
        }
        if (continuation && bucket === 100) break;
      }
      if (best) position = best;
      else {
        // If visibility is temporarily impossible, continue a swept physical
        // follow step instead of pinning the eye in absolute world space. The
        // emitted pose remains explicitly limited until a visible local path
        // reconnects; camera-body collision is never waived for recovery.
        const follow = followedEye ?? origin;
        const physical = [follow, ...choices, origin].filter(p => observationSafe(p)
          && p.distanceTo(anchor) <= desiredDistance + .25 && endpointClear(p)
          && directionBounded(lookFrom(p))
          && safeProbe(origin, p) >= origin.distanceTo(p) - 1e-7);
        physical.sort((a, b) => a.distanceTo(follow) - b.distanceTo(follow));
        if (!physical[0]) {
          // Development fail-fast: never silently emit a near-body, unbounded
          // or direction-reversing eye as if the new constraints had passed.
          throw new Error(`Ground camera constraint conflict ${JSON.stringify({ feet: input.feet.toArray(),
            eye: origin.toArray(), heading: heading.toArray(), dt, desiredDistance })}`);
        }
        position = physical[0];
      }
      // A wall can pause the eye. Its view follows that actual safe position,
      // never an unreachable target, and never writes back control orientation.
      direction = lookFrom(position);
      this.distance = position.distanceTo(anchor);
    }
    // Recheck every emitted eye even when the camera just entered avoidance.
    // An obstructed desired distance is never replaced with a hard minimum.
    const finalClearance = safeProbe(anchor, position, OPTICAL_RADIUS);
    this.distance = position.distanceTo(anchor);
    this.previousUp = up.clone();
    this.eye = position.clone();
    this.viewDirection = direction.clone();
    if (this.returning && position.distanceTo(center.position) < .02 && direction.angleTo(center.direction) < .002) this.returning = false;
    const eyeClear = endpointClear(position);
    const frame = projection(position, direction);
    const controlElevation = Math.asin(MathUtils.clamp(targetOffset.clone().sub(arm).normalize().dot(up), -1, 1));
    const framingPitch = Math.asin(MathUtils.clamp(direction.dot(up), -1, 1)) - controlElevation;
    const target = position.clone().add(direction);
    const visualHeading = tangent(direction, up, heading);
    const avoidanceYaw = Math.atan2(up.dot(new Vector3().crossVectors(heading, visualHeading)), heading.dot(visualHeading));
    return { position, target, up, direction, heading: heading.clone(), pitch: this.pitch,
      distance: this.distance, desiredDistance, probeRadius: PROBE_RADIUS, centerDistance, shoulder: this.shoulder,
      avoidanceYaw, avoidanceTargetYaw: this.avoidance, framingLimited: !eyeClear || !directionBounded(direction) || finalClearance < position.distanceTo(anchor) - 1e-7 || !isFramed(position, direction), warningDistance,
      opticalDistance: finalClearance, eyeClear, frameWidth: frame.width, frameHeight: frame.height,
      avatarClearance: avatarClearance(position), framingPitch };
  }
}
