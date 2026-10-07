import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { numericNormal } from '../assets/claude-geometry/core/ground.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import type { Vec3 } from './world.ts';

/** The immutable kit encodes height above 10 m. Rebase its radial field rather
 * than scaling a model: metre-sized parts, relief and water depth remain intact. */
export function radialField(source: HeightField, radius: number): HeightField {
  const offset=radius-10;if(!offset)return source;
  const heightAt=(p:Vec3)=>source.heightAt(p)+offset;
  const base={...source,id:source.id+':radius-'+radius,waterLevel:source.waterLevel===null?null:source.waterLevel+offset,heightAt,normalAt:(p:Vec3)=>numericNormal(heightAt,p)};
  if(!('sample' in source))return base;
  const terrain=source as TerrainField;
  function frame(p:Vec3){
    const length=Math.hypot(...p),dir=p.map(v=>v/length) as Vec3,{height,gradient}=terrain.heightGradient(dir);
    const dot=gradient.reduce((s,v,i)=>s+v*dir[i],0),tangent=gradient.map((v,i)=>v-dot*dir[i]),r=radius+height;
    const n=dir.map((v,i)=>v-tangent[i]/r),norm=Math.hypot(...n);
    return {normal:n.map(v=>v/norm) as Vec3,tanSlope:Math.hypot(...tangent)/r};
  }
  const result:TerrainField={...terrain,...base,landingLevel:terrain.landingLevel+offset,
    normalAt:p=>frame(p).normal,slopeAt:p=>Math.atan(frame(p).tanSlope),
    surfacePoint:p=>{const length=Math.hypot(...p),dir=p.map(v=>v/length) as Vec3;return dir.map(v=>v*(10+heightAt(dir))) as Vec3;},
    sample:p=>{const s=terrain.sample(p),f=frame(s.dir);return {...s,height:s.height+offset,...f,slope:Math.atan(f.tanSlope)};},
    heightGradient:p=>{const v=terrain.heightGradient(p);return {...v,height:v.height+offset};},
  };
  return result;
}
