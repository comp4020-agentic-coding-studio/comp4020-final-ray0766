import type { MeshStandardMaterialParameters, MeshPhysicalMaterialParameters } from 'three';

// Main-project material inputs which vendor updates cannot change. Existing colours
// and finishes are preserved. Texture drawing and material ownership stay with the factories.
export const HARBOUR_SURFACES = {
  concrete: { color: '#5e646b', metalness: .08, roughness: .92 },
  pale: { color: '#899093', metalness: .3, roughness: .67 },
  metal: { color: '#46535e', metalness: .75, roughness: .46 },
  dark: { color: '#1b2935', metalness: .68, roughness: .54 },
  copper: { color: '#8e6550', metalness: .6, roughness: .57 },
  road: { color: '#3d454e', metalness: .08, roughness: .94 },
  edge: { color: '#222f3b', metalness: .5, roughness: .62 },
} as const satisfies Record<string, MeshStandardMaterialParameters>;
export const HARBOUR_ACCENTS = {
  cyan: { color: '#84bdc9', emissive: '#55a8bf', emissiveIntensity: .85, roughness: .44 },
  amber: { color: '#d9ad76', emissive: '#dca365', emissiveIntensity: .8, roughness: .54 },
  glass: { color: '#20394a', metalness: .45, roughness: .19, clearcoat: .8, clearcoatRoughness: .16 },
  facade: { emissive: '#efdbbf', emissiveIntensity: .8, metalness: .6, roughness: .28, bumpScale: .012 },
} as const satisfies Record<string, MeshPhysicalMaterialParameters>;
export const HARBOUR_GRAIN = { anisotropy: 4, bumpScale: .0035 } as const;
export const COURIER_LOOK = {
  coats: { clay: '#876247', fern: '#4e6a60', sky: '#4d6675' },
  neighbours: { mica: '#a17a48', sol: '#52766c' },
  surface: { metalness: .25, roughness: .65 },
  visor: { color: '#132c38', metalness: .55, roughness: .14, clearcoat: 1 },
} as const;
