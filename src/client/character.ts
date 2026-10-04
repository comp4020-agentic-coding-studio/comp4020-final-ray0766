import * as T from 'three';
import { ball, box, shape, material } from './art.ts';
import type { Character } from '../shared/world.ts';
export const PALETTES = {clay:'#d67c50',fern:'#678578',sky:'#638f9e'};
export function courier(identity:Character|'mica'|'sol') {
  const root=new T.Group(),rig=new T.Group(),torso=new T.Group(),head=new T.Group();root.add(rig);rig.add(torso);torso.position.y=.88;
  const coat=identity==='mica'?'#c79759':identity==='sol'?'#80936d':PALETTES[identity];
  const colored:T.Mesh[]=[];
  const body=shape(torso,new T.CylinderGeometry(.23,.26,.53,8),coat,[0,.03,0]);body.scale.z=.76;colored.push(body);
  colored.push(box(torso,[.32,.14,.33],coat,[0,.29,0]));
  box(torso,[.035,.4,.018],'#e6c991',[0,.035,.20]);
  for(const x of [-.15,.15])box(torso,[.12,.1,.03],'#b7a783',[x,-.12,.2]);
  // Satchel, flap and a tiny letter emblem give the courier a readable back silhouette.
  box(torso,[.39,.36,.17],'#a45f43',[0,.08,-.24],true);
  box(torso,[.41,.12,.19],'#c88450',[0,.23,-.25],true);
  box(torso,[.15,.11,.016],'#eee2bc',[0,.06,-.333]);
  for(const x of [-.16,.16]) {const strap=box(torso,[.055,.55,.07],'#725548',[x,.08,-.1]);strap.rotation.x=.35;}
  torso.add(head);head.position.set(0,.48,0);
  shape(head,new T.CylinderGeometry(.24,.20,.34,9),'#e6c5a0',[0,.02,0]).scale.z=.88;
  ball(head,.055,'#e6c5a0',[-.245,.02,0],1);ball(head,.055,'#e6c5a0',[.245,.02,0],1);
  shape(head,new T.CylinderGeometry(.252,.26,.13,9),'#554940',[0,.22,-.015]);
  for(let i=0;i<4;i++){const fringe=box(head,[.1,.11,.10],'#554940',[-.155+i*.103,.16,.18]);fringe.rotation.z=(i-1.5)*-.12;}
  const eyes=[-.088,.088].map(x=>{const eye=ball(head,.028,'#33443d',[x,.047,.212],1);eye.scale.set(.7,1,.5);return eye;});
  ball(head,.042,'#d9ad89',[0,-.005,.23],1).scale.set(.75,.8,.8);
  box(head,[.07,.012,.008],'#946c5b',[0,-.09,.22]);
  const cap=shape(head,new T.CylinderGeometry(.265,.28,.14,10),coat,[0,.30,-.005]);colored.push(cap);
  const brim=box(head,[.35,.032,.27],coat,[0,.235,.16]);brim.rotation.x=-.10;colored.push(brim);
  if(identity==='sol') {cap.scale.set(1.2,.6,1.2);brim.scale.set(1.6,1,1.2);}
  if(identity==='mica') {
    for(const x of [-.088,.088])shape(head,new T.TorusGeometry(.065,.009,4,12),'#54534b',[x,.046,.235]);
    box(head,[.05,.013,.018],'#54534b',[0,.046,.235]);
  }
  const arms=[-1,1].map(side=>{
    const upper=new T.Group(),forearm=new T.Group();torso.add(upper);upper.position.set(side*.30,.19,0);
    colored.push(shape(upper,new T.CylinderGeometry(.092,.075,.30,7),coat,[0,-.14,0]));
    upper.add(forearm);forearm.position.y=-.28;
    colored.push(shape(forearm,new T.CylinderGeometry(.076,.065,.25,7),coat,[0,-.115,0]));
    ball(forearm,.078,'#e6c5a0',[0,-.265,0],1).scale.y=1.1;
    return {upper,forearm};
  });
  const legs=[-1,1].map(side=>{
    const hip=new T.Group(),knee=new T.Group();rig.add(hip);hip.position.set(side*.12,.65,0);
    shape(hip,new T.CylinderGeometry(.12,.094,.30,7),'#475d59',[0,-.15,0]);hip.add(knee);knee.position.y=-.30;
    shape(knee,new T.CylinderGeometry(.091,.069,.23,7),'#405854',[0,-.115,0]);
    box(knee,[.145,.095,.27],'#384b4d',[0,-.255,.045],true);
    box(knee,[.15,.035,.28],'#e6dabe',[0,-.315,.045]);
    return {hip,knee};
  });
  const parcel=box(torso,[.43,.32,.32],'#dbaa6a',[0,-.10,.40],true);box(parcel,[.055,.325,.325],'#eeddb0',[0,0,0]);parcel.visible=false;
  const shadow=new T.Mesh(new T.CircleGeometry(.32,24),new T.MeshBasicMaterial({color:'#344f48',transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.024;root.add(shadow);
  let gait=0,lastTime=0,gestureUntil=0;
  return {root,parcel,head,
    setColor(c:Character){colored.forEach(m=>m.material=material(PALETTES[c]));},
    greet(t:number){gestureUntil=t+1.6;},
    animate(t:number,speed:number,reduced:boolean,turn=0){
      const delta=Math.max(0,Math.min(.05,t-lastTime));lastTime=t;
      const stride=Math.min(1,speed/2.6);gait+=delta*speed*4.6;
      const phase=reduced?0:gait;
      rig.position.y=reduced?0:Math.abs(Math.sin(phase))*.043*stride;
      torso.rotation.x=reduced?0:stride*.055;
      torso.rotation.z=reduced?0:-Math.max(-.12,Math.min(.12,turn*.2))+Math.sin(phase)*.028*stride;
      torso.position.y=.88+(reduced?0:Math.sin(t*2)*.01*(1-stride));
      head.rotation.y=reduced?0:Math.sin(t*.65)*.08*(1-stride);
      const blink=!reduced&&t%4.8<.13;eyes.forEach(e=>e.scale.y=blink?.1:1);
      legs.forEach((leg,i)=>{const s=Math.sin(phase+i*Math.PI);leg.hip.rotation.x=s*.60*stride;leg.knee.rotation.x=Math.max(0,-s)*.65*stride;});
      arms.forEach((arm,i)=>{
        arm.upper.rotation.x=parcel.visible?-.9:-Math.sin(phase+i*Math.PI)*.48*stride;
        arm.forearm.rotation.x=parcel.visible?-.75:-.10-Math.max(0,Math.sin(phase+i*Math.PI))*.25*stride;
        arm.upper.rotation.z=(i?1:-1)*.07;
      });
      if(t<gestureUntil&&!reduced&&!parcel.visible){arms[1].upper.rotation.z=-2.3;arms[1].forearm.rotation.x=Math.sin(t*18)*.4;}
      parcel.rotation.z=reduced?0:Math.sin(phase)*.035*stride;
    }
  };
}
