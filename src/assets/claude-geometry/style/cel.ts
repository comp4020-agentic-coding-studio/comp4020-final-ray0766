import * as T from 'three';
import type { LookParams } from './look.ts';

// Stepped direct light for the village look. three's physical lighting adds
// each direct light as irradiance = dotNL × colour; here dotNL is replaced by
// three flat bands (shade, mid, lit) with a narrow soft edge between them. The
// light's colour, its distance and cone falloff and its shadow still apply, so
// the sun, the practical lamps and their shadows are the same real lights;
// only the way a surface turns from them is drawn in steps, as an illustration
// would. Image-based and hemisphere fill are untouched, so shaded sides keep
// the sky's colour.

const TARGET = 'vec3 irradiance = dotNL * directLight.color;';

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

/** Make `material` (a MeshStandardMaterial) light in steps; idempotent per material. */
export function applyCel(material: T.MeshStandardMaterial, cel: NonNullable<LookParams['cel']>): T.MeshStandardMaterial {
  if (material.userData.cel) return material;
  material.userData.cel = true;
  const chunk = T.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(TARGET)) throw new Error('three changed its physical lighting chunk; the cel patch needs updating.');
  const patched = celFunction(cel) + '\n' + chunk.replace(TARGET, 'vec3 irradiance = celStep( dotNL ) * directLight.color;');
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', patched);
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key.call(material)}|cel`;
  return material;
}
