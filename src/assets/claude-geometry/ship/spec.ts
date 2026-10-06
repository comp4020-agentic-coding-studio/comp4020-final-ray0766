import type { Vec3 } from '../core/vec.ts';

// Ship connection standard, version 1.
//
// Body frame (docs/CONTRACTS.md §1): +Y up, −Z forward (the nose), +X right
// (starboard). The origin is the flight pivot. 1 unit = 1 m.
//
// A ship is one hull plus parts plugged into the hull's named sockets.
//
// - The hull is built in the body frame. It owns every socket.
// - Every other part has exactly one plug: the origin of its own frame. A part
//   is authored with +Y up and −Z forward like the ship, and with +X pointing
//   outboard (away from the centre line). Its plug sits on the surface it
//   mounts to, so the part's skin starts at the plug and never needs to know
//   which hull it is on.
// - A socket is a position, an orientation (XYZ Euler, radians) and a mirror
//   flag, plus the category and mount face it accepts. Placing a part means
//   composing translate · rotate · scale(mirror) and building the part inside
//   that frame (PartBuilder.within), so every part merges into the ship's
//   per-material meshes.
// - Left-hand sockets are never authored. They are the right-hand socket
//   reflected through the YZ plane: x and the Y/Z rotations change sign and
//   scale.x becomes −1. The PartBuilder flips triangle winding for negative
//   determinants, so mirrored parts stay front-facing.
// - Mount faces: `deck` is the flat top of the hull (cockpit, tail, dorsal),
//   `side` is the vertical hull side (wings, side engines), `aft` is the aft
//   bulkhead (engines that thrust along +Z from the centre line).
// - Engine options choose which engine sockets they fill: twin nacelles fill
//   engine.right and engine.left, the single heavy and the pod cluster fill
//   engine.aft. Each engine unit still has one plug.
// - Nozzle exits are published as anchors whose +Z is the exhaust direction.
// - Every combination of parts must stay inside SHIP_ENVELOPE at every LOD;
//   tests/unit/ship enumerates them all.

export const CONNECTION_STANDARD_VERSION = 1;

/** docs/CONTRACTS.md §1: the assembled ship fits this box and sphere. Flight code may treat a ship as the sphere. */
export const SHIP_ENVELOPE = { min: [-1.8, -0.7, -2.4] as Vec3, max: [1.8, 1.0, 2.2] as Vec3, radius: 2.4 } as const;

export type Category = 'hull' | 'cockpit' | 'wings' | 'engines' | 'tail' | 'dorsal';
export const CATEGORIES: readonly Category[] = ['hull', 'cockpit', 'wings', 'engines', 'tail', 'dorsal'];

export type SocketName = 'cockpit' | 'wing.right' | 'wing.left' | 'engine.right' | 'engine.left' | 'engine.aft' | 'tail' | 'dorsal';
export type Mount = 'deck' | 'side' | 'aft';

export interface Socket {
  name: SocketName;
  accepts: Exclude<Category, 'hull'>;
  mount: Mount;
  position: Vec3;
  /** XYZ Euler angles in radians. */
  rotation: Vec3;
  /** Reflected through the YZ plane (left-hand side). */
  mirror: boolean;
}

export interface PartInfo<Id extends string = string> {
  id: Id;
  name: string;
  /**
   * One line shown under the name on the workshop tile. Hull lengths, wing spans
   * and engine diameters in it are checked against the built geometry
   * (tests/unit/ship); the other figures are the builders' design dimensions
   * (fin length along the fin, cant angles, slit height). Nothing is quoted
   * that the model does not have, such as mass.
   */
  spec: string;
}

export const HULL_IDS = ['slim-courier', 'boxy-hauler', 'wedge-interceptor'] as const;
export const COCKPIT_IDS = ['faceted-canopy', 'slit-visor', 'raised-bridge'] as const;
export const WING_IDS = ['swept', 'delta', 'stub-pylon'] as const;
export const ENGINE_IDS = ['twin-nacelle', 'single-heavy', 'pod-cluster'] as const;
export const TAIL_IDS = ['single-fin', 'twin-fin', 'v-tail'] as const;
export const DORSAL_IDS = ['none', 'sensor-mast', 'comms-dish'] as const;

export type HullId = typeof HULL_IDS[number];
export type CockpitId = typeof COCKPIT_IDS[number];
export type WingId = typeof WING_IDS[number];
export type EngineId = typeof ENGINE_IDS[number];
export type TailId = typeof TAIL_IDS[number];
export type DorsalId = typeof DORSAL_IDS[number];

export interface ShipParts { hull: HullId; cockpit: CockpitId; wings: WingId; engines: EngineId; tail: TailId; dorsal: DorsalId }

export const PART_IDS: { [K in Category]: readonly ShipParts[K][] } = {
  hull: HULL_IDS, cockpit: COCKPIT_IDS, wings: WING_IDS, engines: ENGINE_IDS, tail: TAIL_IDS, dorsal: DORSAL_IDS,
};

/** Hull dimensions the part kit and the sockets both read. */
export interface HullSpec extends PartInfo<HullId> {
  /** Height of the flat top deck. Cockpit, dorsal and tail sockets sit on it. */
  deckY: number;
  /** Half width of the deck's flat top (cockpits and tails must fit inside). */
  deckHalfWidth: number;
  /** Half width of the hull at the wing and side-engine mounts. */
  halfWidth: number;
  bellyY: number;
  noseZ: number;
  aftZ: number;
  /** Right-hand sockets; left-hand ones are mirrored from these. */
  mounts: { cockpit: Vec3; wing: Vec3; wingRotation: Vec3; engineSide: Vec3; engineAft: Vec3; tail: Vec3; dorsal: Vec3 };
  /** Registration decal on the right side, mirrored to the left; `paint` is the livery zone under it (sets the ink). */
  decal: { position: Vec3; normal: Vec3; width: number; height: number; paint: 'primary' | 'secondary' };
}

export const HULLS: Record<HullId, HullSpec> = {
  'slim-courier': {
    id: 'slim-courier', name: 'Slim courier', spec: '4.2 m · light monocoque',
    deckY: 0.28, deckHalfWidth: 0.30, halfWidth: 0.42, bellyY: -0.36, noseZ: -2.32, aftZ: 1.75,
    mounts: {
      cockpit: [0, 0.28, -0.6], wing: [0.42, -0.14, 0.22], wingRotation: [0, 0, 0],
      engineSide: [0.42, 0.1, 0.7], engineAft: [0, 0.02, 1.75], tail: [0, 0.28, 1.3], dorsal: [0, 0.28, 0.66],
    },
    decal: { position: [0.42, 0.03, -0.8], normal: [1, 0, 0], width: 0.42, height: 0.1, paint: 'secondary' },
  },
  'boxy-hauler': {
    id: 'boxy-hauler', name: 'Boxy hauler', spec: '4.0 m · ribbed cargo frame',
    deckY: 0.4, deckHalfWidth: 0.42, halfWidth: 0.58, bellyY: -0.48, noseZ: -2.16, aftZ: 1.75,
    mounts: {
      cockpit: [0, 0.4, -0.78], wing: [0.58, -0.2, 0.3], wingRotation: [0, 0, 0],
      engineSide: [0.58, 0.14, 0.7], engineAft: [0, -0.02, 1.75], tail: [0, 0.4, 1.3], dorsal: [0, 0.4, 0.58],
    },
    decal: { position: [0.58, 0.12, -1.0], normal: [1, 0, 0], width: 0.5, height: 0.12, paint: 'primary' },
  },
  'wedge-interceptor': {
    id: 'wedge-interceptor', name: 'Wedge interceptor', spec: '4.1 m · chined wedge',
    deckY: 0.22, deckHalfWidth: 0.3, halfWidth: 0.5, bellyY: -0.3, noseZ: -2.38, aftZ: 1.72,
    mounts: {
      cockpit: [0, 0.22, -0.62], wing: [0.5, -0.06, 0.36], wingRotation: [0, 0, -0.05],
      engineSide: [0.357, 0.14, 0.72], engineAft: [0, -0.02, 1.72], tail: [0, 0.22, 1.28], dorsal: [0, 0.22, 0.6],
    },
    // On the upper slope from (0.3, 0.22) to (0.5, −0.06): its midpoint and exact normal.
    decal: { position: [0.4, 0.08, -0.32], normal: [0.28 / 0.3441, 0.2 / 0.3441, 0], width: 0.32, height: 0.075, paint: 'primary' },
  },
};

export const COCKPITS: Record<CockpitId, PartInfo<CockpitId>> = {
  'faceted-canopy': { id: 'faceted-canopy', name: 'Faceted canopy', spec: 'Coated glass · 4 arches, 2 posts' },
  'slit-visor': { id: 'slit-visor', name: 'Slit visor', spec: 'Armoured cupola · 60 mm slit' },
  'raised-bridge': { id: 'raised-bridge', name: 'Raised bridge', spec: 'Wraparound glazing · 2 seats' },
};
export const WINGS: Record<WingId, PartInfo<WingId>> = {
  swept: { id: 'swept', name: 'Swept', spec: '1.1 m span · 34° sweep' },
  delta: { id: 'delta', name: 'Delta', spec: '1.15 m span · elevons · fence' },
  'stub-pylon': { id: 'stub-pylon', name: 'Stub + pylons', spec: '0.8 m span · 2 hardpoints' },
};
export interface EngineInfo extends PartInfo<EngineId> { mount: 'side' | 'aft'; sockets: SocketName[] }
export const ENGINES: Record<EngineId, EngineInfo> = {
  'twin-nacelle': { id: 'twin-nacelle', name: 'Twin nacelles', spec: '2 × 0.34 m · side pylons', mount: 'side', sockets: ['engine.right', 'engine.left'] },
  'single-heavy': { id: 'single-heavy', name: 'Single heavy', spec: '0.66 m bell · gimballed', mount: 'aft', sockets: ['engine.aft'] },
  'pod-cluster': { id: 'pod-cluster', name: 'Pod cluster', spec: '3 × 0.2 m pods · thrust plate', mount: 'aft', sockets: ['engine.aft'] },
};
export const TAILS: Record<TailId, PartInfo<TailId>> = {
  'single-fin': { id: 'single-fin', name: 'Single fin', spec: '0.55 m · rudder · strobe' },
  'twin-fin': { id: 'twin-fin', name: 'Twin fins', spec: '2 × 0.44 m · 12° cant' },
  'v-tail': { id: 'v-tail', name: 'V-tail', spec: '2 × 0.56 m · 40° from vertical' },
};
export const DORSALS: Record<DorsalId, PartInfo<DorsalId>> = {
  none: { id: 'none', name: 'None', spec: 'Clean deck' },
  'sensor-mast': { id: 'sensor-mast', name: 'Sensor mast', spec: '0.3 m mast · optics head' },
  'comms-dish': { id: 'comms-dish', name: 'Comms dish', spec: '0.32 m dish · yoke mount' },
};

export const CATALOGUE: { [K in Category]: Record<ShipParts[K], PartInfo<ShipParts[K]>> } = {
  hull: HULLS, cockpit: COCKPITS, wings: WINGS, engines: ENGINES, tail: TAILS, dorsal: DORSALS,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  hull: 'Hull', cockpit: 'Cockpit', wings: 'Wings', engines: 'Engines', tail: 'Tail', dorsal: 'Dorsal',
};

/** Reflect a right-hand socket into its left-hand twin. */
export function mirrorSocket(socket: Socket, name: SocketName): Socket {
  return {
    ...socket, name,
    position: [-socket.position[0], socket.position[1], socket.position[2]],
    rotation: [socket.rotation[0], -socket.rotation[1], -socket.rotation[2]],
    mirror: !socket.mirror,
  };
}

/** Every socket a hull provides. */
export function hullSockets(hull: HullId): Record<SocketName, Socket> {
  const m = HULLS[hull].mounts;
  const wing: Socket = { name: 'wing.right', accepts: 'wings', mount: 'side', position: m.wing, rotation: m.wingRotation, mirror: false };
  const engine: Socket = { name: 'engine.right', accepts: 'engines', mount: 'side', position: m.engineSide, rotation: [0, 0, 0], mirror: false };
  return {
    cockpit: { name: 'cockpit', accepts: 'cockpit', mount: 'deck', position: m.cockpit, rotation: [0, 0, 0], mirror: false },
    'wing.right': wing,
    'wing.left': mirrorSocket(wing, 'wing.left'),
    'engine.right': engine,
    'engine.left': mirrorSocket(engine, 'engine.left'),
    'engine.aft': { name: 'engine.aft', accepts: 'engines', mount: 'aft', position: m.engineAft, rotation: [0, 0, 0], mirror: false },
    tail: { name: 'tail', accepts: 'tail', mount: 'deck', position: m.tail, rotation: [0, 0, 0], mirror: false },
    dorsal: { name: 'dorsal', accepts: 'dorsal', mount: 'deck', position: m.dorsal, rotation: [0, 0, 0], mirror: false },
  };
}

export interface PlanStep {
  category: Category;
  part: string;
  /** null for the hull, which is built in the body frame. */
  socket: Socket | null;
}

/** Which part goes into which socket. The factory builds the steps in order. */
export function assemblyPlan(parts: ShipParts): PlanStep[] {
  const sockets = hullSockets(parts.hull);
  const steps: PlanStep[] = [
    { category: 'hull', part: parts.hull, socket: null },
    { category: 'cockpit', part: parts.cockpit, socket: sockets.cockpit },
    { category: 'wings', part: parts.wings, socket: sockets['wing.right'] },
    { category: 'wings', part: parts.wings, socket: sockets['wing.left'] },
    ...ENGINES[parts.engines].sockets.map(name => ({ category: 'engines' as const, part: parts.engines, socket: sockets[name] })),
    { category: 'tail', part: parts.tail, socket: sockets.tail },
  ];
  if (parts.dorsal !== 'none') steps.push({ category: 'dorsal', part: parts.dorsal, socket: sockets.dorsal });
  for (const step of steps) {
    if (step.socket && step.socket.accepts !== step.category) throw new Error(`Socket ${step.socket.name} does not accept ${step.category}.`);
    if (step.category === 'engines' && step.socket && step.socket.mount !== ENGINES[parts.engines].mount) throw new Error(`${parts.engines} cannot mount on ${step.socket.name}.`);
  }
  return steps;
}

/** Every combination of parts, for the envelope and budget tests. */
export function allPartCombinations(): ShipParts[] {
  const out: ShipParts[] = [];
  for (const hull of HULL_IDS) for (const cockpit of COCKPIT_IDS) for (const wings of WING_IDS)
    for (const engines of ENGINE_IDS) for (const tail of TAIL_IDS) for (const dorsal of DORSAL_IDS)
      out.push({ hull, cockpit, wings, engines, tail, dorsal });
  return out;
}
