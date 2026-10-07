import * as T from 'three';
import { mulberry32 } from '../core/noise.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { StyleLibrary } from '../style/materials.ts';
import { PALETTE } from '../style/tokens.ts';
import { frondGeometry } from './shapes.ts';

// Hardy conifer: the stand-in for the main project's "tree" (footprint radius
// 0.40 m, about 2.4 m tall). A narrow, spire-shaped alpine fir: a furrowed
// trunk with a root flare carries whorls of drooping branch sprays; lower
// whorls are longer and hang more, the leader at the top is a short upright
// spray. The crown reaches at most 0.5 m from the trunk, so a tree placed at
// the minimum legal distance from a habitat (1.51 m) keeps clear of its wall
// (0.98 m from the habitat's centre). Two trees at their minimum spacing
// (0.86 m) interleave their lowest branch tips, as trees planted close do.
// The seed is fixed, so every placed tree is the same model and yaw alone
// varies them on the planet.
//
// Sprays are thin double-sided cards (a raised rib and serrated edges), which
// is how a real-time conifer stays inside a 4 000-triangle part budget.

const HEIGHT = 2.35;

/** Needle green: palette olive pulled a quarter towards teal and darkened, as conifer foliage is. */
export const NEEDLE_GREEN = `#${new T.Color(PALETTE.olive).lerp(new T.Color(PALETTE.teal), 0.25).multiplyScalar(0.72).getHexString()}`;

export function needleMaterial(lib: StyleLibrary): T.MeshStandardMaterial {
  const m = lib.custom('props:needles', { finish: 'rubber', pattern: 'brushed', color: NEEDLE_GREEN, relief: 1.6, envIntensity: 0.55 });
  m.side = T.DoubleSide;
  return m;
}
export const barkMaterial = (lib: StyleLibrary) => lib.custom('props:bark', { finish: 'rubber', pattern: 'corrugated', color: PALETTE.oxide, relief: 1.6, envIntensity: 0.5 });

export function buildConifer(lib: StyleLibrary, b: PartBuilder) {
  const rnd = mulberry32(2026);
  const needles = needleMaterial(lib), bark = barkMaterial(lib);
  const tier = b.lod;
  const whorls = tier === 'high' ? 11 : tier === 'medium' ? 9 : 4;
  const perWhorl = tier === 'high' ? 8 : tier === 'medium' ? 6 : 4;
  const steps = tier === 'high' ? 6 : tier === 'medium' ? 4 : 3;
  const inner = tier === 'high';

  // Trunk: a lathed taper with a flared root collar.
  const trunk: [number, number][] = [[0.17, 0], [0.12, 0.05], [0.095, 0.16], [0.08, 0.6], [0.06, 1.2], [0.035, 1.8], [0.012, HEIGHT - 0.15], [0.001, HEIGHT]];
  b.lathe(bark, trunk, {}, Math.max(7, Math.round(b.settings.radialSegments * 0.6)));
  if (tier !== 'low') {
    // Surface roots: short flattened wedges radiating from the collar.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd() * 0.5;
      b.box(bark, [0.26, 0.05, 0.07], { position: [Math.cos(a) * 0.15, 0.015, -Math.sin(a) * 0.15], rotation: [0, a, -0.18] }, 0);
    }
  }

  // Whorls from 0.45 m to just under the top.
  const bottom = 0.45, top = HEIGHT - 0.32;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);               // 0 at the lowest whorl, 1 at the top
    const y = bottom + (top - bottom) * Math.pow(t, 0.92);
    const length = 0.14 + 0.42 * Math.pow(1 - t, 1.1);
    const width = 0.15 + 0.16 * (1 - t);
    const droop = 0.05 + 0.2 * (1 - t);
    const pitch = 0.18 + 0.32 * (1 - t);      // lower branches angle further down
    const offset = rnd() * Math.PI * 2;
    for (let i = 0; i < perWhorl; i++) {
      const yaw = offset + (i / perWhorl) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const len = length * (0.85 + rnd() * 0.3);
      b.geometry(needles, frondGeometry(len, width, droop * len, steps, 100 + w * 31 + i),
        { position: [0, y + (rnd() - 0.5) * 0.06, 0], rotation: [(rnd() - 0.5) * 0.4, yaw, -pitch] });
      if (inner && t < 0.85) {
        // A shorter, steeper spray between neighbours fills the crown from inside.
        const yaw2 = yaw + Math.PI / perWhorl;
        b.geometry(needles, frondGeometry(len * 0.55, width * 0.8, droop * 0.4, 4, 500 + w * 31 + i),
          { position: [0, y + 0.07, 0], rotation: [0, yaw2, -pitch - 0.35] });
      }
    }
  }
  // Leader: two crossed upright sprays at the top.
  for (const a of [0, Math.PI / 2]) {
    b.geometry(needles, frondGeometry(0.42, 0.13, 0, steps, 900 + a), { position: [0, top - 0.02, 0], rotation: [0, a, Math.PI / 2 - 0.05] });
  }
}
