import * as T from 'three';
import { anchorQuaternion, LANDING_CLEARANCE, PLANET_RADIUS, SPAWN_DIR } from '../../core/anchor.ts';
import { disposeObject3D } from '../../core/dispose.ts';
import type { HeightField } from '../../core/ground.ts';
import { mulberry32, tileFbm2 } from '../../core/noise.ts';
import type { Vec3 } from '../../core/vec.ts';
import { PartBuilder } from '../../style/geometry.ts';
import { LOD } from '../../style/lod.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary } from '../../style/materials.ts';
import { makeDataTexture, normalFromHeight } from '../../style/textures.ts';
import { GLOW } from '../../style/tokens.ts';
import { VILLAGE_LAMP } from '../../style/village.ts';
import { stoneLamp, stoneMaterials, stonePad, touchdownMarks } from '../../terrain/stonework.ts';
import { villageFlatGround } from '../../terrain/village.ts';
import { libraryMaterials, makeKit } from '../parts/kit.ts';

// The planet the placement view builds on. Everything else in this module
// talks to it through PlanetSurface, so the terrain module's planet can replace
// this one at integration without touching placement code: it needs a height
// field, an object to add to the scene and a way to turn a ray into a surface
// direction.

export interface PlanetSurface {
  readonly field: HeightField;
  readonly object: T.Object3D;
  /** Unit direction of the first surface point along the ray, or null. */
  pick(ray: T.Raycaster): Vec3 | null;
  dispose(): void;
}

/** Metres of ground one regolith texture tile covers. */
export const REGOLITH_TILE = 4;

const wrap = (d: number) => d - Math.round(d);

/**
 * Tileable regolith: rolling dust from two fbm layers, a scatter of pebbles and
 * a few shallow impact pits, as a height field in roughly [0, 1] plus a grey
 * albedo (the colour comes from the planet's vertex tint). Deterministic per
 * seed. Pebbles and pits are stamped texel by texel around each one, so the
 * cost does not grow with their number times the texture size.
 */
export function regolithMaps(size: number, seed = 23): { height: Float32Array; albedo: Uint8Array } {
  const height = new Float32Array(size * size), shade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const broad = tileFbm2(u, v, 4, seed), fine = tileFbm2(u, v, 16, seed + 7);
    height[y * size + x] = 0.5 * broad + 0.25 * fine;
    shade[y * size + x] = 0.8 + 0.14 * broad + 0.06 * fine;
  }
  const rng = mulberry32(seed);
  const stamp = (cu: number, cv: number, r: number, fn: (t: number, i: number) => void) => {
    const reach = Math.ceil(r * size) + 1, cx = cu * size, cy = cv * size;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const px = Math.floor(cx + dx), py = Math.floor(cy + dy);
      const ix = ((px % size) + size) % size, iy = ((py % size) + size) % size;
      const du = wrap((px + 0.5) / size - cu), dv = wrap((py + 0.5) / size - cv);
      const t = Math.hypot(du, dv) / r;
      if (t < 1) fn(t, iy * size + ix);
    }
  };
  // Shallow pits: a dished floor and a low rim, darker inside.
  for (let i = 0; i < 9; i++) {
    const cu = rng(), cv = rng(), r = 0.025 + rng() * 0.045;
    stamp(cu, cv, r, (t, k) => { height[k] += t < 0.8 ? -0.12 * (1 - (t / 0.8) ** 2) : 0.06 * Math.sin((t - 0.8) / 0.2 * Math.PI); shade[k] *= t < 0.8 ? 0.93 : 1.03; });
  }
  // Pebbles from 1 to 6 cm across on a 4 m tile, each a little lighter or darker than the dust.
  for (let i = 0; i < 1400; i++) {
    const cu = rng(), cv = rng(), r = (0.0013 + rng() ** 3 * 0.0062), tone = 0.82 + rng() * 0.3;
    stamp(cu, cv, r, (t, k) => { const c = Math.sqrt(1 - t * t); height[k] += 0.18 * c; shade[k] *= 1 + (tone - 1) * c; });
  }
  const albedo = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    const g = Math.round(Math.min(1, shade[k]) * 255);
    albedo[k * 4] = g; albedo[k * 4 + 1] = g; albedo[k * 4 + 2] = g; albedo[k * 4 + 3] = 255;
  }
  return { height, albedo };
}

/** Radius of the landing pad's precast disc at its base, metres. */
export const LANDING_PAD_RADIUS = LANDING_CLEARANCE + 0.04;

/**
 * Landing pad: a precast disc with a hazard ring and four marker lamps, so the
 * "keep the landing spot clear" refusal has something to point at. Local
 * origin on the disc's seating plane, +Y up. The disc reaches 0.08 m below
 * that plane, or `skirt` metres when that is deeper (a ground fit's
 * foundation depth on uneven terrain). Its lamp glow is owned by the pad.
 */
export function buildLandingPad(lib: StyleLibrary, lod: LodTier, skirt = 0): T.Group {
  const b = new PartBuilder(lod);
  const padR = LANDING_CLEARANCE;
  const bottom = Math.max(0.08, skirt);
  if (lib.look === 'village') return villageLandingPad(b, lib, padR, bottom);
  const k = makeKit(b, libraryMaterials(lib));
  b.cylinder(k.m('concrete'), padR, LANDING_PAD_RADIUS, 0.04 + bottom, { position: [0, (0.04 - bottom) / 2, 0] }, { segments: 32 });
  b.cylinder(k.m('hazard'), padR - 0.02, padR - 0.02, 0.012, { position: [0, 0.046, 0] }, { segments: 32 });
  b.cylinder(k.m('concrete'), padR - 0.16, padR - 0.16, 0.016, { position: [0, 0.048, 0] }, { segments: 32 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    b.box(k.m('steel'), [0.1, 0.05, 0.1], { position: [Math.cos(a) * (padR - 0.08), 0.06, Math.sin(a) * (padR - 0.08)] }, 0.01);
    b.box(k.m('lamp'), [0.05, 0.012, 0.05], { position: [Math.cos(a) * (padR - 0.08), 0.088, Math.sin(a) * (padR - 0.08)] }, 0);
  }
  return b.build('landing-pad').group;
}

/**
 * The village look's landing pad, the same disc in the shared stonework
 * design (src/terrain/stonework.ts): a stone drum battered out to
 * LANDING_PAD_RADIUS at its foot, a cobbled rim, touchdown marks, and the four
 * lamps where the industrial pad has them (lens tops at the same height), let
 * into the rim. No hazard ring or iron blocks.
 */
function villageLandingPad(b: PartBuilder, lib: StyleLibrary, padR: number, bottom: number): T.Group {
  const m = stoneMaterials(lib), low = b.lod === 'low', segments = low ? 24 : 32;
  const glow = lib.createGlow(VILLAGE_LAMP, GLOW.lit);
  glow.name = 'blueprint:lamp';
  const { rimTop } = stonePad(b, m, { radius: padR, foot: LANDING_PAD_RADIUS, top: 0.04, bottom: -bottom, segments });
  touchdownMarks(b, m.line, padR, 0.04, segments);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    stoneLamp(b, glow, [Math.cos(a) * (padR - 0.08), rimTop, Math.sin(a) * (padR - 0.08)], 0.033, 0.094 - rimTop, low ? 6 : 8);
  }
  return b.build('landing-pad').group;
}

/** Dust colours, tinted by height and slope: oxide in the hollows, grey on the rises. */
const DUST_LOW = new T.Color('#5c4637'), DUST_HIGH = new T.Color('#8b8176'), ROCK = new T.Color('#4a4642');

/** The regolith material: vertex tint over the procedural regolith maps, with real normal detail. */
function regolithMaterial(lod: LodTier): T.MeshStandardMaterial {
  const size = LOD[lod].textureSize;
  const maps = regolithMaps(size);
  const normalMap = makeDataTexture(normalFromHeight(maps.height, size, 3.2), size, false);
  const albedo = makeDataTexture(maps.albedo, size, true);
  return new T.MeshStandardMaterial({ name: 'blueprint:regolith', vertexColors: true, map: albedo, normalMap, normalScale: new T.Vector2(1.2, 1.2), roughness: 0.95, metalness: 0, envMapIntensity: 0.7 });
}

/**
 * The regolith in the village look: the terrain kit's flat drawing
 * (src/terrain/village.ts villageFlatGround) on the same vertex tint, no
 * textures. Oxide hollows become a deep meadow, the middle heights the
 * village ground green, grey rises a dry grass, steep rock the village's pale
 * stone with gravel.
 */
function villageRegolith(): T.MeshStandardMaterial {
  const hex = (c: T.Color) => `#${c.getHexString()}` as const;
  return villageFlatGround('blueprint:regolith', [
    { key: hex(DUST_LOW), tone: '#4d9563' }, { key: hex(DUST_LOW.clone().lerp(DUST_HIGH, 0.5)), tone: '#5ea476' },
    { key: hex(DUST_HIGH), tone: '#93ad6e', gravel: 0.15 }, { key: hex(ROCK), tone: '#b2ae9f', gravel: 0.5 },
  ], '#6f6c62');
}

/**
 * A displaced icosphere for any HeightField (the legacy a76575a formula in the
 * demo), with analytic normals from the field, a procedural regolith texture
 * with real normal detail, and the landing pad at the main project's spawn point.
 */
export function createPlanet(field: HeightField, lib: StyleLibrary, lod: LodTier): PlanetSurface {
  const root = new T.Group();
  root.name = 'planet';
  // three's detail is linear: (detail + 1)² × 20 triangles. 2^subdivisions − 1 matches a recursive icosphere.
  const detail = 2 ** LOD[lod].terrainSubdivisions - 1;
  const geometry = new T.IcosahedronGeometry(1, detail);
  const pos = geometry.getAttribute('position') as T.BufferAttribute;
  const normals = geometry.getAttribute('normal') as T.BufferAttribute;
  const uv = new Float32Array(pos.count * 2), colors = new Float32Array(pos.count * 3);
  const heights = new Float32Array(pos.count);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d: Vec3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const l = Math.hypot(...d); d[0] /= l; d[1] /= l; d[2] /= l;
    heights[i] = field.heightAt(d);
    lo = Math.min(lo, heights[i]); hi = Math.max(hi, heights[i]);
  }
  const c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const d: Vec3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const l = Math.hypot(...d); d[0] /= l; d[1] /= l; d[2] /= l;
    const r = PLANET_RADIUS + heights[i];
    pos.setXYZ(i, d[0] * r, d[1] * r, d[2] * r);
    const n = field.normalAt(d);
    normals.setXYZ(i, n[0], n[1], n[2]);
    // Box projection in metres; seams fall where the dominant axis changes.
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const [u, v] = ax >= ay && ax >= az ? [d[2] * r, d[1] * r] : ay >= az ? [d[0] * r, d[2] * r] : [d[0] * r, d[1] * r];
    uv[i * 2] = u / REGOLITH_TILE; uv[i * 2 + 1] = v / REGOLITH_TILE;
    const t = (heights[i] - lo) / Math.max(1e-6, hi - lo);
    const slope = 1 - Math.max(0, n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
    c.copy(DUST_LOW).lerp(DUST_HIGH, t * t * (3 - 2 * t)).lerp(ROCK, Math.min(1, slope * 6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  // Owned by this planet (not the library) and freed with it by disposeObject3D.
  const material = lib.look === 'village' ? villageRegolith() : regolithMaterial(lod);
  const ground = new T.Mesh(geometry, material);
  ground.name = 'ground';
  ground.receiveShadow = LOD[lod].shadows;
  root.add(ground);

  const pad = buildLandingPad(lib, lod);
  const q = anchorQuaternion({ dir: SPAWN_DIR, yaw: 0 });
  pad.quaternion.set(...q);
  pad.position.set(...SPAWN_DIR.map(cc => cc * (PLANET_RADIUS + field.heightAt(SPAWN_DIR) + 0.02)) as Vec3);
  root.add(pad);

  return {
    field,
    object: root,
    pick(ray) {
      const hit = ray.intersectObject(ground, false)[0];
      if (!hit) return null;
      const p = hit.point.clone().normalize();
      return [p.x, p.y, p.z];
    },
    // The pad's lamp stays on its mesh and the ground material and its two
    // textures are not shared, so disposeObject3D frees all of them.
    dispose() { disposeObject3D(root); },
  };
}
