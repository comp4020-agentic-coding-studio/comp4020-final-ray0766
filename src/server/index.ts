import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { marked } from 'marked';
import { openStore, RequestError } from './store.ts';

const store = openStore(process.env.DATABASE_PATH ?? '.data/little-post.sqlite');
if (store.migrationBackup) console.log(`Before migration, saved a consistent backup: ${store.migrationBackup}`);
const root = resolve('dist');
const limits = new Map<string, { start: number; count: number }>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') { send(200, { ok: true }); return; }
    if (url.pathname.startsWith('/api/')) {
      const cookie = /(?:^|;\s*)little_post=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      let id = cookie ? hash(cookie) : '';
      if (url.pathname === '/api/state' && req.method === 'GET') {
        if (!id || !store.has(id)) {
          const token = randomBytes(32).toString('hex'); id = hash(token); store.create(id);
          const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
          res.setHeader('Set-Cookie', `little_post=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
        }
        send(200, store.state(id)); return;
      }
      if (url.pathname === '/api/universe' && req.method === 'GET') {
        if (!id || !store.has(id)) throw new RequestError(401, 'Reload to reconnect your visit.');
        send(200, store.universe(id)); return;
      }
      if (req.method !== 'POST') throw new RequestError(405, 'Method not allowed.');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new RequestError(403, 'Use this world’s own page.');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Send JSON.');
      if (!id || !store.has(id)) throw new RequestError(401, 'Reload to reconnect your visit.');
      const now = Date.now();
      if (limits.size > 2000) for (const [k, v] of limits) if (now - v.start > 10_000) limits.delete(k);
      const rate = limits.get(id);
      if (!rate || now - rate.start > 10_000) limits.set(id, { start: now, count: 1 });
      else if (++rate.count > 90) throw new RequestError(429, 'A little too fast. Try again in a moment.');
      let text = '';
      for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 2048) throw new RequestError(413, 'Request too large.'); }
      let body: Record<string, unknown>;
      try { body = JSON.parse(text); } catch { throw new RequestError(400, 'Invalid JSON.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new RequestError(400, 'Expected an object.');
      if (url.pathname === '/api/character') send(200, store.character(id, body.character));
      else if (url.pathname === '/api/move') send(200, store.move(id, body.position, Date.now(), body.planetId));
      else if (url.pathname === '/api/interact') send(200, store.interact(id, body.action));
      else if (url.pathname === '/api/planets/claim' || url.pathname === '/api/planets/visit') {
        if (Object.keys(body).some(k => k !== 'planetId')) throw new RequestError(400, 'Unexpected planet field.');
        send(200, url.pathname.endsWith('/claim') ? store.claim(id, body.planetId) : store.visit(id, body.planetId));
      }
      else if (url.pathname === '/api/objects/create') send(200, store.createObject(id, body));
      else if (url.pathname === '/api/objects/update') send(200, store.updateObject(id, body));
      else if (url.pathname === '/api/objects/delete') send(200, store.removeObject(id, body));
      else throw new RequestError(404, 'Not found.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'Method not allowed.');
    let body: string | Buffer;
    let type: string;
    if (url.pathname === '/readme' || url.pathname === '/readme/') {
      const content = await marked.parse(await readFile('README.md', 'utf8'));
      body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>About — Little Post</title><style>body{max-width:760px;margin:64px auto;padding:0 24px;background:#f5f3ea;color:#263e36;font:17px/1.8 system-ui}a{color:#9a3b20}h1,h2,h3{line-height:1.2}pre{overflow:auto;padding:20px;background:#e9e7de}code{font-size:.88em}h2{margin-top:48px}</style><a href="/">← Back to the planet</a><main>${content}</main></html>`;
      type = 'text/html; charset=utf-8';
    } else {
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + '/')) throw new RequestError(404, 'Not found.');
      try { body = await readFile(path); } catch { throw new RequestError(404, 'Not found.'); }
      type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream';
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error instanceof RequestError) send(error.status, { error: error.message });
    else { console.error(error instanceof Error ? error.message : 'Request failed'); send(500, { error: 'The world is unavailable. Please retry.' }); }
  }
});
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? '0.0.0.0', () => console.log(`Little Worlds is ready on http://localhost:${process.env.PORT ?? 8080}`));
const stop = () => { server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
