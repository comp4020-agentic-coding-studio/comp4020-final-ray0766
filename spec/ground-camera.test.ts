import {describe,expect,it} from 'vitest';
import {PerspectiveCamera,Quaternion,Vector3} from 'three';
import {GroundCameraRig} from '../src/client/ground-camera.ts';
import {anchorQuaternion} from '../src/assets/claude-geometry/core/anchor.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {structureFit,structureSize} from '../src/shared/blueprints.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {normalize,type Vec3} from '../src/shared/world.ts';
import {cameraEyePenetration} from './ground-camera-safety.ts';

type View=ReturnType<GroundCameraRig['update']>;
const locations:Vec3[]=[[0,1,0],[0,-1,0],[0,0,-1],normalize([.5,-.4,-.7])];
function fixture(position:Vec3,rotation:number,roof=false,roofWidth=1){
  const radius=21.6,parts:PartPlacement[]=roof
    ?Array.from({length:5*roofWidth},(_,i)=>{const z=i%5,x=Math.floor(i/5)+Math.floor((5-roofWidth)/2);return[{n:i*2+1,part:'floor.deck' as const,x,z,rot:0 as const,level:0},{n:i*2+2,part:'roof.deck' as const,x,z,rot:0 as const,level:1}];}).flat()
    :[{n:1,part:'floor.deck',x:2,z:2,rot:0,level:0},{n:2,part:'wall.solid',x:2,z:2,rot:0,level:0}];
  const object={id:'camera-regression-neighbour',kind:'structure' as const,position,rotation,version:1,blueprintHash:'test',...structureSize(parts)};
  const fit=structureFit(parts,position,rotation,fieldOf(undefined,radius)),turn=new Quaternion().fromArray(anchorQuaternion({dir:position,yaw:rotation}));
  const point=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(turn).addScaledVector(new Vector3(...position),fit.baseRadius);
  const world=new GroundWorld({id:'camera-regression',revision:1,radius,objects:[object],blueprints:{test:parts}});
  return{world,point,radius,parts,object,up:new Vector3(...position),heading:new Vector3(0,0,-1).applyQuaternion(turn)};
}
function assertPose(view:View,up:Vector3,movingAnchorAllowance=0){
  for(const p of [view.position,view.target,view.up,view.direction])expect(p.toArray().every(Number.isFinite)).toBe(true);
  expect(view.up.distanceTo(up)).toBeLessThan(1e-9);expect(view.direction.length()).toBeCloseTo(1,9);
  expect(view.distance).toBeGreaterThanOrEqual(0);expect(view.distance).toBeLessThanOrEqual(view.desiredDistance+movingAnchorAllowance+1e-9);
  if(view.position.distanceTo(view.target)>1e-8)expect(view.target.clone().sub(view.position).normalize().dot(view.direction)).toBeGreaterThan(1-1e-9);
}
function project(point:Vector3,view:View,portrait:boolean){
  const camera=new PerspectiveCamera(portrait?62:54,portrait?390/844:1440/900,.08,2400);
  camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);
  return point.clone().project(camera);
}

describe('final collision-resolved ground camera',()=>{
  it('frames the torso safely when the central boom meets a real wall, without the old upward flip',()=>{
    for(const location of locations)for(const portrait of [false,true]){
      const f=fixture(location,.7),feet=f.point(0,0,-.8),rig=new GroundCameraRig();
      const view=rig.update({feet,up:f.up,heading:f.heading,pitch:0,portrait,radius:f.radius,dt:1/60,instant:true,probe:(a,b,r)=>f.world.cameraDistance(a,b,r)});
      assertPose(view,f.up);expect(view.distance).toBeGreaterThan(.2);expect(view.centerDistance).toBeLessThan(2.5);
      expect(view.direction.dot(f.up)).toBeLessThan(0);
      const torso=project(feet.clone().addScaledVector(f.up,1.15),view,portrait);
      expect(Math.abs(torso.x)).toBeLessThan(.95);expect(Math.abs(torso.y)).toBeLessThan(.95);expect(Math.abs(torso.z)).toBeLessThan(1);
      const pivot=feet.clone().addScaledVector(f.up,1.15);expect(f.world.cameraDistance(pivot,view.position,0)).toBeGreaterThanOrEqual(view.distance-1e-7);
      expect(cameraEyePenetration(f.world,view.position,view.probeRadius).depth).toBeLessThanOrEqual(1e-7);
    }
  });

  it('uses a bounded right shoulder at a 1m boom without changing aim or moving the torso centre out of frame',()=>{
    for(const location of locations)for(const portrait of [false,true]){
      const up=new Vector3(...location),feet=up.clone().multiplyScalar(21.6);
      const heading=new Vector3(0,0,-1).projectOnPlane(up).normalize();
      if(heading.lengthSq()<.5)heading.set(1,0,0).projectOnPlane(up).normalize();
      const right=new Vector3().crossVectors(heading,up).normalize(),pivot=feet.clone().addScaledVector(up,1.15);
      const input={feet,up,heading,pitch:0,portrait,radius:21.6,dt:1/60,instant:true};
      const centered=new GroundCameraRig().update({...input,probe:(a,b)=>a.distanceTo(b)});
      const shifted=new GroundCameraRig().update({...input,probe:()=>1});
      assertPose(shifted,up);expect(shifted.direction.angleTo(centered.direction)).toBeLessThan(1e-6);
      expect(shifted.position.clone().sub(pivot).dot(right)).toBeGreaterThan(.02);
      expect(shifted.shoulder).toBeGreaterThan(0);expect(shifted.shoulder).toBeLessThanOrEqual(portrait?.18:.25);
      expect(shifted.position.distanceTo(pivot)).toBeCloseTo(1,9);
      // Courier coat: CapsuleGeometry(.19,.3), torso group y=.93 + mesh y=.02.
      // At a 1m boom the narrow viewport may crop a coat edge; the actual torso
      // centre and part of its width must stay visible, not only the aim pivot.
      const torso=feet.clone().addScaledVector(up,.95),centre=project(torso,shifted,portrait);
      expect(Math.abs(centre.x)).toBeLessThan(.95);expect(Math.abs(centre.y)).toBeLessThan(1);expect(Math.abs(centre.z)).toBeLessThan(1);
      const sides=[-1,1].map(side=>project(torso.clone().addScaledVector(right,side*.19),shifted,portrait));
      expect(Math.max(...sides.map(p=>p.x))).toBeGreaterThan(-1);expect(Math.min(...sides.map(p=>p.x))).toBeLessThan(1);
    }
  });

  it('uses explicit private-world FOV and narrow nonportrait aspect for its framing status',()=>{
    const up=new Vector3(0,1,0),feet=up.clone().multiplyScalar(9),heading=new Vector3(0,0,-1);
    // A tall 720x1280 window is nonportrait in the game's width-based layout,
    // so private-world 48/58 degree framing cannot be inferred from that flag.
    for(const fov of [48,58])for(const aspect of [720/1280,390/844])for(const clipped of [false,true]){
      const view=new GroundCameraRig().update({feet,up,heading,pitch:0,portrait:false,radius:9,dt:0,instant:true,fov,aspect,
        probe:(a,b)=>clipped?Math.min(1,a.distanceTo(b)):a.distanceTo(b)});
      const actual=new PerspectiveCamera(fov,aspect,.08,2400);
      actual.position.copy(view.position);actual.up.copy(view.up);actual.lookAt(view.target);actual.updateMatrixWorld(true);
      const inside=[.95,1.45].every(height=>{
        const point=feet.clone().addScaledVector(up,height),ndc=point.clone().project(actual);
        return point.clone().sub(view.position).dot(view.direction)>.12&&Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.95;
      });
      expect(view.framingLimited,`FOV=${fov} aspect=${aspect} clipped=${clipped}`).toBe(!inside);
      if(!clipped)expect(inside).toBe(true);
    }
  });

  it('reprobes the shoulder arm and does not amplify its offset from that second obstruction',()=>{
    const up=new Vector3(0,1,0),feet=up.clone().multiplyScalar(21.6),heading=new Vector3(0,0,-1),right=new Vector3(1,0,0),rig=new GroundCameraRig();
    const input={feet,up,heading,pitch:0,portrait:false,radius:21.6,dt:1/60};
    const probes:{start:Vector3;end:Vector3;radius:number;allowed:number}[]=[];
    const probe=(start:Vector3,end:Vector3,radius:number)=>{
      const allowed=Math.abs(end.clone().sub(start).dot(right))<1e-8?1.7:.35;
      probes.push({start:start.clone(),end:end.clone(),radius,allowed});return allowed;
    };
    const first=rig.update({...input,instant:true,probe});
    expect(probes.length).toBeGreaterThanOrEqual(2);expect(first.centerDistance).toBeCloseTo(1.7,9);
    expect(first.distance).toBeCloseTo(.35,9);expect(first.shoulder).toBeGreaterThan(0);expect(first.shoulder).toBeLessThan(.25);
    const pivot=feet.clone().addScaledVector(up,1.15);
    // Find the shifted candidate by its geometry and physical radius, not by
    // call order: optical and endpoint checks legitimately follow this query.
    const shiftedQueries=probes.filter(p=>p.radius===.2&&p.start.distanceTo(pivot)<1e-9
      &&p.end.distanceTo(p.start)>1.7&&p.end.clone().sub(p.start).dot(right)>.01);
    expect(shiftedQueries.length).toBeGreaterThan(0);
    expect(shiftedQueries.every(p=>p.allowed===.35)).toBe(true);
    // The emitted eye must use the shifted limit, not borrow 1.7m of central
    // clearance. Its optical LOS and solid endpoint/movement remain distinct.
    expect(first.position.distanceTo(pivot)).toBeCloseTo(.35,9);
    let previous=first;
    for(let i=0;i<60;i++){
      const view=rig.update({...input,probe});expect(view.shoulder).toBeCloseTo(first.shoulder,9);
      expect(probe(pivot,view.position,0)).toBeGreaterThanOrEqual(pivot.distanceTo(view.position)-1e-9);
      expect(probe(view.position,view.position.clone().addScaledVector(up,.001),.2)).toBeGreaterThanOrEqual(.001);
      expect(probe(previous.position,view.position,.2)).toBeGreaterThanOrEqual(previous.position.distanceTo(view.position)-1e-9);
      previous=view;
    }
  });

  it('eases the shoulder back to centre when clearance returns and clears it on reset',()=>{
    for(const portrait of [false,true]){
      const up=new Vector3(0,-1,0),feet=up.clone().multiplyScalar(21.6),heading=new Vector3(0,0,-1),rig=new GroundCameraRig();
      const input={feet,up,heading,pitch:0,portrait,radius:21.6,dt:1/60};
      const blocked=rig.update({...input,instant:true,probe:()=>1});
      let prior=blocked.shoulder;
      for(let i=0;i<120;i++){
        const view=rig.update({...input,probe:(a,b)=>a.distanceTo(b)});
        expect(view.shoulder).toBeGreaterThanOrEqual(0);expect(view.shoulder).toBeLessThan(prior);
        expect(view.direction.angleTo(blocked.direction)).toBeLessThan(1e-6);prior=view.shoulder;
      }
      expect(prior).toBeLessThan(1e-6);
      rig.update({...input,instant:true,probe:()=>1});rig.reset();
      expect(rig.update({...input,probe:(a,b)=>a.distanceTo(b)}).shoulder).toBe(0);
    }
  });

  it('clips a genuine overhead deck and keeps its final look direction tied to the same pitch',()=>{
    for(const location of [[0,1,0],[0,-1,0]] as Vec3[]){
      const f=fixture(location,0,true),feet=f.point(0,0,-1.5),rig=new GroundCameraRig();
      const input={feet,up:f.up,heading:f.heading,pitch:0,portrait:false,radius:f.radius,dt:1/60,instant:true};
      // The ideal reference never seeds the real rig with an eye obtained
      // by pretending this same roof does not exist.
      const clear=new GroundCameraRig().update({...input,probe:(a:Vector3,b:Vector3)=>a.distanceTo(b)});
      const blocked=rig.update({...input,probe:(a,b,r)=>f.world.cameraDistance(a,b,r)});
      assertPose(blocked,f.up);expect(blocked.centerDistance).toBeLessThan(clear.distance);expect(blocked.direction.dot(f.up)).toBeCloseTo(clear.direction.dot(f.up),8);
      const anchor=feet.clone().addScaledVector(f.up,1.15);expect(f.world.cameraDistance(anchor,blocked.position,0)).toBeGreaterThanOrEqual(anchor.distanceTo(blocked.position)-1e-7);
      expect(cameraEyePenetration(f.world,blocked.position,.2).depth).toBeLessThanOrEqual(1e-7);
      const torso=project(feet.clone().addScaledVector(f.up,1.15),blocked,false);expect(Math.abs(torso.y)).toBeLessThan(1);
      let previous=blocked;
      for(let step=1;step<=8;step++){
        const nextFeet=f.point(0,0,-1.5-step*.025),view=rig.update({...input,feet:nextFeet,instant:false,probe:(a,b,r)=>f.world.cameraDistance(a,b,r)});
        const nextAnchor=nextFeet.clone().addScaledVector(f.up,1.15);assertPose(view,f.up,.25);
        expect(f.world.cameraDistance(nextAnchor,view.position,0)).toBeGreaterThanOrEqual(nextAnchor.distanceTo(view.position)-1e-7);
        expect(cameraEyePenetration(f.world,view.position,.2).depth).toBeLessThanOrEqual(1e-7);
        expect(f.world.cameraDistance(previous.position,view.position,.2)).toBeGreaterThanOrEqual(previous.position.distanceTo(view.position)-1e-7);
        previous=view;
      }
    }
  });

  it('honours camera volume at real wall edges and returns zero when the pivot is already obstructed',()=>{
    const f=fixture([0,1,0],0),a=f.point(.63,1.35,5),b=f.point(.63,1.35,-1);
    expect(f.world.cameraDistance(a,b)).toBeCloseTo(a.distanceTo(b),8);
    expect(f.world.cameraDistance(a,b,.2)).toBeLessThan(a.distanceTo(b));
    expect(f.world.cameraDistance(a,b,.4)).toBeLessThanOrEqual(f.world.cameraDistance(a,b,.2));
    expect(f.world.cameraDistance(f.point(0,1.35,.5),f.point(0,1.35,4),.2)).toBe(0);
  });

  it('separates an optical line past a wall edge from the unchanged solid camera volume',()=>{
    const f=fixture([0,1,0],0),anchor=f.point(.63,1.35,-1),eye=f.point(.63,1.35,5),previousEye=f.point(.8,1.35,5);
    expect(f.world.cameraDistance(anchor,eye,0)).toBeCloseTo(anchor.distanceTo(eye),8);
    // A virtual arm is not a physical rod: its old thick probe would reject
    // this line even though the actual camera stays outside the wall.
    expect(f.world.cameraDistance(anchor,eye,.2)).toBeLessThan(anchor.distanceTo(eye));
    expect(cameraEyePenetration(f.world,eye,.2).depth).toBe(0);
    expect(f.world.cameraDistance(previousEye,eye,.2)).toBeCloseTo(previousEye.distanceTo(eye),8);
    // That same radius still rejects moving the camera through the edge or
    // placing its sphere in the wall. Thin visibility must not mask either.
    expect(f.world.cameraDistance(eye,anchor,.2)).toBeLessThan(eye.distanceTo(anchor));
    expect(cameraEyePenetration(f.world,f.point(0,1.35,.5),.2).depth).toBeGreaterThan(0);
  });

  it('preserves aim across the old 2.5m boundary and responds to pitch in open space',()=>{
    const up=new Vector3(0,-1,0),feet=up.clone().multiplyScalar(21.6),heading=new Vector3(0,0,-1),rig=new GroundCameraRig();
    const base={feet,up,heading,portrait:false,radius:21.6,dt:1/60,instant:true};
    for(const pitch of [-.3,0,.7]){
      const a=rig.update({...base,pitch,probe:()=>2.49}),b=rig.update({...base,pitch,probe:()=>2.51});
      expect(a.direction.angleTo(b.direction)).toBeLessThan(1e-6);assertPose(a,up);assertPose(b,up);
    }
    const views=[-.3,0,.7].map(pitch=>rig.update({...base,pitch,probe:(a,b)=>a.distanceTo(b)}));
    expect(views[0].direction.dot(up)).toBeLessThan(views[1].direction.dot(up));expect(views[1].direction.dot(up)).toBeLessThan(views[2].direction.dot(up));
    const yawed=rig.update({...base,heading:heading.clone().applyAxisAngle(up,1.1),pitch:.7,probe:(a,b)=>a.distanceTo(b)});
    expect(yawed.direction.dot(up)).toBeCloseTo(views[2].direction.dot(up),9);
  });

  it('starts within a real enclosed room, recovers safely after its removal, and resets stale mode distance',()=>{
    const f=fixture([0,1,0],0,true,5),feet=f.point(0,0,0),rig=new GroundCameraRig();
    const walls:PartPlacement[]=Array.from({length:3},(_,i)=>[
      {n:51+i*4,part:'wall.solid' as const,x:i+1,z:1,rot:2 as const,level:0},
      {n:52+i*4,part:'wall.solid' as const,x:i+1,z:3,rot:0 as const,level:0},
      {n:53+i*4,part:'wall.solid' as const,x:1,z:i+1,rot:3 as const,level:0},
      {n:54+i*4,part:'wall.solid' as const,x:3,z:i+1,rot:1 as const,level:0},
    ]).flat();
    const enclosed=[...f.parts,...walls],roomWorld=new GroundWorld({id:'camera-regression-room',revision:1,radius:f.radius,
      objects:[{...f.object,...structureSize(enclosed)}],blueprints:{test:enclosed}});
    const floor=f.parts.filter(p=>p.part==='floor.deck'),openWorld=new GroundWorld({id:'camera-regression-open',revision:2,radius:f.radius,
      objects:[{...f.object,...structureSize(floor)}],blueprints:{test:floor}});
    const base={feet,up:f.up,heading:f.heading,pitch:0,portrait:false,radius:f.radius,dt:1/60};
    const full=new GroundCameraRig().update({...base,probe:(a,b,r)=>openWorld.cameraDistance(a,b,r)});
    const blocked=rig.update({...base,probe:(a,b,r)=>roomWorld.cameraDistance(a,b,r)});
    expect(blocked.distance).toBeLessThan(full.distance-1);
    const anchor=feet.clone().addScaledVector(f.up,1.15);
    expect(roomWorld.cameraDistance(anchor,blocked.position,0)).toBeGreaterThanOrEqual(blocked.distance-1e-7);
    expect(cameraEyePenetration(roomWorld,blocked.position,.2).depth).toBeLessThanOrEqual(1e-7);
    // Removing an obstruction can make more space; it never requires the old
    // eye to start inside a new wall or teleport through a blocked sweep.
    const clear=()=>rig.update({...base,probe:(a:Vector3,b:Vector3,r:number)=>openWorld.cameraDistance(a,b,r)});
    let previous=blocked;
    for(let i=0;i<120;i++){
      const view=clear();expect(view.distance).toBeGreaterThanOrEqual(previous.distance-1e-9);
      expect(view.distance).toBeLessThanOrEqual(view.desiredDistance+1e-9);
      expect(openWorld.cameraDistance(anchor,view.position,0)).toBeGreaterThanOrEqual(view.distance-1e-7);
      expect(cameraEyePenetration(openWorld,view.position,.2).depth).toBeLessThanOrEqual(1e-7);
      expect(openWorld.cameraDistance(previous.position,view.position,.2)).toBeGreaterThanOrEqual(previous.position.distanceTo(view.position)-1e-7);
      if(i===0){expect(view.distance).toBeGreaterThan(blocked.distance);expect(view.distance).toBeLessThan(full.distance);}
      previous=view;
    }
    rig.reset();rig.update({...base,probe:(a,b,r)=>roomWorld.cameraDistance(a,b,r)});
    rig.reset();expect(clear().distance).toBeCloseTo(full.distance,8);
    // Degenerate initialization is explicitly limited, not a successful
    // physical placement or a requested transition from a prior valid eye.
    rig.reset();const zero=rig.update({...base,instant:true,probe:()=>0});
    expect(zero.distance).toBe(0);expect(zero.position.distanceTo(anchor)).toBeLessThan(1e-9);
    expect(zero.framingLimited).toBe(true);assertPose(zero,f.up);
  });

  it('keeps explicit volume probes above an ordinary nongenerated sphere while preserving old sight queries',()=>{
    const radius=21.6,world=new GroundWorld({id:'ordinary-camera-sphere',revision:1,radius,objects:[],blueprints:{}});
    const start=new Vector3(0,radius+1.15,0),end=new Vector3(0,radius-1,0),length=start.distanceTo(end);
    expect(world.cameraDistance(start,end)).toBeCloseTo(length,9);
    const safe=world.cameraDistance(start,end,.2),eye=start.clone().lerp(end,safe/length);
    expect(safe).toBeLessThan(length);expect(eye.length()).toBeGreaterThanOrEqual(radius+.2-1e-9);
    expect(world.cameraDistance(new Vector3(0,radius+.1,0),start,.2)).toBe(0);
  });

  it('gives equal yaw and pitch and consistent coupled recovery at different frame rates',()=>{
    const up=new Vector3(0,-1,0),feet=up.clone().multiplyScalar(21.6),north=new Vector3(0,0,-1);
    const input={feet,up,heading:north,pitch:0,portrait:false,radius:21.6,dt:0};
    const views=[30,60,120].map(rate=>{
      const rig=new GroundCameraRig();rig.update({...input,probe:()=>1});
      let view=rig.update({...input,probe:()=>1});
      for(let i=0;i<rate;i++)view=rig.update({...input,heading:north.clone().applyAxisAngle(up,1.1),pitch:.5,dt:1/rate,probe:(a,b)=>a.distanceTo(b)});
      return view;
    });
    for(const view of views.slice(1)){
      expect(view.heading.distanceTo(views[0].heading)).toBeLessThan(1e-9);
      expect(view.pitch).toBeCloseTo(views[0].pitch,9);expect(view.shoulder).toBeCloseTo(views[0].shoulder,9);
      // Shoulder and boom release are coupled filters; 30–120 Hz discretisation
      // may differ slightly, but must stay well below a visible centimetre.
      expect(Math.abs(view.distance-views[0].distance)).toBeLessThan(.005);
      expect(view.position.distanceTo(views[0].position)).toBeLessThan(.005);
    }
  });

  it('is finite at both poles, on the back of the planet, and for zero or long frame gaps without mutating inputs',()=>{
    for(const location of locations)for(const dt of [0,1/120,1/60,1/30,10]){
      const up=new Vector3(...location),feet=up.clone().multiplyScalar(21.6),heading=new Vector3(),before=[feet.toArray(),up.toArray(),heading.toArray()];
      const v=new GroundCameraRig().update({feet,up,heading,pitch:.2,portrait:true,radius:21.6,dt,probe:(a,b)=>a.distanceTo(b)});
      assertPose(v,up);expect([feet.toArray(),up.toArray(),heading.toArray()]).toEqual(before);
    }
  });
});
