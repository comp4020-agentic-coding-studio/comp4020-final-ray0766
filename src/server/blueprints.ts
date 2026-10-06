import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { decodeBlueprint, encodeBlueprint, hashInput } from '../assets/claude-geometry/blueprint/codec.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { BLUEPRINT_BODY_LIMIT, MAX_BLUEPRINTS } from '../shared/blueprints.ts';
import type { LibraryEntry } from '../shared/blueprints.ts';
import { RequestError } from './errors.ts';

interface LibraryRow { document: string; hash: string; version: number }
const entry = (row: LibraryRow): LibraryEntry => {
  const decoded = decodeBlueprint(row.document);
  if (!decoded.ok) throw new Error('Stored blueprint is invalid.');
  return { blueprint: decoded.value, hash: row.hash, version: row.version };
};
export function blueprintStore(db: DatabaseSync) {
  return {
    list(owner: string): LibraryEntry[] {
      return (db.prepare('SELECT document,hash,version FROM blueprint_library WHERE owner_id=? ORDER BY rowid').all(owner) as unknown as LibraryRow[]).map(entry);
    },
    parts(hash: unknown): PartPlacement[] {
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new RequestError(400, 'Choose a saved blueprint.');
      const r = db.prepare('SELECT content FROM blueprint_contents WHERE hash=?').get(hash);
      if (!r) throw new RequestError(404, 'This blueprint could not be found.');
      return JSON.parse(r.content as string).parts;
    },
    owns(owner: string, hash: unknown) {
      if (typeof hash !== 'string' || !db.prepare('SELECT 1 FROM blueprint_library WHERE owner_id=? AND hash=?').get(owner, hash)) throw new RequestError(403, 'Place a blueprint from your own saved library.');
    },
    save(owner: string, body: Record<string, unknown>): LibraryEntry {
      if (Object.keys(body).some(k => !['document', 'expectedVersion'].includes(k))) throw new RequestError(400, 'Unexpected blueprint field.');
      if (Buffer.byteLength(JSON.stringify(body)) > BLUEPRINT_BODY_LIMIT) throw new RequestError(413, 'Blueprint is too large.');
      if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) throw new RequestError(400, 'Include the saved blueprint version, or zero for a new blueprint.');
      const decoded = decodeBlueprint(body.document);
      if (!decoded.ok) throw new RequestError(400, decoded.errors.slice(0, 3).join(' '));
      const bp = decoded.value;
      if (!bp.parts.length) throw new RequestError(400, 'Add at least one part.');
      const document = encodeBlueprint(bp), content = canonicalJson(hashInput(bp.parts));
      const hash = createHash('sha256').update(content).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        // Recheck at the transaction boundary; anonymous identity never comes from the body.
        if (!db.prepare('SELECT 1 FROM planets WHERE owner_id=?').get(owner)) throw new RequestError(403, 'Claim a home planet before saving blueprints.');
        const old = db.prepare('SELECT document,hash,version FROM blueprint_library WHERE owner_id=? AND id=?').get(owner, bp.id) as unknown as LibraryRow | undefined;
        if (old?.document === document) { db.exec('COMMIT'); return entry(old); }
        if ((old?.version ?? 0) !== body.expectedVersion) throw new RequestError(409, 'This blueprint changed in another tab. Your draft is still here; save a copy or reopen the saved version.');
        if (!old && Number(db.prepare('SELECT count(*) AS n FROM blueprint_library WHERE owner_id=?').get(owner)!.n) >= MAX_BLUEPRINTS) throw new RequestError(409, `Your library has room for ${MAX_BLUEPRINTS} blueprints.`);
        const version = (old?.version ?? 0) + 1;
        db.prepare('INSERT OR IGNORE INTO blueprint_contents (hash,content) VALUES (?,?)').run(hash, content);
        db.prepare(`INSERT INTO blueprint_library (owner_id,id,document,hash,version) VALUES (?,?,?,?,?)
          ON CONFLICT(owner_id,id) DO UPDATE SET document=excluded.document,hash=excluded.hash,version=excluded.version`).run(owner, bp.id, document, hash, version);
        // Keep content referenced by placed objects or any private library; edits cannot grow an unbounded registry.
        db.exec('DELETE FROM blueprint_contents WHERE hash NOT IN (SELECT hash FROM blueprint_library) AND hash NOT IN (SELECT blueprint_hash FROM planet_objects WHERE blueprint_hash IS NOT NULL)');
        db.exec('COMMIT');
        return { blueprint: bp, hash, version };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
