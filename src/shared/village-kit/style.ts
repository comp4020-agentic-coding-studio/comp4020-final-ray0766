/** One paving and edging vocabulary shared by the workshop's road parts and the
 * planet's continuous streets (src/client/town-road-surfaces.ts), so a player's
 * lane and a public street read as the same stone. Metres. */
export const PAVING = {
  /** Visible gap between stones; at least 12 mm so the screen-space ink finds it. */
  joint: .014,
  /** Flagstone course length along a lane, and the stagger between courses. */
  course: .5,
  stagger: .25,
  /** Stone thickness above the dark joint bed. */
  stone: .05,
  bed: .03,
  /** Flush edge band of dressed stone. */
  edge: .16,
  /** Low kerb: width, height above paving, top chamfer. */
  kerbWidth: .18,
  kerbHeight: .06,
  kerbChamfer: .025,
  /** Fan paving rings around a plaza corner. */
  fanRing: .35,
} as const;

/** Village material keys per paving role (src/assets/claude-geometry/style/look.ts VILLAGE). */
export const PAVING_KEYS = {
  carriageway: 'village:lane',
  flag: 'village:cobble',
  edge: 'village:stone',
  joint: 'village:iron',
  marking: 'village:line',
  grass: 'village:leaf',
} as const;
