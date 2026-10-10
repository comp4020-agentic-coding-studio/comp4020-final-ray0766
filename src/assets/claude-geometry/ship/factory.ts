import * as T from 'three';
import { disposeObject3D, handleFor } from '../core/dispose.ts';
import type { ModelHandle } from '../core/dispose.ts';
import type { Vec3 } from '../core/vec.ts';
import { measure, PartBuilder } from '../style/geometry.ts';
import type { LodTier } from '../style/lod.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { lookGlow, lookPaint, lookParams } from '../style/look.ts';
import type { Look } from '../style/look.ts';
import { GLOW, PALETTE } from '../style/tokens.ts';
import type { PaintName, ShipDesign } from './design.ts';
import { latheZ } from './geom.ts';
import { Ctx } from './kit.ts';
import type { ExhaustPoint, NavPoint, Role } from './kit.ts';
import { ATLAS, hullMarkings, markingGeometry, paintAtlas, seedOf } from './markings.ts';
import type { AtlasSpec, AtlasStyle, MarkingKind } from './markings.ts';
import { COCKPIT_BUILDERS } from './parts/cockpits.ts';
import { DORSAL_BUILDERS } from './parts/dorsals.ts';
import { ENGINE_BUILDERS } from './parts/engines.ts';
import { HULL_BUILDERS } from './parts/hulls.ts';
import { TAIL_BUILDERS } from './parts/tails.ts';
import { WING_BUILDERS } from './parts/wings.ts';
import { VILLAGE_SHIP_BUILDERS, villageInfo } from './parts/village/index.ts';
import { assemblyPlan, CATALOGUE, HULLS } from './spec.ts';
import type { Category } from './spec.ts';

// createShipModel(design, library, lod) assembles a ship from its design:
// every part is built inside its socket's frame by one PartBuilder, so the
// whole ship merges into one mesh per material. Effects are added after the
// merge as three small owned meshes: navigation lenses, the exhaust plume and
// the markings layer (grime, soot, placards and the registration; markings.ts).
//
// Ownership (docs/CONTRACTS.md §6): paint comes from StyleLibrary.leasePaint
// and is released on dispose; presets, glass and hazard are shared library
// materials; the liner glow, navigation, plume and markings materials (and in
// the village look the plume's depth-only twin), all geometry and the markings
// texture belong to the handle and are freed by dispose().

export interface ShipStats { triangles: number; drawCalls: number }

export interface ShipHandle extends ModelHandle<T.Group> {
  readonly design: ShipDesign;
  readonly lod: LodTier;
  /** Nozzle exit anchors, children of `object`; each anchor's +Z is the exhaust direction. */
  readonly exhausts: readonly T.Object3D[];
  /** Solid geometry in the body frame (plume excluded: it is light, not structure). */
  readonly bounds: T.Box3;
  /** Distance from the origin to the farthest solid vertex. */
  readonly radius: number;
  /** Measured with every effect visible (full thrust, nav lights on): the worst case for budgets. */
  readonly stats: ShipStats;
  /** Milliseconds spent in createShipModel. */
  readonly buildMs: number;
  readonly thrust: number;
  readonly navLights: boolean;
  /** 0..1. Drives the liner glow and the exhaust plume. */
  setThrust(value: number): void;
  setNavLights(on: boolean): void;
  /** Owned effect materials, exposed read-only for tests and the demo HUD. */
  readonly effects: { liner: T.MeshStandardMaterial; nav: T.MeshBasicMaterial; plume: T.MeshBasicMaterial; plumeMesh: T.InstancedMesh | null };
}

/** Paints the markings atlas (markings.ts) into a texture the handle owns. Browser default: canvas; tests pass their own. */
export type DecalPainter = (spec: AtlasSpec) => T.Texture;
export interface ShipModelOptions { decal?: DecalPainter | null }

type Builder = (ctx: Ctx) => void;
const BUILDERS: Record<Category, Record<string, Builder>> = {
  hull: HULL_BUILDERS, cockpit: COCKPIT_BUILDERS, wings: WING_BUILDERS, engines: ENGINE_BUILDERS, tail: TAIL_BUILDERS, dorsal: DORSAL_BUILDERS,
};

/** A part's tile name and line as a look shows them: the village look names its own models (parts/village). */
export function shipPartInfo(category: Category, id: string, look: Look = 'industrial'): { id: string; name: string; spec: string } {
  const base = CATALOGUE[category][id as keyof (typeof CATALOGUE)[typeof category]] as { id: string; name: string; spec: string };
  return look === 'village' ? { ...base, ...villageInfo()[id] } : base;
}

/** The builder for a part in a look: the village look's own model where it has one (parts/village.ts), else the industrial one. */
export function shipBuilder(category: Category, part: string, look: Look = 'industrial'): Builder | undefined {
  return (look === 'village' ? VILLAGE_SHIP_BUILDERS[category]?.[part] : undefined) ?? BUILDERS[category][part];
}

/** Navigation light colours from the shared palette: port red, starboard cyan, strobe sodium. */
export const NAV_COLORS = { port: PALETTE.signalRed, starboard: PALETTE.cyan, strobe: PALETTE.sodium } as const;

/**
 * The navigation colours a look draws: the village look's own glow colours for
 * the same three, else NAV_COLORS (the warm look's lenses stay as they were).
 */
export function navColors(look: Look = 'industrial'): { port: string; starboard: string; strobe: string } {
  if (look !== 'village') return NAV_COLORS;
  return { port: lookGlow(look, 'signalRed', NAV_COLORS.port), starboard: lookGlow(look, 'cyan', NAV_COLORS.starboard), strobe: lookGlow(look, 'sodium', NAV_COLORS.strobe) };
}
/**
 * How bright a lit lens is, times its colour. The tone-mapped looks take 3 and
 * bloom; the village look draws without a tone curve, where 3 clips every lens
 * to a harsh saturated primary, so it draws the lens in its colour, flat.
 */
export const navLevel = (look: Look) => (look === 'village' ? 1 : 3);
/** Liner emissive at rest: a sixth of the pilot step, a residual heat that is visible only up close. */
export const LINER_IDLE = GLOW.pilot / 6;
/** Emissive intensity of the liner from rest up to GLOW.hot at full thrust. */
export const linerIntensity = (thrust: number) => LINER_IDLE + (GLOW.hot - LINER_IDLE) * thrust;

/**
 * Ceiling on the linear luminance of hull paint. The palette's light neutrals
 * (bone 0.47, alloy 0.41) are wall and swatch colours; on a hull's upper
 * facets, facing the hangar key light and the overhead softbox, they clipped to
 * near white and lost every seam and stain. Hull paint keeps the palette hue and
 * is scaled down to this ceiling, roughly a weathered light paint; darker
 * choices are unchanged.
 */
export const HULL_PAINT_MAX_LUMINANCE = 0.3;

/** The colour a palette paint is applied at on a hull (see HULL_PAINT_MAX_LUMINANCE). */
export function hullTone(paint: PaintName): string {
  const c = new T.Color(PALETTE[paint]);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum <= HULL_PAINT_MAX_LUMINANCE) return PALETTE[paint];
  return '#' + c.multiplyScalar(HULL_PAINT_MAX_LUMINANCE / lum).getHexString();
}

/**
 * Bare metals for ships and the shipyard set. The shared `frame`/`frameLight`
 * presets are brushed (5 mm stripes); with box-projected metre UVs those
 * stripes cross sloped leading edges, fins and fences and alias into stair
 * steps and moiré at workshop distance (seen in the first renders and in
 * review). These keep the metal finish's roughness variation on a plain
 * surface. Shared and permanent like presets (StyleLibrary.custom).
 */
export function bareMetals(lib: StyleLibrary) {
  return {
    steel: lib.custom('ship:bare-steel', { finish: 'metal', pattern: 'plain', color: PALETTE.gunmetal, relief: 0.8 }),
    alloy: lib.custom('ship:bare-alloy', { finish: 'metal', pattern: 'plain', color: PALETTE.alloy, relief: 0.8 }),
    heat: lib.custom('ship:heat', { finish: 'metal', pattern: 'plain', color: '#4a4440', relief: 0.8 }),
  };
}

/**
 * The village look's own ship surfaces, shared and permanent like presets
 * (StyleLibrary.custom; colours in look.ts VILLAGE.materials). The canopy is
 * glass drawn as an opaque tone: it takes the two bands and the lines like the
 * hull round it, and nothing behind it is drawn through it: the library's
 * flat glass (0.82–0.92 opaque) would show the hull under the courier's bubble
 * and the van's far panes as lighter shapes without lines. The dark role is a warm
 * dark whose shade stays clear of the line ink, where the iron preset's does not.
 */
export function villageShipMaterials(lib: StyleLibrary) {
  return {
    canopy: lib.custom('ship:canopy', { finish: 'paint', pattern: 'plain', color: '#4a6f70' }),
    dark: lib.custom('ship:dark', { finish: 'paint', pattern: 'plain', color: '#6b5c4f' }),
  };
}

interface Leases { materials: Record<Role, T.Material>; release(): void; liner: T.MeshStandardMaterial }

/** The colour a palette paint is applied at on a hull in a look: the warm look's own tone, else hullTone. */
export function paintTone(paint: PaintName, look: Look = 'industrial'): string {
  return lookPaint(look, paint) ?? hullTone(paint);
}

function leaseMaterials(lib: StyleLibrary, design: ShipDesign, lod: LodTier): Leases {
  const primary = lib.leasePaint(paintTone(design.paint.primary, lib.look), 'hull', 'paint');
  const secondary = lib.leasePaint(paintTone(design.paint.secondary, lib.look), 'hull', 'paint');
  const trim = lib.leasePaint(paintTone(design.paint.trim, lib.look), 'plain', 'paint');
  const liner = lib.createGlow(lookGlow(lib.look, design.glow, PALETTE[design.glow]), linerIntensity(0));
  liner.name = 'ship:liner';
  const village = lib.look === 'village' ? villageShipMaterials(lib) : null;
  // Drawn flat (no tone curve), full thrust shows the glow colour itself rather than clipping it to white.
  if (village) liner.emissive.multiplyScalar(1 / GLOW.hot);
  const { steel: metal, alloy, heat } = bareMetals(lib);
  // At low LOD several roles share a material to stay inside 10 draw calls; the
  // village look always folds them (its flat colours need no more).
  const fold = lod === 'low' || lib.look === 'village';
  const materials: Record<Role, T.Material> = {
    primary: primary.material,
    secondary: secondary.material,
    trim: trim.material,
    metal,
    bright: fold ? metal : alloy,
    dark: village?.dark ?? lib.preset('framePainted'),
    glass: village?.canopy ?? lib.glass('canopy'),
    hazard: fold ? trim.material : lib.hazard(),
    heat: fold ? metal : heat,
    liner,
  };
  return { materials, liner, release() { primary.release(); secondary.release(); trim.release(); } };
}

// ------------------------------------------------------------------ effects

function navMesh(navs: NavPoint[], segments: number, palette: { port: string; starboard: string; strobe: string } = NAV_COLORS): { mesh: T.Mesh; material: T.MeshBasicMaterial } {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const lens = latheZ([[0, 0.016], [0.011, 0.012], [0.017, 0.004], [0.018, -0.006]].reverse() as [number, number][], Math.max(8, segments));
  const p = lens.getAttribute('position'), n = lens.getAttribute('normal');
  const q = new T.Quaternion(), v = new T.Vector3(), w = new T.Vector3(), c = new T.Color();
  for (const nav of navs) {
    q.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...nav.normal).normalize());
    const hex = nav.kind === 'strobe' ? palette.strobe : nav.position[0] < 0 ? palette.port : palette.starboard;
    c.set(hex);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyQuaternion(q).add(new T.Vector3(...nav.position));
      w.fromBufferAttribute(n, i).applyQuaternion(q);
      positions.push(v.x, v.y, v.z); normals.push(w.x, w.y, w.z); colors.push(c.r, c.g, c.b);
    }
  }
  lens.dispose();
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  const material = new T.MeshBasicMaterial({ vertexColors: true });
  material.name = 'ship:nav';
  const mesh = new T.Mesh(g, material);
  mesh.name = 'nav-lights';
  return { mesh, material };
}

/**
 * The village look's plume (unit, along +Z): a flame drawn flat, as an
 * illustrator would, in two tones with hard edges: a sheath in the glow colour
 * that swells a little past the nozzle and closes to a point, and a short pale
 * core inside it. Each shell is one flat colour (no fade along it or towards
 * its edge), carried in the vertex colours over a white material.
 */
function flatPlumeGeometry(segments: number, glow: string): T.BufferGeometry {
  const sheath = new T.Color(glow), core = sheath.clone().lerp(new T.Color('#ffffff'), 0.6);
  const shells: [[number, number][], T.Color][] = [
    [[[0.92, 0], [1, 0.12], [0.9, 0.35], [0.62, 0.62], [0.3, 0.86], [0.04, 1]], sheath],
    [[[0.5, 0], [0.52, 0.1], [0.4, 0.3], [0.2, 0.48], [0.03, 0.58]], core],
  ];
  const parts = shells.map(([profile, c]) => {
    const g = latheZ(profile, segments);
    const n = g.getAttribute('position').count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    return g;
  });
  return mergeShells(parts);
}

function mergeShells(parts: T.BufferGeometry[]): T.BufferGeometry {
  const merged = new T.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((s, g) => s + g.getAttribute(name).array.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const g of parts) { out.set(g.getAttribute(name).array as Float32Array, o); o += g.getAttribute(name).array.length; }
    merged.setAttribute(name, new T.BufferAttribute(out, 3));
  }
  parts.forEach(g => g.dispose());
  return merged;
}

/** Unit plume along +Z (radius 1, length 1): a hot inner core and a fainter sheath, bright at the nozzle. */
function plumeGeometry(segments: number): T.BufferGeometry {
  // Three nested shells, brightest inside; with the edge fade in the material
  // they read as a soft core and a fainter sheath instead of one hard cone.
  const shells: [number, number][] = [[0.42, 1.2], [0.72, 0.55], [1.0, 0.22]];
  const parts: T.BufferGeometry[] = [];
  for (const [r, gain] of shells) {
    const steps = 6;
    const profile: [number, number][] = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; profile.push([r * (1 - 0.82 * t) + 0.02, t]); }
    const g = latheZ(profile, segments);
    const p = g.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = gain * Math.pow(1 - Math.min(1, p.getZ(i)), 2.2); colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k; }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    parts.push(g);
  }
  return mergeShells(parts);
}

/**
 * The markings layer: grime, soot, placards and (when the design has one) the
 * registration, as flat quads on the hull with UVs into one painted atlas.
 */
function markingsMesh(design: ShipDesign, painter: DecalPainter, ink: string, lib: StyleLibrary, only?: readonly MarkingKind[]): T.Mesh {
  const all = hullMarkings(design.parts.hull, design.registration !== undefined);
  const g = markingGeometry(only ? all.filter(m => only.includes(m.kind)) : all);
  const material = new T.MeshStandardMaterial({
    map: painter({ registration: design.registration, ink, seed: seedOf(design.id) }),
    // Dirt and stencil paint are matte, so grime also breaks up the paint's sheen.
    transparent: true, roughness: 0.82, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
  });
  material.name = 'ship:markings';
  // Lit as the hull under it is: in the village look a marking falls into shade with its side.
  lib.lightAsLook(material);
  const mesh = new T.Mesh(g, material);
  mesh.name = 'markings';
  mesh.renderOrder = 1;
  return mesh;
}

/** Ink that reads against the hull side's paint: light on dark paint, dark on light. */
export function decalInk(design: ShipDesign, look: Look = 'industrial'): string {
  const c = new T.Color(paintTone(design.paint[HULLS[design.parts.hull].decal.paint], look));
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const P = lookParams(look);
  if (P) return lum > 0.18 ? P.ink.dark : P.ink.light;
  return lum > 0.18 ? '#1c1f23' : '#d8d4c8';
}

/** Default markings painter for browsers (a canvas); returns null where there is no DOM (Node tests). */
export function defaultDecalPainter(style: AtlasStyle = 'worn'): DecalPainter | null {
  if (typeof document === 'undefined') return null;
  return spec => {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS.width; canvas.height = ATLAS.height;
    paintAtlas(canvas.getContext('2d')!, spec, style);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
}

// ------------------------------------------------------------------ factory

export function createShipModel(design: ShipDesign, lib: StyleLibrary, lod: LodTier = lib.lod, options: ShipModelOptions = {}): ShipHandle {
  const started = performance.now();
  const plan = assemblyPlan(design.parts);
  const leases = leaseMaterials(lib, design, lod);
  const builder = new PartBuilder(lod);
  const ctx = new Ctx(builder, leases.materials);
  try {
    for (const step of plan) {
      const build = shipBuilder(step.category, step.part, lib.look);
      if (!build) throw new Error(`No builder for ${step.category} ${step.part}.`);
      if (!step.socket) build(ctx);
      else ctx.within({ position: step.socket.position, rotation: step.socket.rotation, scale: step.socket.mirror ? [-1, 1, 1] : [1, 1, 1] }, () => build(ctx));
    }
  } catch (e) {
    // Free whatever the builder already holds, then the leases and the liner.
    try { disposeObject3D(builder.build().group); } catch { /* nothing merged yet */ }
    leases.release(); leases.liner.dispose();
    throw e;
  }
  const built = builder.build(`ship:${design.name}`);
  const root = new T.Group();
  root.name = `ship:${design.id}`;
  built.group.name = 'hull-structure';
  root.add(built.group);

  // Solid bounds and radius, before any effect is added.
  const bounds = new T.Box3();
  let radius = 0;
  const v = new T.Vector3();
  for (const child of built.group.children) {
    const p = (child as T.Mesh).geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); bounds.expandByPoint(v); radius = Math.max(radius, v.length()); }
  }

  const flat = lib.look === 'village';
  const { mesh: nav, material: navMaterial } = navMesh(ctx.navs, ctx.segments, navColors(lib.look));
  root.add(nav);

  const exhausts = ctx.exhausts.map((e: ExhaustPoint, i) => {
    const anchor = new T.Object3D();
    anchor.name = `exhaust.${i}`;
    anchor.position.set(...e.position);
    anchor.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...e.direction).normalize());
    anchor.userData.radius = e.radius;
    root.add(anchor);
    return anchor;
  });

  const glow = lookGlow(lib.look, design.glow, PALETTE[design.glow]);
  const plumeMaterial = new T.MeshBasicMaterial({
    // The village flame carries its two tones in the vertex colours and is laid over what is behind it, not added to it.
    color: flat ? '#ffffff' : glow, vertexColors: true, transparent: true, opacity: 0,
    blending: flat ? T.NormalBlending : T.AdditiveBlending, depthWrite: false,
  });
  plumeMaterial.name = 'ship:plume';
  // Fade the plume towards its silhouette (view-angle falloff), so the shells
  // read as hot gas rather than a hard-edged translucent cone. Browser only;
  // Node tests never compile shaders. The village flame keeps its hard edge.
  if (!flat) plumeMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFacing;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec3 plumeNormal = normal;
        #ifdef USE_INSTANCING
          plumeNormal = inverse(transpose(mat3(instanceMatrix))) * plumeNormal;
        #endif
        vFacing = abs(dot(normalize(normalMatrix * plumeNormal), normalize(-mvPosition.xyz)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFacing;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= vFacing * vFacing;\n#include <opaque_fragment>');
  };
  let plumeMesh: T.InstancedMesh | null = null, plumeDepth: T.InstancedMesh | null = null;
  if (exhausts.length) {
    const segments = Math.max(8, ctx.segments);
    plumeMesh = new T.InstancedMesh(flat ? flatPlumeGeometry(segments, glow) : plumeGeometry(segments), plumeMaterial, exhausts.length);
    plumeMesh.name = 'plume';
    plumeMesh.frustumCulled = false;
    plumeMesh.visible = false;
    root.add(plumeMesh);
    if (flat) {
      // The village flame is drawn see-through without writing depth, so its pale core shows through the
      // sheath. The lines are found in depth, though: without it the engine's rings behind the flame were
      // inked across it and the flame had no outline. This twin draws nothing but the flame's depth, after
      // every see-through surface (render order 1), so the lines outline the flame and stop at it.
      const depthOnly = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
      depthOnly.name = 'ship:plume-depth';
      plumeDepth = new T.InstancedMesh(plumeMesh.geometry, depthOnly, exhausts.length);
      plumeDepth.instanceMatrix = plumeMesh.instanceMatrix;
      plumeDepth.name = 'plume-depth';
      plumeDepth.renderOrder = 1;
      plumeDepth.frustumCulled = false;
      plumeDepth.visible = false;
      root.add(plumeDepth);
    }
  }

  // No markings at low LOD (distance view); the layer is one draw call at the others.
  // The warm look keeps placards and the registration but paints no grime, soot or chips;
  // the village look carries the registration alone.
  const painter = options.decal === undefined ? defaultDecalPainter(lib.look === 'industrial' ? 'worn' : 'clean') : options.decal;
  const only = lib.look === 'village' ? ['registration'] as const : undefined;
  const markings = painter && lod !== 'low' ? markingsMesh(design, painter, decalInk(design, lib.look), lib, only) : null;
  if (markings) root.add(markings);

  let thrust = 0, navOn = true;
  const scratch = new T.Matrix4(), s = new T.Matrix4();
  const setThrust = (value: number) => {
    thrust = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    leases.liner.emissiveIntensity = linerIntensity(thrust);
    plumeMaterial.opacity = flat ? 0.35 + 0.5 * thrust : 0.1 + 0.4 * thrust;
    if (plumeMesh) {
      plumeMesh.visible = thrust > 0.02;
      exhausts.forEach((anchor, i) => {
        const r = (anchor.userData.radius as number) * 0.95;
        // Short at cruise and long only near full thrust; the cap trims the largest bell.
        const length = Math.min(1.4, r * (1.2 + 4.8 * thrust * thrust));
        scratch.compose(anchor.position, anchor.quaternion, new T.Vector3(1, 1, 1));
        s.makeScale(r, r, length);
        plumeMesh!.setMatrixAt(i, scratch.clone().multiply(s));
      });
      plumeMesh.instanceMatrix.needsUpdate = true;
      if (plumeDepth) plumeDepth.visible = plumeMesh.visible;
    }
  };
  const setNavLights = (on: boolean) => {
    navOn = on;
    navMaterial.color.setScalar(on ? navLevel(lib.look) : 0.08);
  };
  setNavLights(true);
  setThrust(1);
  const stats = measure(root);
  setThrust(0);

  const base = handleFor(root, () => leases.release());
  const handle: ShipHandle = {
    get object() { return base.object; },
    get disposed() { return base.disposed; },
    dispose: () => base.dispose(),
    design, lod, exhausts, bounds, radius, stats,
    buildMs: performance.now() - started,
    get thrust() { return thrust; },
    get navLights() { return navOn; },
    setThrust, setNavLights,
    effects: { liner: leases.liner, nav: navMaterial, plume: plumeMaterial, plumeMesh },
  };
  return handle;
}

/** Whether a ship's solid geometry is inside the envelope; returns the problems found. */
export function envelopeProblems(handle: Pick<ShipHandle, 'bounds' | 'radius'>, envelope: { min: Vec3; max: Vec3; radius: number }): string[] {
  const out: string[] = [];
  const b = handle.bounds, e = 1e-6;
  const axes = ['x', 'y', 'z'] as const;
  axes.forEach((a, i) => {
    if (b.min[a] < envelope.min[i] - e) out.push(`${a} min ${b.min[a].toFixed(3)} < ${envelope.min[i]}`);
    if (b.max[a] > envelope.max[i] + e) out.push(`${a} max ${b.max[a].toFixed(3)} > ${envelope.max[i]}`);
  });
  if (handle.radius > envelope.radius + e) out.push(`radius ${handle.radius.toFixed(3)} > ${envelope.radius}`);
  return out;
}
