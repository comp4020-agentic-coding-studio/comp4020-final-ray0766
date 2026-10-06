import * as T from 'three';
import type { StageOptions } from '../assets/claude-geometry/shell/stage.ts';
import { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { PracticalLights } from '../assets/claude-geometry/style/practical.ts';
import { textureFormat } from './resource-policy.ts';

// Host-side presentation only. These are the existing defaults, not a new art direction.
// Do not import the Stage implementation here: its postprocessing stays lazy.
export const PRESENTATION = {
  renderer: { toneMapping: T.ACESFilmicToneMapping, outputColorSpace: T.SRGBColorSpace, worldExposure: 1.03, previewExposure: 1 },
  materials: { lod: 'medium', scans: true },
  practical: { lod: 'medium', enabled: true },
  ground: {
    hub: { fill: '#839bad', fillIntensity: .48, sun: '#e8bd99', sunIntensity: 2.35, environmentIntensity: .43, shadowExtent: 45, shadowFar: 180, fog: { color: '#665b60', density: .0033 } },
    garden: { fill: '#839aaf', fillIntensity: 1.1, sun: '#efd4b0', sunIntensity: 2.5, environmentIntensity: .5, shadowExtent: 16, shadowFar: 65, fog: { color: '#0f202b', near: 28, far: 65 } },
  },
  space: {
    background: '#040810', fog: { color: '#080e18', density: .00013 },
    pmremSigma: .08, environmentIntensity: .42,
    fill: { sky: '#7196b4', ground: '#070a0e', intensity: .5 },
    sun: { color: '#eedcca', intensity: 3.5, position: [-80, 130, 70] },
    rim: { color: '#587a9b', intensity: 1.3, position: [65, -20, -80] },
  },
} as const;

export type PreviewKind = 'workshop' | 'shipyard' | 'terrain' | 'history';
// Use Stage's existing material, PMREM/HDRI, light-pool and post-chain lifecycle.
// Medium LOD has no bloom/GTAO. Do not enable high LOD just to change the look.
export function previewOptions(kind: PreviewKind, container: HTMLElement): StageOptions {
  return {
    container, lod: PRESENTATION.materials.lod, scans: PRESENTATION.materials.scans,
    textures: textureFormat(), mood: kind === 'workshop' || kind === 'shipyard' ? 'hangar' : 'dusk',
    environment: 'procedural', practicalLights: PRESENTATION.practical.enabled,
    backdrop: false, fog: null, fov: 44,
    ...(kind === 'workshop' ? { ambientOcclusion: false, background: '#151e24' } : {}),
  };
}

export function configureRenderer(renderer: Pick<T.WebGLRenderer, 'toneMapping' | 'toneMappingExposure' | 'outputColorSpace'>, view: 'world' | 'preview') {
  renderer.toneMapping = PRESENTATION.renderer.toneMapping;
  renderer.outputColorSpace = PRESENTATION.renderer.outputColorSpace;
  renderer.toneMappingExposure = view === 'world' ? PRESENTATION.renderer.worldExposure : PRESENTATION.renderer.previewExposure;
}
export const createWorldStyleLibrary = () => new StyleLibrary(PRESENTATION.materials.lod, { scans: PRESENTATION.materials.scans && typeof document !== 'undefined' });
export const createWorldPracticalLights = () => new PracticalLights(PRESENTATION.practical.lod, { enabled: PRESENTATION.practical.enabled });
export const groundPresentation = (planetId: string) => PRESENTATION.ground[planetId === 'hub' ? 'hub' : 'garden'];

export function configureGroundLighting(planetId: string, scene: T.Scene, fill: T.AmbientLight, sun: T.DirectionalLight) {
  const look = groundPresentation(planetId);
  scene.fog = 'density' in look.fog ? new T.FogExp2(look.fog.color, look.fog.density) : new T.Fog(look.fog.color, look.fog.near, look.fog.far);
  fill.color.set(look.fill); fill.intensity = look.fillIntensity;
  sun.color.set(look.sun); sun.intensity = look.sunIntensity;
  Object.assign(sun.shadow.camera, { left: -look.shadowExtent, right: look.shadowExtent, top: look.shadowExtent, bottom: -look.shadowExtent, far: look.shadowFar });
  sun.shadow.camera.updateProjectionMatrix();
  scene.environmentIntensity = look.environmentIntensity;
}
