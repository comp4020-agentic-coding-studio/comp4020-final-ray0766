import * as T from 'three';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import type { MainPlanetLedger } from '../shared/planet-plan/ledger.ts';
import type { Network } from '../shared/planet-plan/network.ts';
import { fromLocalRight } from '../shared/planet-plan/network.ts';
import { ROAD_PROFILES, RESERVES, roadHalfWidth } from '../shared/planet-plan/params.ts';
import type { RoadClass } from '../shared/planet-plan/params.ts';
import { compositionFootprint } from '../shared/planet-plan/footprint.ts';
import { anchorPoint, frameAt, fromLocal } from '../shared/planet-plan/sphere.ts';
import type { V3 } from '../shared/planet-plan/sphere.ts';
import type { PartPlacement } from '../shared/blueprint-model.ts';
import { HUB_SHIP } from '../shared/harbour-layout.ts';
import { HUB_DOCK } from '../shared/ports.ts';
import { NPCS, SPAWN } from '../shared/world.ts';

/** Planning debug view (?plan=1): street edges by class, setback lines, junction and
 * plaza outlines, building footprints and eaves, entrances, reserves and the plan's
 * reported conflicts, drawn on the ground of the live scene. Read-only. */
const COLOURS: Record<RoadClass | 'centre' | 'setback' | 'junction' | 'plaza' | 'base' | 'canopy' | 'entry' | 'reserve' | 'error' | 'warning' | 'lamp', string> = {
  main: '#d9472b', branch: '#e8a23a', lane: '#5aa64a', door: '#2f7fc8', centre: '#ffffff', setback: '#f07ac0',
  junction: '#f2d64b', plaza: '#3fc6d6', base: '#1b1f22', canopy: '#8a5a2f', entry: '#2f7fc8', reserve: '#b73cc9', error: '#ff1a1a', warning: '#ff9d00', lamp: '#ffd84a',
};
export function createPlanOverlay(network: Network, ledger: MainPlanetLedger, blueprints: Record<string, PartPlacement[]>, field: HeightField): T.Group {
  const R = network.radius, group = new T.Group(); group.name = 'plan-overlay';
  const lines = new Map<string, number[]>();
  const at = (p: V3, lift = .12) => new T.Vector3(...p).multiplyScalar(10 + field.heightAt(p) + lift);
  const polyline = (key: keyof typeof COLOURS, pts: V3[], closed = false, lift = .12) => {
    const list = lines.get(key) ?? []; lines.set(key, list);
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = at(pts[i], lift), b = at(pts[(i + 1) % pts.length], lift); list.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  };
  const circle = (key: keyof typeof COLOURS, c: V3, r: number, lift = .12) => {
    const f = frameAt(c); polyline(key, Array.from({ length: 32 }, (_, k) => fromLocal(c, [Math.cos(k / 32 * Math.PI * 2) * r, Math.sin(k / 32 * Math.PI * 2) * r], R, f)), true, lift);
  };
  for (const piece of network.pieces) {
    const half = roadHalfWidth(piece.class), setback = half + ROAD_PROFILES[piece.class].setback;
    for (const side of [-1, 1]) {
      polyline(piece.class, piece.samples.map(s => fromLocalRight(s.p, s.r, side * half, R)));
      if (piece.class !== 'door') polyline('setback', piece.samples.map(s => fromLocalRight(s.p, s.r, side * setback, R)), false, .1);
    }
    if (piece.class !== 'door') polyline('centre', piece.samples.map(s => s.p), false, .14);
  }
  for (const j of network.junctions) { const f = frameAt(j.center); polyline('junction', j.outline.map(q => fromLocal(j.center, q, R, f)), true); }
  for (const plaza of network.plazas) for (const c of plaza.centres) circle('plaza', c, plaza.radius);
  for (const object of ledger.objects) {
    if (object.kind !== 'structure') { if (object.kind === 'lamp') circle('lamp', object.position as V3, .3, .2); continue; }
    const f = compositionFootprint(blueprints[object.blueprintHash!]), p = object.position as V3, y = object.rotation;
    for (const [key, r] of [['base', f.base], ['canopy', f.canopy]] as const)
      polyline(key, [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]].map(([x, z]) => anchorPoint(p, y, x, z, R)), true, key === 'canopy' ? .3 : .15);
  }
  for (const d of ledger.doorPaths) { polyline('entry', [d.from, d.to], false, .16); circle('entry', d.from, .15, .16); }
  for (const [c, r] of [[SPAWN, RESERVES.spawn], [HUB_DOCK, RESERVES.dock], [HUB_SHIP, RESERVES.ship], [NPCS.mica.position, RESERVES.npc], [NPCS.sol.position, RESERVES.npc]] as [V3, number][]) circle('reserve', c, r);
  for (const c of ledger.conflicts) { circle(c.severity, c.at, .45, .5); circle(c.severity, c.at, .6, .5); }
  for (const [key, list] of lines) {
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(list, 3));
    // Drawn through roofs: a planning view shows the footprint under the eaves.
    const material = new T.LineBasicMaterial({ color: COLOURS[key as keyof typeof COLOURS], depthTest: false, depthWrite: false, transparent: true, opacity: key === 'centre' || key === 'setback' ? .6 : .95 });
    const mesh = new T.LineSegments(geometry, material); mesh.name = `plan:${key}`; mesh.renderOrder = 20; mesh.frustumCulled = false; mesh.raycast = () => {};
    group.add(mesh);
  }
  group.userData.disposeOwned = () => group.traverse(o => { if (o instanceof T.LineSegments) { o.geometry.dispose(); (o.material as T.Material).dispose(); } });
  return group;
}
