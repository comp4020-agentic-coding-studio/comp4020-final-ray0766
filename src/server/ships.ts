import type { DatabaseSync } from 'node:sqlite';
import { decodeShipDesign, encodeShipDesign } from '../assets/claude-geometry/ship/design.ts';
import { defaultShip } from '../shared/ships.ts';
import type { SavedShip } from '../shared/ships.ts';
import { RequestError } from './errors.ts';
export function shipStore(db: DatabaseSync) {
  const read = (owner: string): SavedShip => {
    const row = db.prepare('SELECT document,version FROM player_ships WHERE player_id=?').get(owner);
    if (!row) return defaultShip();
    const decoded = decodeShipDesign(row.document);
    if (!decoded.ok) throw new Error('Stored ship document is invalid.');
    return { design: decoded.value, version: Number(row.version) };
  };
  return { read, save(owner: string, body: Record<string, unknown>) {
    if (Object.keys(body).some(k => !['document','version'].includes(k)) || !Number.isSafeInteger(body.version) || Number(body.version) < 0)
      throw new RequestError(400, 'Send a ship document and its saved version.');
    const decoded = decodeShipDesign(body.document);
    if (!decoded.ok) throw new RequestError(400, decoded.errors.join(' '));
    const document = encodeShipDesign(decoded.value);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = read(owner);
      // A retry after a lost response never creates a second version, even after boarding.
      if (current.version > 0 && document === encodeShipDesign(current.design)) { db.exec('COMMIT'); return; }
      const flight = db.prepare('SELECT flight FROM players WHERE id=?').get(owner)?.flight;
      if (typeof flight === 'string' && JSON.parse(flight).mode === 'space') throw new RequestError(409, 'Land before changing your ship.');
      if (body.version !== current.version) throw new RequestError(409, 'Your ship changed in another tab. Reload the saved design before editing.');
      db.prepare('INSERT INTO player_ships (player_id,document,version) VALUES (?,?,?) ON CONFLICT(player_id) DO UPDATE SET document=excluded.document,version=excluded.version').run(owner, document, current.version + 1);
      db.prepare('UPDATE players SET revision=revision+1 WHERE id=?').run(owner);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } };
}
