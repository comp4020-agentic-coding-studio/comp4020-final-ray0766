import { createHash, randomUUID } from 'node:crypto';
import { encodeBlueprint, hashInput } from '../shared/blueprint-codec.ts';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { MAX_BLUEPRINTS } from '../shared/blueprints.ts';
import { homeStore, migrateHomes } from './home.ts';
import { HOME_SAMPLE_RADIUS } from '../shared/home.ts';
import { planetCenter, spaceDistance } from '../shared/flight.ts';
import { HUB_RADIUS } from '../shared/world-size.ts';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, distance, INTERACT_DISTANCE, NPCS, normalize, SPAWN, validPosition } from '../shared/world.ts';
import type { Character, PlayerState, Quest } from '../shared/world.ts';
import { historyStore, migrateHistory } from './history.ts';
import { shipStore } from './ships.ts';
import { groundStore } from './ground.ts';
import { blueprintStore } from './blueprints.ts';
import { planetStore } from './planets.ts';
import { RequestError } from './errors.ts';
import {migrateAppearances,appearanceStore} from './appearances.ts';
import {migrateTrips,tripStore} from './trips.ts';
import { navigationStore } from './navigation.ts';
import { homePathStore } from './home-paths.ts';
import { homeSetupStore } from './home-setup.ts';
import { INTEGRATED_RADIUS, migrateIntegrationSchema } from './integration-migration.ts';
import { migrateTeleport, teleportStore } from './teleport.ts';
import { BUSY } from './heavy-work.ts';
import {ArrivalHomes,ArrivalReservationChanged,migrateArrivalHomes,STORE_SCHEMA} from './arrival-homes.ts';
import type {ArrivalWork} from './arrival-homes.ts';
import type { GeneratedHomeManifest } from '../shared/home-generation.ts';
import type { Vec3 } from '../shared/world.ts';
export { RequestError } from './errors.ts';

interface Row { character: Character; quest: Quest; position: string; deliveries: number; revision: number; moved_at: number; planet_id: string }
export function openStore(path: string, options: { homeSample?: boolean; integratedWorld?: boolean } = {}) {
  // Probe with SQLite's read-only flag before mkdir, WAL pragmas or any migration.
  if(options.homeSample&&path!==':memory:'&&existsSync(path)){
    const probe=new DatabaseSync(path,{readOnly:true});let permitted:boolean;
    try{const table=probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='home_sample_config'").get();permitted=!!table&&Number(probe.prepare('SELECT enabled FROM home_sample_config WHERE id=1').get()?.enabled)===1;}finally{probe.close();}
    if(!permitted)throw new Error('HOME_SAMPLE refuses an existing non-sample database before migration. Use a new isolated path.');
  }
  if(options.integratedWorld&&path!==':memory:'&&existsSync(path)){
    const probe=new DatabaseSync(path,{readOnly:true});let ready:boolean;
    try{const table=probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get();ready=!!table&&Number(probe.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version)>=1;}finally{probe.close();}
    if(!ready)throw new Error('Existing main database requires an explicit backed-up integration migration before startup.');
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const schema = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if (schema > STORE_SCHEMA) { db.close(); throw new Error('Database schema is newer than this application.'); }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, character TEXT NOT NULL DEFAULT 'clay' CHECK(character IN ('clay','fern','sky')),
      quest TEXT NOT NULL DEFAULT 'available' CHECK(quest IN ('available','carrying','delivered')),
      position TEXT NOT NULL, deliveries INTEGER NOT NULL DEFAULT 0 CHECK(deliveries BETWEEN 0 AND 1),
      revision INTEGER NOT NULL DEFAULT 0, moved_at INTEGER NOT NULL
    );`);
  let migrationBackup: string | null = null;
  if (schema < STORE_SCHEMA) {
    if (schema > 0 && path !== ':memory:') {
      migrationBackup = `${path}.v${schema}-${new Date().toISOString().replace(/[:.]/g, '-')}.backup.sqlite`;
      // VACUUM INTO includes committed WAL data and produces a consistent restore point.
      db.prepare('VACUUM INTO ?').run(migrationBackup);chmodSync(migrationBackup,0o600);
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
      migrateIntegrationSchema(db);
      if(schema===0&&options.integratedWorld){
        db.prepare('INSERT INTO integration_config(id,version,radius) VALUES(1,1,?)').run(INTEGRATED_RADIUS);
        db.prepare('UPDATE planets SET world_radius=?').run(INTEGRATED_RADIUS);
      }
      migrateTeleport(db);
      migrateArrivalHomes(db);
      migrateTrips(db);
      migrateAppearances(db);
      db.exec('PRAGMA user_version=20; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const history = historyStore(db);
  const ships = shipStore(db);
  const blueprints = blueprintStore(db);
  const homeSample=!!options.homeSample&&Number(db.prepare('SELECT enabled FROM home_sample_config WHERE id=1').get()?.enabled)===1;
  const integratedWorld=Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;
  const homeEnabled=homeSample||integratedWorld;
  const planets = planetStore(db, blueprints, history, homeSample ? HOME_SAMPLE_RADIUS : undefined,integratedWorld?INTEGRATED_RADIUS:undefined);
  const navigation=navigationStore(db,planets);
  const trips=tripStore(db,planets,navigation);
  const ground=groundStore(db,planets);
  const homes=homeStore(db,planets,blueprints,history,homeEnabled);
  const homePaths=homePathStore(db,planets,homes,homeEnabled);
  const homeSetup=homeSetupStore(db,planets,blueprints,homes,homeEnabled);
  const teleport=teleportStore(db,planets,blueprints,homes,ground,homeEnabled);
  const appearances=appearanceStore(db);
  const row = (id: string): Row => {
    const result = db.prepare('SELECT * FROM players WHERE id=?').get(id) as unknown as Row | undefined;
    if (!result) throw new RequestError(401, 'Your session has expired. Reload to start a new visit.');
    return result;
  };
  const state = (id: string): PlayerState => {
    row(id);const flight=navigation.flight(id);
    const location=homeEnabled?homes.location(id):undefined;
    const standing=flight.mode==='ground'&&location?.kind!=='interior'?ground.read(id):undefined;
    const r = row(id),arrival=arrivalHomes.read(id);
    const appearance=appearances.read(id);
    return { appearanceRequired:appearances.required(id), ...(appearance?{appearance}:{}), trip:trips.read(id), ...(arrival?{arrival}:{}), ...(homeEnabled?{location,home:homes.descriptor(id)}:{}), worldRadius:planets.planet(r.planet_id).radius, environment:planets.planet(r.planet_id).environment??null, ship: ships.read(id), ...(standing?{ground:standing}:{}),character: r.character, quest: r.quest, position: JSON.parse(r.position), deliveries: r.deliveries, revision: r.revision, planetId: r.planet_id,flight:navigation.flight(id) };
  };
  // Set by the HTTP server: terrain, collision and siting work then runs on a worker thread.
  let heavy:ArrivalWork|null=null;
  // Fresh planets being prepared for a new player; nobody else is given them meanwhile.
  const reservedHomes=new Set<string>();
  /** Search for a home's station on the worker and place it here, re-checked. A search that no longer
   * fits the saved planet writes nothing, so the attempt stays open for a later visit. */
  // Station searches that failed, per home, in this run. The home stays complete without its station;
  // the attempt is retried on the owner's later visits, at most three times, never on this thread.
  const stationFailures=new Map<string,number>();
  async function prepareStation(work:ArrivalWork,planetId:string,except?:string){
    if((stationFailures.get(planetId)??0)>=3)return;
    const input=teleport.stationSearchInput(planetId,except);if(!input)return;
    let sites:{position:Vec3;rotation:number}[];
    try{sites=await work.run('station',`station:${planetId}:${input.revision}`,{planet:input.planet,occupants:input.occupants});}
    catch(error){stationFailures.set(planetId,(stationFailures.get(planetId)??0)+1);throw error;}
    if(teleport.ensureHomeStation(planetId,{revision:input.revision,occupants:input.occupants,sites},except))stationFailures.delete(planetId);
  }
  /** Build a planet's ground on the worker when this server has not, so arriving there reuses its fits.
   * The harbour is built at startup and stays in this thread. */
  async function prepareWorld(work:ArrivalWork,planetId:unknown){
    if(typeof planetId!=='string'||planetId==='hub'||!db.prepare('SELECT 1 FROM planets WHERE id=?').get(planetId)||ground.warm(planetId))return;
    // A 503 here leaves the traveller where they are, to try again; the ground is never built on this thread.
    await work.run('world',`world:${planetId}:${planets.planet(planetId).revision}`,{planet:planets.view('',planetId)});
  }
  const arrivalHomes=new ArrivalHomes(db,{
    owned:id=>planets.owned(id),
    ready:(id,planetId)=>planets.owned(id)===planetId&&!!homes.descriptor(id,planetId)&&teleport.sites(planetId).length>0,
    reserve:()=>planets.freshHomePlanet(reservedHomes),
    async prepare(id,planetId,work,active){
      // A manual choice wins over a background suggestion. Never claim a second home.
      const owned=planets.owned(id);if(owned&&owned!==planetId)return 'manual';
      let p=planets.planet(planetId);
      if(p.owner_id&&p.owner_id!==id)throw new ArrivalReservationChanged();
      if(!db.prepare('SELECT 1 FROM home_manifests WHERE planet_id=?').get(planetId)){
        const inputs=homes.generationInputs(planetId,id);
        if(!inputs)throw new ArrivalReservationChanged();
        const manifest=await work.run<GeneratedHomeManifest>('home',`arrival-home:${planetId}`,inputs);
        if(!active())return 'manual';
        db.exec('BEGIN IMMEDIATE');
        try{
          const current=homes.generationInputs(planetId,id);p=planets.planet(planetId);
          const chosen=planets.owned(id);
          if(chosen&&chosen!==planetId){db.exec('ROLLBACK');return 'manual';}
          if((p.owner_id&&p.owner_id!==id)||JSON.stringify(current)!==JSON.stringify(inputs)||
            db.prepare('SELECT 1 FROM players WHERE planet_id=?').get(planetId)||
            db.prepare('SELECT 1 FROM visits WHERE planet_id=?').get(planetId))throw new ArrivalReservationChanged();
          planets.claim(id,planetId);homes.initialise(planetId,{inputs,manifest});
          if(!homes.descriptor(id,planetId))throw new Error('The prepared home has no saved entrance.');
          db.exec('COMMIT');
        }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
      }
      if(!active())return 'manual';
      // The house may already be committed after an interrupted/failed station search.
      // Retrying only the station never recreates a home, blueprint or history event.
      if(!teleport.sites(planetId).length){
        db.prepare("DELETE FROM home_stations WHERE planet_id=? AND status='needs-site'").run(planetId);
        const input=teleport.stationSearchInput(planetId);
        if(input){
          const sites=await work.run<{position:Vec3;rotation:number}[]>('station',`station:${planetId}:${input.revision}`,{planet:input.planet,occupants:input.occupants});
          if(!active())return 'manual';
          teleport.ensureHomeStation(planetId,{revision:input.revision,occupants:input.occupants,sites});
        }
      }
      if(!active())return 'manual';
      if(!homes.descriptor(id,planetId)||!teleport.sites(planetId).length)throw new Error('The home station must be prepared before arrival is ready.');
      return 'ready';
    },
  });
  const universe = (id: string) => {
    // A home from before teleport stations gets its one placement attempt while its owner stands there.
    const owned=homeEnabled?planets.owned(id):null;
    if(owned&&row(id).planet_id===owned&&navigation.flight(id).mode==='ground'&&homes.location(id).kind!=='interior'){
      if(heavy)void prepareStation(heavy,owned).catch(error=>console.error('Station preparation deferred:',error instanceof Error?error.message:error));
      else teleport.ensureHomeStation(owned);
    }
    const player = state(id); return { player, planets: planets.list(id), ownedPlanetId: planets.owned(id), currentPlanet: planets.view(id, player.planetId) };
  };
  return {
    db, state, universe, migrationBackup, homeSample, integratedWorld,
    requireAppearance:(id:string)=>appearances.requireComplete(id),
    startTrip(id:string,body:Record<string,unknown>,now=Date.now()){
      const clean={...body};delete clean.visitEpoch;
      const prior=trips.read(id);
      if(prior?.requestId!==body.requestId){homes.exterior(id,body.visitEpoch);if(navigation.flight(id).mode==='ground'&&!ground.read(id).grounded)throw new RequestError(409,'Land on your feet before boarding.');}
      trips.start(id,clean,now);if(prior?.requestId!==body.requestId){ground.reset(id);homes.movedExterior(id);}return universe(id);
    },
    changeTrip(id:string,body:Record<string,unknown>){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;trips.change(id,clean);return universe(id);},
    async finishTrip(id:string,body:Record<string,unknown>,now=Date.now()){
      const clean={...body};delete clean.visitEpoch;const trip=trips.current(id,clean);
      if(trip.status==='arrived')return universe(id);
      homes.exterior(id,body.visitEpoch);
      if(heavy)await prepareWorld(heavy,trip.targetId);else ground.world(trip.targetId);
      // Recheck the exact trip revision after asynchronous work. A retarget wins over stale completion.
      trips.finish(id,clean,now);homes.movedExterior(id);return universe(id);
    },
    renamePlanet(id:string,body:Record<string,unknown>){planets.rename(id,body);return universe(id);},
    teleport(id:string,body:Record<string,unknown>,now=Date.now()){teleport.teleport(id,body,now);return universe(id);},
    previewStation(id:string,body:Record<string,unknown>){return teleport.preview(id,body);},
    confirmStation(id:string,body:Record<string,unknown>){teleport.confirm(id,body);return universe(id);},
    previewHomeSetup(id:string,body:Record<string,unknown>){row(id);return homeSetup.preview(id,body);},
    confirmHomeSetup(id:string,body:Record<string,unknown>){row(id);homeSetup.confirm(id,body);return universe(id);},
    previewHomePaths(id:string,body:Record<string,unknown>){row(id);return homePaths.preview(id,body);},
    applyHomePaths(id:string,body:Record<string,unknown>){row(id);homePaths.apply(id,body);return universe(id);},
    historyPage(id:string,planet:unknown,after?:unknown,limit?:unknown){row(id);return history.page(id,planet,after,limit);},
    historySnapshot(id:string,planet:unknown,sequence?:unknown){row(id);const snap=history.snapshot(id,planet,sequence),seq=JSON.parse(snap.document).seq;const epoch=db.prepare('SELECT radius FROM planet_radius_epochs WHERE planet_id=? AND from_sequence<=? ORDER BY from_sequence DESC LIMIT 1').get(String(planet),seq);return {...snap,radius:epoch?Number(epoch.radius):planets.planet(planet).radius};},
    saveShip(id: string, body: Record<string, unknown>) { row(id); ships.save(id, body); return state(id); },
    library(id: string) { row(id); return blueprints.list(id); },
    saveBlueprint(id: string, body: Record<string, unknown>) { row(id); return blueprints.save(id, body); },
    takeoff(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;if(navigation.flight(id).mode==='ground'&&!ground.read(id).grounded)throw new RequestError(409,'Land on your feet before boarding.');navigation.takeoff(id,clean,now);ground.reset(id);homes.movedExterior(id);return universe(id);},
    flight(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;navigation.checkpoint(id,clean,now);return state(id);},
    land(id:string,body:Record<string,unknown>,now=Date.now()){homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;navigation.land(id,clean,now);homes.movedExterior(id);return universe(id);},
    has: (id: string) => Boolean(db.prepare('SELECT id FROM players WHERE id=?').get(id)),
    /** Establish identity and Hub spawn before any expensive home generation. */
    createArrival(id:string,now=Date.now()){
      if(this.has(id))return state(id);
      if(!integratedWorld)return this.create(id,now);
      db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('INSERT INTO players(id,position,moved_at) VALUES(?,?,?)').run(id,JSON.stringify(SPAWN),now);
        arrivalHomes.enroll(id,now);appearances.enroll(id);db.exec('COMMIT');
      }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
      return state(id);
    },
    retryArrivalHome(id:string,body:Record<string,unknown>={}){
      row(id);if(Object.keys(body).length)throw new RequestError(400,'Unexpected arrival field.');
      arrivalHomes.retry(id);return state(id);
    },
    create(id: string, now = Date.now()) {
      if(homeEnabled)db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('INSERT INTO players (id,position,moved_at) VALUES (?,?,?)').run(id, JSON.stringify(SPAWN), now);
        if(homeEnabled){
          const available={id:planets.freshHomePlanet()};
          planets.claim(id,available.id);homes.initialise(available.id);teleport.ensureHomeStation(available.id);const door=homes.door(available.id);
          if(!door)throw new RequestError(409,'The sample home could not be prepared.');
          db.prepare('UPDATE players SET planet_id=?,position=? WHERE id=?').run(available.id,JSON.stringify(door.position),id);
          homes.movedExterior(id);db.exec('COMMIT');
        }
      }catch(error){if(homeEnabled&&db.isTransaction)db.exec('ROLLBACK');throw error;}
      return state(id);
    },
    /** The same arrival as `create`, with the home layout and its station search run on the worker so other
     * players are answered meanwhile. Every write still happens here, after re-checking what was read: the
     * home, its owner and the new player's place at the door in one transaction, then the station. */
    async createPrepared(id: string, now = Date.now(), attempt = 0): Promise<PlayerState> {
      const work=heavy;if(!homeEnabled||!work)return this.create(id,now);
      const planetId=planets.freshHomePlanet(reservedHomes);reservedHomes.add(planetId);
      try{
        const inputs=homes.generationInputs(planetId,id);
        // Never generated on this thread: a 503 asks the player to retry, and nothing has been written yet.
        const manifest=inputs?await work.run<GeneratedHomeManifest>('home',`home:${planetId}`,inputs):undefined;
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare('INSERT INTO players (id,position,moved_at) VALUES (?,?,?)').run(id, JSON.stringify(SPAWN), now);
          planets.claim(id,planetId);homes.initialise(planetId,inputs&&manifest?{inputs,manifest}:undefined);
          const door=homes.door(planetId);
          if(!door)throw new RequestError(409,'The sample home could not be prepared.');
          db.prepare('UPDATE players SET planet_id=?,position=? WHERE id=?').run(planetId,JSON.stringify(door.position),id);
          homes.movedExterior(id);db.exec('COMMIT');
        }catch(error){
          if(db.isTransaction)db.exec('ROLLBACK');
          // Rare: the reserved planet was claimed meanwhile. Prepare another one, twice at most.
          if(error instanceof RequestError&&error.status===409&&!this.has(id)){
            if(attempt<2)return this.createPrepared(id,now,attempt+1);
            throw new RequestError(503,BUSY);
          }
          throw error;
        }
      }finally{reservedHomes.delete(planetId);}
      // `create` sites the station before the player stands there; the search leaves them out to match.
      // The home is already complete: if the search cannot run now, the station follows on a later visit.
      try{await prepareStation(work,planetId,id);}catch(error){console.error('Station preparation deferred:',error instanceof Error?error.message:error);}
      return state(id);
    },
    useHeavyWork(work:ArrivalWork|null){heavy=work;arrivalHomes.use(work);},
    /** Before a teleport: the destination is the player's own home or the harbour (the server re-checks). */
    async prepareTeleport(id:string,body:Record<string,unknown>){const work=heavy,r=db.prepare('SELECT planet_id FROM players WHERE id=?').get(id);if(!work||!r)return;const target=body.planetId;if(typeof target!=='string'||target===r.planet_id||(target!=='hub'&&target!==planets.owned(id)))return;await prepareWorld(work,target);},
    /** Before a landing: only a planet this flight can actually land on is prepared, after the same checks. */
    async prepareLanding(id:string,body:Record<string,unknown>){if(!heavy)return;homes.exterior(id,body.visitEpoch);const clean={...body};delete clean.visitEpoch;const target=navigation.landingTarget(id,clean);if(target)await prepareWorld(heavy,target);},
    /** Build a planet's ground now, before anyone is waiting (the harbour at startup). */
    warmGround(planetId:string){ground.world(planetId);},
    character(id: string, value: unknown) {
      if (!CHARACTERS.includes(value as Character)) throw new RequestError(400, 'Choose one of the three couriers.');
      row(id);
      appearances.coat(id,value as Character);
      return state(id);
    },
    appearance(id:string,body:Record<string,unknown>){row(id);appearances.save(id,body);return state(id);},
    move(id: string, value: unknown, now = Date.now(), expectedPlanet?: unknown,motion?:unknown,visitEpoch?:unknown) {
      homes.exterior(id,visitEpoch);
      if (!validPosition(value)) throw new RequestError(400, 'Position must be a finite point on the planet.');
      const r = row(id);
      if(navigation.flight(id).mode==='space')throw new RequestError(409,'Land before walking on the surface.');
      if ((expectedPlanet === undefined && r.planet_id !== 'hub') || (expectedPlanet !== undefined && expectedPlanet !== r.planet_id)) throw new RequestError(409, 'Your visit moved to another planet. Reconnecting…');
      ground.move(id,normalize(value),now,motion);return state(id);
    },
    recoverGround(id:string,body:Record<string,unknown>,now=Date.now()){
      if(Object.keys(body).some(k=>!['planetId','visitEpoch','sequence'].includes(k)))throw new RequestError(400,'Unexpected recovery field.');
      homes.exterior(id,body.visitEpoch);const r=row(id);
      if(navigation.flight(id).mode!=='ground')throw new RequestError(409,'Land before returning to safe ground.');
      if(body.planetId!==r.planet_id)throw new RequestError(409,'Your visit moved to another planet. Reconnecting…');
      ground.recoverToPort(id,body.sequence,now);homes.movedExterior(id);return universe(id);
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
      if (distance(JSON.parse(r.position), npc.position, planets.planet(r.planet_id).radius) > INTERACT_DISTANCE) throw new RequestError(409, `Walk closer to ${npc.name} first.`);
      db.prepare('UPDATE players SET quest=?,deliveries=?,revision=revision+1 WHERE id=?')
        .run(action === 'pickup' ? 'carrying' : 'delivered', action === 'pickup' ? 0 : 1, id);
      return state(id);
    },
    visit(id: string, planetId: unknown) {
      if(homeEnabled&&homes.location(id).kind==='interior')throw new RequestError(409,'Leave home before travelling.');
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
    claim(id: string, planetId: unknown) { row(id); planets.claim(id, planetId); if(homeSample){homes.initialise(String(planetId));teleport.ensureHomeStation(String(planetId));} return universe(id); },
    createObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.create(id, body); return universe(id); },
    updateObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.update(id, body); return universe(id); },
    removeObject(id: string, body: Record<string, unknown>) { row(id); homes.requireOutside(id); planets.remove(id, body); return universe(id); },
    enterHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.enter(id,body,now);return universe(id);},
    moveHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.move(id,body,now);return state(id);},
    exitHome(id:string,body:Record<string,unknown>,now=Date.now()){row(id);homes.exit(id,body,now);return universe(id);},
    setHomeDoor(id:string,body:Record<string,unknown>){row(id);homes.setDoor(id,body);return universe(id);},
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
        const bp=homes.remodelBlueprint(body.variant,h.planetId);
        const bound=Number(db.prepare('SELECT door_part FROM home_interiors WHERE building_id=?').get(h.buildingId)!.door_part);
        if(bound!==1){const collision=bp.parts.find(part=>part.n===bound);if(collision)collision.n=Math.max(...bp.parts.map(part=>part.n),bound)+1;bp.parts.find(part=>part.n===1)!.n=bound;}
        const content=canonicalJson(hashInput(bp.parts)),hash=createHash('sha256').update(content).digest('hex');
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
    close() { arrivalHomes.close();db.close(); },
  };
}
