import {MeshStandardMaterial,Vector3} from 'three';

export const TERRAIN_ART_VERSION='little-worlds/terrain-art-1';

/** Keep the terrain's actual colour, rock, shore and water masks. Only reduce
 * high-frequency rendering detail: it competed with the small buildings when
 * the camera pulled back. No new textures, geometry, passes or owned resources. */
export function applyTerrainArt(material:MeshStandardMaterial,options:{districtMeadow?:boolean}={}):void {
 const profile=`${TERRAIN_ART_VERSION}|${options.districtMeadow?'district-meadow-1':'biome'}`;
 if(material.userData.terrainArt===profile)return;
 const strata=material.userData.uniforms?.uStrataColor?.value as Vector3[]|undefined;
 const count=material.userData.uniforms?.uStrataCount?.value as number|undefined;
 if(!strata?.length||!count)throw new Error('Terrain art requires the ground strata contract.');
 const rockMean=new Vector3();
 for(let i=0;i<count;i++)rockMean.add(strata[i]);
 rockMean.multiplyScalar(1/count);
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=(shader,renderer)=>{
  before.call(material,shader,renderer);
  shader.uniforms.uArtRockMean={value:rockMean};
  // These are already private per-program copies made by the terrain look.
  for(const name of ['uRockStrength','uGrainStrength','uTurfStrength']){
   const uniform=shader.uniforms[name];
   if(uniform)shader.uniforms[name]={value:uniform.value*.16};
  }
  const replace=(source:string,target:string)=>{
   if(!shader.fragmentShader.includes(source))throw new Error(`Terrain art shader contract changed: ${source}`);
   shader.fragmentShader=shader.fragmentShader.replace(source,target);
  };
  replace('uniform vec3 uStrataColor[12];','uniform vec3 uArtRockMean;\n      uniform vec3 uStrataColor[12];');
  // A meadow retains the broad sphere lighting; cliffs retain their field
  // normals. A rough normal map must not turn every grass triangle into rock.
  replace('vec3 gN = normalize(vTriNormal);',`float artLoose = 1.0 - smoothstep(0.25, 0.70, vSurface.x);
        vec3 gN = normalize(mix(vTriNormal, normalize(vRadialW), artLoose * 0.55));`);
  replace('smoothstep(0.42, 0.58, vSurface.x + (hRock - 0.5) * 0.7)',
   'smoothstep(0.55, 0.82, vSurface.x)');
  replace('strataColor(hNow + (hRock - 0.5) * 0.03 + (macro - 0.5) * 0.06) * (0.62 + 0.62 * hRock)',
   'mix(uArtRockMean, strataColor(hNow), 0.18) * (0.97 + 0.06 * hRock)');
  replace('(0.84 + 0.32 * hGrain)','(0.98 + 0.04 * hGrain)');
  replace('(0.86 + 0.28 * macro)','(0.97 + 0.06 * macro)');
  // Remove the yellow cast of the vendor grade without replacing the colour
  // chosen by the environment document (including non-temperate biomes).
  replace('diffuseColor.rgb *= vec3(1.0400, 1.0000, 0.9000);',
   'diffuseColor.rgb *= vec3(1.0000, 1.0200, 1.0200);');
  if(options.districtMeadow){
   // The authored district's meadow separates from its pale paths and walls.
   // Retain the existing patch colours, rock, shore/wet and special masks;
   // this is not a replacement ground colour or a grade for other documents.
   replace('#include <lights_physical_fragment>',`float artMeadow = clamp(vCover, 0.0, 1.0) * (1.0 - rockW) * (1.0 - wet) * (1.0 - special);
    float artMeadowL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 artMeadowColour = max(mix(vec3(artMeadowL), diffuseColor.rgb, 1.18), vec3(0.0));
    artMeadowColour = pow(artMeadowColour, vec3(0.96)) * vec3(1.04, 1.25, 1.04);
    diffuseColor.rgb = mix(diffuseColor.rgb, artMeadowColour, artMeadow);
    #include <lights_physical_fragment>`);
  }
 };
 material.customProgramCacheKey=()=>`${key.call(material)}|${profile}`;
 material.userData.terrainArt=profile;material.needsUpdate=true;
}
