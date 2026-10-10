import * as T from 'three';
import {applyCel} from '../assets/claude-geometry/style/cel.ts';
import {applyHueKeep,applyMottle} from '../assets/claude-geometry/style/surface.ts';
import {VILLAGE} from '../assets/claude-geometry/style/look.ts';
import type {StyleLibrary} from '../assets/claude-geometry/style/materials.ts';

/** The host uses the new village drawing itself, including its original palette.
 * Saved paint names and user-selected colours keep their identity. */
export const ART_PROFILE_VERSION='little-worlds/village-14e244f';
export const ART_PALETTE={
 cream:VILLAGE.materials['village:plaster'],paper:VILLAGE.materials['village:plaster-in'],
 sage:VILLAGE.materials['village:paint'],leaf:VILLAGE.materials['village:leaf'],
 leafLight:VILLAGE.materials['village:leaf-light'],leafDark:VILLAGE.materials['village:leaf-dark'],
 clay:VILLAGE.materials['village:pot'],wood:VILLAGE.materials['village:timber'],
 boards:VILLAGE.materials['village:boards'],stone:VILLAGE.materials['village:stone'],
 paving:VILLAGE.materials['village:cobble'],iron:VILLAGE.materials['village:iron'],
 ink:VILLAGE.ink.dark,glass:VILLAGE.glass.clear.color,gold:VILLAGE.materials['village:brass'],
 fog:VILLAGE.fog,sky:VILLAGE.cloudSky!.light,sun:VILLAGE.light.key,
} as const;
export const ART_LIGHT={fill:VILLAGE.light.sky,sun:VILLAGE.light.key,
 sunIntensity:VILLAGE.light.keyIntensity,fillIntensity:VILLAGE.light.fillIntensity,
 shadowIntensity:VILLAGE.light.shadowIntensity,shadowRadius:VILLAGE.light.shadowRadius,
 environmentIntensity:VILLAGE.envIntensity,roomBackground:VILLAGE.thumbnail,roomGround:VILLAGE.light.ground} as const;
export const ART_INK={width:VILLAGE.edges!.width,lineOpacity:1} as const;

/** Host-owned surfaces use the same diffuse bands and stable tonal patches.
 * Existing vendor shader hooks, cover attributes, textures and ownership remain
 * intact. Object-space patches also stay fixed on the courier as it moves. */
export function applyArtMaterial<M extends T.MeshStandardMaterial>(material:M,role?:string):M {
 if(material.userData.artProfile===ART_PROFILE_VERSION)return material;
 if(role&&VILLAGE.materials[role])material.color.set(VILLAGE.materials[role]);
 applyCel(material,VILLAGE.cel!);
 material.envMapIntensity=VILLAGE.envIntensity;
 if(!material.transparent){
  applyMottle(material,VILLAGE.mottle!,'object');
  if(material.alphaTest>0)material.alphaToCoverage=true;
 }
 if(material.emissive.getHex()!==0)applyHueKeep(material);
 material.userData.artProfile=ART_PROFILE_VERSION;material.needsUpdate=true;
 return material;
}

/** The source library already owns the village palette, glazing, paints and
 * indoor twins. Do not replace those methods or apply a second colour grade. */
export function adaptArtLibrary(library:StyleLibrary):StyleLibrary {return library;}

export function applyArtToObject(root:T.Object3D){
 const seen=new Set<T.Material>();
 root.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(seen.has(material))continue;seen.add(material);
  if(material instanceof T.MeshStandardMaterial)applyArtMaterial(material);
 }});
}

export const HOME_ART_THEMES={warm:[ART_PALETTE.cream,ART_PALETTE.sage],sage:['#d5dfc8','#638678'],blue:['#d7e3e4','#70929e']} as const;
