import { chord2 } from '../assets/claude-geometry/terrain/styles/program.ts';
import { anchorFrame } from '../assets/claude-geometry/core/anchor.ts';
import type { SurfaceAnchor } from '../assets/claude-geometry/core/anchor.ts';
import { numericNormal } from '../assets/claude-geometry/core/ground.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { padFootprint, padCovers } from '../assets/claude-geometry/terrain/pads.ts';
import { blueprintGroundFootprint, blueprintCovers } from '../assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import type { Vec3 } from './world.ts';

/** The same footing and radial lowering for rendering, physics and placement.
 * It consumes resolved geometry and never imports planet/catalogue state. */
export function surfaceFooting(parts:readonly PartPlacement[]|undefined,radius:number){
 if(parts)return {footprint:blueprintGroundFootprint(parts),covers:blueprintCovers(parts)};
 const shape={kind:'circle' as const,radius};
 return {footprint:padFootprint(shape),covers:(x:number,z:number)=>padCovers(shape,x,z)};
}
export interface GradeFoundation {anchor:SurfaceAnchor;baseRadius:number;radius:number;covers:(x:number,z:number)=>boolean}
export function gradeFoundations(field:HeightField,foundations:readonly GradeFoundation[]):HeightField{
 const grades=foundations.map(f=>({f,...anchorFrame(f.anchor),cosReach:1-chord2(f.radius+.05)/2}));
 const heightAt=(dir:Vec3)=>{let r=10+field.heightAt(dir);for(const g of grades){const c=dir.reduce((s,v,i)=>s+v*g.up[i],0);if(c<g.cosReach)continue;const p=dir.map((v,i)=>v*r-g.up[i]*g.f.baseRadius);const x=p.reduce((s,v,i)=>s+v*g.right[i],0),z=p.reduce((s,v,i)=>s+v*g.front[i],0);if(g.f.covers(x,z))r=Math.min(r,(g.f.baseRadius-.01)/c);}return r-10;};
 return {id:field.id+':graded',waterLevel:field.waterLevel,heightAt,normalAt:p=>numericNormal(heightAt,p)};
}
