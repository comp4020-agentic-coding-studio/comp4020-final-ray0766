import type { Vec3 } from '../../core/vec.ts';
import type { Ring } from '../geom.ts';
import { antenna, bothSides, hatch } from '../kit.ts';
import type { Ctx } from '../kit.ts';
import type { CockpitId } from '../spec.ts';

// Cockpits plug into the `cockpit` socket on the hull deck. Plug = centre of
// the footprint on the deck surface; the footprint is at most 0.58 m wide and
// runs from z = −0.55 to +0.55 (a faired tail may run further aft on the
// deck). Every hull keeps its deck flat over that footprint.

/** Open canopy hoop: bottom-left, mid-left, top-left, top-right, mid-right, bottom-right. */
export interface Hoop { z: number; wb: number; wm: number; hm: number; wt: number; ht: number }
const hoop = (s: Hoop, y0 = 0.035, grow = 0): Ring => [
  [-s.wb - grow, y0, s.z], [-s.wm - grow, s.hm + grow * 0.6, s.z], [-s.wt - grow * 0.5, s.ht + grow, s.z],
  [s.wt + grow * 0.5, s.ht + grow, s.z], [s.wm + grow, s.hm + grow * 0.6, s.z], [s.wb + grow, y0, s.z],
];

// ------------------------------------------------------------- faceted canopy

/** Glass stations of the faceted canopy, nose to tail; the glass foot is at y = 0.035, inside the 45 mm coaming. */
export const GLASS: Hoop[] = [
  { z: -0.54, wb: 0.19, wm: 0.165, hm: 0.06, wt: 0.1, ht: 0.085 },
  { z: -0.3, wb: 0.245, wm: 0.222, hm: 0.27, wt: 0.12, ht: 0.37 },
  { z: -0.02, wb: 0.255, wm: 0.235, hm: 0.33, wt: 0.13, ht: 0.45 },
  { z: 0.26, wb: 0.25, wm: 0.226, hm: 0.31, wt: 0.122, ht: 0.42 },
  { z: 0.42, wb: 0.243, wm: 0.214, hm: 0.27, wt: 0.112, ht: 0.37 },
];
const FAIRING: Hoop[] = [
  { z: 0.42, wb: 0.243, wm: 0.214, hm: 0.27, wt: 0.112, ht: 0.37 },
  { z: 0.62, wb: 0.24, wm: 0.205, hm: 0.22, wt: 0.1, ht: 0.27 },
  { z: 0.86, wb: 0.2, wm: 0.15, hm: 0.06, wt: 0.08, ht: 0.075 },
];

function facetedCanopy(ctx: Ctx) {
  // Coaming: a bolted sill frame the canopy seats on, with the glass bedded in
  // a dark seal along both rails.
  for (const s of [-1, 1]) ctx.box('metal', [0.05, 0.045, 1.0], [s * 0.262, 0.0225, -0.06], undefined, 0.008);
  ctx.box('metal', [0.574, 0.045, 0.05], [0, 0.0225, -0.56], undefined, 0.008);
  if (ctx.detail >= 1) for (const s of [-1, 1]) {
    ctx.boltRow([s * 0.272, 0.045, -0.5], [s * 0.272, 0.045, 0.36], 8, [0, 1, 0], 0.008);
    ctx.box('dark', [0.014, 0.01, 0.9], [s * 0.244, 0.05, -0.07], undefined, 0);
  }

  cockpitInterior(ctx);

  // Glass hoops and the painted aft fairing behind them.
  const glass = GLASS.map(h => hoop(h));
  ctx.skin(glass, { closed: false, capStart: true }, { '*': 'glass' });
  ctx.skin(FAIRING.map((h, i) => hoop(h, 0.035, i === 0 ? 0.006 : 0)), { closed: false, capEnd: true }, { '*': 'primary' });

  // Frame: a heavy windscreen arch with two posts either side of the front
  // pane, a canopy bow and the aft arch, painted with the hull. The side and
  // roof panes run between them without bars, as moulded transparencies do,
  // so the frame reads as structure rather than a cage. Bars sit just proud
  // of the glass.
  const framed = GLASS.map(h => hoop(h, 0.035, 0.006));
  const bar = (a: Vec3, b: Vec3, w: number, h: number) => {
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.1, (a[2] + b[2]) / 2];
    ctx.strut('primary', a, b, w, h, 0.003, [mid[0] * 2, 1, 0]);
  };
  const arch = (i: number, w: number, h: number) => { for (let j = 0; j < 5; j++) bar(framed[i][j], framed[i][j + 1], w, h); };
  arch(0, 0.026, 0.016);
  arch(1, 0.04, 0.024);
  for (const j of [2, 3]) bar(framed[0][j], framed[1][j], 0.024, 0.016);
  if (ctx.detail >= 1) arch(3, 0.032, 0.02);
  arch(4, 0.034, 0.02);

  // Hinge blocks at the back, the canopy jacks inside the glass and a latch handle on the right sill.
  bothSides(ctx, () => {
    ctx.box('metal', [0.04, 0.06, 0.08], [0.26, 0.05, 0.44], undefined, 0.006);
    if (ctx.detail >= 1) ctx.box('bright', [0.012, 0.02, 0.1], [0.29, 0.06, -0.2], undefined, 0.004);
    if (ctx.detail >= 2) {
      ctx.rod('dark', [0.215, 0.05, 0.36], [0.2, 0.17, 0.3], 0.011);
      ctx.rod('bright', [0.2, 0.17, 0.3], [0.19, 0.27, 0.26], 0.006);
    }
  });
  antenna(ctx, [0, 0.235, 0.66], 0.16, [0.5, 0, 0]);
}

/**
 * What shows through the canopy glass: tub floor, side consoles, an
 * instrument panel with three displays under a glare shield, a HUD combiner,
 * stick and throttle, and the seat on its rails with harness and a firing
 * handle. Everything stays inside the glass hoops.
 */
export function cockpitInterior(ctx: Ctx) {
  // Tub floor, its top just under the coaming top so its corners stay hidden where the glass narrows.
  ctx.box('dark', [0.46, 0.012, 0.92], [0, 0.038, -0.06], undefined, 0);
  // Side consoles with a metal top plate.
  for (const s of [-1, 1]) {
    ctx.box('dark', [0.07, 0.09, 0.46], [s * 0.19, 0.09, 0.0], undefined, 0.006);
    if (ctx.detail >= 1) ctx.box('metal', [0.064, 0.006, 0.4], [s * 0.19, 0.137, 0.0], undefined, 0.002);
    if (ctx.detail >= 2) for (let i = 0; i < 3; i++) ctx.box('bright', [0.014, 0.008, 0.02], [s * 0.19 - 0.012, 0.143, -0.12 + i * 0.07], undefined, 0);
  }
  // Instrument panel, leaning back towards the pilot, and the glare shield over it.
  ctx.within({ position: [0, 0.11, -0.4], rotation: [-0.35, 0, 0] }, () => {
    ctx.box('dark', [0.34, 0.12, 0.03], [0, 0, 0], undefined, 0.006);
    if (ctx.detail >= 1) for (const x of [-0.11, 0, 0.11]) {
      ctx.box('metal', [0.094, 0.082, 0.008], [x, -0.004, 0.017], undefined, 0.002);
      ctx.box('glass', [0.074, 0.062, 0.004], [x, -0.004, 0.022], undefined, 0);
    }
  });
  ctx.box('dark', [0.32, 0.016, 0.1], [0, 0.18, -0.36], undefined, 0.004);
  if (ctx.detail >= 2) {
    // HUD combiner on two posts above the glare shield.
    for (const x of [-0.045, 0.045]) ctx.rod('bright', [x, 0.188, -0.34], [x, 0.235, -0.33], 0.003, 6);
    ctx.box('glass', [0.1, 0.06, 0.003], [0, 0.22, -0.33], [-0.25, 0, 0], 0);
    // Stick between the knees and the throttle on the left console.
    ctx.rod('dark', [0, 0.046, -0.13], [0, 0.15, -0.15], 0.008, 6);
    ctx.box('dark', [0.026, 0.05, 0.03], [0, 0.17, -0.155], [0.2, 0, 0], 0.006);
    ctx.box('metal', [0.024, 0.04, 0.05], [-0.19, 0.16, -0.06], [0.3, 0, 0], 0.006);
  }
  // Seat on its rails: pan, back with side bolsters, headrest, harness and firing handle.
  if (ctx.detail >= 1) for (const x of [-0.1, 0.1]) ctx.box('metal', [0.02, 0.016, 0.34], [x, 0.05, 0.12], undefined, 0.003);
  ctx.within({ position: [0, 0.04, 0.16], rotation: [0.22, 0, 0] }, () => {
    ctx.box('dark', [0.3, 0.06, 0.3], [0, 0.03, -0.1], undefined, 0.015);
    ctx.box('dark', [0.3, 0.3, 0.06], [0, 0.18, 0.06], undefined, 0.015);
    ctx.box('metal', [0.2, 0.07, 0.06], [0, 0.35, 0.06], undefined, 0.012);
    if (ctx.detail >= 1) for (const s of [-1, 1]) {
      ctx.box('metal', [0.03, 0.26, 0.05], [s * 0.16, 0.17, 0.07], undefined, 0.006);
      ctx.box('dark', [0.04, 0.2, 0.05], [s * 0.125, 0.17, 0.02], undefined, 0.01);
    }
    if (ctx.detail >= 2) {
      for (const x of [-0.06, 0.06]) ctx.box('trim', [0.035, 0.24, 0.006], [x, 0.18, 0.028], undefined, 0);
      ctx.box('hazard', [0.06, 0.02, 0.02], [0, 0.07, -0.25], undefined, 0.004);
    }
  });
}

// ------------------------------------------------- vertical lofts (plan rings)

/** Plan outline at height y: front/back edges, half width and corner chamfers. */
interface Plan { y: number; zf: number; zb: number; w: number; cf: number; cb: number }
/** p0..p7 from the front-left corner, clockwise seen from above; edge 0 is the front face. */
function planRing(p: Plan, inset = 0): Ring {
  const w = p.w - inset, zf = p.zf + inset, zb = p.zb - inset;
  return [
    [-w + p.cf, p.y, zf], [w - p.cf, p.y, zf], [w, p.y, zf + p.cf], [w, p.y, zb - p.cb],
    [w - p.cb, p.y, zb], [-w + p.cb, p.y, zb], [-w, p.y, zb - p.cb], [-w, p.y, zf + p.cf],
  ];
}
const FRONT_EDGES = new Set([7, 0, 1]);

// ------------------------------------------------------------- slit visor

const VISOR_LOW: Plan[] = [
  { y: 0, zf: -0.55, zb: 0.55, w: 0.285, cf: 0.15, cb: 0.08 },
  { y: 0.12, zf: -0.5, zb: 0.55, w: 0.285, cf: 0.15, cb: 0.08 },
  { y: 0.21, zf: -0.4, zb: 0.54, w: 0.275, cf: 0.14, cb: 0.08 },
];
const VISOR_HIGH: Plan[] = [
  { y: 0.27, zf: -0.34, zb: 0.53, w: 0.27, cf: 0.13, cb: 0.08 },
  { y: 0.35, zf: -0.22, zb: 0.48, w: 0.24, cf: 0.12, cb: 0.07 },
  { y: 0.39, zf: -0.14, zb: 0.42, w: 0.2, cf: 0.1, cb: 0.06 },
];

function slitVisor(ctx: Ctx) {
  ctx.skin(VISOR_LOW.map(p => planRing(p)), { capEnd: true, group: j => (FRONT_EDGES.has(j) ? 'front' : 'side') }, { front: 'secondary', side: 'primary', cap1: 'dark' });
  // The 60 mm vision slit, set 30 mm back from the armour face, glazed at the front and sides.
  ctx.skin([planRing(VISOR_LOW[2], 0.03), planRing(VISOR_HIGH[0], 0.03)], { group: j => (j >= 3 && j <= 5 ? 'back' : 'slit') }, { slit: 'glass', back: 'dark' });
  ctx.skin(VISOR_HIGH.map(p => planRing(p)), { capStart: true, capEnd: true, group: j => (FRONT_EDGES.has(j) ? 'front' : 'side') }, { front: 'secondary', side: 'primary', cap0: 'dark', cap1: 'primary' });
  // Brow over the slit.
  const brow = planRing(VISOR_HIGH[0], -0.026).map(p => [p[0], 0.278, p[2]] as Vec3);
  for (const j of [6, 7, 0, 1, 2]) ctx.strut('metal', brow[j], brow[(j + 1) % 8], 0.034, 0.016, 0.004, [0, 1, 0]);
  // Bolts along the lower glacis, appliqué side plates, roof hatch, periscope, handles.
  ctx.boltRow([-0.11, 0.06, -0.532], [0.11, 0.06, -0.532], 6, [0, 0.1, -1], 0.01);
  bothSides(ctx, () => {
    hatch(ctx, 0.15, 0.56, { position: [0.285, 0.1, 0.12], rotation: [0, 0, -Math.PI / 2] }, 'secondary');
    if (ctx.detail >= 1) {
      for (const z of [0.18, 0.38]) ctx.rod('metal', [0.255, 0.31, z], [0.29, 0.31, z], 0.007);
      ctx.rod('bright', [0.29, 0.31, 0.16], [0.29, 0.31, 0.4], 0.009);
    }
  });
  hatch(ctx, 0.2, 0.2, { position: [0, 0.39, 0.16] }, 'secondary');
  ctx.box('dark', [0.12, 0.06, 0.07], [0.07, 0.42, -0.04], undefined, 0.008);
  ctx.box('glass', [0.1, 0.035, 0.006], [0.07, 0.425, -0.077], undefined, 0);
  antenna(ctx, [-0.08, 0.39, 0.34], 0.14, [0.35, 0, 0]);
}

// ------------------------------------------------------------- raised bridge

const BRIDGE_LOW: Plan[] = [
  { y: 0, zf: -0.55, zb: 0.55, w: 0.29, cf: 0.12, cb: 0.06 },
  { y: 0.2, zf: -0.5, zb: 0.55, w: 0.29, cf: 0.12, cb: 0.06 },
];
const BRIDGE_TOP: Plan = { y: 0.38, zf: -0.56, zb: 0.54, w: 0.305, cf: 0.13, cb: 0.06 };
const ROOF: Plan[] = [
  { y: 0.38, zf: -0.6, zb: 0.56, w: 0.33, cf: 0.14, cb: 0.06 },
  { y: 0.43, zf: -0.61, zb: 0.56, w: 0.335, cf: 0.14, cb: 0.06 },
];

function raisedBridge(ctx: Ctx) {
  ctx.skin(BRIDGE_LOW.map(p => planRing(p)), { group: j => (FRONT_EDGES.has(j) ? 'front' : 'side') }, { front: 'secondary', side: 'primary' });
  // Interior first, seen through the glazing: floor, console, two seats.
  ctx.box('dark', [0.54, 0.012, 1.0], [0, 0.2, 0], undefined, 0);
  ctx.box('dark', [0.46, 0.08, 0.1], [0, 0.24, -0.42], [0.4, 0, 0], 0.01);
  for (const x of [-0.12, 0.12]) {
    ctx.box('dark', [0.16, 0.05, 0.16], [x, 0.23, -0.02], undefined, 0.012);
    ctx.box('dark', [0.16, 0.2, 0.04], [x, 0.31, 0.08], [0.15, 0, 0], 0.012);
  }
  // Glazing leaning out towards the roof, glass on the front and sides only.
  const low = planRing(BRIDGE_LOW[1], 0.015), high = planRing(BRIDGE_TOP);
  ctx.skin([low, high], { group: j => (j >= 3 && j <= 5 ? 'back' : 'glass') }, { glass: 'glass', back: 'secondary' });
  // Mullions at every corner and across the front and sides.
  const post = (a: Vec3, b: Vec3) => ctx.strut('metal', a, b, 0.026, 0.02, 0.004, [a[0], 0, a[2]]);
  for (const j of [0, 1, 2, 3, 6, 7]) post(low[j], high[j]);
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  if (ctx.detail >= 1) {
    for (const t of [1 / 3, 2 / 3]) post(mix(low[0], low[1], t), mix(high[0], high[1], t));
    for (const t of [0.4]) { post(mix(low[2], low[3], t), mix(high[2], high[3], t)); post(mix(low[7], low[6], t), mix(high[7], high[6], t)); }
  }
  // Sill and head rails around the glazing.
  for (const j of [6, 7, 0, 1, 2]) {
    ctx.strut('metal', low[j], low[(j + 1) % 8], 0.03, 0.02, 0.004, [0, 1, 0]);
  }
  // Roof slab with an overhanging brim, a short mast and a radar bar.
  ctx.skin(ROOF.map(p => planRing(p)), { capStart: true, capEnd: true, group: () => 'edge' }, { edge: 'secondary', cap0: 'dark', cap1: 'primary' });
  ctx.cylinder('metal', 0.025, 0.03, 0.07, { position: [0, 0.465, 0.3] });
  ctx.box('secondary', [0.2, 0.024, 0.05], [0, 0.51, 0.3], undefined, 0.006);
  if (ctx.detail >= 1) {
    ctx.boltRow([-0.27, 0.43, 0.48], [0.27, 0.43, 0.48], 7, [0, 1, 0], 0.008);
    for (const x of [-0.14, 0.14]) ctx.rod('bright', [x, 0.37, -0.585], [x - 0.05, 0.25, -0.53], 0.005);
  }
  // Access door on the starboard side of the lower body.
  hatch(ctx, 0.17, 0.32, { position: [0.29, 0.1, 0.22], rotation: [0, 0, -Math.PI / 2] }, 'secondary');
  ctx.boltRow([-0.2, 0.02, -0.54], [0.2, 0.02, -0.54], 6, [0, 0, -1], 0.009);
}

export const COCKPIT_BUILDERS: Record<CockpitId, (ctx: Ctx) => void> = {
  'faceted-canopy': facetedCanopy,
  'slit-visor': slitVisor,
  'raised-bridge': raisedBridge,
};
