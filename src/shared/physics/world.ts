import { fieldOf,gradedField,objectSeat } from '../terrain.ts';
import type { HeightField } from '../../assets/claude-geometry/core/ground.ts';
import { Vector3, Quaternion } from 'three';
import { anchorQuaternion } from '../../assets/claude-geometry/core/anchor.ts';
import { legacyHeightField } from '../../assets/claude-geometry/core/ground.ts';
import { partTransform, pivotOf, groundCells } from '../../assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement } from '../../assets/claude-geometry/blueprint/model.ts';
import { structureFit } from '../blueprints.ts';
import { objectHeight, objectRadius } from '../planets.ts';
import type { PlanetView, PlacedObject } from '../planets.ts';
import { RADIUS, SPAWN } from '../world.ts';
import type { Vec3 } from '../world.ts';
import { PART_COLLIDERS } from './parts.ts';
import type { PartBox } from './parts.ts';

export const BODY_RADIUS=.18, BODY_HEIGHT=1.60, STEP_HEIGHT=.26, GRAVITY=12, MAX_FALL_SPEED=10;
export const FIXED_STEP=1/60, MAX_PATH_STEPS=28;
const SKIN=.002, SUBSTEP=.035, ground=legacyHeightField();
export interface GroundPose { position:Vec3; radius:number; verticalSpeed:number; grounded:boolean }
export interface GroundState extends Omit<GroundPose,'position'> { sequence:number; sceneRevision:number }
export type MotionStep=[number,number,number,number];
export interface GroundMotion { sequence:number; steps:MotionStep[] }
interface Collider { center:Vector3; half:Vector3; q:Quaternion; inverse:Quaternion; support:boolean; tag:string; objectId:string }
interface Body { objectId:string; dir:Vector3; broad:number; colliders:Collider[]; round?:{radius:number;height:number;base:number} }
const vec=(v:Vec3)=>new Vector3(...v);
export const terrainRadius=(p:Vec3)=>RADIUS+ground.heightAt(p);
export const groundPose=(p:Vec3,field:HeightField=ground):GroundPose=>({position:[...p],radius:RADIUS+field.heightAt(p),verticalSpeed:0,grounded:true});

/** Static planet collision world. No meshes, materials, renderer or DOM. */
export class GroundWorld {
  readonly bodies:Body[]=[];
  readonly revision:number;
  readonly planetId:string;
  readonly field:HeightField;readonly ground:HeightField;readonly generated:boolean;
  radius(p:Vec3){return RADIUS+this.ground.heightAt(p);}
  pose(p:Vec3){return groundPose(p,this.ground);}
  constructor(planet:Pick<PlanetView,'id'|'revision'|'objects'|'blueprints'|'environment'>){
    this.field=fieldOf(planet.environment);this.generated=!!planet.environment;this.ground=this.generated?gradedField(this.field,planet.objects,planet.blueprints):this.field;
    this.revision=planet.revision;this.planetId=planet.id;
    for(const object of planet.objects){
      if(object.kind==='structure')this.structure(object,planet.blueprints?.[object.blueprintHash!]??[]);
      else if(objectHeight(object)>.6){
        const radius=objectRadius(object),h=objectHeight(object),base=(this.generated?objectSeat(this.field,object,planet.blueprints).baseRadius:this.radius(object.position))+.015;
        const body:Body={objectId:object.id,dir:vec(object.position),broad:radius+1,colliders:[],round:{radius,height:h,base}};
        this.add(body,object.position,object.rotation,base,{tag:'legacy solid prop',center:[0,h/2,0],half:[radius,h/2,radius]});this.bodies.push(body);
      }
    }
  }
  private add(body:Body,dir:Vec3,yaw:number,base:number,shape:PartBox){
    const anchor=new Quaternion().fromArray(anchorQuaternion({dir,yaw}));
    const center=vec(shape.center).applyQuaternion(anchor).addScaledVector(vec(dir),base);
    const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),shape.yaw??0));
    body.colliders.push({center,half:vec(shape.half),q,inverse:q.clone().invert(),support:!!shape.support,tag:shape.tag,objectId:body.objectId});
  }
  private structure(o:PlacedObject,parts:PartPlacement[]){
    if(!parts.length)return;const fit=structureFit(parts,o.position,o.rotation,this.field),pivot=pivotOf(parts);
    const body:Body={objectId:o.id,dir:vec(o.position),broad:objectRadius(o)+1,colliders:[]};
    for(const part of parts){
      const t=partTransform(part,pivot),turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.yaw);
      for(const shape of PART_COLLIDERS[part.part]()){
        const center=vec(shape.center).applyQuaternion(turn).add(vec(t.position));
        this.add(body,o.position,o.rotation,fit.baseRadius,{...shape,center:center.toArray() as Vec3,yaw:t.yaw+(shape.yaw??0)});
      }
    }
    const depth=fit.foundationDepth+.46;
    for(const [x,z] of groundCells(parts))this.add(body,o.position,o.rotation,fit.baseRadius,{tag:'foundation',center:[x+.5-pivot.x,-depth/2,z+.5-pivot.z],half:[.5,depth/2,.5]});
    this.bodies.push(body);
  }
  private near(dir:Vector3){return this.bodies.filter(b=>b.dir.angleTo(dir)*RADIUS<b.broad+BODY_HEIGHT*.5);}
  /** Highest reachable support, using the bottom capsule sphere against the
   * plane. This includes the small correction for radial tilt on flat floors. */
  support(position:Vec3,ceiling:number):{radius:number;objectId:string|null;tag:string}{
    const dir=vec(position);let best={radius:this.radius(position),objectId:null as string|null,tag:'terrain'};
    for(const body of this.near(dir))for(const c of body.colliders){
      if(!c.support)continue;
      const u=dir.clone().applyQuaternion(c.inverse),origin=c.center.clone().applyQuaternion(c.inverse);
      if(u.y<.7)continue; // Static floors must be within 45 degrees of local gravity.
      const r=(origin.y+c.half.y+BODY_RADIUS)/u.y-BODY_RADIUS;
      if(r>ceiling+SKIN||r<best.radius)continue;
      const x=u.x*(r+BODY_RADIUS)-origin.x,z=u.z*(r+BODY_RADIUS)-origin.z;
      const dx=Math.max(0,Math.abs(x)-c.half.x),dz=Math.max(0,Math.abs(z)-c.half.z);
      if(Math.hypot(dx,dz)<=BODY_RADIUS+SUBSTEP)best={radius:r+SKIN,objectId:body.objectId,tag:c.tag};
    }
    return best;
  }
  private hit(p:Vec3,radius:number):{normal:Vector3;tag:string}|null{
    const dir=vec(p);let deepest:{normal:Vector3;tag:string;depth:number}|null=null;
    for(const body of this.near(dir)){
      if(body.round){const b=body.round,d=body.dir.angleTo(dir)*RADIUS;
        if(radius<b.base+b.height&&radius+BODY_HEIGHT>b.base&&d<b.radius+BODY_RADIUS-SKIN){
          const normal=dir.clone().addScaledVector(body.dir,-dir.dot(body.dir));if(normal.lengthSq()<1e-8)normal.set(1,0,0).projectOnPlane(dir);
          const depth=b.radius+BODY_RADIUS-d;if(!deepest||depth>deepest.depth)deepest={normal:normal.normalize(),tag:'legacy solid prop',depth};
        }continue;
      }
      for(const c of body.colliders){
      const u=dir.clone().applyQuaternion(c.inverse),origin=c.center.clone().applyQuaternion(c.inverse);
      const low=u.clone().multiplyScalar(radius+BODY_RADIUS).sub(origin),high=u.clone().multiplyScalar(radius+BODY_HEIGHT-BODY_RADIUS).sub(origin);
      if((['x','y','z'] as const).some(k=>Math.min(low[k],high[k])>c.half[k]+BODY_RADIUS||Math.max(low[k],high[k])< -c.half[k]-BODY_RADIUS))continue;
      for(let i=0;i<=8;i++){
        const h=BODY_RADIUS+(BODY_HEIGHT-2*BODY_RADIUS)*i/8;
        const point=u.clone().multiplyScalar(radius+h).sub(origin);
        const closest=point.clone().clamp(c.half.clone().negate(),c.half);
        const normal=point.clone().sub(closest),length=normal.length();
        if(length>=BODY_RADIUS-SKIN)continue;
        let depth=BODY_RADIUS-length;
        if(length>1e-8)normal.divideScalar(length);
        else{
          const distances=[c.half.x-Math.abs(point.x),c.half.y-Math.abs(point.y),c.half.z-Math.abs(point.z)];
          const axis=distances.indexOf(Math.min(...distances));normal.set(0,0,0).setComponent(axis,Math.sign(point.getComponent(axis))||1);depth+=distances[axis];
        }
        if(!deepest||depth>deepest.depth)deepest={normal:normal.applyQuaternion(c.q),tag:c.tag,depth};
      }
    }
    }
    return deepest;
  }
  blocked(pose:GroundPose){return !!this.hit(pose.position,pose.radius);}
  /** Bounded swept movement; collision normals remove inward motion so corners
   * slide instead of cancelling the entire step. Both client and server call it. */
  move(old:GroundPose,target:Vec3,dt:number):GroundPose{
    dt=Math.max(0,Math.min(.05,dt));const from=vec(old.position),to=vec(target).normalize();
    const count=Math.max(1,Math.ceil(from.angleTo(to)*Math.max(RADIUS,old.radius)/SUBSTEP));
    let pose={...old,position:[...old.position] as Vec3};
    for(let i=1;i<=count;i++){
      const desired=from.clone().lerp(to,i/count).normalize();const prior=vec(pose.position);
      const remaining=desired.clone().sub(prior).projectOnPlane(prior).multiplyScalar(RADIUS),next=prior.clone();
      const tick=dt/count;let accepted=false;
      for(let slide=0;slide<4;slide++){
        const candidate=next.clone().addScaledVector(remaining,1/RADIUS).normalize().toArray() as Vec3;
        const support=this.support(candidate,pose.radius+(pose.grounded?STEP_HEIGHT:SKIN));
        if(this.generated&&((this.field.waterLevel!==null&&this.field.heightAt(candidate)<this.field.waterLevel+.015)||support.radius>pose.radius+STEP_HEIGHT+SKIN))break;
        let radius=pose.radius,verticalSpeed=pose.verticalSpeed,grounded=false;
        if(pose.grounded&&Math.abs(support.radius-radius)<=STEP_HEIGHT+SKIN){radius=support.radius;verticalSpeed=0;grounded=true;}
        else{verticalSpeed=Math.max(-MAX_FALL_SPEED,verticalSpeed-GRAVITY*tick);radius+=verticalSpeed*tick;
          if(radius<=support.radius&&support.radius<=pose.radius+STEP_HEIGHT){radius=support.radius;verticalSpeed=0;grounded=true;}}
        const hit=this.hit(candidate,radius);
        if(!hit){pose={position:candidate,radius,verticalSpeed,grounded};accepted=true;break;}
        const normal=hit.normal.projectOnPlane(next);
        if(normal.lengthSq()<1e-6){remaining.set(0,0,0);break;}
        normal.normalize();const inward=remaining.dot(normal);if(inward<0)remaining.addScaledVector(normal,-inward);
        if(remaining.lengthSq()<1e-10)break;
      }
      if(!accepted&&!pose.grounded){
        const support=this.support(pose.position,pose.radius+SKIN),v=Math.max(-MAX_FALL_SPEED,pose.verticalSpeed-GRAVITY*tick),r=Math.max(support.radius,pose.radius+v*tick);
        if(!this.hit(pose.position,r))pose={...pose,radius:r,verticalSpeed:r<=support.radius?0:v,grounded:r<=support.radius};
      }
    }
    return pose;
  }
  /** Geometry changes/old invalid saves may require a safe local relocation.
   * Removed supports start a fall; an overlapping moved wall cannot trap a user. */
  recover(old:GroundPose):GroundPose{
    const support=this.support(old.position,old.radius+STEP_HEIGHT);
    const pose={...old,radius:Math.max(old.radius,support.radius),grounded:Math.abs(old.radius-support.radius)<STEP_HEIGHT,verticalSpeed:0};
    if(pose.grounded)pose.radius=support.radius;
    if(!this.blocked(pose))return pose;
    const up=vec(old.position),right=new Vector3(1,0,0).projectOnPlane(up);if(right.lengthSq()<.01)right.set(0,0,1).projectOnPlane(up);right.normalize();const front=new Vector3().crossVectors(up,right);
    for(let distance=.25;distance<=3;distance+=.25)for(let i=0;i<16;i++){
      const p=up.clone().addScaledVector(right,Math.cos(i*Math.PI/8)*distance/RADIUS).addScaledVector(front,Math.sin(i*Math.PI/8)*distance/RADIUS).normalize().toArray() as Vec3;
      const s=this.support(p,old.radius+STEP_HEIGHT),candidate={position:p,radius:s.radius,verticalSpeed:0,grounded:true};if(!this.blocked(candidate))return candidate;
    }
    return this.pose(SPAWN);
  }
  /** Clip a camera boom against the same solid proxies (including ceilings). */
  cameraDistance(start:Vector3,end:Vector3){
    const delta=end.clone().sub(start),length=delta.length();let best=length;
    if(this.generated)for(let i=1;i<=32;i++){const p=start.clone().lerp(end,i/32),r=p.length();if(r<this.radius(p.normalize().toArray() as Vec3)+.12){best=Math.min(best,Math.max(.02,length*(i-1)/32));break;}}
    for(const b of this.near(start.clone().normalize()))for(const c of b.colliders){
      const p=start.clone().sub(c.center).applyQuaternion(c.inverse),d=delta.clone().applyQuaternion(c.inverse);let min=0,max=1;
      for(const axis of ['x','y','z'] as const){const extent=c.half[axis]+.06;if(Math.abs(d[axis])<1e-8){if(Math.abs(p[axis])>extent){min=2;break;}}else{let a=(-extent-p[axis])/d[axis],z=(extent-p[axis])/d[axis];if(a>z)[a,z]=[z,a];min=Math.max(min,a);max=Math.min(max,z);}}
      if(min<=max&&min>=0&&min<1)best=Math.min(best,Math.max(0,min*length-.08));
    }
    return best;
  }
}
