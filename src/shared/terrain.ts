import { chord2 } from '../assets/claude-geometry/terrain/styles/program.ts';
import { anchorFrame } from '../assets/claude-geometry/core/anchor.ts';
import { fitGround, legacyHeightField, numericNormal } from '../assets/claude-geometry/core/ground.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { decodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { createHeightField } from '../assets/claude-geometry/terrain/field.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import { padFootprint, padCovers } from '../assets/claude-geometry/terrain/pads.ts';
import { blueprintGroundFootprint, blueprintCovers } from '../assets/claude-geometry/blueprint/model.ts';
import type { BlueprintContents } from './blueprints.ts';
import { objectRadius, objectName } from './planets.ts';
import type { PlacedObject } from './planets.ts';
import type { Vec3 } from './world.ts';
const legacy=legacyHeightField(),fields=new Map<string,TerrainField>();
export function fieldOf(environment?:string|null):HeightField{
 if(!environment)return legacy;let f=fields.get(environment);if(!f){const r=decodeEnvironment(environment);if(!r.ok)throw Error('Invalid stored terrain.');f=createHeightField(r.value);if(fields.size>=20)fields.delete(fields.keys().next().value!);fields.set(environment,f);}return f;
}
export function footing(o:PlacedObject,blueprints:BlueprintContents={}){
 if(o.kind==='structure'){const parts=blueprints[o.blueprintHash!];if(!parts)throw Error('Structure content is missing.');return {footprint:blueprintGroundFootprint(parts),covers:blueprintCovers(parts)};}
 const shape={kind:'circle' as const,radius:objectRadius(o)};return {footprint:padFootprint(shape),covers:(x:number,z:number)=>padCovers(shape,x,z)};
}
export function terrainObjects(objects:readonly PlacedObject[],blueprints:BlueprintContents={}){return objects.map(o=>({id:o.id,label:objectName(o),anchor:{dir:o.position,yaw:o.rotation},footprint:footing(o,blueprints).footprint}));}
export function foundations(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}){
 return objects.map(o=>{const f=footing(o,blueprints),anchor={dir:o.position,yaw:o.rotation};return {anchor,baseRadius:fitGround(field,anchor,f.footprint).baseRadius,radius:f.footprint.radius,covers:f.covers};});
}
// Same radial lowering used by Claude's buildPlanet foundation grading. Pure and shared by server/client.
export function gradedField(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}):HeightField{
 const grades=foundations(field,objects,blueprints).map(f=>({f,...anchorFrame(f.anchor),cosReach:1-chord2(f.radius+.05)/2}));
 const heightAt=(dir:Vec3)=>{let r=10+field.heightAt(dir);for(const g of grades){const c=dir.reduce((s,v,i)=>s+v*g.up[i],0);if(c<g.cosReach)continue;const p=dir.map((v,i)=>v*r-g.up[i]*g.f.baseRadius);const x=p.reduce((s,v,i)=>s+v*g.right[i],0),z=p.reduce((s,v,i)=>s+v*g.front[i],0);if(g.f.covers(x,z))r=Math.min(r,(g.f.baseRadius-.01)/c);}return r-10;};
 return {id:field.id+':graded',waterLevel:field.waterLevel,heightAt,normalAt:p=>numericNormal(heightAt,p)};
}
export const objectSeat=(field:HeightField,o:PlacedObject,blueprints:BlueprintContents={})=>fitGround(field,{dir:o.position,yaw:o.rotation},footing(o,blueprints).footprint);
