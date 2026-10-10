import * as T from 'three';
import type { Vec3 } from '../../../core/vec.ts';
import { bothSides } from '../../kit.ts';
import type { Ctx, Role } from '../../kit.ts';
import { FLUSH, flushDisc, flushPanel, sectionRing, segs, smoothSkin, STRIPE } from './shapes.ts';
import type { Groups, Section } from './shapes.ts';

// Village hulls: the industrial hulls' decks, sides, aft faces, sockets and
// registration panels kept; rounded sections and noses in between.
//
// Detail is painted, not built: portholes, lamps, the van's cargo door and the
// band round each tail lie flush on the skin (shapes.ts flushDisc), so they
// read by colour and the lines draw only the hull's own outline and the van's
// fender. A ring standing 8 to 14 mm proud drew two 1 px crease rings round
// every porthole and collar at shipyard distance.

/** Width of the painted trim band round the aft end of every hull. */
const TAIL_BAND = 0.032;

/** Rings of the same length mixed point by point: a section between two of a hull's sections. */
const between = (a: Vec3[], b: Vec3[], t: number): Vec3[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t, p[2] + (b[i][2] - p[2]) * t] as Vec3);

/** A painted porthole: glass in a ring of bare metal, both flush on a surface facing `n`. */
function porthole(ctx: Ctx, at: Vec3, n: Vec3, r: number, lift = FLUSH) {
  const k = segs(ctx, 16, 12, 10);
  flushDisc(ctx, 'metal', at, n, r + 0.014, r, k, lift);
  flushDisc(ctx, 'glass', at, n, r, 0, k, lift);
}

// --------------------------------------------------------------------- hull

/**
 * Courier hull: a rounded box section that keeps the industrial hull's flat
 * deck (y 0.28, ±0.3), sides (x ±0.42) and aft face (z 1.75), with an
 * egg-shaped nose that rounds off at z −2.398, by the industrial nose tip.
 * Upper body in primary, a trim cheat line that sweeps round the nose,
 * secondary below it (where the registration sits), a trim band round the
 * tail and two painted portholes a side. The tile's 4.2 m was the nose to an
 * aft collar 15 mm behind the aft face; with the collar painted flush, the
 * nose reaches 4 mm further and the aft face stands 4 mm behind the plug plane
 * (inside the engines' plugs), 4.152 m.
 */
function courierHull(ctx: Ctx) {
  const k = segs(ctx, 6, 4, 2);
  // Angles round the section, from the keel: 2k per quadrant, with the cheat line's edges inserted on both sides.
  const raw = Array.from({ length: 8 * k }, (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / (8 * k));
  const angles = [...raw, ...STRIPE, ...STRIPE.map(t => Math.PI - t)].sort((x, y) => x - y)
    .filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-6);
  const role: Groups = j => {
    const t0 = angles[j], t1 = j + 1 < angles.length ? angles[j + 1] : angles[0] + 2 * Math.PI;
    const tm = (t0 + t1) / 2, tr = Math.cos(tm) >= 0 ? Math.atan2(Math.sin(tm), Math.cos(tm)) : Math.PI - tm;
    const side = Math.atan2(Math.sin(tr), Math.cos(tr));
    if (side > STRIPE[0] && side < STRIPE[1]) return 'trim';
    return side >= STRIPE[1] ? 'primary' : 'secondary';
  };
  const body: Section = { z: -1.2, a: 0.42, b: 0.32, yc: -0.04, p: 6 };
  const sections: Section[] = [];
  // Nose: elliptical in side view, the section rounding from box to ellipse towards the tip.
  for (const u of ctx.detail === 0 ? [0.9983, 0.9, 0.66, 0.3] : [0.9983, 0.96, 0.9, 0.8, 0.66, 0.46, 0.24]) {
    const s = Math.sqrt(1 - u * u);
    sections.push({ z: -1.2 - 1.2 * u, a: body.a * s, b: body.b * s, yc: body.yc, p: 6 - 3.6 * u });
  }
  const tail: Section = { z: 1.4, a: 0.41, b: 0.295, yc: -0.015, p: 6 }, aft: Section = { z: 1.754, a: 0.39, b: 0.26, yc: 0.02, p: 6 };
  const t = (aft.z - TAIL_BAND - tail.z) / (aft.z - tail.z), mix = (k: 'a' | 'b' | 'yc') => tail[k] + (aft[k] - tail[k]) * t;
  const band: Section = { z: aft.z - TAIL_BAND, a: mix('a'), b: mix('b'), yc: mix('yc'), p: 6 };
  sections.push(body, { ...body, z: 0.85 }, tail, band);
  smoothSkin(ctx, sections.map(s => sectionRing(s, angles)), role, { start: 'trim' });
  smoothSkin(ctx, [band, aft].map(s => sectionRing(s, angles)), () => 'trim', { end: 'secondary' });

  // Portholes ahead of the wing, clear of the registration (z −1.01…−0.59) and the engine pylon (z ≥ 0.7).
  if (ctx.detail === 0) return;
  bothSides(ctx, () => {
    for (const z of [-0.3, 0.1]) porthole(ctx, [0.42, 0.045, z], [1, 0, 0], 0.042);
  });
}

// ------------------------------------------------------------- shared bits

type P2 = [number, number];
const norm2 = (x: number, y: number): P2 => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/**
 * Round fillet between two straight lines meeting at corner `c`: travelling
 * along `din` into the corner and leaving along `dout`. Returns n + 1 points
 * from the tangent point on the incoming line to the one on the outgoing line.
 */
function fillet(c: P2, din: P2, dout: P2, r: number, n: number): P2[] {
  const phi = Math.acos(Math.max(-1, Math.min(1, din[0] * dout[0] + din[1] * dout[1])));
  const t = r * Math.tan(phi / 2);
  const t1: P2 = [c[0] - din[0] * t, c[1] - din[1] * t], t2: P2 = [c[0] + dout[0] * t, c[1] + dout[1] * t];
  let nx = -din[1], ny = din[0];
  if (nx * dout[0] + ny * dout[1] < 0) { nx = -nx; ny = -ny; }
  const o: P2 = [t1[0] + nx * r, t1[1] + ny * r];
  const a1 = Math.atan2(t1[1] - o[1], t1[0] - o[0]);
  let d = Math.atan2(t2[1] - o[1], t2[0] - o[0]) - a1;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => [o[0] + r * Math.cos(a1 + d * i / n), o[1] + r * Math.sin(a1 + d * i / n)] as P2);
}


/**
 * A half-round bead laid along a path on a surface (fender, rub strake): each
 * path point carries its own size `s` (0 closes the end), the bead's section
 * lies in the plane of the path's outward side and `up`.
 */
function bead(ctx: Ctx, role: Role, path: { p: Vec3; s: number }[], up: Vec3, rx: number, ry: number, k: number) {
  const span = 1.75;   // a little over a half turn, so both edges sink into the surface
  const rings = path.map(({ p, s }, i) => {
    const a = path[Math.max(0, i - 1)].p, b = path[Math.min(path.length - 1, i + 1)].p;
    const t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let out: Vec3 = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const l = Math.hypot(...out) || 1;
    out = [out[0] / l, out[1] / l, out[2] / l];
    return Array.from({ length: k + 1 }, (_, j) => {
      const al = -span + 2 * span * j / k, x = -0.004 + rx * s * Math.cos(al), y = ry * s * Math.sin(al);
      return [p[0] + out[0] * x + up[0] * y, p[1] + out[1] * x + up[1] * y, p[2] + out[2] * x + up[2] * y] as Vec3;
    });
  });
  smoothSkin(ctx, rings, j => (j < k ? role : null), {}, false);
}

// --------------------------------------------------------------- boxy hauler

/** Hauler section: flat deck and sides with round upper corners down to the fender line, a shallow round bowl under it. */
interface VanSection { z: number; a: number; top: number; bot: number; r: number }
/** Height of the fender, the widest line of the hauler; the nose closes on it. */
const FENDER_Y = -0.3;

function vanRing(s: VanSection, bowl: number, side: number, arc: number): Vec3[] {
  const right: Vec3[] = [], e = 2 / 3;
  for (let i = 1; i <= bowl; i++) {
    const t = (Math.PI / 2) * (1 - i / bowl);
    right.push([s.a * Math.cos(t) ** e, FENDER_Y - (FENDER_Y - s.bot) * Math.sin(t) ** e, s.z]);
  }
  for (let i = 1; i <= side; i++) right.push([s.a, FENDER_Y + (s.top - s.r - FENDER_Y) * i / (side + 1), s.z]);
  for (let i = 0; i <= arc; i++) {
    const f = (Math.PI / 2) * i / arc;
    right.push([s.a - s.r + s.r * Math.cos(f), s.top - s.r + s.r * Math.sin(f), s.z]);
  }
  return [[0, s.bot, s.z], ...right, [0, s.top, s.z], ...right.slice().reverse().map(p => [-p[0], p[1], p[2]] as Vec3)];
}

/**
 * Hauler hull as a friendly parcel van or harbour tug: a tall rounded box
 * that keeps the industrial hull's flat deck (y 0.4, ±0.42), sides (x ±0.58)
 * and aft face (z 1.75), its full round nose closing on a fat trim fender
 * that runs round the bow at y −0.3: the van's one strong line. The rest is
 * painted flush: a cargo door with rounded corners, its round window and
 * handle, two portholes aft of it, two round lamps low on the bow, two tail
 * lamps and a trim band round the tail; primary above the fender, secondary
 * in the shallow bowl under it. No ribs, skids or rails.
 */
function vanHull(ctx: Ctx) {
  const bowl = segs(ctx, 4, 3, 2), side = ctx.detail === 2 ? 1 : 0, arc = segs(ctx, 4, 3, 2);
  const BODY = { a: 0.58, top: 0.4, bot: -0.49, r: 0.21 };
  const zb = -1.38, length = 0.83;
  // Nose: the width closes as a full ellipse in plan, the roof falls to the fender line in a long round curve.
  const us = ctx.detail === 2 ? [1, 0.999, 0.99, 0.97, 0.93, 0.86, 0.76, 0.6, 0.38, 0.16]
    : ctx.detail === 1 ? [1, 0.995, 0.97, 0.9, 0.78, 0.58, 0.3] : [1, 0.98, 0.85, 0.5];
  const noseAt = (u: number): VanSection => {
    const sw = (1 - u ** 2.4) ** (1 / 2.4), sh = (1 - u ** 2.1) ** (1 / 2.1);
    const a = BODY.a * sw, top = FENDER_Y + (BODY.top - FENDER_Y) * sh, bot = FENDER_Y - (FENDER_Y - BODY.bot) * sh;
    const r = Math.min(a, top - FENDER_Y) * (BODY.r / BODY.a + (0.95 - BODY.r / BODY.a) * u * u);
    return { z: zb - length * u, a, top, bot, r };
  };
  const nose = us.map(noseAt);
  const aft: VanSection = { z: 1.75, a: 0.555, top: 0.4, bot: -0.41, r: 0.185 };
  const sections = [...nose, { z: zb, ...BODY }, { z: 1.3, ...BODY }, aft];
  const rings = sections.map(s => vanRing(s, bowl, side, arc));
  const ref = rings[nose.length];
  const role: Groups = j => ((ref[j][1] + ref[(j + 1) % ref.length][1]) / 2 < FENDER_Y - 1e-6 ? 'secondary' : 'primary');
  // The trim band round the tail, painted on the last stretch of skin.
  const last = rings[rings.length - 1], band = between(rings[rings.length - 2], last, 1 - TAIL_BAND / (aft.z - 1.3));
  smoothSkin(ctx, [...rings.slice(0, -1), band], role);
  smoothSkin(ctx, [band, last], () => 'trim', { end: 'secondary' });

  // The fender: along the fender line from the aft face round the bow and back, its ends rounded off.
  const halfAt = (z: number) => (z <= 1.3 ? BODY.a : BODY.a + (aft.a - BODY.a) * (z - 1.3) / 0.45);
  const ends = ctx.detail === 0 ? [[1.74, 0], [1.69, 1]] : [[1.74, 0], [1.735, 0.45], [1.72, 0.8], [1.69, 1]];
  const right = [
    ...ends.map(([z, s]) => ({ p: [halfAt(z), FENDER_Y, z] as Vec3, s })),
    { p: [BODY.a, FENDER_Y, 1.3] as Vec3, s: 1 },
    ...[{ z: zb, ...BODY }, ...nose.slice().reverse()].filter(s => s.a > 1e-6).map(s => ({ p: [s.a, FENDER_Y, s.z] as Vec3, s: 1 })),
  ];
  const tip = { p: [0, FENDER_Y, nose[0].z] as Vec3, s: 1 };
  bead(ctx, 'trim', [...right, tip, ...right.slice().reverse().map(({ p, s }) => ({ p: [-p[0], p[1], p[2]] as Vec3, s }))], [0, 1, 0], 0.036, 0.036, segs(ctx, 6, 4, 2));

  if (ctx.detail >= 1) {
    // Two round lamps low on the bow, just above the fender, painted on the nose where it passes through (±0.3, −0.17).
    const halfWidth = (s: VanSection, y: number) => {
      if (y >= s.top) return 0;
      const dy = y - (s.top - s.r);
      return dy <= 0 ? s.a : s.a - s.r + Math.sqrt(Math.max(0, s.r * s.r - dy * dy));
    };
    const noseZ = (x: number, y: number) => {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (halfWidth(noseAt(m), y) > x) lo = m; else hi = m; }
      return zb - length * (lo + hi) / 2;
    };
    bothSides(ctx, () => {
      bowLamp(ctx, 0.3, -0.17, 0.05, noseZ, segs(ctx, 16, 12, 10));
      // A round tail lamp in each upper corner of the aft face, clear of the aft engines' flanges.
      flushDisc(ctx, 'trim', [0.42, 0.2, aft.z], [0, 0, 1], 0.045, 0, segs(ctx, 16, 12, 10));
    });
  }

  // Cargo door between the registration and the wing root, painted flush in the secondary colour, its corners rounded; a round window and a handle on it.
  const corner = segs(ctx, 4, 3, 2);
  const door: [number, number][] = [];
  const zc = -0.37, yc = -0.03, hz = 0.28, hy = 0.19, rc = 0.07;
  for (const [cz, cy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]] as const) {
    for (let i = 0; i <= corner; i++) {
      const a = a0 + (Math.PI / 2) * i / corner;
      door.push([zc + cz * (hz - rc) + rc * Math.cos(a), yc + cy * (hy - rc) + rc * Math.sin(a)]);
    }
  }
  // The side plane x = 0.58, seen from outside: u along −y, v along −z (rotation of +Y onto +X).
  const plane: { position: Vec3; rotation: Vec3 } = { position: [BODY.a, 0, 0], rotation: [0, 0, -Math.PI / 2] };
  const onSide = ([z, y]: [number, number]): [number, number] => [-y, -z];
  bothSides(ctx, () => {
    flushPanel(ctx, 'secondary', door.map(onSide), plane);
    if (ctx.detail === 0) return;
    porthole(ctx, [BODY.a, 0.05, -0.37], [1, 0, 0], 0.05, 2 * FLUSH);
    flushPanel(ctx, 'trim', ([[-0.6, -0.071], [-0.5, -0.071], [-0.5, -0.049], [-0.6, -0.049]] as [number, number][]).map(onSide), plane, 2 * FLUSH);
    for (const z of [0.22, 0.5]) porthole(ctx, [BODY.a, 0.06, z], [1, 0, 0], 0.045);
  });
}

/**
 * A round lamp painted on the van's bow: a disc of trim whose points follow
 * the nose (`noseZ` gives the surface's z at x, y), lifted FLUSH towards the
 * front, so it lies on the curve instead of standing off it as a flat disc would.
 */
function bowLamp(ctx: Ctx, x0: number, y0: number, r: number, noseZ: (x: number, y: number) => number, k: number) {
  const at = (x: number, y: number): Vec3 => [x, y, noseZ(x, y) - FLUSH];
  const p: number[] = [];
  for (let i = 0; i < k; i++) {
    const t0 = (2 * Math.PI * i) / k, t1 = (2 * Math.PI * (i + 1)) / k;
    p.push(...at(x0, y0), ...at(x0 + r * Math.cos(t1), y0 + r * Math.sin(t1)), ...at(x0 + r * Math.cos(t0), y0 + r * Math.sin(t0)));
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  ctx.b.geometry(ctx.mat('trim'), g);
}

// ---------------------------------------------------------- wedge interceptor

/** Racer section: flat deck, a straight upper slope to an eased chine, a round belly to the keel. */
interface RacerSection { z: number; w: number; chineY: number; top: number; deck: number; bot: number }
/** Direction the belly rises into the chine at, steeper than the industrial lower slope so the belly is full. */
const BELLY_IN = norm2(0.45, 0.89);

/** Right half from the keel to the deck centre, and the role of each strip between its points. */
function racerHalf(s: RacerSection, k: { belly: number; chine: number; deck: number }) {
  const slope = norm2(s.deck - s.w, s.top - s.chineY);
  const chine = fillet([s.w, s.chineY], BELLY_IN, slope, 0.06, k.chine);
  const deck = fillet([s.deck, s.top], slope, [-1, 0], 0.06, k.deck);
  const q = chine[0], b0: P2 = [0, s.bot], b1: P2 = [0.25 * s.w / 0.5, s.bot], b2: P2 = [q[0] - BELLY_IN[0] * 0.1, q[1] - BELLY_IN[1] * 0.1];
  const belly = Array.from({ length: k.belly }, (_, i) => {
    const t = (i + 1) / k.belly, u = 1 - t;
    return [0, 1].map(c => u * u * u * b0[c] + 3 * u * u * t * b1[c] + 3 * u * t * t * b2[c] + t * t * t * q[c]) as P2;
  });
  const pts: P2[] = [[0, s.bot], ...belly, ...chine.slice(1), ...deck, [0, s.top]];
  // Belly, chine round, then the slope, the deck round and the deck (one strip more than deck points).
  const roles: Role[] = [...belly.map(() => 'secondary' as Role), ...chine.slice(1).map(() => 'trim' as Role), 'primary', ...deck.map(() => 'primary' as Role)];
  return { pts, roles };
}

function racerRing(pts: P2[], z: number): Vec3[] {
  const right = pts.slice(1, -1).map(([x, y]) => [x, y, z] as Vec3);
  return [[0, pts[0][1], z], ...right, [0, pts[pts.length - 1][1], z], ...right.slice().reverse().map(p => [-p[0], p[1], p[2]] as Vec3)];
}

/**
 * Interceptor hull as a soft little racer: a rounded wedge that keeps the
 * industrial hull's flat deck (y 0.22, ±0.3), the straight upper slope that
 * carries the registration and the side engines, the chine's widest line
 * (x 0.5, y −0.06) and the aft face (z 1.72). The chine is eased into a
 * round and painted trim, the belly is full and round, and the nose is an
 * ogive that rounds off at z −2.38 in a trim cone. Two small portholes a side.
 */
function racerHull(ctx: Ctx) {
  const k = { belly: segs(ctx, 4, 3, 2), chine: segs(ctx, 3, 2, 1), deck: segs(ctx, 2, 2, 1) };
  const FULL: RacerSection = { z: 0, w: 0.5, chineY: -0.06, top: 0.22, deck: 0.3, bot: -0.3 };
  const full = racerHalf(FULL, k);
  const AFT: RacerSection = { z: 1.72, w: 0.44, chineY: -0.05, top: 0.22, deck: 0.28, bot: -0.21 };
  const zb = -1.2, length = 1.18, tipY = -0.035;
  // Nose: the full section drawn in towards the tip, width as an ogive, the deck in an almost straight wedge, the belly sweeping up; the section turns elliptical towards the tip.
  const xs = ctx.detail === 2 ? [1, 0.995, 0.98, 0.95, 0.9, 0.82, 0.72, 0.6, 0.45, 0.3, 0.15]
    : ctx.detail === 1 ? [1, 0.99, 0.95, 0.88, 0.75, 0.55, 0.3] : [1, 0.96, 0.8, 0.45];
  const noseRing = (x: number): Vec3[] => {
    const gw = (1 - x ** 1.2) ** (1 / 1.5), gt = (1 - x ** 1.15) ** (1 / 1.5), gb = Math.sqrt(1 - x * x), m = x ** 1.3, e = 2 / 2.4;
    const up = FULL.top - tipY, down = tipY - FULL.bot;
    return racerRing(full.pts.map(([px, py]) => {
      const above = py >= tipY, g = above ? gt : gb, h = above ? up : down;
      const th = Math.atan2((py - tipY) / h, px / FULL.w);
      const sx = px * gw, sy = tipY + (py - tipY) * g;
      const c = Math.cos(th), sn = Math.sin(th);
      const ex = FULL.w * gw * Math.sign(c) * Math.abs(c) ** e, ey = tipY + h * g * Math.sign(sn) * Math.abs(sn) ** e;
      return [sx + (ex - sx) * m, sy + (ey - sy) * m] as P2;
    }), zb - length * x);
  };
  const cone = ctx.detail === 0 ? 2 : 4;   // rings of the trim nose cone
  const nose = xs.map(noseRing);
  const rings = [...nose, racerRing(full.pts, zb), racerRing(full.pts, 1.3), racerRing(racerHalf(AFT, k).pts, AFT.z)];
  const roles = [...full.roles, ...full.roles.slice().reverse()];
  smoothSkin(ctx, rings.slice(0, cone), () => 'trim');
  // The trim band round the tail, painted on the last stretch of skin.
  const last = rings[rings.length - 1], band = between(rings[rings.length - 2], last, 1 - TAIL_BAND / (AFT.z - 1.3));
  smoothSkin(ctx, [...rings.slice(cone - 1, -1), band], j => roles[j]);
  smoothSkin(ctx, [band, last], () => 'trim', { end: 'secondary' });

  // Portholes on the upper slope, between the registration and the side engine.
  if (ctx.detail === 0) return;
  const n: Vec3 = [0.28 / 0.3441, 0.2 / 0.3441, 0];
  bothSides(ctx, () => {
    for (const z of [0.04, 0.3]) porthole(ctx, [0.4, 0.08, z], n, 0.035);
  });
}

export const VILLAGE_HULLS: Record<string, (ctx: Ctx) => void> = { 'slim-courier': courierHull, 'boxy-hauler': vanHull, 'wedge-interceptor': racerHull };
