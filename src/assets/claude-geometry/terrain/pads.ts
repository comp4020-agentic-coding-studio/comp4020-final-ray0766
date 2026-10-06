import type * as T from 'three';
import { anchorFrame, anchorQuaternion, LANDING_CLEARANCE, localToPlanet, PLANET_RADIUS, SPAWN_DIR } from '../core/anchor.ts';
import type { SurfaceAnchor } from '../core/anchor.ts';
import { handleFor } from '../core/dispose.ts';
import type { ModelHandle } from '../core/dispose.ts';
import { circleFootprint, fitGround, rectFootprint } from '../core/ground.ts';
import type { Footprint, GroundFit, HeightField } from '../core/ground.ts';
import { PLACEMENT_MARGIN } from '../core/placement.ts';
import { arcDistance, normalize } from '../core/vec.ts';
import type { Vec3 } from '../core/vec.ts';
import { PROP_RADIUS } from '../core/world.ts';
import type { PropKind } from '../core/world.ts';
import { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { GLOW, PALETTE } from '../style/tokens.ts';
import type { Foundation } from './planet.ts';
import type { AnchoredObject } from './policy.ts';
import { sinCos } from './trig.ts';

// Foundation pads: stand-ins for placed objects so the terrain policy has
// something real to protect in the demo. Each pad is the footprint of a main
// project prop (radius from CATALOGUE at a76575a) or a rectangular blueprint
// footprint, built as a cast concrete pad with a plinth reaching down to the
// ground, a steel edge angle, anchor bolts and a status lamp. Real buildings
// replace them at integration; the anchors and footprints are what matter.

export type PadShape = { kind: 'circle'; radius: number } | { kind: 'rect'; width: number; depth: number };
export interface PadSpec { id: string; label: string; shape: PadShape; prop?: PropKind }

export const PAD_SPECS: PadSpec[] = [
  { id: 'pad-a', label: 'Pad A · structure 3 × 2 m', shape: { kind: 'rect', width: 3, depth: 2 } },
  { id: 'pad-b', label: 'Pad B · cottage footprint', shape: { kind: 'circle', radius: PROP_RADIUS.cottage }, prop: 'cottage' },
  { id: 'pad-c', label: 'Pad C · structure 2 × 2 m', shape: { kind: 'rect', width: 2, depth: 2 } },
  { id: 'pad-d', label: 'Pad D · bench footprint', shape: { kind: 'circle', radius: PROP_RADIUS.bench }, prop: 'bench' },
  { id: 'pad-e', label: 'Pad E · tree footprint', shape: { kind: 'circle', radius: PROP_RADIUS.tree }, prop: 'tree' },
  { id: 'pad-f', label: 'Pad F · lamp footprint', shape: { kind: 'circle', radius: PROP_RADIUS.lamp }, prop: 'lamp' },
];

/**
 * Spacing of the ground samples under a pad, metres. fitGround only sees its
 * samples, and ridged landforms have sharp crests, so a sparse ring (the main
 * project's 8 points) let knolls between samples rise up to 0.19 m through a
 * slab. 0.075 m is under half the ground-mesh vertex spacing at LOD high
 * (about 0.17 m); between samples the field can still rise a little at a
 * crest (measured up to 18 mm across 4 styles × 4 seeds), which buildPlanet
 * grades out of the mesh under the slab (see Foundation in planet.ts).
 */
export const PAD_SAMPLE_STEP = 0.075;

/** Ground samples under a pad: a square grid at `step` inside the outline plus the outline itself. */
export function padFootprint(shape: PadShape, step = PAD_SAMPLE_STEP): Footprint {
  if (shape.kind === 'rect') return rectFootprint(-shape.width / 2, shape.width / 2, -shape.depth / 2, shape.depth / 2, step);
  const r = shape.radius, n = Math.ceil(r / step), inner = r - step * 0.5;
  const samples: [number, number][] = [];
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    const x = i * step, z = k * step;
    if (x * x + z * z < inner * inner) samples.push([x, z]);
  }
  // Rim samples from arithmetic-only trig, so a footprint (and the seat it
  // gives) has the same bits in every engine.
  const rim = Math.max(8, Math.ceil(2 * Math.PI * r / step));
  for (let i = 0; i < rim; i++) { const [sn, cs] = sinCos(i / rim * Math.PI * 2); samples.push([cs * r, sn * r]); }
  return { samples, radius: r };
}

/** The old sparse footprint (rim, mid ring, 0.25 m rectangles); only used to reject candidate sites quickly. */
function coarseFootprint(shape: PadShape): Footprint {
  if (shape.kind === 'rect') return rectFootprint(-shape.width / 2, shape.width / 2, -shape.depth / 2, shape.depth / 2, 0.25);
  const rim = circleFootprint(shape.radius, 16), mid = circleFootprint(shape.radius * 0.55, 8);
  return { samples: [...rim.samples, ...mid.samples.slice(1)], radius: shape.radius };
}

/** True when a local (x, z) point lies on the pad's slab. */
export function padCovers(shape: PadShape, x: number, z: number): boolean {
  return shape.kind === 'circle' ? x * x + z * z <= shape.radius * shape.radius : Math.abs(x) <= shape.width / 2 && Math.abs(z) <= shape.depth / 2;
}

/** What buildPlanet needs to grade the ground under a seated pad. */
export function padFoundation(pad: PlacedPad, fit: GroundFit): Foundation {
  return { anchor: pad.anchor, baseRadius: fit.baseRadius, radius: pad.footprint.radius, covers: (x, z) => padCovers(pad.spec.shape, x, z) };
}

export interface PlacedPad extends AnchoredObject { spec: PadSpec }

/** Direction `metres` of arc from the landing spot along a bearing (radians from the spawn frame's front). */
function around(metres: number, bearing: number): Vec3 {
  const f = anchorFrame({ dir: SPAWN_DIR, yaw: 0 });
  const a = metres / PLANET_RADIUS;
  const [sb, cb] = sinCos(bearing), [sa, ca] = sinCos(a);
  const t: Vec3 = [f.front[0] * cb + f.right[0] * sb, f.front[1] * cb + f.right[1] * sb, f.front[2] * cb + f.right[2] * sb];
  return normalize([SPAWN_DIR[0] * ca + t[0] * sa, SPAWN_DIR[1] * ca + t[1] * sa, SPAWN_DIR[2] * ca + t[2] * sa]);
}

/** Anything to be sited near the landing spot: its dense footprint, and optionally a sparse one for a quick first check. */
export interface SiteSpec { id: string; label: string; footprint: Footprint; coarse?: Footprint }

/**
 * Deterministic sites near the landing spot where every object fits the given
 * field comfortably (foundation under `maxDepth` on its dense footprint),
 * keeping the main project's landing clearance and footprint spacing plus
 * 0.25 m. Rings run outwards from 2.7 m; each object takes the first site
 * that fits and faces the landing spot. Objects that find no site are left out.
 */
export function chooseSites(field: HeightField, specs: readonly SiteSpec[], maxDepth = 0.4): AnchoredObject[] {
  const placed: AnchoredObject[] = [];
  const rings = [2.7, 3.2, 3.7, 4.2, 4.7, 5.3, 5.9, 6.6, 7.4];
  for (const spec of specs) {
    const footprint = spec.footprint, coarse = spec.coarse ?? spec.footprint;
    search: for (const ring of rings) for (let k = 0; k < 24; k++) {
      const bearing = (k * 7 % 24) / 24 * Math.PI * 2 + ring * 0.37;
      const dir = around(ring, bearing);
      // Face the landing spot, so pads read as laid out around it.
      const yaw = ((-bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const anchor: SurfaceAnchor = { dir, yaw };
      if (arcDistance(dir, SPAWN_DIR, PLANET_RADIUS) < footprint.radius + LANDING_CLEARANCE) continue;
      if (placed.some(p => arcDistance(dir, p.anchor.dir, PLANET_RADIUS) < footprint.radius + p.footprint.radius + PLACEMENT_MARGIN + 0.25)) continue;
      // Cheap sparse check first; the dense footprint decides.
      const quick = fitGround(field, anchor, coarse);
      if (quick.problem || quick.foundationDepth > maxDepth) continue;
      const fit = fitGround(field, anchor, footprint);
      if (fit.problem || fit.foundationDepth > maxDepth) continue;
      placed.push({ id: spec.id, label: spec.label, anchor, footprint });
      break search;
    }
  }
  return placed;
}

/** Sites for the foundation pads (chooseSites with each pad's dense and sparse footprints). */
export function choosePadSites(field: HeightField, specs: readonly PadSpec[] = PAD_SPECS, maxDepth = 0.4): PlacedPad[] {
  const byId = new Map(specs.map(s => [s.id, s]));
  return chooseSites(field, specs.map(s => ({ id: s.id, label: s.label, footprint: padFootprint(s.shape), coarse: coarseFootprint(s.shape) })), maxDepth)
    .map(o => ({ ...o, spec: byId.get(o.id)! }));
}

export interface PadModel extends ModelHandle<T.Group> { readonly pad: PlacedPad; readonly fit: GroundFit; readonly conflict: boolean }

/**
 * A pad seated by `fit` on its anchor. The plinth reaches down by the fit's
 * foundation depth plus an embedment, so it meets the ground everywhere under
 * the footprint. `conflict` swaps the pilot lamp for a red status lamp and
 * runs a thin red status strip around the cap edge, above the plinth, so it
 * stays visible from orbit and above a flooded shore.
 */
export interface PadOptions {
  /**
   * A footing that carries a prop (round pads only): the same cast cap,
   * plinth, edge angle and status lamp, but no survey datum, anchor plates or
   * deck markings, since the prop stands on the cap with its own bolted feet.
   */
  carrier?: boolean;
  /**
   * A planting bed for a tree or plants (round pads only, with `carrier`):
   * the same footing below ground, but a cast kerb ring standing 35 mm proud
   * of the floor around a bed of mulch level with the floor, instead of a
   * solid cap with a steel edge.
   */
  bed?: boolean;
}

export function buildPad(pad: PlacedPad, fit: GroundFit, lib: StyleLibrary, conflict: boolean, options: PadOptions = {}): PadModel {
  const carrier = options.carrier === true, bed = carrier && options.bed === true && pad.spec.shape.kind === 'circle';
  const b = new PartBuilder(lib.lod);
  const concrete = lib.preset('concrete'), steel = lib.preset('frame'), bright = lib.preset('frameLight'), hazard = lib.hazard();
  // Painted tread plate for the hatch: bare deck steel mirrors the black sky
  // and reads as a hole from orbit; a mid-grey paint keeps the lid legible.
  const plate = lib.custom('terrain:hatch-plate', { finish: 'paint', pattern: 'deck', color: PALETTE.steel });
  // Bark mulch in a planting bed: the precast pattern's pits read as coarse chips at this scale.
  const mulch = bed ? lib.custom('terrain:bed-mulch', { finish: 'concrete', pattern: 'concrete', color: PALETTE.oxide, relief: 1.6, envIntensity: 0.4 }) : concrete;
  // Owned by this pad (not shared), so dispose() frees it with the geometry.
  const glow = lib.createGlow(conflict ? PALETTE.signalRed : PALETTE.cyan, conflict ? GLOW.lit : GLOW.pilot);
  const depth = Math.max(0.12, fit.foundationDepth + 0.1);
  const cap = 0.09;
  const strip = 0.03, stripY = -0.042;
  const shape = pad.spec.shape;
  if (shape.kind === 'circle') {
    const r = shape.radius;
    b.cylinder(concrete, r - 0.03, r - 0.01, depth, { position: [0, -cap - depth / 2 + 0.01, 0] });
    if (bed) {
      // Kerb ring: chamfered outside top edge, a small arris inside. Lathe
      // profiles run counter-clockwise (bottom, outside, top, inside).
      const k = 0.075, rise = 0.035;
      b.lathe(concrete, [[r - k, -cap], [r + 0.004, -cap], [r + 0.004, rise - 0.014], [r - 0.012, rise], [r - k + 0.006, rise], [r - k, rise - 0.006], [r - k, -cap]], { position: [0, 0, 0] });
      // Mulch level with the floor plane, the tree or plants standing in it.
      b.lathe(mulch, [[0, -cap], [r - k + 0.001, -cap], [r - k + 0.001, 0], [0, 0]], { position: [0, 0, 0] });
    } else {
      // Cast cap with a chamfered top edge. Lathe profiles run counter-clockwise
      // (bottom, outside, top) so every face points outwards.
      b.lathe(concrete, [[0, -cap], [r + 0.004, -cap], [r + 0.004, -0.016], [r - 0.012, 0], [0, 0]], { position: [0, 0, 0] });
      // Steel edge angle around the rim.
      b.lathe(steel, [[r + 0.006, -0.07], [r + 0.016, -0.07], [r + 0.016, 0.004], [r - 0.03, 0.004], [r - 0.03, -0.004], [r + 0.006, -0.004]], { position: [0, 0, 0] });
    }
    if (carrier && !bed) {
      // Fixings of the edge angle, on its upright flange.
      const fixings = Math.max(6, Math.round(r * 12));
      for (let i = 0; i < fixings; i++) {
        const a = (i + 0.5) / fixings * Math.PI * 2;
        // Bolt axis turned from +Y to point radially outwards.
        b.bolt(bright, { position: [Math.cos(a) * (r + 0.016), -0.035, Math.sin(a) * (r + 0.016)], rotation: [0, -a, -Math.PI / 2] }, 0.008);
      }
    } else if (!carrier) {
      const bolts = r > 0.6 ? 8 : 4;
      for (let i = 0; i < bolts; i++) {
        const a = (i + 0.5) / bolts * Math.PI * 2, x = Math.cos(a) * r * 0.72, z = Math.sin(a) * r * 0.72;
        b.box(steel, [0.09, 0.012, 0.09], { position: [x, 0.006, z], rotation: [0, -a, 0] }, 0.003);
        b.bolt(bright, { position: [x, 0.012, z] }, 0.014);
      }
      if (r > 0.5) for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4;
        b.box(hazard, [0.2, 0.004, 0.06], { position: [Math.cos(a) * (r - 0.1), 0.002, Math.sin(a) * (r - 0.1)], rotation: [0, -a + Math.PI / 2, 0] }, 0);
      }
      // Survey datum at the centre.
      b.cylinder(bright, 0.035, 0.04, 0.012, { position: [0, 0.006, 0] });
    }
    // Status lamp housing on the +Z rim.
    b.box(steel, [0.12, 0.05, 0.04], { position: [0, -0.03, r + 0.035] }, 0.006);
    b.box(glow, [0.08, 0.014, 0.008], { position: [0, -0.03, r + 0.057] }, 0);
    if (conflict) b.cylinder(glow, r + 0.02, r + 0.02, strip, { position: [0, stripY, 0] }, { segments: lib.lod === 'low' ? 24 : 48, open: true });
  } else {
    const { width: w, depth: d } = shape;
    b.box(concrete, [w - 0.04, depth, d - 0.04], { position: [0, -cap - depth / 2 + 0.01, 0] }, 0.02);
    b.box(concrete, [w + 0.01, cap, d + 0.01], { position: [0, -cap / 2, 0] }, 0.018);
    for (const [x, z, lw, ld] of [[0, d / 2 + 0.012, w + 0.04, 0.02], [0, -d / 2 - 0.012, w + 0.04, 0.02], [w / 2 + 0.012, 0, 0.02, d], [-w / 2 - 0.012, 0, 0.02, d]] as const) {
      b.box(steel, [lw, 0.075, ld], { position: [x, -0.034, z] }, 0.003);
    }
    // Anchor plates and bolts on a 1 m grid inset from the edges, where columns would land.
    for (let x = -w / 2 + 0.25; x <= w / 2 - 0.25 + 1e-6; x += (w - 0.5) / Math.max(1, Math.round((w - 0.5)))) {
      for (const z of [-d / 2 + 0.25, d / 2 - 0.25]) {
        b.box(steel, [0.16, 0.014, 0.16], { position: [x, 0.007, z] }, 0.003);
        for (const [bx, bz] of [[0.05, 0.05], [-0.05, 0.05], [0.05, -0.05], [-0.05, -0.05]]) b.bolt(bright, { position: [x + bx, 0.014, z + bz] }, 0.011);
      }
    }
    // Service hatch over the utility pit: a tread-plate cover in a raised
    // steel frame, two hinge knuckles on the back edge and a lifting bar at
    // the front, so it reads as a lid and not as a hole.
    const hw = Math.min(0.9, w * 0.3), hd = 0.56, lip = 0.035;
    for (const [x, z, lw, ld] of [[0, hd / 2 - lip / 2, hw, lip], [0, -hd / 2 + lip / 2, hw, lip], [hw / 2 - lip / 2, 0, lip, hd - 2 * lip], [-hw / 2 + lip / 2, 0, lip, hd - 2 * lip]] as const) {
      b.box(steel, [lw, 0.02, ld], { position: [x, 0.01, z] }, 0.004);
    }
    b.box(plate, [hw - 2 * lip - 0.006, 0.012, hd - 2 * lip - 0.006], { position: [0, 0.006, 0] }, 0.002);
    for (const x of [-hw * 0.3, hw * 0.3]) {
      b.cylinder(bright, 0.011, 0.011, 0.09, { position: [x, 0.022, -hd / 2 + lip / 2], rotation: [0, 0, Math.PI / 2] });
      b.box(steel, [0.07, 0.006, 0.05], { position: [x, 0.015, -hd / 2 + lip + 0.02] }, 0.002);
    }
    b.box(bright, [hw * 0.36, 0.01, 0.014], { position: [0, 0.019, hd / 2 - lip - 0.03] }, 0.003);
    for (const sx of [-1, 1]) b.box(steel, [0.016, 0.014, 0.03], { position: [sx * hw * 0.18, 0.012, hd / 2 - lip - 0.03] }, 0.002);
    for (const [bx, bz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.bolt(bright, { position: [bx * (hw / 2 - lip / 2), 0.02, bz * (hd / 2 - lip / 2)] }, 0.008);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(hazard, [0.3, 0.004, 0.05], { position: [sx * (w / 2 - 0.2), 0.002, sz * (d / 2 - 0.06)] }, 0);
      b.box(hazard, [0.05, 0.004, 0.3], { position: [sx * (w / 2 - 0.06), 0.002, sz * (d / 2 - 0.2)] }, 0);
    }
    b.box(steel, [0.14, 0.05, 0.04], { position: [0, -0.03, d / 2 + 0.04] }, 0.006);
    b.box(glow, [0.1, 0.014, 0.008], { position: [0, -0.03, d / 2 + 0.062] }, 0);
    if (conflict) {
      const o = 0.026;
      for (const [x, z, lw, ld] of [[0, d / 2 + o, w + 2 * o, 0.006], [0, -d / 2 - o, w + 2 * o, 0.006], [w / 2 + o, 0, 0.006, d + 2 * o], [-w / 2 - o, 0, 0.006, d + 2 * o]] as const) {
        b.box(glow, [lw, strip, ld], { position: [x, stripY, z] }, 0);
      }
    }
  }
  const built = b.build(`pad:${pad.id}`);
  const group = built.group;
  const p = localToPlanet(pad.anchor, fit.baseRadius, [0, 0, 0]);
  group.position.set(p[0], p[1], p[2]);
  const q = anchorQuaternion(pad.anchor);
  group.quaternion.set(q[0], q[1], q[2], q[3]);
  group.userData.padId = pad.id;
  const handle = handleFor(group);
  return {
    object: group, pad, fit, conflict,
    get disposed() { return handle.disposed; },
    dispose: () => handle.dispose(),
  };
}

/** Planet-space point above the pad's centre, for labels. */
export function padLabelPoint(pad: PlacedPad, fit: GroundFit, lift = 0.25): Vec3 {
  return localToPlanet(pad.anchor, fit.baseRadius, [0, lift, 0]);
}
