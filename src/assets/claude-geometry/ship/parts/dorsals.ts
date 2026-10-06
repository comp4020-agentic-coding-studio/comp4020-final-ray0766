import type { Ctx } from '../kit.ts';
import type { DorsalId } from '../spec.ts';

// Optional dorsal equipment on the `dorsal` deck socket (plug = deck surface
// on the centre line). Kept under 0.36 m tall so the tallest hull stays
// inside the envelope.

function sensorMast(ctx: Ctx) {
  // Bolted base flange, mast tube, optics head with a dark lens window and a guard.
  ctx.cylinder('metal', 0.06, 0.07, 0.03, { position: [0, 0.015, 0] });
  if (ctx.detail >= 1) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.bolt([Math.cos(a) * 0.055, 0.03, Math.sin(a) * 0.055], [0, 1, 0], 0.007);
  }
  ctx.cylinder('secondary', 0.024, 0.03, 0.22, { position: [0, 0.14, 0] });
  ctx.box('primary', [0.13, 0.08, 0.1], [0, 0.28, 0], undefined, 0.012);
  ctx.box('dark', [0.09, 0.05, 0.012], [0, 0.285, -0.051], undefined, 0.004);
  ctx.box('glass', [0.075, 0.036, 0.006], [0, 0.285, -0.058], undefined, 0);
  ctx.box('metal', [0.15, 0.012, 0.12], [0, 0.326, -0.005], undefined, 0.004);
  if (ctx.detail >= 1) {
    ctx.rod('bright', [0.05, 0.33, 0.03], [0.05, 0.42, 0.06], 0.003, 6);
    ctx.box('trim', [0.02, 0.06, 0.07], [-0.075, 0.28, 0.01], undefined, 0.004);
  }
}

function commsDish(ctx: Ctx) {
  // Slewing base and yoke arms.
  ctx.cylinder('metal', 0.075, 0.085, 0.04, { position: [0, 0.02, 0] });
  ctx.cylinder('dark', 0.05, 0.06, 0.05, { position: [0, 0.065, 0] });
  for (const x of [-0.075, 0.075]) ctx.box('metal', [0.018, 0.13, 0.05], [x, 0.14, 0], undefined, 0.004);
  // The dish is built opening towards local +Z, then tilted so it looks up and aft.
  ctx.within({ position: [0, 0.2, 0], rotation: [-0.93, 0, 0] }, () => {
    const R = 0.16, depth = 0.05, steps = 5;
    const bowl: [number, number][] = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; bowl.push([R * t, depth * t * t]); }
    // Convex back (centre to rim faces −Z) and concave face (rim to centre faces +Z).
    ctx.lathe('secondary', bowl.map(([r, z]) => [r, z - 0.006] as [number, number]));
    ctx.lathe('primary', bowl.slice().reverse());
    ctx.lathe('metal', [[R, depth - 0.008], [R + 0.007, depth - 0.005], [R + 0.007, depth + 0.002], [R, depth + 0.004]]);
    ctx.box('metal', [0.17, 0.03, 0.03], [0, 0, -0.02], undefined, 0.004);
    // Feed horn at the focus on three struts.
    if (ctx.detail >= 1) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      ctx.rod('bright', [Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, depth * 0.85], [0, 0, 0.12], 0.0045);
    }
    ctx.cylinder('dark', 0.022, 0.016, 0.04, { position: [0, 0, 0.13], rotation: [Math.PI / 2, 0, 0] }, 8);
  });
}

export const DORSAL_BUILDERS: Record<Exclude<DorsalId, 'none'>, (ctx: Ctx) => void> = {
  'sensor-mast': sensorMast,
  'comms-dish': commsDish,
};
