import type { Vec3 } from '../../../core/vec.ts';
import { bothSides, navLight } from '../../kit.ts';
import type { Ctx, Role } from '../../kit.ts';
import { sectionRing, segs, smoothSkin } from './shapes.ts';

// Village tails: the industrial tails' plug and strobe points kept.

// --------------------------------------------------------------------- tail

/** D-shaped fin with a trim-painted top, the strobe where the single fin's is. */
function roundFin(ctx: Ctx) {
  const k = segs(ctx, 7, 5, 3), cut = 0.4, t = 0.07;
  // Outline in (z, y): leading edge a quarter ellipse to the crest, a rounded back corner, a straight trailing edge.
  const crest = 0.52;   // the strobe's foot
  const le = Array.from({ length: k + 1 }, (_, i) => { const a = (Math.PI / 2) * i / k; return [0.15 - 0.43 * Math.cos(a), crest * Math.sin(a)] as [number, number]; });
  const back = Array.from({ length: Math.ceil(k / 2) + 1 }, (_, i) => { const a = Math.PI / 2 - (Math.PI / 2) * i / Math.ceil(k / 2); return [0.32 + 0.1 * Math.cos(a), crest - 0.1 + 0.1 * Math.sin(a)] as [number, number]; });
  const outline: [number, number][] = [...le, ...back, [0.44, 0]];
  // Split at y = cut into the primary body and the trim top.
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    (a[1] <= cut ? lower : upper).push(a);
    if ((a[1] - cut) * (b[1] - cut) < 0) {
      const f = (cut - a[1]) / (b[1] - a[1]), p: [number, number] = [a[0] + (b[0] - a[0]) * f, cut];
      lower.push(p); upper.push(p);
    }
  }
  const extrude = (role: Role, pts: [number, number][]) => ctx.b.extrude(ctx.mat(role), pts.map(([z, y]) => [-z, y] as [number, number]), t, { position: [-t / 2, 0, 0], rotation: [0, Math.PI / 2, 0] });
  extrude('primary', lower);
  extrude('trim', upper);
  ctx.box('secondary', [0.12, 0.03, 0.78], [0, 0.015, 0.07], undefined, 0);
  navLight(ctx, [0, 0.524, 0.26], [0, 1, 0.25], 'strobe');
}

// ------------------------------------------------------------ smooth fins

/** One horizontal section of a fin: leading and trailing edge z and thickness at height y (fin frame). */
interface FinStation { y: number; le: number; te: number; t: number }

/**
 * A fin lofted up local +Y through smooth lens sections (shared normals, so it
 * shades round), the stations from `cut` up painted trim. The root is left
 * open: it sits in the saddle or the deck.
 */
function smoothFin(ctx: Ctx, stations: FinStation[], cut: number, n: number) {
  const ring = (s: FinStation): Vec3[] => Array.from({ length: n }, (_, j) => {
    const a = (Math.PI * 2 * j) / n, c = (s.te - s.le) / 2;
    return [(s.t / 2) * Math.sin(a), s.y, (s.le + s.te) / 2 - c * Math.cos(a)] as Vec3;
  });
  const rings = stations.map(ring), k = stations.findIndex(s => s.y >= cut - 1e-9);
  smoothSkin(ctx, rings.slice(0, k + 1), () => 'primary');
  smoothSkin(ctx, rings.slice(k), () => 'trim');
}

/** Rounded saddle along z on the deck: superellipse arches (upper halves) whose ends sink into the deck. */
function saddle(ctx: Ctx, role: Role, arches: { z: number; a: number; b: number }[], points: number) {
  const angles = Array.from({ length: points }, (_, i) => (Math.PI * i) / (points - 1));
  smoothSkin(ctx, arches.map(s => sectionRing({ ...s, yc: 0, p: 3 }, angles)), j => (j < points - 1 ? role : null), {}, false);
}

// ---------------------------------------------------------------- twin fin

/**
 * Two small round D fins, canted 12° outboard where the industrial twin fins
 * stand, each with a trim-painted top and the strobe on its crest at the
 * industrial point; both rise out of one low rounded saddle across the deck.
 */
function roundTwinFins(ctx: Ctx) {
  const H = 0.44, leRoot = -0.25, crestFront = 0.1, corner = 0.09;
  const teLine = (y: number) => 0.38 - 0.04 * (y / H);
  const station = (y: number): FinStation => {
    // Leading edge: a quarter ellipse up to the crest. Trailing edge: straight, rounding over the back corner.
    const le = crestFront - (crestFront - leRoot) * Math.sqrt(Math.max(0, 1 - (y / H) ** 2));
    const above = y - (H - corner);
    const te = above <= 0 ? teLine(y) : teLine(H) - corner + Math.sqrt(Math.max(0, corner ** 2 - above ** 2));
    // Thickness tapers up the fin and rounds over the last 0.1 m, so the top is soft from the front too.
    const top = y - (H - 0.1), t = (0.085 - 0.03 * (y / H)) * (top <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - (top / 0.1) ** 2)));
    return { y, le, te, t: Math.max(0.004, t) };
  };
  const ys = ctx.detail === 2 ? [0, 0.15, 0.27, 0.34, 0.39, 0.42, H] : ctx.detail === 1 ? [0, 0.2, 0.34, 0.41, H] : [0, 0.2, 0.34, H];
  const stations = ys.map(station), n = segs(ctx, 8, 8, 6);
  bothSides(ctx, () => ctx.within({ position: [0.23, 0, 0], rotation: [0, 0, -0.21] }, () => {
    smoothFin(ctx, stations, 0.34, n);
    navLight(ctx, [0, H + 0.004, 0.22], [0, 1, 0.25], 'strobe');
  }));
  // The shared saddle under both roots.
  saddle(ctx, 'primary', [
    { z: -0.34, a: 0.14, b: 0.006 }, { z: -0.29, a: 0.25, b: 0.036 }, { z: -0.21, a: 0.29, b: 0.052 },
    { z: 0.31, a: 0.29, b: 0.052 }, { z: 0.39, a: 0.25, b: 0.036 }, { z: 0.43, a: 0.14, b: 0.006 },
  ].filter((_, i) => ctx.detail > 0 || (i !== 1 && i !== 4)), segs(ctx, 7, 7, 5));
}

// ------------------------------------------------------------------ v-tail

/**
 * Butterfly V: two rounded paddles 40° from vertical where the industrial V's
 * fins stand. The leading edge sweeps in one smooth curve up to a soft round
 * tip painted trim, which carries the strobe at the industrial point; the
 * trailing edge rounds over to meet it. They spring from a small rounded body
 * along the centre line.
 */
function butterflyTail(ctx: Ctx) {
  const H = 0.56, tipZ = 0.22, leRoot = -0.3, teRoot = 0.4;
  const station = (y: number): FinStation => {
    const f = Math.min(1, y / H);
    return {
      y,
      le: tipZ - (tipZ - leRoot) * Math.sqrt(1 - f),
      te: tipZ + (teRoot - tipZ) * Math.sqrt(Math.max(0, 1 - f ** 3)),
      t: Math.max(0.004, (0.075 - 0.03 * f) * Math.sqrt(Math.max(0, 1 - f ** 6))),
    };
  };
  const ys = ctx.detail === 2 ? [0, 0.18, 0.33, 0.44, 0.5, 0.54, H] : ctx.detail === 1 ? [0, 0.22, 0.38, 0.44, 0.52, H] : [0, 0.3, 0.44, 0.52, H];
  const stations = ys.map(station), n = segs(ctx, 8, 8, 6);
  bothSides(ctx, () => ctx.within({ position: [0.09, 0, 0], rotation: [0, 0, -0.7] }, () => {
    smoothFin(ctx, stations, 0.44, n);
    navLight(ctx, [0, H + 0.004, 0.22], [0, 1, 0.25], 'strobe');
  }));
  // The body the paddles spring from: a rounded hump on the centre line.
  saddle(ctx, 'secondary', [
    { z: -0.34, a: 0.03, b: 0.006 }, { z: -0.24, a: 0.1, b: 0.06 }, { z: -0.06, a: 0.13, b: 0.085 },
    { z: 0.28, a: 0.13, b: 0.08 }, { z: 0.4, a: 0.09, b: 0.05 }, { z: 0.43, a: 0.03, b: 0.006 },
  ].filter((_, i) => ctx.detail > 0 || i % 2 === 0 || i === 5), segs(ctx, 7, 7, 5));
}

export const VILLAGE_TAILS: Record<string, (ctx: Ctx) => void> = { 'single-fin': roundFin, 'twin-fin': roundTwinFins, 'v-tail': butterflyTail };
