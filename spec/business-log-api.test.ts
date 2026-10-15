import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('records two real HTTP identities and an owner-only refusal, with no cookie or request-body leakage', async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = probe.address() as { port: number }; probe.close(() => resolve(address.port));
    });
  });
  const directory = mkdtempSync(join(tmpdir(), 'business-api-')), database = join(directory, 'world.sqlite');
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', TEST_LEGACY_WORLD: '1', HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: database };
  delete env.HOME_SAMPLE;
  const server = spawn(process.execPath, ['src/server/index.ts'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; server.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-2000); });
  const base = `http://127.0.0.1:${port}`;
  const request = (route: string, cookie: string, body?: unknown) => fetch(base + '/api/' + route, { headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw Error('Isolated server exited: ' + errors);
      try { const response = await fetch(base + '/healthz', { signal: AbortSignal.timeout(300) }); const health = await response.json(); if (health.profile !== 'legacy-test') throw Error('Wrong test profile'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    expect(ready, errors).toBe(true);
    const a = await request('state', ''), b = await request('state', '');
    const cookieA = a.headers.get('set-cookie')!.split(';')[0], cookieB = b.headers.get('set-cookie')!.split(';')[0];
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    const universe = await (await request('universe', cookieA)).json();
    const planet = universe.planets.find((p: { kind: string; claimed: boolean }) => p.kind === 'garden' && !p.claimed).id;
    expect((await request('planets/claim', cookieA, { planetId: planet })).status).toBe(200);
    expect((await request('character', cookieB, { character: 'fern' })).status).toBe(200);
    const denied = await request('objects/create', cookieB, { planetId: planet, objectId: randomUUID(), kind: 'lamp', position: [0, 1, 0], rotation: 0 });
    expect(denied.status).toBe(403);
    const text = readFileSync(database + '.business.jsonl', 'utf8'), events = text.trim().split('\n').map(line => JSON.parse(line));
    const created = events.filter(e => e.action === 'session.created');
    expect(created).toHaveLength(2); expect(created[0].actor).not.toBe(created[1].actor);
    expect(events.find(e => e.action === 'planet.claimed')).toMatchObject({ actor: created[0].actor, planet, result: 'accepted' });
    expect(events.find(e => e.action === 'object.created')).toMatchObject({ actor: created[1].actor, planet, result: 'refused', reason: 'planet_owner_required' });
    for (const cookie of [cookieA, cookieB]) {
      const token = cookie.split('=')[1]; expect(text).not.toContain(token); expect(text).not.toContain(createHash('sha256').update(token).digest('hex'));
    }
    expect(text).not.toContain('position'); expect(text).not.toContain('Cookie');
  } finally {
    server.kill('SIGTERM');
    await new Promise<void>(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', () => resolve()); const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 2000); timer.unref(); });
    rmSync(directory, { recursive: true, force: true });
  }
}, 25_000);
