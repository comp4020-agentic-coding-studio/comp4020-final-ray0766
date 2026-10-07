import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {planRoutePaths} from '../shared/path-layout.ts';
import {MAX_OBJECTS} from '../shared/planets.ts';
import type {HomePathPreview} from '../shared/home-paths.ts';
import type {planetStore} from './planets.ts';
import type {homeStore} from './home.ts';
import {RequestError} from './errors.ts';

export function homePathStore(db:DatabaseSync,planets:ReturnType<typeof planetStore>,homes:ReturnType<typeof homeStore>,enabled:boolean){
  const preview=(id:string,planetId:unknown):HomePathPreview=>{
    if(!enabled)throw new RequestError(404,'Home paths are unavailable.');
    if(typeof planetId!=='string')throw new RequestError(400,'Choose your home planet.');
    const row=db.prepare('SELECT planet_id,flight FROM players WHERE id=?').get(id);
    if(!row||row.planet_id!==planetId||JSON.parse(String(row.flight??'{"mode":"ground"}')).mode!=='ground')throw new RequestError(409,'Land on your home planet first.');
    homes.requireOutside(id);
    const planet=planets.view(id,planetId),manifest=planet.homeManifest;
    if(!planet.mine)throw new RequestError(403,'Only this planet’s owner can build here.');
    if(!manifest||manifest.version>2)throw new RequestError(409,'This home already uses editable paths.');
    const plan=planRoutePaths({routes:manifest.routes,radius:planet.radius!,environment:planet.environment??null,objects:planet.objects,blueprints:planet.blueprints,idPrefix:'home-path-preview'});
    const hash=createHash('sha256').update(JSON.stringify([planetId,planet.revision,plan.objects])).digest('hex');
    return {...plan,planetId,expectedRevision:planet.revision,hash,currentObjects:planet.objects.length,totalObjects:planet.objects.length+plan.added,maxObjects:MAX_OBJECTS,manifestVersion:manifest.version};
  };
  return {
    preview(id:string,body:Record<string,unknown>){if(Object.keys(body).some(k=>k!=='planetId'))throw new RequestError(400,'Unexpected path field.');return preview(id,body.planetId);},
    apply(id:string,body:Record<string,unknown>){
      if(Object.keys(body).some(k=>!['planetId','expectedRevision','hash','visitEpoch'].includes(k)))throw new RequestError(400,'Unexpected path field.');
      db.exec('BEGIN IMMEDIATE');
      try{
        homes.exterior(id,body.visitEpoch);
        const plan=preview(id,body.planetId);
        if(body.expectedRevision!==plan.expectedRevision||body.hash!==plan.hash)throw new RequestError(409,'Your planet changed. Preview the paths again.');
        if(!plan.added)throw new RequestError(409,'No more path tiles fit. Your existing objects are unchanged.');
        for(const object of plan.objects)planets.create(id,{planetId:plan.planetId,objectId:randomUUID(),kind:'path',position:object.position,rotation:object.rotation});
        db.exec('COMMIT');
      }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
    },
  };
}
