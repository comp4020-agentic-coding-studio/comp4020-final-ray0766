import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, distance, INTERACT_DISTANCE, NPCS, normalize, SPAWN, SPEED, validPosition } from '../shared/world.ts';
import type { Character, PlayerState, Quest } from '../shared/world.ts';

export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
interface Row { character: Character; quest: Quest; position: string; deliveries: number; revision: number; moved_at: number }
export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, character TEXT NOT NULL DEFAULT 'clay' CHECK(character IN ('clay','fern','sky')),
      quest TEXT NOT NULL DEFAULT 'available' CHECK(quest IN ('available','carrying','delivered')),
      position TEXT NOT NULL, deliveries INTEGER NOT NULL DEFAULT 0 CHECK(deliveries BETWEEN 0 AND 1),
      revision INTEGER NOT NULL DEFAULT 0, moved_at INTEGER NOT NULL
    ); PRAGMA user_version=1;`);
  const row = (id: string): Row => {
    const result = db.prepare('SELECT * FROM players WHERE id=?').get(id) as unknown as Row | undefined;
    if (!result) throw new RequestError(401, 'Your session has expired. Reload to start a new visit.');
    return result;
  };
  const state = (id: string): PlayerState => {
    const r = row(id);
    return { character: r.character, quest: r.quest, position: JSON.parse(r.position), deliveries: r.deliveries, revision: r.revision };
  };
  return {
    db, state,
    has: (id: string) => Boolean(db.prepare('SELECT id FROM players WHERE id=?').get(id)),
    create(id: string, now = Date.now()) {
      db.prepare('INSERT INTO players (id,position,moved_at) VALUES (?,?,?)').run(id, JSON.stringify(SPAWN), now);
      return state(id);
    },
    character(id: string, value: unknown) {
      if (!CHARACTERS.includes(value as Character)) throw new RequestError(400, 'Choose one of the three couriers.');
      row(id);
      db.prepare('UPDATE players SET character=?,revision=revision+1 WHERE id=?').run(value as string, id);
      return state(id);
    },
    move(id: string, value: unknown, now = Date.now()) {
      if (!validPosition(value)) throw new RequestError(400, 'Position must be a finite point on the planet.');
      const r = row(id);
      // A bounded travel budget prevents a forged jump straight to a destination.
      const budget = SPEED * Math.min(2, Math.max(0, now - r.moved_at) / 1000) + 0.35;
      const p = normalize(value);
      if (distance(JSON.parse(r.position), p) > budget) throw new RequestError(409, 'You moved too far while disconnected. Return to your saved spot.');
      db.prepare('UPDATE players SET position=?,moved_at=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p), now, id);
      return state(id);
    },
    interact(id: string, action: unknown) {
      if (action !== 'pickup' && action !== 'deliver') throw new RequestError(400, 'Unknown delivery action.');
      const r = row(id);
      // Replayed requests never award another parcel or delivery.
      if (action === 'pickup' && r.quest !== 'available') return state(id);
      if (action === 'deliver' && r.quest === 'delivered') return state(id);
      if (action === 'deliver' && r.quest !== 'carrying') throw new RequestError(409, 'Collect the parcel from Mica first.');
      const npc = action === 'pickup' ? NPCS.mica : NPCS.sol;
      if (distance(JSON.parse(r.position), npc.position) > INTERACT_DISTANCE) throw new RequestError(409, `Walk closer to ${npc.name} first.`);
      db.prepare('UPDATE players SET quest=?,deliveries=?,revision=revision+1 WHERE id=?')
        .run(action === 'pickup' ? 'carrying' : 'delivered', action === 'pickup' ? 0 : 1, id);
      return state(id);
    },
    close() { db.close(); },
  };
}
