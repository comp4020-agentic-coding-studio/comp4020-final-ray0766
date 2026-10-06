import { canonicalJson, Check, decodeDoc, encodeDoc, FORMAT } from '../core/doc.ts';
import type { DocCodec, Result } from '../core/doc.ts';
import { isPlanetId, UUID_PATTERN } from '../core/ids.ts';
import type { ObjectId, PlanetId } from '../core/ids.ts';
import { objectList, parseEvent, readAnchor, readSpec } from '../core/world.ts';
import type { WorldEvent, WorldObject, WorldState } from '../core/world.ts';

// The timeline's two document formats (docs/CONTRACTS.md §3):
//
//   planet-modules/world-event     { format, version, event: WorldEvent }
//   planet-modules/world-snapshot  { format, version, planetId, seq, objects, tombstones }
//
// The server stores and sends every event as a world-event document in this
// canonical form, and the client reader accepts nothing else. A snapshot's
// canonical JSON is also what the state hash covers, so the server
// (node:crypto) and the browser (WebCrypto) hash identical bytes and a live
// world can be compared with the server head by one string.

export const worldEventCodec: DocCodec<WorldEvent> = {
  format: FORMAT.worldEvent,
  current: 1,
  read(raw, check) {
    check.obj(raw, '$', ['event']);
    const parsed = parseEvent(raw.event);
    if (!parsed.ok) { parsed.errors.forEach(e => check.problem('event', e)); return null as never; }
    return parsed.value;
  },
  write: event => ({ event }),
};

export const worldSnapshotCodec: DocCodec<WorldState> = {
  format: FORMAT.worldSnapshot,
  current: 1,
  read(raw, check: Check) {
    const o = check.obj(raw, '$', ['planetId', 'seq', 'objects', 'tombstones']);
    if (!isPlanetId(o.planetId)) check.problem('planetId', 'expected a planet id');
    const seq = check.num(o.seq, 'seq', { min: 0, int: true });
    const objects: Record<string, WorldObject> = {};
    check.arr(o.objects, 'objects', { max: 1000 }).forEach((item, i) => {
      const p = `objects[${i}]`;
      const r = check.obj(item, p, ['id', 'spec', 'anchor', 'version', 'createdSeq', 'updatedSeq']);
      const id = check.str(r.id, `${p}.id`, { pattern: UUID_PATTERN }) as ObjectId;
      const createdSeq = check.num(r.createdSeq, `${p}.createdSeq`, { min: 1, max: Math.max(1, seq), int: true });
      const updatedSeq = check.num(r.updatedSeq, `${p}.updatedSeq`, { min: createdSeq, max: Math.max(1, seq), int: true });
      if (id in objects) check.problem(`${p}.id`, 'appears twice');
      objects[id] = { id, spec: readSpec(r.spec, `${p}.spec`, check), anchor: readAnchor(r.anchor, `${p}.anchor`, check), version: check.num(r.version, `${p}.version`, { min: 1, int: true }), createdSeq, updatedSeq };
    });
    const tombstones: Record<string, number> = {};
    const t = check.obj(o.tombstones, 'tombstones', Object.keys(o.tombstones ?? {}), []);
    for (const [id, at] of Object.entries(t)) {
      if (!UUID_PATTERN.test(id)) check.problem(`tombstones.${id}`, 'expected an object id');
      if (id in objects) check.problem(`tombstones.${id}`, 'a deleted object is still listed');
      tombstones[id] = check.num(at, `tombstones.${id}`, { min: 1, max: Math.max(1, seq), int: true });
    }
    return { planetId: o.planetId as PlanetId, seq, objects, tombstones };
  },
  write: state => ({ planetId: state.planetId, seq: state.seq, objects: objectList(state), tombstones: state.tombstones }),
};

export const encodeEvent = (event: WorldEvent, pretty = false) => encodeDoc(worldEventCodec, event, pretty);
export const decodeEvent = (input: unknown): Result<WorldEvent> => decodeDoc(worldEventCodec, input);

/**
 * The event exactly as it is saved and sent: every number rounded as canonical
 * JSON rounds it (6 decimals), keys sorted. The store applies this form to its
 * head projection too, so stored events, the head and the snapshots hold the
 * same numbers and a replay of the stored log rebuilds the head bit for bit.
 * (A yaw below 2π = 6.2831853… never rounds up to a full turn at 6 decimals,
 * so a rounded event still passes parseEvent.)
 */
export const canonicalEvent = (event: WorldEvent): WorldEvent => JSON.parse(canonicalJson(event)) as WorldEvent;

/** The seq inside a world-event document as it arrived, before validation (0 when absent). */
export function documentSeq(raw: unknown): number {
  const inner = raw && typeof raw === 'object' ? (raw as { event?: unknown }).event : undefined;
  const seq = inner && typeof inner === 'object' ? Number((inner as { seq?: unknown }).seq) : NaN;
  return Number.isSafeInteger(seq) && seq > 0 ? seq : 0;
}
export const encodeSnapshot = (state: WorldState, pretty = false) => encodeDoc(worldSnapshotCodec, state, pretty);
export const decodeSnapshot = (input: unknown): Result<WorldState> => decodeDoc(worldSnapshotCodec, input);

/** Exactly the bytes the state hash covers: the compact canonical snapshot document. */
export const stateDigestInput = (state: WorldState) => encodeSnapshot(state);

/** SHA-256 of the canonical snapshot, lower-case hex. Same value as the server's node:crypto hash. */
export async function stateHash(state: WorldState): Promise<string> {
  const bytes = new TextEncoder().encode(stateDigestInput(state));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical JSON of a command body, used by the store to tell an identical retry from a reused id. */
export const commandFingerprint = (command: unknown) => canonicalJson(command);
