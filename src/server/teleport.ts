import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Quaternion, Vector3 } from 'three';
import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import { UUID_PATTERN } from '../assets/claude-geometry/core/ids.ts';
import { encodeBlueprint } from '../shared/blueprint-codec.ts';
import type { Blueprint } from '../shared/blueprint-model.ts';
import { MAX_BLUEPRINTS, MAX_STRUCTURES, structureFit, structureSize } from '../shared/blueprints.ts';
import { heading, yawFacing } from '../shared/planet-plan/sphere.ts';
import { TELEPORT_STATION } from '../shared/planet-plan/compositions.ts';
import { MAX_OBJECTS, placementProblem } from '../shared/planets.ts';
import type { PlanetView } from '../shared/planets.ts';
import { portPoint } from '../shared/ports.ts';
import { STATION_REACH, stationSites } from '../shared/teleport.ts';
import type { TeleportStationPreview } from '../shared/teleport.ts';
import { fieldOf, objectSeat } from '../shared/terrain.ts';
import { distance, SPAWN } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import type { blueprintStore } from './blueprints.ts';
import { RequestError } from './errors.ts';
import { STATION_CONTENT, STATION_HASH } from './station-blueprint.ts';
import type { groundStore } from './ground.ts';
import type { homeStore } from './home.ts';
import type { planetStore } from './planets.ts';


/** Schema 16. Stations link only a player's own home and the public harbour.
 * `teleport_marks` stays for databases that already reached schema 16 with
 * landing marks; nothing writes or reads it any more, and its rows are kept. */
export function migrateTeleport(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS teleport_marks (
      player_id TEXT NOT NULL REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id),
      source TEXT NOT NULL CHECK(source IN ('landing','history')), marked_at INTEGER NOT NULL,
      PRIMARY KEY(player_id,planet_id));
    CREATE TABLE IF NOT EXISTS teleport_requests (
      player_id TEXT PRIMARY KEY REFERENCES players(id), request_id TEXT NOT NULL, planet_id TEXT NOT NULL REFERENCES planets(id), at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS home_stations (
      planet_id TEXT PRIMARY KEY REFERENCES planets(id), status TEXT NOT NULL CHECK(status IN ('placed','needs-site')),
      object_id TEXT, reason TEXT, at INTEGER NOT NULL);`);
}

/** Ground point under the parked craft that hovers beside a garden's landing pad (client scene.ts). */
function craftGround(radius: number): Vec3 {
  const up = new Vector3(...SPAWN), q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up);
  return up.multiplyScalar(radius).add(new Vector3(radius > 20 ? 3.1 : 0, 0, radius > 20 ? 3.2 : -2.2).applyQuaternion(q)).normalize().toArray() as Vec3;
}
/** Deterministic candidates: rings round the landing pad first, then the whole sphere. */
function* candidates(radius: number): Generator<Vec3> {
  for (const reach of [4.5, 6, 7.5, 9, 11, 13.5]) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    yield localToDir({ dir: SPAWN, yaw: 0 }, radius, [Math.sin(angle) * reach, 0, Math.cos(angle) * reach]);
  }
  const count = 96, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count, ring = Math.sqrt(1 - y * y), angle = i * golden;
    yield [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
  }
}
const turn = (yaw: number) => ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

export function teleportStore(db: DatabaseSync, planets: ReturnType<typeof planetStore>, blueprints: ReturnType<typeof blueprintStore>, homes: ReturnType<typeof homeStore>, ground: ReturnType<typeof groundStore>, homeEnabled: boolean) {
  const transaction = <T>(work: () => T): T => {
    if (db.isTransaction) return work();
    db.exec('BEGIN IMMEDIATE');
    try { const value = work(); db.exec('COMMIT'); return value; }
    catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  };
  const sites = (planetId: string) => stationSites(planets.view('', planetId));

  /** Up to `limit` free sites on a home, never over saved objects, saved bodies, the pad or the craft above it. */
  function siteSearch(planet: PlanetView, limit: number) {
    const radius = planet.radius!, parts = TELEPORT_STATION.blueprint.parts, size = structureSize(parts), field = fieldOf(planet.environment, radius), craft = craftGround(radius);
    const occupants = db.prepare('SELECT id,position,flight FROM players WHERE planet_id=?').all(planet.id).filter(row => {
      if (JSON.parse(String(row.flight ?? '{"mode":"ground"}')).mode !== 'ground') return false;
      const location = db.prepare('SELECT document FROM home_locations WHERE player_id=?').get(row.id);
      return !location || JSON.parse(String(location.document)).kind !== 'interior';
    }).map(row => JSON.parse(String(row.position)) as Vec3);
    const contents = { ...planet.blueprints, [STATION_HASH]: parts }, found: { position: Vec3; rotation: number }[] = [];
    for (const position of candidates(radius)) {
      if (found.some(f => distance(f.position, position, radius) < 4)) continue;
      if (occupants.some(point => distance(point, position, radius) < size.radius + .4)) continue;
      // The parked craft hovers about 3.4 m up; keep its hull (≈2.9 m half-length for the default design) off the gate.
      if (distance(position, craft, radius) < size.radius + 3.6) continue;
      if (field.waterLevel !== null && field.heightAt(position) < field.waterLevel) continue;
      // Face the forecourt toward the landing pad first, then the other quarter turns.
      const facing = turn(yawFacing(position as never, heading(position as never, SPAWN as never)));
      for (const rotation of [0, 1, 2, 3].map(k => turn(facing + k * Math.PI / 2))) {
        if (placementProblem('structure', position, planet.objects, undefined, size.radius, radius, 2, { rotation, blueprintHash: STATION_HASH, blueprints: contents, field, terrainSeating: !!planet.environment })) continue;
        if (planet.environment && objectSeat(field, { id: 'station-preview', kind: 'structure', position, rotation, version: 1, assetVersion: 2, blueprintHash: STATION_HASH, ...size }, { [STATION_HASH]: parts }).problem) continue;
        if (structureFit(parts, position, rotation, field).problem) continue;
        found.push({ position, rotation }); break;
      }
      if (found.length >= limit) break;
    }
    return found;
  }
  function capacityProblem(planet: PlanetView) {
    if (planet.objects.length >= MAX_OBJECTS) return `This planet already has ${MAX_OBJECTS} objects. Remove one to make room for the teleport station.`;
    if (planet.objects.filter(o => o.kind === 'structure').length >= MAX_STRUCTURES) return `This planet already has ${MAX_STRUCTURES} structures. Remove one to make room for the teleport station.`;
    return null;
  }
  /** Place the shared station as an ordinary owner object, through the normal create path. */
  function place(owner: string, planetId: string, site: { position: Vec3; rotation: number }) {
    db.prepare('INSERT OR IGNORE INTO blueprint_contents(hash,content) VALUES(?,?)').run(STATION_HASH, STATION_CONTENT);
    const library = blueprints.list(owner);
    // Shown in the owner's workshop when there is room; never overwrites a library entry.
    if (!library.some(entry => entry.hash === STATION_HASH) && library.length < MAX_BLUEPRINTS) {
      const bp: Blueprint = { ...structuredClone(TELEPORT_STATION.blueprint), id: randomUUID() as Blueprint['id'], name: 'Teleport station' };
      db.prepare('INSERT INTO blueprint_library(owner_id,id,document,hash,version) VALUES(?,?,?,?,1)').run(owner, bp.id, encodeBlueprint(bp), STATION_HASH);
    }
    const objectId = randomUUID();
    planets.create(owner, { planetId, objectId, kind: 'structure', position: site.position, rotation: site.rotation, blueprintHash: STATION_HASH });
    db.prepare("INSERT INTO home_stations(planet_id,status,object_id,reason,at) VALUES(?,'placed',?,NULL,?) ON CONFLICT(planet_id) DO UPDATE SET status='placed',object_id=excluded.object_id,reason=NULL,at=excluded.at").run(planetId, objectId, Date.now());
    db.prepare('UPDATE players SET revision=revision+1 WHERE planet_id=?').run(planetId);
    return objectId;
  }
  /** One automatic attempt per home (at creation, or when its owner is first home after this update),
   * recorded in a receipt so a dismantled station is never rebuilt behind its owner. */
  function ensureHomeStation(planetId: string) {
    if (!homeEnabled || db.prepare('SELECT 1 FROM home_stations WHERE planet_id=?').get(planetId)) return;
    const row = db.prepare("SELECT owner_id FROM planets WHERE id=? AND kind='garden'").get(planetId);
    if (!row?.owner_id) return;
    transaction(() => {
      const planet = planets.view(String(row.owner_id), planetId);
      if (stationSites(planet).length) { db.prepare("INSERT INTO home_stations(planet_id,status,object_id,reason,at) VALUES(?,'placed',NULL,'An existing structure already has a teleport gate.',?)").run(planetId, Date.now()); return; }
      const problem = capacityProblem(planet), site = problem ? undefined : siteSearch(planet, 1)[0];
      if (!site) { db.prepare("INSERT INTO home_stations(planet_id,status,object_id,reason,at) VALUES(?,'needs-site',NULL,?,?)").run(planetId, problem ?? 'No free, level ground fits the station without touching saved buildings.', Date.now()); return; }
      place(String(row.owner_id), planetId, site);
    });
  }
  function ownerPlanet(id: string, planetId: unknown) {
    if (!homeEnabled) throw new RequestError(404, 'Teleport stations on homes are unavailable here.');
    if (typeof planetId !== 'string') throw new RequestError(400, 'Choose your home planet.');
    const planet = planets.view(id, planetId);
    if (!planet.mine || planet.kind !== 'garden') throw new RequestError(403, 'Only this planet’s owner can place its teleport station.');
    const player = db.prepare('SELECT planet_id,flight FROM players WHERE id=?').get(id);
    if (!player || player.planet_id !== planetId || JSON.parse(String(player.flight ?? '{"mode":"ground"}')).mode !== 'ground') throw new RequestError(409, 'Land on your home planet first.');
    homes.requireOutside(id);
    return planet;
  }
  function preview(id: string, planetId: unknown): TeleportStationPreview {
    const planet = ownerPlanet(id, planetId);
    const existing = stationSites(planet).length > 0, problem = existing ? 'Your home already has a teleport station.' : capacityProblem(planet);
    const found = problem ? [] : siteSearch(planet, 3);
    const reason = problem ?? (found.length ? undefined : 'No free, level ground fits the station. Move or remove a building, or reshape the terrain, then search again.');
    const result = { planetId: planet.id, expectedRevision: planet.revision, sites: found, blueprintHash: STATION_HASH, blueprint: TELEPORT_STATION.blueprint.parts, ...(reason ? { reason } : {}) };
    return { ...result, hash: createHash('sha256').update(JSON.stringify([1, result, planet.environment, planet.objects])).digest('hex') };
  }

  return {
    sites, ensureHomeStation,
    preview(id: string, body: Record<string, unknown>) {
      if (Object.keys(body).some(k => k !== 'planetId')) throw new RequestError(400, 'Unexpected station field.');
      return preview(id, body.planetId);
    },
    confirm(id: string, body: Record<string, unknown>) {
      if (Object.keys(body).some(k => !['planetId', 'expectedRevision', 'hash', 'visitEpoch', 'site'].includes(k))) throw new RequestError(400, 'Unexpected station field.');
      if (!Number.isSafeInteger(body.expectedRevision) || typeof body.hash !== 'string' || !Number.isSafeInteger(body.site)) throw new RequestError(400, 'Include the current station preview.');
      transaction(() => {
        const plan = preview(id, body.planetId);
        homes.exterior(id, body.visitEpoch);
        if (plan.expectedRevision !== body.expectedRevision || plan.hash !== body.hash) throw new RequestError(409, 'Your planet changed. Search for a station site again.');
        const site = plan.sites[Number(body.site)];
        if (!site) throw new RequestError(409, plan.reason ?? 'Choose one of the previewed sites.');
        place(id, plan.planetId, site);
      });
    },
    /** Your home's gate goes to the harbour; the harbour's gate goes back to your home. Nothing else. */
    teleport(id: string, body: Record<string, unknown>, now = Date.now()) {
      if (Object.keys(body).some(k => !['planetId', 'requestId', 'visitEpoch'].includes(k))) throw new RequestError(400, 'Unexpected teleport field.');
      if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) throw new RequestError(400, 'Include a teleport request identifier.');
      const player = db.prepare('SELECT planet_id,position,flight FROM players WHERE id=?').get(id);
      if (!player) throw new RequestError(401, 'Your visit expired.');
      // A repeated click or network retry of an acknowledged request travels once.
      const last = db.prepare('SELECT request_id,planet_id FROM teleport_requests WHERE player_id=?').get(id);
      if (last?.request_id === body.requestId) {
        if (last.planet_id === player.planet_id) return;
        throw new RequestError(409, 'This teleport was already used. Use the station again.');
      }
      homes.exterior(id, body.visitEpoch);
      if (JSON.parse(String(player.flight ?? '{"mode":"ground"}')).mode !== 'ground') throw new RequestError(409, 'Land before using a teleport station.');
      const here = String(player.planet_id), position = JSON.parse(String(player.position)) as Vec3, radius = planets.planet(here).radius;
      if (!ground.read(id).grounded || !sites(here).some(site => distance(position, site.interact, radius) <= STATION_REACH)) throw new RequestError(409, 'Walk up to a teleport station first.');
      // The destination comes from server identity: a visitor's gate, or a submitted
      // third planet, never moves anyone.
      const home = planets.owned(id);
      if (here !== 'hub' && here !== home) throw new RequestError(403, 'This teleport station belongs to another home. Only its owner can use it.');
      if (!home) throw new RequestError(409, 'You have no home planet to return to yet.');
      if (body.planetId !== (here === 'hub' ? home : 'hub')) throw new RequestError(403, 'Teleport stations only link your own home and the main planet.');
      const target = planets.planet(body.planetId);
      // Arrive beside the destination's station, or at its landing pad if the home has none yet.
      const station = sites(target.id)[0];
      const world = ground.world(target.id), start = world.pose(station?.arrival ?? portPoint(target.id)), safe = world.recover(start);
      transaction(() => {
        db.prepare('INSERT INTO visits (player_id,planet_id,position) VALUES (?,?,?) ON CONFLICT(player_id,planet_id) DO UPDATE SET position=excluded.position').run(id, here, String(player.position));
        db.prepare('UPDATE players SET planet_id=?,position=?,moved_at=?,revision=revision+1 WHERE id=?').run(target.id, JSON.stringify(safe.position), now, id);
        db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);
        db.prepare('INSERT INTO teleport_requests(player_id,request_id,planet_id,at) VALUES(?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET request_id=excluded.request_id,planet_id=excluded.planet_id,at=excluded.at').run(id, body.requestId as string, target.id, now);
        homes.movedExterior(id);
      });
    },
  };
}
