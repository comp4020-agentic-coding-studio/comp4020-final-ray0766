import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COURIER_LOOK } from './presentation-materials.ts';
import { applyCel } from '../assets/claude-geometry/style/cel.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';
import {applyArtMaterial} from './art-profile.ts';
import type { Character } from '../shared/world.ts';
export const PALETTES=COURIER_LOOK.coats;
const cache=new Map<string,T.MeshStandardMaterial>();
const material=(color:string)=>{if(!cache.has(color)){const m=applyArtMaterial(applyCel(new T.MeshStandardMaterial({color,...COURIER_LOOK.surface}),VILLAGE.cel!));m.userData.sharedResource=true;cache.set(color,m);}return cache.get(color)!;};
export function courier(identity:Character|'mica'|'sol'){
  const root=new T.Group(),rig=new T.Group(),torso=new T.Group(),head=new T.Group();root.add(rig);rig.add(torso);torso.position.y=.93;
  const coat=identity==='mica'?COURIER_LOOK.neighbours.mica:identity==='sol'?COURIER_LOOK.neighbours.sol:PALETTES[identity],colored:T.Mesh[]=[];
  const add=(p:T.Object3D,g:T.BufferGeometry,c:string,pos:number[],tint=false)=>{const m=new T.Mesh(g,material(c));m.position.fromArray(pos);m.castShadow=true;m.receiveShadow=true;p.add(m);if(tint)colored.push(m);return m;};
  const box=(p:T.Object3D,size:[number,number,number],c:string,pos:number[],tint=false)=>add(p,new T.BoxGeometry(...size),c,pos,tint);
  add(torso,new T.CapsuleGeometry(.19,.3,6,12),coat,[0,.02,0],true).scale.z=.77;
  // Same animated rig and occupied envelope: a postal pocket and canvas satchel
  // replace the armour and mechanical pack, rather than recolouring them.
  box(torso,[.25,.16,.025],'#f3ecdb',[0,.12,.175]);
  for(const side of [-1,1]){const fold=box(torso,[.135,.014,.009],'#c26b4b',[side*.055,.13,.193]);fold.rotation.z=side*.45;}
  box(torso,[.35,.085,.31],'#7d5b43',[0,-.2,0]);
  add(torso,new RoundedBoxGeometry(.30,.40,.13,2,.045),'#b88e62',[0,.04,-.22]);
  add(torso,new RoundedBoxGeometry(.29,.14,.045,2,.02),'#c8a46e',[0,.16,-.2825]);box(torso,[.055,.075,.008],'#c8a05a',[0,.055,-.301]);
  for(const x of [-.13,.13])box(torso,[.038,.47,.035],'#7d5b43',[x,.05,-.14]);
  torso.add(head);head.position.y=.47;
  add(head,new T.SphereGeometry(.18,12,10),'#d9b78c',[0,.025,0]);
  add(head,new T.SphereGeometry(.19,12,8,0,Math.PI*2,0,Math.PI/2),'#f3ecdb',[0,.03,0]);
  add(head,new T.CylinderGeometry(.192,.192,.035,12),'#7d5b43',[0,.04,0]);
  const visor=new T.Mesh(new T.SphereGeometry(.18,20,12),applyArtMaterial(new T.MeshPhysicalMaterial(COURIER_LOOK.visor)));visor.material.userData.ownedResource=true;visor.scale.set(1,.63,.82);visor.position.set(0,.025,.105);head.add(visor);
  for(const x of [-.19,.19])add(head,new T.CapsuleGeometry(.043,.07,3,6),'#7d5b43',[x,.005,.01]);
  add(head,new RoundedBoxGeometry(.28,.025,.18,2,.012),'#f3ecdb',[0,.06,.135]);
  const arms=[-1,1].map(side=>{const upper=new T.Group(),forearm=new T.Group();torso.add(upper);upper.position.set(side*.27,.19,0);add(upper,new T.CapsuleGeometry(.075,.21,4,10),coat,[0,-.15,0],true);upper.add(forearm);forearm.position.y=-.30;add(forearm,new T.CapsuleGeometry(.067,.16,4,10),coat,[0,-.12,0],true);add(forearm,new T.CylinderGeometry(.07,.07,.045,8),'#f3ecdb',[0,-.20,0]);add(forearm,new T.SphereGeometry(.073,10,8),'#7d5b43',[0,-.275,.015]);return{upper,forearm};});
  const legs=[-1,1].map(side=>{const hip=new T.Group(),knee=new T.Group();rig.add(hip);hip.position.set(side*.105,.67,0);add(hip,new T.CapsuleGeometry(.095,.20,4,10),'#46514f',[0,-.15,0]);hip.add(knee);knee.position.y=-.3;add(knee,new T.CapsuleGeometry(.07,.17,4,10),'#46514f',[0,-.13,0]);add(knee,new RoundedBoxGeometry(.15,.105,.27,1,.028),'#7d5b43',[0,-.265,.04]);return{hip,knee};});
  const parcel=box(torso,[.4,.28,.31],'#c8a46e',[0,-.1,.38]);box(parcel,[.17,.075,.008],'#f3ecdb',[.075,.045,.160]);box(parcel,[.025,.285,.32],'#c26b4b',[-.075,0,0]);box(parcel,[.405,.025,.32],'#c26b4b',[0,-.045,0]);parcel.visible=false;
  const shadow=new T.Mesh(new T.CircleGeometry(.3,24),new T.MeshBasicMaterial({color:'#2f3d3a',transparent:true,opacity:.25,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.024;root.add(shadow);
  let gait=0,lastTime=0,gestureUntil=0;
  return{root,parcel,head,setColor(c:Character){colored.forEach(m=>m.material=material(PALETTES[c]));},greet(t:number){gestureUntil=t+1.6;},animate(t:number,speed:number,reduced:boolean,turn=0,grounded=true){
    shadow.visible=grounded;const dt=Math.min(.05,Math.max(0,t-lastTime));lastTime=t;const stride=Math.min(1,speed/2.6);gait+=dt*speed*4.6;const phase=reduced?0:gait;rig.position.y=reduced?0:Math.abs(Math.sin(phase))*.025*stride;torso.rotation.x=reduced?0:stride*.045;torso.rotation.z=reduced?0:Math.sin(phase)*.02*stride-turn*.05;head.rotation.y=reduced?0:Math.sin(t*.65)*.055*(1-stride);
    legs.forEach((leg,i)=>{const s=Math.sin(phase+i*Math.PI);leg.hip.rotation.x=s*.55*stride;leg.knee.rotation.x=Math.max(0,-s)*.55*stride;});arms.forEach((arm,i)=>{arm.upper.rotation.x=parcel.visible?-.9:-Math.sin(phase+i*Math.PI)*.42*stride;arm.forearm.rotation.x=parcel.visible?-.75:-.15;arm.upper.rotation.z=(i?1:-1)*.06;});if(!grounded&&!reduced){rig.position.y=0;torso.rotation.x=.06;legs.forEach(leg=>{leg.hip.rotation.x=-.2;leg.knee.rotation.x=.45;});if(!parcel.visible)arms.forEach(arm=>{arm.upper.rotation.x=-.3;arm.forearm.rotation.x=-.25;});}if(t<gestureUntil&&!reduced&&!parcel.visible){arms[1].upper.rotation.z=-2.3;arms[1].forearm.rotation.x=Math.sin(t*18)*.35;}
  }};
}
