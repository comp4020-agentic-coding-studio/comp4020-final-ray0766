import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { encodeBlueprint, hashInput } from '../assets/claude-geometry/blueprint/codec.ts';
import { partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import type { Blueprint } from '../assets/claude-geometry/blueprint/model.ts';
import { anchorQuaternion, localToDir, localToPlanet } from '../assets/claude-geometry/core/anchor.ts';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { quatFromAxisAngle, quatMultiply } from '../assets/claude-geometry/core/vec.ts';
import { MAX_BLUEPRINTS, MAX_STRUCTURES, structureFit, structureSize } from '../shared/blueprints.ts';
import { defaultHomeInterior } from '../shared/home.ts';
import { HOME_DOOR_PART, starterHome } from '../shared/home-layout.ts';
import type { HomeSetupAddition, HomeSetupPreview, HomeSetupResult } from '../shared/home-setup.ts';
import { MAX_OBJECTS, placementProblem } from '../shared/planets.ts';
import type { PlanetView, PlacedObject } from '../shared/planets.ts';
import { GroundWorld } from '../shared/physics/world.ts';
import { fieldOf } from '../shared/terrain.ts';
import { distance, SPAWN } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import type { blueprintStore } from './blueprints.ts';
import { RequestError } from './errors.ts';
import { occupiedExteriorDoor } from './home-door-safety.ts';
import type { homeStore } from './home.ts';
import type { planetStore } from './planets.ts';

const strict = (body: Record<string, unknown>, fields: string[]) => {
  if (Object.keys(body).some(key => !fields.includes(key))) throw new RequestError(400, 'Unexpected home setup field.');
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Bounded, deterministic search. No terrain edits, seed rerolls or saved objects are moved. */
function* sites(radius: number): Generator<Vec3> {
  for (const reach of [6, 10, 16]) for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    yield localToDir({ dir: SPAWN, yaw: 0 }, radius, [Math.sin(angle) * reach, 0, Math.cos(angle) * reach]);
  }
  const count = 64, goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count, radial = Math.sqrt(1 - y * y), angle = i * goldenAngle;
    yield [Math.cos(angle) * radial, y, Math.sin(angle) * radial];
  }
}

export function homeSetupStore(db: DatabaseSync, planets: ReturnType<typeof planetStore>, blueprints: ReturnType<typeof blueprintStore>, homes: ReturnType<typeof homeStore>, enabled: boolean) {
  const transaction = <T>(work: () => T): T => {
    if (db.isTransaction) return work();
    db.exec('BEGIN IMMEDIATE');
    try { const value = work(); db.exec('COMMIT'); return value; }
    catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  };
  function ownerView(id: string, planetId: unknown): PlanetView {
    if (!enabled) throw new RequestError(404, 'Home setup is unavailable.');
    if (typeof planetId !== 'string') throw new RequestError(400, 'Choose your home planet.');
    const planet = planets.view(id, planetId);
    if (!planet.mine || planet.kind !== 'garden') throw new RequestError(403, 'Only this planet’s owner can set up its home.');
    const player = db.prepare('SELECT planet_id,flight FROM players WHERE id=?').get(id);
    if (!player || player.planet_id !== planetId || JSON.parse(String(player.flight ?? '{"mode":"ground"}')).mode !== 'ground') throw new RequestError(409, 'Land on your home planet first.');
    homes.requireOutside(id);
    return planet;
  }
  function addition(planet: PlanetView, blueprint: Blueprint): HomeSetupAddition | undefined {
    const radius = planet.radius!, size = structureSize(blueprint.parts), field = fieldOf(planet.environment, radius);
    // A disconnected visitor is still a saved body. Do not build over it.
    const occupants = db.prepare('SELECT id,position,flight FROM players WHERE planet_id=?').all(planet.id).filter(row => {
      if (JSON.parse(String(row.flight ?? '{"mode":"ground"}')).mode !== 'ground') return false;
      const location = db.prepare('SELECT document FROM home_locations WHERE player_id=?').get(row.id);
      return !location || JSON.parse(String(location.document)).kind !== 'interior';
    }).map(row => JSON.parse(String(row.position)) as Vec3);
    for (const position of sites(radius)) {
      if (occupants.some(point => distance(point, position, radius) < size.radius + .4)) continue;
      if (field.waterLevel !== null && field.heightAt(position) < field.waterLevel) continue;
      for (let turn = 0; turn < 4; turn++) {
        const rotation = turn * Math.PI / 2;
        if(placementProblem('structure',position,planet.objects,undefined,size.radius,radius,2,{rotation,blueprintHash:'home-setup-preview',blueprints:{...planet.blueprints,'home-setup-preview':blueprint.parts},field,terrainSeating:!!planet.environment}))continue;
        if (!structureFit(blueprint.parts, position, rotation, field).problem) return { position, rotation, blueprint };
      }
    }
    return undefined;
  }
  function preview(id: string, planetId: unknown): HomeSetupPreview {
    const planet = ownerView(id, planetId), library = blueprints.list(id);
    const existingHome = !!db.prepare('SELECT 1 FROM home_interiors WHERE planet_id=?').get(planet.id);
    const candidates = existingHome ? [] : planet.objects.flatMap(object => {
      if (object.kind !== 'structure' || !object.blueprintHash) return [];
      const buildingName = library.find(entry => entry.hash === object.blueprintHash)?.blueprint.name ?? 'Custom structure';
      const parts = blueprints.parts(object.blueprintHash), pivot = pivotOf(parts);
      // Upstairs exits need an explicit saved support height; this rollout
      // offers ground-level entrances only, with any original part number.
      return parts.filter(part => part.part === 'wall.door.open' && partTransform(part, pivot).position[1] <= .25).map(part => ({ buildingId: object.id, partNumber: part.n, buildingName }));
    });
    let reason: string | undefined, proposed: HomeSetupAddition | undefined;
    if (existingHome) reason = 'This planet already has its one home interior.';
    else if (planet.objects.length >= MAX_OBJECTS) reason = `This planet already has ${MAX_OBJECTS} objects. Bind an existing open door or free a space first.`;
    else if (planet.objects.filter(object => object.kind === 'structure').length >= MAX_STRUCTURES) reason = `This planet already has ${MAX_STRUCTURES} structures. Bind an existing open door or free a structure slot first.`;
    else if (library.length >= MAX_BLUEPRINTS) reason = `Your library already has ${MAX_BLUEPRINTS} blueprints. Bind an existing open door or free a library slot first.`;
    else {
      const blueprint = starterHome(), names = new Set(library.map(entry => entry.blueprint.name)), base = blueprint.name;
      for (let suffix = 2; names.has(blueprint.name); suffix++) blueprint.name = `${base} (${suffix})`;
      proposed = addition(planet, blueprint);
      if (!proposed) reason = 'No safe space for a new home was found on the current terrain. Bind an existing open door or make space first.';
    }
    const result = { planetId: planet.id, expectedRevision: planet.revision, existingHome, candidates, ...(proposed ? { addition: proposed } : {}), ...(reason ? { reason } : {}) };
    // Library edits do not bump the planet revision; bind the receipt to them too.
    const hash = digest([1, result, planet.environment, planet.objects, library]);
    return { ...result, hash };
  }
  function guardDoor(planet: PlanetView, object: PlacedObject, partNumber: number) {
    const parts = blueprints.parts(object.blueprintHash), part = parts.find(item => item.n === partNumber && item.part === 'wall.door.open');
    if (!part) throw new RequestError(409, 'Choose an existing open door from the current preview.');
    const anchor = { dir: object.position, yaw: object.rotation }, transform = partTransform(part, pivotOf(parts));
    const fit = structureFit(parts, object.position, object.rotation, fieldOf(planet.environment, planet.radius));
    const frame = { position: localToPlanet(anchor, fit.baseRadius, transform.position), quaternion: quatMultiply(anchorQuaternion(anchor), quatFromAxisAngle([0, 1, 0], transform.yaw)) };
    if (occupiedExteriorDoor(db, planet.id, frame, () => new GroundWorld(planet))) throw new RequestError(409, 'Someone is in the doorway. Step clear before setting up this home.');
  }
  return {
    preview(id: string, body: Record<string, unknown>): HomeSetupPreview {
      strict(body, ['planetId']); return preview(id, body.planetId);
    },
    confirm(id: string, body: Record<string, unknown>): HomeSetupResult {
      strict(body, ['planetId', 'expectedRevision', 'hash', 'visitEpoch', 'mode', 'buildingId', 'partNumber']);
      if (body.mode !== 'bind' && body.mode !== 'add') throw new RequestError(400, 'Choose an existing door or a new home.');
      if (!Number.isSafeInteger(body.expectedRevision) || typeof body.hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.hash)) throw new RequestError(400, 'Include the current home setup preview.');
      if (body.mode === 'add' && (body.buildingId !== undefined || body.partNumber !== undefined)) throw new RequestError(400, 'A new home does not take an existing building or door.');
      if (body.mode === 'bind' && (typeof body.buildingId !== 'string' || !Number.isSafeInteger(body.partNumber))) throw new RequestError(400, 'Choose an existing building and open door.');
      return transaction(() => {
        const plan = preview(id, body.planetId);
        homes.exterior(id, body.visitEpoch);
        if (plan.expectedRevision !== body.expectedRevision || plan.hash !== body.hash) throw new RequestError(409, 'Your planet or library changed. Preview home setup again.');
        if (plan.existingHome) throw new RequestError(409, plan.reason!);
        let buildingId: string, partNumber: number;
        if (body.mode === 'bind') {
          const candidate = plan.candidates.find(item => item.buildingId === body.buildingId && item.partNumber === body.partNumber);
          if (!candidate) throw new RequestError(409, 'Choose an existing open door from the current preview.');
          buildingId = candidate.buildingId; partNumber = candidate.partNumber;
        } else {
          if (!plan.addition) throw new RequestError(409, plan.reason ?? 'No safe space for a new home was found.');
          const blueprint = { ...plan.addition.blueprint, id: randomUUID() as Blueprint['id'] };
          const content = canonicalJson(hashInput(blueprint.parts)), hash = createHash('sha256').update(content).digest('hex');
          // Fresh identities only; never overwrite the owner's names or groups.
          db.prepare('INSERT OR IGNORE INTO blueprint_contents(hash,content) VALUES(?,?)').run(hash, content);
          db.prepare('INSERT INTO blueprint_library(owner_id,id,document,hash,version) VALUES(?,?,?,?,1)').run(id, blueprint.id, encodeBlueprint(blueprint), hash);
          buildingId = randomUUID(); partNumber = HOME_DOOR_PART;
          planets.create(id, { planetId: plan.planetId, objectId: buildingId, kind: 'structure', position: plan.addition.position, rotation: plan.addition.rotation, blueprintHash: hash });
        }
        const planet = planets.view(id, plan.planetId), building = planet.objects.find(object => object.id === buildingId)!;
        guardDoor(planet, building, partNumber);
        const interiorId = randomUUID();
        db.prepare('INSERT INTO home_interiors(planet_id,building_id,interior_id,document,variant,door_part) VALUES(?,?,?,?,?,?)').run(plan.planetId, buildingId, interiorId, JSON.stringify(defaultHomeInterior()), body.mode === 'bind' ? 'custom' : 'base', partNumber);
        db.prepare('UPDATE planets SET revision=revision+1 WHERE id=?').run(plan.planetId);
        db.prepare('UPDATE players SET revision=revision+1 WHERE planet_id=?').run(plan.planetId);
        return { planetId: plan.planetId, buildingId, interiorId };
      });
    },
  };
}
