import type { Vec3 } from '../../../core/vec.ts';
import { navLight } from '../../kit.ts';
import type { Ctx, Role } from '../../kit.ts';
import { segs, smoothSkin, turn } from './shapes.ts';

// Village wings: the industrial wings' root plug, span and navigation-light points kept.

// -------------------------------------------------------------------- wings

/**
 * Short rounded wing: a smooth lens section lofted out to a tip pod that
 * carries the light where the swept wing's pod carries it. Upper surface
 * primary, lower secondary, the pod in trim.
 */
function roundWing(ctx: Ctx) {
  const pts = segs(ctx, 6, 4, 3);
  const section = (x: number, le: number, te: number, t: number, y: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i < 2 * pts; i++) {
      const a = Math.PI * 2 * i / (2 * pts), c = (te - le) / 2, zc = (le + te) / 2;
      // Lens: blunt leading edge, thin trailing edge.
      const z = zc - c * Math.cos(a), thick = (t / 2) * Math.sin(a);
      out.push([x, y + thick * (Math.sin(a) > 0 ? 1 : 0.7), z]);
    }
    return out;
  };
  const stations = [
    section(0, -0.38, 0.5, 0.1, 0), section(0.45, -0.18, 0.5, 0.08, 0.018), section(0.85, 0.06, 0.48, 0.06, 0.035), section(1.05, 0.18, 0.44, 0.048, 0.043),
  ];
  smoothSkin(ctx, stations, j => (j < pts ? 'primary' : 'secondary'), { end: 'primary' });
  // Tip pod round the light point, a fat little teardrop.
  turn(ctx, 'trim', [[0.0, 0.215], [0.03, 0.235], [0.042, 0.28], [0.04, 0.38], [0.025, 0.45], [0.0, 0.48]], segs(ctx, 12, 8, 6), { position: [1.09, 0.045, 0] });
  navLight(ctx, [1.09 + 0.0189, 0.045, 0.26], [0.4, 0, -1], 'side');
}

/**
 * Lens section at span station x: an ellipse in (z, y) from the leading to the
 * trailing edge, `under` times as deep below the chord line as above it. The
 * first `pts` points are the upper surface. `blunt` < 1 fills out the leading
 * half towards a rounded box, for a fat, friendly nose.
 */
function lens(pts: number, x: number, le: number, te: number, t: number, y: number, under = 0.75, blunt = 1): Vec3[] {
  const c = (te - le) / 2, zc = (le + te) / 2;
  return Array.from({ length: 2 * pts }, (_, i) => {
    const a = Math.PI * i / pts, s = Math.sin(a), k = Math.cos(a);
    return [x, y + (t / 2) * s * (s > 0 ? 1 : under), zc - c * (k > 0 ? k ** blunt : k)] as Vec3;
  });
}

/** z on a polyline of (x, z) points with increasing x, at x (held at its ends). */
function along(line: [number, number][], x: number): number {
  if (x <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [x0, z0] = line[i - 1], [x1, z1] = line[i];
    if (x <= x1) return x1 - x0 < 1e-9 ? z1 : z0 + (z1 - z0) * (x - x0) / (x1 - x0);
  }
  return line[line.length - 1][1];
}

/**
 * Soft delta: a manta-like planform. The leading edge leaves the root at a
 * blunt, rounded apex, bows forward and sweeps into a round tip of 0.14 m
 * radius whose outermost point carries the light where the delta's is; the
 * trailing edge (the hinge line) runs nearly straight behind. A separate trim
 * elevon hangs behind it with a visible gap, and one small rounded fence
 * stands on top. Upper surface primary, lower secondary.
 */
function softDelta(ctx: Ctx) {
  const pts = segs(ctx, 5, 5, 3);
  const dy = (x: number) => -0.025 * x / 1.13;   // the delta's slight droop to its tip
  // Tip round: centre (xc, zc), radius rho, its outermost point at x 1.132, z 0.48 (the light's).
  const rho = 0.14, xc = 1.132 - rho;
  const te = (x: number) => 0.56 + 0.06 * (Math.min(x, xc) / xc) ** 2;
  const zc = te(xc) - rho;
  // Leading edge: a cubic from the apex (0, −0.74), leaving it at a blunt angle, to where it
  // meets the round tangentially (phi from the outboard direction, forward).
  const phi = 32 * Math.PI / 180, A: [number, number] = [0, -0.74];
  const P: [number, number] = [xc + rho * Math.cos(phi), zc - rho * Math.sin(phi)];
  const L = Math.hypot(P[0] - A[0], P[1] - A[1]), d0 = [1 / Math.hypot(1, 0.36), 0.36 / Math.hypot(1, 0.36)];
  const c1 = [A[0] + 0.38 * L * d0[0], A[1] + 0.38 * L * d0[1]], c2 = [P[0] - 0.32 * L * Math.sin(phi), P[1] - 0.32 * L * Math.cos(phi)];
  const leLine: [number, number][] = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [w[0] * A[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * P[0], w[0] * A[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * P[1]] as [number, number];
  });
  const arc = (a: number): [number, number] => [xc + rho * Math.cos(a), zc + rho * Math.sin(a)];
  for (let i = 1; i <= 8; i++) leLine.push(arc(-phi * (1 - i / 8)));
  const teLine: [number, number][] = Array.from({ length: 9 }, (_, i) => [xc * i / 8, te(xc * i / 8)] as [number, number]);
  for (let i = 1; i <= 12; i++) teLine.push(arc(Math.PI / 2 * (1 - i / 12)));
  const tipX = xc + rho;
  const depth = (x: number) => (0.105 - 0.05 * x / 1.13) * Math.min(1, Math.sqrt((along(teLine, x) - along(leLine, x)) / 0.32));
  const xs = ctx.detail === 2 ? [0, 0.1, 0.25, 0.45, 0.65, 0.82, 0.95, 1.04, 1.09, 1.12]
    : ctx.detail === 1 ? [0, 0.15, 0.4, 0.65, 0.85, 1.0, 1.08, 1.12] : [0, 0.4, 0.8, 1.05];
  const stations = xs.map(x => lens(pts, x, along(leLine, x), along(teLine, x), depth(x), dy(x)));
  stations.push(lens(pts, tipX, zc, zc, 0, dy(tipX)));
  smoothSkin(ctx, stations, j => (j < pts ? 'primary' : 'secondary'));

  // Elevon: a thin flap 18 mm behind the hinge line, closing to a point through a short round
  // at each end (f is the share of its full chord and depth).
  const ep = segs(ctx, 3, 3, 2), x0 = 0.12, x1 = 0.9, gap = 0.018;
  const flap = (x: number, f: number) => {
    const h = te(x) + gap, chord = 0.17 - 0.05 * x, trim = chord * (1 - f) * 0.5;
    return lens(ep, x, h + trim, h + chord - trim, (0.02 - 0.006 * x) * f, dy(x), 1, 0.5);
  };
  const ends = ctx.detail === 0 ? [[x0 - 0.02, 0], [x0 + 0.02, 1], [x1 - 0.02, 1], [x1 + 0.02, 0]]
    : [[x0 - 0.025, 0], [x0 - 0.012, 0.7], [x0 + 0.015, 1], [x1 - 0.015, 1], [x1 + 0.012, 0.7], [x1 + 0.025, 0]];
  smoothSkin(ctx, ends.map(([x, f]) => flap(x, f)), () => 'trim');

  // Fence: a small flattened half-lens standing on the upper surface at x 0.62.
  const fx = 0.62, fz = (along(leLine, fx) + along(teLine, fx)) / 2 + 0.04;
  const fence: [number, number][] = ctx.detail === 0 ? [[0, -0.19], [0.075, -0.03], [0, 0.19]] : [[0, -0.19], [0.05, -0.13], [0.078, -0.03], [0.06, 0.1], [0, 0.19]];
  turn(ctx, 'trim', fence, segs(ctx, 6, 6, 4), { position: [fx, dy(fx) + depth(fx) / 2 - 0.012, fz], scale: [0.24, 1, 1] }, Math.PI, 0);

  navLight(ctx, [1.13 + 0.008, -0.025, 0.42 + 0.06], [1, 0, -0.2], 'side');
}

/** Rounded mail canister along z: a nose cap, a body, a raised trim band and a rounded tail. */
function canister(ctx: Ctx, at: Vec3, r: number, len: number) {
  const n = segs(ctx, 12, 12, 6), z0 = -len / 2, z1 = len / 2, cap = z0 + r * 1.1;
  ctx.within({ position: at }, () => {
    turn(ctx, 'trim', [[0, z0], [r * 0.5, z0 + r * 0.13], [r * 0.87, z0 + r * 0.5], [r * 1.04, cap]], n);
    const body: [number, number][] = ctx.detail === 2 ? [[r, cap], [r, z1 - r * 0.9], [r * 0.82, z1 - r * 0.38], [r * 0.45, z1 - r * 0.07], [0, z1]]
      : ctx.detail === 1 ? [[r, cap], [r, z1 - r * 0.85], [r * 0.7, z1 - r * 0.25], [0, z1]] : [[r, cap], [r, z1 - r * 0.7], [0, z1]];
    turn(ctx, 'primary', body, n);
    if (ctx.detail >= 1) {
      const zb = (cap + z1) / 2 - r * 0.2;
      turn(ctx, 'trim', [[r * 0.99, zb - r * 0.4], [r * 1.1, zb], [r * 0.99, zb + r * 0.4]], n);
    }
  });
}

/** Short rounded pylon: a smooth lens-section post from `top` down to `bottom` (y), centred on (x, z). */
function pylon(ctx: Ctx, role: Role, x: number, z: number, top: number, bottom: number, half: number, w: number) {
  const n = segs(ctx, 6, 4, 3);
  const ring = (y: number, h: number): Vec3[] => Array.from({ length: 2 * n }, (_, i) => {
    const a = Math.PI * i / n;
    return [x + w * Math.sin(a), y, z - h * Math.cos(a)] as Vec3;
  });
  smoothSkin(ctx, [ring(top, half), ring(bottom, half * 0.7)], () => role);
}

/**
 * Stub wing with two mail canisters: a short, thick stub whose leading and
 * trailing edges round in towards the tip, a short trim tip pod carrying the
 * light at the end plate's leading corner, and two rounded canisters (the big
 * one inboard) on short rounded pylons beneath, where the stores hang.
 */
function stubCanisters(ctx: Ctx) {
  const pts = segs(ctx, 6, 4, 3);
  const xs = ctx.detail === 2 ? [0, 0.3, 0.55, 0.7, 0.77] : ctx.detail === 1 ? [0, 0.4, 0.66, 0.77] : [0, 0.45, 0.77];
  const le = (x: number) => -0.36 + 0.2 * (x / 0.77) ** 2.4, te = (x: number) => 0.42 - 0.18 * (x / 0.77) ** 2.4;
  const depth = (x: number) => 0.14 - 0.04 * x / 0.77;
  smoothSkin(ctx, xs.map(x => lens(pts, x, le(x), te(x), depth(x), 0, 0.85, 0.6)), j => (j < pts ? 'primary' : 'secondary'));
  // Tip pod: a short trim teardrop on the tip, the light on its forward shoulder.
  const pod: [number, number][] = ctx.detail === 0
    ? [[0, -0.37], [0.05, -0.26], [0.045, 0.08], [0, 0.27]]
    : [[0, -0.37], [0.033, -0.35], [0.051, -0.29], [0.056, -0.16], [0.048, 0.04], [0.026, 0.19], [0, 0.27]];
  turn(ctx, 'trim', pod, segs(ctx, 12, 12, 6), { position: [0.77, 0.02, 0] });
  // Two canisters on pylons.
  for (const [x, r, len] of [[0.3, 0.076, 0.68], [0.565, 0.06, 0.54]] as const) {
    const zc = (le(x) + te(x)) / 2, under = -depth(x) / 2 * 0.85, y = under - 0.055 - r;
    pylon(ctx, 'secondary', x, zc + 0.02, under + 0.02, y + r * 0.6, Math.min(0.13, len * 0.24), 0.017);
    canister(ctx, [x, y, zc - 0.02], r, len);
  }
  navLight(ctx, [0.806, 0.06, -0.3], [0.5, 0, -1], 'side');
}

export const VILLAGE_WINGS: Record<string, (ctx: Ctx) => void> = { swept: roundWing, delta: softDelta, 'stub-pylon': stubCanisters };
