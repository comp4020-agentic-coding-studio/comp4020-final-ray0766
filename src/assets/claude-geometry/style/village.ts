import type * as T from 'three';
import type { StyleLibrary } from './materials.ts';

// Shared helpers for the village look's models (blueprint parts, props, ships).

/** Flat ground surfaces: crease lines but no ink shell (src/style/ink.ts), whose outline would only be the ground's. */
export const VILLAGE_GROUND: ReadonlySet<string> = new Set(['village:cobble', 'village:lane', 'village:line']);

/** The village look's lantern glass colour. */
export const VILLAGE_LAMP = '#ffd08a';

/**
 * A village material by key ('village:plaster', 'village:timber' …): flat
 * painted colour, its colour taken from the look's table (look.ts VILLAGE);
 * iron takes the metal finish. Shared and cached by the library.
 */
export function villageMaterial(lib: StyleLibrary, key: string): T.MeshStandardMaterial {
  const m = lib.custom(key, { finish: key === 'village:iron' ? 'metal' : 'paint', pattern: 'plain', color: '#ffffff' });
  if (VILLAGE_GROUND.has(key)) m.userData.inkShell = false;
  return m;
}
