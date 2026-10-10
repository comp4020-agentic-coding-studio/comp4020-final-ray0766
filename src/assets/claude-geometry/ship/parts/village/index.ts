import type { Ctx } from '../../kit.ts';
import type { Category } from '../../spec.ts';
import { VILLAGE_COCKPITS } from './cockpits.ts';
import { VILLAGE_DORSALS } from './dorsals.ts';
import { VILLAGE_ENGINES } from './engines.ts';
import { VILLAGE_HULLS } from './hulls.ts';
import { VILLAGE_TAILS } from './tails.ts';
import { VILLAGE_WINGS } from './wings.ts';

// Village models for the Courier's six parts (docs/VILLAGE.md): a rounded
// little mail flyer instead of a faceted gunship. Each part keeps its
// industrial twin's plug, mount surfaces and anchors: the hull's flat deck at
// y = 0.28 and flat sides at x = 0.42 where wings, engines and the decal sit,
// its aft face at z = 1.75 and nose tip at z −2.39; the wing-tip and fin-tip
// light points, the nozzle exits and their radius. Surfaces are smooth (shared
// vertex normals) so the stepped light reads them as rounded paint, and
// detail is a few friendly features (portholes, a cheat line, a bubble
// canopy, ball-tipped mast), not hardware. Drawn for the look's lines: small
// features are painted flush rather than built proud, round pieces have eight
// or more sides, and glass is an opaque tone with nothing behind it.

/** The village look's builders, by category and part id; the factory falls back to the industrial ones. */
export const VILLAGE_SHIP_BUILDERS: Partial<Record<Category, Record<string, (ctx: Ctx) => void>>> = {
  hull: VILLAGE_HULLS,
  cockpit: VILLAGE_COCKPITS,
  wings: VILLAGE_WINGS,
  engines: VILLAGE_ENGINES,
  tail: VILLAGE_TAILS,
  dorsal: VILLAGE_DORSALS,
};

/** What each part is in the village look. */
export const VILLAGE_SHIP_NAMES: Record<string, string> = Object.fromEntries(Object.entries(villageInfo()).map(([id, i]) => [id, i.name]));

/**
 * Name and tile line of each part in the village look, by part id. Figures
 * quoted are the village models' own (lengths, spans and the twin and heavy
 * engines' diameters are checked against them as the industrial tiles are);
 * the pod cluster's pods are 0.24 m where the industrial ones are 0.2 m.
 */
export function villageInfo(): Record<string, { name: string; spec: string }> {
  return {
    'slim-courier': { name: 'Rounded courier', spec: '4.2 m · rounded monocoque · portholes' },
    'boxy-hauler': { name: 'Parcel van', spec: '4.0 m · round nose · cargo door' },
    'wedge-interceptor': { name: 'Soft racer', spec: '4.1 m · soft wedge · round belly' },
    'faceted-canopy': { name: 'Bubble canopy', spec: 'Tinted bubble · painted bow' },
    'slit-visor': { name: 'Lookout dome', spec: 'Round cupola · 60 mm slit' },
    'raised-bridge': { name: 'Wheelhouse', spec: 'Glazed cabin · curved roof' },
    swept: { name: 'Round wings', spec: '1.1 m span · tip pods' },
    delta: { name: 'Manta delta', spec: '1.15 m span · elevons · fence' },
    'stub-pylon': { name: 'Mail stubs', spec: '0.8 m span · 2 mail canisters' },
    'twin-nacelle': { name: 'Round pods', spec: '2 × 0.34 m · teardrop pods' },
    'single-heavy': { name: 'Bell engine', spec: '0.66 m bell · rolled lip' },
    'pod-cluster': { name: 'Drop pods', spec: '3 × 0.24 m pods · round plate' },
    'single-fin': { name: 'D fin', spec: 'Painted tip · strobe' },
    'twin-fin': { name: 'Round twin fins', spec: '2 fins · 12° cant' },
    'v-tail': { name: 'Butterfly V', spec: '2 fins · 40° from vertical' },
    none: { name: 'None', spec: 'Clean deck' },
    'sensor-mast': { name: 'Ball mast', spec: 'Mast · ball top · pennant' },
    'comms-dish': { name: 'Fork dish', spec: 'Round dish · fork mount' },
  };
}
