import {describe,expect,it} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {GroundCameraRig} from '../src/client/ground-camera.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {cameraEyePenetration} from './ground-camera-safety.ts';

type Triple=[number,number,number];
type RecordedFrame={time:number;up:Triple;radius:number;heading:Triple;pitch:number};
// Public-world controls-only capture, not a synthetic successful camera path.
// Source report SHA f053d31fdfd93d5990f79e5a8e085ec78ec3568a771cd6f3015bf1a828c0e518.
// The 29 original transition samples plus 9 preceding warm-up samples are kept.
// Telemetry was sampled about every 100ms: this test interpolates those inputs,
// not the recorded eye or the diagnostic's successful candidate camera poses.
const recorded:RecordedFrame[]=[
  {"time":0.0,"up":[0.004152755215316384,0.013734261430546575,-0.9998970570449137],"radius":21.590874354266585,"heading":[-0.9522871457837754,0.3052034333580902,0.00023715274531249217],"pitch":-8.326672684688674e-17},
  {"time":0.10209999990463257,"up":[0.0040875839621897,0.013755148467300627,-0.9998970384734595],"radius":21.590856206878367,"heading":[-0.9522874277539527,0.30520249271795163,0.00030558224605826165],"pitch":-8.326672684688674e-17},
  {"time":0.20469999992847443,"up":[0.0040875839621897,0.013755148467300627,-0.9998970384734595],"radius":21.590856206878367,"heading":[-0.9522874277539527,0.30520249271795163,0.00030558224605826165],"pitch":-8.326672684688674e-17},
  {"time":0.3106999999284744,"up":[0.004066421136695849,0.01376193102408214,-0.9998970314355511],"radius":21.59085030767497,"heading":[-0.952287518357784,0.305202186959886,0.000327803105894479],"pitch":-8.326672684688674e-17},
  {"time":0.4165,"up":[0.004066421136695849,0.01376193102408214,-0.9998970314355511],"radius":21.59085030767497,"heading":[-0.952287518357784,0.305202186959886,0.000327803105894479],"pitch":-8.326672684688674e-17},
  {"time":0.5196999999284744,"up":[0.004066421136695849,0.01376193102408214,-0.9998970314355511],"radius":21.59085030767497,"heading":[-0.952287518357784,0.305202186959886,0.000327803105894479],"pitch":-8.326672684688674e-17},
  {"time":0.6240999999046326,"up":[0.004066421136695849,0.01376193102408214,-0.9998970314355511],"radius":21.59085030767497,"heading":[-0.952287518357784,0.305202186959886,0.000327803105894479],"pitch":-8.326672684688674e-17},
  {"time":0.7291999999284744,"up":[0.006076142898706049,0.02003251148366251,-0.9997808654755957],"radius":21.586117732865283,"heading":[-0.952287518357784,0.305202186959886,0.00032780310589448046],"pitch":-8.326672684688674e-17},
  {"time":0.8337999999523162,"up":[0.008575361565831878,0.027830317818673723,-0.9995758783524774],"radius":21.580691236807127,"heading":[-0.952287518357784,0.305202186959886,0.0003278031058944795],"pitch":-8.326672684688674e-17},
  {"time":0.9365999999046326,"up":[0.009437612874812547,0.030520609389281455,-0.99948958166943],"radius":21.579191321782183,"heading":[-0.952287518357784,0.305202186959886,0.00032780310589448496],"pitch":-8.326672684688674e-17},
  {"time":1.0406999999284745,"up":[0.009650230131679594,0.031183990552434124,-0.9994670738906967],"radius":21.57885118555459,"heading":[-0.952287518357784,0.305202186959886,0.0003278031058944892],"pitch":-8.326672684688674e-17},
  {"time":1.1807999999523162,"up":[0.009702660185499366,0.03134757601835599,-0.9994614489129123],"radius":21.57876886934698,"heading":[-0.952287518357784,0.305202186959886,0.00032780310589448534],"pitch":-8.326672684688674e-17},
  {"time":1.2851999999284744,"up":[0.009715589233600755,0.031387915555466606,-0.9994600572723888],"radius":21.578748659785106,"heading":[-0.9427113765736899,-0.3330318415619569,-0.01962276699119303],"pitch":-8.326672684688674e-17},
  {"time":1.388399999976158,"up":[0.009717498578850228,0.03139387284643102,-0.9994598516043915],"radius":21.578745678201376,"heading":[-0.942711339767763,-0.33303172265435316,-0.01962655291036373],"pitch":-8.326672684688674e-17},
  {"time":1.4945999999046327,"up":[0.009717498578850228,0.03139387284643102,-0.9994598516043915],"radius":21.578745678201376,"heading":[-0.5486669302373968,-0.8354445045759124,-0.03157656469250725],"pitch":-8.326672684688674e-17},
  {"time":1.5990999999046325,"up":[0.009717498578850228,0.03139387284643102,-0.9994598516043915],"radius":21.578745678201376,"heading":[-0.30504756643255015,-0.9517699746452587,-0.032861795102255446],"pitch":-8.326672684688674e-17},
  {"time":1.7020999999046327,"up":[0.009717498578850228,0.03139387284643102,-0.9994598516043915],"radius":21.578745678201376,"heading":[-0.30504756643255015,-0.9517699746452587,-0.032861795102255446],"pitch":-8.326672684688674e-17},
  {"time":1.8055999999046326,"up":[0.009717498578850228,0.03139387284643102,-0.9994598516043915],"radius":21.578745678201376,"heading":[-0.30504756643255015,-0.9517699746452587,-0.032861795102255446],"pitch":-8.326672684688674e-17},
  {"time":1.9128999999761582,"up":[0.008329465546527491,0.027063100526450397,-0.9995990239058882],"radius":21.581157556737807,"heading":[-0.30508862248330454,-0.951902961692225,-0.028314023960050852],"pitch":-8.326672684688674e-17},
  {"time":2.0165,"up":[0.0072448991541935225,0.02367915253223868,-0.9996933575710106],"radius":21.583412719859822,"heading":[-0.3051163040568245,-0.9519931499879026,-0.0247605204875472],"pitch":-8.326672684688674e-17},
  {"time":2.1201999999284746,"up":[0.006977433726007158,0.022844633438863258,-0.9997146783666044],"radius":21.584012328567987,"heading":[-0.305122537652744,-0.9520135411912891,-0.023884187337475746],"pitch":-8.326672684688674e-17},
  {"time":2.2225999999046326,"up":[0.006378939531739426,0.02097726824119689,-0.9997596027783816],"radius":21.58539919507595,"heading":[-0.3051356365544698,-0.9520565183357924,-0.021923257030548652],"pitch":-8.326672684688674e-17},
  {"time":2.324899999976158,"up":[0.006231348811395185,0.020516768945600877,-0.9997700898126647],"radius":21.585748406729607,"heading":[-0.305138686267477,-0.9520665533882424,-0.02143968428851586],"pitch":-8.326672684688674e-17},
  {"time":2.429899999976158,"up":[0.005805730704786385,0.019188792189701508,-0.9997990216764987],"radius":21.586764747478128,"heading":[-0.3051470810216519,-0.9520942443596825,-0.020045169022256573],"pitch":-8.326672684688674e-17},
  {"time":2.5336999999284746,"up":[0.005575466041211099,0.018470339457127057,-0.9998138630458981],"radius":21.587317383006706,"heading":[-0.3051513751295812,-0.9521084530918067,-0.01929071817359292],"pitch":-8.326672684688674e-17},
  {"time":2.6360999999046326,"up":[0.0055061110285599445,0.01825394357082994,-0.9998182216210376],"radius":21.587483844707638,"heading":[-0.30515263444117957,-0.9521126264432415,-0.019063479770510382],"pitch":-8.326672684688674e-17},
  {"time":2.737899999976158,"up":[0.005483589568986161,0.01818367392705587,-0.9998196258565609],"radius":21.58753788377664,"heading":[-0.30515303998238313,-0.9521139710617887,-0.018989689267109415],"pitch":-8.326672684688674e-17},
  {"time":2.8446999999284746,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.30515313250691156,-0.952114277883176,-0.01897281139466307],"pitch":-8.326672684688674e-17},
  {"time":2.949099999904633,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.30515313250691156,-0.952114277883176,-0.01897281139466307],"pitch":-8.326672684688674e-17},
  {"time":3.0520999999046325,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.30515313250691156,-0.952114277883176,-0.01897281139466307],"pitch":-8.326672684688674e-17},
  {"time":3.1545999999046326,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.30515313250691156,-0.952114277883176,-0.01897281139466307],"pitch":-8.326672684688674e-17},
  {"time":3.2600999999046327,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.30515313250691156,-0.952114277883176,-0.01897281139466307],"pitch":-8.326672684688674e-17},
  {"time":3.3660999999046326,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.7895557383294196,-0.6134837374740544,-0.015473846514377766],"pitch":-8.326672684688674e-17},
  {"time":3.4685999999046326,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.7895557383294196,-0.6134837374740544,-0.015473846514377766],"pitch":-8.326672684688674e-17},
  {"time":3.572399999976158,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.7895557383294196,-0.6134837374740544,-0.015473846514377766],"pitch":-8.326672684688674e-17},
  {"time":3.68,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.7895557383294196,-0.6134837374740544,-0.015473846514377766],"pitch":-8.326672684688674e-17},
  {"time":3.784399999976158,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.9981438090922418,-0.060545677527296664,-0.006569421861260843],"pitch":-8.326672684688674e-17},
  {"time":3.8870999999046325,"up":[0.005478438305790511,0.018167601369809907,-0.9998199462774273],"radius":21.587550242549455,"heading":[-0.9981438090922418,-0.060545677527296664,-0.006569421861260843],"pitch":-8.326672684688674e-17},
];
const world=new GroundWorld({id:'hub',radius:21.6,revision:0,objects:[],blueprints:{}});
function inputAt(time:number){
  const b=recorded.findIndex(r=>r.time>=time);
  const right=recorded[b<0?recorded.length-1:b],left=recorded[Math.max(0,b<0?recorded.length-1:b-1)];
  const t=right.time===left.time?0:(time-left.time)/(right.time-left.time);
  const up=new Vector3(...left.up).lerp(new Vector3(...right.up),t).normalize();
  const heading=new Vector3(...left.heading).lerp(new Vector3(...right.heading),t).projectOnPlane(up).normalize();
  return{feet:up.clone().multiplyScalar(left.radius+(right.radius-left.radius)*t),up,heading,pitch:left.pitch+(right.pitch-left.pitch)*t};
}
function projected(point:Vector3,view:ReturnType<GroundCameraRig['update']>,portrait:boolean){
  const camera=new PerspectiveCamera(portrait?62:54,portrait?390/844:1440/1000,.08,2400);
  camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);
  return point.clone().project(camera);
}
function safeSegment(a:Vector3,b:Vector3,label:string,radius=.2){
  expect(world.cameraDistance(a,b,radius),label).toBeGreaterThanOrEqual(a.distanceTo(b)-1e-7);
}
function assertFrame(input:ReturnType<typeof inputAt>,view:ReturnType<GroundCameraRig['update']>,portrait:boolean,label:string){
  for(const p of [view.position,view.target,view.up,view.direction,view.heading])expect(p.toArray().every(Number.isFinite),label).toBe(true);
  expect(view.probeRadius).toBe(.2);expect(view.direction.length()).toBeCloseTo(1,8);
  expect(view.target.clone().sub(view.position).normalize().distanceTo(view.direction),label).toBeLessThan(1e-8);
  safeSegment(input.feet.clone().addScaledVector(input.up,1.15),view.position,label+' optical anchor ray',0);
  expect(cameraEyePenetration(world,view.position,.2).depth,label+' camera sphere').toBeLessThanOrEqual(1e-7);
  // Recognisable central features, not a promise to fit every limb in every gap.
  for(const height of [.95,1.45]){
    const point=input.feet.clone().addScaledVector(input.up,height),ndc=projected(point,view,portrait);
    expect(point.clone().sub(view.position).dot(view.direction),label+' feature depth').toBeGreaterThan(.08);
    expect(Math.abs(ndc.x),label+' feature x').toBeLessThan(.95);expect(Math.abs(ndc.y),label+' feature y').toBeLessThan(.95);expect(Math.abs(ndc.z),label+' feature z').toBeLessThan(1);
  }
}

describe('recorded backside wall-corner camera avoidance',()=>{
  it.each([false,true].flatMap(portrait=>[30,60,120].map(rate=>({portrait,rate}))))('keeps a safe and readable continuous path at $rate Hz, portrait=$portrait',({portrait,rate})=>{
    const rig=new GroundCameraRig(),control=new GroundCameraRig(),end=recorded[recorded.length-1].time;
    let previous:ReturnType<GroundCameraRig['update']>|undefined,maxAvoidance=0;
    for(let i=0;i<=Math.ceil((end+3)*rate);i++){
      const time=Math.min(end,i/rate),input=inputAt(time),before=JSON.stringify(input),dt=i?1/rate:0;
      const view=rig.update({...input,portrait,radius:21.6,dt,probe:(a,b,r)=>world.cameraDistance(a,b,r)});
      const intended=control.update({...input,portrait,radius:21.6,dt,probe:(a,b)=>a.distanceTo(b)});
      const label=`${rate}Hz portrait=${portrait} time=${time.toFixed(4)} hold=${i/rate>end}`;
      expect(JSON.stringify(input),label+' immutable controls').toBe(before);
      expect(view.heading.distanceTo(intended.heading),label+' independent heading').toBeLessThan(1e-8);expect(view.pitch,label+' independent pitch').toBeCloseTo(intended.pitch,9);
      assertFrame(input,view,portrait,label);
      if(previous){
        safeSegment(previous.position,view.position,label+' eye sweep');
        // Separate intentional control change from the automatic orbit. A bounded
        // extra 4 rad/s is a comfort guard for this recorded continuous input.
        const controlTurn=previous.heading.angleTo(view.heading)+previous.up.angleTo(view.up);
        expect(previous.direction.angleTo(view.direction),label+' view continuity').toBeLessThanOrEqual(controlTurn+4*dt+1e-6);
      }
      maxAvoidance=Math.max(maxAvoidance,Math.abs(view.avoidanceYaw));previous=view;
    }
    expect(maxAvoidance).toBeGreaterThan(.2);expect(previous!.framingLimited).toBe(false);
    // The capture ends beside the wall: its central arm remains only ~1.3m.
    // Keeping a safe side view here is valid; demanding recentering would force
    // an obstructed path. Separately remove obstacles with an open numerical
    // probe to test recovery at every rate. This is not a recorded game exit.
    expect(previous!.centerDistance).toBeLessThan(2.8);
    const clearInput=inputAt(end),savedControls=JSON.stringify(clearInput);
    for(let i=0;i<4*rate;i++){
      const view=rig.update({...clearInput,portrait,radius:21.6,dt:1/rate,probe:(a,b)=>a.distanceTo(b)});
      expect(JSON.stringify(clearInput)).toBe(savedControls);
      expect(view.position.toArray().every(Number.isFinite)).toBe(true);
      expect(previous!.direction.angleTo(view.direction),'numerical clear-space return continuity').toBeLessThanOrEqual(4/rate+1e-6);
      for(const height of [.95,1.45]){
        const ndc=projected(clearInput.feet.clone().addScaledVector(clearInput.up,height),view,portrait);
        expect(Math.abs(ndc.x),'numerical clear-space feature x').toBeLessThan(.95);
        expect(Math.abs(ndc.y),'numerical clear-space feature y').toBeLessThan(.95);
      }
      previous=view;
    }
    expect(Math.abs(previous!.avoidanceYaw)).toBeLessThan(.02);expect(previous!.avoidanceTargetYaw).toBe(0);
    expect(previous!.framingLimited).toBe(false);expect(Math.abs(previous!.distance-previous!.desiredDistance)).toBeLessThan(.005);
  },20000);

  it('does not cross walls when the same sampled path has a 250ms scheduling gap',()=>{
    const rig=new GroundCameraRig(),end=recorded[recorded.length-1].time;let previous:ReturnType<GroundCameraRig['update']>|undefined;
    for(let time=0;time<=end;time+=.25){
      const input=inputAt(time),view=rig.update({...input,portrait:false,radius:21.6,dt:time?.25:0,probe:(a,b,r)=>world.cameraDistance(a,b,r)});
      safeSegment(input.feet.clone().addScaledVector(input.up,1.15),view.position,'long gap optical anchor',0);
      expect(cameraEyePenetration(world,view.position,.2).depth).toBeLessThanOrEqual(1e-7);
      if(previous)safeSegment(previous.position,view.position,'long gap sweep');
      expect(view.position.toArray().every(Number.isFinite)).toBe(true);previous=view;
    }
  },20000);
});
