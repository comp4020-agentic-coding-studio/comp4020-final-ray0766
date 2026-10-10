import type { Look } from '../../style/look.ts';
import type { PartId } from './catalogue.ts';

// What a host needs to list, find and integrate each part beyond its model and
// rules: Chinese and English names, search tags, and for the parts added in
// round 8 the box each look's model keeps to, a suggested collider, what can
// be walked on and what it needs kept clear (docs/WORKSHOP.md prints these).
// Names follow the village look, the one the main project shows; the Chinese
// names of the first 21 parts are the main project's own (src/client/messages.ts,
// keyed by the English village names); where the Japanese-town restyle renamed a
// part, docs/restyle/parts.md lists the new pairs for the main project to add.

/** A box in part-local metres. */
export interface Box { min: [number, number, number]; max: [number, number, number] }
/** A suggested collision box in part-local metres: centre, full size, a pitch about its local x (radians) if any, and whether a player can stand on it. */
export interface ColliderBox { center: [number, number, number]; size: [number, number, number]; pitch?: number; support: boolean; note?: string }

export interface PartInfo {
  zh: { name: string; blurb: string };
  /** Search tags: uses, rooms and themes. One part, many tags; never a copy per use. */
  tags: string[];
  /** Round 8 parts only: the box each look's model keeps to (tests/unit/blueprint/home-geometry.test.ts). */
  envelope?: Partial<Record<Look, Box>> & { industrial: Box; village: Box };
  /** Round 8 parts only: suggested colliders for the host's physics; the host decides. */
  colliders?: ColliderBox[];
  /** Round 8 parts only: walkable surfaces and clearances, in words. */
  walk?: string;
  /** Round 8 parts only: what it stands or hangs on, and where it meets its neighbours. */
  connects?: string;
}

const box = (min: [number, number, number], max: [number, number, number]): Box => ({ min, max });
const both = (b: Box) => ({ industrial: b, village: b });
const slab: ColliderBox = { center: [0, -0.08, 0], size: [1, 0.16, 1], support: true };

/** Entrance steps: one support box per tread (between the cheeks, its own going only, down to the embedded base), and the two stone cheeks as obstacles stepping down with the coping. */
const stepBoxes: ColliderBox[] = [
  ...[0, 1, 2, 3].map((i): ColliderBox => {
    const top = -0.15 * (i + 1), z0 = -0.5 + 0.25 * i, bottom = -0.9;
    return { center: [0, (top + bottom) / 2, z0 + 0.125], size: [0.8, top - bottom, 0.25], support: true };
  }),
  ...[-1, 1].flatMap(side => [0, -0.05, -0.2, -0.35].map((top, i): ColliderBox => ({
    center: [side * 0.45, (top - 0.9) / 2, -0.375 + 0.25 * i], size: [0.1, top + 0.9, 0.25], support: false,
    note: i === 0 && side === -1 ? 'cheek: the coping’s highest point over each going (it runs 0.1 m above the nosing line, never above the floor)' : undefined,
  }))),
];
/** Entrance ramp: one pitched support plane where the host's boxes can carry a player on a 16.7° slope; else the stepped proxy below, and the cheeks. */
const RAMP_PITCH = Math.atan(0.3);
const rampBoxes: ColliderBox[] = [
  { center: [0, -0.3 - 0.05 / Math.cos(RAMP_PITCH), 0.5], size: [0.8, 0.1, Math.hypot(2, 0.6)], pitch: RAMP_PITCH, support: true, note: 'preferred: one plane on the boards (0.3 in 1); needs the host to support pitched boxes (to verify)' },
  ...[0, 1, 2, 3, 4, 5].map((i): ColliderBox => {
    const z0 = -0.5 + i / 3, top = -0.3 * (z0 + 1 / 6 + 0.5), bottom = -0.9;
    return { center: [0, (top + bottom) / 2, z0 + 1 / 6], size: [0.8, top - bottom, 1 / 3], support: true, note: i === 0 ? 'fallback: six level boxes topped at each third of a metre’s middle (rises of 0.10 m, within 0.05 m of the boards)' : undefined };
  }),
  ...[-1, 1].map((side): ColliderBox => ({ center: [side * 0.45, -0.3 - 0.05 / Math.cos(RAMP_PITCH) + 0.05, 0.5], size: [0.1, 0.2, Math.hypot(2, 0.6)], pitch: RAMP_PITCH, support: false, note: side === -1 ? 'cheeks: 0.05 m above the boards' : undefined })),
];

export const PART_INFO: Record<PartId, PartInfo> = {
  'floor.deck': { zh: { name: '木板地面', blurb: '石板上铺木板' }, tags: ['floor', 'indoor', 'room'] },
  'floor.grate': { zh: { name: '架空木栈道', blurb: '留缝木条，木框' }, tags: ['floor', 'boardwalk', 'dock', 'outdoor'] },
  'wall.solid': { zh: { name: '灰泥墙', blurb: '灰泥墙面，下部木板' }, tags: ['wall', 'plain', 'house'] },
  'wall.door': { zh: { name: '格子拉门', blurb: '六扇推拉格子门，门灯' }, tags: ['wall', 'door', 'entrance', 'house'] },
  'wall.window': { zh: { name: '格子窗墙', blurb: '出格子，内衬障子纸' }, tags: ['wall', 'window', 'house'] },
  'wall.louvre': { zh: { name: '连子窗', blurb: '方木连子，小瓦檐' }, tags: ['wall', 'vent', 'house'] },
  'wall.corrugated': { zh: { name: '木板仓墙', blurb: '石基上的板条墙' }, tags: ['wall', 'shed', 'workshop'] },
  'structure.column': { zh: { name: '角柱', blurb: '顶点上的木柱' }, tags: ['structure', 'post', 'porch'] },
  'stair.straight': { zh: { name: '小屋楼梯', blurb: '1×2 格，一层高' }, tags: ['structure', 'stair', 'level change'] },
  'rail.guard': { zh: { name: '竹栏杆', blurb: '阳台与屋顶边缘' }, tags: ['fence', 'boundary', 'balcony'] },
  'roof.deck': { zh: { name: '屋顶露台', blurb: '木板晒台，下方纸灯' }, tags: ['roof', 'flat roof', 'terrace', 'walkable'] },
  'roof.parapet': { zh: { name: '灰泥矮墙', blurb: '瓦压顶的屋顶边' }, tags: ['roof', 'boundary', 'terrace'] },
  'roof.slope': { zh: { name: '瓦屋顶', blurb: '宽瓦带，深檐' }, tags: ['roof', 'pitched roof'] },
  'roof.plant': { zh: { name: '屋顶水箱', blurb: '木架上的圆木水箱' }, tags: ['roof', 'equipment', 'utility'] },
  'wall.door.open': { zh: { name: '敞开的格子拉门', blurb: '门扇推到两侧' }, tags: ['wall', 'door', 'entrance', 'house'] },
  'street.paving': { zh: { name: '石板步道', blurb: '大石块错缝铺砌' }, tags: ['street', 'path', 'courtyard', 'walkable'] },
  'street.road': { zh: { name: '巷道', blurb: '路面、边沟与中线' }, tags: ['street', 'lane', 'walkable'] },
  'street.kerb': { zh: { name: '石质路缘', blurb: '一块石路缘' }, tags: ['street', 'kerb', 'edge'] },
  'street.pipes': { zh: { name: '木水渠', blurb: '两个木架上的木槽' }, tags: ['street', 'water', 'channel', 'boundary', 'garden'] },
  'service.light': { zh: { name: '灯笼柱', blurb: '3.4 米木柱，纸灯笼' }, tags: ['street', 'light', 'public'] },
  'pad.quarter': { zh: { name: '四分之一石平台', blurb: '2×2 石停机坪的一角' }, tags: ['landing', 'ship', 'public'] },

  'street.road.plain': {
    zh: { name: '无标线巷道', blurb: '弯道外侧、路口与小巷' }, tags: ['street', 'lane', 'junction', 'alley', 'walkable'],
    envelope: both(box([-0.5, -0.16, -0.5], [0.5, 0.004, 0.5])), colliders: [slab],
    walk: 'Walkable deck, top at y 0 over the whole cell.',
    connects: 'Stands on the ground at level 0 (a deck). Meets roadway, lane corner and paving cells flush at y 0 on all four edges; kerbs may stand on its edges.',
  },
  'street.road.corner': {
    zh: { name: '巷道转角', blurb: '中线与边沟在此转弯' }, tags: ['street', 'lane', 'junction', 'corner', 'walkable'],
    envelope: both(box([-0.5, -0.16, -0.5], [0.5, 0.004, 0.5])), colliders: [slab],
    walk: 'Walkable deck, top at y 0 over the whole cell; the two half dashes are paint. In the village look a 15 mm slit runs round the gutter lid in its (−X, −Z) corner.',
    connects: 'Stands on the ground at level 0. Its half dashes sit on its local +Z and +X edge midpoints, where a roadway turned towards that edge has its own half dash, so the centre line turns across the cell; four make a crossing, two with straight roadways a T. In the village look its (−X, −Z) corner carries the gutter round the vertex where the side gutters of the two roadways beside it meet.',
  },
  'street.kerb.corner': {
    zh: { name: '石路缘转角', blurb: '路缘绕过格子一角' }, tags: ['street', 'kerb', 'corner', 'junction', 'edge'],
    envelope: { industrial: box([-0.5, -0.05, -0.5], [0.74, 0.145, 0.74]), village: box([-0.5, -0.05, -0.5], [0.58, 0.14, 0.58]) },
    colliders: [{ center: [0, 0.065, 0.5], size: [1, 0.13, 0.18], support: true }, { center: [0.5, 0.065, 0], size: [0.18, 0.13, 1], support: true }],
    walk: 'As the straight kerb: a 0.13–0.14 m step, under the 0.26 m step height.',
    connects: 'Stands on a deck in its own cell and takes its local +Z and +X edges and the vertex between them. Each arm ends where a straight kerb on the next edge begins, with the same section.',
  },
  'step.entry': {
    zh: { name: '入口台阶', blurb: '四级 0.15 米台阶下到地面' }, tags: ['structure', 'steps', 'entrance', 'level change', 'walkable'],
    envelope: both(box([-0.5, -0.9, -0.5], [0.5, 0, 0.5])), colliders: stepBoxes,
    walk: 'Treads at y −0.15, −0.30, −0.45, −0.60 on 0.25 m goings between stone cheeks (x ±0.40), from the floor at y 0; lower treads sink into higher ground. The cheeks’ copings run 0.10 m above the nosings, never above the floor. Its foot edge (local +Z) is kept clear; only a door may stand on its top edge.',
    connects: 'Level 0 only. Its top edge (local −Z) meets a ground-floor deck at y 0; only a door (or nothing) on that edge. Its foot edge (local +Z) stays clear. No plinth is drawn under it: it reaches the ground itself.',
  },
  'ramp.entry': {
    zh: { name: '入口坡道', blurb: '1×2 格，下降 0.6 米' }, tags: ['structure', 'ramp', 'entrance', 'level change', 'cart', 'walkable'],
    envelope: both(box([-0.5, -0.9, -0.5], [0.5, 0.06, 1.5])), colliders: rampBoxes,
    walk: 'One 0.30 in 1 slope (16.7°) of boards between cheeks (x ±0.40) from y 0 at its top edge to −0.60 at its foot, two cells long, with cleats 0.02 m high; foot kept clear, only a door on its top edge.',
    connects: 'Level 0 only, over two cells towards local +Z. Top edge as the steps; the edge between its cells is its own; foot edge clear.',
  },
  'roof.slope.hip': {
    zh: { name: '瓦屋顶外角', blurb: '坡屋顶的外转角（四坡）' }, tags: ['roof', 'pitched roof', 'corner', 'hip'],
    envelope: { industrial: box([-0.5, -0.165, -0.5], [0.68, 0.43, 0.68]), village: box([-0.5, -0.16, -0.5], [0.97, 0.66, 0.97]) },
    colliders: [{ center: [0.231, 0.245, 0.231], size: [1.462, 0.81, 1.462], support: false, note: 'the village roof panel’s box (to its ridge, y 0.65), grown over both eaves to the kawara eave’s tip (0.962); covers the industrial model too; not walkable' }],
    walk: 'Not walkable (as roof.slope). Eaves on local +Z and +X keep their edges, the decks beyond and the diagonal deck clear.',
    connects: 'Covers its cell at a roof level, carried like a slope by a wall or post below one of its edges or corners. Meets a roof.slope run draining the same way along each of its two high edges, or another hip (pyramid), surface for surface.',
  },
  'roof.slope.valley': {
    zh: { name: '瓦屋顶内角', blurb: '坡屋顶的内转角（天沟）' }, tags: ['roof', 'pitched roof', 'corner', 'valley'],
    envelope: { industrial: box([-0.5, -0.165, -0.5], [0.5, 0.43, 0.5]), village: box([-0.5, -0.16, -0.5], [0.5, 0.66, 0.5]) },
    colliders: [{ center: [0, 0.245, 0], size: [1, 0.81, 1], support: false, note: 'envelope, to the village ridge (y 0.65); not walkable' }],
    walk: 'Not walkable. No eaves of its own: the two runs it meets drain past its low corner.',
    connects: 'Covers its cell at a roof level. Its two high edges (local −Z, −X) carry half ridge caps and meet the back-to-back partners of the two runs it joins; its two low edges meet runs draining to +Z and +X.',
  },
  'roof.verge.left': {
    zh: { name: '山墙封檐板（左）', blurb: '山墙端的收边，左侧' }, tags: ['roof', 'trim', 'gable', 'verge'],
    envelope: { industrial: box([-0.58, -0.22, -0.55], [-0.5, 0.47, 0.7]), village: box([-0.58, -0.23, -0.5], [-0.5, 0.71, 0.97]) },
    colliders: [],
    walk: 'Trim only, inside the roof panel’s collider. Keeps the deck beyond its gable open.',
    connects: 'Placed on a roof.slope run’s own cell, turned as it is; takes the run’s local −X edge. Meets the panel’s end from ridge to eave; two verges meet square at a ridge.',
  },
  'roof.verge.right': {
    zh: { name: '山墙封檐板（右）', blurb: '山墙端的收边，右侧' }, tags: ['roof', 'trim', 'gable', 'verge'],
    envelope: { industrial: box([0.5, -0.22, -0.55], [0.58, 0.47, 0.7]), village: box([0.5, -0.23, -0.5], [0.58, 0.71, 0.97]) },
    colliders: [],
    walk: 'Trim only, inside the roof panel’s collider. Keeps the deck beyond its gable open.',
    connects: 'Placed on a roof.slope run’s own cell, turned as it is; takes the run’s local +X edge.',
  },
  'structure.beam': {
    zh: { name: '门廊梁', blurb: '两根柱之间的梁' }, tags: ['structure', 'beam', 'porch', 'awning', 'stall'],
    envelope: { industrial: box([-0.39, 1.55, -0.075], [0.39, 2.04, 0.075]), village: box([-0.4, 1.55, -0.075], [0.4, 2.04, 0.075]) },
    colliders: [{ center: [0, 1.94, 0], size: [0.78, 0.2, 0.14], support: false }],
    walk: 'Clear headroom under it: 1.84 m to the beam (the door opening is 1.86–1.90 m). Brackets, if any, stay within 0.15 m of the posts.',
    connects: 'On a cell edge, between corner posts on both of its vertices at the same level; ends on the posts’ faces (x ±0.39; the village beam runs on to the timber shaft, ±0.40, below the post’s band). Shares the edge with a fence, hedge or kerb below; not with a wall.',
  },
  'furniture.table': {
    zh: { name: '矮桌', blurb: '凳子可塞到桌下' }, tags: ['furniture', 'table', 'dining', 'kitchen', 'cafe', 'courtyard'],
    envelope: both(box([-0.31, 0, -0.31], [0.31, 0.76, 0.31])),
    colliders: [{ center: [0, 0.38, 0], size: [0.6, 0.76, 0.6], support: false }],
    walk: 'An obstacle. Stays out of a door’s cells; leaves its cell’s sides to chairs.',
    connects: 'Stands on a floor or roof deck in the middle of its cell. Chairs on the cell’s sides tuck under it (in the village look a low table, its top at 0.45 m, with stools 0.30 m high).',
  },
  'furniture.chair': {
    zh: { name: '木凳', blurb: '靠格边摆放，面朝格内' }, tags: ['furniture', 'seat', 'dining', 'cafe'],
    envelope: both(box([-0.21, 0, -0.5], [0.21, 0.9, -0.13])),
    colliders: [{ center: [0, 0.45, -0.315], size: [0.42, 0.9, 0.37], support: false }],
    walk: 'An obstacle; a look only (no sitting). Below 0.70 m it may reach the cell centre (tucked under a table); above, only its back, within 0.20 m of the edge line.',
    connects: 'Stands on a floor or roof deck against one side of its cell, facing in; opposite a second chair at most.',
  },
  'furniture.sideboard': {
    zh: { name: '抽屉柜', blurb: '靠墙的矮抽屉柜' }, tags: ['furniture', 'storage', 'cupboard', 'drawers', 'kitchen', 'living room', 'counter', 'stall'],
    envelope: both(box([-0.34, 0, -0.48], [0.34, 0.92, -0.13])),
    colliders: [{ center: [0, 0.45, -0.305], size: [0.68, 0.9, 0.35], support: false }],
    walk: 'An obstacle; a look only (nothing is stored). Its top is a surface for later decor sockets.',
    connects: 'Against one side of its cell, back 0.13 m off the edge line; walls with sills or hoods behind or beside it face away.',
  },
  'furniture.shelf': {
    zh: { name: '高架', blurb: '高的开放式层架' }, tags: ['furniture', 'storage', 'shelf', 'kitchen', 'living room', 'shop'],
    envelope: both(box([-0.34, 0, -0.45], [0.34, 1.85, -0.13])),
    colliders: [{ center: [0, 0.92, -0.29], size: [0.68, 1.84, 0.32], support: false }],
    walk: 'An obstacle; a look only. Tall: takes its wall face too, so no lamp or sign above it.',
    connects: 'Against one side of its cell; tall, so it also takes that wall face (no lamp or sign above it).',
  },
  'storage.crates': {
    zh: { name: '货箱', blurb: '两只叠放的木箱' }, tags: ['storage', 'cargo', 'crate', 'dock', 'stall', 'workshop'],
    envelope: both(box([-0.34, 0, -0.5], [0.34, 0.9, -0.13])),
    colliders: [{ center: [0, 0.45, -0.315], size: [0.68, 0.9, 0.37], support: false }],
    walk: 'An obstacle; a look only (no inventory).',
    connects: 'Against one side of its cell, on a deck.',
  },
  'storage.barrel': {
    zh: { name: '木桶', blurb: '小木桶' }, tags: ['storage', 'cargo', 'barrel', 'dock', 'stall', 'kitchen'],
    envelope: both(box([-0.2, 0, -0.5], [0.2, 0.7, -0.13])),
    colliders: [{ center: [0, 0.35, -0.315], size: [0.37, 0.7, 0.37], support: false }],
    walk: 'An obstacle; a look only.',
    connects: 'Against one side of its cell, on a deck.',
  },
  'garden.bed': {
    zh: { name: '花床', blurb: '占满一格的高花床' }, tags: ['garden', 'plants', 'flowers', 'courtyard', 'public'],
    envelope: both(box([-0.38, 0, -0.38], [0.38, 0.65, 0.38])),
    colliders: [{ center: [0, 0.2, 0], size: [0.76, 0.4, 0.76], support: false }],
    walk: 'An obstacle (0.40 m edge). Decor only: nothing grows or is harvested.',
    connects: 'In the middle of its cell on a deck (paving, terrace), within 0.38 m of the centre; not in a door’s cells.',
  },
  'garden.pot': {
    zh: { name: '花盆', blurb: '靠格边摆放' }, tags: ['garden', 'plants', 'flowers', 'decor', 'entrance'],
    envelope: both(box([-0.21, 0, -0.53], [0.21, 0.65, -0.11])),
    colliders: [{ center: [0, 0.32, -0.32], size: [0.4, 0.64, 0.4], support: false }],
    walk: 'An obstacle; the quick-build flower pot’s own model. Decor only.',
    connects: 'Against one side of its cell on a deck; the pot’s back is 0.13 m off the edge line, as the furniture’s.',
  },
  'garden.tree': {
    zh: { name: '圆冠树', blurb: '上方要留空，格边不能有墙' }, tags: ['garden', 'plants', 'tree', 'courtyard', 'public'],
    envelope: both(box([-0.45, 0, -0.45], [0.45, 2.42, 0.45])),
    colliders: [{ center: [0, 1.05, 0], size: [0.8, 2.1, 0.8], support: false, note: 'as the quick-build tree’s cylinder (r 0.40, h 2.1)' }],
    walk: 'An obstacle; the quick-build tree’s own model. Takes the deck above it; no wall on its cell’s edges.',
    connects: 'In the middle of its cell on a deck; open sky above (it takes the deck above), no wall on its edges.',
  },
  'furniture.bench': {
    zh: { name: '长椅', blurb: '两端越过格边' }, tags: ['furniture', 'seat', 'courtyard', 'public', 'garden'],
    envelope: both(box([-0.59, 0, -0.26], [0.59, 0.9, 0.26])),
    colliders: [{ center: [0, 0.45, 0], size: [1.16, 0.9, 0.5], support: false }],
    walk: 'An obstacle; the quick-build bench’s own model, 1.16 m long: its ends cross its cell’s local ±X edges by 0.08 m, so those edges stay clear. A look only (no sitting).',
    connects: 'In the middle of its cell on a deck, along its local x; the two edges its ends cross stay clear.',
  },
  'light.wall': {
    zh: { name: '壁灯', blurb: '装在灰泥墙上，会亮' }, tags: ['light', 'lamp', 'entrance', 'indoor', 'outdoor'],
    envelope: both(box([-0.12, 1.6, -0.36], [0.12, 2.04, -0.09])),
    colliders: [],
    walk: 'Above head height: nothing below 1.60 m, the top of the player’s capsule (the lantern’s underside is at 1.62 m in the village look, 1.68 m in the industrial one), within 0.36 m of the edge line. A real practical light (kind door), in the host’s light pool.',
    connects: 'On the face of a plaster wall (wall.solid) standing on its edge, looking into its cell; its light point is the lantern’s centre.',
  },
  'sign.blank': {
    zh: { name: '吊牌', blurb: '支架上的空白牌' }, tags: ['sign', 'shop', 'house name', 'public'],
    envelope: both(box([-0.06, 1.55, -0.5], [0.06, 2.04, -0.09])),
    colliders: [],
    walk: 'Above head height (from 1.62 m). Carries no text: editable text is a host feature.',
    connects: 'On the face of a plaster wall (wall.solid) on its edge, looking into its cell.',
  },
  'sign.mail': {
    zh: { name: '邮局吊牌', blurb: '信封图案' }, tags: ['sign', 'shop', 'post', 'public'],
    envelope: both(box([-0.06, 1.55, -0.5], [0.06, 2.04, -0.09])),
    colliders: [],
    walk: 'Above head height. A painted envelope; no text.',
    connects: 'On the face of a plaster wall (wall.solid) on its edge, looking into its cell.',
  },
  'sign.cup': {
    zh: { name: '茶馆吊牌', blurb: '杯子图案' }, tags: ['sign', 'shop', 'cafe', 'food', 'stall'],
    envelope: both(box([-0.06, 1.55, -0.5], [0.06, 2.04, -0.09])),
    colliders: [],
    walk: 'Above head height. A painted cup; no text.',
    connects: 'On the face of a plaster wall (wall.solid) on its edge, looking into its cell.',
  },
};
