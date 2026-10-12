import { radialField } from './radial-field.ts';
import { legacyHeightField } from '../assets/claude-geometry/core/ground.ts';
import { cacheImmutableField, seatedFit } from './ground-fit-cache.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { decodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { createHeightField, HEIGHT_LIMITS, LANDING_BLEND, LANDING_FREEBOARD, LANDING_RADIUS } from '../assets/claude-geometry/terrain/field.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import { SPAWN_DIR, PLANET_RADIUS } from '../assets/claude-geometry/core/anchor.ts';
import { surfaceFooting, gradeFoundations } from './terrain-grading.ts';
import type { BlueprintContents } from './blueprints.ts';
import { objectRadius, objectName } from './planets.ts';
import type { PlacedObject } from './planets.ts';
const legacy=legacyHeightField(),fields=new Map<string,HeightField>();
interface FieldCameraBoundProof {
 heightAt: HeightField['heightAt']; ceiling: number; limits: readonly number[];
 source: TerrainField; sourceHeightAt: TerrainField['heightAt']; program: TerrainField['program']; programHeight: TerrainField['program']['height'];
 dependenciesValid: () => boolean;
}
// Values only: derivative arithmetic does not influence terrain height.
// See docs/integration/terrain-camera-bound-proof.md for the operation/error bounds. This
// allowance exceeds the binary64 error of the fixed <=5-octave paths.
const NOISE_UPPER = 2 + 2 ** -32;
const FBM_UPPER = NOISE_UPPER + 2 ** -32;
const RIDGED_UPPER = 1 + 2 ** -30;
const SMOOTH_UPPER = 1 + 2 ** -32;
const boundMath = { abs: Math.abs, floor: Math.floor, sqrt: Math.sqrt, min: Math.min, max: Math.max, imul: Math.imul, round: Math.round };
const mathCurrent = () => Math.abs === boundMath.abs && Math.floor === boundMath.floor && Math.sqrt === boundMath.sqrt
 && Math.min === boundMath.min && Math.max === boundMath.max && Math.imul === boundMath.imul && Math.round === boundMath.round;
function temperateCameraBound(source: TerrainField): number | null {
 const env = source.env, params = env.params;
 const relief = params.relief, rough = params.roughness;
 if (env.style !== 'temperate' || (env.generatorVersion !== 1 && env.generatorVersion !== 2)
   || !Number.isFinite(relief) || relief < .3 || relief > 1.4 || !Number.isFinite(rough) || rough < 0 || rough > 1
   || !Number.isFinite(source.landingLevel) || !mathCurrent()) return null;
 const v2 = env.generatorVersion === 2;
 const hills = (v2 ? .45 : .62) * relief * FBM_UPPER;
 const broad = (v2 ? .32 : .4) * relief * FBM_UPPER;
 const outcrop = .34 * relief * RIDGED_UPPER * SMOOTH_UPPER;
 const detail = (.02 + .025 * rough) * FBM_UPPER;
 const rawUpper = hills + broad + outcrop + detail + .18 * SMOOTH_UPPER;
 const padUpper = source.landingLevel + .03 * NOISE_UPPER;
 // smoothstep's binary64 overshoot and lerp/add/scale rounding are covered
 // outwards; the exact blend is a convex combination. softCeil never raises
 // its input, and softFloor can raise only below floorKnee.
 const upper = Math.max(rawUpper, padUpper, HEIGHT_LIMITS.floorKnee)
   + 2 ** -28 * (1 + Math.abs(rawUpper) + Math.abs(padUpper));
 return Number.isFinite(upper) ? upper : null;
}
function factoryBoundDependencies(source: TerrainField): () => boolean {
 const env = source.env, params = env.params, style = source.style;
 const paramKeys = Object.keys(params).sort(), paramValues = paramKeys.map(key => params[key]);
 const envSnapshot = [env.generator, env.generatorVersion, env.seed, env.style];
 const landing = [LANDING_RADIUS, LANDING_FREEBOARD, ...LANDING_BLEND, PLANET_RADIUS, ...SPAWN_DIR];
 const landingLevel = source.landingLevel;
 return () => source.env === env && env.params === params && source.style === style
   && [env.generator, env.generatorVersion, env.seed, env.style].every((value, i) => Object.is(value, envSnapshot[i]))
   && Object.keys(params).length === paramKeys.length && paramKeys.every((key, i) => Object.is(params[key], paramValues[i]))
   && [LANDING_RADIUS, LANDING_FREEBOARD, ...LANDING_BLEND, PLANET_RADIUS, ...SPAWN_DIR].length === landing.length
   && [LANDING_RADIUS, LANDING_FREEBOARD, ...LANDING_BLEND, PLANET_RADIUS, ...SPAWN_DIR].every((value, i) => Object.is(value, landing[i]))
   && Object.is(source.landingLevel, landingLevel) && mathCurrent();
}

const fieldCameraBounds = new WeakMap<HeightField, FieldCameraBoundProof>();
const clampValues = () => [HEIGHT_LIMITS.floor, HEIGHT_LIMITS.floorKnee, HEIGHT_LIMITS.knee, HEIGHT_LIMITS.ceiling];
/** Creation provenance only, not a general HeightField guess. Legacy fields,
 * replaced functions and changed clamp constants have no camera bound. */
export function trustedFieldRadiusUpperBound(field: HeightField): number | null {
 const proof = fieldCameraBounds.get(field);
 return proof && field.heightAt === proof.heightAt
   && proof.source.heightAt === proof.sourceHeightAt && proof.source.program === proof.program && proof.program.height === proof.programHeight
   && proof.dependenciesValid() && mathCurrent()
   && clampValues().every((value, index) => Object.is(value, proof.limits[index])) ? proof.ceiling : null;
}

export function fieldOf(environment?:string|null,radius=10):HeightField{
 const key=radius+':'+(environment??'legacy');let field=fields.get(key);
 if(!field){let source:HeightField=legacy;let generated=false;if(environment){const r=decodeEnvironment(environment);if(!r.ok)throw Error('Invalid stored terrain.');source=createHeightField(r.value);generated=true;}
 field=cacheImmutableField(radialField(source,radius));
 if(generated && Number.isFinite(radius) && radius > 0 && mathCurrent()){
  const terrain = source as TerrainField, tight = temperateCameraBound(terrain);
  const limits=clampValues(),[floor,floorKnee,knee,ceiling]=limits;
  // softCeil <= ceiling; softFloor cannot raise above floorKnee. Radial
  // rebasing adds radius-10. These ordering checks keep that proof explicit.
  if(limits.every(Number.isFinite) && floor < floorKnee && floorKnee <= ceiling && knee < ceiling){
   // Conservatively round above the two radial additions and clamp algebra;
   // this is upper-bound metadata, never a relaxed collision tolerance.
   const heightUpper=tight ? Math.min(ceiling, tight) : ceiling;
   const upper=radius+heightUpper+32*Number.EPSILON*(1+Math.abs(radius)+Math.abs(radius-10)+Math.abs(heightUpper)+10);
   if(Number.isFinite(upper) && Number.isFinite(terrain.landingLevel))fieldCameraBounds.set(field,{heightAt:field.heightAt,ceiling:upper,limits,source:terrain,sourceHeightAt:terrain.heightAt,
    program:terrain.program,programHeight:terrain.program.height,dependenciesValid:factoryBoundDependencies(terrain)});
  }
 }
 if(fields.size>=24)fields.delete(fields.keys().next().value!);fields.set(key,field);}return field;
}
export function footing(o:PlacedObject,blueprints:BlueprintContents={}){
 if(o.kind==='structure'){const parts=blueprints[o.blueprintHash!];if(!parts)throw Error('Structure content is missing.');return surfaceFooting(parts,objectRadius(o));}
 return surfaceFooting(undefined,objectRadius(o));
}
export function terrainObjects(objects:readonly PlacedObject[],blueprints:BlueprintContents={}){return objects.map(o=>({id:o.id,label:objectName(o),anchor:{dir:o.position,yaw:o.rotation},footprint:footing(o,blueprints).footprint}));}
export function foundations(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}){
 return objects.map(o=>{const f=footing(o,blueprints),anchor={dir:o.position,yaw:o.rotation};return {anchor,baseRadius:seatedFit(field,anchor,f.footprint).baseRadius,radius:f.footprint.radius,covers:f.covers};});
}
// Same radial lowering used by Claude's buildPlanet foundation grading. Pure and shared by server/client.
export function gradedField(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}):HeightField{
 return gradeFoundations(field,foundations(field,objects,blueprints));
}
export const objectSeat=(field:HeightField,o:PlacedObject,blueprints:BlueprintContents={})=>seatedFit(field,{dir:o.position,yaw:o.rotation},footing(o,blueprints).footprint);
