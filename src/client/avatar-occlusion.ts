import {MathUtils,Mesh} from 'three';
import type {Material,Object3D} from 'three';

/** Fade only the local avatar when a real obstruction pushes its camera close.
 * Cached source materials remain untouched: neighbours and later coat changes
 * must retain their own colours and opacity. Geometry/collision never change. */
export class AvatarOcclusion {
  private copies=new Map<Material,Material>();
  private originals=new Map<Material,Material>();
  private amount=1;
  constructor(private readonly root:Object3D){}

  update(distance:number,dt:number,enabled=true){
    const target=enabled?.25+.75*MathUtils.smoothstep(distance,.65,2.1):1;
    // Reveal the route promptly on retraction, and restore the solid figure
    // gradually as the arm recovers. Never turn visibility off.
    this.amount=MathUtils.lerp(this.amount,target,1-Math.exp(-(target<this.amount?18:7)*Math.max(0,dt)));
    if(Math.abs(this.amount-target)<.001)this.amount=target;
    this.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const adapt=(current:Material)=>{
        const source=this.originals.get(current)??current;
        // Ground shadows and the naturally transparent materials keep their normal
        // treatment. Opaque clothing, head and satchel are the actual obstruction.
        if(source.transparent)return source;
        if(this.amount>=.999)return source;
        let copy=this.copies.get(source);
        if(!copy){
          copy=source.clone();copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;
          copy.userData={...source.userData,sharedResource:false,ownedResource:true};
          copy.transparent=true;copy.depthWrite=false;
          this.copies.set(source,copy);this.originals.set(copy,source);
        }
        copy.opacity=source.opacity*this.amount;
        return copy;
      };
      object.material=Array.isArray(object.material)?object.material.map(adapt):adapt(object.material);
    });
    return this.amount;
  }

  restore(){
    this.amount=1;this.update(3,0,false);
  }

  dispose(){this.restore();for(const copy of this.copies.values())copy.dispose();this.copies.clear();this.originals.clear();}
}
