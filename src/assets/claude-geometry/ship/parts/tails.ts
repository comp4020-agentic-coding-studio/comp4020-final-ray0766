import type { Vec3 } from '../../core/vec.ts';
import type { Ring } from '../geom.ts';
import { antenna, bothSides, navLight } from '../kit.ts';
import type { Ctx } from '../kit.ts';
import type { TailId } from '../spec.ts';

// Tails plug into the `tail` socket on the aft deck; plug = deck surface on
// the centre line. A fin is lofted upwards through airfoil sections (thickness
// along X), with a rudder hung behind its rear spar, a bolted root plinth and
// a strobe at the tip. Twin and V tails place two fins inside the same part,
// the left one mirrored.

interface FinStation { y: number; le: number; te: number; t: number }

function finRing(s: FinStation, spar: number): Ring {
  const c = s.te - s.le;
  return [
    [0, s.y, s.le], [s.t / 2, s.y, s.le + 0.22 * c], [s.t * 0.4, s.y, s.te - 0.25 * c], [spar * s.t / 2, s.y, s.te],
    [-spar * s.t / 2, s.y, s.te], [-s.t * 0.4, s.y, s.te - 0.25 * c], [-s.t / 2, s.y, s.le + 0.22 * c],
  ];
}
const FIN_GROUP = ['le', 'side', 'side', 'spar', 'side', 'side', 'le'];

function rudderRing(y: number, z0: number, c: number, t0: number): Ring {
  return [[t0 / 2, y, z0], [t0 * 0.12, y, z0 + c], [-t0 * 0.12, y, z0 + c], [-t0 / 2, y, z0], [0, y, z0 - t0 * 0.35]];
}

interface FinSpec { root: FinStation; tip: FinStation; rudder: number; strobe: boolean }

/** One fin rising along local +Y from y = 0. */
function fin(ctx: Ctx, f: FinSpec) {
  const spar = 0.45;
  const cut = (s: FinStation): FinStation => ({ ...s, te: s.te - f.rudder });
  ctx.skin([finRing(cut(f.root), spar), finRing(cut(f.tip), spar)], { capEnd: true, group: j => FIN_GROUP[j] },
    { le: 'metal', side: 'primary', spar: 'dark', cap1: 'trim' });
  // Rudder from just above the plinth to just below the tip cap.
  const y0 = f.root.y + 0.07, y1 = f.tip.y - 0.05;
  const at = (y: number) => {
    const t = (y - f.root.y) / (f.tip.y - f.root.y);
    return { te: f.root.te + (f.tip.te - f.root.te) * t, th: (f.root.t + (f.tip.t - f.root.t) * t) * spar * 0.95 };
  };
  const a = at(y0), b = at(y1);
  ctx.skin([rudderRing(y0, a.te - f.rudder + 0.012, f.rudder - 0.012, a.th), rudderRing(y1, b.te - f.rudder + 0.012, f.rudder - 0.012, b.th)],
    { capStart: true, capEnd: true }, { '*': 'secondary', cap0: 'dark', cap1: 'dark' });
  // Root plinth bolted to the deck.
  const chord = f.root.te - f.root.le;
  ctx.box('metal', [f.root.t + 0.06, 0.035, chord + 0.06], [0, 0.0175, (f.root.le + f.root.te) / 2], undefined, 0.008);
  for (const s of [1, -1]) ctx.boltRow([s * (f.root.t / 2 + 0.018), 0.035, f.root.le + 0.04], [s * (f.root.t / 2 + 0.018), 0.035, f.root.te - 0.04], 6, [0, 1, 0], 0.008);
  if (f.strobe) {
    const tipZ = f.tip.te - f.rudder - 0.03;
    navLight(ctx, [0, f.tip.y + 0.004, tipZ], [0, 1, 0.25], 'strobe');
  }
}

function singleFin(ctx: Ctx) {
  fin(ctx, { root: { y: 0, le: -0.42, te: 0.44, t: 0.075 }, tip: { y: 0.52, le: 0.05, te: 0.42, t: 0.032 }, rudder: 0.13, strobe: true });
  // Whip antenna raked forward off the tip so it adds little height.
  const tip: Vec3 = [0, 0.515, 0.1];
  antenna(ctx, tip, 0.12, [-1.15, 0, 0]);
}

/** Two fins, the right one canted outboard by `cant` radians from vertical; the left is its mirror. */
function finPair(ctx: Ctx, x: number, cant: number, f: FinSpec, plinthWidth: number) {
  bothSides(ctx, () => ctx.within({ position: [x, 0, 0], rotation: [0, 0, -cant] }, () => fin(ctx, f)));
  // Shared base plate tying both roots into the deck.
  const zc = (f.root.le + f.root.te) / 2;
  ctx.box('metal', [plinthWidth, 0.02, f.root.te - f.root.le - 0.1], [0, 0.01, zc], undefined, 0.006);
}

function twinFin(ctx: Ctx) {
  finPair(ctx, 0.23, 0.21, { root: { y: 0, le: -0.36, te: 0.38, t: 0.062 }, tip: { y: 0.44, le: 0.0, te: 0.36, t: 0.028 }, rudder: 0.11, strobe: true }, 0.5);
}

function vTail(ctx: Ctx) {
  finPair(ctx, 0.09, 0.7, { root: { y: 0, le: -0.4, te: 0.4, t: 0.066 }, tip: { y: 0.56, le: 0.02, te: 0.37, t: 0.028 }, rudder: 0.12, strobe: true }, 0.26);
  antenna(ctx, [0, 0.0, 0.36], 0.1, [-0.6, 0, 0]);
}

export const TAIL_BUILDERS: Record<TailId, (ctx: Ctx) => void> = {
  'single-fin': singleFin,
  'twin-fin': twinFin,
  'v-tail': vTail,
};
