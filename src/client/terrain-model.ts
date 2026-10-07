import {Mesh,ShaderMaterial,CustomBlending,AddEquation,SrcAlphaFactor,OneFactor,ZeroFactor} from 'three';
import type {Vec3} from '../shared/world.ts';
import { buildPlanet } from '../assets/claude-geometry/terrain/planet.ts';
import { TerrainKit } from '../assets/claude-geometry/terrain/kit.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import type { PlacedObject } from '../shared/planets.ts';
import type { BlueprintContents } from '../shared/blueprints.ts';
import { fieldOf,foundations } from '../shared/terrain.ts';
import { PRESENTATION } from './presentation.ts';
import { objectRadius } from '../shared/planets.ts';
export function terrainModel(environment:string,objects:readonly PlacedObject[]=[],blueprints:BlueprintContents={},lod:LodTier='medium',alphaCanvas=false,radius=10){
 const field=fieldOf(environment,radius) as TerrainField,kit=new TerrainKit(lod,{look:PRESENTATION.materials.look});
 const model=buildPlanet(field.env,null,lod,{kit,field,foundations:foundations(field,objects,blueprints),clearings:objects.map(o=>({dir:o.position,radius:objectRadius(o)+.2}))});
 // Strata altitude is relative to this planet's base, not the vendor default.
 for(const material of (Array.isArray(model.ground.material)?model.ground.material:[model.ground.material])){const uniforms=material.userData.uniforms;if(uniforms?.uRadius)uniforms.uRadius.value=radius;}
 // The immutable halo uses a fixed base radius. Resize only that empty shell,
 // never the ground, models or decorations; the shared field places those.
 const atmosphere=model.object.getObjectByName('terrain:atmosphere');
 if(atmosphere instanceof Mesh&&radius!==10){const position=atmosphere.geometry.getAttribute('position');const shellRadius=Math.hypot(position.getX(0),position.getY(0),position.getZ(0));atmosphere.geometry.scale((shellRadius+radius-10)/shellRadius,(shellRadius+radius-10)/shellRadius,(shellRadius+radius-10)/shellRadius);atmosphere.geometry.computeBoundingSphere();}
 // The main canvas composites over a CSS sky. Preserve its destination alpha
 // while keeping Claude's additive RGB halo; otherwise a black opaque shell appears.
 if(alphaCanvas){const halo=model.object.getObjectByName('terrain:atmosphere');if(halo instanceof Mesh&&halo.material instanceof ShaderMaterial){const m=halo.material;m.blending=CustomBlending;m.blendEquation=AddEquation;m.blendSrc=SrcAlphaFactor;m.blendDst=OneFactor;m.blendEquationAlpha=AddEquation;m.blendSrcAlpha=ZeroFactor;m.blendDstAlpha=OneFactor;}}
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;model.dispose();kit.dispose();};model.object.userData.disposeOwned=dispose;
 return {object:model.object,ground:model.ground,stats:model.stats,tick:(t:number)=>model.tick(t),setSunDirection:(dir:Vec3)=>model.setSunDirection(dir),dispose};
}
