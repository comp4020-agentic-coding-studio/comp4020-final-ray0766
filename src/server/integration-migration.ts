import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { anchorQuaternion, localToPlanet } from '../assets/claude-geometry/core/anchor.ts';
import { normalize, quatConjugate, quatRotate, scale, sub } from '../assets/claude-geometry/core/vec.ts';
import type { Vec3 } from '../shared/world.ts';
import type { PlacedObject } from '../shared/planets.ts';
import { structureFit, structureSize } from '../shared/blueprints.ts';
import { objectSeat } from '../shared/terrain.ts';
import { GroundWorld, physicsVersionFor } from '../shared/physics/world.ts';
import type { GroundPose } from '../shared/physics/world.ts';
import { planetCenter, spaceDistance } from '../shared/flight.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { normalizeHomeInterior } from '../shared/home.ts';
import { SAMPLE_PUBLIC_VERSION } from '../shared/sample-public-village.ts';

export const INTEGRATED_RADIUS = 21.6;
export function migrateIntegrationSchema(db: DatabaseSync) {
  if (!db.prepare('PRAGMA table_info(planets)').all().some(c => c.name === 'world_radius')) db.exec('ALTER TABLE planets ADD COLUMN world_radius REAL CHECK(world_radius IS NULL OR world_radius>0)');
  if (!db.prepare('PRAGMA table_info(home_interiors)').all().some(c => c.name === 'door_part')) db.exec('ALTER TABLE home_interiors ADD COLUMN door_part INTEGER NOT NULL DEFAULT 1');
  db.exec(`CREATE TABLE IF NOT EXISTS integration_config (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, radius REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS planet_radius_epochs (planet_id TEXT NOT NULL REFERENCES planets(id), from_sequence INTEGER NOT NULL CHECK(from_sequence>=0), radius REAL NOT NULL, PRIMARY KEY(planet_id,from_sequence));
    CREATE TABLE IF NOT EXISTS integration_migrations (version INTEGER PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)));`);
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function integrationTableDigest(db: DatabaseSync) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => {
    const name = String(row.name), rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all();
    return [name, { count: rows.length, sha256: digest(rows) }];
  }));
}
interface MigratedPose { playerId: string; planetId: string; pose: GroundPose; sequence: number; sceneRevision: number }
interface Risk { kind: string; planet: string; subject?: string }
const privateId = (id: string) => digest(id).slice(0, 16);

/** A read-only plan. It includes no names, library labels or plain identity in its public report. */
export function previewIntegration(db: DatabaseSync) {
  const alreadyApplied = Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version ?? 0) >= 1;
  const planets = db.prepare('SELECT * FROM planets ORDER BY rowid').all();
  const contents = Object.fromEntries(db.prepare('SELECT hash,content FROM blueprint_contents').all().map(row => [String(row.hash), JSON.parse(String(row.content)).parts as PartPlacement[]]));
  const rows = db.prepare('SELECT o.*,(SELECT asset_version FROM object_assets a WHERE a.object_id=o.id) AS asset_version FROM planet_objects o ORDER BY o.rowid').all();
  const risks: Risk[] = [], poses: MigratedPose[] = [];
  const changes: { id: string; radius: number; revision: number; sequence: number }[] = [];
  let structurePoses = 0, terrainPoses = 0, unsavedPoses = 0, spaceFlights = 0;
  const worlds = new Map<string, { old: GroundWorld; next: GroundWorld; objects: PlacedObject[] }>();
  for (const planet of planets) {
    const id = String(planet.id), radius = Number(planet.world_radius ?? planet.sample_radius ?? planet.radius);
    const objects: PlacedObject[] = rows.filter(row => row.planet_id === id).map(row => ({ id: String(row.id), kind: row.kind as PlacedObject['kind'], position: JSON.parse(String(row.position)), rotation: Number(row.rotation), version: Number(row.version), ...(row.blueprint_hash ? { blueprintHash: String(row.blueprint_hash), ...structureSize(contents[String(row.blueprint_hash)]) } : {}), ...(row.asset_version === 2 ? { assetVersion: 2 as const } : {}) }));
    const home=db.prepare('SELECT building_id,door_part,document FROM home_interiors WHERE planet_id=?').get(id),room=home?normalizeHomeInterior(JSON.parse(String(home.document))):null;
    const base = { id, revision: Number(planet.revision), objects, blueprints: contents, environment: planet.environment as string | null, ...(home&&room?{homeDoor:{buildingId:String(home.building_id),partNumber:Number(home.door_part),open:room.doorOpen,version:room.doorVersion}}:{}) };
    const old = new GroundWorld({ ...base, radius }), next = new GroundWorld({ ...base, radius: INTEGRATED_RADIUS });
    worlds.set(id, { old, next, objects });
    const seq = Number(db.prepare('SELECT seq FROM history_heads WHERE planet_id=?').get(id)?.seq ?? 0);
    changes.push({ id, radius, revision: base.revision + (alreadyApplied ? 0 : 1), sequence: seq });
    if (alreadyApplied) continue;
    for (const object of objects) {
      const fit = object.kind === 'structure' ? structureFit(contents[object.blueprintHash!], object.position, object.rotation, next.field) : objectSeat(next.field, object, contents);
      if (fit.problem) risks.push({ kind: `object-${fit.problem}`, planet: privateId(id), subject: privateId(object.id) });
    }
  }
  if (!alreadyApplied) for (const player of db.prepare('SELECT * FROM players ORDER BY rowid').all()) {
    const id = String(player.id), planetId = String(player.planet_id), flight = JSON.parse(String(player.flight ?? '{"mode":"ground"}'));
    if (flight.mode === 'space') {
      spaceFlights++;
      for (const planet of planets) if (spaceDistance(flight.position, planetCenter(Number(planet.slot))) < INTEGRATED_RADIUS + 3.2 + (planet.environment || planet.kind === 'hub' ? 1.75 : 0)) risks.push({ kind: 'flight-clearance', planet: privateId(String(planet.id)), subject: privateId(id) });
      continue;
    }
    const location = db.prepare('SELECT document FROM home_locations WHERE player_id=?').get(id);
    if (location && JSON.parse(String(location.document)).kind === 'interior') continue;
    const world = worlds.get(planetId)!;
    const saved = db.prepare('SELECT * FROM ground_states WHERE player_id=?').get(id);
    const validSaved = saved && saved.planet_id === planetId && saved.position === player.position;
    const position = JSON.parse(String(player.position)) as Vec3;
    if (!validSaved) {
      unsavedPoses++;
      const pose = world.next.pose(position);
      if (world.next.blocked(pose)) risks.push({ kind: 'unsaved-player-collision', planet: privateId(planetId), subject: privateId(id) });
      if (world.next.field.waterLevel !== null && world.next.field.heightAt(position) < world.next.field.waterLevel + .02) risks.push({ kind: 'player-underwater', planet: privateId(planetId), subject: privateId(id) });
      continue;
    }
    const oldPose: GroundPose = { position, radius: Number(saved.radius), grounded: !!saved.grounded, verticalSpeed: Number(saved.vertical_speed), jumpHeld: !!saved.jump_held };
    const support = world.old.support(position, oldPose.radius + .26);
    let pose: GroundPose = { ...oldPose, radius: oldPose.radius + world.next.radius(position) - world.old.radius(position) };
    const object = world.objects.find(object => object.id === support.objectId && object.kind === 'structure');
    if (object) {
      const parts = contents[object.blueprintHash!], anchor = { dir: object.position, yaw: object.rotation };
      const oldBase = structureFit(parts, object.position, object.rotation, world.old.field).baseRadius;
      const nextBase = structureFit(parts, object.position, object.rotation, world.next.field).baseRadius;
      const local = quatRotate(quatConjugate(anchorQuaternion(anchor)), sub(scale(position, oldPose.radius), scale(object.position, oldBase)));
      const point = localToPlanet(anchor, nextBase, local);
      pose = { ...oldPose, position: normalize(point), radius: Math.hypot(...point) };
      // Capsule support changes slightly when gravity curvature changes; settle only a grounded foot.
      if (pose.grounded) pose.radius = world.next.support(pose.position, pose.radius + .26).radius;
      structurePoses++;
    } else terrainPoses++;
    if (world.next.blocked(pose) || pose.radius < world.next.radius(pose.position) - .025) risks.push({ kind: 'saved-player-collision', planet: privateId(planetId), subject: privateId(id) });
    if (pose.grounded && Math.abs(world.next.support(pose.position, pose.radius + .26).radius - pose.radius) > .025) risks.push({ kind: 'changed-player-support', planet: privateId(planetId), subject: privateId(id) });
    // Public geometry is versioned independently from the persisted planet row.
    // Match planetStore's projection so the first read does not recover again.
    poses.push({ playerId: id, planetId, pose, sequence: Number(saved.sequence) + 1, sceneRevision: planetId==='hub'?1000+SAMPLE_PUBLIC_VERSION:changes.find(change => change.id === planetId)!.revision });
  }
  const tables = integrationTableDigest(db);
  const report = { version: 1, radius: INTEGRATED_RADIUS, alreadyApplied, canApply: risks.length === 0, planets: planets.length, objects: rows.length, spaceFlights, savedGroundPoses: poses.length, structurePoses, terrainPoses, unsavedGroundPoses: unsavedPoses, risks, sourceDigest: digest(tables) };
  return { report, changes, poses };
}

/** Explicit operator action on a backed-up working copy. A stale or unsafe plan writes nothing. */
export function applyIntegration(db: DatabaseSync, expectedDigest: string) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const plan = previewIntegration(db);
    if (plan.report.sourceDigest !== expectedDigest) throw new Error('Integration plan is stale; preview the current copy again.');
    if (!plan.report.canApply) throw new Error('Integration blocked by collision or flight clearance. No world changes were applied.');
    if (!plan.report.alreadyApplied) {
      for (const planet of plan.changes) {
        db.prepare('INSERT OR IGNORE INTO planet_radius_epochs(planet_id,from_sequence,radius) VALUES(?,0,?)').run(planet.id, planet.radius);
        db.prepare('INSERT OR REPLACE INTO planet_radius_epochs(planet_id,from_sequence,radius) VALUES(?,?,?)').run(planet.id, planet.sequence + 1, INTEGRATED_RADIUS);
        db.prepare('UPDATE planets SET world_radius=?,revision=? WHERE id=?').run(INTEGRATED_RADIUS, planet.revision, planet.id);
      }
      for (const item of plan.poses) {
        db.prepare('UPDATE ground_states SET position=?,radius=?,sequence=?,scene_revision=?,physics_version=?,clock_credit=0,request_hash=NULL WHERE player_id=?').run(JSON.stringify(item.pose.position), item.pose.radius, item.sequence, item.sceneRevision, physicsVersionFor(item.planetId), item.playerId);
        db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(item.pose.position), item.playerId);
      }
      // Revision fences old replies; identity, travel mode, quests and inventory remain unchanged.
      db.exec('UPDATE players SET revision=revision+1');
      db.prepare('INSERT INTO integration_config(id,version,radius) VALUES(1,1,?)').run(INTEGRATED_RADIUS);
      db.prepare('INSERT INTO integration_migrations(version,document) VALUES(1,?)').run(JSON.stringify(plan.report));
    }
    db.exec('COMMIT'); return plan.report;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
