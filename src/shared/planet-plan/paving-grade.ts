import type { HeightField } from '../../assets/claude-geometry/core/ground.ts';
import { HOME_SAMPLE_RADIUS } from '../home.ts';
import { PLAZA, SURFACE, roadHalfWidth } from './params.ts';
import type { Network } from './network.ts';
import { fromLocal } from './sphere.ts';
import type { V3 } from './sphere.ts';

/** A disc the terrain mesh is graded under (terrain/planet.ts Foundation) and flora keeps off. */
export interface PavingDisc { anchor: { dir: V3; yaw: number }; baseRadius: number; radius: number; covers: (x: number, z: number) => boolean }
export interface PavingGrade { foundations: PavingDisc[]; clearings: { dir: V3; radius: number }[] }

/** The public hub served from the planned ledger: the public environment at the sample radius. */
export const isPlannedMainPlanet = (radius: number) => Math.abs(radius - HOME_SAMPLE_RADIUS) < 1e-6;

const cache = new WeakMap<Network, Map<HeightField, PavingGrade>>();
/** Render-only grading: the drawn ground drops a few centimetres under every paved
 * surface so street meshes never fight it; walking still uses the natural field. */
export function pavingGrade(network: Network, field: HeightField): PavingGrade {
  let byField = cache.get(network);
  if (!byField) { byField = new Map(); cache.set(network, byField); }
  const known = byField.get(field); if (known) return known;
  const R = network.radius, ground = (p: V3) => 10 + field.heightAt(p);
  const foundations: PavingDisc[] = [], clearings: PavingGrade['clearings'] = [];
  const disc = (dir: V3, radius: number) => {
    let low = ground(dir);
    for (let k = 0; k < 6; k++) low = Math.min(low, ground(fromLocal(dir, [Math.cos(k * Math.PI / 3) * radius, Math.sin(k * Math.PI / 3) * radius], R)));
    const r2 = radius * radius;
    foundations.push({ anchor: { dir, yaw: 0 }, baseRadius: low - SURFACE.gradeBelow + .01, radius, covers: (x, z) => x * x + z * z <= r2 });
    clearings.push({ dir, radius: radius + SURFACE.floraMargin });
  };
  for (const piece of network.pieces) {
    const half = roadHalfWidth(piece.class) + .12;
    for (let i = 0; i < piece.samples.length; i += piece.class === 'door' ? 1 : 1) disc(piece.samples[i].p, half);
  }
  for (const j of network.junctions) {
    disc(j.center, 1.2);
    for (let i = 0; i < j.outline.length; i += 3) disc(fromLocal(j.center, j.outline[i], R), .9);
  }
  for (const plaza of network.plazas) {
    const r = plaza.radius + PLAZA.border + .12;
    if (plaza.centres.length === 1) {
      disc(plaza.centres[0], Math.min(r, 2));
      for (const ring of [r * .45, r * .8]) for (let k = 0; k < 10; k++) disc(fromLocal(plaza.centres[0], [Math.cos(k * Math.PI / 5) * ring, Math.sin(k * Math.PI / 5) * ring], R), r * .42);
    } else {
      const [a, b] = plaza.centres, steps = 8;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, p: V3 = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t], l = Math.hypot(...p);
        disc(p.map(v => v / l) as V3, r);
      }
    }
  }
  const grade = { foundations, clearings };
  byField.set(field, grade);
  return grade;
}
