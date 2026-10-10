import {expect,it} from 'vitest';
import * as T from 'three';
import {TerrainKit,groundMaterial} from '../src/assets/claude-geometry/terrain/kit.ts';
import {createHeightField} from '../src/assets/claude-geometry/terrain/field.ts';
import {defaultEnvironment,hexLinear,STYLES} from '../src/assets/claude-geometry/terrain/env.ts';
import {VILLAGE_TERRAIN} from '../src/assets/claude-geometry/terrain/village.ts';
import {terrainModel} from '../src/client/terrain-model.ts';
import {DISTRICT_ENVIRONMENT} from '../src/shared/district-layout.ts';
import {HOME_ENVIRONMENT} from '../src/shared/home-layout.ts';

it.each(STYLES)('draws %s with its village palette and flat lighting without mutating biome data or ownership',style=>{
 const kit=new TerrainKit('low',{look:'village'}),environment=defaultEnvironment(style),document=JSON.stringify(environment);
 const program=createHeightField(environment).program,material=groundMaterial(kit,program,environment),owned=kit.owned();
 const uniforms=material.userData.uniforms,sourceStrength=uniforms.uRockStrength.value,sourceStrata=uniforms.uStrataColor.value.map((v:T.Vector3)=>v.toArray());
 const key=material.customProgramCacheKey(),palette=VILLAGE_TERRAIN[style];
 expect(key).toContain('terrain.ground.v2');expect(key).toContain('|village');expect(material.userData.village).toBe('ground');
 expect(uniforms.uVlTurfN.value).toBe(palette.turf.length);expect(uniforms.uVlLooseN.value).toBe(palette.loose.length);
 expect(uniforms.uVlRockLight.value.toArray()).toEqual(hexLinear(palette.rock.light));
 expect(uniforms.uVlSpecial.value.toArray()).toEqual(hexLinear(palette.special.tone));
 try{
  for(let pass=0;pass<2;pass++){
   const shader={uniforms:{} as Record<string,T.IUniform>,vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
   material.onBeforeCompile(shader as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
   expect(shader.fragmentShader.match(/float celStep\(/g)).toHaveLength(1);
   expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix( vlC.rgb, uVlGravel');
   expect(shader.fragmentShader).toContain('normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);');
   expect(shader.fragmentShader).toContain('material.specularColor = vec3( 0.0 );');
   expect(shader.fragmentShader).not.toContain('uArtRockMean');
   for(const name of ['uSpecialColor','uRadius','uVlTurf','uVlLoose','uVlRockLight'])expect(shader.uniforms[name]).toBe(uniforms[name]);
   expect(shader.uniforms.uRockStrength.value).toBe(sourceStrength);
  }
  expect(uniforms.uStrataColor.value.map((v:T.Vector3)=>v.toArray())).toEqual(sourceStrata);
  expect(JSON.stringify(environment)).toBe(document);expect(kit.owned()).toEqual(owned);expect(material.customProgramCacheKey()).toBe(key);
 }finally{material.dispose();kit.dispose();}
});

it('uses the same village ground contract for public and saved environments without changing terrain buffers',()=>{
 const altered=JSON.parse(DISTRICT_ENVIRONMENT);altered.seed++;
 const keys:string[]=[];
 for(const environment of [DISTRICT_ENVIRONMENT,HOME_ENVIRONMENT,JSON.stringify(altered)]){
  const model=terrainModel(environment,[],{},'low',false,21.6),material=model.ground.material as T.MeshStandardMaterial;
  const attributes=Object.fromEntries(['position','normal','color','surface','cover'].map(name=>[name,Array.from(model.ground.geometry.getAttribute(name).array)]));
  try{
   const shader={uniforms:{} as Record<string,T.IUniform>,vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
   material.onBeforeCompile(shader as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
   expect(material.userData.village).toBe('ground');expect(shader.uniforms.uRadius.value).toBe(21.6);
   expect(shader.uniforms.uVlLooseN.value).toBeGreaterThan(0);
   expect(shader.fragmentShader).not.toContain('float artMeadow =');
   expect(model.object.getObjectByName('terrain:atmosphere')?.visible).toBe(false);
   keys.push(material.customProgramCacheKey());
   for(const [name,values]of Object.entries(attributes))expect(Array.from(model.ground.geometry.getAttribute(name).array)).toEqual(values);
  }finally{model.dispose();model.dispose();}
 }
 expect(new Set(keys).size).toBe(1);
});
