import * as T from 'three';
import {applyCel} from '../assets/claude-geometry/style/cel.ts';
import {VILLAGE} from '../assets/claude-geometry/style/look.ts';
import type {StyleLibrary} from '../assets/claude-geometry/style/materials.ts';

/** Host-owned visual recipe. It never changes placement or saved colour names. */
export const ART_PROFILE_VERSION='little-worlds/art-2';
export const ART_PALETTE={
 cream:'#d7d7c8',paper:'#e5e2d5',sage:'#73958b',leaf:'#7e9e75',leafLight:'#a4b98c',leafDark:'#607f63',
 clay:'#b27a63',wood:'#645b4e',boards:'#9b8a6d',stone:'#aaa99a',paving:'#b9bbae',iron:'#414b48',
 ink:'#394d47',glass:'#48636a',gold:'#d7af70',fog:'#cfe2da',sky:'#d8e4e0',sun:'#fff7ed',
} as const;
export const ART_LIGHT={fill:ART_PALETTE.sky,sun:ART_PALETTE.sun,sunIntensity:2.4,fillIntensity:.85,
 shadowIntensity:.70,shadowRadius:2,environmentIntensity:.22,roomBackground:'#b8cec2',roomGround:'#b7a487'} as const;
export const ART_INK={width:.85,lineOpacity:.2} as const;

const ROLE_COLOURS:Record<string,string>={
 'village:plaster':ART_PALETTE.cream,'village:plaster-in':ART_PALETTE.paper,
 'village:timber':ART_PALETTE.wood,'village:boards':ART_PALETTE.boards,'village:iron':ART_PALETTE.iron,
 'village:stone':ART_PALETTE.stone,'village:cobble':ART_PALETTE.paving,'village:paint':ART_PALETTE.sage,
 'village:tile':ART_PALETTE.clay,'village:tile-dark':'#956854','village:line':ART_PALETTE.paper,
 'village:leaf':ART_PALETTE.leaf,'village:leaf-light':ART_PALETTE.leafLight,'village:leaf-dark':ART_PALETTE.leafDark,
 'village:bark':ART_PALETTE.wood,'village:pot':ART_PALETTE.clay,'village:brass':ART_PALETTE.gold,
 cladding:ART_PALETTE.cream,framePainted:ART_PALETTE.iron,sheet:ART_PALETTE.sage,deck:ART_PALETTE.boards,concrete:ART_PALETTE.stone,
};

/** Layer over a material's original compile hooks, including triplanar terrain
 * and the kit's cel shading. Preserve maps, alpha tests, vertex colours and ownership. */
export function applyArtMaterial<M extends T.MeshStandardMaterial>(material:M,role?:string):M {
 if(material.userData.artProfile===ART_PROFILE_VERSION)return material;
 if(role&&ROLE_COLOURS[role])material.color.set(ROLE_COLOURS[role]);
 if(!material.transparent){
  applyCel(material,VILLAGE.cel!);
  if(material.roughnessMap)material.roughness=1;
  if(!material.roughnessMap)material.roughness=Math.max(.84,material.roughness);
  material.metalness=Math.min(.18,material.metalness);
  material.envMapIntensity=Math.min(.24,material.envMapIntensity);
  // Existing renderer MSAA can smooth foliage cutout edges without a new pass.
  if(material.alphaTest>0)material.alphaToCoverage=true;
 }
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=(shader,renderer)=>{
  before.call(material,shader,renderer);
  // Cool reflected fill separates shade from warm lit faces; specular stays
  // small enough that cream plaster and wood retain their material colours.
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    reflectedLight.indirectDiffuse *= vec3(0.92, 0.99, 1.025);
    reflectedLight.directSpecular *= ${material.transparent?'0.7':'0.25'};
  `);
 };
 material.customProgramCacheKey=()=>`${key.call(material)}|${ART_PROFILE_VERSION}|${material.transparent?'glass':'matte'}`;
 material.userData.artProfile=ART_PROFILE_VERSION;material.needsUpdate=true;
 return material;
}

/** Adapt only this library instance. The immutable vendor and other library
 * instances keep their original palette, caches, leased paints and disposal. */
export function adaptArtLibrary(library:StyleLibrary):StyleLibrary {
 if(adapted.has(library)||library.look!=='village')return library;
 adapted.add(library);
 const custom=library.custom.bind(library),preset=library.preset.bind(library),ink=library.ink.bind(library);
 const paint=library.leasePaint.bind(library),glass=library.glass.bind(library),glow=library.createGlow.bind(library);
 library.custom=(key,recipe)=>applyArtMaterial(custom(key,recipe),key);
 library.preset=name=>applyArtMaterial(preset(name),name);
 library.leasePaint=(...args)=>{const lease=paint(...args);applyArtMaterial(lease.material);return lease;};
 library.glass=tint=>{const material=glass(tint);if(material.userData.artProfile!==ART_PROFILE_VERSION){material.color.set(ART_PALETTE.glass);material.roughness=Math.max(.4,material.roughness);}return applyArtMaterial(material);};
 library.createGlow=(...args)=>applyArtMaterial(glow(...args));
 library.ink=()=>{const value=ink();if(value){value.width=ART_INK.width;value.shell.color.set(ART_PALETTE.ink);value.lines.color.set(ART_PALETTE.ink);value.lines.opacity=ART_INK.lineOpacity;value.lines.transparent=true;}return value;};
 return library;
}
const adapted=new WeakSet<StyleLibrary>();

/** Real geometry may be shared; this pass touches material responses only. */
export function applyArtToObject(root:T.Object3D){
 const seen=new Set<T.Material>();
 root.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(seen.has(material))continue;seen.add(material);
  if(material instanceof T.MeshStandardMaterial)applyArtMaterial(material);
 }});
}

export const HOME_ART_THEMES={warm:[ART_PALETTE.cream,ART_PALETTE.sage],sage:['#d5dfc8','#638678'],blue:['#d7e3e4','#70929e']} as const;
