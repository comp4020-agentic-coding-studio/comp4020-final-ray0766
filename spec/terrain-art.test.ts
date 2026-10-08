import {expect,it} from 'vitest';
import * as T from 'three';
import {applyTerrainArt,TERRAIN_ART_VERSION} from '../src/client/terrain-art.ts';
import {applyArtMaterial} from '../src/client/art-profile.ts';
import {TerrainKit,groundMaterial} from '../src/assets/claude-geometry/terrain/kit.ts';
import {createHeightField} from '../src/assets/claude-geometry/terrain/field.ts';
import {defaultEnvironment,STYLES} from '../src/assets/claude-geometry/terrain/env.ts';
import {terrainModel} from '../src/client/terrain-model.ts';
import {DISTRICT_ENVIRONMENT} from '../src/shared/district-layout.ts';
import {HOME_ENVIRONMENT} from '../src/shared/home-layout.ts';

it.each(STYLES)('composes the %s ground shader with cel lighting while preserving biome uniforms and ownership',style=>{
 const kit=new TerrainKit('low',{look:'village'}),environment=defaultEnvironment(style),document=JSON.stringify(environment);
 const program=createHeightField(environment).program,material=groundMaterial(kit,program),owned=kit.owned();
 const uniforms=material.userData.uniforms,sourceStrength=uniforms.uRockStrength.value,sourceStrata=uniforms.uStrataColor.value.map((v:T.Vector3)=>v.toArray());
 applyArtMaterial(material);applyTerrainArt(material);
 const key=material.customProgramCacheKey(),hook=material.onBeforeCompile;
 applyTerrainArt(material);expect(material.onBeforeCompile).toBe(hook);expect(material.customProgramCacheKey()).toBe(key);
 expect(key).toContain('terrain.ground.v2');expect(key).toContain(TERRAIN_ART_VERSION);
 try{
  for(let pass=0;pass<2;pass++){
   const shader={uniforms:{} as Record<string,T.IUniform>,vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
   material.onBeforeCompile(shader as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
   expect(shader.fragmentShader).toContain('float celStep');
   expect(shader.fragmentShader).toContain('float wet = vSurface.z;');
   expect(shader.fragmentShader).toContain('albedo = mix(albedo, uSpecialColor, special);');
   expect(shader.uniforms.uSpecialColor).toBe(uniforms.uSpecialColor);expect(shader.uniforms.uRadius).toBe(uniforms.uRadius);
   expect(shader.uniforms.uRockStrength.value).toBeLessThan(sourceStrength*.1);
   expect(shader.uniforms.uArtRockMean.value.toArray().every(Number.isFinite)).toBe(true);
   expect(shader.fragmentShader.match(/uniform vec3 uArtRockMean;/g)).toHaveLength(1);
  }
  expect(uniforms.uRockStrength.value).toBe(sourceStrength);
  expect(uniforms.uStrataColor.value.map((v:T.Vector3)=>v.toArray())).toEqual(sourceStrata);
  expect(JSON.stringify(environment)).toBe(document);expect(kit.owned()).toEqual(owned);
 }finally{material.dispose();kit.dispose();}
});

it('limits the meadow grade to the exact new district document without changing ground geometry or stored vertex colours',()=>{
 const altered=JSON.parse(DISTRICT_ENVIRONMENT);altered.seed++;
 const keys:string[]=[];
 for(const [environment,graded]of [[DISTRICT_ENVIRONMENT,true],[HOME_ENVIRONMENT,false],[JSON.stringify(altered),false]] as const){
  const model=terrainModel(environment,[],{},'low',false,21.6),material=model.ground.material as T.MeshStandardMaterial;
  const attributes=Object.fromEntries(['position','normal','color','surface','cover'].map(name=>[name,Array.from(model.ground.geometry.getAttribute(name).array)]));
  try{
   const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
   material.onBeforeCompile(shader as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
   expect(shader.fragmentShader.includes('float artMeadow =')).toBe(graded);
   keys.push(material.customProgramCacheKey());
   for(const [name,values]of Object.entries(attributes))expect(Array.from(model.ground.geometry.getAttribute(name).array)).toEqual(values);
  }finally{model.dispose();}
 }
 expect(keys[0]).not.toBe(keys[1]);expect(keys[1]).toBe(keys[2]);
});
