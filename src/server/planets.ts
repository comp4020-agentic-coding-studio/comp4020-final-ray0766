import { occupiedExteriorDoor } from './home-door-safety.ts';
import { GroundWorld } from '../shared/physics/world.ts';
import { localToPlanet, anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import { quatMultiply, quatFromAxisAngle } from '../assets/claude-geometry/core/vec.ts';
import { partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import { normalizeHomeInterior } from '../shared/home.ts';
import { HOME_DOOR_PART } from '../shared/home-layout.ts';
import { HOME_ENVIRONMENT } from '../shared/home-layout.ts';
import {SAMPLE_PUBLIC_ENVIRONMENT,SAMPLE_PUBLIC_VERSION} from '../shared/sample-public-village.ts';
import { QUICK_PARTS } from '../shared/quick-parts.ts';
import { radiusForSlot, safeRadius } from '../shared/world-size.ts';
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
import { MAX_PLANETS, planetCenter, spaceDistance } from '../shared/flight.ts';

interface PlanetRow { id: string; name: string; kind: 'hub' | 'garden'; owner_id: string | null; revision: number; objectCount: number;slot:number;radius:number;environment:string|null;sample_radius:number|null }
interface ObjectRow { id: string; kind: PlacedObject['kind']; position: string; rotation: number; version: number; blueprint_hash: string | null; radius: number | null; height: number | null; asset_version: 2 | null }
export function planetStore(db: DatabaseSync, blueprints = blueprintStore(db), history = historyStore(db), sampleRadius?:number) {
  const transaction = <T>(fn: () => T) => { if(db.isTransaction)return fn();db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; } };
  function replenish() {
    let blank = Number(db.prepare("SELECT count(*) AS n FROM planets WHERE kind='garden' AND owner_id IS NULL").get()!.n);
    let total=Number(db.prepare('SELECT count(*) AS n FROM planets').get()!.n);
    while((blank<6||total<INITIAL_PLANETS)&&total<MAX_PLANETS){
      blank++;total++;
      const number = Number(db.prepare("SELECT count(*) AS n FROM planets WHERE kind='garden'").get()!.n) + 1;
      const slot=Number(db.prepare('SELECT COALESCE(max(slot),-1)+1 AS slot FROM planets').get()!.slot);
      const id='p-'+randomUUID();
      db.prepare("INSERT INTO planets (id,name,kind,slot,radius,sample_radius,environment) VALUES (?,?,'garden',?,?,?,?)").run(id, `Little world ${String(number).padStart(2, '0')}`,slot,radiusForSlot(slot),sampleRadius??null,sampleRadius?HOME_ENVIRONMENT:null);history.baseline(id);
    }
  }
  transaction(replenish);
  const planet = (id: unknown): PlanetRow => {
    if (typeof id !== 'string' || id.length > 80) throw new RequestError(400, 'Choose a planet.');
    const p = db.prepare('SELECT *, (SELECT count(*) FROM planet_objects o WHERE o.planet_id=planets.id) AS objectCount FROM planets WHERE id=?').get(id) as unknown as PlanetRow;
    if (!p) throw new RequestError(404, 'That planet could not be found.');
    return {...p,radius:p.sample_radius??p.radius,revision:sampleRadius&&p.kind==='hub'?1000+SAMPLE_PUBLIC_VERSION:p.revision,environment:sampleRadius&&p.kind==='hub'?SAMPLE_PUBLIC_ENVIRONMENT:p.environment};
  };
  const summary = (p: PlanetRow, id: string): PlanetSummary => ({ id: p.id, name: p.name, kind: p.kind, claimed: p.owner_id !== null, mine: p.owner_id === id, revision: sampleRadius&&p.kind==='hub'?1000+SAMPLE_PUBLIC_VERSION:p.revision, objectCount: p.objectCount,slot:p.slot,radius:p.sample_radius??p.radius,center:planetCenter(p.slot),environment:sampleRadius&&p.kind==='hub'?SAMPLE_PUBLIC_ENVIRONMENT:p.environment??null });
  const objects = (planetId: string): PlacedObject[] => {
    const sizes=new Map<string,ReturnType<typeof structureSize>>();
    return (db.prepare('SELECT id,kind,position,rotation,version,blueprint_hash,radius,height,(SELECT asset_version FROM object_assets a WHERE a.object_id=planet_objects.id) AS asset_version FROM planet_objects WHERE planet_id=? ORDER BY rowid').all(planetId) as unknown as ObjectRow[]).map(r=>{
      if(r.blueprint_hash&&!sizes.has(r.blueprint_hash))sizes.set(r.blueprint_hash,structureSize(blueprints.parts(r.blueprint_hash)));
      const size=r.blueprint_hash?sizes.get(r.blueprint_hash):undefined;
      // Old structures stay exactly where they were saved. Effective extents
      // include the new eave when validating future neighbours or edits; their
      // saved rows and historical snapshots are not rewritten on read.
      return {id:r.id,kind:r.kind,rotation:r.rotation,version:r.version,position:JSON.parse(r.position),...(r.asset_version===2?{assetVersion:2 as const}:{}),...(size?{blueprintHash:r.blueprint_hash!,radius:Math.max(r.radius!,size.radius),height:Math.max(r.height!,size.height)}:{})};
    });
  };
  const owns = (id: string, planetId: unknown) => { const p = planet(planetId); if (p.kind === 'hub' || p.owner_id !== id) throw new RequestError(403, 'Only this planet’s owner can build here.'); return p; };
  const objectId = (value: unknown) => { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new RequestError(400, 'Invalid object identifier.'); return value; };
  const strict = (body: Record<string, unknown>, keys: string[]) => { if (Object.keys(body).some(k => !keys.includes(k))) throw new RequestError(400, 'Unexpected building field.'); };
  const placement = (kind: PlacedObject['kind'], position: unknown, rotation: unknown, planetId: string, ignoreId?: string, blueprintHash?: string) => {
    if (typeof rotation !== 'number' || !Number.isFinite(rotation) || rotation < 0 || rotation >= Math.PI * 2) throw new RequestError(400, 'Rotation must be between 0 and one full turn.');
    const parts = kind === 'structure' ? blueprints.parts(blueprintHash) : null;
    const old=objects(planetId).find(o=>o.id===ignoreId),assetVersion=old?(old.assetVersion??1):2;
    const problem = placementProblem(kind, position, objects(planetId), ignoreId, parts ? structureSize(parts).radius : undefined, planet(planetId).radius,assetVersion);
    if (problem) throw new RequestError(400, problem);
    const point = normalize(position as Vec3);
    const field=fieldOf(planet(planetId).environment,planet(planetId).radius);
    if(planet(planetId).environment){const obj:PlacedObject={id:ignoreId??'preview',kind,position:point,rotation,version:1,...(assetVersion===2?{assetVersion:2 as const}:{}),...(parts?{blueprintHash,...structureSize(parts)}:{})};const fit=objectSeat(field,obj,parts?{[blueprintHash!]:parts}:{});if(fit.problem)throw new RequestError(409,fit.message??'This terrain cannot support the object.');}
    if (parts) { const fit = structureFit(parts, point, rotation,field); if (fit.problem) throw new RequestError(400, fit.message ?? 'This ground is too uneven.'); }
    return { position: point, rotation };
  };
  const clearHomeDoorPlacement=(planetId:string,o:PlacedObject,hash:string)=>{
    if(!db.prepare('SELECT 1 FROM home_interiors WHERE building_id=?').get(o.id))return;
    const p=planet(planetId),parts=blueprints.parts(hash),part=parts.find(part=>part.n===HOME_DOOR_PART&&part.part==='wall.door.open');
    if(!part)return;
    const t=partTransform(part,pivotOf(parts)),anchor={dir:o.position,yaw:o.rotation},fit=structureFit(parts,o.position,o.rotation,fieldOf(p.environment,p.radius));
    const frame={position:localToPlanet(anchor,fit.baseRadius,t.position),quaternion:quatMultiply(anchorQuaternion(anchor),quatFromAxisAngle([0,1,0],t.yaw))};
    if(occupiedExteriorDoor(db,planetId,frame,()=>{
      const placed=objects(planetId),contents=Object.fromEntries(placed.flatMap(item=>item.blueprintHash?[[item.blueprintHash,blueprints.parts(item.blueprintHash)]]:[]));
      return new GroundWorld({...summary(p,''),objects:placed,blueprints:contents});
    }))throw new RequestError(409,'Someone is in the doorway. Move the home after they step clear.');
  };
  const bump = (p: string) => db.prepare('UPDATE planets SET revision=revision+1 WHERE id=?').run(p);
  const same = (old: PlacedObject, p: Vec3, rotation: number) => Math.abs(old.rotation - rotation) < 1e-8 && old.position.every((v, i) => Math.abs(v - p[i]) < 1e-8);
  const replaceInner=(id:string,body:Record<string,unknown>,variant='custom',undo=false)=>{
    const p=owns(id,body.planetId);strict(body,['planetId','objectId','expectedVersion','blueprintHash']);
    const oid=objectId(body.objectId),old=objects(p.id).find(o=>o.id===oid);
    if(!old||old.kind!=='structure')throw new RequestError(404,'Choose a placed structure.');
    if(!Number.isSafeInteger(body.expectedVersion)||old.version!==body.expectedVersion)throw new RequestError(409,'This object changed in another tab.');
    if(!undo)blueprints.owns(id,body.blueprintHash);
    const parts=blueprints.parts(body.blueprintHash),h=db.prepare('SELECT variant FROM home_interiors WHERE building_id=?').get(oid);
    if(h&&!parts.some(p=>p.n===HOME_DOOR_PART&&p.part==='wall.door.open'))throw new RequestError(409,'Keep the home entrance so its saved interior remains accessible.');
    if(body.blueprintHash===old.blueprintHash)return;
    placement(old.kind,old.position,old.rotation,p.id,oid,String(body.blueprintHash));const size=structureSize(parts);
    if(h)clearHomeDoorPlacement(p.id,old,String(body.blueprintHash));
    if(!undo)db.prepare('INSERT INTO object_replacements(planet_id,object_id,before_hash,after_hash,before_variant,after_variant,object_version) VALUES(?,?,?,?,?,?,?)').run(p.id,oid,old.blueprintHash!,String(body.blueprintHash),String(h?.variant??'custom'),variant,old.version+1);
    db.prepare('UPDATE planet_objects SET blueprint_hash=?,radius=?,height=?,version=version+1 WHERE id=?').run(body.blueprintHash as string,size.radius,size.height,oid);
    if(h)db.prepare('UPDATE home_interiors SET variant=? WHERE building_id=?').run(variant,oid);
    bump(p.id);history.append(p.id,old,objects(p.id).find(o=>o.id===oid)!);
  };
  return {
    replace(id:string,body:Record<string,unknown>,variant='custom'){return transaction(()=>replaceInner(id,body,variant));},
    undo(id:string,body:Record<string,unknown>){return transaction(()=>{strict(body,['planetId','objectId','expectedVersion']);owns(id,body.planetId);const row=db.prepare('SELECT * FROM object_replacements WHERE planet_id=? AND object_id=? AND undone=0 ORDER BY seq DESC LIMIT 1').get(body.planetId as string,body.objectId as string);if(!row)throw new RequestError(409,'There is no exterior change to undo.');replaceInner(id,{...body,blueprintHash:row.before_hash},String(row.before_variant),true);db.prepare('UPDATE object_replacements SET undone=1 WHERE seq=?').run(row.seq);});},
    planet,
    list(id: string) { return (db.prepare('SELECT *, (SELECT count(*) FROM planet_objects o WHERE o.planet_id=planets.id) AS objectCount FROM planets ORDER BY rowid').all() as unknown as PlanetRow[]).map(p => summary(p, id)); },
    view(id: string, planetId: string): PlanetView {
      const placed = objects(planetId);
      const hashes = [...new Set(placed.flatMap(o => o.blueprintHash ? [o.blueprintHash] : []))];
      const manifest=db.prepare('SELECT document FROM home_manifests WHERE planet_id=?').get(planetId);
      const home=db.prepare('SELECT building_id,document FROM home_interiors WHERE planet_id=?').get(planetId),room=home?normalizeHomeInterior(JSON.parse(String(home.document))):null;
      return { ...summary(planet(planetId), id), objects: placed, ...(home&&room?{homeDoor:{buildingId:String(home.building_id),partNumber:HOME_DOOR_PART,open:room.doorOpen,version:room.doorVersion}}:{}), ...(manifest?{homeManifest:JSON.parse(String(manifest.document))}:{}), ...(hashes.length ? {blueprints: Object.fromEntries(hashes.map(h => [h, blueprints.parts(h)]))} : {}) };
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
      for(const airborne of db.prepare('SELECT flight FROM players WHERE flight IS NOT NULL').all()){const f=JSON.parse(String(airborne.flight));if(f.mode==='space'&&spaceDistance(f.position,planetCenter(p.slot))<safeRadius({...p,environment}))throw new RequestError(409,'Terrain not applied: a ship is too close to the new surface.');}
      const placed=objects(p.id),contents=Object.fromEntries(placed.flatMap(o=>o.blueprintHash?[[o.blueprintHash,blueprints.parts(o.blueprintHash)]]:[]));
      const field=fieldOf(environment,p.radius),check=checkTerrainChange(field,terrainObjects(placed,contents),fieldOf(p.environment,p.radius));
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
        if(QUICK_PARTS[body.kind])db.prepare('INSERT INTO object_assets (object_id,planet_id,asset_version) VALUES (?,?,2)').run(oid,p.id);
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
        if(old.blueprintHash)clearHomeDoorPlacement(p.id,{...old,...position},old.blueprintHash);
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
        if(db.prepare('SELECT 1 FROM home_interiors WHERE building_id=?').get(oid))throw new RequestError(409,'Your home contains saved belongings and cannot be deleted.');
        if (old.version !== body.expectedVersion) throw new RequestError(409, 'This object changed in another tab. Select it again.');
        db.prepare('INSERT INTO object_tombstones (id,planet_id) VALUES (?,?)').run(oid,p.id);
        db.prepare('DELETE FROM planet_objects WHERE id=? AND planet_id=?').run(oid, p.id); bump(p.id);
        history.append(p.id,old,null);
      });
    },
  };
}
