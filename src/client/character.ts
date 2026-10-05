import * as T from 'three';
import type { Character } from '../shared/world.ts';
export const PALETTES={clay:'#876247',fern:'#4e6a60',sky:'#4d6675'};
const cache=new Map<string,T.MeshStandardMaterial>();
const material=(color:string)=>{if(!cache.has(color))cache.set(color,new T.MeshStandardMaterial({color,metalness:.25,roughness:.65}));return cache.get(color)!;};
export function courier(identity:Character|'mica'|'sol'){
  const root=new T.Group(),rig=new T.Group(),torso=new T.Group(),head=new T.Group();root.add(rig);rig.add(torso);torso.position.y=.93;
  const coat=identity==='mica'?'#a17a48':identity==='sol'?'#52766c':PALETTES[identity],colored:T.Mesh[]=[];
  const add=(p:T.Object3D,g:T.BufferGeometry,c:string,pos:number[],tint=false)=>{const m=new T.Mesh(g,material(c));m.position.fromArray(pos);m.castShadow=true;m.receiveShadow=true;p.add(m);if(tint)colored.push(m);return m;};
  const box=(p:T.Object3D,size:[number,number,number],c:string,pos:number[],tint=false)=>add(p,new T.BoxGeometry(...size),c,pos,tint);
  add(torso,new T.CapsuleGeometry(.19,.3,6,12),coat,[0,.02,0],true).scale.z=.77;
  box(torso,[.30,.20,.08],'#89999a',[0,.12,.175]);box(torso,[.12,.07,.013],'#90c2c8',[.06,.15,.226]);box(torso,[.35,.085,.31],'#27333a',[0,-.2,0]);
  box(torso,[.30,.40,.17],'#3b474b',[0,.04,-.22]);for(const x of [-.13,.13])box(torso,[.047,.47,.045],'#8a948c',[x,.05,-.14]);
  torso.add(head);head.position.y=.47;
  add(head,new T.SphereGeometry(.19,20,14),'#a6adaa',[0,.03,0]);
  const visor=new T.Mesh(new T.SphereGeometry(.18,20,12),new T.MeshPhysicalMaterial({color:'#132c38',metalness:.55,roughness:.14,clearcoat:1}));visor.material.userData.ownedResource=true;visor.scale.set(1,.63,.82);visor.position.set(0,.025,.105);head.add(visor);
  for(const x of [-.19,.19])box(head,[.05,.15,.12],'#445158',[x,.025,.01]);box(head,[.13,.025,.12],'#b9c8c4',[0,.208,0]);
  const arms=[-1,1].map(side=>{const upper=new T.Group(),forearm=new T.Group();torso.add(upper);upper.position.set(side*.27,.19,0);add(upper,new T.CapsuleGeometry(.075,.21,4,10),coat,[0,-.15,0],true);box(upper,[.17,.12,.2],'#7a8888',[0,-.04,0]);upper.add(forearm);forearm.position.y=-.30;add(forearm,new T.CapsuleGeometry(.067,.16,4,10),coat,[0,-.12,0],true);add(forearm,new T.SphereGeometry(.073,10,8),'#283a42',[0,-.275,.015]);return{upper,forearm};});
  const legs=[-1,1].map(side=>{const hip=new T.Group(),knee=new T.Group();rig.add(hip);hip.position.set(side*.105,.67,0);add(hip,new T.CapsuleGeometry(.095,.20,4,10),'#384c53',[0,-.15,0]);hip.add(knee);knee.position.y=-.3;add(knee,new T.CapsuleGeometry(.07,.17,4,10),'#35464e',[0,-.13,0]);box(knee,[.14,.14,.09],'#7d8b8b',[0,.0,.07]);box(knee,[.15,.105,.27],'#22313a',[0,-.265,.04]);return{hip,knee};});
  const parcel=box(torso,[.4,.28,.31],'#a1875a',[0,-.1,.38]);box(parcel,[.32,.035,.02],'#bacac7',[0,.045,.167]);parcel.visible=false;
  const shadow=new T.Mesh(new T.CircleGeometry(.3,24),new T.MeshBasicMaterial({color:'#071116',transparent:true,opacity:.3,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.024;root.add(shadow);
  let gait=0,lastTime=0,gestureUntil=0;
  return{root,parcel,head,setColor(c:Character){colored.forEach(m=>m.material=material(PALETTES[c]));},greet(t:number){gestureUntil=t+1.6;},animate(t:number,speed:number,reduced:boolean,turn=0){
    const dt=Math.min(.05,Math.max(0,t-lastTime));lastTime=t;const stride=Math.min(1,speed/2.6);gait+=dt*speed*4.6;const phase=reduced?0:gait;rig.position.y=reduced?0:Math.abs(Math.sin(phase))*.025*stride;torso.rotation.x=reduced?0:stride*.045;torso.rotation.z=reduced?0:Math.sin(phase)*.02*stride-turn*.05;head.rotation.y=reduced?0:Math.sin(t*.65)*.055*(1-stride);
    legs.forEach((leg,i)=>{const s=Math.sin(phase+i*Math.PI);leg.hip.rotation.x=s*.55*stride;leg.knee.rotation.x=Math.max(0,-s)*.55*stride;});arms.forEach((arm,i)=>{arm.upper.rotation.x=parcel.visible?-.9:-Math.sin(phase+i*Math.PI)*.42*stride;arm.forearm.rotation.x=parcel.visible?-.75:-.15;arm.upper.rotation.z=(i?1:-1)*.06;});if(t<gestureUntil&&!reduced&&!parcel.visible){arms[1].upper.rotation.z=-2.3;arms[1].forearm.rotation.x=Math.sin(t*18)*.35;}
  }};
}
