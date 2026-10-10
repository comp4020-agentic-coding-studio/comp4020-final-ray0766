import type * as T from 'three';
import type { StyleLibrary } from './materials.ts';

// Shared helpers for the village look's models (blueprint parts, props, ships).

/** The village look's lantern glass colour. */
export const VILLAGE_LAMP = '#ffd08a';

/**
 * A village material by key ('village:plaster', 'village:timber' …): flat
 * painted colour, its colour taken from the look's table (look.ts VILLAGE);
 * iron takes the metal finish. Shared and cached by the library.
 */
export function villageMaterial(lib: StyleLibrary, key: string): T.MeshStandardMaterial {
  return lib.custom(key, { finish: key === 'village:iron' ? 'metal' : 'paint', pattern: 'plain', color: '#ffffff' });
}
