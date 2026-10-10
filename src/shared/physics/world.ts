import { QUICK_PARTS } from '../quick-parts.ts';
import {HUB_SHIP} from '../harbour-layout.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS,publicField} from '../public-village.ts';
import {isSamplePublicRadius,samplePublicVillage} from '../sample-public-village.ts';
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
import { homeDoorLeaves } from '../home-door.ts';
import type { HomeDoorState } from '../home-door.ts';
import { PART_COLLIDERS } from './parts.ts';
import type { PartBox } from './parts.ts';
import { villageLampColliders } from './props.ts';
import { BODY_RADIUS, BODY_HEIGHT, STEP_HEIGHT, GROUND_SKIN as SKIN, GROUND_SUBSTEP as SUBSTEP } from './body.ts';
export { BODY_RADIUS, BODY_HEIGHT, STEP_HEIGHT } from './body.ts';

export const GRAVITY=12, MAX_FALL_SPEED=10, JUMP_SPEED=5.2;
export const SPRINT_FLAG=1, JUMP_FLAG=2;
export const FIXED_STEP=1/60, MAX_PATH_STEPS=28;
// Bump whenever static collision semantics change. Durable ground rows and
// movement batches use this same value; a scene revision alone is not enough.
export const PHYSICS_VERSION=7;
// Shared radial-ascent fix and public layout are released together.
export const HUB_PHYSICS_VERSION=7;
export const physicsVersionFor=(planetId:string)=>planetId==='hub'?HUB_PHYSICS_VERSION:PHYSICS_VERSION;
const ground=legacyHeightField();
export interface GroundPose { position:Vec3; radius:number; verticalSpeed:number; grounded:boolean; jumpHeld?:boolean }
export interface GroundState extends Omit<GroundPose,'position'> { sequence:number; sceneRevision:number; physicsVersion:number }
export type MotionStep=[number,number,number,number]|[number,number,number,number,number];
export interface GroundMotion { sequence:number; physicsVersion:number; steps:MotionStep[] }
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
  readonly field:HeightField;readonly ground:HeightField;readonly generated:boolean;readonly baseRadius:number;
  radius(p:Vec3){return RADIUS+this.ground.heightAt(p);}
  pose(p:Vec3){return groundPose(p,this.ground);}
  constructor(planet:Pick<PlanetView,'id'|'revision'|'objects'|'blueprints'|'environment'|'radius'|'homeDoor'>){
    this.baseRadius=planet.radius??RADIUS;
    const sample=planet.id==='hub'&&isSamplePublicRadius(this.baseRadius)?samplePublicVillage(this.baseRadius):null;
    const objects=planet.id==='hub'?[...(sample?.objects??HUB_OBJECTS),...planet.objects]:planet.objects;
    const blueprints=planet.id==='hub'?{...(sample?.blueprints??PUBLIC_CONTENTS),...planet.blueprints}:planet.blueprints;
    this.field=planet.id==='hub'&&!sample?publicField(planet.radius):fieldOf(sample?.environment??planet.environment,this.baseRadius);
    this.generated=!!(sample?.environment??planet.environment);this.ground=this.generated?gradedField(this.field,objects,blueprints):this.field;
    this.revision=planet.revision;this.planetId=planet.id;
    if(planet.id==='hub')this.harbour();
    for(const object of objects){
      if(object.kind==='structure')this.structure(object,blueprints?.[object.blueprintHash!]??[],planet.homeDoor);
      else if(object.assetVersion===2&&QUICK_PARTS[object.kind]){
        const contract=QUICK_PARTS[object.kind]!,base=(this.generated?objectSeat(this.field,object,planet.blueprints).baseRadius:this.radius(object.position))+.015;
        const body:Body={objectId:object.id,dir:vec(object.position),broad:objectRadius(object)+1,colliders:[]};
        for(const shape of PART_COLLIDERS[contract.part]())this.add(body,object.position,object.rotation,base,{...shape,center:shape.center.map((n,i)=>n+contract.offset[i]) as Vec3});
        this.bodies.push(body);
      }else if(object.assetVersion===2&&object.kind==='lamp'){
        const base=(this.generated?objectSeat(this.field,object,planet.blueprints).baseRadius:this.radius(object.position))+.015;
        const body:Body={objectId:object.id,dir:vec(object.position),broad:objectRadius(object)+1,colliders:[]};
        for(const shape of villageLampColliders())this.add(body,object.position,object.rotation,base,shape);
        this.bodies.push(body);
      }else if(objectHeight(object)>.6){
        const radius=objectRadius(object),h=objectHeight(object),base=(this.generated?objectSeat(this.field,object,planet.blueprints).baseRadius:this.radius(object.position))+.015;
        const body:Body={objectId:object.id,dir:vec(object.position),broad:radius+1,colliders:[],round:{radius,height:h,base}};
        this.add(body,object.position,object.rotation,base,{tag:'legacy solid prop',center:[0,h/2,0],half:[radius,h/2,radius]});this.bodies.push(body);
      }
    }
  }
  private harbour(){
    // Craft is a travel-system object. All village construction below goes
    // through the exact same object/structure path as a player's colony.
    this.bodies.push({objectId:'hub-ship',dir:vec(HUB_SHIP),broad:3.2,colliders:[],round:{radius:2.1,height:2.5,base:this.radius(HUB_SHIP)}});
  }
  private add(body:Body,dir:Vec3,yaw:number,base:number,shape:PartBox){
    const anchor=new Quaternion().fromArray(anchorQuaternion({dir,yaw}));
    const center=vec(shape.center).applyQuaternion(anchor).addScaledVector(vec(dir),base);
    const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),shape.yaw??0)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),shape.pitch??0));
    body.colliders.push({center,half:vec(shape.half),q,inverse:q.clone().invert(),support:!!shape.support,tag:shape.tag,objectId:body.objectId});
  }
  private structure(o:PlacedObject,parts:PartPlacement[],homeDoor?:HomeDoorState){
    if(!parts.length)return;const fit=structureFit(parts,o.position,o.rotation,this.field),pivot=pivotOf(parts);
    const body:Body={objectId:o.id,dir:vec(o.position),broad:objectRadius(o)+1,colliders:[]};
    for(const part of parts){
      const t=partTransform(part,pivot),turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.yaw);
      const dynamic=homeDoor?.buildingId===o.id&&homeDoor.partNumber===part.n&&part.part==='wall.door.open';
      const shapes=PART_COLLIDERS[part.part]();
      const colliders=dynamic?[...shapes.filter(shape=>shape.tag!=='sliding leaf'),...homeDoorLeaves(homeDoor.open)]:shapes;
      for(const shape of colliders){
        const center=vec(shape.center).applyQuaternion(turn).add(vec(t.position));
        this.add(body,o.position,o.rotation,fit.baseRadius,{...shape,center:center.toArray() as Vec3,yaw:t.yaw+(shape.yaw??0)});
      }
    }
    const depth=fit.foundationDepth+.46;
    for(const [x,z] of groundCells(parts))this.add(body,o.position,o.rotation,fit.baseRadius,{tag:'foundation',center:[x+.5-pivot.x,-depth/2,z+.5-pivot.z],half:[.5,depth/2,.5]});
    this.bodies.push(body);
  }
  private near(dir:Vector3){return this.bodies.filter(b=>b.dir.angleTo(dir)*this.baseRadius<b.broad+BODY_HEIGHT*.5);}
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
  private hit(p:Vec3,radius:number):{normal:Vector3;tag:string;depth:number}|null{
    const dir=vec(p);let deepest:{normal:Vector3;tag:string;depth:number}|null=null;
    for(const body of this.near(dir)){
      if(body.round){const b=body.round,d=body.dir.angleTo(dir)*this.baseRadius;
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
  private radial(pose:GroundPose,position:Vec3,dt:number):GroundPose{
    const support=this.support(position,pose.radius+(pose.grounded?STEP_HEIGHT:SKIN));
    if(pose.grounded&&Math.abs(support.radius-pose.radius)<=STEP_HEIGHT+SKIN)return {...pose,position,radius:support.radius,verticalSpeed:0,grounded:true};
    let verticalSpeed=Math.max(-MAX_FALL_SPEED,pose.verticalSpeed-GRAVITY*dt);
    let radius=pose.radius+(pose.verticalSpeed+verticalSpeed)*.5*dt,grounded=false;
    if(verticalSpeed<=0&&radius<=support.radius&&support.radius<=pose.radius+STEP_HEIGHT){radius=support.radius;verticalSpeed=0;grounded=true;}
    // A radial rise can enter a tilted side wall as well as a ceiling.
    // Clip any inward ascent; otherwise a rejected frame can freeze velocity.
    if(radius>pose.radius){
      const up=vec(position),count=Math.max(1,Math.ceil((radius-pose.radius)/SUBSTEP));let safe=pose.radius;
      for(let i=1;i<=count;i++){
        const next=pose.radius+(radius-pose.radius)*i/count,hit=this.hit(position,next);
        if(hit&&hit.normal.dot(up)<-1e-5){
          let low=safe,high=next;for(let j=0;j<10;j++){const mid=(low+high)/2,h=this.hit(position,mid);if(h&&h.normal.dot(up)<-1e-5)high=mid;else low=mid;}
          radius=low;verticalSpeed=0;break;
        }safe=next;
      }
    }
    return {...pose,position,radius,verticalSpeed,grounded};
  }
  /** Bounded swept movement; collision normals remove inward motion so corners
   * slide instead of cancelling the entire step. Both client and server call it. */
  move(old:GroundPose,target:Vec3,dt:number,flags=0):GroundPose{
    dt=Math.max(0,Math.min(.05,dt));const from=vec(old.position),to=vec(target).normalize();
    const count=Math.max(1,Math.ceil(from.angleTo(to)*Math.max(this.baseRadius,old.radius)/SUBSTEP));
    const jumpHeld=!!(flags&JUMP_FLAG);let pose={...old,jumpHeld,position:[...old.position] as Vec3};
    if(jumpHeld&&!old.jumpHeld&&old.grounded){pose.grounded=false;pose.verticalSpeed=JUMP_SPEED;}
    for(let i=1;i<=count;i++){
      const desired=from.clone().lerp(to,i/count).normalize();const prior=vec(pose.position);
      const remaining=desired.clone().sub(prior).projectOnPlane(prior).multiplyScalar(pose.radius),next=prior.clone();
      const tick=dt/count;let accepted=false;
      for(let slide=0;slide<4;slide++){
        const candidate=next.clone().addScaledVector(remaining,1/pose.radius).normalize().toArray() as Vec3;
        const support=this.support(candidate,pose.radius+(pose.grounded?STEP_HEIGHT:SKIN));
        if(this.generated&&((this.field.waterLevel!==null&&this.field.heightAt(candidate)<this.field.waterLevel+.015)||support.radius>pose.radius+STEP_HEIGHT+SKIN))break;
        const radial=this.radial(pose,candidate,tick),{radius}=radial;
        const hit=this.hit(candidate,radius);
        if(!hit){pose={...radial,jumpHeld};accepted=true;break;}
        const normal=hit.normal.projectOnPlane(next);
        if(normal.lengthSq()<1e-6){remaining.set(0,0,0);break;}
        normal.normalize();const inward=remaining.dot(normal);
        if(inward<0)remaining.addScaledVector(normal,-inward);
        // Projection alone can leave the candidate capsule overlapping a corner
        // (or a leaf after a radial step-up). Resolve that penetration as part
        // of the slide, within the remaining input distance; never add speed.
        const budget=remaining.length();if(budget<1e-5)break;
        remaining.addScaledVector(normal,hit.depth+SKIN).clampLength(0,budget);
      }
      if(!accepted&&!pose.grounded){
        let radial=this.radial(pose,pose.position,tick),hit=this.hit(radial.position,radial.radius);
        // Radial gravity tilts towards an adjacent cabinet/wall as feet fall.
        // Slide that small penetration out along its side, bounded by the fall
        // distance; rejecting the entire tick would freeze vertical velocity.
        const budget=Math.max(0,pose.radius-radial.radius);let spent=0;
        for(let slide=0;hit&&budget>0&&slide<4;slide++){
          const up=vec(radial.position),away=hit.normal.clone().projectOnPlane(up);
          if(away.lengthSq()<.01)break;
          const shift=Math.min(hit.depth+SKIN,budget-spent);if(shift<=0)break;spent+=shift;
          const position=up.addScaledVector(away.normalize(),shift/radial.radius).normalize().toArray() as Vec3;
          radial=this.radial(pose,position,tick);hit=this.hit(radial.position,radial.radius);
        }
        if(!hit)pose={...radial,jumpHeld};
      }
    }
    return pose;
  }
  /** Geometry changes/old invalid saves may require a safe local relocation.
   * Removed supports start a fall; an overlapping moved wall cannot trap a user. */
  recover(old:GroundPose):GroundPose{
    const support=this.support(old.position,old.radius+STEP_HEIGHT);
    const pose={...old,radius:Math.max(old.radius,support.radius),grounded:Math.abs(old.radius-support.radius)<STEP_HEIGHT,verticalSpeed:0,jumpHeld:false};
    if(pose.grounded)pose.radius=support.radius;
    if(!this.blocked(pose))return pose;
    const up=vec(old.position),right=new Vector3(1,0,0).projectOnPlane(up);if(right.lengthSq()<.01)right.set(0,0,1).projectOnPlane(up);right.normalize();const front=new Vector3().crossVectors(up,right);
    for(let distance=.25;distance<=3;distance+=.25)for(let i=0;i<16;i++){
      const p=up.clone().addScaledVector(right,Math.cos(i*Math.PI/8)*distance/this.baseRadius).addScaledVector(front,Math.sin(i*Math.PI/8)*distance/this.baseRadius).normalize().toArray() as Vec3;
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
