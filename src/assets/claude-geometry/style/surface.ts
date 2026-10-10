import type * as T from 'three';
import type { LookParams } from './look.ts';

// Two finishing touches for the village look's surfaces, both as shader
// patches chained after the stepped light (src/style/cel.ts):
//
// - applyMottle: posterised tonal patches, so a wall or a roof reads as
//   painted in a few flat tones rather than one. Fixed in the world by
//   default (neighbouring pieces share one pattern); fixed to the model
//   (object space) for things that move, so the patches turn and fly with a
//   ship instead of crawling over it.
// - applyInterior: surfaces under a roof get a brighter fill and a weaker sun,
//   so indoors the shade band sits at fill × 0.5 = 0.75 of a colour instead of
//   0.5 while lit surfaces stay at the colour. Which vertices are under a roof
//   is a per-vertex `cover` attribute (0 or 1) that buildBlueprintModel writes
//   (src/blueprint/cover.ts). The patch goes on a twin of a library material
//   (StyleLibrary.indoor) that only those models use: every geometry it draws
//   carries the attribute. (A default value for geometry without one is not
//   safe: three sets it once per vertex array, from a context-wide slot that
//   other programs overwrite.)

const NOISE = /* glsl */ `
float mtHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float mtNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mtHash( i ), mtHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( mtHash( i + vec2( 0.0, 1.0 ) ), mtHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float mtFbm( vec2 p ) { return 0.5 * mtNoise( p ) + 0.3 * mtNoise( p * 2.07 + 13.1 ) + 0.2 * mtNoise( p * 4.13 + 7.7 ); }`;

function chain(material: T.MeshStandardMaterial, tag: string, patch: (shader: { vertexShader: string; fragmentShader: string }) => void) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    patch(shader);
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key.call(material)}|${tag}`;
}

function replaceOnce(source: string, target: string, by: string, what: string): string {
  if (!source.includes(target)) throw new Error(`three changed ${what}; the village surface patch needs updating.`);
  return source.replace(target, by);
}

/** Where a material's tonal patches are fixed: in the world, or to the model that draws it. */
export type MottleSpace = 'world' | 'object';

/**
 * Darken `amount` of a material's colour in patches about a metre across,
 * fixed in the world or to the model (`space`); idempotent.
 */
export function applyMottle(material: T.MeshStandardMaterial, amount: number, space: MottleSpace = 'world'): T.MeshStandardMaterial {
  if (material.userData.mottle) return material;
  material.userData.mottle = true;
  material.userData.mottleSpace = space;
  const at = space === 'object' ? 'transformed' : '( modelMatrix * vec4( transformed, 1.0 ) ).xyz';
  chain(material, `mottle${amount}${space === 'object' ? 'obj' : ''}`, shader => {
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vMtWorld;', 'the vertex common chunk');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <project_vertex>', `#include <project_vertex>\nvMtWorld = ${at};`, 'the project_vertex chunk');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\nvarying vec3 vMtWorld;${NOISE}`, 'the fragment common chunk');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <color_fragment>', /* glsl */ `#include <color_fragment>
      vec3 mtP = vMtWorld * 1.15;
      float mtN = mtFbm( mtP.xz + mtP.y * 0.73 ) * 0.6 + mtFbm( mtP.xy * 1.3 + mtP.zz * 0.41 + 3.1 ) * 0.4;
      diffuseColor.rgb *= 1.0 - ${amount.toFixed(3)} * step( 0.56, mtN );`, 'the color_fragment chunk');
  });
  return material;
}

/**
 * A glow drawn without a tone curve: where a channel of its light would pass 1
 * (and clip, turning an orange lamp yellow or white, a cyan lens white-green),
 * the light is scaled down as a whole, so a glow keeps its hue at any
 * intensity and a lit one is that hue at full brightness (its own colour when
 * the colour has a full channel, as the village lamp and sodium do). Idempotent.
 */
export function applyHueKeep(material: T.MeshStandardMaterial): T.MeshStandardMaterial {
  if (material.userData.hueKeep) return material;
  material.userData.hueKeep = true;
  chain(material, 'hue', shader => {
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <opaque_fragment>',
      'outgoingLight /= max( 1.0, max( outgoingLight.r, max( outgoingLight.g, outgoingLight.b ) ) );\n#include <opaque_fragment>', 'the opaque_fragment chunk');
  });
  return material;
}

/** The cel line this patch scales; it must match what applyCel writes. */
export const CEL_DIRECT = 'vec3 irradiance = celStep( dotNL ) * directLight.color;';

/**
 * Brighter fill and weaker sun where the `cover` attribute is 1; chained after
 * applyCel; idempotent. Every geometry drawn with the material must carry `cover`.
 */
export function applyInterior(material: T.MeshStandardMaterial, interior: NonNullable<LookParams['interior']>): T.MeshStandardMaterial {
  if (material.userData.interior) return material;
  material.userData.interior = true;
  const f = (v: number) => v.toFixed(4);
  chain(material, `interior${interior.fill}/${interior.key}`, shader => {
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nattribute float cover;\nvarying float vCover;', 'the vertex common chunk');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvCover = cover;', 'the begin_vertex chunk');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', '#include <common>\nvarying float vCover;', 'the fragment common chunk');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, CEL_DIRECT,
      `vec3 irradiance = celStep( dotNL ) * directLight.color * mix( 1.0, ${f(interior.key)}, vCover );`, 'the stepped light (apply cel first)');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <lights_fragment_end>',
      `irradiance *= mix( 1.0, ${f(interior.fill)}, vCover );\n#include <lights_fragment_end>`, 'the lights_fragment_end chunk');
  });
  return material;
}
