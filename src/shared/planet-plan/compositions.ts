import type { BlueprintId } from '../../assets/claude-geometry/core/ids.ts';
import type { Blueprint, PartPlacement, Rot } from '../blueprint-model.ts';
import type { PartId } from '../blueprint-parts.ts';

/** Public compositions for the planned main planet. Every one is an ordinary
 * workshop blueprint (5 × 5 cells, 3 levels, ≤ 120 parts) built only from the
 * shared catalogue, so a player can load, edit and place the same thing.
 * Local frame: +Z is the street front; `entry` is the outside cell a door path
 * meets, in grid cells. */
export interface Composition {
  id: string; name: string; nameZh: string;
  kind: 'home' | 'shop' | 'work' | 'civic' | 'garden' | 'landmark';
  blueprint: Blueprint;
  /** Grid cell just outside the main entrance (door path target), and which edge of it faces the street. */
  entry: { x: number; z: number };
}

class Sketch {
  parts: PartPlacement[] = [];
  posts = new Set<string>();
  add(part: PartId, x: number, z: number, rot: number = 0, level = 0) {
    this.parts.push({ n: this.parts.length + 1, part, x, z, rot: (((rot % 4) + 4) % 4) as Rot, level });
    return this;
  }
  has(part: PartId, x: number, z: number, level = 0) { return this.parts.some(p => p.part === part && p.x === x && p.z === z && p.level === level); }
}
/** Outward rot of a cell side: 0 +Z (front), 1 +X (right), 2 −Z (back), 3 −X (left). */
type Side = 0 | 1 | 2 | 3;
interface Edge { x: number; z: number; side: Side; i: number; n: number }
/** Perimeter edges of a rectangle, each with its index along its side (left→right as seen from outside). */
function perimeter(x0: number, z0: number, w: number, d: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < w; i++) edges.push({ x: x0 + i, z: z0 + d - 1, side: 0, i, n: w });
  for (let i = 0; i < d; i++) edges.push({ x: x0 + w - 1, z: z0 + d - 1 - i, side: 1, i, n: d });
  for (let i = 0; i < w; i++) edges.push({ x: x0 + w - 1 - i, z: z0, side: 2, i, n: w });
  for (let i = 0; i < d; i++) edges.push({ x: x0, z: z0 + i, side: 3, i, n: d });
  return edges;
}
/** Column at grid vertex (vx, vz) on `level`, mounted from whichever adjacent cell is listed first in `cells`. */
function post(s: Sketch, vx: number, vz: number, level: number, inside: (x: number, z: number) => boolean) {
  const key = `${vx},${vz},${level}`; if (s.posts.has(key)) return; s.posts.add(key);
  for (const [x, z, rot] of [[vx - 1, vz - 1, 0], [vx, vz - 1, 3], [vx, vz, 2], [vx - 1, vz, 1]] as [number, number, number][])
    if (inside(x, z)) { s.add('structure.column', x, z, rot, level); return; }
}
interface RoomSpec { x0: number; z0: number; w: number; d: number; level?: number; wall: (e: Edge) => PartId | null; floor?: PartId; corners?: boolean }
function room(s: Sketch, r: RoomSpec) {
  const level = r.level ?? 0, inside = (x: number, z: number) => x >= r.x0 && x < r.x0 + r.w && z >= r.z0 && z < r.z0 + r.d;
  for (let x = r.x0; x < r.x0 + r.w; x++) for (let z = r.z0; z < r.z0 + r.d; z++) s.add(r.floor ?? 'floor.deck', x, z, 0, level);
  for (const e of perimeter(r.x0, r.z0, r.w, r.d)) { const part = r.wall(e); if (part) s.add(part, e.x, e.z, e.side, level); }
  if (r.corners !== false) for (const [vx, vz] of [[r.x0, r.z0], [r.x0 + r.w, r.z0], [r.x0, r.z0 + r.d], [r.x0 + r.w, r.z0 + r.d]]) post(s, vx, vz, level, inside);
}
/** Posts under an upper floor's interior cells, along the middle line z0 + 2 (a depth-4 plan). */
function carryUpper(s: Sketch, x0: number, z0: number, w: number, inside: (x: number, z: number) => boolean) {
  for (let vx = x0 + 1; vx < x0 + w; vx++) post(s, vx, z0 + 2, 0, inside);
}
/** Gable roof one cell each side (depth 2), ridge along x; vendor panels and verges. */
function gableShort(s: Sketch, level: number, x0: number, z0: number, w: number) {
  for (let x = x0; x < x0 + w; x++) { s.add('roof.slope', x, z0 + 1, 0, level); s.add('roof.slope', x, z0, 2, level); }
  s.add('roof.verge.left', x0, z0 + 1, 0, level); s.add('roof.verge.right', x0 + w - 1, z0 + 1, 0, level);
  s.add('roof.verge.right', x0, z0, 2, level); s.add('roof.verge.left', x0 + w - 1, z0, 2, level);
}
/** Long gable over depth 4, ridge along x: two-cell kawara panels back to back, barge boards at both ends.
 * Interior roof cells need posts below the ridge line: added on level − 1. */
function gableLong(s: Sketch, level: number, x0: number, z0: number, w: number, inside: (x: number, z: number) => boolean) {
  for (let x = x0; x < x0 + w; x++) { s.add('roof.slope.long', x, z0 + 3, 0, level); s.add('roof.slope.long', x, z0, 2, level); }
  s.add('roof.verge.long.left', x0, z0 + 3, 0, level); s.add('roof.verge.long.right', x0 + w - 1, z0 + 3, 0, level);
  s.add('roof.verge.long.right', x0, z0, 2, level); s.add('roof.verge.long.left', x0 + w - 1, z0, 2, level);
  for (let vx = x0 + 1; vx < x0 + w; vx++) post(s, vx, z0 + 2, level - 1, inside);
}
/** Long gable over width 4 with the ridge along z: the gable end faces the street. */
function gableLongZ(s: Sketch, level: number, x0: number, z0: number, d: number, inside: (x: number, z: number) => boolean) {
  for (let z = z0; z < z0 + d; z++) { s.add('roof.slope.long', x0 + 3, z, 1, level); s.add('roof.slope.long', x0, z, 3, level); }
  // rot 1 (eave +X): local −X is world +Z, so its left verge is the front end.
  s.add('roof.verge.long.left', x0 + 3, z0 + d - 1, 1, level); s.add('roof.verge.long.right', x0 + 3, z0, 1, level);
  s.add('roof.verge.long.right', x0, z0 + d - 1, 3, level); s.add('roof.verge.long.left', x0, z0, 3, level);
  for (let vz = z0 + 1; vz < z0 + d; vz++) post(s, x0 + 2, vz, level - 1, inside);
}
/** Four hip corners: a pyramid roof over a 2 × 2 plan. */
function hipSquare(s: Sketch, level: number, x0: number, z0: number) {
  s.add('roof.slope.hip', x0 + 1, z0 + 1, 0, level); s.add('roof.slope.hip', x0 + 1, z0, 1, level);
  s.add('roof.slope.hip', x0, z0, 2, level); s.add('roof.slope.hip', x0, z0 + 1, 3, level);
}
const within = (x0: number, z0: number, w: number, d: number) => (x: number, z: number) => x >= x0 && x < x0 + w && z >= z0 && z < z0 + d;
const id = (n: number) => `51549d27-cabe-4d99-af34-c12${String(n).padStart(9, '0')}` as BlueprintId;
const blueprint = (n: number, name: string, s: Sketch): Blueprint => ({ id: id(n), name, parts: s.parts, groups: [] });

// ---- Homes ---------------------------------------------------------------

/** Cottage: 3 × 2, short gable, hooded door, flower-box windows; optional front garden. */
function cottage(yard: 'none' | 'hedge' | 'wall'): Sketch {
  const s = new Sketch(), z0 = yard === 'none' ? 0 : 0, front = z0 + 1;
  room(s, { x0: 0, z0, w: 3, d: 2, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.door.hooded' : 'wall.window.box') : e.side === 2 ? (e.i === 1 ? 'wall.window' : 'wall.solid') : e.i === 0 ? 'wall.window' : 'wall.solid' });
  gableShort(s, 1, 0, z0, 3);
  if (yard === 'none') { s.add('step.entry', 1, front + 1); return s; }
  // Front garden: lawn either side of a paved path, a boundary and a gate on the street line.
  for (let z = front + 1; z <= front + 2; z++) for (let x = 0; x < 3; x++) s.add(x === 1 ? 'road.paving' : 'garden.lawn', x, z);
  for (const x of [0, 2]) s.add(yard === 'hedge' ? 'garden.hedge' : 'garden.wall', x, front + 2, 0);
  s.add('garden.gate', 1, front + 2, 0);
  for (const z of [front + 1, front + 2]) { s.add(yard === 'hedge' ? 'garden.hedge' : 'garden.fence', 0, z, 3); s.add(yard === 'hedge' ? 'garden.hedge' : 'garden.fence', 2, z, 1); }
  s.add('garden.tree', 0, front + 2); s.add('garden.bed', 2, front + 1);
  return s;
}
/** Two-storey town house, 3 × 4, long gable to the street, posts under the ridge. */
function townhouse(storeys: 1 | 2, door: PartId = 'wall.door.hooded'): Sketch {
  const s = new Sketch(), inside = within(0, 0, 3, 4);
  room(s, { x0: 0, z0: 0, w: 3, d: 4, wall: e => e.side === 0 ? (e.i === 1 ? door : 'wall.window.box') : e.side === 2 ? (e.i === 1 ? 'wall.window' : 'wall.solid') : (e.i === 1 || e.i === 2) ? 'wall.window' : 'wall.solid' });
  if (storeys === 2) carryUpper(s, 0, 0, 3, inside);
  if (storeys === 2) room(s, { x0: 0, z0: 0, w: 3, d: 4, level: 1, wall: e => e.side === 0 ? 'wall.window' : e.side === 2 ? (e.i === 1 ? 'wall.louvre' : 'wall.solid') : e.i === 1 ? 'wall.window' : 'wall.solid' });
  gableLong(s, storeys, 0, 0, 3, inside);
  s.add('step.entry', 1, 4);
  return s;
}
/** L-shaped court house: a long back wing and a short side wing round a lawn court with a gate. */
function courtHouse(): Sketch {
  const s = new Sketch();
  // Back wing 4 × 2 (z 0–1); side wing 2 × 2 on the left (x 0–1, z 2–3).
  room(s, { x0: 0, z0: 0, w: 4, d: 2, wall: e => e.side === 2 ? (e.i % 2 ? 'wall.window' : 'wall.solid') : e.side === 0 ? (e.x <= 1 ? null : e.x === 2 ? 'wall.door.hooded' : 'wall.window.box') : e.side === 1 ? 'wall.window' : 'wall.solid' });
  room(s, { x0: 0, z0: 2, w: 2, d: 2, wall: e => e.side === 2 ? null : e.side === 0 ? (e.i === 0 ? 'wall.window.box' : 'wall.window') : e.side === 1 ? (e.i === 0 ? 'wall.window' : 'wall.solid') : 'wall.solid' });
  // Roofs: back wing gable along x; side wing gable along z, meeting at a valley.
  for (let x = 2; x < 4; x++) { s.add('roof.slope', x, 1, 0, 1); s.add('roof.slope', x, 0, 2, 1); }
  s.add('roof.slope.valley', 1, 1, 0, 1); s.add('roof.slope', 1, 0, 2, 1); s.add('roof.slope.hip', 0, 0, 2, 1); s.add('roof.slope', 0, 1, 3, 1);
  for (let z = 2; z < 4; z++) { s.add('roof.slope', 1, z, 1, 1); s.add('roof.slope', 0, z, 3, 1); }
  s.add('roof.verge.left', 1, 3, 1, 1); s.add('roof.verge.right', 0, 3, 3, 1);
  s.add('roof.verge.right', 3, 1, 0, 1); s.add('roof.verge.left', 3, 0, 2, 1);
  // Court: lawn with a stepping path, a tree, walls and a gate on the street side.
  for (const [x, z] of [[2, 2], [3, 2], [2, 3], [3, 3]]) s.add(x === 2 ? 'road.paving' : 'garden.lawn', x, z);
  s.add('garden.gate', 2, 3, 0); s.add('garden.wall', 3, 3, 0); s.add('garden.wall', 3, 2, 1); s.add('garden.wall', 3, 3, 1);
  s.add('garden.tree', 3, 3);
  return s;
}

// ---- Shops ---------------------------------------------------------------

/** Machiya shop: eaves to the street (hira-iri), open shop front below, flower boxes above. */
function shopHira(width: 3 | 4): Sketch {
  const s = new Sketch(), inside = within(0, 0, width, 4);
  room(s, { x0: 0, z0: 0, w: width, d: 4, wall: e => e.side === 0 ? (e.i === 0 && width === 4 ? 'wall.window' : 'wall.shopfront') : e.side === 2 ? (e.i === 1 ? 'wall.door' : 'wall.solid') : e.i === 2 ? 'wall.window' : 'wall.solid' });
  carryUpper(s, 0, 0, width, inside);
  room(s, { x0: 0, z0: 0, w: width, d: 4, level: 1, wall: e => e.side === 0 ? 'wall.window.box' : e.side === 2 ? 'wall.window' : e.i === 1 ? 'wall.louvre' : 'wall.solid' });
  gableLong(s, 2, 0, 0, width, inside);
  for (let x = 0; x < width; x++) s.add('road.apron', x, 4);
  if (width === 4) s.add('furniture.bench', 0, 4, 0);
  return s;
}
/** Gable to the street (tsuma-iri): a 4-wide front with the barge boards over the shop. */
function shopTsuma(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 4, 4);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, wall: e => e.side === 0 ? (e.i === 1 || e.i === 2 ? 'wall.shopfront' : 'wall.window.box') : e.side === 2 ? 'wall.solid' : e.i === 1 ? 'wall.window' : 'wall.solid' });
  gableLongZ(s, 1, 0, 0, 4, inside);
  for (const x of [1, 2]) s.add('road.apron', x, 4);
  return s;
}
/** Corner shop: open fronts on the street and the right-hand side street, two storeys. */
function cornerShop(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 4, 4);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, wall: e => e.side === 0 ? (e.i === 3 ? 'wall.window' : 'wall.shopfront') : e.side === 1 ? (e.i <= 1 ? 'wall.shopfront' : 'wall.solid') : e.side === 2 ? (e.i === 0 ? 'wall.door' : 'wall.solid') : e.i === 1 ? 'wall.window' : 'wall.solid' });
  carryUpper(s, 0, 0, 4, inside);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, level: 1, wall: e => e.side === 0 || e.side === 1 ? 'wall.window.box' : e.i === 2 ? 'wall.window' : 'wall.solid' });
  gableLong(s, 2, 0, 0, 4, inside);
  for (let x = 0; x < 3; x++) s.add('road.apron', x, 4);
  return s;
}
/** Market stall: four posts, porch beams, a short gable and a counter. */
function stall(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 2, 2);
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s.add('road.paving', x, z);
  for (const [vx, vz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) post(s, vx, vz, 0, inside);
  s.add('wall.solid', 0, 0, 3); s.add('wall.solid', 1, 0, 1); s.add('wall.solid', 0, 0, 2); s.add('wall.solid', 1, 0, 2);
  s.add('furniture.table', 0, 0); s.add('storage.crates', 1, 0, 2); s.add('storage.barrel', 1, 1, 1);
  gableShort(s, 1, 0, 0, 2);
  return s;
}

// ---- Work and civic ------------------------------------------------------

/** Long workshop: board walls, a wide double door, louvres, long gable over 5 × 4. */
function workshop(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 5, 4);
  room(s, { x0: 0, z0: 0, w: 5, d: 4, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.door-wide.open' : e.i === 2 ? null : e.i === 4 ? 'wall.window' : 'wall.corrugated') : e.side === 2 ? (e.i === 2 ? 'wall.louvre' : 'wall.corrugated') : e.i === 1 ? 'wall.louvre' : 'wall.corrugated' });
  gableLong(s, 1, 0, 0, 5, inside);
  s.add('step.entry-wide', 1, 4);
  s.add('storage.crates', 0, 0, 2); s.add('storage.barrel', 4, 0, 1); s.add('furniture.shelf', 4, 3, 1);
  return s;
}
/** Two-storey store with a gable to the yard. */
function warehouse(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 4, 4);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.door-wide.open' : e.i === 2 ? null : 'wall.corrugated') : e.i === 1 ? 'wall.louvre' : 'wall.corrugated' });
  carryUpper(s, 0, 0, 4, inside);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, level: 1, wall: e => e.side === 0 ? (e.i === 1 || e.i === 2 ? 'wall.louvre' : 'wall.corrugated') : 'wall.corrugated' });
  gableLongZ(s, 2, 0, 0, 4, inside);
  s.add('step.entry-wide', 1, 4);
  return s;
}
/** Post office: town house with the post sign, a counter shop front and a bench outside. */
function postOffice(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 4, 4);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.door.hooded' : e.i === 2 ? 'wall.shopfront' : 'wall.solid') : e.side === 2 ? 'wall.window' : e.i === 1 ? 'wall.window' : 'wall.solid' });
  carryUpper(s, 0, 0, 4, inside);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, level: 1, wall: e => e.side === 0 ? (e.i === 0 || e.i === 3 ? 'wall.solid' : 'wall.window.box') : e.i === 1 ? 'wall.window' : 'wall.solid' });
  gableLong(s, 2, 0, 0, 4, inside);
  s.add('sign.mail', 0, 3, 0); s.add('light.wall', 3, 3, 0);
  s.add('step.entry', 1, 4); s.add('road.apron', 2, 4); s.add('road.apron', 3, 4); s.add('furniture.bench', 3, 4, 0);
  return s;
}
/** Glasshouse: lattice windows on every side under a long gable. */
function glasshouse(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 3, 4);
  room(s, { x0: 0, z0: 0, w: 3, d: 4, wall: e => e.side === 0 && e.i === 1 ? 'wall.door.hooded' : 'wall.window' });
  gableLong(s, 1, 0, 0, 3, inside);
  s.add('garden.bed', 0, 0); s.add('garden.bed', 2, 0); s.add('garden.pot', 0, 3, 3);
  s.add('step.entry', 1, 4);
  return s;
}
/** Tea house: a noren front and window boxes under a gable to the street, a bench outside. */
function teahouse(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 4, 4);
  room(s, { x0: 0, z0: 0, w: 4, d: 4, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.shopfront' : e.i === 2 ? 'wall.window.box' : 'wall.window') : e.side === 2 ? (e.i === 1 ? 'wall.window' : 'wall.solid') : e.i === 1 || e.i === 2 ? 'wall.window' : 'wall.solid' });
  gableLongZ(s, 1, 0, 0, 4, inside);
  s.add('furniture.table', 1, 1); s.add('furniture.chair', 1, 1, 1); s.add('furniture.chair', 1, 1, 3);
  for (const x of [1, 2, 3]) s.add('road.apron', x, 4);
  s.add('furniture.bench', 3, 4, 0);
  return s;
}
/** Garden pavilion: an open 2 × 2 floor on posts under a pyramid roof, with a bench. */
function pavilion(): Sketch {
  const s = new Sketch(), inside = within(0, 0, 2, 2);
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s.add('floor.deck', x, z);
  for (const [vx, vz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) post(s, vx, vz, 0, inside);
  s.add('rail.guard', 0, 0, 2); s.add('rail.guard', 1, 0, 2);
  s.add('furniture.bench', 0, 0, 0);
  hipSquare(s, 1, 0, 0);
  return s;
}
/** Lookout: a two-storey 2 × 2 tower under a pyramid roof, windows all round the upper storey. */
function lookout(): Sketch {
  const s = new Sketch();
  room(s, { x0: 0, z0: 0, w: 2, d: 2, wall: e => e.side === 0 && e.i === 1 ? 'wall.door.hooded' : e.side === 0 ? 'wall.window' : e.i === 1 ? 'wall.window' : 'wall.solid' });
  room(s, { x0: 0, z0: 0, w: 2, d: 2, level: 1, wall: () => 'wall.window' });
  hipSquare(s, 2, 0, 0);
  s.add('step.entry', 1, 2);
  return s;
}
/** Harbour store: board walls and a wide door under a short gable, crates by the quay. */
function harbourStore(): Sketch {
  const s = new Sketch();
  room(s, { x0: 0, z0: 0, w: 4, d: 2, wall: e => e.side === 0 ? (e.i === 1 ? 'wall.door-wide.open' : e.i === 2 ? null : 'wall.corrugated') : e.side === 2 ? (e.i === 1 ? 'wall.louvre' : 'wall.corrugated') : 'wall.corrugated' });
  gableShort(s, 1, 0, 0, 4);
  s.add('step.entry-wide', 1, 2); s.add('road.apron', 0, 2); s.add('road.apron', 3, 2);
  return s;
}
/** Teleport station: the moon gate on a 2 × 1 dais, a paved forecourt in front and flower pots at its sides.
 * The same blueprint stands on the harbour square and on every home. */
function teleportStation(): Sketch {
  const s = new Sketch();
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s.add('road.paving', x, z);
  s.add('station.teleport', 0, 0, 0);
  s.add('garden.pot', 0, 1, 3); s.add('garden.pot', 1, 1, 1);
  return s;
}

export const PUBLIC_COMPOSITIONS: readonly Composition[] = [
  { id: 'cottage', name: 'Cottage', nameZh: '小屋', kind: 'home', blueprint: blueprint(1, 'Town · Cottage', cottage('none')), entry: { x: 1, z: 3 } },
  { id: 'cottage-garden', name: 'Garden cottage', nameZh: '前院小屋', kind: 'home', blueprint: blueprint(2, 'Town · Garden cottage', cottage('wall')), entry: { x: 1, z: 4 } },
  { id: 'cottage-hedge', name: 'Hedged cottage', nameZh: '绿篱小屋', kind: 'home', blueprint: blueprint(3, 'Town · Hedged cottage', cottage('hedge')), entry: { x: 1, z: 4 } },
  { id: 'townhouse', name: 'Town house', nameZh: '町屋', kind: 'home', blueprint: blueprint(4, 'Town · Town house', townhouse(1)), entry: { x: 1, z: 5 } },
  { id: 'townhouse-tall', name: 'Two-storey town house', nameZh: '两层町屋', kind: 'home', blueprint: blueprint(5, 'Town · Two-storey town house', townhouse(2)), entry: { x: 1, z: 5 } },
  { id: 'court-house', name: 'Court house', nameZh: '院落住宅', kind: 'home', blueprint: blueprint(6, 'Town · Court house', courtHouse()), entry: { x: 2, z: 4 } },
  { id: 'shop', name: 'Shop', nameZh: '商铺', kind: 'shop', blueprint: blueprint(7, 'Town · Shop', shopHira(3)), entry: { x: 1, z: 5 } },
  { id: 'shop-wide', name: 'Wide shop', nameZh: '宽面商铺', kind: 'shop', blueprint: blueprint(8, 'Town · Wide shop', shopHira(4)), entry: { x: 2, z: 5 } },
  { id: 'shop-gable', name: 'Gable shop', nameZh: '山墙商铺', kind: 'shop', blueprint: blueprint(9, 'Town · Gable shop', shopTsuma()), entry: { x: 1, z: 5 } },
  { id: 'corner-shop', name: 'Corner shop', nameZh: '转角店', kind: 'shop', blueprint: blueprint(10, 'Town · Corner shop', cornerShop()), entry: { x: 1, z: 5 } },
  { id: 'stall', name: 'Market stall', nameZh: '摊棚', kind: 'shop', blueprint: blueprint(11, 'Town · Market stall', stall()), entry: { x: 0, z: 2 } },
  { id: 'workshop', name: 'Workshop', nameZh: '作坊', kind: 'work', blueprint: blueprint(12, 'Town · Workshop', workshop()), entry: { x: 1, z: 5 } },
  { id: 'warehouse', name: 'Store house', nameZh: '仓房', kind: 'work', blueprint: blueprint(13, 'Town · Store house', warehouse()), entry: { x: 1, z: 5 } },
  { id: 'post-office', name: 'Post office', nameZh: '邮局', kind: 'civic', blueprint: blueprint(14, 'Town · Post office', postOffice()), entry: { x: 1, z: 5 } },
  { id: 'glasshouse', name: 'Glasshouse', nameZh: '温室', kind: 'civic', blueprint: blueprint(15, 'Town · Glasshouse', glasshouse()), entry: { x: 1, z: 5 } },
  { id: 'teahouse', name: 'Tea house', nameZh: '茶屋', kind: 'shop', blueprint: blueprint(16, 'Town · Tea house', teahouse()), entry: { x: 1, z: 5 } },
  { id: 'pavilion', name: 'Garden pavilion', nameZh: '庭园凉亭', kind: 'garden', blueprint: blueprint(17, 'Town · Garden pavilion', pavilion()), entry: { x: 0, z: 2 } },
  { id: 'lookout', name: 'Lookout tower', nameZh: '望楼', kind: 'landmark', blueprint: blueprint(18, 'Town · Lookout tower', lookout()), entry: { x: 1, z: 3 } },
  { id: 'harbour-store', name: 'Harbour store', nameZh: '港口仓房', kind: 'work', blueprint: blueprint(19, 'Town · Harbour store', harbourStore()), entry: { x: 1, z: 3 } },
  { id: 'teleport-station', name: 'Teleport station', nameZh: '星际传送站', kind: 'civic', blueprint: blueprint(20, 'Town · Teleport station', teleportStation()), entry: { x: 0, z: 2 } },
];
export const TELEPORT_STATION = PUBLIC_COMPOSITIONS.find(c => c.id === 'teleport-station')!;
export const COMPOSITION_IDS: ReadonlySet<string> = new Set(PUBLIC_COMPOSITIONS.map(c => c.id));
