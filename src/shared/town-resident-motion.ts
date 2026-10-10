import { Vector3 } from 'three';
import { GroundWorld, STEP_HEIGHT } from './physics/world.ts';
import type { GroundPose } from './physics/world.ts';
import type { TownResidentDefinition } from './town-residents.ts';
import type { Vec3 } from './world.ts';

/** Ephemeral scenery motion; shares the player's capsule, supports and sweeps.
 * Stops/reverses at an obstruction. It never teleports through a wall or calls
 * recover(), which could silently move an authored resident to another place. */
export class TownResidentMotion {
  readonly definition: TownResidentDefinition;
  readonly valid: boolean;
  pose: GroundPose;
  heading: Vec3;
  moving = false;
  blockedSeconds = 0;
  reversals = 0;
  private routeIndex = 1;
  private routeDirection = 1;
  private pause = 0;
  private accumulator = 0;
  private world: GroundWorld;

  constructor(world: GroundWorld, definition: TownResidentDefinition) {
    this.world = world; this.definition = definition;
    const initial = world.pose(definition.position);
    this.pose = { ...initial, radius: world.support(initial.position, initial.radius + STEP_HEIGHT).radius };
    this.valid = !world.blocked(this.pose);
    const up = new Vector3(...definition.position);
    const target = definition.facing ?? definition.route?.[1];
    const forward = target ? new Vector3(...target).projectOnPlane(up) : new Vector3(0, 0, 1).projectOnPlane(up);
    if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0).projectOnPlane(up);
    this.heading = forward.normalize().toArray() as Vec3;
    this.pause = definition.phase % 2;
  }

  /** dt is elapsed visible time. At most two shared physics steps per tick. */
  tick(dt: number, viewer?: Vec3, neighbours: readonly Vec3[] = []) {
    this.moving = false;
    const route = this.definition.route;
    if (!this.valid || !route || route.length < 2 || this.definition.activity !== 'walk') return;
    this.accumulator = Math.min(.1, this.accumulator + Math.max(0, dt));
    while (this.accumulator >= .05 - 1e-8) {
      this.accumulator -= .05;
      if (this.pause > 0) { this.pause -= .05; continue; }
      const up = new Vector3(...this.pose.position), target = new Vector3(...route[this.routeIndex]);
      const remaining = up.angleTo(target) * this.world.baseRadius;
      if (remaining < .11) { this.nextStop(route.length); continue; }
      const tangent = target.projectOnPlane(up).normalize();
      const desired = up.clone().addScaledVector(tangent, Math.min(remaining, this.definition.speed * .05) / this.pose.radius).normalize();
      // Residents politely wait for the player instead of walking through them.
      if (viewer && desired.angleTo(new Vector3(...viewer)) * this.world.baseRadius < .65) { this.pause = .25; continue; }
      if (neighbours.some(p => desired.angleTo(new Vector3(...p)) * this.world.baseRadius < .6)) { this.pause = .35; continue; }
      const next = this.world.move(this.pose, desired.toArray() as Vec3, .05);
      const travel = up.angleTo(new Vector3(...next.position)) * this.world.baseRadius;
      this.pose = next;
      if (travel > .003) {
        this.heading = tangent.toArray() as Vec3; this.moving = true; this.blockedSeconds = 0;
      } else {
        this.blockedSeconds += .05;
        if (this.blockedSeconds >= 1) {
          this.routeDirection *= -1;
          this.routeIndex = Math.max(0, Math.min(route.length - 1, this.routeIndex + this.routeDirection));
          this.blockedSeconds = 0; this.pause = 1; this.reversals++;
        }
      }
    }
  }

  private nextStop(length: number) {
    if (this.routeIndex === length - 1) this.routeDirection = -1;
    if (this.routeIndex === 0) this.routeDirection = 1;
    this.routeIndex += this.routeDirection;
    this.pause = .9 + this.definition.phase % 1.7;
  }
}
