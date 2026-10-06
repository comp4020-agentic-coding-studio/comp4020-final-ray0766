import * as T from 'three';
import { anchorFrame, PLANET_RADIUS } from '../core/anchor.ts';
import type { SurfaceAnchor } from '../core/anchor.ts';
import { handleFor } from '../core/dispose.ts';
import type { ModelHandle } from '../core/dispose.ts';
import type { Vec3 } from '../core/vec.ts';
import { measure } from '../style/geometry.ts';
import { BUDGET, LOD } from '../style/lod.ts';
import type { LodTier } from '../style/lod.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { createHeightField } from './field.ts';
import type { TerrainField } from './field.ts';
import { floraModel, instanceFlora, planFlora } from './flora.ts';
import type { Clearing } from './flora.ts';
import { icosphere } from './icosphere.ts';
import { atmosphereMaterial, groundMaterial, seaIceMaterial, TerrainKit, waterMaterial } from './kit.ts';
import type { PlanetEnvironment } from './env.ts';
import { chord2, strataAt } from './styles/program.ts';
import type { FloraKind, RGB } from './styles/program.ts';

// buildPlanet turns an environment into renderable ground, water, atmosphere
// and plants within BUDGET.terrain for the LOD:
//
//   ground      indexed icosphere at LOD.terrainSubdivisions, displaced by the
//               field, analytic normals, albedo + surface channels per vertex
//   water       one level coarser, at sea level, triangles fully under land
//               dropped; per-vertex depth drives tint, opacity and foam
//   atmosphere  a back-faced shell for the limb halo
//   flora       one InstancedMesh per plant kind and material
//
// The handle owns geometries, per-planet materials and instance buffers. The
// kit's textures, plant geometries and plant materials are shared; when no kit
// is passed, the planet makes a private one and frees it too.

export const ATMOSPHERE_HEIGHT = 1.9;

export interface PlanetStats {
  triangles: number;
  drawCalls: number;
  groundVertices: number;
  /** Ground vertices drawn anti-aliased (BuildOptions.antialias); 0 when it is off. */
  antialiasedVertices: number;
  generationMs: number;
  /** Share of ground vertices below sea level (icosphere vertices are near-uniform in area). */
  waterCoverage: number;
  /** Mean linear albedo of the ground, from the same colour model the shader starts from. */
  meanAlbedo: RGB;
  /** Hue of meanAlbedo in degrees (0 = red, 120 = green, 240 = blue). */
  meanHue: number;
  minHeight: number;
  maxHeight: number;
  vegetation: Partial<Record<FloraKind, number>>;
  biomes: Record<string, number>;
}

export interface PlanetHandle extends ModelHandle<T.Group> {
  readonly field: TerrainField;
  readonly stats: PlanetStats;
  readonly ground: T.Mesh;
  /** Advance water ripples. */
  tick(seconds: number): void;
  /** Point the limb haze and atmosphere at the key light (world direction). */
  setSunDirection(dir: Vec3): void;
}

/**
 * A slab seated on the ground (by fitGround) that the mesh is graded under.
 * fitGround only sees its footprint samples, so between samples the ground can
 * rise a few millimetres above the floor plane at a sharp crest. Mesh vertices
 * under the slab are lowered to GRADE_DEPTH below the floor, the way a site is
 * graded before a slab is cast, so nothing shows through. Only the drawn mesh
 * changes: heights, probes and fits still come from the field.
 */
export interface Foundation {
  anchor: SurfaceAnchor;
  /** fitGround's baseRadius: the floor plane (local y = 0) of the object. */
  baseRadius: number;
  /** Bounding radius of the footprint, metres. */
  radius: number;
  /** True when a local (x, z) point is under the slab. */
  covers(x: number, z: number): boolean;
}
export const GRADE_DEPTH = 0.01;

export interface BuildOptions {
  kit?: TerrainKit;
  /** Keep plants out of these discs (placed objects, roads). */
  clearings?: Clearing[];
  /** Grade the ground mesh under these slabs. */
  foundations?: Foundation[];
  /** Reuse an already-created field for this environment. */
  field?: TerrainField;
  /**
   * Draw sharp ground anti-aliased at the mesh's own spacing (default false,
   * which draws the field at every vertex exactly as before). A mesa wall, ice
   * rim or terrace riser narrower than one mesh edge otherwise lands on single
   * vertices and draws as a staircase of steep triangles along its contour.
   * With this on, every vertex near such a step takes the field averaged over
   * a disc about one edge across (MESH_FILTER), so the step draws as a clean
   * ramp that follows the contour. Smooth ground is left exactly on the field.
   * Only the drawn mesh changes (heights, fits and probes still come from the
   * field); plants are set on the drawn ground, and grading still applies.
   */
  antialias?: boolean;
  /** Leave out plants and rocks shorter than this, metres (the compare gallery, where they would only be specks). */
  minPlantHeight?: number;
}

/**
 * Mesh anti-aliasing (BuildOptions.antialias). A vertex is filtered when it
 * stands more than `bend` metres off the mean of its mesh neighbours (the
 * mesh's own second difference: a step, crest or groove between vertices),
 * and so is every vertex sharing a triangle with it; sea bed deeper than
 * `hidden` below the water is left alone (it is not seen through the sea).
 * The filter is seven equally weighted taps: the vertex and a hexagonal ring
 * `ring` × one mesh edge away.
 */
export const MESH_FILTER = { bend: 0.03, ring: 0.55, hidden: 0.3 } as const;
/** Angle subtended by one edge of the icosphere at `level` (the icosahedron's edge, arctan 2, halved per level). */
const edgeAngle = (level: number) => 1.1071487177940904 / 2 ** level;
/** Hexagonal ring offsets (cos, sin of k·60°, from sqrt so they are exact constants). */
const HEX: [number, number][] = (() => { const s = Math.sqrt(3) / 2; return [[1, 0], [0.5, s], [-0.5, s], [-1, 0], [-0.5, -s], [0.5, -s]]; })();

/** Unit tangents (t1, t2) at a unit direction, from the coordinate axis least aligned with it. */
function tangents(d: Vec3): [Vec3, Vec3] {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  const a: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  let t1: Vec3 = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
  const l = Math.sqrt(t1[0] * t1[0] + t1[1] * t1[1] + t1[2] * t1[2]);
  t1 = [t1[0] / l, t1[1] / l, t1[2] / l];
  return [t1, [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]]];
}

/** The six ring taps (unit directions) around `d`, `rho` radians out; the seventh tap is `d` itself. */
function ring(d: Vec3, rho: number): Vec3[] {
  const [t1, t2] = tangents(d);
  const out: Vec3[] = [];
  for (const [c, s] of HEX) {
    const x = d[0] + rho * (c * t1[0] + s * t2[0]), y = d[1] + rho * (c * t1[1] + s * t2[1]), z = d[2] + rho * (c * t1[2] + s * t2[2]);
    const l = Math.sqrt(x * x + y * y + z * z);
    out.push([x / l, y / l, z / l]);
  }
  return out;
}

/** Height the anti-aliased mesh draws at `d` (the seven-tap mean); for plants standing on it. */
export function drawnHeight(field: TerrainField, d: Vec3, level: number): number {
  let sum = field.heightAt(d);
  for (const t of ring(d, MESH_FILTER.ring * edgeAngle(level))) sum += field.heightAt(t);
  return sum / 7;
}

/**
 * Replace the vertices near sharp steps with the seven-tap mean of the field:
 * height, normal, albedo and surface channels. Arrays are updated in place;
 * returns how many vertices were filtered.
 */
function antialiasGround(field: TerrainField, dirs: Float64Array, indices: Uint32Array, level: number,
  a: { heights: Float32Array; normal: Float32Array; color: Float32Array; surface: Float32Array; cover: Float32Array }): number {
  const n = a.heights.length;
  const rho = MESH_FILTER.ring * edgeAngle(level);
  const water = field.waterLevel;
  const sum = new Float64Array(n), count1 = new Uint8Array(n), sharp = new Uint8Array(n), pick = new Uint8Array(n);
  for (let f = 0; f < indices.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const i = indices[f + e], j = indices[f + (e + 1) % 3];
      sum[i] += a.heights[j]; count1[i]++; sum[j] += a.heights[i]; count1[j]++;
    }
  }
  for (let i = 0; i < n; i++) {
    if (water !== null && a.heights[i] < water - MESH_FILTER.hidden) continue;
    if (Math.abs(a.heights[i] - sum[i] / count1[i]) > MESH_FILTER.bend) sharp[i] = 1;
  }
  for (let f = 0; f < indices.length; f += 3) {
    const i = indices[f], j = indices[f + 1], k = indices[f + 2];
    if (sharp[i] | sharp[j] | sharp[k]) { pick[i] = 1; pick[j] = 1; pick[k] = 1; }
  }
  let count = 0;
  const nrm = [0, 0, 0], col = [0, 0, 0], surf = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (!pick[i]) continue;
    count++;
    // The vertex's own sample is already in the arrays; add the six ring taps.
    let h = a.heights[i], cov = a.cover[i];
    for (let c = 0; c < 3; c++) { nrm[c] = a.normal[i * 3 + c]; col[c] = a.color[i * 3 + c]; }
    for (let c = 0; c < 4; c++) surf[c] = a.surface[i * 4 + c];
    for (const t of ring([dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]], rho)) {
      const s = field.sample(t);
      h += s.height; cov += s.cover;
      for (let c = 0; c < 3; c++) { nrm[c] += s.normal[c]; col[c] += s.albedo[c]; }
      surf[0] += s.rock; surf[1] += s.roughness; surf[2] += s.wet; surf[3] += s.special;
    }
    const l = Math.sqrt(nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]);
    a.heights[i] = h / 7; a.cover[i] = cov / 7;
    for (let c = 0; c < 3; c++) { a.normal[i * 3 + c] = nrm[c] / l; a.color[i * 3 + c] = col[c] / 7; }
    for (let c = 0; c < 4; c++) a.surface[i * 4 + c] = surf[c] / 7;
  }
  return count;
}

/** Lower a ground point under a slab so it sits GRADE_DEPTH below the floor plane; returns the new radius. */
function graded(foundations: { f: Foundation; up: Vec3; right: Vec3; front: Vec3; cosReach: number }[], d: Vec3, r: number): number {
  for (const g of foundations) {
    const c = d[0] * g.up[0] + d[1] * g.up[1] + d[2] * g.up[2];
    if (c < g.cosReach) continue;
    const base = g.f.baseRadius;
    const px = d[0] * r - g.up[0] * base, py = d[1] * r - g.up[1] * base, pz = d[2] * r - g.up[2] * base;
    const x = px * g.right[0] + py * g.right[1] + pz * g.right[2], z = px * g.front[0] + py * g.front[1] + pz * g.front[2];
    if (!g.f.covers(x, z)) continue;
    // Local height of d·r above the floor is r·c − base; solve for r at −GRADE_DEPTH.
    r = Math.min(r, (base - GRADE_DEPTH) / c);
  }
  return r;
}

function hue([r, g, b]: RGB): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 1e-9) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function buildPlanet(env: PlanetEnvironment, _lib: StyleLibrary | null, lod: LodTier, options: BuildOptions = {}): PlanetHandle {
  const started = performance.now();
  const field = options.field ?? createHeightField(env);
  const kit = options.kit ?? new TerrainKit(lod);
  const ownKit = !options.kit;
  if (kit.lod !== lod) throw new Error(`TerrainKit is for LOD ${kit.lod}, not ${lod}.`);
  const settings = LOD[lod];
  const program = field.program;
  const water = field.waterLevel;

  // ---- ground
  const level = settings.terrainSubdivisions;
  const ico = icosphere(level);
  const lv = ico.levels[level];
  const n = lv.vertices;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), color = new Float32Array(n * 3), surface = new Float32Array(n * 4), cover = new Float32Array(n);
  const heights = new Float32Array(n);
  const grades = (options.foundations ?? []).map(f => {
    const frame = anchorFrame(f.anchor);
    return { f, up: frame.up, right: frame.right, front: frame.front, cosReach: 1 - chord2(f.radius + 0.05) / 2 };
  });
  let minH = Infinity, maxH = -Infinity, wet = 0;
  const albedoSum: RGB = [0, 0, 0];
  const biomes: Record<string, number> = {};
  // Statistics always describe the field at the vertices, with or without anti-aliasing.
  for (let i = 0; i < n; i++) {
    const s = field.sample([ico.dirs[i * 3], ico.dirs[i * 3 + 1], ico.dirs[i * 3 + 2]]);
    normal.set(s.normal, i * 3);
    color.set(s.albedo, i * 3);
    surface[i * 4] = s.rock; surface[i * 4 + 1] = s.roughness; surface[i * 4 + 2] = s.wet; surface[i * 4 + 3] = s.special;
    cover[i] = s.cover;
    heights[i] = s.height;
    minH = Math.min(minH, s.height); maxH = Math.max(maxH, s.height);
    if (s.underwater) wet++;
    biomes[s.biome] = (biomes[s.biome] ?? 0) + 1;
    // CPU mirror of the shader's base colour: loose albedo or rock strata, wet darkening.
    const rock = strataAt(program.strata, s.height);
    const k = 1 - 0.45 * s.wet;
    for (let c = 0; c < 3; c++) albedoSum[c] += (s.albedo[c] + (rock[c] - s.albedo[c]) * s.rock) * k;
  }
  const filtered = options.antialias ? antialiasGround(field, ico.dirs, lv.indices, level, { heights, normal, color, surface, cover }) : 0;
  for (let i = 0; i < n; i++) {
    // Normalised again exactly as the field does, so positions are bit-identical to the field's own surface points.
    const x = ico.dirs[i * 3], y = ico.dirs[i * 3 + 1], z = ico.dirs[i * 3 + 2], l = Math.sqrt(x * x + y * y + z * z);
    const d: Vec3 = [x / l, y / l, z / l];
    const r = grades.length ? graded(grades, d, PLANET_RADIUS + heights[i]) : PLANET_RADIUS + heights[i];
    position[i * 3] = d[0] * r; position[i * 3 + 1] = d[1] * r; position[i * 3 + 2] = d[2] * r;
  }
  const groundGeometry = new T.BufferGeometry();
  groundGeometry.setAttribute('position', new T.BufferAttribute(position, 3));
  groundGeometry.setAttribute('normal', new T.BufferAttribute(normal, 3));
  groundGeometry.setAttribute('color', new T.BufferAttribute(color, 3));
  groundGeometry.setAttribute('surface', new T.BufferAttribute(surface, 4));
  groundGeometry.setAttribute('cover', new T.BufferAttribute(cover, 1));
  groundGeometry.setIndex(new T.BufferAttribute(lv.indices, 1));
  groundGeometry.computeBoundingSphere();
  const groundMat = groundMaterial(kit, program);
  const ground = new T.Mesh(groundGeometry, groundMat);
  ground.name = 'terrain:ground';
  ground.castShadow = settings.shadows; ground.receiveShadow = settings.shadows;

  const group = new T.Group();
  group.name = `planet:${field.style}`;
  group.userData.environmentId = field.id;
  group.add(ground);

  // ---- water: one level coarser; its vertices are a prefix of the ground's, so depths are already known.
  let waterMat: T.MeshStandardMaterial | null = null;
  let waterTris = 0;
  if (water !== null && program.water) {
    const look = program.water;
    const wl = ico.levels[Math.max(0, level - 1)];
    const r = PLANET_RADIUS + water;
    const wpos = new Float32Array(wl.vertices * 3), wnor = new Float32Array(wl.vertices * 3), depth = new Float32Array(wl.vertices);
    for (let i = 0; i < wl.vertices; i++) {
      const x = ico.dirs[i * 3], y = ico.dirs[i * 3 + 1], z = ico.dirs[i * 3 + 2];
      wpos[i * 3] = x * r; wpos[i * 3 + 1] = y * r; wpos[i * 3 + 2] = z * r;
      wnor[i * 3] = x; wnor[i * 3 + 1] = y; wnor[i * 3 + 2] = z;
      depth[i] = water - heights[i];
    }
    // Drop triangles that are under land at all three corners.
    const kept: number[] = [];
    for (let f = 0; f < wl.indices.length; f += 3) {
      const a = wl.indices[f], b = wl.indices[f + 1], c = wl.indices[f + 2];
      if (depth[a] > -0.06 || depth[b] > -0.06 || depth[c] > -0.06) kept.push(a, b, c);
    }
    if (kept.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(wpos, 3));
      g.setAttribute('normal', new T.BufferAttribute(wnor, 3));
      g.setAttribute('depth', new T.BufferAttribute(depth, 1));
      g.setIndex(kept);
      g.computeBoundingSphere();
      waterMat = look.kind === 'liquid' ? waterMaterial(kit, look, program) : seaIceMaterial(kit, look, program);
      const mesh = new T.Mesh(g, waterMat);
      mesh.name = look.kind === 'liquid' ? 'terrain:water' : 'terrain:sea-ice';
      mesh.receiveShadow = settings.shadows;
      mesh.castShadow = settings.shadows && look.kind === 'ice-sheet';
      mesh.renderOrder = 1;
      group.add(mesh);
      waterTris = kept.length / 3;
    }
  }

  // ---- atmosphere halo
  const shell = ico.levels[Math.min(level, 3)];
  const atmoGeometry = new T.BufferGeometry();
  const apos = new Float32Array(shell.vertices * 3), anor = new Float32Array(shell.vertices * 3);
  const ar = PLANET_RADIUS + ATMOSPHERE_HEIGHT;
  for (let i = 0; i < shell.vertices * 3; i++) { apos[i] = ico.dirs[i] * ar; anor[i] = ico.dirs[i]; }
  atmoGeometry.setAttribute('position', new T.BufferAttribute(apos, 3));
  atmoGeometry.setAttribute('normal', new T.BufferAttribute(anor, 3));
  atmoGeometry.setIndex(new T.BufferAttribute(shell.indices, 1));
  atmoGeometry.computeBoundingSphere();
  const atmoMat = atmosphereMaterial(program);
  const atmosphere = new T.Mesh(atmoGeometry, atmoMat);
  atmosphere.name = 'terrain:atmosphere';
  atmosphere.renderOrder = 2;
  group.add(atmosphere);

  // ---- flora within what is left of the triangle budget
  const fixedTris = lv.indices.length / 3 + waterTris + shell.indices.length / 3;
  const budget = BUDGET.terrain[lod];
  const triangles: Record<string, number> = {};
  for (const rule of program.flora) triangles[rule.kind] = floraModel(rule.kind, kit).triangles;
  const plans = planFlora(field, program.flora, { vegetationMax: settings.vegetationMax, triangleBudget: budget.triangles - fixedTris, triangles, clearings: options.clearings });
  if (options.minPlantHeight) for (const p of plans) p.instances = p.instances.filter(i => i.height >= options.minPlantHeight!);
  if (filtered) {
    // Stand plants on the drawn ground. Where the mesh is not filtered the
    // seven-tap mean is the field to within a millimetre or so; a spire on
    // the frozen sea stays on the sheet.
    for (const p of plans) for (const inst of p.instances) {
      const drawn = drawnHeight(field, inst.dir, level);
      inst.base = water !== null && inst.base === water ? Math.max(water, drawn) : drawn;
    }
  }
  const flora = instanceFlora(plans, kit, settings.shadows);
  group.add(flora);

  const counted = measure(group);
  const meanAlbedo: RGB = [albedoSum[0] / n, albedoSum[1] / n, albedoSum[2] / n];
  const vegetation: Partial<Record<FloraKind, number>> = {};
  for (const p of plans) vegetation[p.kind] = p.instances.length;
  for (const k of Object.keys(biomes)) biomes[k] /= n;
  const stats: PlanetStats = {
    triangles: counted.triangles, drawCalls: counted.drawCalls, groundVertices: n, antialiasedVertices: filtered,
    generationMs: performance.now() - started,
    waterCoverage: wet / n, meanAlbedo, meanHue: hue(meanAlbedo),
    minHeight: minH, maxHeight: maxH, vegetation, biomes,
  };

  const uniformSets = [groundMat.userData.uniforms, waterMat?.userData.uniforms, atmoMat.uniforms].filter(Boolean) as Record<string, T.IUniform>[];
  const handle = handleFor(group, () => { if (ownKit) kit.dispose(); });
  return {
    object: group,
    get disposed() { return handle.disposed; },
    dispose: () => handle.dispose(),
    field, stats, ground,
    tick(seconds) { if (waterMat?.userData.uniforms?.uTime) waterMat.userData.uniforms.uTime.value = seconds; },
    setSunDirection(dir) { for (const u of uniformSets) if (u.uSunDir) (u.uSunDir.value as T.Vector3).set(dir[0], dir[1], dir[2]).normalize(); kit.setSunDirection(dir); },
  };
}
