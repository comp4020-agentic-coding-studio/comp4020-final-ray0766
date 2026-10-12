import type { Emit } from '../../assets/claude-geometry/blueprint/parts/kit.ts';
import type { Box } from '../../assets/claude-geometry/blueprint/parts/info.ts';
import { WALL_T } from '../../assets/claude-geometry/blueprint/parts/kit.ts';
import { gardenFence, gardenGate, gardenHedge, gardenLawn, gardenWall, hoodedDoor, longFoot, longRoof, longVergeLeft, longVergeRight, roadApron, roadEdge, roadKerb, roadPaving, roadPavingCurve, roadPlaza, shopFront, windowBox } from './geometry.ts';
import { PAVING } from './style.ts';
import type { Vec3 } from '../world.ts';

/** R12 village kit: appended host parts. IDs are permanent; never redefine one. */
export const VILLAGE_KIT_IDS = [
  'wall.door.hooded', 'wall.shopfront', 'wall.window.box',
  'garden.wall', 'garden.gate', 'garden.fence', 'garden.hedge', 'garden.lawn',
  'road.paving', 'road.paving.curve', 'road.edge', 'road.kerb.low', 'road.apron', 'road.plaza',
  'roof.slope.long', 'roof.verge.long.left', 'roof.verge.long.right',
] as const;
export type VillageKitId = typeof VILLAGE_KIT_IDS[number];
export const isVillageKitId = (value: unknown): value is VillageKitId => typeof value === 'string' && (VILLAGE_KIT_IDS as readonly string[]).includes(value);

/** A physics proxy in part-local metres (same contract as src/shared/physics/parts.ts PartBox). */
export interface KitCollider { tag: string; center: Vec3; half: Vec3; support?: boolean; pitch?: number }
export interface VillageKitPart {
  id: VillageKitId; label: string; blurb: string; zh: { name: string; blurb: string };
  category: 'Wall' | 'Street' | 'Garden' | 'Roof'; mount: 'cell' | 'edge'; role: 'wall' | 'guard' | 'deck' | 'slope' | 'trim';
  floor?: boolean; door?: boolean; roof?: boolean; trim?: { sides: number[]; on: 'slope' };
  /** Two-cell parts: the second cell lies one cell behind, along local −Z. */
  span?: 'back';
  tags: string[]; envelope: Box; colliders: KitCollider[];
  walk: string; connects: string; emit: Emit;
}
const FACE = WALL_T / 2;
const box = (min: Vec3, max: Vec3): Box => ({ min, max });
const collider = (tag: string, min: Vec3, max: Vec3, support = false): KitCollider => ({
  tag, support, center: min.map((v, i) => (v + max[i]) / 2) as Vec3, half: min.map((v, i) => (max[i] - v) / 2) as Vec3,
});
/** Walkable deck: a 0.16 m slab under the cell, tagged so it never reads as a room floor. */
const deckSlab = (tag: string) => [collider(tag, [-.5, -.16, -.5], [.5, 0, .5], true)];

const VILLAGE_KIT_PARTS_MUTABLE: VillageKitPart[] = [
  { id: 'wall.door.hooded', label: 'Hooded entrance', blurb: 'Open lattice door under a tiled hood', zh: { name: '带檐入口', blurb: '瓦檐下敞开的格子门' },
    category: 'Wall', mount: 'edge', role: 'wall', door: true, tags: ['wall', 'door', 'entrance', 'hood', 'porch'],
    envelope: box([-.5, 0, -.1], [.5, 2.24, FACE + .64]),
    colliders: [collider('porch hood', [-.48, 2.0, FACE], [.48, 2.24, FACE + .62])],
    walk: 'A 0.8 m doorway, open; the hood is 2.0 m clear above the step.', connects: 'Like a door wall. Keep the cell outside clear for steps or paving.', emit: hoodedDoor },
  { id: 'wall.shopfront', label: 'Shop front', blurb: 'Open portal, noren and a deep awning', zh: { name: '店面', blurb: '敞开门面、暖帘与深檐' },
    category: 'Wall', mount: 'edge', role: 'wall', door: true, tags: ['wall', 'door', 'shop', 'market', 'awning', 'noren'],
    envelope: box([-.5, 0, -.12], [.5, 2.24, FACE + .82]),
    colliders: [collider('shop post', [-.5, 0, -.12], [-.42, 2.04, .12]), collider('shop post', [.42, 0, -.12], [.5, 2.04, .12]),
      collider('shop head', [-.42, 1.86, -.12], [.42, 2.04, .12]), collider('threshold', [-.42, -.02, -.12], [.42, .02, .12], true),
      collider('shop awning', [-.49, 1.96, FACE], [.49, 2.24, FACE + .8])],
    walk: 'An 0.84 m opening with a flush stone sill; the noren is cloth and the awning 1.96 m clear.', connects: 'Faces a street or court at ground level; keep the cell outside clear.', emit: shopFront },
  { id: 'wall.window.box', label: 'Window with flower box', blurb: 'Lattice window, planter and hood', zh: { name: '花箱格窗', blurb: '格子窗、窗下花箱与小檐' },
    category: 'Wall', mount: 'edge', role: 'wall', tags: ['wall', 'window', 'flowers', 'planter'],
    envelope: box([-.5, 0, -.12], [.5, 2.04, .42]),
    colliders: [collider('wall.window', [-.5, 0, -.12], [.5, 2.04, .23]), collider('window planter', [-.36, .5, .09], [.36, .95, .32]), collider('window hood', [-.43, 1.69, .09], [.43, 1.82, .4])],
    walk: 'Solid wall; the flower box stands 0.32 m out at knee height.', connects: 'Any outer wall edge.', emit: windowBox },
  { id: 'garden.wall', label: 'Courtyard wall', blurb: 'Low plaster wall with a tiled coping', zh: { name: '庭院矮墙', blurb: '瓦顶抹灰矮墙' },
    category: 'Garden', mount: 'edge', role: 'guard', tags: ['garden', 'wall', 'boundary', 'courtyard'],
    envelope: box([-.5, 0, -.12], [.5, 1.0, .12]), colliders: [collider('garden wall', [-.5, 0, -.12], [.5, 1.0, .12])],
    walk: 'Blocks: 1.0 m high.', connects: 'On a cell edge beside a floor, lawn or paving.', emit: gardenWall },
  { id: 'garden.gate', label: 'Garden gate', blurb: 'Two posts under a small tiled roof', zh: { name: '庭院门', blurb: '小瓦顶下的两根门柱' },
    category: 'Garden', mount: 'edge', role: 'guard', door: true, tags: ['garden', 'gate', 'entrance', 'boundary'],
    envelope: box([-.5, 0, -.3], [.5, 2.03, .3]),
    colliders: [collider('gate post', [-.5, 0, -.09], [-.38, 1.82, .09]), collider('gate post', [.38, 0, -.09], [.5, 1.82, .09]),
      collider('gate roof', [-.5, 1.73, -.3], [.5, 2.03, .3]), collider('threshold', [-.38, -.02, -.1], [.38, .02, .1], true)],
    walk: 'A 0.76 m opening, 1.73 m clear.', connects: 'In a courtyard wall, fence or hedge line; keep both sides of the opening clear.', emit: gardenGate },
  { id: 'garden.fence', label: 'Bamboo fence', blurb: 'Slats between two posts', zh: { name: '竹篱', blurb: '两柱之间的竹条' },
    category: 'Garden', mount: 'edge', role: 'guard', tags: ['garden', 'fence', 'boundary'],
    envelope: box([-.5, 0, -.04], [.5, 1.12, .05]), colliders: [collider('fence', [-.5, 0, -.05], [.5, 1.12, .05])],
    walk: 'Blocks: 1.1 m high.', connects: 'On a cell edge beside a floor, lawn or paving.', emit: gardenFence },
  { id: 'garden.hedge', label: 'Clipped hedge', blurb: 'Knee-to-waist evergreen hedge', zh: { name: '修剪绿篱', blurb: '齐腰的常绿绿篱' },
    category: 'Garden', mount: 'edge', role: 'guard', tags: ['garden', 'hedge', 'boundary', 'green'],
    envelope: box([-.5, 0, -.24], [.5, .88, .24]), colliders: [collider('hedge', [-.5, 0, -.24], [.5, .88, .24])],
    walk: 'Blocks: 0.9 m high.', connects: 'On a cell edge beside a floor, lawn or paving.', emit: gardenHedge },
  { id: 'garden.lawn', label: 'Lawn', blurb: 'Grass cell; carries trees and benches', zh: { name: '草坪', blurb: '可种树、放长椅的草地' },
    category: 'Garden', mount: 'cell', role: 'deck', floor: true, tags: ['garden', 'lawn', 'grass', 'yard'],
    envelope: box([-.5, -.16, -.5], [.5, 0, .5]), colliders: deckSlab('lawn'),
    walk: 'Walkable at floor level.', connects: 'Ground level; carries garden walls, trees, beds and benches like a floor.', emit: gardenLawn },
  { id: 'road.paving', label: 'Lane paving', blurb: 'Staggered flagstones, the town lanes’ stone', zh: { name: '巷道铺石', blurb: '错缝石板，与镇上巷道同款' },
    category: 'Street', mount: 'cell', role: 'deck', floor: true, tags: ['street', 'road', 'lane', 'path', 'paving'],
    envelope: box([-.5, -.16, -.5], [.5, 0, .5]), colliders: deckSlab('paving'),
    walk: 'Walkable at floor level.', connects: 'Any ground cell; edge it with lane edging or a low kerb.', emit: roadPaving },
  { id: 'road.paving.curve', label: 'Lane bend', blurb: 'Rounded outer corner of a lane', zh: { name: '巷道弯角', blurb: '巷道外侧圆角' },
    category: 'Street', mount: 'cell', role: 'deck', floor: true, tags: ['street', 'road', 'lane', 'bend', 'corner', 'paving'],
    envelope: box([-.5, -.16, -.5], [.5, .005, .5]), colliders: deckSlab('paving'),
    walk: 'Walkable; the grass corner is level with it.', connects: 'Turns paving from the cell’s local −Z side to its +X side.', emit: roadPavingCurve },
  { id: 'road.edge', label: 'Lane edging', blurb: 'Flush dressed-stone edge band', zh: { name: '巷道边石', blurb: '平齐的条石边带' },
    category: 'Street', mount: 'edge', role: 'guard', tags: ['street', 'road', 'edge', 'paving'],
    envelope: box([-.5, -.08, -.09], [.5, .005, .09]), colliders: [collider('edge stone', [-.5, -.1, -PAVING.edge / 2], [.5, .005, PAVING.edge / 2], true)],
    walk: 'Flush and walkable.', connects: 'On a paving edge.', emit: roadEdge },
  { id: 'road.kerb.low', label: 'Low kerb', blurb: 'Chamfered 6 cm kerb, as on the main streets', zh: { name: '低路缘石', blurb: '6 厘米倒角路缘，与主街相同' },
    category: 'Street', mount: 'edge', role: 'guard', tags: ['street', 'road', 'kerb', 'edge'],
    envelope: box([-.5, -.08, -.09], [.5, .06, .09]), colliders: [collider('kerb', [-.5, -.08, -PAVING.kerbWidth / 2], [.5, PAVING.kerbHeight, PAVING.kerbWidth / 2], true)],
    walk: 'A 6 cm step; walk straight over it.', connects: 'On a paving edge.', emit: roadKerb },
  { id: 'road.apron', label: 'Door apron', blurb: 'Large dressed flags before a door', zh: { name: '门前石板', blurb: '门前的大块条石' },
    category: 'Street', mount: 'cell', role: 'deck', floor: true, tags: ['street', 'entrance', 'apron', 'paving'],
    envelope: box([-.5, -.16, -.5], [.5, 0, .5]), colliders: deckSlab('paving'),
    walk: 'Walkable at floor level.', connects: 'In front of a door or steps; joins lane paving flush.', emit: roadApron },
  { id: 'road.plaza', label: 'Fan paving', blurb: 'Quarter of a round; four cells make a circle', zh: { name: '扇形铺砖', blurb: '四分之一圆，四格拼成一圈' },
    category: 'Street', mount: 'cell', role: 'deck', floor: true, tags: ['street', 'plaza', 'square', 'paving', 'court'],
    envelope: box([-.5, -.16, -.5], [.5, 0, .5]), colliders: deckSlab('paving'),
    walk: 'Walkable at floor level.', connects: 'Turn four cells about a shared corner for a round pattern.', emit: roadPlaza },
];
/** Stepped collision top over the long panel: the bands' foot plus their thickness, the ridge, the eave. */
function longRoofBoxes(): KitCollider[] {
  const cuts = [-1.5, -1.41, -1.25, -1, -.75, -.5, -.25, 0, .25, .5, .541, .61, .735, .86, .9622];
  return cuts.slice(0, -1).map((z, i) => {
    const end = cuts[i + 1], top = z < -1.41 ? 1.15 : Math.max(longFoot(z), longFoot(end)) + .102;
    const bottom = z >= .61 ? Math.min(-.16, longFoot(end) - .045) : -.16;
    return collider('pitched roof', [-.5, bottom, z], [.5, top, end]);
  });
}
function longVergeBoxes(side: -1 | 1): KitCollider[] {
  const cuts = [-1.5, -1, -.5, 0, .5, .9622];
  return cuts.slice(0, -1).map((z, i) => {
    const end = cuts[i + 1], top = Math.max(longFoot(z), longFoot(end)) + .13 + (z < -1.4 ? .1 : 0);
    return collider('roof verge', [side < 0 ? -.58 : .5, Math.min(longFoot(end) - .14, -.16), z], [side < 0 ? -.5 : .58, top, end]);
  });
}
VILLAGE_KIT_PARTS_MUTABLE.push(
  { id: 'roof.slope.long', label: 'Long gable roof', blurb: 'Two-cell kawara pitch to a ridge', zh: { name: '长坡瓦顶', blurb: '两格长的瓦坡，直到屋脊' },
    category: 'Roof', mount: 'cell', role: 'slope', roof: true, span: 'back', tags: ['roof', 'gable', 'tile', 'kawara', 'long'],
    envelope: box([-.5, -.16, -1.5], [.5, 1.15, .9622]), colliders: longRoofBoxes(),
    walk: 'Not walkable: a 26.6° tiled pitch rising 1.0 m over two cells, eave 0.45 m out.', connects: 'Eave cell first, ridge one cell behind (local −Z). Both cells need a wall or column below an edge or corner; pair two back to back for a gable.', emit: longRoof },
  { id: 'roof.verge.long.left', label: 'Long gable verge, left', blurb: 'Barge board on a long roof’s left end', zh: { name: '长坡山墙封檐（左）', blurb: '长坡瓦顶左端的博风板' },
    category: 'Roof', mount: 'cell', role: 'trim', trim: { sides: [3], on: 'slope' }, span: 'back', tags: ['roof', 'gable', 'verge', 'trim'],
    envelope: box([-.58, -.26, -1.5], [-.5, 1.27, .9622]), colliders: longVergeBoxes(-1),
    walk: 'Not walkable.', connects: 'On the left (local −X) end of a long gable roof turned the same way.', emit: longVergeLeft },
  { id: 'roof.verge.long.right', label: 'Long gable verge, right', blurb: 'Barge board on a long roof’s right end', zh: { name: '长坡山墙封檐（右）', blurb: '长坡瓦顶右端的博风板' },
    category: 'Roof', mount: 'cell', role: 'trim', trim: { sides: [1], on: 'slope' }, span: 'back', tags: ['roof', 'gable', 'verge', 'trim'],
    envelope: box([.5, -.26, -1.5], [.58, 1.27, .9622]), colliders: longVergeBoxes(1),
    walk: 'Not walkable.', connects: 'On the right (local +X) end of a long gable roof turned the same way.', emit: longVergeRight },
);
export const VILLAGE_KIT_PARTS: readonly VillageKitPart[] = VILLAGE_KIT_PARTS_MUTABLE;
export const VILLAGE_KIT_BY_ID: Readonly<Record<VillageKitId, VillageKitPart>> = Object.fromEntries(VILLAGE_KIT_PARTS.map(p => [p.id, p])) as Record<VillageKitId, VillageKitPart>;
