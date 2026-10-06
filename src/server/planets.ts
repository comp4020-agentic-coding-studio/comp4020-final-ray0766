import { decodeEnvironment,encodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { checkTerrainChange,describeConflicts } from '../assets/claude-geometry/terrain/policy.ts';
import { fieldOf,terrainObjects,objectSeat } from '../shared/terrain.ts';
import { historyStore } from './history.ts';
import { UUID_PATTERN } from '../assets/claude-geometry/core/ids.ts';
import { blueprintStore } from './blueprints.ts';
import { MAX_STRUCTURES, structureFit, structureSize } from '../shared/blueprints.ts';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { isBuildKind, MAX_OBJECTS, placementProblem } from '../shared/planets.ts';
import type { PlanetSummary, PlanetView, PlacedObject } from '../shared/planets.ts';
import { normalize } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import { RequestError } from './errors.ts';
import { INITIAL_PLANETS } from '../shared/regions.ts';
import { MAX_PLANETS, planetCenter, spaceDistance, SAFE_RADIUS } from '../shared/flight.ts';

interface PlanetRow { id: string; name: string; kind: 'hub' | 'garden'; owner_id: string | null; revision: number; objectCount: number;slot:number;environment:string|null }
interface ObjectRow { id: string; kind: PlacedObject['kind']; position: string; rotation: number; version: number; blueprint_hash: string | null; radius: number | null; height: number | null }
export function planetStore(db: DatabaseSync, blueprints = blueprintStore(db), history = historyStore(db)) {
  const transaction = <T>(fn: () => T) => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  function replenish() {
    let blank = Number(db.prepare("SELECT count(*) AS n FROM planets WHERE kind='garden' AND owner_id IS NULL").get()!.n);
    let total=Number(db.prepare('SELECT count(*) AS n FROM planets').get()!.n);
    while((blank<6||total<INITIAL_PLANETS)&&total<MAX_PLANETS){
      blank++;total++;
      const number = Number(db.prepare("SELECT count(*) AS n FROM planets WHERE kind='garden'").get()!.n) + 1;
      const slot=Number(db.prepare('SELECT COALESCE(max(slot),-1)+1 AS slot FROM planets').get()!.slot);
      const id='p-'+randomUUID();
      db.prepare("INSERT INTO planets (id,name,kind,slot) VALUES (?,?,'garden',?)").run(id, `Little world ${String(number).padStart(2, '0')}`,slot);history.baseline(id);
    }
  }
  transaction(replenish);
  const planet = (id: unknown): PlanetRow => {
    if (typeof id !== 'string' || id.length > 80) throw new RequestError(400, 'Choose a planet.');
    const p = db.prepare('SELECT *, (SELECT count(*) FROM planet_objects o WHERE o.planet_id=planets.id) AS objectCount FROM planets WHERE id=?').get(id) as unknown as PlanetRow;
    if (!p) throw new RequestError(404, 'That planet could not be found.');
    return p;
  };
  const summary = (p: PlanetRow, id: string): PlanetSummary => ({ id: p.id, name: p.name, kind: p.kind, claimed: p.owner_id !== null, mine: p.owner_id === id, revision: p.revision, objectCount: p.objectCount,slot:p.slot,center:planetCenter(p.slot),environment:p.environment??null });
  const objects = (planetId: string): PlacedObject[] => (db.prepare('SELECT id,kind,position,rotation,version,blueprint_hash,radius,height FROM planet_objects WHERE planet_id=? ORDER BY rowid').all(planetId) as unknown as ObjectRow[]).map(r => ({ id:r.id,kind:r.kind,rotation:r.rotation,version:r.version,position:JSON.parse(r.position),...(r.blueprint_hash ? {blueprintHash:r.blueprint_hash,radius:r.radius!,height:r.height!} : {}) }));
  const owns = (id: string, planetId: unknown) => { const p = planet(planetId); if (p.kind === 'hub' || p.owner_id !== id) throw new RequestError(403, 'Only this planet’s owner can build here.'); return p; };
  const objectId = (value: unknown) => { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new RequestError(400, 'Invalid object identifier.'); return value; };
  const strict = (body: Record<string, unknown>, keys: string[]) => { if (Object.keys(body).some(k => !keys.includes(k))) throw new RequestError(400, 'Unexpected building field.'); };
  const placement = (kind: PlacedObject['kind'], position: unknown, rotation: unknown, planetId: string, ignoreId?: string, blueprintHash?: string) => {
    if (typeof rotation !== 'number' || !Number.isFinite(rotation) || rotation < 0 || rotation >= Math.PI * 2) throw new RequestError(400, 'Rotation must be between 0 and one full turn.');
    const parts = kind === 'structure' ? blueprints.parts(blueprintHash) : null;
    const problem = placementProblem(kind, position, objects(planetId), ignoreId, parts ? structureSize(parts).radius : undefined);
    if (problem) throw new RequestError(400, problem);
    const point = normalize(position as Vec3);
    const field=fieldOf(planet(planetId).environment);
    if(planet(planetId).environment){const obj:PlacedObject={id:ignoreId??'preview',kind,position:point,rotation,version:1,...(parts?{blueprintHash,...structureSize(parts)}:{})};const fit=objectSeat(field,obj,parts?{[blueprintHash!]:parts}:{});if(fit.problem)throw new RequestError(409,fit.message??'This terrain cannot support the object.');}
    if (parts) { const fit = structureFit(parts, point, rotation,field); if (fit.problem) throw new RequestError(400, fit.message ?? 'This ground is too uneven.'); }
    return { position: point, rotation };
  };
  const bump = (p: string) => db.prepare('UPDATE planets SET revision=revision+1 WHERE id=?').run(p);
  const same = (old: PlacedObject, p: Vec3, rotation: number) => Math.abs(old.rotation - rotation) < 1e-8 && old.position.every((v, i) => Math.abs(v - p[i]) < 1e-8);
  return {
    planet,
    list(id: string) { return (db.prepare('SELECT *, (SELECT count(*) FROM planet_objects o WHERE o.planet_id=planets.id) AS objectCount FROM planets ORDER BY rowid').all() as unknown as PlanetRow[]).map(p => summary(p, id)); },
    view(id: string, planetId: string): PlanetView {
      const placed = objects(planetId);
      const hashes = [...new Set(placed.flatMap(o => o.blueprintHash ? [o.blueprintHash] : []))];
      return { ...summary(planet(planetId), id), objects: placed, ...(hashes.length ? {blueprints: Object.fromEntries(hashes.map(h => [h, blueprints.parts(h)]))} : {}) };
    },
    owned(id: string) { return (db.prepare('SELECT id FROM planets WHERE owner_id=?').get(id)?.id as string) ?? null; },
    claim(id: string, planetId: unknown) {
      return transaction(() => {
        const p = planet(planetId);
        if (p.kind === 'hub') throw new RequestError(403, 'The harbour belongs to everyone.');
        if (p.owner_id === id) return;
        if (p.owner_id) throw new RequestError(409, 'Someone has already made this planet their home.');
        if (db.prepare('SELECT id FROM planets WHERE owner_id=?').get(id)) throw new RequestError(409, 'This browser identity already has a home planet.');
        db.prepare('UPDATE planets SET owner_id=?,revision=revision+1 WHERE id=? AND owner_id IS NULL').run(id, p.id);
        replenish();
      });
    },
    terrain(id:string,body:Record<string,unknown>){return transaction(()=>{
      const p=owns(id,body.planetId);strict(body,['planetId','environment','expectedRevision']);
      if(!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0)throw new RequestError(400,'Include the planet revision.');
      const r=decodeEnvironment(body.environment);if(!r.ok)throw new RequestError(400,r.errors.join(' '));const environment=encodeEnvironment(r.value);
      if(environment===p.environment)return;
      if(p.revision!==body.expectedRevision)throw new RequestError(409,'This planet changed in another tab. Reload before applying terrain.');
      const player=db.prepare('SELECT planet_id,flight FROM players WHERE id=?').get(id)!;
      if(player.planet_id!==p.id||(player.flight&&JSON.parse(String(player.flight)).mode==='space'))throw new RequestError(409,'Land on your planet before changing its terrain.');
      for(const airborne of db.prepare('SELECT flight FROM players WHERE flight IS NOT NULL').all()){const f=JSON.parse(String(airborne.flight));if(f.mode==='space'&&spaceDistance(f.position,planetCenter(p.slot))<SAFE_RADIUS+1.75)throw new RequestError(409,'Terrain not applied: a ship is too close to the new surface.');}
      const placed=objects(p.id),contents=Object.fromEntries(placed.flatMap(o=>o.blueprintHash?[[o.blueprintHash,blueprints.parts(o.blueprintHash)]]:[]));
      const field=fieldOf(environment),check=checkTerrainChange(field,terrainObjects(placed,contents),fieldOf(p.environment));
      if(!check.ok)throw new RequestError(409,'Terrain not applied: '+describeConflicts(check).join('; '));
      for(const visitor of db.prepare('SELECT position,flight FROM players WHERE planet_id=?').all(p.id)){
        if(visitor.flight&&JSON.parse(String(visitor.flight)).mode==='space')continue;
        const position=JSON.parse(String(visitor.position));if(field.waterLevel!==null&&field.heightAt(position)<field.waterLevel+.02)throw new RequestError(409,'Terrain not applied: a visitor would be under water. Return to the landing pad first.');
      }
      db.prepare('UPDATE planets SET environment=?,revision=revision+1 WHERE id=?').run(environment,p.id);
      db.prepare('DELETE FROM ground_states WHERE planet_id=?').run(p.id);
      db.prepare('UPDATE players SET revision=revision+1 WHERE planet_id=?').run(p.id);
    });},
    create(id: string, body: Record<string, unknown>) {
      return transaction(() => {
        const p = owns(id, body.planetId); strict(body, ['planetId', 'objectId', 'kind', 'position', 'rotation', 'blueprintHash']);
        const oid = objectId(body.objectId);
        if (db.prepare('SELECT id FROM object_tombstones WHERE id=?').get(oid)) throw new RequestError(409, 'This object was removed. Choose a fresh object from the catalogue.');
        if (!isBuildKind(body.kind) && body.kind !== 'structure') throw new RequestError(400, 'Choose an object from the catalogue.');
        if (body.kind !== 'structure' && body.blueprintHash !== undefined) throw new RequestError(400, 'Only structures have blueprints.');
        const blueprintHash = body.kind === 'structure' ? body.blueprintHash as string : undefined;
        const placed = objects(p.id), old = placed.find(o => o.id === oid);
        const position = placement(body.kind, body.position, body.rotation, p.id, oid, blueprintHash);
        if (old) { if (old.kind === body.kind && old.blueprintHash === blueprintHash && same(old, position.position, position.rotation)) return; throw new RequestError(409, 'This object identifier is already in use.'); }
        if (body.kind === 'structure') blueprints.owns(id, body.blueprintHash);
        if (placed.length >= MAX_OBJECTS) throw new RequestError(409, `This little planet has room for ${MAX_OBJECTS} objects.`);
        if (db.prepare('SELECT id FROM planet_objects WHERE id=?').get(oid)) throw new RequestError(409, 'Choose a new object identifier.');
        if (blueprintHash && placed.filter(o => o.kind === 'structure').length >= MAX_STRUCTURES) throw new RequestError(409, `This planet has room for ${MAX_STRUCTURES} custom structures.`);
        const size = blueprintHash ? structureSize(blueprints.parts(blueprintHash)) : null;
        db.prepare('INSERT INTO planet_objects (id,planet_id,kind,position,rotation,blueprint_hash,radius,height) VALUES (?,?,?,?,?,?,?,?)').run(oid, p.id, body.kind, JSON.stringify(position.position), position.rotation, blueprintHash ?? null, size?.radius ?? null, size?.height ?? null); bump(p.id);
        history.append(p.id,null,objects(p.id).find(o=>o.id===oid)!);
      });
    },
    update(id: string, body: Record<string, unknown>) {
      return transaction(() => {
        const p = owns(id, body.planetId); strict(body, ['planetId', 'objectId', 'position', 'rotation', 'expectedVersion']);
        const oid = objectId(body.objectId), old = objects(p.id).find(o => o.id === oid);
        if (!old) throw new RequestError(404, 'That object is no longer here.');
        if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new RequestError(400, 'Include the object version.');
        const position = placement(old.kind, body.position, body.rotation, p.id, oid, old.blueprintHash);
        if (same(old, position.position, position.rotation)) return;
        if (old.version !== body.expectedVersion) throw new RequestError(409, 'This object changed in another tab. Select it again.');
        db.prepare('UPDATE planet_objects SET position=?,rotation=?,version=version+1 WHERE planet_id=? AND id=?').run(JSON.stringify(position.position), position.rotation, p.id, oid); bump(p.id);
        history.append(p.id,old,objects(p.id).find(o=>o.id===oid)!);
      });
    },
    remove(id: string, body: Record<string, unknown>) {
      return transaction(() => {
        const p = owns(id, body.planetId); strict(body, ['planetId', 'objectId', 'expectedVersion']);
        const oid = objectId(body.objectId);
        if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new RequestError(400, 'Include the object version.');
        const old = objects(p.id).find(o => o.id === oid); if (!old) return;
        if (old.version !== body.expectedVersion) throw new RequestError(409, 'This object changed in another tab. Select it again.');
        db.prepare('INSERT INTO object_tombstones (id,planet_id) VALUES (?,?)').run(oid,p.id);
        db.prepare('DELETE FROM planet_objects WHERE id=? AND planet_id=?').run(oid, p.id); bump(p.id);
        history.append(p.id,old,null);
      });
    },
  };
}
