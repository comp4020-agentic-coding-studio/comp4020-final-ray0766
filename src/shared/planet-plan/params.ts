/** Every spatial number the main-planet plan uses, in metres, in one place.
 * Body scale: a 1.6 m courier with a 0.18 m capsule radius walking 3 m/s
 * (src/shared/physics/body.ts, src/shared/world.ts). */
export const PLAN_RADIUS = 21.6;

export type RoadClass = 'main' | 'branch' | 'lane' | 'door';
export interface RoadProfile {
  /** Clear paved width between the edge bands. */
  paved: number;
  /** Flush stone band on each side of the paving. */
  edge: number;
  /** Raised kerb outside the edge band (0 = no kerb). */
  kerb: number;
  kerbHeight: number;
  /** Plan-view radius of the inner paved edge on a bend. */
  fillet: number;
  /** Radius of the paved corner where this road meets another at a junction. */
  corner: number;
  /** Centreline sample spacing for meshes and collision. */
  step: number;
  /** Setback from the road's outer edge to a building's ground footprint. */
  setback: number;
}
/** Main: two people pass with ~1.4 m to spare (2 × 0.6 m shoulders).
 * Branch: two people pass comfortably. Lane: one person, a second can squeeze by. */
export const ROAD_PROFILES: Readonly<Record<RoadClass, RoadProfile>> = {
  main: { paved: 2.6, edge: .24, kerb: .2, kerbHeight: .06, fillet: 3.2, corner: 1.5, step: .5, setback: .9 },
  branch: { paved: 2.0, edge: .2, kerb: 0, kerbHeight: 0, fillet: 2.2, corner: 1.1, step: .5, setback: .7 },
  lane: { paved: 1.2, edge: .12, kerb: 0, kerbHeight: 0, fillet: 1.2, corner: .7, step: .4, setback: .45 },
  door: { paved: 1.0, edge: .1, kerb: 0, kerbHeight: 0, fillet: .6, corner: .4, step: .4, setback: 0 },
};
export const roadHalfWidth = (c: RoadClass) => ROAD_PROFILES[c].paved / 2 + ROAD_PROFILES[c].edge + ROAD_PROFILES[c].kerb;

export const SURFACE = {
  /** Paving top above the natural ground it drapes over (the walker stands on the ground). */
  lift: .015,
  /** Junction and plaza paving sit a hair above road ends they meet. */
  layer: .004,
  /** Door paths sit above the edge bands they cross. */
  doorLayer: .007,
  /** Terrain mesh under paving is graded at least this far below the lift. */
  gradeBelow: .05,
  /** Grass and flora are kept this far beyond the outer edge. */
  floraMargin: .35,
  /** Kerb faces and paving edges hang this far below the ground to hide mesh joins. */
  skirt: .12,
} as const;

export const CLEARANCE = {
  /** Gap between the ground footprints of neighbouring buildings. */
  buildingGap: 1.0,
  /** Eaves, hoods and awnings above 2 m must stay this far outside a road's outer edge. */
  canopyToRoad: .1,
  /** Lamps, benches, planters and trees stay this far outside the paved + edge width. */
  propToPaving: .3,
  /** Minimum free radius of a door path end at the step foot. */
  doorLanding: .8,
  /** A door path longer than this is reported (the building sits too far back). */
  maxDoorPath: 4.5,
} as const;

/** Reserved circles around fixed anchors that no building, prop or kerb may enter. */
export const RESERVES = {
  spawn: 1.8,
  dock: 2.0,
  npc: 1.1,
  ship: 3.4,
  resident: .7,
} as const;

export const PLAZA = {
  /** Stone border band width around a plaza. */
  border: .32,
  ringStep: .6,
  sectorStep: .6,
} as const;

export const STREET_PROPS = {
  /** Lamp spacing along main roads (alternating sides) and branch roads. */
  lampMain: 9,
  lampBranch: 12,
  /** Lamp axis distance outside the outer road edge. */
  lampOffset: .45,
} as const;
