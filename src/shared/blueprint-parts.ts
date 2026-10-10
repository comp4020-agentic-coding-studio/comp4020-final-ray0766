import * as legacy from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { PART_INFO as legacyInfo } from '../assets/claude-geometry/blueprint/parts/info.ts';
import { VILLAGE_BLURBS, VILLAGE_EMITS, VILLAGE_NAMES } from '../assets/claude-geometry/blueprint/parts/village/index.ts';
import type { PartInfo } from '../assets/claude-geometry/blueprint/parts/info.ts';
import { wideDoorClosed, wideDoorOpen } from './blueprint-wide-door-geometry.ts';
import { isWideDoor, WIDE_DOOR, WIDE_DOOR_IDS, wideDoorEnvelope } from './wide-door.ts';
import type { WideDoorId } from './wide-door.ts';
import { WIDE_ENTRY_ID, wideEntryEnvelope } from './wide-entry.ts';
import { wideEntrySteps } from './blueprint-wide-entry-geometry.ts';

export type HostPartId = WideDoorId | typeof WIDE_ENTRY_ID;
export type PartId = legacy.PartId | HostPartId;
export type PartDef = Omit<legacy.PartDef, 'id'> & { id: PartId };
export type { PartInfo } from '../assets/claude-geometry/blueprint/parts/info.ts';
export const HOST_PART_IDS = [...WIDE_DOOR_IDS, WIDE_ENTRY_ID] as const;
export const isHostPartId = (value: unknown): value is HostPartId => typeof value === 'string' && (HOST_PART_IDS as readonly string[]).includes(value);
export const isWideEntryPartId = (value: unknown): value is typeof WIDE_ENTRY_ID => value === WIDE_ENTRY_ID;
export const LEGACY_PART_IDS = Object.freeze([...legacy.PART_IDS].filter(id => !isHostPartId(id)));
export const isWideDoorPartId = (value: unknown): value is WideDoorId => typeof value === 'string' && isWideDoor(value);
export const isDoorPartId = (value: unknown): value is 'wall.door' | 'wall.door.open' | WideDoorId =>
  value === 'wall.door' || value === 'wall.door.open' || isWideDoorPartId(value);
export const isOpenDoorPartId = (value: unknown): value is 'wall.door.open' | 'wall.door-wide.open' =>
  value === 'wall.door.open' || value === 'wall.door-wide.open';

// One explicit host extension boundary. Only append the three stable host IDs;
// never replace a vendor definition, function, loader, or original array entry.
// Vendor editor/model/codec intentionally read these shared runtime tables.
// Consumers of derived tables must import this facade before deriving them.
const registrationKey = Symbol.for('little-worlds.blueprint-host-parts.v1');
const registered = (legacy.PARTS as unknown as Record<symbol, unknown>)[registrationKey] === 'wide-door';
if (LEGACY_PART_IDS.length !== 45 || (!registered && HOST_PART_IDS.some(id => Object.hasOwn(legacy.PARTS, id))))
  throw new Error('Unexpected blueprint catalogue: host door registration refused.');
const ids = legacy.PART_IDS as unknown as PartId[];
const definitions = legacy.PARTS as Record<PartId, PartDef>;
const info = legacyInfo as Record<PartId, PartInfo>;
for (const id of WIDE_DOOR_IDS) {
  const open = id === 'wall.door-wide.open';
  const label = open ? 'Open wide double door' : 'Wide double door';
  const blurb = open ? 'Both timber leaves held inward' : 'Two timber leaves opening inward';
  definitions[id] = Object.freeze({ id, label, blurb, category: 'Wall', mount: 'edge', role: 'wall', door: true, emit: open ? wideDoorOpen : wideDoorClosed });
  info[id] = { zh: { name: open ? '敞开的双扇宽门' : '双扇宽门', blurb: open ? '两扇木门向内敞开' : '两扇木门向内开启' },
    tags: ['wall', 'door', 'entrance', 'wide', 'double door'],
    envelope: { industrial: wideDoorEnvelope, village: wideDoorEnvelope },
    walk: `Full wall width ${WIDE_DOOR.width} m; open clearance ${WIDE_DOOR.clearOpenWidth} m. Keep both inward leaf swings clear.`,
    connects: 'Two adjacent cell edges. Requires both floors; carries the storey above on both edges. Keep both inward leaf swings clear.' };
  (VILLAGE_NAMES as Record<PartId, string>)[id] = label;
  (VILLAGE_BLURBS as Record<PartId, string>)[id] = blurb;
  (VILLAGE_EMITS as Partial<Record<PartId, PartDef['emit']>>)[id] = definitions[id].emit;
  if (!ids.includes(id)) ids.push(id);
}
// `cells` in the source entry role describes depth along +Z, so it stays one.
// The host model supplies the additional cell across the two-cell width.
definitions[WIDE_ENTRY_ID] = Object.freeze({ id: WIDE_ENTRY_ID, label: 'Wide entrance steps', blurb: 'Four continuous stone treads', category: 'Street', mount: 'cell', role: 'entry', cells: 1, emit: wideEntrySteps });
info[WIDE_ENTRY_ID] = { zh: { name: '双格入口台阶', blurb: '四级连续石踏面' }, tags: ['entry', 'steps', 'wide'],
  envelope: { industrial: wideEntryEnvelope, village: wideEntryEnvelope },
  walk: 'Four continuous treads across two adjacent cells. No middle cheek.',
  connects: 'Ground level only. Needs floors behind both cells; only doors may occupy the two top edges. Keep both foot edges clear.' };
(VILLAGE_NAMES as Record<PartId, string>)[WIDE_ENTRY_ID] = definitions[WIDE_ENTRY_ID].label;
(VILLAGE_BLURBS as Record<PartId, string>)[WIDE_ENTRY_ID] = definitions[WIDE_ENTRY_ID].blurb;
(VILLAGE_EMITS as Partial<Record<PartId, PartDef['emit']>>)[WIDE_ENTRY_ID] = wideEntrySteps;
if (!ids.includes(WIDE_ENTRY_ID)) ids.push(WIDE_ENTRY_ID);
if (!registered) Object.defineProperty(legacy.PARTS, registrationKey, { value: 'wide-door', enumerable: false });
export const PART_IDS: readonly PartId[] = ids;
export const PARTS: Readonly<Record<PartId, PartDef>> = definitions;
export const PART_INFO: Readonly<Record<PartId, PartInfo>> = info;
export const isPartId = (value: unknown): value is PartId => typeof value === 'string' && (PART_IDS as readonly string[]).includes(value);
const vendorId = (id: PartId) => id as legacy.PartId;
export const partLabel = (id: PartId, look?: Parameters<typeof legacy.partLabel>[1]) => legacy.partLabel(vendorId(id), look);
export const partBlurb = (id: PartId, look?: Parameters<typeof legacy.partBlurb>[1]) => legacy.partBlurb(vendorId(id), look);
export const partEmit = (id: PartId, look?: Parameters<typeof legacy.partEmit>[1]) => legacy.partEmit(vendorId(id), look);
export const emitPart = (id: PartId, ...args: [Parameters<typeof legacy.emitPart>[1], Parameters<typeof legacy.emitPart>[2]]) => legacy.emitPart(vendorId(id), ...args);
export const buildPart = (id: PartId, ...args: [Parameters<typeof legacy.buildPart>[1], Parameters<typeof legacy.buildPart>[2]?]) => legacy.buildPart(vendorId(id), ...args);
export const partCost = (id: PartId, lod: Parameters<typeof legacy.partCost>[1]) => legacy.partCost(vendorId(id), lod);
export const lookPartCost = (id: PartId, lod: Parameters<typeof legacy.lookPartCost>[1], look: Parameters<typeof legacy.lookPartCost>[2]) => legacy.lookPartCost(vendorId(id), lod, look);
export const industrialPartCost = (id: PartId, lod: Parameters<typeof legacy.industrialPartCost>[1]) => legacy.industrialPartCost(vendorId(id), lod);
export const allPartCosts = () => legacy.allPartCosts() as (Omit<ReturnType<typeof legacy.allPartCosts>[number], 'id'> & { id: PartId })[];
