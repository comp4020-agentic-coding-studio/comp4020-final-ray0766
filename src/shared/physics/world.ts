import { isOpenDoorPartId } from '../blueprint-parts.ts';
import { QUICK_PARTS } from '../quick-parts.ts';
import {HUB_SHIP} from '../harbour-layout.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS,publicField} from '../public-village.ts';
import {isSamplePublicRadius,samplePublicVillage} from '../sample-public-village.ts';
import { fieldOf,gradedField,objectSeat, trustedFieldRadiusUpperBound } from '../terrain.ts';
import type { HeightField } from '../../assets/claude-geometry/core/ground.ts';
import { Box3, Vector3, Quaternion } from 'three';
import { anchorQuaternion } from '../../assets/claude-geometry/core/anchor.ts';
import { legacyHeightField } from '../../assets/claude-geometry/core/ground.ts';
import { partTransform, pivotOf, groundCells } from '../blueprint-model.ts';
import type { PartPlacement } from '../blueprint-model.ts';
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
import { mainPlanetNetwork } from '../planet-plan/main-planet.ts';
import { CONSOLE_COLLIDERS, HOME_TERMINAL_COLLIDERS, HUB_CONSOLE, HUB_CONSOLE_YAW, HUB_TERMINAL, HUB_TERMINAL_YAW, HOME_TOWER, homeTerminal, TERMINAL, TERMINAL_COLLIDERS } from '../starport-terminal.ts';
import { kerbRuns } from '../planet-plan/kerbs.ts';
import { ROAD_PROFILES, SURFACE } from '../planet-plan/params.ts';
export { BODY_RADIUS, BODY_HEIGHT, STEP_HEIGHT } from './body.ts';

export const GRAVITY=12, MAX_FALL_SPEED=10;
export const SPRINT_FLAG=1;
/** Reserved legacy wire bit; no longer starts a jump. */
export const JUMP_FLAG=2;
export const FIXED_STEP=1/60, MAX_PATH_STEPS=28;
// Bump whenever static collision semantics change. Durable ground rows and
// movement batches use this same value; a scene revision alone is not enough.
// 10: walking only; legacy jump flags cannot apply an impulse.
export const PHYSICS_VERSION=10;
// Fence clients carrying the previous bundled public collision layout.
// 11: public walking uses the same no-jump contract.
export const HUB_PHYSICS_VERSION=11;
export const physicsVersionFor=(planetId:string)=>planetId==='hub'?HUB_PHYSICS_VERSION:PHYSICS_VERSION;
const ground=legacyHeightField();
export interface GroundPose { position:Vec3; radius:number; verticalSpeed:number; grounded:boolean; jumpHeld?:boolean }
export interface GroundState extends Omit<GroundPose,'position'> { sequence:number; sceneRevision:number; physicsVersion:number }
export type MotionStep=[number,number,number,number]|[number,number,number,number,number];
export interface GroundMotion { sequence:number; physicsVersion:number; steps:MotionStep[] }
interface Collider { center:Vector3; half:Vector3; q:Quaternion; inverse:Quaternion; support:boolean; tag:string; objectId:string }
interface Body { objectId:string; dir:Vector3; broad:number; colliders:Collider[]; cameraBounds?:Box3; round?:{radius:number;height:number;base:number} }
const vec=(v:Vec3)=>new Vector3(...v);
export const terrainRadius=(p:Vec3)=>RADIUS+ground.heightAt(p);
export const groundPose=(p:Vec3,field:HeightField=ground):GroundPose=>({position:[...p],radius:RADIUS+field.heightAt(p),verticalSpeed:0,grounded:true});

/** Static planet collision world. No meshes, materials, renderer or DOM. */
interface CameraTerrainBoundProof {
 field: HeightField; fieldHeightAt: HeightField['heightAt']; ground: HeightField; groundHeightAt: HeightField['heightAt'];
 baseRadius: number; ceiling: number;
}
const cameraTerrainBounds = new WeakMap<GroundWorld, CameraTerrainBoundProof>();

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
    if(planet.id==='hub'&&sample){this.kerbs();this.terminal();this.console();}
    if(planet.id!=='hub'&&this.baseRadius>20)this.homeTerminal();
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
    // Only fieldOf's protected creation provenance can issue a bound. Taking
    // the currently visible heightAt function as proof would trust a field
    // monkeypatched before this world was constructed.
    const ceiling = this.generated ? trustedFieldRadiusUpperBound(this.field) : null;
    if (ceiling !== null) cameraTerrainBounds.set(this, { field: this.field, fieldHeightAt: this.field.heightAt,
      ground: this.ground, groundHeightAt: this.ground.heightAt, baseRadius: this.baseRadius, ceiling });
  }
  private harbour(){
    // Craft is a travel-system object. All village construction below goes
    // through the exact same object/structure path as a player's colony.
    this.bodies.push({objectId:'hub-ship',dir:vec(HUB_SHIP),broad:3.2,colliders:[],round:{radius:2.1,height:2.5,base:this.radius(HUB_SHIP)}});
  }
  /** The starport terminal beside the planned harbour's boarding gate: a round body for walking, boxes for the camera. */
  private terminal(){
    const base=this.radius(HUB_TERMINAL),body:Body={objectId:'hub-terminal',dir:vec(HUB_TERMINAL),broad:2.6,colliders:[],round:{radius:TERMINAL.plinth,height:TERMINAL.top,base}};
    for(const shape of TERMINAL_COLLIDERS)this.add(body,HUB_TERMINAL,HUB_TERMINAL_YAW,base,shape);
    this.bodies.push(body);
  }
  /** The boarding console on the harbour gate's ring. */
  private console(){
    const base=this.radius(HUB_CONSOLE),body:Body={objectId:'hub-console',dir:vec(HUB_CONSOLE),broad:1,colliders:[]};
    for(const shape of CONSOLE_COLLIDERS)this.add(body,HUB_CONSOLE,HUB_CONSOLE_YAW,base,shape);
    this.bodies.push(body);
  }
  /** A home's slim tower inside the landing pad's clear disc; the pad centre stays free for landing. */
  private homeTerminal(){
    const at=homeTerminal(this.baseRadius),base=this.radius(at.dir),body:Body={objectId:'home-terminal',dir:vec(at.dir),broad:2.6,colliders:[],round:{radius:HOME_TOWER.plinth,height:TERMINAL.top,base}};
    for(const shape of HOME_TERMINAL_COLLIDERS)this.add(body,at.dir,at.yaw,base,shape);
    this.bodies.push(body);
  }
  /** Low kerbs along the planned main streets: walkable 6 cm steps on the
   * same centrelines the street meshes draw (src/shared/planet-plan/kerbs.ts). */
  private kerbs(){
    const P=ROAD_PROFILES.main,top=SURFACE.lift+P.kerbHeight,bottom=-.15;
    for(const run of kerbRuns(mainPlanetNetwork()))for(let start=0;start<run.points.length-1;start+=6){
      const chunk=run.points.slice(start,Math.min(run.points.length,start+7)),mid=chunk[Math.floor(chunk.length/2)];
      const base=this.radius(mid),anchor=new Quaternion().fromArray(anchorQuaternion({dir:mid,yaw:0})),inverse=anchor.clone().invert(),origin=vec(mid).multiplyScalar(base);
      const body:Body={objectId:`kerb:${run.id}:${start}`,dir:vec(mid),broad:0,colliders:[]};
      for(let i=1;i<chunk.length;i++){
        const a=vec(chunk[i-1]).multiplyScalar(this.radius(chunk[i-1])),b=vec(chunk[i]).multiplyScalar(this.radius(chunk[i]));
        const centre=a.clone().add(b).multiplyScalar(.5).sub(origin).applyQuaternion(inverse),d=b.clone().sub(a).applyQuaternion(inverse),length=d.length();
        if(length<1e-4)continue;
        const yaw=Math.atan2(d.x,d.z),pitch=-Math.atan2(d.y,Math.hypot(d.x,d.z));
        body.broad=Math.max(body.broad,centre.length()+length/2+.2);
        this.add(body,mid,0,base,{tag:'kerb',center:[centre.x,centre.y+(top+bottom)/2,centre.z],half:[P.kerb/2,(top-bottom)/2,length/2+.01],yaw,pitch,support:true});
      }
      if(body.colliders.length)this.bodies.push(body);
    }
  }
  private add(body:Body,dir:Vec3,yaw:number,base:number,shape:PartBox){
    const anchor=new Quaternion().fromArray(anchorQuaternion({dir,yaw}));
    const center=vec(shape.center).applyQuaternion(anchor).addScaledVector(vec(dir),base);
    const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),shape.yaw??0)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),shape.pitch??0));
    body.colliders.push({center,half:vec(shape.half),q,inverse:q.clone().invert(),support:!!shape.support,tag:shape.tag,objectId:body.objectId});
    // Enclose the same padded OBBs used by cameraDistance, including roofs and
    // deep foundations. A start-only ground query misses neighbours along the
    // camera boom. Cache each body's world bounds once; movement stays unchanged.
    const half=vec(shape.half).addScalar(.06),axes=[
      new Vector3(half.x,0,0).applyQuaternion(q),new Vector3(0,half.y,0).applyQuaternion(q),new Vector3(0,0,half.z).applyQuaternion(q),
    ];
    const extent=new Vector3().fromArray((['x','y','z'] as const).map(axis=>axes.reduce((sum,v)=>sum+Math.abs(v[axis]),0)+1e-9));
    body.cameraBounds??=new Box3();
    body.cameraBounds.expandByPoint(center.clone().sub(extent)).expandByPoint(center.clone().add(extent));
  }
  private structure(o:PlacedObject,parts:PartPlacement[],homeDoor?:HomeDoorState){
    if(!parts.length)return;const fit=structureFit(parts,o.position,o.rotation,this.field),pivot=pivotOf(parts);
    const body:Body={objectId:o.id,dir:vec(o.position),broad:objectRadius(o)+1,colliders:[]};
    for(const part of parts){
      const t=partTransform(part,pivot),turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.yaw);
      const dynamic=homeDoor?.buildingId===o.id&&homeDoor.partNumber===part.n&&isOpenDoorPartId(part.part);
      const shapes=PART_COLLIDERS[part.part]();
      const colliders=dynamic?[...shapes.filter(shape=>shape.tag!=='sliding leaf'&&shape.tag!=='wide door leaf'),...homeDoorLeaves(homeDoor.open,part.part as import('../home-door.ts').HomeDoorPartId)]:shapes;
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
    const angle=from.angleTo(to),count=Math.max(1,Math.ceil(angle*Math.max(this.baseRadius,old.radius)/SUBSTEP));
    // Keep the shared call shape for saved motion replays, but no input can
    // create upward velocity. Existing airborne saves may still fall naturally.
    void flags;const jumpHeld=false;let pose={...old,jumpHeld,verticalSpeed:Math.min(0,old.verticalSpeed),position:[...old.position] as Vec3};
    for(let i=1;i<=count;i++){
      const desired=from.clone().lerp(to,i/count).normalize();const prior=vec(pose.position);
      const remaining=desired.clone().sub(prior).projectOnPlane(prior).multiplyScalar(pose.radius),next=prior.clone();
      const tick=dt/count;let accepted=false;
      for(let slide=0;slide<4;slide++){
        // A previous slide can leave us off the original substep path. Chasing
        // its next point must not turn that lateral correction into extra speed.
        // Bound each candidate before support/collision checks, not afterwards.
        const direction=next.clone().addScaledVector(remaining,1/pose.radius).normalize();
        const moved=from.angleTo(direction),limit=angle*i/count;
        if(moved>limit){const axis=new Vector3().crossVectors(from,direction).normalize();direction.copy(from).applyAxisAngle(axis,limit).normalize();}
        const candidate=direction.toArray() as Vec3;
        const support=this.support(candidate,pose.radius+(pose.grounded?STEP_HEIGHT:SKIN));
        if(this.generated&&((this.field.waterLevel!==null&&this.field.heightAt(candidate)<this.field.waterLevel+.015)||support.radius>pose.radius+STEP_HEIGHT+SKIN))break;
        let radial=this.radial(pose,candidate,tick),hit=this.hit(candidate,radial.radius);
        // At a stair edge the lower tread may be reachable while the capsule
        // still overlaps the upper riser. Move clear at the current height and
        // let gravity finish the descent instead of snapping into that riser.
        if(hit&&pose.grounded&&radial.radius<pose.radius&&!this.hit(candidate,pose.radius)){
          radial={...pose,position:candidate,grounded:false,verticalSpeed:0};hit=null;
        }
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
  /** Clip a camera boom against solid proxies. Omitted radius preserves legacy sight queries. */
  cameraDistance(start:Vector3,end:Vector3,probeRadius?:number){
    const padding=probeRadius===undefined?.06:Math.max(0,Number.isFinite(probeRadius)?probeRadius:.06);
    const delta=end.clone().sub(start),length=delta.length();let best=length;
    // Explicit camera probes also respect ordinary spherical worlds. The old
    // two-argument sight query keeps its generated-terrain semantics unchanged.
    if(this.generated||probeRadius!==undefined)for(let i=probeRadius===undefined?1:0;i<=32;i++){
      const p=start.clone().lerp(end,i/32),r=p.length();
      if(r<this.radius(p.normalize().toArray() as Vec3)+Math.max(.12,padding)){
        best=Math.min(best,Math.max(probeRadius===undefined?.02:0,length*(i-1)/32));break;
      }
    }
    // Cached bounds enclose OBBs padded by .06. A larger local padding can grow
    // their world-axis extent by at most sqrt(3) times the difference.
    const sweep=new Box3().setFromPoints([start,end]).expandByScalar(Math.max(0,padding-.06)*Math.sqrt(3));
    for(const b of this.bodies){
      if(b.cameraBounds&&!b.cameraBounds.intersectsBox(sweep))continue;
      for(const c of b.colliders){
      const p=start.clone().sub(c.center).applyQuaternion(c.inverse),d=delta.clone().applyQuaternion(c.inverse);let min=0,max=1;
      for(const axis of ['x','y','z'] as const){const extent=c.half[axis]+padding;if(Math.abs(d[axis])<1e-8){if(Math.abs(p[axis])>extent){min=2;break;}}else{let a=(-extent-p[axis])/d[axis],z=(extent-p[axis])/d[axis];if(a>z)[a,z]=[z,a];min=Math.max(min,a);max=Math.min(max,z);}}
      if(min<=max&&min>=0&&min<1)best=Math.min(best,Math.max(0,min*length-.08));
      }
    }
    return best;
  }
}

const originalGroundWorldRadius = GroundWorld.prototype.radius;
/** Conservative camera-only shortcut metadata. Legacy/unknown/replaced fields
 * retain exact radius queries. No height, physics, version or stored state is
 * changed. The generated source is capped, radial rebasing adds a constant,
 * and gradeFoundations can only lower that radial surface via Math.min. */
export function cameraTerrainRadiusUpperBound(world: GroundWorld): number | null {
 const proof = cameraTerrainBounds.get(world);
 if (!proof || !world.generated || world.radius !== originalGroundWorldRadius
   || world.field !== proof.field || world.ground !== proof.ground
   || world.field.heightAt !== proof.fieldHeightAt || world.ground.heightAt !== proof.groundHeightAt
   || !Object.is(world.baseRadius, proof.baseRadius)
   || trustedFieldRadiusUpperBound(world.field) !== proof.ceiling) return null;
 return proof.ceiling;
}
