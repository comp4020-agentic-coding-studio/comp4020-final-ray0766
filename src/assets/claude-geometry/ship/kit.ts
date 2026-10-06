import * as T from 'three';
import { PartBuilder } from '../style/geometry.ts';
import type { Placement } from '../style/geometry.ts';
import type { LodTier } from '../style/lod.ts';
import type { Vec3 } from '../core/vec.ts';
import { latheZ, loft, placementMatrix, rodGeometry, rotationToNormal, strutGeometry } from './geom.ts';
import type { LoftOptions, Ring } from './geom.ts';

// What every part builder receives: the PartBuilder for the whole ship, the
// material for each surface role, a frame stack that mirrors the builder's
// (so anchors can be expressed in the body frame) and the detail level.
//
// Roles, not materials, are what parts ask for. The factory decides which
// material serves each role; at low LOD several roles share one material so
// the ship stays inside its draw-call budget.

export type Role =
  | 'primary'   // main livery paint (upper hull, wing tops)
  | 'secondary' // second livery paint (belly, lower surfaces)
  | 'trim'      // stripes, fin caps, intake lips, door frames
  | 'metal'     // bare gunmetal structure: frames, flanges, pylons
  | 'bright'    // bright alloy: rods, intake lips, fasteners
  | 'dark'      // graphite paint: intake throats, gaskets, wells, grilles
  | 'glass'     // coated canopy glass
  | 'hazard'    // diagonal striping on gear doors and latches
  | 'heat'      // heat-tempered nozzle steel
  | 'liner';    // nozzle liner glow, driven by thrust

export type NavKind = 'side' | 'strobe';
export interface NavPoint { position: Vec3; normal: Vec3; kind: NavKind }
export interface ExhaustPoint { position: Vec3; direction: Vec3; radius: number }

/** 0 = low (primary shapes only), 1 = medium, 2 = high (all hardware). */
export type Detail = 0 | 1 | 2;
export const DETAIL: Record<LodTier, Detail> = { low: 0, medium: 1, high: 2 };

export class Ctx {
  readonly b: PartBuilder;
  readonly lod: LodTier;
  readonly detail: Detail;
  readonly segments: number;
  readonly navs: NavPoint[] = [];
  readonly exhausts: ExhaustPoint[] = [];
  private frame = new T.Matrix4();
  private readonly materials: Record<Role, T.Material>;

  constructor(b: PartBuilder, materials: Record<Role, T.Material>) {
    this.b = b;
    this.lod = b.lod;
    this.detail = DETAIL[b.lod];
    this.segments = b.settings.radialSegments;
    this.materials = materials;
  }

  mat(role: Role): T.Material { return this.materials[role]; }

  /** Nested frame; keeps the PartBuilder frame and the anchor frame in step. */
  within(placement: Placement, fn: () => void) {
    const saved = this.frame;
    this.frame = saved.clone().multiply(placementMatrix(placement));
    try { this.b.within(placement, fn); } finally { this.frame = saved; }
  }

  /** A point in the current frame, in the body frame. */
  point(local: Vec3): Vec3 {
    const v = new T.Vector3(...local).applyMatrix4(this.frame);
    return [v.x, v.y, v.z];
  }

  /** A direction in the current frame, in the body frame (unit length). */
  direction(local: Vec3): Vec3 {
    const v = new T.Vector3(...local).transformDirection(this.frame);
    return [v.x, v.y, v.z];
  }

  /** Record a nozzle exit: `position` on the exit plane, exhaust along local +Z. */
  exhaust(position: Vec3, radius: number) {
    const scale = new T.Vector3().setFromMatrixScale(this.frame);
    this.exhausts.push({ position: this.point(position), direction: this.direction([0, 0, 1]), radius: radius * Math.abs(scale.x) });
  }

  /** Record a navigation light lens centre and its outward normal. */
  nav(position: Vec3, normal: Vec3, kind: NavKind) {
    this.navs.push({ position: this.point(position), normal: this.direction(normal), kind });
  }

  // ---------------------------------------------------------------- shapes

  box(role: Role, size: Vec3, position: Vec3, rotation?: Vec3, chamfer = 0.012) {
    this.b.box(this.mat(role), size, { position, rotation }, chamfer);
  }

  cylinder(role: Role, rTop: number, rBottom: number, height: number, placement: Placement, segments = this.segments) {
    this.b.cylinder(this.mat(role), rTop, rBottom, height, placement, { segments });
  }

  /** Hex bolt head on a surface; `normal` is the surface's outward normal. Hardware is dropped at low LOD. */
  bolt(position: Vec3, normal: Vec3 = [0, 1, 0], radius = 0.011, role: Role = 'bright') {
    this.b.bolt(this.mat(role), { position, rotation: rotationToNormal(normal) }, radius);
  }

  /** Evenly spaced bolts from a to b inclusive. */
  boltRow(a: Vec3, b: Vec3, count: number, normal: Vec3 = [0, 1, 0], radius = 0.011, role: Role = 'bright') {
    if (this.detail < 1) return;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      this.bolt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], normal, radius, role);
    }
  }

  /** Lofted skin; `roles` maps loft groups (or '*') to roles. */
  skin(rings: Ring[], options: LoftOptions, roles: Record<string, Role>, placement?: Placement) {
    for (const [key, g] of loft(rings, options)) {
      const role = roles[key] ?? roles['*'];
      if (!role) { g.dispose(); continue; }
      this.b.geometry(this.mat(role), g, placement);
    }
  }

  /** Surface of revolution about local +Z. */
  lathe(role: Role, profile: [number, number][], placement?: Placement, options: { segments?: number; arc?: number; phase?: number; faceted?: boolean } = {}) {
    this.b.geometry(this.mat(role), latheZ(profile, options.segments ?? this.segments, options), placement);
  }

  /** Chamfered at high LOD only: a bar is 44 triangles chamfered and 12 plain, and bars come in dozens. */
  strut(role: Role, a: Vec3, b: Vec3, w: number, h = w, chamfer = 0.004, up?: Vec3) {
    this.b.geometry(this.mat(role), strutGeometry(a, b, w, h, this.detail >= 2 ? chamfer : 0, up));
  }

  rod(role: Role, a: Vec3, b: Vec3, radius: number, segments = Math.max(6, Math.round(this.segments / 2))) {
    this.b.geometry(this.mat(role), rodGeometry(a, b, radius, segments));
  }
}

// ---------------------------------------------------------------- details

/**
 * Flush access hatch on a face whose outward normal is local +Y of `placement`:
 * a slightly proud plate, a recessed finger grip and corner fasteners.
 */
export function hatch(ctx: Ctx, w: number, d: number, placement: Placement, role: Role = 'primary') {
  ctx.within(placement, () => {
    ctx.box(role, [w, 0.012, d], [0, 0.006, 0], undefined, 0.004);
    if (ctx.detail >= 1) {
      ctx.box('dark', [Math.min(0.08, w * 0.4), 0.004, 0.022], [0, 0.0125, d / 2 - 0.035], undefined, 0.001);
    }
    if (ctx.detail >= 2) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ctx.bolt([sx * (w / 2 - 0.022), 0.012, sz * (d / 2 - 0.022)], [0, 1, 0], 0.008);
    }
  });
}

/**
 * Reaction-control quad: a block with four small nozzles, the block's outward
 * face along local +Y of `placement`.
 */
export function rcsQuad(ctx: Ctx, placement: Placement) {
  ctx.within(placement, () => {
    ctx.box('metal', [0.09, 0.03, 0.09], [0, 0.015, 0], undefined, 0.006);
    if (ctx.detail === 0) return;
    const seg = Math.max(6, Math.round(ctx.segments / 2));
    // Four nozzles pointing up, forward, aft and outboard.
    const dirs: [Vec3, Vec3][] = [
      [[0, 0.04, 0], [0, 0, 0]],
      [[0, 0.022, -0.05], [-Math.PI / 2, 0, 0]],
      [[0, 0.022, 0.05], [Math.PI / 2, 0, 0]],
      [[0.05, 0.022, 0], [0, 0, -Math.PI / 2]],
    ];
    for (const [p, r] of dirs) {
      ctx.within({ position: p, rotation: r }, () => {
        ctx.lathe('heat', [[0.006, -0.012], [0.009, 0.0], [0.012, 0.012], [0.008, 0.012], [0.005, 0.0]], { rotation: [-Math.PI / 2, 0, 0] }, { segments: seg });
      });
    }
  });
}

/**
 * Landing-gear door on the belly. `placement` puts local +Y on the outward
 * (downward) face. Hazard edging runs along both long edges, hinge knuckles
 * along one.
 */
export function gearDoor(ctx: Ctx, w: number, d: number, placement: Placement, role: Role = 'secondary') {
  ctx.within(placement, () => {
    ctx.box('dark', [w + 0.02, 0.006, d + 0.02], [0, 0.003, 0], undefined, 0.002);
    ctx.box(role, [w, 0.014, d], [0, 0.009, 0], undefined, 0.004);
    ctx.box('hazard', [0.022, 0.004, d - 0.02], [-w / 2 + 0.016, 0.017, 0], undefined, 0);
    ctx.box('hazard', [0.022, 0.004, d - 0.02], [w / 2 - 0.016, 0.017, 0], undefined, 0);
    if (ctx.detail >= 1) {
      for (const z of [-d / 3, d / 3]) ctx.box('metal', [0.03, 0.012, 0.05], [-w / 2 - 0.004, 0.012, z], undefined, 0.003);
    }
  });
}

/**
 * Rectangular intake on a face whose outward normal is local +Y: a thick lip
 * frame, a dark throat and grille bars across it.
 */
export function intake(ctx: Ctx, w: number, d: number, placement: Placement, lipRole: Role = 'trim') {
  ctx.within(placement, () => {
    const lip = 0.025, depth = 0.04;
    ctx.box('dark', [w, 0.01, d], [0, 0.002, 0], undefined, 0);
    for (const s of [-1, 1]) {
      ctx.box(lipRole, [w + lip * 2, depth, lip], [0, depth / 2, s * (d / 2 + lip / 2)], undefined, 0.006);
      ctx.box(lipRole, [lip, depth, d], [s * (w / 2 + lip / 2), depth / 2, 0], undefined, 0.006);
    }
    if (ctx.detail >= 1) {
      const bars = Math.max(3, Math.round(d / 0.03));
      for (let i = 1; i < bars; i++) ctx.box('metal', [w, 0.008, 0.006], [0, depth * 0.55, -d / 2 + d * i / bars], undefined, 0);
    }
  });
}

/** Radiator grille: a framed panel of slats, outward normal local +Y. */
export function grille(ctx: Ctx, w: number, d: number, placement: Placement) {
  ctx.within(placement, () => {
    ctx.box('metal', [w + 0.03, 0.02, d + 0.03], [0, 0.01, 0], undefined, 0.005);
    ctx.box('dark', [w, 0.006, d], [0, 0.021, 0], undefined, 0);
    const slats = ctx.detail >= 1 ? Math.max(4, Math.round(d / 0.028)) : 0;
    for (let i = 0; i < slats; i++) {
      ctx.box('metal', [w - 0.01, 0.012, 0.008], [0, 0.026, -d / 2 + (i + 0.5) * d / slats], [0.5, 0, 0], 0);
    }
  });
}

/** Whip antenna with a base insulator; rises along local +Y. */
export function antenna(ctx: Ctx, base: Vec3, height: number, lean: Vec3 = [0, 0, 0]) {
  ctx.within({ position: base, rotation: lean }, () => {
    ctx.cylinder('dark', 0.016, 0.02, 0.03, { position: [0, 0.015, 0] }, 8);
    if (ctx.detail >= 1) ctx.rod('bright', [0, 0.03, 0], [0, height, 0], 0.0035, 6);
  });
}

/** Navigation light: a small metal housing with the lens recorded for the factory. */
export function navLight(ctx: Ctx, position: Vec3, normal: Vec3, kind: NavKind) {
  ctx.within({ position, rotation: rotationToNormal(normal) }, () => {
    ctx.cylinder('metal', 0.022, 0.026, 0.02, { position: [0, 0.0, 0] }, Math.max(8, ctx.segments / 2));
  });
  const n = new T.Vector3(...normal).normalize();
  ctx.nav([position[0] + n.x * 0.014, position[1] + n.y * 0.014, position[2] + n.z * 0.014], [n.x, n.y, n.z], kind);
}

/** Run `fn` on the right-hand side and again reflected onto the left. */
export function bothSides(ctx: Ctx, fn: () => void) {
  fn();
  ctx.within({ scale: [-1, 1, 1] }, fn);
}

/** A closed band of chamfered bars around a ring (frame rings, rims), pushed `offset` away from its centre. */
export function band(ctx: Ctx, role: Role, ring: Ring, w: number, h: number, offset = 0) {
  const c = ring.reduce<Vec3>((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length, s[2] + p[2] / ring.length], [0, 0, 0]);
  const pts = ring.map(p => {
    const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const l = Math.hypot(...d) || 1;
    return [p[0] + d[0] / l * offset, p[1] + d[1] / l * offset, p[2] + d[2] / l * offset] as Vec3;
  });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const out: Vec3 = [(a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1], (a[2] + b[2]) / 2 - c[2]];
    ctx.strut(role, a, b, w, h, 0.003, out);
  }
}
