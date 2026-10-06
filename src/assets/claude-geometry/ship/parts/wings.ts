import type { Vec3 } from '../../core/vec.ts';
import type { Ring } from '../geom.ts';
import { navLight } from '../kit.ts';
import type { Ctx } from '../kit.ts';
import type { WingId } from '../spec.ts';

// Wings are authored as the right (starboard) wing: plug on the hull side at
// the root chord's mid point, span along +X, nose towards −Z. The left wing is
// the same part in the mirrored wing.left socket.
//
// A wing is a box spar section lofted between span stations, with the
// trailing edge cut back for control surfaces that hang behind it with a
// visible gap, a bolted root flange, bare-metal leading edges and a tip fairing
// carrying the navigation light.

export interface Span { x: number; le: number; te: number; t: number; y: number }

/** Seven-point section: leading edge, upper front/rear, spar top/bottom, lower rear/front. */
export function airfoil(s: Span, spar: number): Ring {
  const c = s.te - s.le;
  return [
    [s.x, s.y, s.le],
    [s.x, s.y + s.t / 2, s.le + 0.22 * c],
    [s.x, s.y + s.t * 0.4, s.te - 0.25 * c],
    [s.x, s.y + spar * s.t / 2, s.te],
    [s.x, s.y - spar * s.t / 2, s.te],
    [s.x, s.y - s.t * 0.33, s.te - 0.25 * c],
    [s.x, s.y - s.t * 0.42, s.le + 0.22 * c],
  ];
}
const WING_GROUP = ['le', 'upper', 'upper', 'spar', 'lower', 'lower', 'le'];

/** Control surface behind a spar, chord `c` from `z0`, from thickness t0 at its hinge. */
function surfaceRing(x: number, y: number, z0: number, c: number, t0: number): Ring {
  return [
    [x, y + t0 / 2, z0], [x, y + t0 * 0.12, z0 + c], [x, y - t0 * 0.12, z0 + c], [x, y - t0 / 2, z0], [x, y, z0 - t0 * 0.35],
  ];
}

const lerpSpan = (a: Span, b: Span, x: number): Span => {
  const t = (x - a.x) / (b.x - a.x);
  return { x, le: a.le + (b.le - a.le) * t, te: a.te + (b.te - a.te) * t, t: a.t + (b.t - a.t) * t, y: a.y + (b.y - a.y) * t };
};

interface WingSpec {
  root: Span; tip: Span;
  /** Control surface chord at root and tip. */
  cs: [number, number];
  /** Control surface panels as span ranges. */
  panels: [number, number][];
  tipPod: boolean;
  /** Put the navigation light on the tip (default); false when the part places its own. */
  nav?: boolean;
}

function wing(ctx: Ctx, w: WingSpec) {
  const spar = 0.42;
  const cut = (s: Span, cs: number): Span => ({ ...s, te: s.te - cs });
  const root = cut(w.root, w.cs[0]), tip = cut(w.tip, w.cs[1]);
  const mid = lerpSpan(root, tip, (root.x + tip.x) / 2);
  ctx.skin([airfoil(root, spar), airfoil(mid, spar), airfoil(tip, spar)], { capEnd: !w.tipPod, group: j => WING_GROUP[j] },
    { le: 'metal', upper: 'primary', lower: 'secondary', spar: 'dark', cap1: 'trim' });

  // Control surfaces, each its own panel with a 12 mm hinge gap.
  for (const [x0, x1] of w.panels) {
    const a = lerpSpan(w.root, w.tip, x0), b = lerpSpan(w.root, w.tip, x1);
    const ca = w.cs[0] + (w.cs[1] - w.cs[0]) * (x0 - w.root.x) / (w.tip.x - w.root.x);
    const cb = w.cs[0] + (w.cs[1] - w.cs[0]) * (x1 - w.root.x) / (w.tip.x - w.root.x);
    const ta = a.t * spar * 0.95, tb = b.t * spar * 0.95;
    ctx.skin([surfaceRing(x0, a.y, a.te - ca + 0.012, ca - 0.012, ta), surfaceRing(x1, b.y, b.te - cb + 0.012, cb - 0.012, tb)],
      { capStart: true, capEnd: true }, { '*': 'secondary', cap0: 'dark', cap1: 'dark' });
    // Actuator fairings under the hinge line.
    if (ctx.detail >= 1) for (const f of [0.3, 0.75]) {
      const s = lerpSpan(a, b, x0 + (x1 - x0) * f);
      const c = ca + (cb - ca) * f;
      ctx.box('metal', [0.026, 0.026, 0.13], [s.x, s.y - s.t * 0.3, s.te - c - 0.01], undefined, 0.006);
    }
  }

  // Root flange: the connector plate on the hull side, bolted top and bottom.
  const chord = w.root.te - w.root.le, zc = (w.root.le + w.root.te) / 2;
  ctx.box('metal', [0.026, w.root.t + 0.07, chord + 0.04], [0.013, w.root.y, zc], undefined, 0.008);
  for (const s of [1, -1]) ctx.boltRow([0.027, w.root.y + s * (w.root.t / 2 + 0.02), w.root.le + 0.06], [0.027, w.root.y + s * (w.root.t / 2 + 0.02), w.root.te - 0.06], 7, [1, 0, 0], 0.009);

  if (w.tipPod) {
    // Tip fairing pod with the navigation light at its nose.
    const t = w.tip, len = t.te - t.le + 0.1, z0 = t.le - 0.06;
    const r = Math.max(0.026, t.t * 0.75);
    ctx.lathe('secondary', [[0, z0], [r * 0.6, z0 + 0.03], [r, z0 + 0.09], [r, z0 + len - 0.06], [r * 0.5, z0 + len]], { position: [t.x + r * 0.6, t.y, 0] });
    navLight(ctx, [t.x + r * 0.6, t.y, z0 + 0.02], [0.4, 0, -1], 'side');
  } else if (w.nav !== false) {
    navLight(ctx, [w.tip.x + 0.008, w.tip.y, w.tip.le + 0.06], [1, 0, -0.2], 'side');
  }
}

function swept(ctx: Ctx) {
  wing(ctx, {
    root: { x: 0, le: -0.44, te: 0.52, t: 0.1, y: 0 },
    tip: { x: 1.09, le: 0.3, te: 0.66, t: 0.042, y: 0.045 },
    cs: [0.17, 0.11],
    panels: [[0.12, 0.54], [0.58, 1.02]],
    tipPod: true,
  });
  // Walkway edge marking near the root.
  if (ctx.detail >= 1) {
    const a: Vec3 = [0.05, 0.052, -0.3], b: Vec3 = [0.05, 0.052, 0.25];
    ctx.strut('hazard', a, b, 0.03, 0.004, 0);
  }
}

function delta(ctx: Ctx) {
  const root: Span = { x: 0, le: -0.8, te: 0.7, t: 0.11, y: 0 };
  const tip: Span = { x: 1.13, le: 0.42, te: 0.7, t: 0.032, y: -0.025 };
  wing(ctx, { root, tip, cs: [0.17, 0.1], panels: [[0.1, 0.56], [0.6, 1.08]], tipPod: false });
  // Boundary-layer fence over the upper surface and a hardpoint underneath.
  const f = lerpSpan(root, tip, 0.62);
  ctx.strut('metal', [0.62, f.y + f.t * 0.45, f.le + 0.04], [0.62, f.y + f.t * 0.4, f.te - 0.2], 0.01, 0.07, 0.002, [1, 0, 0]);
  const h = lerpSpan(root, tip, 0.4);
  ctx.box('metal', [0.05, 0.05, 0.36], [0.4, h.y - h.t * 0.42 - 0.02, (h.le + h.te) / 2 - 0.05], undefined, 0.008);
  if (ctx.detail >= 1) {
    ctx.box('hazard', [0.052, 0.012, 0.05], [0.4, h.y - h.t * 0.42 - 0.04, (h.le + h.te) / 2 - 0.2], undefined, 0);
    ctx.strut('hazard', [0.05, root.t * 0.5 + 0.002, -0.4], [0.05, root.t * 0.45 + 0.002, 0.35], 0.03, 0.004, 0);
  }
}

/** Store hung under a pylon: a lathe body with bands, nose and tail cone. */
function store(ctx: Ctx, at: Vec3, r: number, len: number, noseRole: 'glass' | 'metal') {
  ctx.within({ position: at }, () => {
    const z0 = -len / 2, z1 = len / 2;
    ctx.lathe(noseRole === 'glass' ? 'dark' : 'secondary', [[0, z0], [r * 0.55, z0 + r * 0.6], [r * 0.9, z0 + r * 1.6], [r, z0 + r * 2.4]]);
    ctx.lathe('secondary', [[r, z0 + r * 2.4], [r, z1 - r * 2], [r * 0.6, z1 - 0.01], [0, z1]]);
    if (noseRole === 'glass') ctx.lathe('glass', [[0, z0 - 0.002], [r * 0.5, z0 + r * 0.58]]);
    if (ctx.detail >= 1) for (const z of [z0 + r * 2.4, (z0 + z1) / 2]) ctx.lathe('metal', [[r, z - 0.012], [r + 0.005, z - 0.008], [r + 0.005, z + 0.008], [r, z + 0.012]]);
  });
}

function stubPylon(ctx: Ctx) {
  const root: Span = { x: 0, le: -0.36, te: 0.42, t: 0.13, y: 0 };
  const tip: Span = { x: 0.78, le: -0.24, te: 0.37, t: 0.1, y: 0 };
  wing(ctx, { root, tip, cs: [0.13, 0.11], panels: [[0.1, 0.7]], tipPod: false, nav: false });
  // End plate with the navigation light at its leading corner.
  ctx.box('secondary', [0.026, 0.27, 0.74], [0.792, -0.01, 0.06], undefined, 0.01);
  ctx.box('trim', [0.028, 0.03, 0.74], [0.792, 0.11, 0.06], undefined, 0.006);
  // Two pylons with stores: a cargo pod inboard, a sensor pod outboard.
  for (const [x, r, len, nose] of [[0.3, 0.075, 0.72, 'metal'], [0.6, 0.055, 0.5, 'glass']] as const) {
    const s = lerpSpan(root, tip, x);
    const yb = s.y - s.t * 0.4;
    ctx.box('metal', [0.022, 0.1, 0.36], [x, yb - 0.05, (s.le + s.te) / 2 - 0.04], undefined, 0.006);
    if (ctx.detail >= 1) {
      for (const dz of [-0.1, 0.06]) ctx.strut('metal', [x - 0.05, yb - 0.1 - r * 0.5, (s.le + s.te) / 2 + dz], [x - 0.012, yb - 0.08, (s.le + s.te) / 2 + dz], 0.012);
      ctx.box('hazard', [0.024, 0.03, 0.03], [x, yb - 0.085, (s.le + s.te) / 2 - 0.2], undefined, 0);
    }
    store(ctx, [x, yb - 0.1 - r, (s.le + s.te) / 2 - 0.02], r, len, nose);
  }
  navLight(ctx, [0.806, 0.06, -0.3], [0.5, 0, -1], 'side');
}

export const WING_BUILDERS: Record<WingId, (ctx: Ctx) => void> = {
  swept,
  delta,
  'stub-pylon': stubPylon,
};
