import { ROAD_PROFILES } from './params.ts';
import type { Network } from './network.ts';
import { fromLocalRight, v2 } from './network.ts';
import { arc, fromLocal, frameAt, segmentDistance } from './sphere.ts';
import type { V3 } from './sphere.ts';

/** A kerb run: its centreline on the ground, in order. Rendering and physics share it. */
export interface KerbRun { id: string; points: V3[] }

/** Kerb centrelines along main streets and their kerbed junction corners, broken where a
 * door path or a lane crosses (a dropped kerb), so every entrance is flush. */
export function kerbRuns(network: Network): KerbRun[] {
  const R = network.radius, profile = ROAD_PROFILES.main, offset = profile.paved / 2 + profile.edge + profile.kerb / 2;
  const doors = network.pieces.filter(p => p.class === 'door');
  const dropped = (p: V3) => doors.some(d => {
    for (let i = 1; i < d.samples.length; i++) if (segmentDistance(p, d.samples[i - 1].p, d.samples[i].p, R).distance < ROAD_PROFILES.door.paved / 2 + .2) return true;
    return false;
  });
  const runs: KerbRun[] = [];
  const push = (id: string, points: V3[]) => {
    let run: V3[] = [], part = 0;
    const flush = () => { if (run.length > 1) runs.push({ id: `${id}.${part++}`, points: run }); run = []; };
    for (const p of points) { if (dropped(p)) flush(); else run.push(p); }
    flush();
  };
  for (const piece of network.pieces) {
    if (piece.class !== 'main') continue;
    for (const side of [-1, 1]) push(`${piece.id}:${side}`, piece.samples.map(s => fromLocalRight(s.p, s.r, side * offset, R)));
  }
  for (const j of network.junctions) j.corners.forEach((corner, c) => {
    if (!corner.kerb) return;
    const f = frameAt(j.center), d = corner.edge + corner.kerbWidth / 2;
    push(`junction:${j.node}:${c}`, corner.points.map((q, i) => fromLocal(j.center, v2.add(q, v2.scale(corner.normals[i], d)), R, f)));
  });
  // Drop slivers left between two crossings.
  return runs.filter(r => r.points.slice(1).reduce((n, p, i) => n + arc(r.points[i], p, R), 0) > .3);
}
