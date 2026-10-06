import type { Vec3 } from '../../core/vec.ts';
import type { Ring } from '../geom.ts';
import { rotationToNormal } from '../geom.ts';
import type { HullId } from '../spec.ts';
import { antenna, band, bothSides, gearDoor, grille, hatch, intake, rcsQuad } from '../kit.ts';
import type { Ctx, Role } from '../kit.ts';

// Hulls are built in the body frame (+Y up, −Z nose, +X starboard). Each is a
// lofted monocoque through octagonal or hexagonal stations: the flat top is
// the deck the cockpit, dorsal and tail sockets sit on, the vertical sides
// carry the wing and side-engine mounts, and the aft bulkhead carries the aft
// engine mount. Facet groups pick the livery: deck and shoulders in primary
// paint, sides per hull, chines and belly in secondary.

/** Octagonal station: half width, top and bottom heights, upper and lower chamfers. */
export interface Station { z: number; w: number; top: number; bot: number; ct: number; cb: number }

/** p0..p7 clockwise from the top-left, seen from the nose. Edge j joins p[j] and p[j+1]. */
export function octRing(s: Station, grow = 0): Ring {
  const w = s.w + grow, top = s.top + grow, bot = s.bot - grow;
  return [
    [-w + s.ct, top, s.z], [w - s.ct, top, s.z], [w, top - s.ct, s.z], [w, bot + s.cb, s.z],
    [w - s.cb, bot, s.z], [-w + s.cb, bot, s.z], [-w, bot + s.cb, s.z], [-w, top - s.ct, s.z],
  ];
}
const OCT_GROUP = ['deck', 'shoulder', 'side', 'chine', 'belly', 'chine', 'side', 'shoulder'];

/** Station with a sharp chine at `chineY` (wedge hulls): six points. */
export interface ChineStation { z: number; w: number; top: number; bot: number; chineY: number; deck: number; keel: number }
export function chineRing(s: ChineStation): Ring {
  return [[-s.deck, s.top, s.z], [s.deck, s.top, s.z], [s.w, s.chineY, s.z], [s.keel, s.bot, s.z], [-s.keel, s.bot, s.z], [-s.w, s.chineY, s.z]];
}
const CHINE_GROUP = ['deck', 'shoulder', 'chine', 'belly', 'chine', 'shoulder'];

function interpolate(stations: Station[], z: number): Station {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z || 1);
      const l = (k: keyof Station) => a[k] + (b[k] - a[k]) * t;
      return { z, w: l('w'), top: l('top'), bot: l('bot'), ct: l('ct'), cb: l('cb') };
    }
  }
  return z < stations[0].z ? stations[0] : stations[stations.length - 1];
}

/** A rub strake along the shoulder line, following the stations between z0 and z1. */
function strake(ctx: Ctx, stations: Station[], z0: number, z1: number, role: Role, drop = 0) {
  const zs = [z0, ...stations.map(s => s.z).filter(z => z > z0 && z < z1), z1];
  const rings: Ring[] = zs.map(z => {
    const s = interpolate(stations, z);
    const x = s.w, y = s.top - s.ct - drop;
    return [[x - 0.004, y + 0.012, z], [x + 0.016, y + 0.009, z], [x + 0.016, y - 0.009, z], [x - 0.004, y - 0.012, z]];
  });
  ctx.skin(rings, { capStart: true, capEnd: true }, { '*': role });
}

function sideNormalAt(stations: Station[], z: number): Vec3 {
  const a = interpolate(stations, z - 0.05), b = interpolate(stations, z + 0.05);
  const dwdz = (b.w - a.w) / 0.1;
  const l = Math.hypot(1, dwdz);
  return [1 / l, 0, -dwdz / l];
}

// ------------------------------------------------------------- slim courier

const COURIER: Station[] = [
  { z: -2.32, w: 0.05, top: 0.0, bot: -0.1, ct: 0.02, cb: 0.02 },
  { z: -2.16, w: 0.15, top: 0.07, bot: -0.2, ct: 0.05, cb: 0.05 },
  { z: -1.86, w: 0.27, top: 0.15, bot: -0.29, ct: 0.08, cb: 0.08 },
  { z: -1.5, w: 0.36, top: 0.23, bot: -0.34, ct: 0.105, cb: 0.1 },
  { z: -1.2, w: 0.42, top: 0.28, bot: -0.36, ct: 0.12, cb: 0.11 },
  { z: 0.85, w: 0.42, top: 0.28, bot: -0.36, ct: 0.12, cb: 0.11 },
  { z: 1.4, w: 0.4, top: 0.28, bot: -0.3, ct: 0.12, cb: 0.11 },
  { z: 1.75, w: 0.37, top: 0.28, bot: -0.22, ct: 0.11, cb: 0.09 },
];

function slimCourier(ctx: Ctx) {
  const st = COURIER;
  ctx.skin(st.map(s => octRing(s)), { capStart: true, capEnd: true, group: j => OCT_GROUP[j] },
    { deck: 'primary', shoulder: 'primary', side: 'secondary', chine: 'secondary', belly: 'secondary', cap0: 'metal', cap1: 'dark' });

  // Nose: sensor fairing and a bolted avionics hatch on the upper nose.
  ctx.lathe('dark', [[0.0, -2.388], [0.03, -2.378], [0.048, -2.352], [0.056, -2.318]], { position: [0, -0.05, 0] });
  ctx.lathe('metal', [[0.056, -2.318], [0.062, -2.312], [0.062, -2.296]], { position: [0, -0.05, 0] });
  if (ctx.detail >= 1) {
    const slope = Math.atan2(0.08, 0.36);
    hatch(ctx, 0.24, 0.3, { position: [0, 0.196, -1.66], rotation: [-slope, 0, 0] }, 'primary');
  }
  // Panel join between the nose section and the main body, and a collar
  // where the nose cone meets the forward fuselage.
  band(ctx, 'metal', octRing(st[4]), 0.03, 0.008, 0.004);
  if (ctx.detail >= 1) band(ctx, 'metal', octRing(st[3]), 0.022, 0.006, 0.003);
  // Rub strake on both shoulders.
  strake(ctx, st, -1.86, 1.75, 'trim');
  // Taxi light in a recessed housing under the nose.
  if (ctx.detail >= 1) {
    ctx.cylinder('dark', 0.04, 0.034, 0.024, { position: [0, -0.31, -1.74] }, 12);
    ctx.cylinder('glass', 0.028, 0.028, 0.006, { position: [0, -0.323, -1.74] }, 12);
  }

  bothSides(ctx, () => {
    // Cheek intakes on the shoulder facets behind the cockpit.
    const sh = interpolate(st, 0.2);
    const n: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
    intake(ctx, 0.09, 0.3, { position: [sh.w - sh.ct / 2 + 0.003, sh.top - sh.ct / 2 + 0.003, 0.18], rotation: rotationToNormal(n) }, 'metal');
    // Side service hatch under the engine pylon.
    hatch(ctx, 0.18, 0.3, { position: [0.42, -0.12, 1.12], rotation: [0, 0, -Math.PI / 2] }, 'secondary');
    // Nose RCS on the side, aft RCS on the lower chine.
    rcsQuad(ctx, { position: [0.395, 0.0, -1.3], rotation: rotationToNormal(sideNormalAt(st, -1.3)) });
    const aft = interpolate(st, 1.52);
    rcsQuad(ctx, { position: [aft.w - aft.cb / 2 + 0.004, aft.bot + aft.cb / 2 - 0.004, 1.52], rotation: rotationToNormal([Math.SQRT1_2, -Math.SQRT1_2, 0]) });
    // Main gear door.
    gearDoor(ctx, 0.16, 0.5, { position: [0.16, -0.36, 0.6], rotation: [Math.PI, 0, 0] });
    if (ctx.detail >= 1) {
      // Armour doublers: a lower side plate ahead of the wing root and a
      // shoulder plate alongside the cockpit, each standing 12 mm proud and
      // clear of the registration and the placards.
      ctx.box('secondary', [0.012, 0.15, 0.8], [0.426, -0.165, -0.7], undefined, 0.004);
      ctx.box('primary', [0.012, 0.1, 0.98], [0.364, 0.224, -0.63], [0, 0, Math.PI / 4], 0.004);
      // Step plate under the cockpit, on the lower doubler.
      ctx.box('hazard', [0.004, 0.05, 0.14], [0.434, -0.18, -0.95], undefined, 0);
    }
    if (ctx.detail >= 2) for (const y of [-0.1, -0.23]) ctx.boltRow([0.432, y, -1.06], [0.432, y, -0.34], 7, [1, 0, 0], 0.007);
  });

  // Nose gear door on the centre line, belly antenna, deck radiator grille.
  gearDoor(ctx, 0.2, 0.42, { position: [0, -0.36, -0.82], rotation: [Math.PI, 0, 0] });
  antenna(ctx, [0, -0.355, -1.42], 0.16, [Math.PI - 0.35, 0, 0]);
  grille(ctx, 0.36, 0.22, { position: [0, 0.28, 0.4] });
  aftBulkhead(ctx, st[st.length - 1]);
}

/** Bolted rim, service panels and louvred vents on the aft face. */
function aftBulkhead(ctx: Ctx, s: Station) {
  band(ctx, 'metal', octRing(s), 0.03, 0.02, -0.012);
  if (ctx.detail === 0) return;
  for (const x of [-1, 1]) {
    ctx.box('metal', [0.14, 0.08, 0.02], [x * (s.w - 0.13), s.top - 0.1, s.z + 0.01], undefined, 0.004);
    grille(ctx, 0.1, 0.07, { position: [x * (s.w - 0.13), s.bot + s.cb + 0.03, s.z], rotation: [Math.PI / 2, 0, 0] });
  }
  ctx.boltRow([-s.w + 0.1, s.top - 0.05, s.z + 0.006], [s.w - 0.1, s.top - 0.05, s.z + 0.006], 7, [0, 0, 1], 0.009);
}

// --------------------------------------------------------------- boxy hauler

const HAULER: Station[] = [
  { z: -2.16, w: 0.3, top: 0.1, bot: -0.3, ct: 0.1, cb: 0.1 },
  { z: -2.02, w: 0.46, top: 0.27, bot: -0.42, ct: 0.14, cb: 0.12 },
  { z: -1.75, w: 0.56, top: 0.38, bot: -0.47, ct: 0.15, cb: 0.13 },
  { z: -1.45, w: 0.58, top: 0.4, bot: -0.48, ct: 0.16, cb: 0.13 },
  { z: 1.3, w: 0.58, top: 0.4, bot: -0.48, ct: 0.16, cb: 0.13 },
  { z: 1.75, w: 0.54, top: 0.4, bot: -0.34, ct: 0.15, cb: 0.12 },
];

function boxyHauler(ctx: Ctx) {
  const st = HAULER;
  ctx.skin(st.map(s => octRing(s)), { capStart: true, capEnd: true, group: j => OCT_GROUP[j] },
    { deck: 'primary', shoulder: 'primary', side: 'primary', chine: 'secondary', belly: 'secondary', cap0: 'secondary', cap1: 'dark' });
  // External frames: the hauler's ribs wrap the hull at each bulkhead.
  for (const z of ctx.detail ? [-1.45, -0.6, 0.25, 1.1] : [-1.45, 0.25]) band(ctx, 'metal', octRing(interpolate(st, z)), 0.055, 0.026, 0.012);
  // Blunt nose: bumper frame, sensor window, tow eyes.
  const nose = st[0];
  band(ctx, 'metal', octRing(nose), 0.05, 0.04, 0.02);
  ctx.box('dark', [0.3, 0.1, 0.02], [0, -0.06, nose.z - 0.005], undefined, 0.006);
  ctx.box('glass', [0.26, 0.07, 0.01], [0, -0.06, nose.z - 0.014], undefined, 0);
  if (ctx.detail >= 1) for (const x of [-0.18, 0.18]) ctx.cylinder('bright', 0.025, 0.025, 0.05, { position: [x, -0.24, nose.z - 0.02], rotation: [Math.PI / 2, 0, 0] }, 8);
  // Anti-glare panel on the nose top ahead of the cockpit.
  hatch(ctx, 0.5, 0.26, { position: [0, 0.39, -1.6], rotation: [-0.07, 0, 0] }, 'secondary');
  bothSides(ctx, () => {
    // Recessed footholds up the side, a vent and an access panel.
    if (ctx.detail >= 1) for (let i = 0; i < 4; i++) ctx.box('bright', [0.03, 0.02, 0.12], [0.59, -0.36 + i * 0.13, -1.3], undefined, 0.004);
    hatch(ctx, 0.2, 0.34, { position: [0.58, 0.02, -0.2], rotation: [0, 0, -Math.PI / 2] }, 'secondary');
    grille(ctx, 0.12, 0.3, { position: [0.58, -0.3, 1.0], rotation: [0, 0, -Math.PI / 2] });
    rcsQuad(ctx, { position: [0.555, 0.39, -1.8], rotation: rotationToNormal([0.5, 0.86, 0]) });
    rcsQuad(ctx, { position: [0.5, 0.36, 1.6], rotation: rotationToNormal([0.6, 0.8, 0]) });
    // Skid rails under the belly instead of wheels.
    ctx.box('metal', [0.06, 0.05, 2.4], [0.3, -0.505, 0.0], undefined, 0.01);
    for (const z of [-1.0, 0.0, 1.0]) ctx.box('metal', [0.05, 0.03, 0.08], [0.3, -0.475, z], undefined, 0.005);
    gearDoor(ctx, 0.14, 0.4, { position: [0.12, -0.48, -1.2], rotation: [Math.PI, 0, 0] });
  });
  // Cargo hatch on the belly between the skids.
  gearDoor(ctx, 0.36, 1.1, { position: [0, -0.48, 0.25], rotation: [Math.PI, 0, 0] });
  // Deck: handrails along both edges, a roof hatch and a grille.
  if (ctx.detail >= 1) for (const x of [-0.39, 0.39]) {
    for (const z of [-0.1, 0.5, 1.1]) ctx.rod('metal', [x, 0.4, z], [x, 0.47, z], 0.008);
    ctx.rod('bright', [x, 0.47, -0.12], [x, 0.47, 1.12], 0.009);
  }
  hatch(ctx, 0.3, 0.3, { position: [0, 0.4, 0.15] }, 'primary');
  grille(ctx, 0.5, 0.2, { position: [0, 0.4, 0.95] });
  antenna(ctx, [0.2, -0.48, -0.5], 0.14, [Math.PI + 0.3, 0, 0]);
  aftBulkhead(ctx, st[st.length - 1]);
}

// ---------------------------------------------------------- wedge interceptor

const WEDGE: ChineStation[] = [
  { z: -2.38, w: 0.03, top: 0.0, bot: -0.05, chineY: -0.03, deck: 0.01, keel: 0.01 },
  { z: -2.1, w: 0.17, top: 0.06, bot: -0.13, chineY: -0.05, deck: 0.05, keel: 0.06 },
  { z: -1.6, w: 0.35, top: 0.16, bot: -0.23, chineY: -0.055, deck: 0.17, keel: 0.14 },
  { z: -1.25, w: 0.46, top: 0.22, bot: -0.28, chineY: -0.06, deck: 0.3, keel: 0.2 },
  { z: -0.9, w: 0.5, top: 0.22, bot: -0.3, chineY: -0.06, deck: 0.3, keel: 0.22 },
  { z: 1.3, w: 0.5, top: 0.22, bot: -0.3, chineY: -0.06, deck: 0.3, keel: 0.22 },
  { z: 1.72, w: 0.44, top: 0.22, bot: -0.2, chineY: -0.05, deck: 0.28, keel: 0.18 },
];

function wedgeInterceptor(ctx: Ctx) {
  const st = WEDGE;
  ctx.skin(st.map(chineRing), { capStart: true, capEnd: true, group: j => CHINE_GROUP[j] },
    { deck: 'primary', shoulder: 'primary', chine: 'secondary', belly: 'secondary', cap0: 'metal', cap1: 'dark' });
  // Chine edge strip and an anti-glare panel ahead of the cockpit.
  ctx.skin(st.slice(1).map(s => [[s.w + 0.012, s.chineY, s.z], [s.w - 0.02, s.chineY + 0.02, s.z], [s.w - 0.02, s.chineY - 0.02, s.z]] as Ring), { capStart: true, capEnd: true }, { '*': 'trim' });
  ctx.skin(st.slice(1).map(s => [[s.w + 0.012, s.chineY, s.z], [s.w - 0.02, s.chineY + 0.02, s.z], [s.w - 0.02, s.chineY - 0.02, s.z]].map(p => [-p[0], p[1], p[2]]) as Ring), { capStart: true, capEnd: true }, { '*': 'trim' });
  const nose = st[2], cockpitFront = st[3];
  ctx.skin([
    [[-nose.deck + 0.03, nose.top + 0.004, nose.z + 0.1], [nose.deck - 0.03, nose.top + 0.004, nose.z + 0.1]].map(p => [p[0], p[1] + (cockpitFront.top - nose.top) * 0.1 / 0.35, p[2]]) as Ring,
    [[-cockpitFront.deck + 0.02, cockpitFront.top + 0.004, cockpitFront.z], [cockpitFront.deck - 0.02, cockpitFront.top + 0.004, cockpitFront.z]] as Ring,
  ], { closed: false }, { '*': 'secondary' });
  // Pitot probe and nose ring.
  ctx.rod('bright', [0, -0.025, -2.38], [0, -0.025, -2.395], 0.012, 8);
  bothSides(ctx, () => {
    // Chine intakes on the lower slope, ahead of the wing root.
    const n: Vec3 = [0.65, -0.76, 0];
    intake(ctx, 0.12, 0.42, { position: [0.37, -0.165, -0.5], rotation: rotationToNormal(n) }, 'metal');
    // Sensor slit on the upper slope near the nose.
    ctx.box('dark', [0.012, 0.03, 0.2], [0.27, 0.04, -1.75], [0, 0.3, -0.62], 0.003);
    // Armour panel on the upper slope with bolts.
    hatch(ctx, 0.14, 0.4, { position: [0.39, 0.09, 0.45], rotation: rotationToNormal([0.81, 0.586, 0]) }, 'secondary');
    rcsQuad(ctx, { position: [0.42, 0.04, -1.35], rotation: rotationToNormal([0.81, 0.586, 0]) });
    rcsQuad(ctx, { position: [0.4, -0.15, 1.5], rotation: rotationToNormal([0.65, -0.76, 0]) });
    gearDoor(ctx, 0.14, 0.46, { position: [0.12, -0.3, 0.55], rotation: [Math.PI, 0, 0] });
  });
  gearDoor(ctx, 0.16, 0.38, { position: [0, -0.3, -0.95], rotation: [Math.PI, 0, 0] });
  grille(ctx, 0.3, 0.18, { position: [0, 0.22, 0.25] });
  antenna(ctx, [0, -0.3, 0.05], 0.12, [Math.PI - 0.4, 0, 0]);
  // Aft face: rim and vents.
  const aft = st[st.length - 1];
  const ring = chineRing(aft);
  band(ctx, 'metal', ring, 0.03, 0.02, -0.012);
  if (ctx.detail >= 1) for (const x of [-1, 1]) grille(ctx, 0.12, 0.06, { position: [x * 0.24, 0.12, aft.z], rotation: [Math.PI / 2, 0, 0] });
}

export const HULL_BUILDERS: Record<HullId, (ctx: Ctx) => void> = {
  'slim-courier': slimCourier,
  'boxy-hauler': boxyHauler,
  'wedge-interceptor': wedgeInterceptor,
};

