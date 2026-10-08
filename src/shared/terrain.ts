import { radialField } from './radial-field.ts';
import { fitGround, legacyHeightField } from '../assets/claude-geometry/core/ground.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { decodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { createHeightField } from '../assets/claude-geometry/terrain/field.ts';
import { surfaceFooting, gradeFoundations } from './terrain-grading.ts';
import type { BlueprintContents } from './blueprints.ts';
import { objectRadius, objectName } from './planets.ts';
import type { PlacedObject } from './planets.ts';
const legacy=legacyHeightField(),fields=new Map<string,HeightField>();
export function fieldOf(environment?:string|null,radius=10):HeightField{
 const key=radius+':'+(environment??'legacy');let field=fields.get(key);
 if(!field){let source:HeightField=legacy;if(environment){const r=decodeEnvironment(environment);if(!r.ok)throw Error('Invalid stored terrain.');source=createHeightField(r.value);}
 field=radialField(source,radius);if(fields.size>=24)fields.delete(fields.keys().next().value!);fields.set(key,field);}return field;
}
export function footing(o:PlacedObject,blueprints:BlueprintContents={}){
 if(o.kind==='structure'){const parts=blueprints[o.blueprintHash!];if(!parts)throw Error('Structure content is missing.');return surfaceFooting(parts,objectRadius(o));}
 return surfaceFooting(undefined,objectRadius(o));
}
export function terrainObjects(objects:readonly PlacedObject[],blueprints:BlueprintContents={}){return objects.map(o=>({id:o.id,label:objectName(o),anchor:{dir:o.position,yaw:o.rotation},footprint:footing(o,blueprints).footprint}));}
export function foundations(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}){
 return objects.map(o=>{const f=footing(o,blueprints),anchor={dir:o.position,yaw:o.rotation};return {anchor,baseRadius:fitGround(field,anchor,f.footprint).baseRadius,radius:f.footprint.radius,covers:f.covers};});
}
// Same radial lowering used by Claude's buildPlanet foundation grading. Pure and shared by server/client.
export function gradedField(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents={}):HeightField{
 return gradeFoundations(field,foundations(field,objects,blueprints));
}
export const objectSeat=(field:HeightField,o:PlacedObject,blueprints:BlueprintContents={})=>fitGround(field,{dir:o.position,yaw:o.rotation},footing(o,blueprints).footprint);
