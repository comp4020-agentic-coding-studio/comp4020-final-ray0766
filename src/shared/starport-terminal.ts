import type { Kit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { PLAN_RADIUS } from './planet-plan/params.ts';
import { frameAt, heading, walk, yawFacing } from './planet-plan/sphere.ts';
import type { V3 } from './planet-plan/sphere.ts';
import type { PartBox } from './physics/parts.ts';
import { HUB_DOCK } from './ports.ts';
import type { Vec3 } from './world.ts';

// The harbour's starport terminal: a control tower beside the boarding gate so
// travellers can find it from across the town. It is travel-system scenery like
// the parked craft (too tall for a workshop blueprint), drawn with the village kit
// materials and given the same collision on server and client.

const dock = HUB_DOCK as V3, frame = frameAt(dock), bearing = 300 * Math.PI / 180;
const away = frame.east.map((v, i) => v * Math.sin(bearing) + frame.north[i] * Math.cos(bearing)) as V3;
/** 4.6 m north-west of the boarding gate, clear of Harbour Way, the quay store and the craft. */
export const HUB_TERMINAL = walk(dock, away, 4.6, PLAN_RADIUS) as Vec3;
/** Door and signs face the boarding gate. */
export const HUB_TERMINAL_YAW = yawFacing(HUB_TERMINAL as V3, heading(HUB_TERMINAL as V3, dock));
/** Local metres, +Y up, +Z towards the gate. */
export const TERMINAL = { plinth: 1.3, shaft: .72, cabFloor: 9.6, cab: 1.3, roof: 1.6, top: 14.6, sign: { y: 6.7, width: 2.3, height: .8 } } as const;
export const TERMINAL_COLLIDERS: readonly PartBox[] = [
  { tag: 'terminal plinth', center: [0, .05, 0], half: [1.31, .35, 1.31], support: true },
  { tag: 'terminal step', center: [0, .1, 1.5], half: [.62, .1, .21], support: true },
  { tag: 'terminal shaft', center: [0, 5.1, 0], half: [.8, 5, .8] },
  { tag: 'terminal signs', center: [0, TERMINAL.sign.y, 0], half: [TERMINAL.sign.width / 2 + .01, TERMINAL.sign.height / 2 + .01, TERMINAL.shaft + .1] },
  { tag: 'terminal cab', center: [0, 12.2, 0], half: [1.62, 2.6, 1.62] },
];

export function terminalTower(k: Kit) {
  const { b } = k, t = TERMINAL, round = k.low ? 8 : 16;
  // Stone plinth sunk 30 cm into the quay, and a step to the door.
  b.cylinder(k.m('concrete'), t.plinth, t.plinth, .7, { position: [0, .05, 0] }, { segments: round });
  b.box(k.m('concrete'), [1.2, .2, .4], { position: [0, .1, 1.5] }, k.low ? 0 : .02);
  // Plaster shaft with timber storey bands, a teal door and slit windows towards the gate.
  b.cylinder(k.m('skin'), t.shaft, t.shaft, 9.2, { position: [0, 5, 0] }, { segments: round });
  for (const y of [2.6, 4.8, 7.0, 9.2]) b.cylinder(k.m('post'), t.shaft + .05, t.shaft + .05, .14, { position: [0, y, 0] }, { segments: round });
  b.box(k.m('post'), [1.0, 2.1, .12], { position: [0, 1.45, t.shaft - .02] }, 0);
  b.box(k.m('leaf'), [.78, 1.9, .1], { position: [0, 1.35, t.shaft + .02] }, 0);
  if (!k.low) for (const y of [3.7, 5.9, 8.1]) b.box(k.m('glass'), [.36, .7, .08], { position: [0, y, t.shaft - .01] }, 0);
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
