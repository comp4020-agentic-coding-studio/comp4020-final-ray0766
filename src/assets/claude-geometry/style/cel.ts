import * as T from 'three';
import type { LookParams } from './look.ts';
import { CEL_DIRECT } from './surface.ts';

// Flat, stepped light for the village look. three's physical lighting adds
// each direct light as irradiance = dotNL × colour, takes a Fresnel share of
// it off the diffuse and adds a GGX highlight, and takes the specular lobe's
// energy off the sky fill too. Here a material is lit as a flat painted
// surface instead: dotNL is replaced by flat bands (shade, mid, lit) with a
// narrow soft edge between them (the village sets shade and mid to 0, so a
// surface is either lit by the sun or not), and there is no specular at all,
// direct or indirect, so a lit surface is exactly its colour and a shaded one
// exactly the fill's share of it (metalness is ignored: nothing in the look
// reflects). The light's colour, its distance and cone falloff and its shadow
// still apply, so the sun, the practical lamps and their shadows are the same
// real lights; only the way a surface turns from them is drawn in steps, as an
// illustration would. The hemisphere fill keeps its own direction, so a shaded
// side keeps the fill's share of its colour.

/** three's own light functions this patch stands in for; it fails loudly if three renames them. */
const PHYSICAL = [/void RE_Direct_Physical\(/, /void RE_IndirectDiffuse_Physical\(/, /void RE_IndirectSpecular_Physical\(/, /#define RE_Direct\s+RE_Direct_Physical/];

/** GLSL for the band function, from the look's `cel` parameters. */
function celFunction(cel: NonNullable<LookParams['cel']>): string {
  const f = (v: number) => v.toFixed(4);
  return /* glsl */ `
float celStep( const in float x ) {
  float toMid = smoothstep( ${f(cel.midAt - cel.soft)}, ${f(cel.midAt + cel.soft)}, x );
  float toLit = smoothstep( ${f(cel.litAt - cel.soft)}, ${f(cel.litAt + cel.soft)}, x );
  return mix( ${f(cel.shade)}, ${f(cel.mid)}, toMid ) + ( 1.0 - ${f(cel.mid)} ) * toLit;
}`;
}

/**
 * Diffuse-only light in bands, in place of three's physical light functions
 * (same signatures, swapped in by redefining three's RE_ macros). The stepped
 * line is CEL_DIRECT, which src/style/surface.ts applyInterior scales.
 */
const FLAT_LIGHT = /* glsl */ `
void RE_Direct_Flat( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
  ${CEL_DIRECT}
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Flat( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Flat( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {}
#undef RE_Direct
#define RE_Direct RE_Direct_Flat
#undef RE_IndirectDiffuse
#define RE_IndirectDiffuse RE_IndirectDiffuse_Flat
#undef RE_IndirectSpecular
#define RE_IndirectSpecular RE_IndirectSpecular_Flat
`;

/** The GLSL that stands in for three's physical light functions chunk in a look with bands. */
export function celChunk(cel: NonNullable<LookParams['cel']>): string {
  const chunk = T.ShaderChunk.lights_physical_pars_fragment;
  for (const s of PHYSICAL) if (!s.test(chunk)) throw new Error('three changed its physical lighting chunk; the cel patch needs updating.');
  return celFunction(cel) + '\n' + chunk + '\n' + FLAT_LIGHT;
}

/** Make `material` (a MeshStandardMaterial) light flat, in steps; idempotent per material. */
export function applyCel(material: T.MeshStandardMaterial, cel: NonNullable<LookParams['cel']>): T.MeshStandardMaterial {
  if (material.userData.cel) return material;
  material.userData.cel = true;
  const patched = celChunk(cel);
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', patched);
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key.call(material)}|cel`;
  return material;
}
