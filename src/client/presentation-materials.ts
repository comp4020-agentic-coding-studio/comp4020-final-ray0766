import type { MeshStandardMaterialParameters, MeshPhysicalMaterialParameters } from 'three';
import {ART_PALETTE} from './art-profile.ts';

// Main-owned village surfaces. Slot names stay stable for the existing scenery;
// shapes, texture drawing and resource ownership remain in the factories.
export const HARBOUR_SURFACES = {
  concrete: { color: ART_PALETTE.stone, metalness: 0, roughness: .92 },
  pale: { color: ART_PALETTE.cream, metalness: 0, roughness: .88 },
  metal: { color: ART_PALETTE.iron, metalness: .03, roughness: .84 },
  dark: { color: ART_PALETTE.wood, metalness: 0, roughness: .9 },
  copper: { color: ART_PALETTE.clay, metalness: 0, roughness: .9 },
  road: { color: '#8e968e', metalness: 0, roughness: .94 },
  edge: { color: '#b9ad8c', metalness: 0, roughness: .92 },
} as const satisfies Record<string, MeshStandardMaterialParameters>;
export const HARBOUR_ACCENTS = {
  cyan: { color: '#326e68', emissive: '#a8eadb', emissiveIntensity: .3, roughness: .8 },
  amber: { color: '#ffd08a', emissive: '#ffd08a', emissiveIntensity: .35, roughness: .8 },
  glass: { color: '#3f5a5e', metalness: 0, roughness: .35, transparent: true, opacity: .88, clearcoat: 0 },
  facade: { emissive: '#ffd08a', emissiveIntensity: .5, metalness: 0, roughness: .88 },
} as const satisfies Record<string, MeshPhysicalMaterialParameters>;
export const HARBOUR_GRAIN = { anisotropy: 4, bumpScale: 0 } as const;
export const COURIER_LOOK = {
  coats: { clay: '#d76c42', fern: '#537a62', sky: '#6687a0' },
  neighbours: { mica: '#d79a4a', sol: '#86a06a' },
  surface: { metalness: 0, roughness: .88 },
  visor: { color: '#4f6e78', metalness: 0, roughness: 1, clearcoat: 0 },
} as const;
