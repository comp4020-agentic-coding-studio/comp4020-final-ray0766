import type { Vec3 } from '../../../core/vec.ts';
import { rotationToNormal } from '../../geom.ts';
import { bothSides } from '../../kit.ts';
import type { Ctx, Role } from '../../kit.ts';
import { sectionRing, segs, smoothSkin, STRIPE } from './shapes.ts';
import type { Groups, Section } from './shapes.ts';

// Village hulls: the industrial hulls' decks, sides, aft faces, sockets and
// registration panels kept; rounded sections and noses in between.

// --------------------------------------------------------------------- hull

/**
 * Courier hull: a rounded box section that keeps the industrial hull's flat
 * deck (y 0.28, ±0.3), sides (x ±0.42) and aft face (z 1.75), with an
 * egg-shaped nose that rounds off at z −2.39, the industrial nose tip, so the
 * tile's 4.2 m still holds. Upper body in primary, a trim
 * cheat line that sweeps round the nose, secondary below it (where the
 * registration sits), two portholes a side.
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
  for (const u of ctx.detail === 0 ? [0.995, 0.9, 0.66, 0.3] : [0.995, 0.96, 0.9, 0.8, 0.66, 0.46, 0.24]) {
    const s = Math.sqrt(1 - u * u);
    sections.push({ z: -1.2 - 1.2 * u, a: body.a * s, b: body.b * s, yc: body.yc, p: 6 - 3.6 * u });
  }
  sections.push(body, { ...body, z: 0.85 }, { z: 1.4, a: 0.41, b: 0.295, yc: -0.015, p: 6 }, { z: 1.75, a: 0.39, b: 0.26, yc: 0.02, p: 6 });
  smoothSkin(ctx, sections.map(s => sectionRing(s, angles)), role, { start: 'trim', end: 'secondary' });
  // A trim collar round the aft face, standing 15 mm aft of it as the industrial hull's rim does.
  const aft = sections[sections.length - 1], collar = (z: number): Section => ({ ...aft, z, a: aft.a + 0.008, b: aft.b + 0.008 });
  smoothSkin(ctx, [collar(1.72), collar(1.765)].map(s => sectionRing(s, angles)), () => 'trim');

  // Portholes ahead of the wing, clear of the registration (z −1.01…−0.59) and the engine pylon (z ≥ 0.7).
  if (ctx.detail === 0) return;
  bothSides(ctx, () => {
    for (const z of [-0.3, 0.1]) {
      ctx.cylinder('metal', 0.056, 0.056, 0.014, { position: [0.421, 0.045, z], rotation: [0, 0, Math.PI / 2] }, segs(ctx, 16, 12, 8));
      ctx.cylinder('glass', 0.042, 0.042, 0.018, { position: [0.423, 0.045, z], rotation: [0, 0, Math.PI / 2] }, segs(ctx, 16, 12, 8));
    }
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

/** A ring pushed `d` outward in its own plane, along each point's smoothed normal (collars). */
function grow(ring: Vec3[], d: number, dz = 0): Vec3[] {
  const n = ring.length;
  const c = ring.reduce<Vec3>((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
  return ring.map((p, j) => {
    const a = ring[(j + n - 1) % n], b = ring[(j + 1) % n];
    let [nx, ny] = norm2(b[1] - a[1], -(b[0] - a[0]));
    if (nx * (p[0] - c[0]) + ny * (p[1] - c[1]) < 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * d, p[1] + ny * d, p[2] + dz] as Vec3;
  });
}

/** Round porthole on a surface: a metal ring and the glass, standing along the outward normal `n`. */
function porthole(ctx: Ctx, at: Vec3, n: Vec3, r: number) {
  const k = segs(ctx, 16, 12, 8);
  ctx.within({ position: at, rotation: rotationToNormal(n) }, () => {
    ctx.cylinder('metal', r + 0.014, r + 0.014, 0.014, { position: [0, 0.001, 0] }, k);
    ctx.cylinder('glass', r, r, 0.018, { position: [0, 0.003, 0] }, k);
  });
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
 * that runs round the bow at y −0.3. One raised cargo door with a rounded
 * outline and a round window, two portholes aft of it, two round lamps low
 * on the bow and two tail lamps; primary above the fender, secondary in the
 * shallow bowl under it. No ribs, skids or rails.
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
  smoothSkin(ctx, rings, role, { end: 'secondary' });
  // A trim collar round the aft face, as on the courier.
  const last = rings[rings.length - 1];
  smoothSkin(ctx, [grow(last, 0.008, -0.03), grow(last, 0.008, 0.015)], () => 'trim');

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
    // Two round lamps low on the bow, just above the fender: where the nose surface passes through (±0.3, −0.17).
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
    const x0 = 0.3, y0 = -0.17, h = 0.01, z0 = noseZ(x0, y0);
    const n: Vec3 = [(noseZ(x0 + h, y0) - noseZ(x0 - h, y0)) / (2 * h), (noseZ(x0, y0 + h) - noseZ(x0, y0 - h)) / (2 * h), -1];
    bothSides(ctx, () => {
      porthole(ctx, [x0, y0, z0], n, 0.05);
      // A round tail lamp in each upper corner of the aft face, clear of the aft engines' flanges.
      ctx.within({ position: [0.42, 0.2, aft.z], rotation: [Math.PI / 2, 0, 0] }, () => {
        ctx.cylinder('metal', 0.054, 0.054, 0.012, { position: [0, 0.002, 0] }, segs(ctx, 16, 12, 8));
        ctx.cylinder('trim', 0.04, 0.04, 0.016, { position: [0, 0.004, 0] }, segs(ctx, 16, 12, 8));
      });
    });
  }

  // Cargo door: one panel standing 14 mm proud, its outline rounded, between the registration and the wing root; a round window and a trim handle.
  const corner = segs(ctx, 3, 2, 1);
  const outline = (grow0: number): [number, number][] => {
    const zc = -0.37, yc = -0.03, hz = 0.28, hy = 0.19, rc = 0.07, out: [number, number][] = [];
    for (const [cz, cy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]] as const) {
      for (let i = 0; i <= corner; i++) {
        const a = a0 + (Math.PI / 2) * i / corner;
        out.push([zc + cz * (hz - rc) + (rc + grow0) * Math.cos(a), yc + cy * (hy - rc) + (rc + grow0) * Math.sin(a)]);
      }
    }
    return out;
  };
  bothSides(ctx, () => {
    smoothSkin(ctx, [[-0.004, 0.009], [0.014, 0]].map(([dx, g]) => outline(g).map(([z, y]) => [BODY.a + dx, y, z] as Vec3)), () => 'primary', { end: 'primary' });
    if (ctx.detail === 0) return;
    porthole(ctx, [BODY.a + 0.014, 0.05, -0.37], [1, 0, 0], 0.05);
    ctx.rod('trim', [BODY.a + 0.022, -0.06, -0.6], [BODY.a + 0.022, -0.06, -0.5], 0.011, 8);
    for (const z of [0.22, 0.5]) porthole(ctx, [BODY.a, 0.06, z], [1, 0, 0], 0.045);
  });
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
  smoothSkin(ctx, rings.slice(cone - 1), j => roles[j], { end: 'secondary' });
  const last = rings[rings.length - 1];
  smoothSkin(ctx, [grow(last, 0.008, -0.03), grow(last, 0.008, 0.015)], () => 'trim');

  // Portholes on the upper slope, between the registration and the side engine.
  if (ctx.detail === 0) return;
  const n: Vec3 = [0.28 / 0.3441, 0.2 / 0.3441, 0];
  bothSides(ctx, () => {
    for (const z of [0.04, 0.3]) porthole(ctx, [0.4, 0.08, z], n, 0.035);
  });
}

export const VILLAGE_HULLS: Record<string, (ctx: Ctx) => void> = { 'slim-courier': courierHull, 'boxy-hauler': vanHull, 'wedge-interceptor': racerHull };
