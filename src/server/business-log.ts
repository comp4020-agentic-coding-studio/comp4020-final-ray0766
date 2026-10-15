import { createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const routes: Record<string, string> = {
  state: 'session.resumed', universe: 'world.read', blueprints: 'blueprint.read',
  history: 'history.read', 'history/snapshot': 'history.snapshot',
  'blueprints/save': 'blueprint.saved', 'home/setup/preview': 'home.setup.preview',
  'home/setup/confirm': 'home.setup.confirmed', 'home/enter': 'home.entered',
  'home/move': 'home.walked', 'home/exit': 'home.exited', 'home/save': 'home.saved',
  'home/door': 'home.door', 'home/paths/preview': 'home.paths.preview',
  'home/paths/apply': 'home.paths.applied', 'home/remodel': 'home.remodelled',
  'home/undo': 'home.undo', 'objects/replace': 'object.replaced', 'objects/undo': 'object.undo',
  'terrain/apply': 'terrain.applied', 'ship/save': 'ship.saved', presence: 'presence',
  character: 'coat.changed', move: 'ground.walked', interact: 'delivery.interacted',
  'flight/takeoff': 'flight.departed', 'flight/checkpoint': 'flight.checkpoint',
  'flight/land': 'flight.landed', teleport: 'gate.travelled',
  'teleport/station/preview': 'station.preview', 'teleport/station/confirm': 'station.built',
  'planets/visit': 'travel.withdrawn', 'planets/claim': 'planet.claimed',
  'objects/create': 'object.created', 'objects/update': 'object.updated', 'objects/delete': 'object.deleted',
};
const sampled = new Set(['ground.walked', 'home.walked', 'flight.checkpoint', 'presence']);
const quietReads = new Set(['world.read', 'blueprint.read']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const planetId = (value: unknown): value is string => typeof value === 'string' && (value === 'hub' || (value.startsWith('p-') && uuid.test(value.slice(2))));
const objectId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const reasons: Record<string, string> = {
  'Only this planet’s owner can build here.': 'planet_owner_required',
  'Only the home owner can enter the room.': 'home_owner_required',
  'Only the home owner can edit this room.': 'home_owner_required',
  'Only the planet owner can read its history.': 'history_owner_required',
  'This teleport station belongs to another home. Only its owner can use it.': 'gate_owner_required',
  'You have no home planet to return to yet.': 'home_required',
  'Teleport stations only link your own home and the main planet.': 'gate_destination_refused',
  'Walk up to a teleport station first.': 'gate_proximity_required',
  'Someone has already made this planet their home.': 'planet_already_claimed',
  'This browser identity already has a home planet.': 'one_home_per_identity',
  'A newer ground position exists. Reconnect to your saved position.': 'stale_ground_checkpoint',
  'A newer flight checkpoint already exists. Reconnect.': 'stale_flight_checkpoint',
};
const statusReason: Record<number, string> = { 400: 'invalid_request', 401: 'identity_required', 403: 'permission_refused', 404: 'not_found', 405: 'method_refused', 409: 'state_conflict', 410: 'route_withdrawn', 413: 'request_too_large', 415: 'json_required', 429: 'rate_limited', 503: 'preparation_unavailable' };

interface RecordInput {
  route: string; identity?: string; status: number; created?: boolean;
  context?: Record<string, unknown>; response?: unknown;
}
interface LogOptions { maxBytes?: number; now?: () => number; output?: (line: string) => void }

/** A bounded journal beside the existing DB, plus the same JSON on stdout.
 * The independent key gives stable observation aliases without disclosing authentication material. */
export function businessLog(databasePath: string, options: LogOptions = {}) {
  if (databasePath === ':memory:') throw new Error('Business logs require a file path.');
  const path = databasePath + '.business.jsonl', keyPath = databasePath + '.business-key';
  const maxBytes = options.maxBytes ?? 1_048_576, now = options.now ?? Date.now;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 512) throw new Error('Invalid business log size.');
  mkdirSync(dirname(path), { recursive: true });
  try { writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Invalid business log key.');
  const output = options.output ?? console.log;
  const recent = new Map<string, number>();
  let storageFailed = false;
  return {
    path,
    record(input: RecordInput) {
      const action = input.created ? 'session.created' : (Object.hasOwn(routes,input.route) ? routes[input.route] : 'api.unknown');
      if (input.status < 400 && quietReads.has(action)) return;
      const actor = input.identity ? 'visitor-' + createHmac('sha256', key).update(input.identity).digest('hex').slice(0, 20) : 'anonymous';
      const time = now(), throttle = actor + ':' + action + ':' + input.status;
      // Include accepted movement/presence, but never one record per frame. Repeated
      // refusals are sampled too; the HTTP limiter and fixed map bound abusive input.
      if (sampled.has(action) || input.status >= 400) {
        const last = recent.get(throttle);
        if (last !== undefined && time - last < 5000) return;
        if (recent.size >= 2048) recent.delete(recent.keys().next().value!);
        recent.set(throttle, time);
      }
      const context = input.context ?? {};
      const response = input.response && typeof input.response === 'object' ? input.response as Record<string, unknown> : {};
      const player = response.player && typeof response.player === 'object' ? response.player as Record<string, unknown> : response;
      const planet = planetId(context.planetId) ? context.planetId : planetId(player.planetId) ? player.planetId : undefined;
      const object = objectId(context.objectId) ? context.objectId : objectId(context.buildingId) ? context.buildingId : undefined;
      const detail = input.route === 'character' && typeof context.character === 'string' && ['clay', 'fern', 'sky'].includes(context.character) ? context.character
        : input.route === 'interact' && typeof context.action === 'string' && ['pickup', 'deliver'].includes(context.action) ? context.action : undefined;
      const reason = input.status >= 400 ? (typeof response.error === 'string' ? (Object.hasOwn(reasons,response.error) ? reasons[response.error] : undefined) : undefined) ?? statusReason[input.status] ?? 'server_error' : undefined;
      // Deliberate allowlist: no URLs/queries, body dumps, names, designs, error text,
      // cookie, token, internal player ID or session hash can enter this record.
      const line = JSON.stringify({ v: 1, at: new Date(time).toISOString(), actor, action, planet, object, detail,
        result: input.status < 400 ? 'accepted' : input.status < 500 ? 'refused' : 'failed', status: input.status, reason }) + '\n';
      try { output(line.trimEnd()); } catch { /* Diagnostics must never turn an acknowledged save into a failure. */ }
      try {
        if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) > maxBytes) renameSync(path, path + '.1');
        appendFileSync(path, line, { mode: 0o600 }); storageFailed = false;
      } catch {
        if (!storageFailed) console.error('Business log storage unavailable; events continue on stdout.');
        storageFailed = true;
      }
    },
  };
}
