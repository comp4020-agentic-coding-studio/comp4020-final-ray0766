import type { BlueprintId } from '../assets/claude-geometry/core/ids.ts';
import type { Blueprint, PartPlacement, Rot } from './blueprint-model.ts';
import { PARTS } from './blueprint-parts.ts';
import { surveyPost } from '../assets/claude-geometry/blueprint/samples.ts';
import { defaultEnvironment, encodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { HOME_INFRASTRUCTURE, homeVariant } from './home-layout.ts';
import type { HomeVariant } from './home-layout.ts';
import type { BuildKind } from './planets.ts';

// A new district may choose its ground; a stored home keeps its own document.
// Lower outcrop frequency makes the meadow read as a few quiet landforms.
const environment = defaultEnvironment('temperate', 20261008);
Object.assign(environment.params, { relief: .48, roughness: .10, vegetation: .64, waterLevel: -.3, woodland: .18, outcrops: .14 });
export const DISTRICT_ENVIRONMENT = encodeEnvironment(environment);
const shortStreetEnvironment = structuredClone(environment);
shortStreetEnvironment.seed = 20261015;
Object.assign(shortStreetEnvironment.params, { relief: .3, roughness: .05 });
export const SHORT_STREET_ENVIRONMENT = encodeEnvironment(shortStreetEnvironment);

/** Compact remodels never rewrite a stored home or a legacy variant. All four
 * retain the original pivot and durable door; the base retains its house core.
 * `reflected` records which side of the authored street the home occupies. */
export function districtHome(kind: HomeVariant = 'starter', reflected = false): Blueprint {
  const blueprint: Blueprint = homeVariant(kind === 'extension' ? 'starter' : kind);
  blueprint.id = '874be419-4763-4c8f-a581-cd7f44df0400' as BlueprintId;
  blueprint.name = ({ starter: 'Home · short-street cottage', terrace: 'Home · short-street terrace',
    roof: 'Home · short-street courtyard roof', extension: 'Home · short-street reading room' })[kind];
  if (kind === 'terrace') blueprint.parts = blueprint.parts.filter(part => part.n !== 342).map(part => ({ ...part,
    z: part.z === 4 && (part.part === 'rail.guard' || part.part === 'garden.pot') ? 3 : part.z }));
  blueprint.parts.find(part => part.part === 'step.entry')!.z = 3;
  blueprint.parts = blueprint.parts.filter(part => {
    if (part.x === 0 || part.x === 4) return false;
    if (part.z === 0 || part.z === 4) return false;
    if (part.part === 'street.paving') return part.z === 3 && (part.x === 1 || part.x === 3);
    return true;
  });
  if (kind === 'extension') {
    // A one-cell reading bay grows along the facade toward the street's far
    // end. It never spends the shared street or the garden-turning space.
    const edge = reflected ? 1 : 3, x = reflected ? 0 : 4, outward: Rot = reflected ? 3 : 1;
    blueprint.parts = blueprint.parts.filter(part => !(PARTS[part.part].role === 'wall'
      && part.x === edge && part.z === 2 && part.rot === outward && part.level === 0));
    // A small side landing keeps the footprint centre (and portal) unchanged.
    blueprint.parts.push(homeVariant('starter').parts.find(part => part.part === 'street.paving'
      && part.x === (reflected ? 4 : 0) && part.z === 2)!);
    let n = 400;
    const add = (part: PartPlacement['part'], rot: Rot = 0, level = 0) =>
      blueprint.parts.push({ n: n++, part, x, z: 2, rot, level });
    add('floor.deck'); add('wall.window'); add('wall.window', outward); add('wall.solid', 2);
    add('roof.slope', 0, 1); add('structure.column', reflected ? 3 : 0); add('structure.column', reflected ? 2 : 1);
    add('furniture.shelf', outward);
  }
  return blueprint;
}

/** A narrow, two-storey workshop with a real exterior stair and open shopfront.
 * Every member is an ordinary editable catalogue part, including the balcony.
 * There is no second portal or hidden room behind this building. */
export function districtWorkshop(): Blueprint {
  const source = surveyPost();
  const parts: PartPlacement[] = source.parts.filter(p => p.part !== 'wall.door' && p.part !== 'roof.plant');
  parts.find(p => p.part === 'wall.window' && p.x === 2 && p.z === 2 && p.level === 0 && p.rot === 0)!.part = 'wall.solid';
  let next = Math.max(...parts.map(p => p.n)) + 1;
  const add = (part: PartPlacement['part'], x: number, z: number, rot: PartPlacement['rot'] = 0, level = 0) => parts.push({ n: next++, part, x, z, rot, level });
  add('step.entry', 3, 3);
  add('structure.column', 3, 2, 3); add('structure.column', 3, 2);
  add('structure.beam', 3, 2);
  add('street.paving', 2, 3); add('street.paving', 4, 3);
  add('furniture.sideboard', 2, 1, 2);
  add('storage.crates', 4, 1, 1);
  add('light.wall', 2, 1, 3);
  add('sign.cup', 2, 2);
  return { id: '874be419-4763-4c8f-a581-cd7f44df0401' as BlueprintId, name: 'Neighbourhood · stair workshop', parts, groups: [] };
}

/** The new street keeps the same 79-piece allowance. One decorative paving
 * tile becomes a real entrance step below the exterior stair, whose spherical
 * foundation otherwise leaves its first landing too high for a normal step. */
export function districtWorkshopWithEntryStep(): Blueprint {
  const blueprint = districtWorkshop();
  const landing = blueprint.parts.find(part => part.part === 'street.paving' && part.x === 2 && part.z === 3)!;
  Object.assign(landing, { part: 'step.entry', x: 0, z: 0, rot: 2 });
  return blueprint;
}

/** Reflect the editable grid composition, including vertex mounts. Merely
 * reflecting its world anchor would put an asymmetric stair/door on the wrong
 * side of the street. Individual catalogue geometry keeps its normal form. */
function reflectedBlueprint(blueprint: Blueprint): Blueprint {
  return { ...blueprint, parts: blueprint.parts.map(part => ({ ...part, x: 4 - part.x,
    rot: ((PARTS[part.part].mount === 'vertex' ? 7 : 4) - part.rot) % 4 as Rot })) };
}

export interface DistrictSitePlan { role: 'home' | 'workshop' | 'pavilion' | 'court'; x: number; z: number; rotation: number; blueprint: Blueprint }
export interface DistrictSceneryPlan { kind: BuildKind; x: number; z: number; rotation: number }
export interface DistrictPlan {
  prototype: 'offset-court' | 'long-court' | 'garden-court';
  reflected: boolean;
  sites: DistrictSitePlan[];
  /** The shared spine is navigation geometry, never an invisible rendered road. */
  spine: [number, number][];
  scenery: DistrictSceneryPlan[];
}

/** Six bounded compositions: three authored courts and their reflections.
 * Randomness selects a whole composition and small planting alternatives;
 * it cannot remove a destination, spin a facade away or scatter furniture. */
export function districtPlan(seed: number, attempt = 0): DistrictPlan {
  const variant = (seed + attempt) % 3, reflected = ((seed >>> 2) & 1) === 1;
  const side = reflected ? -1 : 1;
  const variants = [
    { name: 'offset-court' as const, home: [-2.2, -7.2], workshop: [2.7, -8.3], pavilion: [-.5, -13.5], court: [-3.6, -1.3] },
    { name: 'long-court' as const, home: [-2.2, -7.2], workshop: [2.7, -8.3], pavilion: [-.5, -13.6], court: [-3.6, -1.3] },
    { name: 'garden-court' as const, home: [-2.2, -7.2], workshop: [2.7, -8.3], pavilion: [-.5, -13.4], court: [-3.6, -1.3] },
  ];
  const selected = variants[variant];
  const sites: DistrictSitePlan[] = [
    { role: 'home', x: selected.home[0], z: selected.home[1], rotation: Math.PI / 2, blueprint: districtHome() },
    { role: 'workshop', x: selected.workshop[0], z: selected.workshop[1], rotation: Math.PI * 1.5, blueprint: districtWorkshopWithEntryStep() },
    { role: 'pavilion', x: selected.pavilion[0], z: selected.pavilion[1], rotation: 0, blueprint: structuredClone(HOME_INFRASTRUCTURE[0]) },
    { role: 'court', x: selected.court[0], z: selected.court[1], rotation: Math.PI, blueprint: structuredClone(HOME_INFRASTRUCTURE[1]) },
  ].map(site => ({ ...site, x: site.x * side,
    blueprint: reflected && site.role !== 'home' ? reflectedBlueprint(site.blueprint) : site.blueprint,
    rotation: reflected ? (2 * Math.PI - site.rotation) % (2 * Math.PI) : site.rotation })) as DistrictSitePlan[];
  const scenery: DistrictSceneryPlan[] = [];
  const add = (kind: BuildKind, x: number, z: number, rotation = 0) => scenery.push({ kind, x: x * side, z, rotation: reflected ? (2 * Math.PI - rotation) % (2 * Math.PI) : rotation });
  // Three planting groups establish a foreground, the home edge and a rear
  // backdrop. The middle of the court and the landing approach stay empty.
  for (const [x, z] of [[-6.8, .7], [-7.4, -1.2], [-6.5, -3], [-5.9, -6], [-6.4, -8], [-5.8, -10],
    [6.8, -5.9], [7.2, -8], [7.0, -10], [5.9, -12], [-3.6, -15], [-2, -16.8], [2.1, -16.8], [3.8, -15]]) add('tree', x, z);
  for (const [x, z] of [[-2.2, 1.6], [2.5, -3.2], [-6.4, 1.8], [3.8, .6]]) add('flowers', x, z);
  // Bench fronts face the shared lane; neither bench is a random lone prop.
  add('bench', 1.9, .8, Math.PI * 1.5); add('bench', 3.5, -14.5);
  add('lamp', 1.5, -3.9); add('lamp', -1.4, -10.9);
  // Reserve the inhabited details before filling tree groups. Long routes
  // must not silently spend every remaining object on trees and omit seats.
  const trees = scenery.splice(0, 14), detail = scenery.splice(0);
  const groups = (seed & 2) ? [6, 7, 0, 1, 10, 11] : [0, 1, 6, 7, 10, 11];
  scenery.push(detail[4], detail[5], detail[6], detail[0], ...groups.map(index => trees[index]),
    ...detail.filter((_, index) => ![0, 4, 5, 6].includes(index)),
    ...trees.filter((_, index) => !groups.includes(index)));
  return { prototype: selected.name, reflected, sites, spine: [[0, 0], [0, -3], [0, -5.3], [0, -7.2], [0, -10.9]], scenery };
}
