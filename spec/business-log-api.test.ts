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
    expect((await request('arrival/retry',cookieB,{})).status).toBe(403);
    const text = readFileSync(database + '.business.jsonl', 'utf8'), events = text.trim().split('\n').map(line => JSON.parse(line));
    const created = events.filter(e => e.action === 'session.created');
    expect(created).toHaveLength(2); expect(created[0].actor).not.toBe(created[1].actor);
    expect(events.find(e => e.action === 'planet.claimed')).toMatchObject({ actor: created[0].actor, planet, result: 'accepted' });
    expect(events.find(e => e.action === 'object.created')).toMatchObject({ actor: created[1].actor, planet, result: 'refused', reason: 'planet_owner_required' });
    expect(events.find(e=>e.action==='arrival.retry_requested')).toMatchObject({actor:created[1].actor,status:403,result:'refused',reason:'permission_refused'});
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

it('logs acknowledged door states and the actual room-edit refusal on an isolated home HTTP server', async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = probe.address() as { port: number }; probe.close(() => resolve(address.port));
    });
  });
  const directory = mkdtempSync(join(tmpdir(), 'business-home-api-')), database = join(directory, 'world.sqlite');
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', HOME_SAMPLE: '1', HOME_SAMPLE_PORT: String(port), DATABASE_PATH: database };
  delete env.TEST_LEGACY_WORLD;
  const server = spawn(process.execPath, ['src/server/index.ts'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; server.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-2000); });
  const base = `http://127.0.0.1:${port}`;
  const request = (route: string, cookie = '', body?: unknown) => fetch(base + '/api/' + route, { headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw Error('Isolated server exited: ' + errors);
      try { const response = await fetch(base + '/healthz', { signal: AbortSignal.timeout(300) }); const health = await response.json(); if (health.profile !== 'home-sample') throw Error('Wrong test profile'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    expect(ready, errors).toBe(true);
    const a = await request('state'), b = await request('state');
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    const cookieA = a.headers.get('set-cookie')!.split(';')[0], cookieB = b.headers.get('set-cookie')!.split(';')[0];
    const owner = await a.json(), home = owner.home;
    expect(home.interior.doorOpen).toBe(true);
    const close = await request('home/door', cookieA, { buildingId: home.buildingId, visitEpoch: owner.location.visitEpoch, expectedDoorVersion: 0, open: false });
    expect(close.status).toBe(200); expect((await close.json()).currentPlanet.homeDoor).toMatchObject({ open: false, version: 1 });
    const stale = await request('home/door', cookieA, { buildingId: home.buildingId, visitEpoch: owner.location.visitEpoch, expectedDoorVersion: 0, open: true });
    expect(stale.status).toBe(409);
    const open = await request('home/door', cookieA, { buildingId: home.buildingId, visitEpoch: owner.location.visitEpoch, expectedDoorVersion: 1, open: true });
    expect(open.status).toBe(200); expect((await open.json()).currentPlanet.homeDoor).toMatchObject({ open: true, version: 2 });
    const noop = await request('home/door', cookieA, { buildingId: home.buildingId, visitEpoch: owner.location.visitEpoch, expectedDoorVersion: 2, open: true });
    expect(noop.status).toBe(200); expect((await noop.json()).currentPlanet.homeDoor).toMatchObject({ open: true, version: 2 });
    const denied = await request('home/save', cookieB, { buildingId: home.buildingId, expectedVersion: home.interior.version, material: 'sage', items: [] });
    expect(denied.status).toBe(403);
    const text = readFileSync(database + '.business.jsonl', 'utf8'), events = text.trim().split('\n').map(line => JSON.parse(line));
    const doors = events.filter(e => e.action === 'home.door');
    expect(doors).toHaveLength(4);
    expect(doors[0]).toMatchObject({ object: home.buildingId, status: 200, doorOpen: false, doorVersion: 1 });
    expect(doors[1]).toMatchObject({ status: 409, result: 'refused' });
    expect(doors[1]).not.toHaveProperty('doorOpen'); expect(doors[1]).not.toHaveProperty('doorVersion');
    expect(doors[2]).toMatchObject({ status: 200, doorOpen: true, doorVersion: 2 });
    expect(doors[3]).toMatchObject({ status: 200, doorOpen: true, doorVersion: 2 });
    expect(events.find(e => e.action === 'home.saved')).toMatchObject({ status: 403, result: 'refused', reason: 'home_owner_required' });
    expect(events.find(e => e.action === 'home.saved').actor).not.toBe(doors[0].actor);
    for (const secret of [cookieA.split('=')[1], cookieB.split('=')[1], 'items', 'material', 'expectedDoorVersion', 'Only the home owner']) expect(text).not.toContain(secret);
  } finally {
    server.kill('SIGTERM');
    await new Promise<void>(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', () => resolve()); const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 2000); timer.unref(); });
    rmSync(directory, { recursive: true, force: true });
  }
}, 25_000);

it('logs an accepted new-arrival retry on an isolated integrated HTTP server',async()=>{
  const port=await new Promise<number>((resolve,reject)=>{
    const probe=createServer().once('error',reject).listen(0,'127.0.0.1',()=>{
      const address=probe.address() as {port:number};probe.close(()=>resolve(address.port));
    });
  });
  const directory=mkdtempSync(join(tmpdir(),'business-arrival-api-')),database=join(directory,'world.sqlite');
  const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DATABASE_PATH:database};
  delete env.HOME_SAMPLE;delete env.TEST_LEGACY_WORLD;
  const server=spawn(process.execPath,['src/server/index.ts'],{env,stdio:['ignore','ignore','pipe']});
  let errors='';server.stderr.on('data',chunk=>{errors=(errors+String(chunk)).slice(-2000);});
  const base=`http://127.0.0.1:${port}`;
  try{
    let ready=false;
    for(let attempt=0;attempt<100;attempt++){
      if(server.exitCode!==null)throw Error('Isolated server exited: '+errors);
      try{const health=await fetch(base+'/healthz',{signal:AbortSignal.timeout(300)}).then(r=>r.json());if(health.profile==='integrated'){ready=true;break;}}
      catch{/* Wait only for this isolated server. */}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    expect(ready,errors).toBe(true);
    const arrival=await fetch(base+'/api/state',{signal:AbortSignal.timeout(5000)});
    expect(arrival.status).toBe(200);const cookie=arrival.headers.get('set-cookie')!.split(';')[0];
    const retry=await fetch(base+'/api/arrival/retry',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
    expect(retry.status).toBe(200);
    const text=readFileSync(database+'.business.jsonl','utf8'),events=text.trim().split('\n').map(line=>JSON.parse(line));
    const created=events.find(e=>e.action==='session.created'),requested=events.filter(e=>e.action==='arrival.retry_requested');
    expect(requested).toHaveLength(1);expect(requested[0]).toMatchObject({actor:created.actor,status:200,result:'accepted'});
    expect(text).not.toContain(cookie.split('=')[1]);expect(text).not.toContain('api.unknown');
  }finally{
    server.kill('SIGTERM');
    await new Promise<void>(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',()=>resolve());const timer=setTimeout(()=>{server.kill('SIGKILL');resolve();},2000);timer.unref();});
    rmSync(directory,{recursive:true,force:true});
  }
},25_000);
