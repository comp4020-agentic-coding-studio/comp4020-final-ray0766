import type { Kit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { PLAN_RADIUS } from './planet-plan/params.ts';
import { frameAt, heading, walk, yawFacing } from './planet-plan/sphere.ts';
import type { V3 } from './planet-plan/sphere.ts';
import type { PartBox } from './physics/parts.ts';
import { HUB_DOCK } from './ports.ts';
import { SPAWN } from './world.ts';
import type { Vec3 } from './world.ts';

// Starport terminals: a control tower at each boarding gate so travellers can
// find it from across the town, plus a lit ring and a console that show where
// to stand. They are travel-system scenery like the parked craft (too tall for a
// workshop blueprint), drawn with the village kit materials and given the same
// collision on server and client.

/** Drawn radius of the boarding ring; the prompt shows inside BOARD_RADIUS − 0.12 (1.53 m). */
export const BOARD_RING = 1.5;

const dock = HUB_DOCK as V3, frame = frameAt(dock);
const fromDock = (bearingDegrees: number, metres: number) => {
  const b = bearingDegrees * Math.PI / 180, away = frame.east.map((v, i) => v * Math.sin(b) + frame.north[i] * Math.cos(b)) as V3;
  return walk(dock, away, metres, PLAN_RADIUS) as Vec3;
};
/** The harbour tower, 4.6 m north-west of the boarding gate, clear of Harbour Way, the quay store and the craft. */
export const HUB_TERMINAL = fromDock(300, 4.6);
/** Door and signs face the boarding gate. */
export const HUB_TERMINAL_YAW = yawFacing(HUB_TERMINAL as V3, heading(HUB_TERMINAL as V3, dock));
/** The boarding console stands on the ring's edge on the tower's side, its screen facing the gate. */
export const HUB_CONSOLE = fromDock(300, BOARD_RING - .25);
export const HUB_CONSOLE_YAW = yawFacing(HUB_CONSOLE as V3, heading(HUB_CONSOLE as V3, dock));

export interface TowerSpec { plinth: number; shaft: number; signs: readonly (1 | -1)[]; signWidth: number; screen: boolean }
/** Local metres, +Y up, +Z towards the gate. */
export const TERMINAL = { plinth: 1.3, shaft: .72, cabFloor: 9.6, cab: 1.3, roof: 1.6, top: 14.6, sign: { y: 6.7, width: 2.3, height: .8 } } as const;
export const HUB_TOWER: TowerSpec = { plinth: TERMINAL.plinth, shaft: TERMINAL.shaft, signs: [1, -1], signWidth: TERMINAL.sign.width, screen: false };
/** A home's tower is slim: it stands inside the 1 m clear disc that every saved object keeps from the landing pad. */
export const HOME_TOWER: TowerSpec = { plinth: .38, shaft: .3, signs: [1], signWidth: 1.2, screen: true };
/** 0.6 m due south of the pad centre (frameAt bearing 180), behind every generated route, which leaves the pad
 * northwards; the landing point itself stays free. */
export const HOME_TERMINAL_OFFSET = .6;
export function homeTerminal(radius: number): { dir: Vec3; yaw: number } {
  const pad = SPAWN as V3, south = frameAt(pad).north.map(v => -v) as V3;
  const dir = walk(pad, south, HOME_TERMINAL_OFFSET, radius) as Vec3;
  return { dir, yaw: yawFacing(dir as V3, heading(dir as V3, pad)) };
}

export function towerColliders(spec: TowerSpec): PartBox[] {
  const t = TERMINAL, wide = spec.plinth > 1;
  return [
    { tag: 'terminal plinth', center: [0, wide ? .05 : .025, 0], half: [spec.plinth + .01, wide ? .35 : .125, spec.plinth + .01], support: true },
    ...(wide ? [{ tag: 'terminal step', center: [0, .1, 1.5] as Vec3, half: [.62, .1, .21] as Vec3, support: true }] : []),
    { tag: 'terminal shaft', center: [0, 5.1, 0], half: [spec.shaft + .08, 5, spec.shaft + .08] },
    { tag: 'terminal signs', center: [0, t.sign.y, 0], half: [spec.signWidth / 2 + .01, t.sign.height / 2 + .01, spec.shaft + .1] },
    { tag: 'terminal cab', center: [0, 12.2, 0], half: [1.62, 2.6, 1.62] },
  ];
}
export const TERMINAL_COLLIDERS: readonly PartBox[] = towerColliders(HUB_TOWER);
export const HOME_TERMINAL_COLLIDERS: readonly PartBox[] = towerColliders(HOME_TOWER);

export function terminalTower(k: Kit, spec: TowerSpec = HUB_TOWER) {
  const { b } = k, t = TERMINAL, round = k.low ? 8 : 16, wide = spec.plinth > 1;
  // Stone plinth sunk into the ground (a step to the harbour tower's door).
  b.cylinder(k.m('concrete'), spec.plinth, spec.plinth, wide ? .7 : .25, { position: [0, wide ? .05 : .025, 0] }, { segments: round });
  if (wide) b.box(k.m('concrete'), [1.2, .2, .4], { position: [0, .1, 1.5] }, k.low ? 0 : .02);
  // Plaster shaft with timber storey bands; a door, or a lit boarding screen, and slit windows towards the gate.
  b.cylinder(k.m('skin'), spec.shaft, spec.shaft, 9.2, { position: [0, 5, 0] }, { segments: round });
  for (const y of [2.6, 4.8, 7.0, 9.2]) b.cylinder(k.m('post'), spec.shaft + .05, spec.shaft + .05, .14, { position: [0, y, 0] }, { segments: round });
  if (wide) {
    b.box(k.m('post'), [1.0, 2.1, .12], { position: [0, 1.45, spec.shaft - .02] }, 0);
    b.box(k.m('leaf'), [.78, 1.9, .1], { position: [0, 1.35, spec.shaft + .02] }, 0);
  }
  if (spec.screen) {
    b.box(k.m('post'), [.5, .42, .06], { position: [0, 1.2, spec.shaft + .02] }, 0);
    b.box(k.m('lamp'), [.4, .32, .02], { position: [0, 1.2, spec.shaft + .06] }, 0);
  }
  if (!k.low) for (const y of [3.7, 5.9, 8.1]) b.box(k.m('glass'), [Math.min(.36, spec.shaft), .7, .08], { position: [0, y, spec.shaft - .01] }, 0);
  // Control cab: stone deck, octagonal glass, a lit band, a tiled cone and a beacon mast.
  b.cylinder(k.m('concrete'), t.cab + .12, t.cab + .12, .26, { position: [0, t.cabFloor + .13, 0] }, { segments: 8 });
  b.cylinder(k.m('glass'), t.cab, t.cab, 1.4, { position: [0, t.cabFloor + .96, 0] }, { segments: 8 });
  if (!k.low) for (let i = 0; i < 8; i++) {
    const a = (i + .5) / 8 * Math.PI * 2, r = t.cab * Math.cos(Math.PI / 8) + .02;
    b.box(k.m('post'), [.1, 1.4, .1], { position: [Math.sin(a) * r, t.cabFloor + .96, Math.cos(a) * r] }, 0);
  }
  b.cylinder(k.m('lamp'), t.cab + .05, t.cab + .05, .14, { position: [0, t.cabFloor + 1.62, 0] }, { segments: 8 });
  b.cylinder(k.m('corrugated'), .18, t.roof, 1.1, { position: [0, t.cabFloor + 2.24, 0] }, { segments: 8 });
  b.cylinder(k.m('steel'), .06, .06, 2.0, { position: [0, t.cabFloor + 3.7, 0] }, { segments: k.low ? 4 : 6 });
  b.box(k.m('lamp'), [.38, .38, .38], { position: [0, t.top - .2, 0] }, 0);
}

/** Waist-high boarding console: stone foot, iron post, a slanted head with a lit screen facing +Z. */
export const CONSOLE = { height: 1.18, screen: { y: 1.08, tilt: .55 } } as const;
export const CONSOLE_COLLIDERS: readonly PartBox[] = [{ tag: 'boarding console', center: [0, .65, 0], half: [.34, .65, .3] }];
export function boardingConsole(k: Kit) {
  const { b } = k, s = CONSOLE.screen;
  b.box(k.m('concrete'), [.6, .08, .5], { position: [0, .04, 0] }, k.low ? 0 : .015);
  b.box(k.m('steel'), [.18, .92, .18], { position: [0, .5, -.04] }, 0);
  b.box(k.m('concrete'), [.64, .1, .44], { position: [0, s.y, 0], rotation: [s.tilt, 0, 0] }, k.low ? 0 : .015);
  b.box(k.m('lamp'), [.5, .02, .3], { position: [0, s.y + Math.cos(s.tilt) * .06, Math.sin(s.tilt) * .06], rotation: [s.tilt, 0, 0] }, 0);
}
