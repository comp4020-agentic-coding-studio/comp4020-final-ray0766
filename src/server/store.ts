import { createHash, randomUUID } from 'node:crypto';
import { encodeBlueprint, hashInput } from '../assets/claude-geometry/blueprint/codec.ts';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { MAX_BLUEPRINTS } from '../shared/blueprints.ts';
import { homeStore, migrateHomes } from './home.ts';
import { HOME_SAMPLE_RADIUS } from '../shared/home.ts';
import { planetCenter, spaceDistance } from '../shared/flight.ts';
import { HUB_RADIUS } from '../shared/world-size.ts';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, distance, INTERACT_DISTANCE, NPCS, normalize, SPAWN, validPosition } from '../shared/world.ts';
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
export function openStore(path: string, options: { homeSample?: boolean } = {}) {
  // Probe with SQLite's read-only flag before mkdir, WAL pragmas or any migration.
  if(options.homeSample&&path!==':memory:'&&existsSync(path)){
    const probe=new DatabaseSync(path,{readOnly:true});let permitted:boolean;
    try{const table=probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='home_sample_config'").get();permitted=!!table&&Number(probe.prepare('SELECT enabled FROM home_sample_config WHERE id=1').get()?.enabled)===1;}finally{probe.close();}
    if(!permitted)throw new Error('HOME_SAMPLE refuses an existing non-sample database before migration. Use a new isolated path.');
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const schema = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if (schema > 14) { db.close(); throw new Error('Database schema is newer than this application.'); }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, character TEXT NOT NULL DEFAULT 'clay' CHECK(character IN ('clay','fern','sky')),
      quest TEXT NOT NULL DEFAULT 'available' CHECK(quest IN ('available','carrying','delivered')),
      position TEXT NOT NULL, deliveries INTEGER NOT NULL DEFAULT 0 CHECK(deliveries BETWEEN 0 AND 1),
      revision INTEGER NOT NULL DEFAULT 0, moved_at INTEGER NOT NULL
    );`);
  let migrationBackup: string | null = null;
  if (schema < 14) {
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
      if(schema<9){
        const column=(table:string,name:string)=>db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===name);
        if(!column('planets','environment'))db.exec('ALTER TABLE planets ADD COLUMN environment TEXT');
        for(const table of ['history_events','history_snapshots'])if(!column(table,'environment'))db.exec('ALTER TABLE '+table+' ADD COLUMN environment TEXT');
        db.exec(`CREATE TABLE ground_states_v9 (
          player_id TEXT PRIMARY KEY REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id), position TEXT NOT NULL,
          radius REAL NOT NULL CHECK(radius BETWEEN 8 AND 20), vertical_speed REAL NOT NULL CHECK(vertical_speed BETWEEN -10 AND 0),
          grounded INTEGER NOT NULL CHECK(grounded IN (0,1)), sequence INTEGER NOT NULL, scene_revision INTEGER NOT NULL,
          clock_credit REAL NOT NULL CHECK(clock_credit BETWEEN 0 AND 2), request_hash TEXT);
          INSERT INTO ground_states_v9 SELECT player_id,planet_id,position,radius,vertical_speed,grounded,sequence,scene_revision,clock_credit,request_hash FROM ground_states;DROP TABLE ground_states;ALTER TABLE ground_states_v9 RENAME TO ground_states;`);
      }
      // Old rows retain all saved values. Their version 0 is recovered lazily
      // when that player next returns; no building/history migration is needed.
      if(!db.prepare('PRAGMA table_info(ground_states)').all().some(c=>c.name==='physics_version'))
        db.exec('ALTER TABLE ground_states ADD COLUMN physics_version INTEGER NOT NULL DEFAULT 0 CHECK(physics_version>=0)');
      if(schema<11){
        if(!db.prepare('PRAGMA table_info(planets)').all().some(c=>c.name==='radius'))db.exec('ALTER TABLE planets ADD COLUMN radius REAL NOT NULL DEFAULT 10 CHECK(radius IN (10,11,12,14))');
        db.prepare("UPDATE planets SET radius=? WHERE kind='hub'").run(HUB_RADIUS);
        // Only untouched, unclaimed, unoccupied worlds can acquire a size.
        // Owned worlds, old structures, visit positions and history stay intact.
        db.exec(`UPDATE planets SET radius=10+((slot-1)%3),revision=revision+1
          WHERE kind='garden' AND owner_id IS NULL AND radius != 10+((slot-1)%3)
          AND NOT EXISTS(SELECT 1 FROM planet_objects o WHERE o.planet_id=planets.id)
          AND NOT EXISTS(SELECT 1 FROM players p WHERE p.planet_id=planets.id)
          AND NOT EXISTS(SELECT 1 FROM history_events h WHERE h.planet_id=planets.id)
          AND NOT EXISTS(SELECT 1 FROM visits v WHERE v.planet_id=planets.id)`);
        const airborne=db.prepare('SELECT flight FROM players WHERE flight IS NOT NULL').all().map(r=>JSON.parse(String(r.flight))).filter(f=>f.mode==='space');
        // Never put an old flight inside an enlarged surface. An occupied empty
        // garden keeps 10 m; a conflicting hub flight aborts the transaction.
        const sizes=db.prepare('SELECT id,slot,kind,radius,environment FROM planets WHERE radius>10').all();
        for(const p of sizes){const center=planetCenter(Number(p.slot)),clearance=Number(p.radius)+3.2+(p.environment?1.75:0);
          if(airborne.some(f=>spaceDistance(f.position,center)<clearance)){
            if(p.kind==='hub')throw Error('Compact harbour migration paused: land the saved nearby spacecraft before upgrading. No saved data was changed.');
            db.prepare('UPDATE planets SET radius=10 WHERE id=?').run(p.id);
          }
        }
      }
      if(schema<12){
        db.exec(`CREATE TABLE ground_states_v12 (
          player_id TEXT PRIMARY KEY REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id), position TEXT NOT NULL,
          radius REAL NOT NULL CHECK(radius BETWEEN 8 AND 24), vertical_speed REAL NOT NULL CHECK(vertical_speed BETWEEN -10 AND 5.2),
          grounded INTEGER NOT NULL CHECK(grounded IN (0,1)), sequence INTEGER NOT NULL, scene_revision INTEGER NOT NULL,
          clock_credit REAL NOT NULL CHECK(clock_credit BETWEEN 0 AND 2), request_hash TEXT,
          physics_version INTEGER NOT NULL DEFAULT 0 CHECK(physics_version>=0),jump_held INTEGER NOT NULL DEFAULT 0 CHECK(jump_held IN (0,1)));
          INSERT INTO ground_states_v12 (player_id,planet_id,position,radius,vertical_speed,grounded,sequence,scene_revision,clock_credit,request_hash,physics_version)
          SELECT player_id,planet_id,position,radius,vertical_speed,grounded,sequence,scene_revision,clock_credit,request_hash,physics_version FROM ground_states;
          DROP TABLE ground_states;ALTER TABLE ground_states_v12 RENAME TO ground_states;`);
      }
      if(schema<13)db.exec(`CREATE TABLE IF NOT EXISTS object_assets (
        object_id TEXT PRIMARY KEY, planet_id TEXT NOT NULL REFERENCES planets(id),
        asset_version INTEGER NOT NULL CHECK(asset_version=2));
        CREATE INDEX IF NOT EXISTS object_assets_planet ON object_assets(planet_id);
        CREATE TRIGGER IF NOT EXISTS object_assets_no_update BEFORE UPDATE ON object_assets BEGIN SELECT RAISE(ABORT,'Asset versions are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS object_assets_no_delete BEFORE DELETE ON object_assets BEGIN SELECT RAISE(ABORT,'Asset versions are immutable'); END;`);
      migrateHomes(db);
      db.prepare('INSERT OR IGNORE INTO home_sample_config(id,enabled) VALUES(1,?)').run(Number(schema===0&&!!options.homeSample));
      if(schema===0&&options.homeSample) db.prepare('UPDATE planets SET sample_radius=?').run(HOME_SAMPLE_RADIUS);
      db.exec('PRAGMA user_version=14; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const history = historyStore(db);
  const ships = shipStore(db);
  const blueprints = blueprintStore(db);
  const homeSample=!!options.homeSample&&Number(db.prepare('SELECT enabled FROM home_sample_config WHERE id=1').get()?.enabled)===1;
  const planets = planetStore(db, blueprints, history, homeSample ? HOME_SAMPLE_RADIUS : undefined);
  const navigation=navigationStore(db,planets);
  const ground=groundStore(db,planets);
  const homes=homeStore(db,planets,blueprints,history,homeSample);
  const row = (id: string): Row => {
    const result = db.prepare('SELECT * FROM players WHERE id=?').get(id) as unknown as Row | undefined;
    if (!result) throw new RequestError(401, 'Your session has expired. Reload to start a new visit.');
    return result;
  };
  const state = (id: string): PlayerState => {
    row(id);const flight=navigation.flight(id);
    const location=homeSample?homes.location(id):undefined;
    const standing=flight.mode==='ground'&&location?.kind!=='interior'?ground.read(id):undefined;
    const r = row(id);
    return { ...(homeSample?{location,home:homes.descriptor(id)}:{}), worldRadius:planets.planet(r.planet_id).radius, environment:planets.planet(r.planet_id).environment??null, ship: ships.read(id), ...(standing?{ground:standing}:{}),character: r.character, quest: r.quest, position: JSON.parse(r.position), deliveries: r.deliveries, revision: r.revision, planetId: r.planet_id,flight:navigation.flight(id) };
  };
  const universe = (id: string) => { const player = state(id); return { player, planets: planets.list(id), ownedPlanetId: planets.owned(id), currentPlanet: planets.view(id, player.planetId) }; };
  return {
    db, state, universe, migrationBackup, homeSample,
    historyPage(id:string,planet:unknown,after?:unknown,limit?:unknown){row(id);return history.page(id,planet,after,limit);},
    historySnapshot(id:string,planet:unknown,sequence?:unknown){row(id);return {...history.snapshot(id,planet,sequence),radius:planets.planet(planet).radius};},
    saveShip(id: string, body: Record<string, unknown>) { row(id); ships.save(id, body); return state(id); },
    library(id: string) { row(id); return blueprints.list(id); },
    saveBlueprint(id: string, body: Record<string, unknown>) { row(id); return blueprints.save(id, body); },
    takeoff(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;if(navigation.flight(id).mode==='ground'&&!ground.read(id).grounded)throw new RequestError(409,'Land on your feet before boarding.');navigation.takeoff(id,clean,now);ground.reset(id);homes.movedExterior(id);return universe(id);},
    flight(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;navigation.checkpoint(id,clean,now);return state(id);},
    land(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;navigation.land(id,clean,now);homes.movedExterior(id);return universe(id);},
    has: (id: string) => Boolean(db.prepare('SELECT id FROM players WHERE id=?').get(id)),
    create(id: string, now = Date.now()) {
      if(homeSample)db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('INSERT INTO players (id,position,moved_at) VALUES (?,?,?)').run(id, JSON.stringify(SPAWN), now);
        if(homeSample){
          const available=planets.list(id).find(p=>p.kind==='garden'&&!p.claimed);
          if(!available)throw new RequestError(409,'No sample planet is available.');
          planets.claim(id,available.id);homes.initialise(available.id);const door=homes.door(available.id);
          if(!door)throw new RequestError(409,'The sample home could not be prepared.');
          db.prepare('UPDATE players SET planet_id=?,position=? WHERE id=?').run(available.id,JSON.stringify(door.position),id);
          homes.movedExterior(id);db.exec('COMMIT');
        }
      }catch(error){if(homeSample&&db.isTransaction)db.exec('ROLLBACK');throw error;}
      return state(id);
    },
    character(id: string, value: unknown) {
      if (!CHARACTERS.includes(value as Character)) throw new RequestError(400, 'Choose one of the three couriers.');
      row(id);
      db.prepare('UPDATE players SET character=?,revision=revision+1 WHERE id=?').run(value as string, id);
      return state(id);
    },
    move(id: string, value: unknown, now = Date.now(), expectedPlanet?: unknown,motion?:unknown,visitEpoch?:unknown) {
      homes.exterior(id,visitEpoch);
      if (!validPosition(value)) throw new RequestError(400, 'Position must be a finite point on the planet.');
      const r = row(id);
      if(navigation.flight(id).mode==='space')throw new RequestError(409,'Land before walking on the surface.');
      if ((expectedPlanet === undefined && r.planet_id !== 'hub') || (expectedPlanet !== undefined && expectedPlanet !== r.planet_id)) throw new RequestError(409, 'Your visit moved to another planet. Reconnecting…');
      ground.move(id,normalize(value),now,motion);return state(id);
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
      if (distance(JSON.parse(r.position), npc.position, HUB_RADIUS) > INTERACT_DISTANCE) throw new RequestError(409, `Walk closer to ${npc.name} first.`);
      db.prepare('UPDATE players SET quest=?,deliveries=?,revision=revision+1 WHERE id=?')
        .run(action === 'pickup' ? 'carrying' : 'delivered', action === 'pickup' ? 0 : 1, id);
      return state(id);
    },
    visit(id: string, planetId: unknown) {
      if(homeSample&&homes.location(id).kind==='interior')throw new RequestError(409,'Leave home before travelling.');
      const r = row(id), p = planets.planet(planetId);
      if (r.planet_id === p.id) return universe(id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO visits (player_id,planet_id,position) VALUES (?,?,?) ON CONFLICT(player_id,planet_id) DO UPDATE SET position=excluded.position').run(id, r.planet_id, r.position);
        const saved = db.prepare('SELECT position FROM visits WHERE player_id=? AND planet_id=?').get(id, p.id)?.position as string | undefined;
        db.prepare('UPDATE players SET planet_id=?,position=?,moved_at=?,revision=revision+1 WHERE id=?').run(p.id, saved ?? JSON.stringify(SPAWN), Date.now(), id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      homes.movedExterior(id);return universe(id);
    },
    terrain(id:string,body:Record<string,unknown>){row(id);homes.requireOutside(id);planets.terrain(id,body);return universe(id);},
    claim(id: string, planetId: unknown) { row(id); planets.claim(id, planetId); if(homeSample)homes.initialise(String(planetId)); return universe(id); },
    createObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.create(id, body); return universe(id); },
    updateObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.update(id, body); return universe(id); },
    removeObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.remove(id, body); return universe(id); },
    enterHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.enter(id,body,now);return universe(id);},
    moveHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.move(id,body,now);return state(id);},
    exitHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.exit(id,body,now);return universe(id);},
    saveHome(id:string,body:Record<string,unknown>){row(id);homes.save(id,body);return universe(id);},
    replaceObject(id:string,body:Record<string,unknown>){row(id);homes.requireOutside(id);planets.replace(id,body);return universe(id);},
    undoObject(id:string,body:Record<string,unknown>){row(id);homes.requireOutside(id);planets.undo(id,body);return universe(id);},
    remodelHome(id:string,body:Record<string,unknown>){
      row(id);homes.requireOutside(id);
      if(Object.keys(body).some(k=>!['buildingId','expectedVersion','variant'].includes(k)))throw new RequestError(400,'Unexpected home field.');
      if(!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<1)throw new RequestError(400,'Include the current home version.');
      db.exec('BEGIN IMMEDIATE');
      try{
        const h=homes.descriptor(id);
        if(!h||h.buildingId!==body.buildingId||!h.canEdit)throw new RequestError(403,'Only the home owner can remodel.');
        if(h.buildingVersion!==body.expectedVersion)throw new RequestError(409,'This home changed in another tab. Select it again.');
        const bp=homes.remodelBlueprint(body.variant),content=canonicalJson(hashInput(bp.parts)),hash=createHash('sha256').update(content).digest('hex');
        const library=blueprints.list(id);
        // A preset's id, name and groups are not placement identity. Never save
        // over a library document: its owner may have renamed or regrouped it.
        if(!library.some(entry=>entry.hash===hash)){
          if(library.length>=MAX_BLUEPRINTS)throw new RequestError(409,`Your library has room for ${MAX_BLUEPRINTS} blueprints.`);
          const fresh={...bp,id:randomUUID() as typeof bp.id};
          db.prepare('INSERT OR IGNORE INTO blueprint_contents(hash,content) VALUES(?,?)').run(hash,content);
          db.prepare('INSERT INTO blueprint_library(owner_id,id,document,hash,version) VALUES(?,?,?,?,1)').run(id,fresh.id,encodeBlueprint(fresh),hash);
        }
        planets.replace(id,{planetId:h.planetId,objectId:h.buildingId,expectedVersion:body.expectedVersion,blueprintHash:hash},String(body.variant));
        db.exec('COMMIT');
      }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
      return universe(id);
    },
    undoHome(id:string,body:Record<string,unknown>){row(id);homes.requireOutside(id);if(Object.keys(body).some(k=>!['buildingId','expectedVersion'].includes(k)))throw new RequestError(400,'Unexpected home field.');const h=homes.descriptor(id);if(!h||h.buildingId!==body.buildingId||!h.canEdit)throw new RequestError(403,'Only the home owner can remodel.');planets.undo(id,{planetId:h.planetId,objectId:h.buildingId,expectedVersion:body.expectedVersion});return universe(id);},
    close() { db.close(); },
  };
}
