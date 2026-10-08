import { occupiedExteriorDoor } from './home-door-safety.ts';
import { homeDoorSweepContains, homeIndoorDoorOrigin } from '../shared/home-door.ts';
import { GroundWorld } from '../shared/physics/world.ts';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { defaultHomeInterior, HOME_BODY_RADIUS, homeEntry, homeNearDoor, normalizeHomeInterior, HOME_ITEM_KINDS, HOME_MATERIALS, HOME_MAX_ITEMS, HOME_MOVE_SPEED, homeItemBounds, homePathAllowed, homePositionAllowed } from '../shared/home.ts';
import type { HomeDescriptor, HomeInfrastructureManifest, HomeInterior, HomeItem, HomeLocation, HomeRoom } from '../shared/home.ts';
import { distance } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import { structureFit, structureSize } from '../shared/blueprints.ts';
import { fieldOf } from '../shared/terrain.ts';
import { anchorQuaternion, localToPlanet, localToDir } from '../assets/claude-geometry/core/anchor.ts';
import { quatFromAxisAngle, quatMultiply } from '../assets/claude-geometry/core/vec.ts';
import { partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import { encodeBlueprint, hashInput } from '../assets/claude-geometry/blueprint/codec.ts';
import type { Blueprint } from '../assets/claude-geometry/blueprint/model.ts';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, homeVariant } from '../shared/home-layout.ts';
import { districtHome } from '../shared/district-layout.ts';
import { generateHomeManifest, HOME_GENERATION_VERSION } from '../shared/home-generation.ts';
import type { planetStore } from './planets.ts';
import type { blueprintStore } from './blueprints.ts';
import type { historyStore } from './history.ts';
import { RequestError } from './errors.ts';

export function migrateHomes(db: DatabaseSync) {
  if (!db.prepare('PRAGMA table_info(planets)').all().some(c=>c.name==='sample_radius')) db.exec('ALTER TABLE planets ADD COLUMN sample_radius REAL CHECK(sample_radius IS NULL OR sample_radius>0)');
  // Larger sample planets still use metre-sized floors above their surfaces.
  const groundSql=String(db.prepare("SELECT sql FROM sqlite_master WHERE name='ground_states'").get()?.sql??'');
  if(groundSql.includes('BETWEEN 8 AND 24'))db.exec(`CREATE TABLE ground_states_home (
    player_id TEXT PRIMARY KEY REFERENCES players(id), planet_id TEXT NOT NULL REFERENCES planets(id), position TEXT NOT NULL,
    radius REAL NOT NULL CHECK(radius BETWEEN 1 AND 128), vertical_speed REAL NOT NULL CHECK(vertical_speed BETWEEN -10 AND 5.2),
    grounded INTEGER NOT NULL CHECK(grounded IN (0,1)), sequence INTEGER NOT NULL, scene_revision INTEGER NOT NULL,
    clock_credit REAL NOT NULL CHECK(clock_credit BETWEEN 0 AND 2), request_hash TEXT,
    physics_version INTEGER NOT NULL DEFAULT 0 CHECK(physics_version>=0),jump_held INTEGER NOT NULL DEFAULT 0 CHECK(jump_held IN (0,1)));
    INSERT INTO ground_states_home SELECT * FROM ground_states;DROP TABLE ground_states;ALTER TABLE ground_states_home RENAME TO ground_states;`);
  db.exec(`CREATE TABLE IF NOT EXISTS home_sample_config (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
    CREATE TABLE IF NOT EXISTS home_interiors (
      planet_id TEXT PRIMARY KEY REFERENCES planets(id), building_id TEXT NOT NULL UNIQUE REFERENCES planet_objects(id),
      interior_id TEXT NOT NULL UNIQUE, document TEXT NOT NULL CHECK(json_valid(document)), variant TEXT NOT NULL DEFAULT 'base');
    CREATE TABLE IF NOT EXISTS home_locations (
      player_id TEXT PRIMARY KEY REFERENCES players(id), document TEXT NOT NULL CHECK(json_valid(document)), moved_at INTEGER NOT NULL, request_hash TEXT);
    CREATE TABLE IF NOT EXISTS home_manifests (
      planet_id TEXT PRIMARY KEY REFERENCES planets(id), version INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS object_replacements (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, planet_id TEXT NOT NULL REFERENCES planets(id), object_id TEXT NOT NULL,
      before_hash TEXT NOT NULL, after_hash TEXT NOT NULL, before_variant TEXT NOT NULL, after_variant TEXT NOT NULL,
      object_version INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
    CREATE TRIGGER IF NOT EXISTS home_building_no_delete BEFORE DELETE ON planet_objects
      WHEN EXISTS(SELECT 1 FROM home_interiors WHERE building_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'The home contains a persistent interior and cannot be deleted'); END;`);
}
const strict=(body:Record<string,unknown>,keys:string[])=>{if(Object.keys(body).some(k=>!keys.includes(k)))throw new RequestError(400,'Unexpected home field.');};
const vec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const digest=(v:unknown)=>createHash('sha256').update(canonicalJson(v)).digest('hex');
interface HomeRow { door_part:number;planet_id:string;building_id:string;interior_id:string;document:string;variant:HomeDescriptor['variant'] }
/** Stable for this planet and generator version; independent of browser identity. */
export const homeGenerationSeed=(planetId:string)=>createHash('sha256').update(`home-neighbourhood:${HOME_GENERATION_VERSION}:${planetId}`).digest().readUInt32BE(0);

export function homeStore(db:DatabaseSync,planets:ReturnType<typeof planetStore>,blueprints:ReturnType<typeof blueprintStore>,history:ReturnType<typeof historyStore>,enabled:boolean) {
  const transaction=<T>(fn:()=>T):T=>{if(db.isTransaction)return fn();db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}};
  const player=(id:string)=>{const p=db.prepare('SELECT planet_id,position,flight FROM players WHERE id=?').get(id);if(!p)throw new RequestError(401,'Your visit expired.');return p;};
  const home=(planetId:string)=>db.prepare('SELECT * FROM home_interiors WHERE planet_id=?').get(planetId) as unknown as HomeRow|undefined;
  const byBuilding=(buildingId:unknown)=>{if(typeof buildingId!=='string')throw new RequestError(400,'Choose a home.');const h=db.prepare('SELECT * FROM home_interiors WHERE building_id=?').get(buildingId) as unknown as HomeRow|undefined;if(!h)throw new RequestError(404,'This building has no home interior.');return h;};
  const location=(id:string):HomeLocation=>{const p=player(id),r=db.prepare('SELECT document FROM home_locations WHERE player_id=?').get(id);return r?JSON.parse(String(r.document)):{kind:'exterior',planetId:String(p.planet_id),visitEpoch:0};};
  const writeLocation=(id:string,loc:HomeLocation,now=Date.now(),requestHash:string|null=null)=>db.prepare('INSERT INTO home_locations(player_id,document,moved_at,request_hash) VALUES(?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET document=excluded.document,moved_at=excluded.moved_at,request_hash=excluded.request_hash').run(id,JSON.stringify(loc),now,requestHash);
  const epoch=(old:HomeLocation,value:unknown)=>{if(!Number.isSafeInteger(value)||old.visitEpoch!==value)throw new RequestError(409,'Your home visit changed. Reconnect before moving.');};
  const requireOutside=(id:string)=>{if(enabled&&location(id).kind==='interior')throw new RequestError(409,'Leave your home before using surface actions.');};
  const exterior=(id:string,value?:unknown)=>{if(!enabled)return;const loc=location(id);if(loc.kind==='interior')throw new RequestError(409,'Leave your home before using surface actions.');epoch(loc,value);};
  const interior=(h:HomeRow)=>normalizeHomeInterior(JSON.parse(h.document) as HomeInterior);
  const changed=(planetId:string)=>db.prepare('UPDATE players SET revision=revision+1 WHERE planet_id=?').run(planetId);
  const doorFrames=new Map<string,{key:string;value:HomeDescriptor['door']}>();
  function door(h:HomeRow) {
    const p=planets.planet(h.planet_id),o=planets.view('',h.planet_id).objects.find(o=>o.id===h.building_id);
    if(!o?.blueprintHash)throw new RequestError(409,'Your home exterior is unavailable; its contents are preserved.');
    const key=JSON.stringify([p.radius,p.environment,o.version,o.blueprintHash,o.position,o.rotation,h.door_part]);
    const cached=doorFrames.get(h.building_id);if(cached?.key===key)return structuredClone(cached.value);
    const parts=blueprints.parts(o.blueprintHash),part=parts.find(p=>p.n===(h.door_part??HOME_DOOR_PART)&&p.part==='wall.door.open');
    if(!part)throw new RequestError(409,'The home entrance is unavailable; its contents are preserved.');
    const t=partTransform(part,pivotOf(parts)),fit=structureFit(parts,o.position,o.rotation,fieldOf(p.environment,p.radius));
    const point:Vec3=[t.position[0]+Math.sin(t.yaw)*.9,t.position[1],t.position[2]+Math.cos(t.yaw)*.9];
    const anchor={dir:o.position,yaw:o.rotation};
    const value:HomeDescriptor['door']={position:localToDir(anchor,fit.baseRadius,point),yaw:(o.rotation+t.yaw)%(Math.PI*2),frame:{position:localToPlanet(anchor,fit.baseRadius,t.position),quaternion:quatMultiply(anchorQuaternion(anchor),quatFromAxisAngle([0,1,0],t.yaw))}};
    if(doorFrames.size>=64&&!doorFrames.has(h.building_id))doorFrames.delete(doorFrames.keys().next().value!);
    doorFrames.set(h.building_id,{key,value});return structuredClone(value);
  }
  /** Read every saved body, including disconnected visitors. Never recover or
   * relocate a person to make room for a door; reject the whole action instead. */
  function doorSweepOccupied(h:HomeRow,room:HomeInterior):boolean {
    const origin=homeIndoorDoorOrigin(room.room);
    for(const row of db.prepare('SELECT document FROM home_locations').all()){
      const at=JSON.parse(String(row.document)) as HomeLocation;
      if(at.kind==='interior'&&at.buildingId===h.building_id&&homeDoorSweepContains(at.position.map((n,i)=>n-origin[i]) as Vec3))return true;
    }
    return occupiedExteriorDoor(db,h.planet_id,door(h).frame!,()=>new GroundWorld(planets.view('',h.planet_id)));
  }
  function descriptor(id:string,planetId=String(player(id).planet_id)):HomeDescriptor|null {
    const h=home(planetId);if(!h)return null;const p=planets.planet(planetId),o=planets.view(id,planetId).objects.find(o=>o.id===h.building_id)!;
    return {planetId,buildingId:h.building_id,interiorId:h.interior_id,door:door(h),interior:interior(h),canEdit:p.owner_id===id,buildingVersion:o.version,variant:h.variant,canUndo:!!db.prepare('SELECT 1 FROM object_replacements WHERE object_id=? AND undone=0').get(o.id)};
  }
  function content(bp:Blueprint) {const value=canonicalJson(hashInput(bp.parts)),hash=createHash('sha256').update(value).digest('hex');db.prepare('INSERT OR IGNORE INTO blueprint_contents(hash,content) VALUES(?,?)').run(hash,value);return hash;}
  function initialise(planetId:string) {
    if(!enabled||home(planetId))return;
    const p=planets.planet(planetId);if(p.kind!=='garden'||(p.sample_radius===null&&p.world_radius===null)||!p.owner_id)return;
    // A manifest is a creation receipt, never an instruction to regenerate.
    // Empty but previously edited worlds also remain untouched.
    if(db.prepare('SELECT 1 FROM home_manifests WHERE planet_id=?').get(planetId)||
      planets.view(String(p.owner_id),planetId).objects.length||
      db.prepare('SELECT 1 FROM object_tombstones WHERE planet_id=?').get(planetId)||
      Number(db.prepare('SELECT seq FROM history_heads WHERE planet_id=?').get(planetId)?.seq??0)>0)return;
    transaction(()=>{
      // Only this never-edited, newly created home may adopt the new authored
      // district ground. A supplied custom terrain remains an input constraint.
      const manifest=generateHomeManifest(p.radius,homeGenerationSeed(planetId),p.environment===HOME_ENVIRONMENT?undefined:p.environment);
      // Ground, rendering and every creation event read the accepted output
      // environment in the same transaction as its concrete saved objects.
      db.prepare('UPDATE planets SET environment=? WHERE id=?').run(manifest.environment,planetId);
      db.prepare('DELETE FROM ground_states WHERE planet_id=?').run(planetId);
      const insertStructure=(spec:{blueprint:Blueprint;position:Vec3;rotation:number},id=randomUUID())=>{
        const hash=content(spec.blueprint),size=structureSize(spec.blueprint.parts);
        db.prepare("INSERT INTO planet_objects(id,planet_id,kind,position,rotation,blueprint_hash,radius,height) VALUES(?,?,'structure',?,?,?,?,?)").run(id,planetId,JSON.stringify(spec.position),spec.rotation,hash,size.radius,size.height);
        // Every initial building is an ordinary editable owner blueprint.
        // Fresh library ids never overwrite an existing name, group or draft.
        const bp={...spec.blueprint,id:randomUUID() as Blueprint['id']};
        db.prepare('INSERT INTO blueprint_library(owner_id,id,document,hash,version) VALUES(?,?,?,?,1)').run(p.owner_id,bp.id,encodeBlueprint(bp),hash);
        history.append(planetId,null,planets.view('',planetId).objects.find(o=>o.id===id)!);return {id,hash};
      };
      const building=insertStructure(manifest.home);
      for(const item of manifest.infrastructure??[])insertStructure(item);
      for(const spec of manifest.objects){const id=randomUUID();db.prepare('INSERT INTO planet_objects(id,planet_id,kind,position,rotation) VALUES(?,?,?,?,?)').run(id,planetId,spec.kind,JSON.stringify(spec.position),spec.rotation);db.prepare('INSERT INTO object_assets(object_id,planet_id,asset_version) VALUES(?,?,2)').run(id,planetId);history.append(planetId,null,planets.view('',planetId).objects.find(o=>o.id===id)!);}
      // The compact district house is editable kit geometry, not the historical
      // full-court preset. Describe the actual saved design without relabelling
      // an existing home or implying a larger remodel has already been applied.
      const variant=canonicalJson(hashInput(manifest.home.blueprint.parts))===canonicalJson(hashInput(homeVariant('starter').parts))?'base':'custom';
      db.prepare('INSERT INTO home_interiors(planet_id,building_id,interior_id,document,variant) VALUES(?,?,?,?,?)').run(planetId,building.id,randomUUID(),JSON.stringify(defaultHomeInterior()),variant);
      const document:HomeInfrastructureManifest={generator:manifest.generator,version:manifest.version,seed:manifest.seed,radius:p.radius,environment:manifest.environment,catalogueVersion:manifest.catalogueVersion,fallback:manifest.fallback,...(manifest.fallbackReason?{fallbackReason:manifest.fallbackReason}:{}),routes:manifest.routes,homeBuildingId:building.id,objects:planets.view('',planetId).objects};
      db.prepare('INSERT INTO home_manifests(planet_id,version,document,hash) VALUES(?,?,?,?)').run(planetId,manifest.version,JSON.stringify(document),digest(document));
      db.prepare('UPDATE planets SET revision=revision+1 WHERE id=?').run(planetId);
      db.prepare('UPDATE players SET revision=revision+1 WHERE planet_id=?').run(planetId);
    });
  }
  const indoor=(id:string,body:Record<string,unknown>)=>{const loc=location(id);epoch(loc,body.visitEpoch);if(loc.kind!=='interior'||loc.buildingId!==body.buildingId)throw new RequestError(409,'This is not your current home visit.');return loc;};
  function validateInterior(body:Record<string,unknown>,room:HomeRoom):Pick<HomeInterior,'material'|'items'> {
    if(!HOME_MATERIALS.includes(body.material as never)||!Array.isArray(body.items)||body.items.length>HOME_MAX_ITEMS)throw new RequestError(400,'Choose a room finish and at most 12 furniture pieces.');
    const ids=new Set<string>();const items:HomeItem[]=body.items.map(raw=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new RequestError(400,'Invalid furniture.');
      const a=raw as Record<string,unknown>;strict(a,['id','kind','position','yaw']);
      if(typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(a.id)||ids.has(a.id)||!HOME_ITEM_KINDS.includes(a.kind as never)||!vec(a.position)||a.position[1]!==0||typeof a.yaw!=='number'||!Number.isFinite(a.yaw)||a.yaw<0||a.yaw>=Math.PI*2)throw new RequestError(400,'Invalid furniture position or identifier.');
      ids.add(a.id);return {id:a.id,kind:a.kind as HomeItem['kind'],position:a.position,yaw:a.yaw};
    });
    for(let i=0;i<items.length;i++){const a=homeItemBounds(items[i]);if(a.minX< -room.width/2+.08||a.maxX>room.width/2-.08||a.minZ< -room.depth/2+.08||a.maxZ>room.depth/2-.08)throw new RequestError(400,'Keep furniture inside the room.');if(a.minX<.65&&a.maxX>-.65&&a.maxZ>.5)throw new RequestError(400,'Keep the route to the door clear.');for(let j=0;j<i;j++){const b=homeItemBounds(items[j]);if(a.minX<b.maxX+.04&&a.maxX>b.minX-.04&&a.minZ<b.maxZ+.04&&a.maxZ>b.minZ-.04)throw new RequestError(400,'Furniture overlaps another piece.');}}
    if(!homePositionAllowed(homeEntry(room),items,HOME_BODY_RADIUS,room))throw new RequestError(400,'Keep the entry clear.');return {material:body.material as HomeInterior['material'],items};
  }
  return {
    enabled,location,descriptor,initialise,exterior,requireOutside,
    door:(planetId:string)=>{const h=home(planetId);return h?door(h):null;},
    movedExterior(id:string){if(!enabled)return;const old=location(id);writeLocation(id,{kind:'exterior',planetId:String(player(id).planet_id),visitEpoch:old.visitEpoch+1});},
    enter(id:string,body:Record<string,unknown>,now=Date.now()){
      strict(body,['planetId','buildingId','visitEpoch']);if(!enabled)throw new RequestError(404,'Home sample is unavailable.');
      const loc=location(id),h=byBuilding(body.buildingId);epoch(loc,body.visitEpoch);const p=player(id);
      if(loc.kind!=='exterior'||p.planet_id!==h.planet_id||body.planetId!==h.planet_id||JSON.parse(String(p.flight??'{"mode":"ground"}')).mode!=='ground')throw new RequestError(409,'Walk to this home first.');
      if(distance(JSON.parse(String(p.position)),door(h).position,planets.planet(h.planet_id).radius)>1.7)throw new RequestError(409,'Walk closer to the home door.');
      const room=interior(h);if(!room.doorOpen)throw new RequestError(409,'Open the door before entering.');
      transaction(()=>{writeLocation(id,{kind:'interior',planetId:h.planet_id,buildingId:h.building_id,interiorId:h.interior_id,position:homeEntry(room.room),yaw:Math.PI,sequence:0,visitEpoch:loc.visitEpoch+1},now);db.prepare('UPDATE players SET revision=revision+1 WHERE id=?').run(id);});
    },
    move(id:string,body:Record<string,unknown>,now=Date.now()){
      strict(body,['buildingId','visitEpoch','sequence','position','yaw']);const loc=indoor(id,body),h=byBuilding(loc.buildingId);
      if(!Number.isSafeInteger(body.sequence)||!vec(body.position)||typeof body.yaw!=='number'||!Number.isFinite(body.yaw)||body.yaw<0||body.yaw>=Math.PI*2)throw new RequestError(400,'Invalid home movement.');
      const saved=db.prepare('SELECT moved_at,request_hash FROM home_locations WHERE player_id=?').get(id)!,hash=digest(body);
      if(body.sequence===loc.sequence&&saved.request_hash===hash)return;
      if(body.sequence!==loc.sequence+1)throw new RequestError(409,'A newer home position exists.');
      const elapsed=Math.min(1.5,Math.max(0,now-Number(saved.moved_at))/1000),d=Math.hypot(...body.position.map((n,i)=>n-loc.position[i]));
      if(d>HOME_MOVE_SPEED*elapsed+.25||!homePathAllowed(loc.position,body.position,interior(h).items,interior(h).room,interior(h).doorOpen))throw new RequestError(409,'A wall or furniture blocks this home movement.');
      transaction(()=>{writeLocation(id,{...loc,position:body.position as Vec3,yaw:body.yaw as number,sequence:Number(body.sequence)},now,hash);db.prepare('UPDATE players SET revision=revision+1 WHERE id=?').run(id);});
    },
    exit(id:string,body:Record<string,unknown>,now=Date.now()){
      strict(body,['buildingId','visitEpoch']);const loc=indoor(id,body),h=byBuilding(loc.buildingId);
      const room=interior(h);if(!homeNearDoor(loc.position,room.room))throw new RequestError(409,'Walk to the inside door to leave.');
      if(!room.doorOpen)throw new RequestError(409,'Open the door before going outside.');
      const point=door(h).position;
      transaction(()=>{db.prepare('UPDATE players SET position=?,moved_at=?,revision=revision+1 WHERE id=?').run(JSON.stringify(point),now,id);db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);writeLocation(id,{kind:'exterior',planetId:h.planet_id,visitEpoch:loc.visitEpoch+1},now);});
    },
    setDoor(id:string,body:Record<string,unknown>){return transaction(()=>{
      strict(body,['buildingId','visitEpoch','expectedDoorVersion','open']);
      if(!enabled)throw new RequestError(404,'Home sample is unavailable.');
      if(typeof body.open!=='boolean'||!Number.isSafeInteger(body.expectedDoorVersion))throw new RequestError(400,'Choose whether to open or close the door.');
      const loc=location(id),h=byBuilding(body.buildingId),p=player(id);epoch(loc,body.visitEpoch);
      const old=interior(h);
      if(loc.kind==='interior'){
        if(loc.buildingId!==h.building_id||!homeNearDoor(loc.position,old.room))throw new RequestError(409,'Walk to this home door first.');
      }else if(p.planet_id!==h.planet_id||JSON.parse(String(p.flight??'{"mode":"ground"}')).mode!=='ground'||distance(JSON.parse(String(p.position)),door(h).position,planets.planet(h.planet_id).radius)>1.7)throw new RequestError(409,'Walk to this home door first.');
      if(body.expectedDoorVersion!==old.doorVersion)throw new RequestError(409,'The door changed in another tab.');
      if(body.open===old.doorOpen)return;
      if(doorSweepOccupied(h,old))throw new RequestError(409,'Someone is in the doorway. Step back before moving the door.');
      db.prepare('UPDATE home_interiors SET document=? WHERE planet_id=?').run(JSON.stringify({...old,doorOpen:body.open,doorVersion:old.doorVersion+1}),h.planet_id);
      db.prepare('UPDATE planets SET revision=revision+1 WHERE id=?').run(h.planet_id);changed(h.planet_id);
    });},
    save(id:string,body:Record<string,unknown>){
      strict(body,['buildingId','expectedVersion','material','items']);const h=byBuilding(body.buildingId);if(planets.planet(h.planet_id).owner_id!==id)throw new RequestError(403,'Only the home owner can edit the room.');
      const loc=location(id);if(loc.kind!=='interior'||loc.buildingId!==h.building_id)throw new RequestError(409,'Enter your home before arranging it.');
      const old=interior(h);if(body.expectedVersion!==old.version)throw new RequestError(409,'This room changed in another tab.');const next=validateInterior(body,old.room);
      for(const r of db.prepare('SELECT document FROM home_locations').all()){const at=JSON.parse(String(r.document)) as HomeLocation;if(at.kind==='interior'&&at.buildingId===h.building_id&&!homePositionAllowed(at.position,next.items,HOME_BODY_RADIUS,old.room,old.doorOpen))throw new RequestError(409,'A visitor is standing there. Leave their space clear.');}
      transaction(()=>{db.prepare('UPDATE home_interiors SET document=? WHERE planet_id=?').run(JSON.stringify({...old,...next,version:old.version+1}),h.planet_id);changed(h.planet_id);});
    },
    remodelBlueprint(variant:unknown,planetId:string):Blueprint {
      if(!['base','terrace','roof','extended'].includes(String(variant)))throw new RequestError(400,'Choose a home variation.');
      const kind=variant==='base'?'starter':variant==='extended'?'extension':variant as 'terrace'|'roof';
      const row=db.prepare('SELECT document FROM home_manifests WHERE planet_id=?').get(planetId);
      const receipt=row?JSON.parse(String(row.document)) as HomeInfrastructureManifest:null;
      return receipt?.catalogueVersion==='district-kit-v2'
        ?districtHome(kind,(receipt.objects.find(object=>object.id===receipt.homeBuildingId)?.rotation??0)>Math.PI)
        :homeVariant(kind);
    },
  };
}
