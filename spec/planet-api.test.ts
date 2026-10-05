import { expect, inject, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { normalize } from '../src/shared/world.ts';
import type { Universe } from '../src/shared/planets.ts';
const base = inject('baseUrl');
async function visitor() {
  const res = await fetch(base + '/api/state'), cookie = res.headers.get('set-cookie')!.split(';')[0];
  return {
    universe: async () => (await fetch(base + '/api/universe', { headers: { Cookie: cookie } })).json() as Promise<Universe>,
    post: (route: string, body: unknown) => fetch(base + '/api/' + route, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  };
}
it('resolves competing claims atomically and rejects every visitor write endpoint', async () => {
  const a = await visitor(), b = await visitor();
  const p = (await a.universe()).planets.find(p => p.kind === 'garden' && !p.claimed)!;
  const race = await Promise.all([a.post('planets/claim', { planetId: p.id }), b.post('planets/claim', { planetId: p.id })]);
  expect(race.map(r => r.status).sort()).toEqual([200, 409]);
  const owner = race[0].ok ? a : b, guest = race[0].ok ? b : a;
  const other = (await guest.universe()).planets.find(p => p.kind === 'garden' && !p.claimed)!;
  expect((await owner.post('planets/claim', { planetId: other.id })).status).toBe(409);
  expect((await guest.post('planets/claim', { planetId: other.id })).status).toBe(200);
  const body = { planetId: p.id, objectId: randomUUID(), kind: 'cottage', position: normalize([.48, 1, .3]), rotation: 0 };
  expect((await owner.post('objects/create', { ...body, ownerId: 'forged' })).status).toBe(400);
  expect((await owner.post('objects/create', body)).status).toBe(200);
  expect((await guest.post('objects/create', body)).status).toBe(403);
  expect((await guest.post('objects/update', { planetId: p.id, objectId: body.objectId, position: body.position, rotation: 1, expectedVersion: 1 })).status).toBe(403);
  expect((await guest.post('objects/delete', { planetId: p.id, objectId: body.objectId, expectedVersion: 1 })).status).toBe(403);
  expect((await guest.post('planets/visit', { planetId: p.id })).status).toBe(410);
  expect((await guest.universe()).planets.find(x=>x.id===p.id)?.objectCount).toBe(1);
  expect((await fetch(base + '/api/objects/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status).toBe(401);
});
it('prevents one identity from concurrently claiming two planets', async () => {
  const a = await visitor(); const blanks = (await a.universe()).planets.filter(p => p.kind === 'garden' && !p.claimed).slice(0, 2);
  const res = await Promise.all(blanks.map(p => a.post('planets/claim', { planetId: p.id })));
  expect(res.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await a.universe()).planets.filter(p => p.mine)).toHaveLength(1);
});
