import type { Vec3 } from '../core/vec.ts';

/**
 * Fixed probe directions shared by the samples script, the unit tests and the
 * browser test, so heights computed in Node and in Chrome can be compared.
 * The first is the landing direction itself.
 */
export const PROBE_DIRS: Vec3[] = ([[0, 1, 0.27], [0.6, 0.5, 0.62], [-0.8, 0.2, 0.55], [0.1, -0.95, 0.3], [-0.3, -0.4, -0.86], [0.92, -0.1, -0.38], [0.2, 0.7, -0.68], [-0.66, 0.66, 0.35]] as Vec3[])
  .map(d => { const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); return [d[0] / l, d[1] / l, d[2] / l] as Vec3; });
