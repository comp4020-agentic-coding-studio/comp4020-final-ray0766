import type { Ctx } from '../kit.ts';
import type { EngineId } from '../spec.ts';

// Engine units. Side units (twin nacelles) plug into engine.right/left on the
// hull side and are authored for the right side, the nacelle axis outboard
// along +X. Aft units plug into engine.aft on the aft bulkhead and thrust
// along +Z from the centre line. Every nozzle has real wall thickness: an
// outer shroud, a lip and an inner wall, with the glowing liner set deep
// inside so it reads as heat in a throat, not a painted ring. Each exit is
// published as an exhaust anchor.

/** Convergent nozzle with petals, liner and tail cone, exit at z = exit. Shared by every engine unit. */
export function nozzle(ctx: Ctx, r: number, start: number, exit: number, petals: number) {
  const len = exit - start;
  const inner = r * 0.8;
  // Shroud cone, lip and inner wall walked back towards the throat.
  ctx.lathe('heat', [[r * 1.03, start], [r, start + len * 0.12], [r * 0.9, exit - 0.006], [r * 0.86, exit], [inner, exit - 0.004], [inner * 0.98, start + len * 0.2]]);
  // A narrow liner band deep in the throat, a dark turbine face and a tail
  // cone in front of it, so the glow reads as heat behind hardware.
  ctx.lathe('liner', [[inner * 0.97, start + len * 0.3], [inner * 0.97, start + len * 0.06]]);
  ctx.lathe('dark', [[inner, start + len * 0.06], [inner * 0.3, start + len * 0.06]]);
  ctx.lathe('heat', [[inner * 0.55, start + len * 0.05], [inner * 0.3, start + len * 0.42], [0, start + len * 0.6]]);
  if (ctx.detail >= 1) {
    const struts = 4;
    for (let i = 0; i < struts; i++) ctx.within({ rotation: [0, 0, (i / struts) * Math.PI * 2 + Math.PI / 4] }, () =>
      ctx.box('dark', [0.012, inner * 0.5, 0.03], [0, inner * 0.7, start + len * 0.2], undefined, 0.002));
  }
  if (ctx.detail >= 1 && petals > 0) {
    const count = ctx.detail >= 2 ? petals : Math.max(6, Math.round(petals * 0.67));
    const z0 = start + len * 0.16, z1 = exit - 0.004;
    const rm = (r + r * 0.9) / 2;
    const tilt = Math.atan2(r - r * 0.9, len * 0.88);
    const w = (2 * Math.PI * rm) / count - 0.007;
    for (let i = 0; i < count; i++) {
      ctx.within({ rotation: [0, 0, (i / count) * Math.PI * 2] }, () => {
        ctx.box('heat', [w, 0.008, z1 - z0], [0, rm + 0.006, (z0 + z1) / 2], [tilt, 0, 0], 0.002);
      });
    }
  }
  ctx.exhaust([0, 0, exit], inner);
}

/** Raised band around a nacelle body. */
function bandAt(ctx: Ctx, r: number, z: number, w = 0.03) {
  ctx.lathe('metal', [[r, z - w / 2], [r + 0.006, z - w / 2 + 0.005], [r + 0.006, z + w / 2 - 0.005], [r, z + w / 2]]);
}

// ------------------------------------------------------------ twin nacelles

/**
 * Pylon between the hull side and a nacelle: an airfoil-section fairing whose
 * root fillets into a bolted mount plate. The plate carries two clevis lugs
 * with their pins, and a fuel and a hydraulic line run under the pylon from
 * the hull into the nacelle, each with a bulkhead fitting at the plate.
 */
function nacellePylon(ctx: Ctx) {
  ctx.box('metal', [0.022, 0.15, 0.9], [0.011, 0, 0.48], undefined, 0.008);
  ctx.boltRow([0.023, 0.055, 0.1], [0.023, 0.055, 0.86], 7, [1, 0, 0], 0.009);
  ctx.boltRow([0.023, -0.055, 0.1], [0.023, -0.055, 0.86], 7, [1, 0, 0], 0.009);
  // Fairing: lens section, thicker and longer at the root, swept back towards the nacelle.
  const section = (x: number, le: number, te: number, t: number) => {
    const c = te - le;
    return [
      [x, 0, le], [x, t / 2, le + 0.2 * c], [x, t * 0.42, le + 0.65 * c], [x, 0.006, te],
      [x, -0.006, te], [x, -t * 0.42, le + 0.65 * c], [x, -t / 2, le + 0.2 * c],
    ] as [number, number, number][];
  };
  ctx.skin([section(0.02, 0.12, 0.98, 0.11), section(0.07, 0.2, 0.98, 0.095), section(0.15, 0.3, 0.97, 0.08)],
    { capStart: true, capEnd: true }, { '*': 'secondary' });
  if (ctx.detail >= 1) {
    // Root fillet strip where the fairing meets the plate.
    for (const y of [0.05, -0.05]) ctx.strut('metal', [0.026, y, 0.2], [0.026, y, 0.94], 0.012, 0.016, 0.003, [1, 0, 0]);
  }
  if (ctx.detail >= 2) {
    for (const z of [0.3, 0.76]) {
      for (const y of [0.064, -0.064]) ctx.box('metal', [0.05, 0.012, 0.05], [0.045, y, z], undefined, 0.003);
      ctx.cylinder('bright', 0.009, 0.009, 0.15, { position: [0.06, 0, z] }, 8);
    }
    for (const [y, r, z] of [[-0.07, 0.012, 0.5], [-0.07, 0.009, 0.6]] as const) {
      ctx.cylinder('metal', r + 0.008, r + 0.008, 0.02, { position: [0.032, y, z], rotation: [0, 0, Math.PI / 2] }, 8);
      ctx.rod(r > 0.01 ? 'dark' : 'bright', [0.03, y, z], [0.1, y, z + 0.04], r, 8);
    }
  }
}

function twinNacelle(ctx: Ctx) {
  const ax = 0.26, R = 0.17;
  nacellePylon(ctx);

  ctx.within({ position: [ax, 0, 0] }, () => {
    // Intake lip (bright), throat, fan face, spinner and stator vanes.
    ctx.lathe('bright', [[0.118, 0.14], [0.12, -0.04], [0.13, -0.09], [0.15, -0.105], [0.165, -0.092], [0.171, -0.055], [R, -0.02]]);
    ctx.lathe('dark', [[0.0, 0.2], [0.119, 0.2]]);
    ctx.lathe('dark', [[0.118, 0.2], [0.118, 0.13]]);
    ctx.lathe('bright', [[0.042, 0.2], [0.036, 0.15], [0.0, 0.085]].reverse() as [number, number][]);
    if (ctx.detail >= 1) {
      const vanes = ctx.detail >= 2 ? 9 : 6;
      for (let i = 0; i < vanes; i++) ctx.within({ rotation: [0, 0, (i / vanes) * Math.PI * 2] }, () => ctx.box('metal', [0.008, 0.08, 0.03], [0, 0.079, 0.185], [0, 0.35, 0], 0.002));
    }
    // Three cowl sections: an intake cowl, a core cowl standing 4 mm proud
    // and an aft cowl that steps down into a bare heat-tempered hot section
    // ahead of the nozzle.
    const C = R + 0.004;
    ctx.lathe('primary', [[R, -0.02], [R, 0.3]]);
    ctx.lathe('primary', [[R, 0.3], [C, 0.31], [C, 0.75], [R, 0.76]]);
    ctx.lathe('primary', [[R, 0.76], [R, 0.93]]);
    ctx.lathe('heat', [[R, 0.93], [R - 0.004, 0.94], [0.163, 1.02], [0.155, 1.13]]);
    bandAt(ctx, R, 0.3, 0.022);
    bandAt(ctx, R, 0.76, 0.022);
    if (ctx.detail >= 1) {
      // Raised service panel with its fasteners on the top of the core cowl.
      ctx.lathe('secondary', [[C + 0.002, 0.42], [C + 0.002, 0.66]], undefined, { arc: 0.9, phase: Math.PI / 2 - 0.45 });
      ctx.boltRow([0, C + 0.002, 0.44], [0, C + 0.002, 0.66], 4, [0, 1, 0], 0.007);
      // Cooling ribs on the hot section.
      for (const z of [0.98, 1.06]) ctx.lathe('metal', [[0.165, z - 0.008], [0.172, z - 0.004], [0.172, z + 0.004], [0.163, z + 0.008]]);
      // Accessory gearbox fairing on the outboard lower quarter, with a louvred cover.
      ctx.within({ rotation: [0, 0, Math.PI * 1.25] }, () => {
        ctx.box('secondary', [0.08, 0.03, 0.34], [0, C + 0.01, 0.53], undefined, 0.012);
        if (ctx.detail >= 2) for (let i = 0; i < 5; i++) ctx.box('dark', [0.05, 0.004, 0.012], [0, C + 0.026, 0.45 + i * 0.04], undefined, 0);
      });
      // Outboard armour strake along the core cowl.
      ctx.strut('primary', [C + 0.008, 0, 0.34], [C + 0.008, 0, 0.72], 0.024, 0.03, 0.006, [1, 0, 0]);
    }
    if (ctx.detail >= 2) {
      // Feed and drain lines from the pylon along the inboard upper quarter, clipped to the cowl.
      const a = Math.PI * 0.8, ca = Math.cos(a), sa = Math.sin(a);
      for (const dr of [0.012, 0.03]) {
        const r = C + dr, rr = dr > 0.02 ? 0.006 : 0.008;
        ctx.rod('bright', [ca * r, sa * r, 0.36], [ca * r, sa * r, 0.92], rr, 8);
      }
      for (const z of [0.46, 0.64, 0.84]) ctx.within({ rotation: [0, 0, a - Math.PI / 2] }, () => ctx.box('metal', [0.03, 0.04, 0.014], [0, C + 0.016, z], undefined, 0.003));
    }
    ctx.lathe('metal', [[0.155, 1.13], [0.16, 1.15], [0.16, 1.17], [0.152, 1.18]]);
    nozzle(ctx, 0.152, 1.18, 1.4, 12);
    if (ctx.detail >= 2) {
      // Petal actuators from the mounting ring to the shroud.
      for (let i = 0; i < 4; i++) {
        const t = (i / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(t), sn = Math.sin(t);
        ctx.rod('bright', [c * 0.164, sn * 0.164, 1.16], [c * 0.153, sn * 0.153, 1.28], 0.006, 6);
      }
    }
  });
}

// ------------------------------------------------------------- single heavy

function singleHeavy(ctx: Ctx) {
  // Mounting flange bolted to the aft bulkhead.
  ctx.lathe('metal', [[0.27, 0], [0.27, 0.04], [0.2, 0.04]]);
  if (ctx.detail >= 1) {
    const n = ctx.detail >= 2 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.bolt([Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.04], [0, 0, 1], 0.011);
    }
  }
  // Gimbal housing and ring.
  ctx.lathe('dark', [[0.2, 0.04], [0.19, 0.08], [0.17, 0.13]]);
  ctx.lathe('bright', [[0.2, 0.1], [0.215, 0.105], [0.215, 0.135], [0.2, 0.14]]);
  // Bell: throat at 0.14, exit at 0.44, with cooling bands, wall thickness and a liner.
  const throat = 0.15, exit = 0.44, rt = 0.16, re = 0.33;
  const bell: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; bell.push([rt + (re - rt) * Math.pow(t, 0.75), throat + (exit - throat) * t]); }
  ctx.lathe('heat', [...bell, [re - 0.012, exit + 0.002], ...bell.slice().reverse().map(([r, z]) => [r - 0.014, z] as [number, number])]);
  if (ctx.detail >= 1) for (const t of [0.3, 0.6, 0.88]) {
    const z = throat + (exit - throat) * t, r = rt + (re - rt) * Math.pow(t, 0.75);
    ctx.lathe('metal', [[r, z - 0.012], [r + 0.008, z - 0.008], [r + 0.008, z + 0.008], [r, z + 0.012]]);
  }
  ctx.lathe('liner', [[0.142, 0.24], [0.142, 0.15]]);
  ctx.lathe('dark', [[0.145, 0.15], [0.04, 0.15]]);
  ctx.lathe('heat', [[0.07, 0.148], [0.04, 0.26], [0, 0.31]]);
  // Two actuators from the flange to a lug on the bell.
  for (const a of [Math.PI * 0.25, Math.PI * 0.75]) {
    const c = Math.cos(a), s = Math.sin(a);
    ctx.rod('dark', [c * 0.235, s * 0.235, 0.05], [c * 0.255, s * 0.255, 0.2], 0.018);
    ctx.rod('bright', [c * 0.255, s * 0.255, 0.2], [c * 0.27, s * 0.27, 0.31], 0.01);
    ctx.box('metal', [0.04, 0.03, 0.04], [c * 0.27, s * 0.27, 0.31], [0, 0, a], 0.004);
  }
  ctx.exhaust([0, 0, exit], re - 0.02);
}

// -------------------------------------------------------------- pod cluster

function podCluster(ctx: Ctx) {
  // Triangular thrust plate with chamfered corners.
  const plate: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
    for (const d of [-0.42, 0.42]) plate.push([Math.cos(a + d) * 0.31, Math.sin(a + d) * 0.31]);
  }
  ctx.b.extrude(ctx.mat('metal'), plate, 0.04, undefined, 0.006);
  const pods = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  for (const a of pods) {
    const x = Math.cos(a) * 0.165, y = Math.sin(a) * 0.165;
    ctx.within({ position: [x, y, 0] }, () => {
      ctx.lathe('metal', [[0.115, 0.04], [0.115, 0.06], [0.1, 0.06]]);
      ctx.lathe('secondary', [[0.1, 0.06], [0.104, 0.1], [0.104, 0.28], [0.092, 0.33]]);
      bandAt(ctx, 0.104, 0.19, 0.022);
      nozzle(ctx, 0.092, 0.33, 0.44, 8);
    });
    if (ctx.detail >= 1) ctx.rod('bright', [x * 0.35, y * 0.35, 0.045], [x * 0.75, y * 0.75, 0.14], 0.008);
  }
  if (ctx.detail >= 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.bolt([Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.04], [0, 0, 1], 0.01);
    }
  }
}

export const ENGINE_BUILDERS: Record<EngineId, (ctx: Ctx) => void> = {
  'twin-nacelle': twinNacelle,
  'single-heavy': singleHeavy,
  'pod-cluster': podCluster,
};
