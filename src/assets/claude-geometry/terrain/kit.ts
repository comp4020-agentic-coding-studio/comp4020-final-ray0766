import * as T from 'three';
import { markShared } from '../core/dispose.ts';
import { LOD } from '../style/lod.ts';
import type { LodTier } from '../style/lod.ts';
import { ENVIRONMENT_SUN_DIRECTION } from '../style/lighting.ts';
import { makeDataTexture } from '../style/textures.ts';
import { PLANET_RADIUS } from '../core/anchor.ts';
import { DETAIL_METRES, DETAIL_NAMES, detailMap, foliageCard } from './textures.ts';
import type { CardName, DetailName } from './textures.ts';
import type { Vec3 } from '../core/vec.ts';
import type { RGB, StyleProgram, WaterLook } from './styles/program.ts';

// TerrainKit: the textures and plant/rock materials every planet of one LOD
// shares, in the role a StyleLibrary plays for buildings. Everything it makes
// is marked shared, so planet handles skip it, and kit.dispose() frees it.
// Per-planet materials (ground, water, atmosphere) carry that planet's
// colours as uniforms and belong to the planet; they reuse the kit's textures
// and compile to one shader program per kind, whatever the planet.
//
// Shading is triplanar in world space: no UV seams anywhere on the sphere,
// constant texel density, and plants and rocks pick up the same detail.

const GLSL_TRIPLANAR = /* glsl */ `
vec3 triBlend(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 triTex(sampler2D tex, vec3 p, vec3 w, float s) {
  return texture2D(tex, p.zy * s) * w.x + texture2D(tex, p.xz * s) * w.y + texture2D(tex, p.xy * s) * w.z;
}
// Whiteout-blended triplanar normal mapping (world space). Writes the blended
// height from the alpha channel so callers can darken cavities with it.
vec3 triNormal(sampler2D tex, vec3 p, vec3 n, vec3 w, float s, float strength, out float height) {
  vec3 sgn = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);
  vec2 uvX = p.zy * s, uvY = p.xz * s, uvZ = p.xy * s;
  uvX.x *= sgn.x; uvY.x *= sgn.y; uvZ.x *= -sgn.z;
  vec4 tx = texture2D(tex, uvX), ty = texture2D(tex, uvY), tz = texture2D(tex, uvZ);
  height = tx.a * w.x + ty.a * w.y + tz.a * w.z;
  vec3 nx = vec3((tx.xy * 2.0 - 1.0) * strength, 1.0);
  vec3 ny = vec3((ty.xy * 2.0 - 1.0) * strength, 1.0);
  vec3 nz = vec3((tz.xy * 2.0 - 1.0) * strength, 1.0);
  nx.x *= sgn.x; ny.x *= sgn.y; nz.x *= -sgn.z;
  nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
  ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
  nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
  return normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
}
`;

const GLSL_VERTEX_WORLD = /* glsl */ `
  {
    vec4 triWorld = vec4(transformed, 1.0);
    vec3 triN = objectNormal;
    #ifdef USE_INSTANCING
      triWorld = instanceMatrix * triWorld;
      triN = mat3(instanceMatrix) * triN;
    #endif
    // Planet-relative position (instances are placed in the planet's frame).
    vec3 triPlanet = triWorld.xyz;
    triWorld = modelMatrix * triWorld;
    vTriPos = triWorld.xyz;
    vTriNormal = normalize(mat3(modelMatrix) * triN);
    vObjPos = position;
    vRadialW = normalize(mat3(modelMatrix) * triPlanet);
  }
`;

/**
 * One sun. Direct specular is kept only where the mirror direction points
 * roughly at the sun, and none on the night hemisphere. The orbit mood has a
 * single sun, but the dusk mood (the blueprint module's planet view) still has
 * a rim light, a back light from the left that would put a second sharp glint
 * on water and ice (found by switching lights off one at a time in Chrome);
 * this mask keeps that glint off. Diffuse light from a rim is untouched, so
 * silhouettes still read. Environment reflections fade on the night side.
 */
const GLSL_DAYSIDE = /* glsl */ `
  {
    float dayside = smoothstep(-0.15, 0.25, dot(normalize(vRadialW), uSunDir));
    vec3 mirrorW = reflect(-normalize(cameraPosition - vTriPos), inverseTransformDirection(normal, viewMatrix));
    float sunward = smoothstep(-0.2, 0.35, dot(mirrorW, uSunDir));
    reflectedLight.directSpecular *= dayside * sunward;
    reflectedLight.indirectSpecular *= mix(0.3, 1.0, dayside);
  }
`;

/**
 * Plants and rocks only: the planet itself stands between the night side and
 * the sun. The ground needs no such term (its normal faces away from the sun
 * there), but a plant has faces turned every way, and the compare gallery
 * casts no shadows, so trees, rocks and seracs on the night hemisphere caught
 * the key light and the environment's sun disc and showed as bright flecks
 * on the dark side. Direct light fades out across the terminator, and the
 * environment's light falls to a third, as on the night-side ground.
 */
const GLSL_PLANET_SHADOW = /* glsl */ `
  {
    float sunSeen = smoothstep(-0.12, 0.1, dot(normalize(vRadialW), uSunDir));
    reflectedLight.directDiffuse *= sunSeen;
    reflectedLight.directSpecular *= sunSeen;
    reflectedLight.indirectDiffuse *= mix(0.35, 1.0, sunSeen);
  }
`;

const GLSL_HAZE = /* glsl */ `
  {
    // Limb haze: thin atmosphere seen edge-on over the lit side of the planet.
    // Weighted by distance, since a view from just above the ground looks
    // through very little of it.
    vec3 toCam = cameraPosition - vTriPos;
    vec3 viewW = normalize(toCam);
    float limb = 1.0 - clamp(dot(normalize(vRadialW), viewW), 0.0, 1.0);
    float sunSide = smoothstep(-0.25, 0.45, dot(normalize(vRadialW), uSunDir));
    float path = smoothstep(14.0, 40.0, length(toCam));
    totalEmissiveRadiance += uAtmo * (limb * limb * limb * uAtmoStrength * sunSide * path);
  }
`;

/**
 * Where the shared environment maps draw their sun disc, about 11° across in
 * every outdoor mood (ENVIRONMENT_SUN_DIRECTION, exported by
 * src/style/lighting.ts, so the two cannot drift apart). The environment is
 * not rotated with the scene, so this is a world direction.
 */
export const ENVIRONMENT_SUN = new T.Vector3(...ENVIRONMENT_SUN_DIRECTION);

/**
 * Sun glint on water and sea ice, kept to a small highlight that never
 * blooms. Before this, calm water at LOD high showed a white blob a fifth of
 * the disc across: the environment map's sun disc (11° wide, blurred further
 * by the water's roughness) reflected as a broad soft disc, and the direct
 * GGX peak (about 8.7 in linear light at roughness 0.2) sat on top of it, far
 * above the 0.92 bloom threshold.
 *
 * - The environment's copy of the sun is taken out of the reflection: as the
 *   mirror direction comes within 40° of ENVIRONMENT_SUN, the environment
 *   term is blended towards a soft cap of 0.006 luminance, fully so from 8°
 *   in (GLINT_LIMITS envSunFrom, envSunTo, envSun). The direct light already draws the
 *   sun, so this removes a duplicate, not a highlight; sky and limb
 *   reflections elsewhere are unchanged.
 * - The direct term is scaled and then compressed above a knee towards a
 *   ceiling (luminance, hue kept), so its sharp core stays bright but under
 *   the bloom threshold. The ripples break it into a small sparkling patch.
 */
const GLSL_SOFT_CAP = /* glsl */ `
  vec3 softCap(vec3 c, float knee, float cap) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    if (l <= knee) return c;
    float over = l - knee, room = cap - knee;
    return c * ((knee + over * room / (over + room)) / l);
  }
`;
const GLSL_GLINT = /* glsl */ `
  {
    vec3 mirrorG = reflect(-normalize(cameraPosition - vTriPos), inverseTransformDirection(normal, viewMatrix));
    float envSun = smoothstep(uEnvSunCos.x, uEnvSunCos.y, dot(mirrorG, uEnvSun));
    reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, softCap(reflectedLight.indirectSpecular, uEnvSunCap.x, uEnvSunCap.y), envSun);
  }
  reflectedLight.directSpecular = softCap(reflectedLight.directSpecular * uGlintScale, uGlint.x, uGlint.y);
  reflectedLight.indirectSpecular = softCap(reflectedLight.indirectSpecular, uGlint.z, uGlint.w);
`;
/**
 * Sun specular on water and ice: a scale on the direct term, then knee and
 * ceiling (linear luminance) for the direct and environment terms; ceilings
 * sum to less than the 0.92 bloom threshold. `envSunFrom`/`envSunTo` are the
 * angles (degrees from the mirror direction) over which the environment's
 * sun disc fades out of the reflection.
 */
export const GLINT_LIMITS = { scale: 0.08, directKnee: 0.2, direct: 0.5, envKnee: 0.06, env: 0.16, envSunFrom: 40, envSunTo: 8, envSunKnee: 0.002, envSun: 0.006 } as const;
const glintUniforms = () => ({
  uGlint: { value: new T.Vector4(GLINT_LIMITS.directKnee, GLINT_LIMITS.direct, GLINT_LIMITS.envKnee, GLINT_LIMITS.env) },
  uGlintScale: { value: GLINT_LIMITS.scale },
  uEnvSun: { value: ENVIRONMENT_SUN.clone() },
  uEnvSunCos: { value: new T.Vector2(Math.cos(GLINT_LIMITS.envSunFrom * Math.PI / 180), Math.cos(GLINT_LIMITS.envSunTo * Math.PI / 180)) },
  uEnvSunCap: { value: new T.Vector2(GLINT_LIMITS.envSunKnee, GLINT_LIMITS.envSun) },
});

type Uniforms = Record<string, T.IUniform>;

/** Inject shared varyings and the world-space block into a standard material's vertex shader. */
function patchVertex(shader: { vertexShader: string }, extraDecl = '', extraBody = '') {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nvarying vec3 vObjPos;\nvarying vec3 vRadialW;\n${extraDecl}`)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${GLSL_VERTEX_WORLD}\n${extraBody}`);
}
function patchFragmentDecl(shader: { fragmentShader: string }, decl: string) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nvarying vec3 vObjPos;\nvarying vec3 vRadialW;\n${GLSL_TRIPLANAR}\n${decl}`);
}

const vec3Of = (c: RGB) => new T.Vector3(c[0], c[1], c[2]);
export const DEFAULT_SUN = new T.Vector3(6, 9, 7).normalize();

/** Ground: vertex albedo + rock strata, slope/wetness channels, triplanar detail, limb haze. */
export function groundMaterial(kit: TerrainKit, program: StyleProgram): T.MeshStandardMaterial {
  const s = program.strata;
  const colors = Array.from({ length: 12 }, (_, i) => vec3Of(s.colors[Math.min(i, s.colors.length - 1)]));
  const edges = Array.from({ length: 12 }, (_, i) => s.edges[Math.min(i, s.edges.length - 1)]);
  const uniforms: Uniforms = {
    tRock: { value: kit.texture('rock') }, tGrain: { value: kit.texture('grain') }, tTurf: { value: kit.texture('turf') },
    uRockScale: { value: 1 / DETAIL_METRES.rock }, uGrainScale: { value: 1 / DETAIL_METRES.grain }, uTurfScale: { value: 1 / DETAIL_METRES.turf }, uMacroScale: { value: 1 / 7.3 },
    uRockStrength: { value: 1.0 }, uGrainStrength: { value: 0.7 }, uTurfStrength: { value: 0.75 },
    uStrataColor: { value: colors }, uStrataEdge: { value: edges }, uStrataCount: { value: s.colors.length },
    uStrataRepeat: { value: s.edges[s.edges.length - 1] }, uStrataOffset: { value: s.offset },
    uSpecialColor: { value: vec3Of(program.special.color) }, uSpecialRough: { value: program.special.roughness },
    uSpecialBreakup: { value: program.special.breakup },
    uWetDarken: { value: 0.55 }, uRadius: { value: PLANET_RADIUS },
    uAtmo: { value: vec3Of(program.atmosphere.color) }, uAtmoStrength: { value: program.atmosphere.strength * 0.35 },
    uSunDir: { value: DEFAULT_SUN.clone() },
  };
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.name = 'terrain:ground';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader, 'attribute vec4 surface;\nattribute float cover;\nvarying vec4 vSurface;\nvarying float vCover;', 'vSurface = surface;\nvCover = cover;');
    patchFragmentDecl(shader, /* glsl */ `
      varying vec4 vSurface; varying float vCover;
      uniform sampler2D tRock; uniform sampler2D tGrain; uniform sampler2D tTurf;
      uniform float uRockScale, uGrainScale, uTurfScale, uMacroScale, uRockStrength, uGrainStrength, uTurfStrength;
      uniform vec3 uStrataColor[12]; uniform float uStrataEdge[12]; uniform int uStrataCount;
      uniform float uStrataRepeat, uStrataOffset, uRadius;
      uniform vec3 uSpecialColor; uniform float uSpecialRough, uSpecialBreakup, uWetDarken;
      uniform vec3 uAtmo; uniform float uAtmoStrength; uniform vec3 uSunDir;
      vec3 strataColor(float h) {
        float y = mod(h + uStrataOffset, uStrataRepeat);
        float fw = max(fwidth(h) * 1.5, 0.002);
        vec3 c = uStrataColor[0];
        for (int i = 0; i < 12; i++) {
          if (i >= uStrataCount) break;
          c = uStrataColor[i];
          if (y < uStrataEdge[i]) {
            int j = i + 1 < uStrataCount ? i + 1 : 0;
            c = mix(c, uStrataColor[j], smoothstep(uStrataEdge[i] - 2.0 * fw, uStrataEdge[i], y));
            break;
          }
        }
        return c;
      }
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 gN = normalize(vTriNormal);
        vec3 tw = triBlend(gN);
        float hRock, hSand, hTurf;
        vec3 nRock = triNormal(tRock, vTriPos, gN, tw, uRockScale, uRockStrength, hRock);
        vec3 nSand = triNormal(tGrain, vTriPos, gN, tw, uGrainScale, uGrainStrength, hSand);
        vec3 nTurf = triNormal(tTurf, vTriPos, gN, tw, uTurfScale, uTurfStrength, hTurf);
        float coverW = smoothstep(0.2, 0.8, vCover);
        float hGrain = mix(hSand, hTurf, coverW);
        vec3 nGrain = normalize(mix(nSand, nTurf, coverW));
        float macro = triTex(tRock, vTriPos, tw, uMacroScale).a;
        // Rock pokes through loose cover at its own high spots: a crisp, irregular edge, not a fade.
        float rockW = smoothstep(0.42, 0.58, vSurface.x + (hRock - 0.5) * 0.7);
        float hNow = length(vObjPos) - uRadius;
        // Beds undulate gently and pinch along their length instead of running dead level.
        vec3 rockAlbedo = strataColor(hNow + (hRock - 0.5) * 0.03 + (macro - 0.5) * 0.06) * (0.62 + 0.62 * hRock);
        vec3 looseAlbedo = diffuseColor.rgb * (0.84 + 0.32 * hGrain);
        vec3 albedo = mix(looseAlbedo, rockAlbedo, rockW) * (0.86 + 0.28 * macro);
        float wet = vSurface.z;
        albedo *= mix(1.0, uWetDarken, wet);
        float special = vSurface.w * mix(1.0, smoothstep(0.3, 0.7, hGrain + vSurface.w * 0.35), uSpecialBreakup);
        albedo = mix(albedo, uSpecialColor, special);
        diffuseColor.rgb = albedo;
        float terrainRough = clamp(mix(vSurface.y, uSpecialRough, special) + (hGrain - 0.5) * 0.08 * (1.0 - wet), 0.05, 1.0);
        vec3 detailN = normalize(mix(nGrain, nRock, rockW));
        detailN = normalize(mix(detailN, gN, clamp(wet * 0.55 + special * 0.5, 0.0, 1.0)));
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrainRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(detailN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLSL_HAZE}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_DAYSIDE}`);
  };
  m.customProgramCacheKey = () => 'terrain.ground.v2';
  m.userData.uniforms = uniforms;
  return m;
}

/** Liquid water: depth tint and opacity from a per-vertex depth, slow ripples, shore foam. */
export function waterMaterial(kit: TerrainKit, look: WaterLook, program: StyleProgram): T.MeshStandardMaterial {
  const uniforms: Uniforms = {
    tRipple: { value: kit.texture('ripple') }, uRippleScale: { value: 1 / DETAIL_METRES.ripple }, uRippleStrength: { value: 0.3 },
    uShallow: { value: vec3Of(look.shallow) }, uDeep: { value: vec3Of(look.deep) }, uDepthScale: { value: look.depthScale },
    uFoamColor: { value: new T.Vector3(0.5, 0.53, 0.52) }, uFoamDepth: { value: 0.035 }, uFoam: { value: look.foam },
    uTime: { value: 0 },
    uAtmo: { value: vec3Of(program.atmosphere.color) }, uAtmoStrength: { value: program.atmosphere.strength * 0.35 },
    uSunDir: { value: DEFAULT_SUN.clone() }, ...glintUniforms(),
  };
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: look.roughness, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 0.75 });
  m.name = 'terrain:water';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader, 'attribute float depth;\nvarying float vDepth;', 'vDepth = depth;');
    patchFragmentDecl(shader, /* glsl */ `
      varying float vDepth;
      uniform sampler2D tRipple; uniform float uRippleScale, uRippleStrength, uDepthScale, uFoamDepth, uFoam, uTime;
      uniform vec3 uShallow, uDeep, uFoamColor;
      uniform vec3 uAtmo; uniform float uAtmoStrength; uniform vec3 uSunDir; uniform vec4 uGlint; uniform float uGlintScale; uniform vec3 uEnvSun; uniform vec2 uEnvSunCos, uEnvSunCap;
      ${GLSL_SOFT_CAP}
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 gN = normalize(vTriNormal);
        vec3 tw = triBlend(gN);
        float h1, h2;
        vec3 n1 = triNormal(tRipple, vTriPos + vec3(uTime * 0.031, 0.0, uTime * 0.019), gN, tw, uRippleScale, uRippleStrength, h1);
        vec3 n2 = triNormal(tRipple, vTriPos * 1.73 - vec3(uTime * 0.017, uTime * 0.011, 0.0), gN, tw, uRippleScale, uRippleStrength * 0.6, h2);
        vec3 waterN = normalize(n1 + n2 - gN);
        float depthT = smoothstep(0.0, 1.0, vDepth / uDepthScale);
        vec3 water = mix(uShallow, uDeep, depthT);
        float foamZone = 1.0 - smoothstep(0.0, uFoamDepth, vDepth);
        float foam = foamZone * smoothstep(0.5, 0.85, (h1 + h2) * 0.5 + foamZone * 0.3) * 0.5 * uFoam;
        diffuseColor.rgb = mix(water, uFoamColor, foam);
        diffuseColor.a = max(mix(0.42, 0.93, smoothstep(0.0, uDepthScale * 0.55, vDepth)), foam * 0.9);
        float waterRough = mix(roughness, 0.7, foam);
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = waterRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLSL_HAZE}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_DAYSIDE}\n${GLSL_GLINT}`);
  };
  m.customProgramCacheKey = () => 'terrain.water.v4';
  m.userData.uniforms = uniforms;
  return m;
}

/** Frozen sea: opaque sheet, clear dark ice over depth, snow-dusted pressure seams near shore. */
export function seaIceMaterial(kit: TerrainKit, look: WaterLook, program: StyleProgram): T.MeshStandardMaterial {
  const uniforms: Uniforms = {
    tIce: { value: kit.texture('ice') }, tGrain: { value: kit.texture('grain') },
    uIceScale: { value: 1 / DETAIL_METRES.ice }, uGrainScale: { value: 1 / DETAIL_METRES.grain },
    uShallow: { value: vec3Of(look.shallow) }, uDeep: { value: vec3Of(look.deep) }, uDepthScale: { value: look.depthScale },
    uSnow: { value: new T.Vector3(0.74, 0.79, 0.82) },
    uAtmo: { value: vec3Of(program.atmosphere.color) }, uAtmoStrength: { value: program.atmosphere.strength * 0.35 },
    uSunDir: { value: DEFAULT_SUN.clone() }, ...glintUniforms(),
  };
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: look.roughness, metalness: 0, envMapIntensity: 1.0 });
  m.name = 'terrain:sea-ice';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader, 'attribute float depth;\nvarying float vDepth;', 'vDepth = depth;');
    patchFragmentDecl(shader, /* glsl */ `
      varying float vDepth;
      uniform sampler2D tIce; uniform sampler2D tGrain; uniform float uIceScale, uGrainScale, uDepthScale;
      uniform vec3 uShallow, uDeep, uSnow;
      uniform vec3 uAtmo; uniform float uAtmoStrength; uniform vec3 uSunDir; uniform vec4 uGlint; uniform float uGlintScale; uniform vec3 uEnvSun; uniform vec2 uEnvSunCos, uEnvSunCap;
      ${GLSL_SOFT_CAP}
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 gN = normalize(vTriNormal);
        vec3 tw = triBlend(gN);
        float hIce, hSnow;
        vec3 nIce = triNormal(tIce, vTriPos, gN, tw, uIceScale, 0.45, hIce);
        vec3 nSnow = triNormal(tGrain, vTriPos, gN, tw, uGrainScale, 0.6, hSnow);
        float depthT = smoothstep(0.0, 1.0, vDepth / uDepthScale);
        // Floe-scale variation: dark young ice, paler old floes.
        float floe = triTex(tIce, vTriPos * 0.31 + 7.0, tw, uIceScale).a;
        vec3 ice = mix(uShallow, uDeep, clamp(depthT + (0.5 - floe) * 0.6, 0.0, 1.0)) * (0.84 + 0.32 * hIce);
        // Wind-packed snow only on pressure ridges and on the oldest floes.
        float snow = clamp(smoothstep(0.66, 0.88, hIce) * 0.75 + smoothstep(0.62, 0.86, floe) * 0.35 + (hSnow - 0.5) * 0.2, 0.0, 1.0);
        // Along the shore: a band of grounded, broken ice (the ice foot), then
        // a dark tide crack where the floating sheet works against it.
        float foot = 1.0 - smoothstep(0.02, 0.05, vDepth + (hSnow - 0.5) * 0.02);
        float crack = smoothstep(0.045, 0.058, vDepth) * (1.0 - smoothstep(0.062, 0.08, vDepth + (hIce - 0.5) * 0.03));
        vec3 rubble = vec3(0.6, 0.64, 0.66) * (0.72 + 0.5 * hSnow);
        diffuseColor.rgb = mix(mix(ice, uSnow * (0.9 + 0.2 * hSnow), snow), rubble, foot) * (1.0 - 0.45 * crack);
        float iceRough = mix(mix(0.3 + 0.18 * (1.0 - hIce), 0.78, snow), 0.88, foot);
        vec3 iceN = normalize(mix(mix(nIce, nSnow, snow), nSnow, foot));
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = iceRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(iceN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLSL_HAZE}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_DAYSIDE}\n${GLSL_GLINT}`);
  };
  m.customProgramCacheKey = () => 'terrain.sea-ice.v4';
  m.userData.uniforms = uniforms;
  return m;
}

/** Atmosphere halo just outside the limb: back faces of a shell, brightest at the ground, fading outwards. */
export function atmosphereMaterial(program: StyleProgram): T.ShaderMaterial {
  const m = new T.ShaderMaterial({
    name: 'terrain:atmosphere',
    uniforms: { uColor: { value: vec3Of(program.atmosphere.color) }, uStrength: { value: program.atmosphere.strength }, uSunDir: { value: DEFAULT_SUN.clone() } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; uniform vec3 uSunDir;
      varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 v = normalize(cameraPosition - vP);
        float facing = clamp(-dot(normalize(vN), v), 0.0, 1.0);
        float glow = pow(facing, 2.2);
        float lit = smoothstep(-0.35, 0.55, dot(normalize(vN), uSunDir));
        gl_FragColor = vec4(uColor * glow * lit * uStrength * 0.55, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  });
  return m;
}

export type FloraMaterialName = 'rock' | 'foliage' | 'needles' | 'succulent' | 'bark' | 'ice' | 'leafCard' | 'needleCard';

const FLORA_VERTEX = (shader: { vertexShader: string }) => patchVertex(shader, 'varying float vLocalY;\nvarying vec3 vTreeUp;', /* glsl */ `
  vLocalY = position.y;
  #ifdef USE_INSTANCING
    vTreeUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
  #else
    vTreeUp = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  #endif
`);

/** Plant and rock material: triplanar detail, base darkening by model height, per-instance colour. */
function floraMaterial(kit: TerrainKit, name: Exclude<FloraMaterialName, 'leafCard' | 'needleCard'>): T.MeshStandardMaterial {
  const spec: Record<typeof name, { tex: DetailName; strength: number; rough: number; ao: [number, number]; env: number; snow?: boolean }> = {
    rock: { tex: 'rock', strength: 1.1, rough: 0.86, ao: [0.45, 0.35], env: 0.8 },
    foliage: { tex: 'foliage', strength: 1.4, rough: 0.82, ao: [0.35, 0.8], env: 0.55 },
    needles: { tex: 'foliage', strength: 1.6, rough: 0.8, ao: [0.4, 0.9], env: 0.5 },
    succulent: { tex: 'grain', strength: 0.6, rough: 0.5, ao: [0.4, 0.5], env: 0.8 },
    bark: { tex: 'bark', strength: 1.4, rough: 0.92, ao: [0.5, 0.6], env: 0.5 },
    // Glacier ice is wind-scoured and frosted, not polished: matt enough that
    // it never reads as glass, with snow lying on every upward face.
    ice: { tex: 'ice', strength: 0.9, rough: 0.42, ao: [0.75, 0.45], env: 0.8, snow: true },
  };
  const s = spec[name];
  const uniforms: Uniforms = {
    tDetail: { value: kit.texture(s.tex) }, uScale: { value: 1 / DETAIL_METRES[s.tex] }, uStrength: { value: s.strength },
    uAo: { value: new T.Vector2(s.ao[0], s.ao[1]) }, uSunDir: kit.sunUniform,
  };
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: s.rough, metalness: 0, envMapIntensity: s.env });
  m.name = `terrain:flora-${name}`;
  if (s.snow) m.defines = { FLORA_SNOW: '' };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    FLORA_VERTEX(shader);
    patchFragmentDecl(shader, 'varying float vLocalY;\nvarying vec3 vTreeUp;\nuniform sampler2D tDetail; uniform float uScale, uStrength; uniform vec2 uAo; uniform vec3 uSunDir;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 gN = normalize(vTriNormal);
        vec3 tw = triBlend(gN);
        float hD;
        vec3 floraN = triNormal(tDetail, vTriPos, gN, tw, uScale, uStrength, hD);
        diffuseColor.rgb *= (0.7 + 0.6 * hD) * mix(uAo.x, 1.0, smoothstep(0.0, uAo.y, vLocalY));
        float floraRough = clamp(roughness + (0.5 - hD) * 0.15, 0.04, 1.0);
        #ifdef FLORA_SNOW
          // Snow on faces turned up to the sky, broken by the surface detail.
          float snowCap = smoothstep(0.35, 0.75, dot(floraN, normalize(vTreeUp)) + (hD - 0.5) * 0.35);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.70, 0.75, 0.78) * (0.92 + 0.16 * hD), snowCap);
          floraRough = mix(floraRough, 0.86, snowCap);
        #endif
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = floraRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(floraN, 0.0)).xyz);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_DAYSIDE}\n${GLSL_PLANET_SHADOW}`);
  };
  m.customProgramCacheKey = () => `terrain.flora.${name}.v3`;
  return m;
}

/**
 * Foliage cards: alpha-to-coverage leaf or needle clusters on crossed quads.
 * Card normals point out of the crown (set by the model), so a crown shades
 * as one volume; faces turned down are darkened, the base of the plant too.
 * The shadow pass reuses map and alphaTest, so shadows are leafy as well.
 */
function cardMaterial(kit: TerrainKit, name: 'leafCard' | 'needleCard'): T.MeshStandardMaterial {
  const uniforms: Uniforms = { uAo: { value: new T.Vector2(0.45, 0.85) }, uSunDir: kit.sunUniform };
  const m = new T.MeshStandardMaterial({
    color: 0xffffff, map: kit.card(name === 'leafCard' ? 'leaf' : 'needle'),
    alphaTest: 0.42, alphaToCoverage: true, side: T.DoubleSide,
    roughness: name === 'leafCard' ? 0.72 : 0.8, metalness: 0, envMapIntensity: 0.45,
  });
  m.name = `terrain:flora-${name}`;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    FLORA_VERTEX(shader);
    patchFragmentDecl(shader, 'varying float vLocalY;\nvarying vec3 vTreeUp;\nuniform vec2 uAo; uniform vec3 uSunDir;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 gN = normalize(vTriNormal);
        float under = clamp(-dot(gN, normalize(vTreeUp)), 0.0, 1.0);
        diffuseColor.rgb *= mix(uAo.x, 1.0, smoothstep(0.0, uAo.y, vLocalY)) * (1.0 - 0.5 * under);
      `)
      // The crown normal, unflipped on back faces: both sides of a card shade as the crown there.
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_DAYSIDE}\n${GLSL_PLANET_SHADOW}`);
  };
  m.customProgramCacheKey = () => `terrain.flora.${name}.v2`;
  return m;
}

export class TerrainKit {
  readonly lod: LodTier;
  private textures = new Map<DetailName, T.DataTexture>();
  private cards = new Map<CardName, T.DataTexture>();
  /** Sun direction shared by every plant material of this kit (for the night-side glint mask). */
  readonly sunUniform: T.IUniform<T.Vector3> = { value: DEFAULT_SUN.clone() };
  private materials = new Map<FloraMaterialName, T.MeshStandardMaterial>();
  private geometries = new Map<string, T.BufferGeometry[]>();
  private anisotropy = 1;
  private disposed = false;
  /** Texture edge length; the LOD default unless a test asks for something smaller. */
  readonly textureSize: number;

  constructor(lod: LodTier, options: { textureSize?: number } = {}) {
    this.lod = lod;
    this.textureSize = options.textureSize ?? LOD[lod].textureSize;
  }

  setAnisotropy(value: number) {
    this.anisotropy = Math.max(1, Math.min(8, value));
    for (const t of [...this.textures.values(), ...this.cards.values()]) t.anisotropy = this.anisotropy;
  }

  texture(name: DetailName): T.DataTexture {
    this.alive();
    let t = this.textures.get(name);
    if (!t) {
      t = markShared(makeDataTexture(detailMap(name, this.textureSize, 31 + DETAIL_NAMES.indexOf(name) * 17), this.textureSize, false));
      t.anisotropy = this.anisotropy;
      t.name = `terrain:${name}`;
      this.textures.set(name, t);
    }
    return t;
  }

  /** Foliage card texture (sRGB colour + coverage alpha), generated at the kit's texture size. */
  card(name: CardName): T.DataTexture {
    this.alive();
    let t = this.cards.get(name);
    if (!t) {
      t = markShared(makeDataTexture(foliageCard(name, this.textureSize, name === 'leaf' ? 61 : 67), this.textureSize, true));
      t.anisotropy = this.anisotropy;
      t.name = `terrain:card-${name}`;
      this.cards.set(name, t);
    }
    return t;
  }

  flora(name: FloraMaterialName): T.MeshStandardMaterial {
    this.alive();
    let m = this.materials.get(name);
    if (!m) { m = markShared(name === 'leafCard' || name === 'needleCard' ? cardMaterial(this, name) : floraMaterial(this, name)); this.materials.set(name, m); }
    return m;
  }

  setSunDirection(dir: Vec3) { this.sunUniform.value.set(dir[0], dir[1], dir[2]).normalize(); }

  /** Cache built geometries (per plant kind) so every planet of this LOD instances the same buffers. */
  cachedGeometry(key: string, make: () => T.BufferGeometry[]): T.BufferGeometry[] {
    this.alive();
    let g = this.geometries.get(key);
    if (!g) { g = make().map(x => markShared(x)); this.geometries.set(key, g); }
    return g;
  }

  stats() { return { textures: this.textures.size + this.cards.size, materials: this.materials.size, geometries: [...this.geometries.values()].reduce((n, g) => n + g.length, 0) }; }

  private alive() { if (this.disposed) throw new Error('TerrainKit has been disposed.'); }

  /** Every shared texture, material and geometry, for disposal checks. */
  owned(): { textures: T.Texture[]; materials: T.Material[]; geometries: T.BufferGeometry[] } {
    return { textures: [...this.textures.values(), ...this.cards.values()], materials: [...this.materials.values()], geometries: [...this.geometries.values()].flat() };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of [...this.textures.values(), ...this.cards.values()]) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const g of this.geometries.values()) g.forEach(x => x.dispose());
    this.textures.clear(); this.cards.clear(); this.materials.clear(); this.geometries.clear();
  }
}
