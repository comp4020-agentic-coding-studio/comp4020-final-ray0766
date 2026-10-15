import { afterEach, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { businessLog } from '../src/server/business-log.ts';

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
const fixture = () => { const dir = mkdtempSync(join(tmpdir(), 'business-log-')); folders.push(dir); return join(dir, 'test.sqlite'); };
it('keeps distinct stable observation aliases across restart, with no authentication or user content', () => {
  const path = fixture(), lines: string[] = [], token = randomBytes(32).toString('hex');
  const identity = createHash('sha256').update(token).digest('hex'), planet = 'p-' + randomUUID();
  let log = businessLog(path, { output: line => lines.push(line) });
  log.record({ route: 'planets/claim', identity, status: 200, context: { planetId: planet, cookie: token, name: 'PRIVATE NAME' } });
  const first = JSON.parse(lines[0]);
  log = businessLog(path, { output: line => lines.push(line) });
  log.record({ route: 'character', identity, status: 200, context: { character: 'fern', document: 'PRIVATE DESIGN' } });
  log.record({ route: 'objects/create', identity: 'another-identity', status: 403, context: { planetId: planet }, response: { error: 'Only this planet’s owner can build here.' } });
  expect(JSON.parse(lines[1]).actor).toBe(first.actor);
  expect(JSON.parse(lines[2])).toMatchObject({ action: 'object.created', planet, result: 'refused', reason: 'planet_owner_required' });
  expect(JSON.parse(lines[2]).actor).not.toBe(first.actor);
  const stored = readFileSync(log.path, 'utf8');
  for (const secret of [token, identity, 'another-identity', 'PRIVATE NAME', 'PRIVATE DESIGN']) expect(stored).not.toContain(secret);
  expect(stored.trim().split('\n')).toEqual(lines);
  expect(statSync(path + '.business-key').mode & 0o777).toBe(0o600);
});
it('bounds the journal to two files and samples repeated movement and refusals without hiding normal actions', () => {
  const path = fixture(); let now = 10000;
  const log = businessLog(path, { maxBytes: 1024, now: () => now, output: () => {} });
  const movement = { route: 'move', identity: 'a', status: 200 };
  for (let n = 0; n < 100; n++) log.record(movement);
  expect(readFileSync(log.path, 'utf8').trim().split('\n')).toHaveLength(1);
  now += 5000; log.record(movement);
  expect(readFileSync(log.path, 'utf8').trim().split('\n')).toHaveLength(2);
  for (let n = 0; n < 30; n++) log.record({ route: 'character', identity: 'a', status: 200, context: { character: 'sky' } });
  expect(statSync(log.path).size).toBeLessThanOrEqual(1024);
  expect(statSync(log.path + '.1').size).toBeLessThanOrEqual(1024);
  const retained = readFileSync(log.path + '.1', 'utf8') + readFileSync(log.path, 'utf8');
  for (const line of retained.trim().split('\n')) expect(JSON.parse(line).action).toBe('coat.changed');
});
it('does not copy arbitrary error text, unknown fields, or coercible objects into logs', () => {
  const path = fixture(), lines: string[] = [], log = businessLog(path, { output: line => lines.push(line) });
  expect(() => log.record({ route: 'character', status: 400, context: { character: { toString: 'SECRET' } }, response: { error: 'SECRET' } })).not.toThrow();
  expect(JSON.parse(lines[0])).toMatchObject({ actor: 'anonymous', reason: 'invalid_request' });
  expect(lines[0]).not.toContain('SECRET');
});

it('classifies the actual room-edit refusal without logging its error text', () => {
  const lines: string[] = [], log = businessLog(fixture(), { output: line => lines.push(line) });
  log.record({ route: 'home/save', identity: 'guest', status: 403, response: { error: 'Only the home owner can edit the room.' } });
  expect(JSON.parse(lines[0])).toMatchObject({ action: 'home.saved', status: 403, result: 'refused', reason: 'home_owner_required' });
  expect(lines[0]).not.toContain('Only the home owner');
});
it('records only the matching acknowledged door state, never the requested state or private room contents', () => {
  const buildingId = randomUUID(), lines: string[] = [], log = businessLog(fixture(), { output: line => lines.push(line) });
  for (const open of [false, true]) {
    log.record({ route: 'home/door', identity: 'owner', status: 200,
      context: { buildingId, open: !open, expectedDoorVersion: 900, private: 'REQUEST SECRET' },
      response: { currentPlanet: { homeDoor: { buildingId, open, version: 2, private: 'RESPONSE SECRET' } }, player: { home: { interior: { items: ['PRIVATE FURNITURE'] } } } } });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ action: 'home.door', object: buildingId, doorOpen: open, doorVersion: 2 });
  }
  const cases = [
    { route: 'home/door', status: 403, door: { buildingId, open: true, version: 3 } },
    { route: 'home/door', status: 409, door: { buildingId, open: true, version: 3 } },
    { route: 'home/door', status: 500, door: { buildingId, open: true, version: 3 } },
    { route: 'character', status: 200, door: { buildingId, open: true, version: 3 } },
    { route: 'home/door', status: 200, door: { buildingId: randomUUID(), open: true, version: 3 } },
    { route: 'home/door', status: 200, door: { buildingId, open: 'true', version: 3 } },
    { route: 'home/door', status: 200, door: { buildingId, open: true, version: -1 } },
    { route: 'home/door', status: 200, door: { buildingId, open: true, version: 1.5 } },
    { route: 'home/door', status: 200, door: undefined },
  ];
  for (const [index, item] of cases.entries()) {
    log.record({ route: item.route, identity: 'case-' + index, status: item.status, context: { buildingId, open: true }, response: { currentPlanet: { homeDoor: item.door } } });
    expect(JSON.parse(lines.at(-1)!)).not.toHaveProperty('doorOpen');
    expect(JSON.parse(lines.at(-1)!)).not.toHaveProperty('doorVersion');
  }
  for (const secret of ['REQUEST SECRET', 'RESPONSE SECRET', 'PRIVATE FURNITURE', 'expectedDoorVersion']) expect(lines.join('\n')).not.toContain(secret);
});
