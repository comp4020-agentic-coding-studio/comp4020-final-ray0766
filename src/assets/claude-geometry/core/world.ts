import { normalizeYaw } from './anchor.ts';
import type { SurfaceAnchor } from './anchor.ts';
import { Check, fail } from './doc.ts';
import { normalize } from './vec.ts';
import type { Result } from './doc.ts';
import { isPlanetId, isUuid, UUID_PATTERN } from './ids.ts';
import type { ActorId, CommandId, EventId, ObjectId, PlanetId } from './ids.ts';
import type { Vec3 } from './vec.ts';

// One protocol for building operations and for history.
//
//   client  ──WorldCommand──▶  server authority  ──WorldEvent──▶  every reader
//
// A command is an intent. It never carries an actor, owner, timestamp, event id
// or sequence number; parseCommand rejects those fields outright. The server
// derives the actor from the session, checks ownership, assigns the next
// per-planet sequence number and records the event. The same pure reducer
// (applyEvent) then builds the live world, snapshots and historical previews.

export const PROTOCOL_VERSION = 1;

/** Catalogue keys of the main project at a76575a (src/shared/planets.ts) and their footprint radii. */
export const PROP_RADIUS = { cottage: 1.05, tree: .40, path: .42, flowers: .28, bench: .65, lamp: .26 } as const;
export type PropKind = keyof typeof PROP_RADIUS;
export const PROP_KINDS = Object.keys(PROP_RADIUS) as PropKind[];
/** Main project's per-planet capacity. */
export const MAX_OBJECTS = 64;
export const BLUEPRINT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export type ObjectSpec =
  | { kind: 'prop'; prop: PropKind }
  /** A placed copy of an immutable, content-addressed blueprint (SHA-256 of its canonical JSON). */
  | { kind: 'structure'; blueprintHash: string };

export interface WorldObject {
  id: ObjectId;
  spec: ObjectSpec;
  anchor: SurfaceAnchor;
  /** Starts at 1 and increases by one per accepted change, like planet_objects.version. */
  version: number;
  createdSeq: number;
  updatedSeq: number;
}

export interface WorldState {
  planetId: PlanetId;
  /** Sequence number of the last applied event; 0 for an empty planet. */
  seq: number;
  objects: Readonly<Record<string, WorldObject>>;
  /** Deleted object ids and the sequence that deleted them; a deleted id never comes back. */
  tombstones: Readonly<Record<string, number>>;
}

interface CommandBase { v: typeof PROTOCOL_VERSION; commandId: CommandId; planetId: PlanetId; objectId: ObjectId }
export type CreateCommand = CommandBase & { type: 'object.create'; spec: ObjectSpec; anchor: SurfaceAnchor };
export type MoveCommand = CommandBase & { type: 'object.move'; expectedVersion: number; dir: Vec3 };
export type RotateCommand = CommandBase & { type: 'object.rotate'; expectedVersion: number; yaw: number };
export type DeleteCommand = CommandBase & { type: 'object.delete'; expectedVersion: number };
export type WorldCommand = CreateCommand | MoveCommand | RotateCommand | DeleteCommand;
export type CommandType = WorldCommand['type'];

interface EventBase {
  v: typeof PROTOCOL_VERSION;
  eventId: EventId;
  planetId: PlanetId;
  objectId: ObjectId;
  /** Server-assigned, contiguous per planet, starting at 1. The only ordering key. */
  seq: number;
  /** Server-derived from the session. */
  actorId: ActorId;
  /** The client's idempotency key; one command produces at most one event. */
  commandId: CommandId;
  /** Object version after this event. */
  objectVersion: number;
  /** Server clock, ISO 8601. Shown to people; never used for ordering or authority. */
  recordedAt: string;
}
export type CreatedEvent = EventBase & { type: 'object.created'; spec: ObjectSpec; anchor: SurfaceAnchor };
export type MovedEvent = EventBase & { type: 'object.moved'; from: Vec3; dir: Vec3 };
export type RotatedEvent = EventBase & { type: 'object.rotated'; from: number; yaw: number };
export type DeletedEvent = EventBase & { type: 'object.deleted'; last: { spec: ObjectSpec; anchor: SurfaceAnchor } };
export type WorldEvent = CreatedEvent | MovedEvent | RotatedEvent | DeletedEvent;
export type EventType = WorldEvent['type'];

export const emptyWorld = (planetId: PlanetId): WorldState => ({ planetId, seq: 0, objects: {}, tombstones: {} });

export type ReplayErrorCode = 'sequence-gap' | 'wrong-planet' | 'unknown-object' | 'version-mismatch' | 'resurrection' | 'duplicate-object';
export class ReplayError extends Error {
  code: ReplayErrorCode;
  seq: number;
  constructor(code: ReplayErrorCode, seq: number, message: string) { super(message); this.code = code; this.seq = seq; }
}

/**
 * Pure reducer: returns a new state and never mutates its input, which is what
 * lets a historical preview share data with the live world safely.
 * It is strict: events must arrive in order (seq = state.seq + 1). Buffering,
 * de-duplication and gap repair belong to the reader (timeline module).
 */
export function applyEvent(state: WorldState, event: WorldEvent): WorldState {
  if (event.planetId !== state.planetId) throw new ReplayError('wrong-planet', event.seq, `Event ${event.seq} belongs to planet ${event.planetId}.`);
  if (event.seq !== state.seq + 1) throw new ReplayError('sequence-gap', event.seq, `Expected event ${state.seq + 1}, received ${event.seq}.`);
  const objects = { ...state.objects };
  const old = objects[event.objectId];
  if (event.type === 'object.created') {
    if (old) throw new ReplayError('duplicate-object', event.seq, `Object ${event.objectId} already exists.`);
    if (event.objectId in state.tombstones) throw new ReplayError('resurrection', event.seq, `Object ${event.objectId} was deleted at ${state.tombstones[event.objectId]}.`);
    objects[event.objectId] = { id: event.objectId, spec: event.spec, anchor: event.anchor, version: 1, createdSeq: event.seq, updatedSeq: event.seq };
    return { ...state, seq: event.seq, objects };
  }
  if (!old) throw new ReplayError(event.objectId in state.tombstones ? 'resurrection' : 'unknown-object', event.seq, `Object ${event.objectId} is not on the planet.`);
  if (event.objectVersion !== old.version + 1) throw new ReplayError('version-mismatch', event.seq, `Object ${event.objectId} is at v${old.version}; event expects v${event.objectVersion - 1}.`);
  if (event.type === 'object.deleted') {
    delete objects[event.objectId];
    return { ...state, seq: event.seq, objects, tombstones: { ...state.tombstones, [event.objectId]: event.seq } };
  }
  const anchor = event.type === 'object.moved' ? { ...old.anchor, dir: event.dir } : { ...old.anchor, yaw: event.yaw };
  objects[event.objectId] = { ...old, anchor, version: event.objectVersion, updatedSeq: event.seq };
  return { ...state, seq: event.seq, objects };
}

export function replay(state: WorldState, events: readonly WorldEvent[]): WorldState {
  return events.reduce(applyEvent, state);
}

/** Objects in a stable order (creation sequence, then id) for rendering and lists. */
export const objectList = (state: WorldState): WorldObject[] =>
  Object.values(state.objects).sort((a, b) => a.createdSeq - b.createdSeq || (a.id < b.id ? -1 : 1));

// ---------------------------------------------------------------- validation

/** Fields a client may never set. Named so the error says why, not just "unexpected". */
export const SERVER_ASSIGNED_FIELDS = ['actorId', 'ownerId', 'owner', 'author', 'recordedAt', 'timestamp', 'time', 'seq', 'eventId', 'objectVersion'] as const;
const COMMAND_FIELDS: Record<CommandType, string[]> = {
  'object.create': ['v', 'type', 'commandId', 'planetId', 'objectId', 'spec', 'anchor'],
  'object.move': ['v', 'type', 'commandId', 'planetId', 'objectId', 'expectedVersion', 'dir'],
  'object.rotate': ['v', 'type', 'commandId', 'planetId', 'objectId', 'expectedVersion', 'yaw'],
  'object.delete': ['v', 'type', 'commandId', 'planetId', 'objectId', 'expectedVersion'],
};

export function readSpec(raw: unknown, path: string, check: Check): ObjectSpec {
  const o = check.obj(raw, path, ['kind', 'prop', 'blueprintHash'], ['kind']);
  const kind = check.oneOf(o.kind, `${path}.kind`, ['prop', 'structure'] as const);
  if (kind === 'prop') {
    if ('blueprintHash' in o) check.problem(`${path}.blueprintHash`, 'unexpected field');
    return { kind, prop: check.oneOf(o.prop, `${path}.prop`, PROP_KINDS) };
  }
  if ('prop' in o) check.problem(`${path}.prop`, 'unexpected field');
  return { kind, blueprintHash: check.str(o.blueprintHash, `${path}.blueprintHash`, { min: 64, max: 64, pattern: BLUEPRINT_HASH_PATTERN }) };
}

export function readAnchor(raw: unknown, path: string, check: Check): SurfaceAnchor {
  const o = check.obj(raw, path, ['dir', 'yaw']);
  const dir = check.unitVec3(o.dir, `${path}.dir`);
  const yaw = check.num(o.yaw, `${path}.yaw`, { min: 0, max: Math.PI * 2 });
  if (yaw >= Math.PI * 2) check.problem(`${path}.yaw`, 'must be below one full turn');
  return { dir, yaw };
}

/** Validate an untrusted command body. Server-assigned fields are refused, never ignored. */
export function parseCommand(raw: unknown): Result<WorldCommand> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Expected a command object.');
  const body = raw as Record<string, unknown>;
  const forged = SERVER_ASSIGNED_FIELDS.filter(f => f in body);
  if (forged.length) return fail(...forged.map(f => `${f}: assigned by the server; a command must not include it`));
  const check = new Check();
  const type = check.oneOf(body.type, 'type', Object.keys(COMMAND_FIELDS) as CommandType[]);
  if (check.errors.length) return check.result(null as never);
  const o = check.obj(body, '$', COMMAND_FIELDS[type]);
  if (o.v !== PROTOCOL_VERSION) check.problem('v', `expected protocol version ${PROTOCOL_VERSION}`);
  const commandId = check.str(o.commandId, 'commandId', { pattern: UUID_PATTERN }) as CommandId;
  const objectId = check.str(o.objectId, 'objectId', { pattern: UUID_PATTERN }) as ObjectId;
  if (!isPlanetId(o.planetId)) check.problem('planetId', 'expected a planet id');
  const planetId = o.planetId as PlanetId;
  const base = { v: PROTOCOL_VERSION, commandId, planetId, objectId } as const;
  const expectedVersion = () => check.num(o.expectedVersion, 'expectedVersion', { min: 1, int: true });
  let command: WorldCommand;
  switch (type) {
    case 'object.create': command = { ...base, type, spec: readSpec(o.spec, 'spec', check), anchor: readAnchor(o.anchor, 'anchor', check) }; break;
    case 'object.move': command = { ...base, type, expectedVersion: expectedVersion(), dir: check.unitVec3(o.dir, 'dir') }; break;
    case 'object.rotate': {
      const yaw = check.num(o.yaw, 'yaw', { min: 0, max: Math.PI * 2 });
      if (yaw >= Math.PI * 2) check.problem('yaw', 'must be below one full turn');
      command = { ...base, type, expectedVersion: expectedVersion(), yaw }; break;
    }
    case 'object.delete': command = { ...base, type, expectedVersion: expectedVersion() }; break;
  }
  return check.result(command);
}

/** Validate an event read back from storage or the network before replaying it. */
export function parseEvent(raw: unknown): Result<WorldEvent> {
  const check = new Check();
  const common = ['v', 'type', 'eventId', 'planetId', 'objectId', 'seq', 'actorId', 'commandId', 'objectVersion', 'recordedAt'];
  const extra: Record<EventType, string[]> = { 'object.created': ['spec', 'anchor'], 'object.moved': ['from', 'dir'], 'object.rotated': ['from', 'yaw'], 'object.deleted': ['last'] };
  const peek = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).type : undefined;
  const type = check.oneOf(peek, 'type', Object.keys(extra) as EventType[]);
  if (check.errors.length) return check.result(null as never);
  const o = check.obj(raw, '$', [...common, ...extra[type]]);
  if (o.v !== PROTOCOL_VERSION) check.problem('v', `expected protocol version ${PROTOCOL_VERSION}`);
  const base = {
    v: PROTOCOL_VERSION,
    eventId: check.str(o.eventId, 'eventId', { pattern: UUID_PATTERN }) as EventId,
    planetId: (isPlanetId(o.planetId) ? o.planetId : (check.problem('planetId', 'expected a planet id'), '')) as PlanetId,
    objectId: check.str(o.objectId, 'objectId', { pattern: UUID_PATTERN }) as ObjectId,
    seq: check.num(o.seq, 'seq', { min: 1, int: true }),
    actorId: check.str(o.actorId, 'actorId', { min: 1, max: 128 }) as ActorId,
    commandId: check.str(o.commandId, 'commandId', { pattern: UUID_PATTERN }) as CommandId,
    objectVersion: check.num(o.objectVersion, 'objectVersion', { min: 1, int: true }),
    recordedAt: check.str(o.recordedAt, 'recordedAt', { min: 10, max: 40 }),
  } as const;
  let event: WorldEvent;
  switch (type) {
    case 'object.created': event = { ...base, type, spec: readSpec(o.spec, 'spec', check), anchor: readAnchor(o.anchor, 'anchor', check) }; break;
    case 'object.moved': event = { ...base, type, from: check.unitVec3(o.from, 'from'), dir: check.unitVec3(o.dir, 'dir') }; break;
    case 'object.rotated': event = { ...base, type, from: check.num(o.from, 'from', { min: 0, max: Math.PI * 2 }), yaw: check.num(o.yaw, 'yaw', { min: 0, max: Math.PI * 2 }) }; break;
    case 'object.deleted': {
      const last = check.obj(o.last, 'last', ['spec', 'anchor']);
      event = { ...base, type, last: { spec: readSpec(last.spec, 'last.spec', check), anchor: readAnchor(last.anchor, 'last.anchor', check) } }; break;
    }
  }
  return check.result(event);
}

// ----------------------------------------------------------------- authority

export interface Stamp { eventId: EventId; actorId: ActorId; seq: number; recordedAt: string }
export type Decision =
  | { ok: true; event: WorldEvent }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

/** Placement rule hook (overlap, landing clearance, ground fit). Returns a message or null. */
export type PlacementCheck = (state: WorldState, objectId: ObjectId, spec: ObjectSpec, anchor: SurfaceAnchor) => string | null;

/**
 * Turn a validated command into the event the server will record, or a refusal.
 * Ownership is not checked here: the caller must have authorised the actor for
 * command.planetId first. Duplicate commandIds are the caller's job too, since
 * only the store knows which commands it has already accepted.
 */
export function decide(state: WorldState, command: WorldCommand, stamp: Stamp, placement?: PlacementCheck): Decision {
  const refuse = (status: 400 | 404 | 409, code: string, message: string): Decision => ({ ok: false, status, code, message });
  if (command.planetId !== state.planetId) return refuse(400, 'wrong-planet', 'This command is for another planet.');
  const base = { v: PROTOCOL_VERSION, eventId: stamp.eventId, planetId: state.planetId, objectId: command.objectId, seq: stamp.seq, actorId: stamp.actorId, commandId: command.commandId, recordedAt: stamp.recordedAt } as const;
  const old = state.objects[command.objectId];
  if (command.type === 'object.create') {
    if (command.objectId in state.tombstones) return refuse(409, 'deleted', 'This object was removed. Create a new one instead.');
    if (old) return refuse(409, 'exists', 'This object id is already in use.');
    if (Object.keys(state.objects).length >= MAX_OBJECTS) return refuse(409, 'full', `This planet has room for ${MAX_OBJECTS} objects.`);
    // Commands accept directions within 1e-3 of unit length; the record is exact,
    // so canonical rounding can never push a stored direction out of tolerance.
    const anchor = { dir: normalize(command.anchor.dir), yaw: normalizeYaw(command.anchor.yaw) };
    const problem = placement?.(state, command.objectId, command.spec, anchor);
    if (problem) return refuse(409, 'placement', problem);
    return { ok: true, event: { ...base, type: 'object.created', objectVersion: 1, spec: command.spec, anchor } };
  }
  if (!old) return command.objectId in state.tombstones ? refuse(409, 'deleted', 'That object was removed.') : refuse(404, 'missing', 'That object is not on this planet.');
  if (old.version !== command.expectedVersion) return refuse(409, 'stale', `This object changed elsewhere (now v${old.version}). Select it again.`);
  const objectVersion = old.version + 1;
  if (command.type === 'object.delete') return { ok: true, event: { ...base, type: 'object.deleted', objectVersion, last: { spec: old.spec, anchor: old.anchor } } };
  const anchor = command.type === 'object.move' ? { ...old.anchor, dir: normalize(command.dir) } : { ...old.anchor, yaw: normalizeYaw(command.yaw) };
  const problem = placement?.(state, old.id, old.spec, anchor);
  if (problem) return refuse(409, 'placement', problem);
  return command.type === 'object.move'
    ? { ok: true, event: { ...base, type: 'object.moved', objectVersion, from: old.anchor.dir, dir: anchor.dir } }
    : { ok: true, event: { ...base, type: 'object.rotated', objectVersion, from: old.anchor.yaw, yaw: anchor.yaw } };
}

export const isCommandId = (v: unknown): v is CommandId => isUuid(v);
