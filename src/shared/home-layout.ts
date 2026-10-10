import type { BlueprintId } from '../assets/claude-geometry/core/ids.ts';
import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import type { Blueprint, PartPlacement, Rot } from './blueprint-model.ts';
import type { PartId } from './blueprint-parts.ts';
import { defaultEnvironment, encodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { structureSize } from './blueprints.ts';
import { placementProblem } from './planets.ts';
import type { BuildKind, PlacedObject } from './planets.ts';
import { SPAWN } from './world.ts';
import type { Vec3 } from './world.ts';

/** Durable portal identity. Variants keep this number, grid cell and facing. */
export const HOME_DOOR_PART = 1;
export type HomeVariant = 'starter' | 'terrace' | 'roof' | 'extension';
export const HOME_VARIANTS: readonly HomeVariant[] = ['starter', 'terrace', 'roof', 'extension'];
const HOME_BLUEPRINT_ID = '6735c1dd-6f05-4d17-8643-26e5a8bfc501' as BlueprintId;

// One authored environment, not a seed picked at each login. Rendering,
// foundation seating and authoritative ground physics consume this same doc.
const environment = defaultEnvironment('temperate', 20261008);
Object.assign(environment.params, { relief: .6, roughness: .16, vegetation: .68, waterLevel: -.22, woodland: .58, outcrops: .46 });
export const HOME_ENVIRONMENT = encodeEnvironment(environment);

/** All four homes are ordinary kit compositions with the same 5×5 pivot. */
export function homeVariant(kind: HomeVariant): Blueprint {
  const parts: PartPlacement[] = [];
  const add = (n: number, part: PartId, x: number, z: number, rot: Rot = 0, level = 0) => parts.push({ n, part, x, z, rot, level });
  const left = kind === 'extension' ? 0 : 1;
  // Keep the whole court in every variant: a remodel cannot recenter the
  // house or its portal merely because its occupied bounds have changed.
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
    if (x === 2 && z === 4) continue;
    add(10 + x * 5 + z, x >= left && x <= 3 && z >= 1 && z <= 2 ? 'floor.deck' : 'street.paving', x, z);
  }
  add(35, 'step.entry', 2, 4);
  add(HOME_DOOR_PART, 'wall.door.open', 2, 2);
  for (let x = left; x <= 3; x++) {
    add(100 + x, x === 2 ? 'wall.solid' : 'wall.window', x, 1, 2);
    if (x !== 2) add(110 + x, x === 1 ? 'wall.solid' : 'wall.window', x, 2);
  }
  for (const z of [1, 2]) {
    add(120 + z, 'wall.window', left, z, 3);
    add(130 + z, 'wall.solid', 3, z, 1);
  }
  // Corner posts make the support legible, using the same structural parts
  // that remain available in the workshop.
  add(140, 'structure.column', left, 1, 2);
  add(141, 'structure.column', 3, 1, 1);
  add(142, 'structure.column', left, 2, 3);
  add(143, 'structure.column', 3, 2);
  for (let x = left; x <= 3; x++) for (const z of [1, 2]) {
    add(200 + x * 2 + z, kind === 'roof' ? 'roof.deck' : 'roof.slope', x, z, z === 1 ? 2 : 0, 1);
  }
  if (kind === 'roof') {
    for (let x = left; x <= 3; x++) {
      add(230 + x, 'roof.parapet', x, 1, 2, 1);
      add(240 + x, 'roof.parapet', x, 2, 0, 1);
    }
    for (const z of [1, 2]) {
      add(250 + z, 'roof.parapet', left, z, 3, 1);
      add(260 + z, 'roof.parapet', 3, z, 1, 1);
    }
  }
  add(300, 'furniture.table', 1, 1);
  add(301, 'furniture.chair', 1, 1, 2);
  add(302, 'furniture.sideboard', 3, 1, 1);
  add(303, 'light.wall', 2, 1, 2);
  add(304, 'sign.mail', 1, 3, 2);
  add(305, 'garden.bed', 4, 1);
  add(306, 'garden.pot', 4, 3, 1);
  add(307, 'garden.pot', 0, 4, 3);
  if (kind === 'terrace') {
    for (const x of [0, 1, 3, 4]) add(330 + x, 'rail.guard', x, 4);
    add(340, 'furniture.bench', 3, 3);
    add(341, 'garden.pot', 1, 4);
    add(342, 'garden.pot', 3, 4);
  } else add(340, 'furniture.bench', 4, 4);
  if (kind === 'extension') add(350, 'furniture.shelf', 0, 1, 2);
  const names: Record<HomeVariant, string> = {
    starter: 'Home · meadow cottage', terrace: 'Home · garden terrace', roof: 'Home · courtyard roof', extension: 'Home · reading room',
  };
  return { id: HOME_BLUEPRINT_ID, name: names[kind], parts, groups: [] };
}

export const starterHome = () => homeVariant('starter');

/** Open shelter: a visible destination, with no door or interior portal. */
function lookout(): Blueprint {
  const parts: PartPlacement[] = [];
  const add = (part: PartId, x: number, z: number, rot: Rot = 0, level = 0) => parts.push({ n: parts.length + 1, part, x, z, rot, level });
  for (const x of [1, 2]) for (const z of [1, 2]) add('floor.grate', x, z);
  add('structure.column', 1, 1, 2); add('structure.column', 2, 1, 1);
  add('structure.column', 1, 2, 3); add('structure.column', 2, 2);
  for (const x of [1, 2]) for (const z of [1, 2]) add('roof.slope', x, z, z === 1 ? 2 : 0, 1);
  add('rail.guard', 1, 1, 2); add('rail.guard', 2, 1, 2);
  add('furniture.bench', 1, 1);
  add('step.entry', 2, 3);
  return { id: '6735c1dd-6f05-4d17-8643-26e5a8bfc502' as BlueprintId, name: 'Meadow · open lookout', parts, groups: [] };
}

/** A small, walkable square; all stone, planting and seating are kit parts. */
function gardenSquare(): Blueprint {
  const parts: PartPlacement[] = [];
  const add = (part: PartId, x: number, z: number, rot: Rot = 0) => parts.push({ n: parts.length + 1, part, x, z, rot, level: 0 });
  for (const x of [1, 2, 3]) for (const z of [1, 2, 3]) add('street.paving', x, z);
  add('garden.tree', 1, 1); add('garden.bed', 3, 1); add('furniture.bench', 2, 1);
  add('garden.pot', 1, 3, 3); add('garden.pot', 3, 3, 1);
  return { id: '6735c1dd-6f05-4d17-8643-26e5a8bfc503' as BlueprintId, name: 'Meadow · orchard square', parts, groups: [] };
}

export interface HomeManifestSite { blueprint: Blueprint; position: Vec3; rotation: number }
/** Decorative paving on existing terrain: no collision, support or new floor. */
export interface HomeSurfaceRoute { id: string; width: number; points: Vec3[] }
export interface HomeManifest {
  home: HomeManifestSite;
  infrastructure: HomeManifestSite[];
  objects: { kind: BuildKind; position: Vec3; rotation: number }[];
  routes: HomeSurfaceRoute[];
}

/** Local project units around the landing bearing, not raw angular coordinates. */
export const samplePoint = (radius: number, x: number, z: number): Vec3 => localToDir({ dir: SPAWN, yaw: 0 }, radius, [x, 0, z]);

export function starterManifest(radius: number): HomeManifest {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('A positive planet radius is required.');
  const at = (x: number, z: number) => samplePoint(radius, x, z);
  const home: HomeManifestSite = { blueprint: starterHome(), position: at(0, -8), rotation: 0 };
  const infrastructure: HomeManifestSite[] = [
    { blueprint: lookout(), position: at(8.8, 1.6), rotation: 3 * Math.PI / 2 },
    { blueprint: gardenSquare(), position: at(-7.2, -1.8), rotation: 0 },
  ];
  const occupied: PlacedObject[] = [home, ...infrastructure].map((site, i) => ({
    id: `sample-site-${i}`, kind: 'structure', position: site.position, rotation: site.rotation, version: 1, ...structureSize(site.blueprint.parts),
  }));
  const objects: HomeManifest['objects'] = [];
  const prop = (kind: BuildKind, x: number, z: number, rotation = 0) => {
    const position = at(x, z);
    // The ordinary player placement rule is also the sample's rule. The
    // fixed candidate list stays deterministic at other supported radii.
    if (placementProblem(kind, position, occupied, undefined, undefined, radius)) return;
    objects.push({ kind, position, rotation });
    occupied.push({ id: `sample-prop-${objects.length}`, kind, assetVersion: 2, position, rotation, version: 1 });
  };
  // Three gentle route bearings lead to home, the lookout and orchard court.
  for (const z of [-1.7, -2.4, -3.1, -3.8]) prop('path', 0, z);
  for (const x of [1.7, 2.4, 3.1, 3.8, 4.5, 5.2, 5.9]) prop('path', x, .16 * x);
  for (const x of [-1.7, -2.4, -3.1, -3.8, -4.5]) prop('path', x, .22 * x);
  // Leave the foreground open, frame the house in small tree groups and keep
  // the roof and the next destination readable above the rolling ground.
  for (const [x, z] of [[-4.8, -7.5], [-5.8, -9.1], [5.0, -7.6], [6.2, -9.1], [-3.8, -13.2], [3.8, -13.4],
    [-10.8, -3.2], [-10.4, .4], [11.8, -2.6], [12.3, 4.2], [-5.8, 6.4], [6.2, 7.2], [-13.5, -9.5], [14.8, -8.5]]) prop('tree', x, z);
  for (const [x, z] of [[-2.1, -3.8], [2.1, -3.8], [4.2, 2.3], [-3.4, 1.2], [8.4, 5.4], [-7.1, 3.5]]) prop('flowers', x, z);
  prop('lamp', -1.25, -2.4); prop('lamp', 1.25, -2.4);
  prop('bench', 3.6, 4.2, Math.PI); prop('bench', -3.6, 4.2, Math.PI);
  // Both renderer and scene inspection read the authored routes here. These
  // connect the actual player-placeable path objects; they are only ground
  // decoration, while the courtyard/steps remain ordinary supported kit parts.
  const routes: HomeSurfaceRoute[] = [
    { id: 'home', width: .92, points: [[0, 0], [0, -1.7], [0, -3.5], [0, -5.5]].map(([x, z]) => at(x, z)) },
    { id: 'lookout', width: .80, points: [[0, 0], [2.8, .45], [5.2, 1.1], [7.0, 1.6]].map(([x, z]) => at(x, z)) },
    { id: 'orchard', width: .80, points: [[0, 0], [-2.5, -.45], [-4.0, -.9], [-5.7, -1.5]].map(([x, z]) => at(x, z)) },
  ];
  return { home, infrastructure, objects, routes };
}

/** Fixed kit-built infrastructure catalogue, separate from the player's home. */
export const HOME_INFRASTRUCTURE = [lookout(), gardenSquare()];
