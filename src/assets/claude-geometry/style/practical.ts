import * as T from 'three';
import type { Vec3 } from '../core/vec.ts';
import type { LodTier } from './lod.ts';

// Practical lights: the light fittings modelled in parts (ceiling luminaires,
// door lamps, pad lights, street lights) lighting their surroundings for real,
// within a fixed budget.
//
// Parts only record anchors (PartBuilder.emitter, which lands on
// `group.userData.emitters` of whatever the builder makes). One
// PracticalLights per scene owns a fixed pool of three.js lights, created once
// and never added or removed, so the scene's light count, and with it every
// shader program, stays the same whatever is placed. Each assignment pass it
// finds the fittings within reach of the camera, merges fittings of the same
// kind that sit close together (the four ceiling panels of a 2 x 2 room become
// one light), ranks them by importance over distance and gives the best ones a
// slot; the rest stay emissive only. Slots fade in and out instead of popping.
//
// No light casts a shadow, except at high LOD one spot slot reserved for the
// most important ceiling light, so a lamp inside a room does not light the
// ground outside through its walls. Without that slot (medium, low) the light
// ranges are kept short enough that the leak stays faint.

export type EmitterKind = 'ceiling' | 'door' | 'pad' | 'street' | 'flood';
export const EMITTER_KINDS: readonly EmitterKind[] = ['ceiling', 'door', 'pad', 'street', 'flood'];

/** A light fitting's anchor in its model's frame: where it is, which way it shines, and its lamp's colour if not the kind's. */
export interface Emitter { kind: EmitterKind; position: Vec3; direction: Vec3; color?: string }

export interface FittingSpec {
  type: 'spot' | 'point';
  /** Light colour (linear interpretation of the sRGB hex, as three.js does). */
  color: string;
  /** Candela for one fitting; merged fittings add up, to at most `maxMerged` fittings' worth. */
  intensity: number;
  maxMerged: number;
  /** Range in metres: the light is cut off smoothly at this distance (decay 2 inside it). */
  distance: number;
  /** Spot half-angle and penumbra. */
  angle?: number;
  penumbra?: number;
  /** Relative importance when slots are scarce. */
  priority: number;
  /** Fittings of this kind closer than this merge into one light. */
  merge: number;
  /** The light sits this far along the fitting's direction, clear of its own housing. */
  offset: number;
}

/**
 * Per-kind light, tuned in the workshop against the hangar HDRI at exposure 1:
 * a lit room's floor and walls read clearly without washing out, a doorway is
 * lit for a few steps, a pad's lights pick out its deck, a street light makes a
 * pool on the footway. Colours are warm whites in the palette's sodium family.
 */
export const FITTINGS: Record<EmitterKind, FittingSpec> = {
  ceiling: { type: 'spot', color: '#ffe0bd', intensity: 2.2, maxMerged: 4, distance: 3.6, angle: 1.15, penumbra: 0.85, priority: 3, merge: 1.6, offset: 0.06 },
  door: { type: 'point', color: '#ffc68f', intensity: 0.9, maxMerged: 2, distance: 2.6, priority: 2, merge: 0.6, offset: 0.18 },
  pad: { type: 'point', color: '#ffcf96', intensity: 0.2, maxMerged: 3, distance: 1.9, priority: 1, merge: 0.9, offset: 0.3 },
  street: { type: 'spot', color: '#ffc488', intensity: 9, maxMerged: 1, distance: 7.5, angle: 0.95, penumbra: 0.7, priority: 2, merge: 0.4, offset: 0.08 },
  flood: { type: 'spot', color: '#ffc488', intensity: 5, maxMerged: 1, distance: 5.5, angle: 0.9, penumbra: 0.6, priority: 2, merge: 0.4, offset: 0.06 },
};

/** Lights per LOD: spot and point slots, shadow-casting spot slots, and how far from the camera fittings are considered. */
export const PRACTICAL_BUDGET: Record<LodTier, { spots: number; points: number; shadows: number; reach: number }> = {
  high: { spots: 4, points: 4, shadows: 1, reach: 28 },
  medium: { spots: 2, points: 2, shadows: 0, reach: 16 },
  low: { spots: 1, points: 1, shadows: 0, reach: 10 },
};

/**
 * The shadow slot serves a ceiling light only this close to the camera: inside
 * or at a room, where a leak through the walls would show. Further away it
 * stays idle, because its pass would draw everything in its frustum again (a
 * whole planet mesh, seen from orbit) for a leak too small to see.
 */
export const SHADOW_REACH = 8;

/** Seconds for a slot to fade fully in or out. */
const FADE = 0.3;
/** Seconds between assignment passes, unless the camera moves more than REASSIGN_MOVE metres. */
const REASSIGN_EVERY = 0.25;
const REASSIGN_MOVE = 0.5;

/** A group of nearby fittings of one kind that one light stands in for. */
export interface Cluster { kind: EmitterKind; color: string; position: T.Vector3; direction: T.Vector3; count: number; key: string; score: number }

interface Slot {
  light: T.SpotLight | T.PointLight;
  shadow: boolean;
  key: string | null;
  /** Assignment waiting for the slot to fade out first. */
  next: Cluster | null;
  level: number;
  target: number;
}

/**
 * Collect the world-space fittings under `root` that are visible, within
 * `reach` of `eye`, and not marked `userData.noPracticalLights` (ghost
 * previews), then merge and rank them. Exported for tests.
 */
export function rankFittings(root: T.Object3D, eye: T.Vector3, reach: number): Cluster[] {
  const found: { kind: EmitterKind; color: string; position: T.Vector3; direction: T.Vector3 }[] = [];
  const visit = (o: T.Object3D) => {
    if (!o.visible || o.userData.noPracticalLights) return;
    const list = o.userData.emitters as Emitter[] | undefined;
    if (list) for (const e of list) {
      const spec = FITTINGS[e.kind];
      if (!spec) continue;
      const position = new T.Vector3(...e.position).applyMatrix4(o.matrixWorld);
      if (position.distanceTo(eye) > reach + spec.distance) continue;
      found.push({ kind: e.kind, color: e.color ?? spec.color, position, direction: new T.Vector3(...e.direction).transformDirection(o.matrixWorld) });
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  // Greedy merge per kind, in a stable order so the same scene always gives the same clusters.
  found.sort((a, b) => a.kind.localeCompare(b.kind) || a.position.x - b.position.x || a.position.z - b.position.z || a.position.y - b.position.y);
  const clusters: Cluster[] = [];
  for (const f of found) {
    const spec = FITTINGS[f.kind];
    const near = clusters.find(c => c.kind === f.kind && c.color === f.color && c.position.distanceTo(f.position) <= spec.merge && c.count < spec.maxMerged);
    if (near) {
      near.position.multiplyScalar(near.count).add(f.position).divideScalar(near.count + 1);
      near.direction.multiplyScalar(near.count).add(f.direction).normalize();
      near.count++;
    } else {
      clusters.push({ kind: f.kind, color: f.color, position: f.position.clone(), direction: f.direction.clone(), count: 1, key: '', score: 0 });
    }
  }
  for (const c of clusters) {
    const d = c.position.distanceTo(eye);
    c.score = FITTINGS[c.kind].priority / (1 + (d * d) / 16);
    c.key = `${c.kind}:${c.position.toArray().map(v => v.toFixed(1)).join(',')}`;
  }
  return clusters.sort((a, b) => b.score - a.score);
}

export class PracticalLights {
  readonly group = new T.Group();
  readonly lod: LodTier;
  private slots: Slot[] = [];
  private enabled: boolean;
  private since = Infinity;
  private lastEye = new T.Vector3(Infinity, Infinity, Infinity);
  private last = { fittings: 0, clusters: 0 };

  constructor(lod: LodTier, options: { enabled?: boolean } = {}) {
    this.lod = lod;
    this.enabled = options.enabled ?? true;
    this.group.name = 'practical-lights';
    const budget = PRACTICAL_BUDGET[lod];
    for (let i = 0; i < budget.spots; i++) {
      const light = new T.SpotLight('#ffffff', 0, 1, 1, 0.5, 2);
      const shadow = i < budget.shadows;
      light.castShadow = shadow;
      if (shadow) {
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.0006;
        light.shadow.normalBias = 0.02;
        light.shadow.camera.near = 0.05;
        // Rendered once now so the map exists even before the slot is first used:
        // a shadow-casting light whose map was never drawn breaks every lit material.
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = true;
      }
      this.group.add(light, light.target);
      this.slots.push({ light, shadow, key: null, next: null, level: 0, target: 0 });
    }
    for (let i = 0; i < budget.points; i++) {
      const light = new T.PointLight('#ffffff', 0, 1, 2);
      this.group.add(light);
      this.slots.push({ light, shadow: false, key: null, next: null, level: 0, target: 0 });
    }
  }

  /** Turn every practical light off (fading) or back on. The slots stay in the scene. */
  setEnabled(on: boolean) { this.enabled = on; this.since = Infinity; }
  get isEnabled() { return this.enabled; }

  /** Reassign slots when due, then step the fades. Call once per frame before rendering. */
  update(scene: T.Object3D, camera: T.Camera, dt: number) {
    this.since += dt;
    const eye = camera.getWorldPosition(new T.Vector3());
    if (this.since >= REASSIGN_EVERY || eye.distanceTo(this.lastEye) > REASSIGN_MOVE) {
      this.assign(scene, eye);
      this.since = 0;
      this.lastEye.copy(eye);
    }
    const step = dt > 0 ? dt / FADE : 1;
    for (const s of this.slots) {
      const goal = s.next ? 0 : s.target;
      s.level = s.level < goal ? Math.min(goal, s.level + step) : Math.max(goal, s.level - step);
      if (s.next && s.level === 0) { this.place(s, s.next); s.next = null; }
      const spec = s.key ? FITTINGS[s.key.split(':')[0] as EmitterKind] : null;
      s.light.intensity = spec ? s.level * s.light.userData.fullIntensity : 0;
      if (s.shadow) s.light.shadow.autoUpdate = s.level > 0;
    }
  }

  private assign(scene: T.Object3D, eye: T.Vector3) {
    const budget = PRACTICAL_BUDGET[this.lod];
    scene.updateMatrixWorld();
    const ranked = this.enabled ? rankFittings(scene, eye, budget.reach) : [];
    this.last = { fittings: ranked.reduce((n, c) => n + c.count, 0), clusters: ranked.length };
    const wanted = new Map<string, Cluster>();
    // The shadow slot goes to the best ceiling light; the other slots to the best of their type.
    const shadowSlots = this.slots.filter(s => s.shadow);
    const spotSlots = this.slots.filter(s => !s.shadow && s.light instanceof T.SpotLight);
    const pointSlots = this.slots.filter(s => s.light instanceof T.PointLight);
    const pick = (slots: Slot[], ok: (c: Cluster) => boolean) => {
      const chosen = ranked.filter(c => ok(c) && !wanted.has(c.key)).slice(0, slots.length);
      return chosen;
    };
    const plan: [Slot[], Cluster[]][] = [];
    const shadowed = pick(shadowSlots, c => c.kind === 'ceiling' && c.position.distanceTo(eye) <= SHADOW_REACH);
    shadowed.forEach(c => wanted.set(c.key, c));
    plan.push([shadowSlots, shadowed]);
    const spots = pick(spotSlots, c => FITTINGS[c.kind].type === 'spot');
    spots.forEach(c => wanted.set(c.key, c));
    plan.push([spotSlots, spots]);
    const points = pick(pointSlots, c => FITTINGS[c.kind].type === 'point');
    points.forEach(c => wanted.set(c.key, c));
    plan.push([pointSlots, points]);
    for (const [slots, chosen] of plan) {
      const free: Slot[] = [];
      const todo = new Map(chosen.map(c => [c.key, c]));
      // Slots already showing a wanted cluster keep it (no flicker); the rest fade out.
      for (const s of slots) {
        if (s.key && todo.has(s.key)) { s.target = 1; s.next = null; todo.delete(s.key); } else free.push(s);
      }
      const rest = [...todo.values()];
      for (const s of free) {
        const c = rest.shift();
        if (!c) { s.target = 0; s.next = null; continue; }
        if (s.level > 0 && s.key) s.next = c; else this.place(s, c);
        s.target = 1;
      }
    }
  }

  private place(s: Slot, c: Cluster) {
    const spec = FITTINGS[c.kind];
    const light = s.light;
    light.color.set(c.color);
    light.distance = spec.distance;
    light.decay = 2;
    light.userData.fullIntensity = spec.intensity * Math.min(c.count, spec.maxMerged);
    light.position.copy(c.position).addScaledVector(c.direction, spec.offset);
    if (light instanceof T.SpotLight) {
      light.angle = spec.angle ?? 1;
      light.penumbra = spec.penumbra ?? 0.5;
      light.target.position.copy(light.position).add(c.direction);
      light.target.updateMatrixWorld();
      if (s.shadow) { light.shadow.camera.far = spec.distance; light.shadow.camera.updateProjectionMatrix(); light.shadow.needsUpdate = true; }
    }
    s.key = c.key;
  }

  /** What the pool is doing: slots by kind, how many are lit, and how many fittings and clusters were in reach. */
  stats() {
    const lit = this.slots.filter(s => s.light.intensity > 0);
    return {
      slots: { spots: this.slots.filter(s => s.light instanceof T.SpotLight).length, points: this.slots.filter(s => s.light instanceof T.PointLight).length, shadows: this.slots.filter(s => s.shadow).length },
      lit: lit.length,
      litShadows: lit.filter(s => s.shadow).length,
      assigned: this.slots.filter(s => s.key && s.target > 0).map(s => s.key as string),
      fittingsInReach: this.last.fittings,
      clustersInReach: this.last.clusters,
      enabled: this.enabled,
    };
  }

  dispose() {
    for (const s of this.slots) s.light.dispose();
    this.group.removeFromParent();
    this.slots = [];
  }
}
