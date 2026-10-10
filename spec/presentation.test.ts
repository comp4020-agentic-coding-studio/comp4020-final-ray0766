import {expect,it,vi} from 'vitest';
import * as T from 'three';
import {configureRenderer,configureGroundLighting,previewOptions,createWorldStyleLibrary,createWorldPracticalLights} from '../src/client/presentation.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {ART_LIGHT} from '../src/client/art-profile.ts';

it('resets every ground lighting input across garden → harbour → garden without changing scene transforms',()=>{
 const scene=new T.Scene(),fill=new T.AmbientLight(),sun=new T.DirectionalLight(),texture=new T.Texture();scene.environment=texture;sun.position.set(3,11,7);sun.shadow.bias=-.0003;
 configureGroundLighting('little-47',scene,fill,sun);
 const garden={fog:scene.fog!.toJSON(),fill:fill.color.getHexString(),sun:sun.color.getHexString(),projection:sun.shadow.camera.projectionMatrix.toArray()};
 configureGroundLighting('hub',scene,fill,sun);expect(scene.fog).toHaveProperty('isFogExp2',true);expect([fill.intensity,sun.intensity,scene.environmentIntensity,sun.shadow.camera.far]).toEqual([ART_LIGHT.fillIntensity,ART_LIGHT.sunIntensity,ART_LIGHT.environmentIntensity,75]);
 configureGroundLighting('little-68',scene,fill,sun);expect({fog:scene.fog!.toJSON(),fill:fill.color.getHexString(),sun:sun.color.getHexString(),projection:sun.shadow.camera.projectionMatrix.toArray()}).toEqual(garden);
 expect([fill.intensity,sun.intensity,scene.environmentIntensity,sun.shadow.camera.far]).toEqual([ART_LIGHT.fillIntensity,ART_LIGHT.sunIntensity,ART_LIGHT.environmentIntensity,65]);expect(scene.environment).toBe(texture);expect(sun.position.toArray()).toEqual([3,11,7]);expect(sun.shadow.bias).toBe(-.0003);texture.dispose();
});
it('keeps the village world and preview appearance consistent and reuses bounded Stage options including texture diagnostics',()=>{
 const renderer={toneMapping:T.NeutralToneMapping,toneMappingExposure:9,outputColorSpace:T.LinearSRGBColorSpace};configureRenderer(renderer,'world');expect(renderer).toEqual({toneMapping:T.NoToneMapping,toneMappingExposure:1,outputColorSpace:T.SRGBColorSpace});configureRenderer(renderer,'preview');expect(renderer.toneMappingExposure).toBe(1);
 vi.stubGlobal('location',{search:''});
 try{for(const kind of ['workshop','shipyard','terrain','history'] as const){const options=previewOptions(kind,{} as HTMLElement);expect(options.lod).toBe('medium');expect(options.environment).toBe('procedural');expect(options.textures).toBe('webp');expect(options.fog).toBeNull();expect(options.backdrop).toBe(false);expect(options.planet).toBe(kind==='terrain'||kind==='history');expect(options.practicalLights).toBe(false);expect(options.scans).toBe(false);expect(options.look).toBe('village');expect(options.fov).toBe(44);expect(options.mood).toBe(kind==='workshop'||kind==='shipyard'?'hangar':'dusk');expect(options.background).toBe('#efe6d2');}
 vi.stubGlobal('location',{search:'?textures=ktx2'});expect(previewOptions('history',{} as HTMLElement).textures).toBe('ktx2');
 }finally{vi.unstubAllGlobals();}
});
it('uses the existing shared kit material and fitting pool lifecycle without creating per-building lights',()=>{
 const library=createWorldStyleLibrary(),pool=createWorldPracticalLights(),a=buildBlueprintModel(industrialCabin(),library,'medium'),b=buildBlueprintModel(industrialCabin(),library,'medium');
 try{expect(library.lod).toBe('medium');expect(pool.stats().slots).toEqual({spots:2,points:2,shadows:0});expect(pool.isEnabled).toBe(false);expect(pool.group.visible).toBe(false);const shared=library.preset('frame');let released=0;shared.addEventListener('dispose',()=>released++);a.dispose();expect(released).toBe(0);expect(library.preset('frame')).toBe(shared);expect(b.object.userData.emitters.length).toBeGreaterThan(0);expect(b.object.children.some(o=>(o as T.Light).isLight)).toBe(false);
 }finally{a.dispose();b.dispose();pool.dispose();library.dispose();}
});
