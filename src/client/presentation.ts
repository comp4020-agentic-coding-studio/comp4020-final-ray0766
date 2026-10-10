import * as T from 'three';
import type { StageOptions } from '../assets/claude-geometry/shell/stage.ts';
import { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { PracticalLights } from '../assets/claude-geometry/style/practical.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';
import { textureFormat } from './resource-policy.ts';
import {HOME_SAMPLE_RADIUS} from '../shared/home.ts';
import {adaptArtLibrary,ART_LIGHT,ART_PALETTE} from './art-profile.ts';

// Every host scene opts into the same village look; library defaults stay industrial.
// Do not import the Stage implementation here: its postprocessing stays lazy.
export const PRESENTATION = {
  renderer: { toneMapping: T.NoToneMapping, outputColorSpace: T.SRGBColorSpace, worldExposure: 1, previewExposure: 1 },
  materials: { lod: 'medium', scans: false, look: 'village' },
  practical: { lod: 'medium', enabled: false },
  ground: {
    hub: { ...ART_LIGHT, shadowExtent: 18, shadowFar: 75, fog: { color: ART_PALETTE.fog, density: .0033 } },
    garden: { ...ART_LIGHT, shadowExtent: 16, shadowFar: 65, fog: { color: ART_PALETTE.fog, near: 28, far: 65 } },
    sample: { ...ART_LIGHT, shadowExtent: 20, shadowFar: 80, fog: { color: ART_PALETTE.fog, near: 30, far: 78 } },
  },
  space: {
    background: VILLAGE.cloudSky!.light, fog: { color: VILLAGE.fog, density: .00013 },
    pmremSigma: .08, environmentIntensity: VILLAGE.envIntensity,
    fill: { sky: VILLAGE.light.sky, ground: VILLAGE.light.ground, intensity: VILLAGE.light.fillIntensity },
    sun: { color: VILLAGE.light.key, intensity: VILLAGE.light.keyIntensity, position: [-80, 130, 70] },
    rim: { color: VILLAGE.light.rim, intensity: VILLAGE.light.rimIntensity, position: [65, -20, -80] },
  },
} as const;

export type PreviewKind = 'workshop' | 'shipyard' | 'terrain' | 'history';
// Use Stage's existing material, PMREM/HDRI, light-pool and post-chain lifecycle.
// Medium LOD has no bloom/GTAO. Do not enable high LOD just to change the look.
export function previewOptions(kind: PreviewKind, container: HTMLElement): StageOptions {
  return {
    container, lod: PRESENTATION.materials.lod, scans: PRESENTATION.materials.scans, look: PRESENTATION.materials.look,
    textures: textureFormat(), mood: kind === 'workshop' || kind === 'shipyard' ? 'hangar' : 'dusk',
    environment: 'procedural', practicalLights: PRESENTATION.practical.enabled,
    backdrop: false, planet: kind === 'terrain' || kind === 'history', fog: null, fov: 44, ambientOcclusion: false, background: VILLAGE.thumbnail,
  };
}

export function configureRenderer(renderer: Pick<T.WebGLRenderer, 'toneMapping' | 'toneMappingExposure' | 'outputColorSpace'>, view: 'world' | 'preview') {
  renderer.toneMapping = PRESENTATION.renderer.toneMapping;
  renderer.outputColorSpace = PRESENTATION.renderer.outputColorSpace;
  renderer.toneMappingExposure = view === 'world' ? PRESENTATION.renderer.worldExposure : PRESENTATION.renderer.previewExposure;
}
export const createWorldStyleLibrary = () => adaptArtLibrary(new StyleLibrary(PRESENTATION.materials.lod, { scans: PRESENTATION.materials.scans, look: PRESENTATION.materials.look }));
export const createWorldPracticalLights = () => {
  const pool=new PracticalLights(PRESENTATION.practical.lod, { enabled: PRESENTATION.practical.enabled, scale: VILLAGE.practical });
  pool.group.visible=false;
  return pool;
};
export const groundPresentation = (planetId: string,radius=0) => Math.abs(radius-HOME_SAMPLE_RADIUS)<1e-6?PRESENTATION.ground.sample:PRESENTATION.ground[planetId === 'hub' ? 'hub' : 'garden'];

/** Follow the actual camera through the overview transition, including its
 * return to walking. The mode flag changes before the camera finishes moving. */
export function updateGroundFog(scene: T.Scene, planetId: string, radius: number, cameraRadius: number) {
  const preset = groundPresentation(planetId, radius).fog;
  if (!(scene.fog instanceof T.Fog) || !('near' in preset)) return;
  const pullback = Math.max(0, cameraRadius - radius - 8);
  scene.fog.near = preset.near + pullback;
  scene.fog.far = preset.far + pullback;
}

export function configureGroundLighting(planetId: string, scene: T.Scene, fill: T.AmbientLight, sun: T.DirectionalLight,radius=0) {
  const look = groundPresentation(planetId,radius);
  scene.fog = 'density' in look.fog ? new T.FogExp2(look.fog.color, look.fog.density) : new T.Fog(look.fog.color, look.fog.near, look.fog.far);
  fill.color.set(look.fill); fill.intensity = look.fillIntensity;
  sun.color.set(look.sun); sun.intensity = look.sunIntensity;
  Object.assign(sun.shadow.camera, { left: -look.shadowExtent, right: look.shadowExtent, top: look.shadowExtent, bottom: -look.shadowExtent, far: look.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = ART_LIGHT.shadowRadius; sun.shadow.intensity = ART_LIGHT.shadowIntensity;
  scene.environmentIntensity = look.environmentIntensity;
}

const groundSunOffset=new T.Vector3();
/** A directional light depends on its direction, not its distance. Keep the
 * walking target midway through the existing shadow depth range. The old
 * 65 m rise plus tangent offset put the target 95 m away, beyond the 80 m far
 * plane, so nearby buildings could not cast a shadow onto the ground. */
export function fitGroundSunShadowDepth(sun:T.DirectionalLight){
 groundSunOffset.copy(sun.position).sub(sun.target.position);
 const distance=groundSunOffset.length();
 if(distance===0)return;
 const depth=(sun.shadow.camera.near+sun.shadow.camera.far)/2;
 sun.position.copy(sun.target.position).addScaledVector(groundSunOffset,depth/distance);
}

/** Same white key and fill as outdoors, fitted to the actual room dimensions. */
export function configureHomeLighting(scene:T.Scene,fill:T.HemisphereLight,sun:T.DirectionalLight,width:number,depth:number,height:number){
 scene.background=new T.Color(ART_LIGHT.roomBackground);
 fill.color.set(ART_LIGHT.fill);fill.groundColor.set(ART_LIGHT.roomGround);fill.intensity=ART_LIGHT.fillIntensity;
 sun.color.set(ART_LIGHT.sun);sun.intensity=ART_LIGHT.sunIntensity;sun.castShadow=true;
 const reach=Math.max(width,depth),extent=reach*.78+1;
 // Both visible walls receive a light band, while the key is offset from the
 // overview camera so furniture shadows emerge sideways instead of hiding
 // almost exactly behind their casters. Height and shadow depth stay fixed.
 sun.position.set(reach*.88,height+reach*.9,reach*.24);sun.target.position.set(0,0,0);
 Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.1,far:reach*3+height+5});
 sun.shadow.camera.updateProjectionMatrix();sun.shadow.radius=ART_LIGHT.shadowRadius;sun.shadow.intensity=ART_LIGHT.shadowIntensity;
 sun.shadow.normalBias=.018;sun.shadow.bias=-.00012;sun.shadow.mapSize.set(1024,1024);
 scene.environmentIntensity=ART_LIGHT.environmentIntensity;
}
