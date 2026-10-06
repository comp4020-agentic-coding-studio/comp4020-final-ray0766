import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, distance, INTERACT_DISTANCE, NPCS, normalize, SPAWN, SPEED, validPosition } from '../shared/world.ts';
import type { Character, PlayerState, Quest } from '../shared/world.ts';
import { historyStore, migrateHistory } from './history.ts';
import { shipStore } from './ships.ts';
import { groundStore } from './ground.ts';
import { blueprintStore } from './blueprints.ts';
import { planetStore } from './planets.ts';
import { RequestError } from './errors.ts';
import { navigationStore } from './navigation.ts';
export { RequestError } from './errors.ts';

interface Row { character: Character; quest: Quest; position: string; deliveries: number; revision: number; moved_at: number; planet_id: string }
export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const schema = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if (schema > 8) { db.close(); throw new Error('Database schema is newer than this application.'); }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, character TEXT NOT NULL DEFAULT 'clay' CHECK(character IN ('clay','fern','sky')),
      quest TEXT NOT NULL DEFAULT 'available' CHECK(quest IN ('available','carrying','delivered')),
      position TEXT NOT NULL, deliveries INTEGER NOT NULL DEFAULT 0 CHECK(deliveries BETWEEN 0 AND 1),
      revision INTEGER NOT NULL DEFAULT 0, moved_at INTEGER NOT NULL
    );`);
  let migrationBackup: string | null = null;
  if (schema < 8) {
    if (schema > 0 && path !== ':memory:') {
      migrationBackup = `${path}.v${schema}-${new Date().toISOString().replace(/[:.]/g, '-')}.backup.sqlite`;
      // VACUUM INTO includes committed WAL data and produces a consistent restore point.
      db.prepare('VACUUM INTO ?').run(migrationBackup);
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (schema < 2) db.exec(`ALTER TABLE players ADD COLUMN planet_id TEXT NOT NULL DEFAULT 'hub';
        CREATE TABLE planets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('hub','garden')),
          owner_id TEXT UNIQUE REFERENCES players(id), revision INTEGER NOT NULL DEFAULT 0,
          CHECK(kind != 'hub' OR owner_id IS NULL)
        );
        INSERT INTO planets (id,name,kind) VALUES ('hub','Sunseed Harbour','hub');
        CREATE TABLE planet_objects (
          id TEXT PRIMARY KEY, planet_id TEXT NOT NULL REFERENCES planets(id),
          kind TEXT NOT NULL CHECK(kind IN ('cottage','tree','path','flowers','bench','lamp')),
          position TEXT NOT NULL, rotation REAL NOT NULL, version INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX objects_by_planet ON planet_objects(planet_id);
        CREATE TABLE visits (player_id TEXT NOT NULL REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id),
          position TEXT NOT NULL, PRIMARY KEY(player_id,planet_id));`);
      if(schema<3)db.exec('CREATE TABLE object_tombstones (id TEXT PRIMARY KEY, planet_id TEXT NOT NULL REFERENCES planets(id));');
      if (schema < 4) {
      db.exec(`ALTER TABLE planets ADD COLUMN slot INTEGER;
        ALTER TABLE players ADD COLUMN flight TEXT;
        ALTER TABLE players ADD COLUMN flight_at INTEGER NOT NULL DEFAULT 0;`);
      const existing=db.prepare('SELECT id FROM planets ORDER BY rowid').all();
      existing.forEach((p,i)=>db.prepare('UPDATE planets SET slot=? WHERE id=?').run(i,p.id));
      db.exec('CREATE UNIQUE INDEX planet_space_slot ON planets(slot);');
      }
      if (schema < 5) db.exec(`CREATE TABLE blueprint_contents (hash TEXT PRIMARY KEY CHECK(length(hash)=64), content TEXT NOT NULL);
        CREATE TABLE blueprint_library (
          owner_id TEXT NOT NULL REFERENCES players(id), id TEXT NOT NULL, document TEXT NOT NULL,
          hash TEXT NOT NULL REFERENCES blueprint_contents(hash), version INTEGER NOT NULL CHECK(version>=1), PRIMARY KEY(owner_id,id)
        );
        CREATE INDEX library_by_hash ON blueprint_library(hash);
        CREATE TABLE planet_objects_v5 (
          id TEXT PRIMARY KEY, planet_id TEXT NOT NULL REFERENCES planets(id),
          kind TEXT NOT NULL CHECK(kind IN ('cottage','tree','path','flowers','bench','lamp','structure')),
          position TEXT NOT NULL, rotation REAL NOT NULL, version INTEGER NOT NULL DEFAULT 1,
          blueprint_hash TEXT REFERENCES blueprint_contents(hash), radius REAL, height REAL,
          CHECK((kind='structure' AND blueprint_hash IS NOT NULL AND radius IS NOT NULL AND height IS NOT NULL AND radius>0 AND height>0)
            OR (kind!='structure' AND blueprint_hash IS NULL AND radius IS NULL AND height IS NULL))
        );
        INSERT INTO planet_objects_v5 (rowid,id,planet_id,kind,position,rotation,version)
          SELECT rowid,id,planet_id,kind,position,rotation,version FROM planet_objects;
        DROP TABLE planet_objects;
        ALTER TABLE planet_objects_v5 RENAME TO planet_objects;
        CREATE INDEX objects_by_planet ON planet_objects(planet_id);
        PRAGMA user_version=5;`);
      db.exec(`CREATE TABLE IF NOT EXISTS ground_states (
        player_id TEXT PRIMARY KEY REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id), position TEXT NOT NULL,
        radius REAL NOT NULL CHECK(radius BETWEEN 9 AND 20), vertical_speed REAL NOT NULL CHECK(vertical_speed BETWEEN -10 AND 0),
        grounded INTEGER NOT NULL CHECK(grounded IN (0,1)), sequence INTEGER NOT NULL, scene_revision INTEGER NOT NULL,
        clock_credit REAL NOT NULL CHECK(clock_credit BETWEEN 0 AND 2), request_hash TEXT
      );`);
      if (schema < 7) db.exec(`CREATE TABLE IF NOT EXISTS player_ships (
        player_id TEXT PRIMARY KEY REFERENCES players(id), document TEXT NOT NULL,
        version INTEGER NOT NULL CHECK(version>=1)
      );`);
      if (schema < 8) migrateHistory(db);
      db.exec('PRAGMA user_version=8; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const history = historyStore(db);
  const ships = shipStore(db);
  const blueprints = blueprintStore(db);
  const planets = planetStore(db, blueprints, history);
  const navigation=navigationStore(db,planets);
  const ground=groundStore(db,planets);
  const row = (id: string): Row => {
    const result = db.prepare('SELECT * FROM players WHERE id=?').get(id) as unknown as Row | undefined;
    if (!result) throw new RequestError(401, 'Your session has expired. Reload to start a new visit.');
    return result;
  };
  const state = (id: string): PlayerState => {
    const initial=row(id),flight=navigation.flight(id);
    const standing=initial.planet_id!=='hub'&&flight.mode==='ground'?ground.read(id):undefined;
    const r = row(id);
    return { ship: ships.read(id), ...(standing?{ground:standing}:{}),character: r.character, quest: r.quest, position: JSON.parse(r.position), deliveries: r.deliveries, revision: r.revision, planetId: r.planet_id,flight:navigation.flight(id) };
  };
  const universe = (id: string) => { const player = state(id); return { player, planets: planets.list(id), ownedPlanetId: planets.owned(id), currentPlanet: planets.view(id, player.planetId) }; };
  return {
    db, state, universe, migrationBackup,
    historyPage(id:string,planet:unknown,after?:unknown,limit?:unknown){row(id);return history.page(id,planet,after,limit);},
    historySnapshot(id:string,planet:unknown,sequence?:unknown){row(id);return history.snapshot(id,planet,sequence);},
    saveShip(id: string, body: Record<string, unknown>) { row(id); ships.save(id, body); return state(id); },
    library(id: string) { row(id); return blueprints.list(id); },
    saveBlueprint(id: string, body: Record<string, unknown>) { row(id); return blueprints.save(id, body); },
    takeoff(id:string,body:Record<string,unknown>,now=Date.now()){navigation.takeoff(id,body,now);ground.reset(id);return universe(id);},
    flight(id:string,body:Record<string,unknown>,now=Date.now()){navigation.checkpoint(id,body,now);return state(id);},
    land(id:string,body:Record<string,unknown>,now=Date.now()){navigation.land(id,body,now);return universe(id);},
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
    move(id: string, value: unknown, now = Date.now(), expectedPlanet?: unknown,motion?:unknown) {
      if (!validPosition(value)) throw new RequestError(400, 'Position must be a finite point on the planet.');
      const r = row(id);
      if(navigation.flight(id).mode==='space')throw new RequestError(409,'Land before walking on the surface.');
      if ((expectedPlanet === undefined && r.planet_id !== 'hub') || (expectedPlanet !== undefined && expectedPlanet !== r.planet_id)) throw new RequestError(409, 'Your visit moved to another planet. Reconnecting…');
      if(r.planet_id!=='hub'){ground.move(id,normalize(value),now,motion);return state(id);}
      if(motion!==undefined)throw new RequestError(400,'Ground paths belong to private planet visits.');
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
      if (r.planet_id !== 'hub'||navigation.flight(id).mode==='space') throw new RequestError(409, 'Deliveries take place at Sunseed Harbour.');
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
    visit(id: string, planetId: unknown) {
      const r = row(id), p = planets.planet(planetId);
      if (r.planet_id === p.id) return universe(id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO visits (player_id,planet_id,position) VALUES (?,?,?) ON CONFLICT(player_id,planet_id) DO UPDATE SET position=excluded.position').run(id, r.planet_id, r.position);
        const saved = db.prepare('SELECT position FROM visits WHERE player_id=? AND planet_id=?').get(id, p.id)?.position as string | undefined;
        db.prepare('UPDATE players SET planet_id=?,position=?,moved_at=?,revision=revision+1 WHERE id=?').run(p.id, saved ?? JSON.stringify(SPAWN), Date.now(), id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return universe(id);
    },
    claim(id: string, planetId: unknown) { row(id); planets.claim(id, planetId); return universe(id); },
    createObject(id: string, body: Record<string, unknown>) { row(id); planets.create(id, body); return universe(id); },
    updateObject(id: string, body: Record<string, unknown>) { row(id); planets.update(id, body); return universe(id); },
    removeObject(id: string, body: Record<string, unknown>) { row(id); planets.remove(id, body); return universe(id); },
    close() { db.close(); },
  };
}
