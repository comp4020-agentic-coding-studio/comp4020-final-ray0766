import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Character} from '../shared/world.ts';
import {defaultAppearance,SKIN_COLORS,EYE_COLORS,type Appearance} from '../shared/appearance.ts';
import {COURIER_LOOK} from './presentation-materials.ts';
import {applyArtMaterial} from './art-profile.ts';

// Original procedural sample. No imported model, texture, skeleton or face data.
const geometryCache=new Map<string,T.BufferGeometry>(),materialCache=new Map<string,T.MeshStandardMaterial>();
const shared=(key:string,create:()=>T.BufferGeometry)=>{if(!geometryCache.has(key)){const g=create();g.userData.sharedResource=true;geometryCache.set(key,g);}return geometryCache.get(key)!;};
const sphere=()=>shared('sphere',()=>new T.SphereGeometry(1,12,8));
const capsule=()=>shared('capsule',()=>new T.CapsuleGeometry(1,1,3,8));
const material=(color:string)=>{if(!materialCache.has(color)){const m=applyArtMaterial(new T.MeshStandardMaterial({color,roughness:.9,metalness:0}));m.userData.sharedResource=true;materialCache.set(color,m);}return materialCache.get(color)!;};
const eyeMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:0});eyeMaterial.userData.sharedResource=true;
function eyeGeometry(color:string){return shared('eye:'+color,()=>{
 const parts:Array<{color:string;scale:number[];position:number[]}>= [
  {color:'#fff6e5',scale:[.060,.067,.023],position:[0,0,0]},
  {color,scale:[.033,.044,.014],position:[0,-.003,.019]},
  {color:'#26352f',scale:[.017,.031,.008],position:[0,-.003,.030]},
  {color:'#fffdf0',scale:[.008,.010,.005],position:[-.010,.015,.037]},
 ];
 const geometries=parts.map(p=>{const g=new T.SphereGeometry(1,10,6);g.scale(p.scale[0],p.scale[1],p.scale[2]);g.translate(p.position[0],p.position[1],p.position[2]);const c=new T.Color(p.color),values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3)values.set([c.r,c.g,c.b],i);g.setAttribute('color',new T.BufferAttribute(values,3));return g;});const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());return merged;
 });}
export function sampleCourier(identity:Character,options:Appearance={...defaultAppearance(identity),model:'sample'}){
 const root=new T.Group(),rig=new T.Group(),torso=new T.Group(),head=new T.Group();root.name='little-worlds-traveller';root.userData.characterVariant='sample';root.add(rig);rig.add(torso);torso.position.y=.87;
 const tinted:T.Mesh[]=[];
 const add=(parent:T.Object3D,g:T.BufferGeometry,color:string,position:number[],scale:number[],tint=false)=>{const mesh=new T.Mesh(g,material(color));mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);if(tint)tinted.push(mesh);return mesh;};
 const ellipsoid=(p:T.Object3D,color:string,pos:number[],scale:number[],tint=false)=>add(p,sphere(),color,pos,scale,tint);
 const coat=COURIER_LOOK.coats[identity],skin=SKIN_COLORS[options.skin],hair='#504338',cream='#f3e8ce',dark='#405653',leather='#865e43';
 // Soft fitted jacket, curved hem, open cream collar and modest scarf.
 ellipsoid(torso,coat,[0,.01,0],[.215,.29,.15],true);
 add(torso,shared('hem',()=>new T.CylinderGeometry(.19,.23,.12,12)),coat,[0,-.20,0],[1,1,.74],true);
 ellipsoid(torso,cream,[0,.20,.095],[.14,.10,.08]);
 const scarf=ellipsoid(torso,'#d7b766',[.055,.16,.17],[.06,.09,.025]);scarf.rotation.z=-.3;
 ellipsoid(torso,leather,[0,-.16,.151],[.205,.025,.022]);
 ellipsoid(torso,'#dac794',[.035,-.16,.173],[.028,.024,.01]);
 // Diagonal strap and a rounded canvas field bag, visible from the follow view.
 const strap=add(torso,shared('strap',()=>new T.BoxGeometry(.035,.48,.025)),leather,[0,.01,-.145],[1,1,1]);strap.rotation.z=-.48;
 ellipsoid(torso,'#b69363',[-.16,-.10,-.15],[.135,.16,.07]);
 ellipsoid(torso,cream,[-.16,-.045,-.204],[.123,.055,.028]);
 ellipsoid(torso,leather,[-.16,-.075,-.229],[.018,.035,.008]);
 // Head: softer jaw, ears, clear eyes and a sculpted side-swept hair silhouette.
 torso.add(head);head.position.set(0,.47,.005);
 head.scale.fromArray(options.face==='oval'?[.92,1.08,.98]:options.face==='round'?[1.06,.95,1.04]:[1,1,1]);
 add(head,shared('head',()=>new T.SphereGeometry(1,16,12)),skin,[0,0,0],[.215,.235,.195]);
 ellipsoid(head,skin,[0,-.10,.05],[.17,.14,.15]);
 for(const side of [-1,1]){
  ellipsoid(head,skin,[side*.208,-.015,0],[.040,.066,.035]);
  ellipsoid(head,new T.Color(skin).multiplyScalar(.75).getStyle(),[side*.225,-.018,.017],[.015,.036,.016]);
  ellipsoid(head,new T.Color(skin).lerp(new T.Color('#c46d64'),.3).getStyle(),[side*.123,-.075,.161],[.044,.020,.012]);
 }
 const eyes=[-1,1].map(side=>{const eye=new T.Mesh(eyeGeometry(EYE_COLORS[options.eyes]),eyeMaterial);eye.position.set(side*.078,.015,.173);eye.rotation.y=side*.13;head.add(eye);return eye;});
 for(const side of [-1,1]){const brow=ellipsoid(head,hair,[side*.081,.093,.169],[.059,.014,.013]);brow.rotation.z=side*.10;}
 ellipsoid(head,skin,[0,-.038,.199],[.027,.040,.029]);
 const mouth=shared('smile',()=>new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(-.041,-.121,.172),new T.Vector3(0,-.140,.180),new T.Vector3(.041,-.121,.172)),8,.007,4,false));add(head,mouth,'#956b5a',[0,0,0],[1,1,1]);
 const cap=add(head,shared('hair-cap',()=>new T.SphereGeometry(1,16,9,0,Math.PI*2,0,1.70)),hair,[0,.04,-.025],[.232,.237,.213]);
 if(options.hair==='swept'){
  for(const [x,y,z,sx,sy,sz,rotation] of [[-.115,.148,.147,.117,.087,.062,-.58],[.008,.185,.145,.118,.068,.061,-.4],[.12,.19,.102,.105,.068,.071,.20]]){const lock=ellipsoid(head,hair,[x,y,z],[sx,sy,sz]);lock.rotation.z=rotation;}
  for(const side of [-1,1]){const lock=ellipsoid(head,hair,[side*.196,.042,-.025],[.055,.145,.115]);lock.rotation.z=-side*.12;}
 }else if(options.hair==='crop'){
  cap.scale.set(.222,.22,.205);cap.position.y=.045;
  for(const [x,y,rz]of [[-.10,.164,-.35],[0,.20,-.2],[.10,.178,.18]]){const lock=ellipsoid(head,hair,[x,y,.133],[.081,.046,.057]);lock.rotation.z=rz;}
 }else{
  ellipsoid(head,hair,[0,-.05,-.13],[.208,.21,.11]);
  for(const side of [-1,1]){const lock=ellipsoid(head,hair,[side*.194,-.055,-.025],[.067,.205,.126]);lock.rotation.z=-side*.08;const fringe=ellipsoid(head,hair,[side*.113,.137,.155],[.112,.075,.05]);fringe.rotation.z=side*.38;}
 }
 // Articulated limbs reuse shared low-resolution geometry and existing game API.
 const arms=[-1,1].map(side=>{const upper=new T.Group(),forearm=new T.Group();torso.add(upper);upper.position.set(side*.225,.16,0);ellipsoid(upper,coat,[side*.014,-.085,0],[.085,.145,.085],true);upper.add(forearm);forearm.position.y=-.22;add(forearm,capsule(),coat,[0,-.085,0],[.061,.067,.061],true);ellipsoid(forearm,cream,[0,-.17,0],[.066,.025,.066]);ellipsoid(forearm,skin,[0,-.226,.014],[.059,.069,.056]);return{upper,forearm};});
 const legs=[-1,1].map(side=>{const hip=new T.Group(),knee=new T.Group();rig.add(hip);hip.position.set(side*.102,.65,0);add(hip,capsule(),dark,[0,-.125,0],[.081,.09,.078]);hip.add(knee);knee.position.y=-.25;add(knee,capsule(),dark,[0,-.115,0],[.064,.085,.064]);ellipsoid(knee,leather,[0,-.28,.040],[.091,.076,.144]);ellipsoid(knee,'#c8ae82',[0,-.33,.042],[.094,.018,.142]);return{hip,knee};});
 const parcel=add(torso,shared('parcel',()=>new T.BoxGeometry(.34,.23,.24)),'#c6a36e',[0,-.10,.29],[1,1,1]);parcel.visible=false;
 const seal=ellipsoid(parcel,cream,[0,.045,.125],[.07,.026,.006]);seal.castShadow=false;
 const shadow=new T.Mesh(shared('shadow',()=>new T.CircleGeometry(.29,20)),new T.MeshBasicMaterial({color:'#2f3d3a',transparent:true,opacity:.20,depthWrite:false}));shadow.material.userData.ownedResource=true;shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;root.add(shadow);
 let gait=0,lastTime=0,gestureUntil=0;
 return{root,parcel,head,setColor(c:Character){tinted.forEach(m=>m.material=material(COURIER_LOOK.coats[c]));},greet(t:number){gestureUntil=t+1.5;},animate(t:number,speed:number,reduced:boolean,turn=0,grounded=true){
  const dt=Math.min(.05,Math.max(0,t-lastTime));lastTime=t;const stride=Math.min(1,speed/3);gait+=dt*speed*4.4;const phase=reduced?0:gait;
  rig.position.y=reduced?0:Math.abs(Math.sin(phase))*.018*stride;torso.rotation.set(reduced?0:.035*stride,0,reduced?0:Math.sin(phase)*.025*stride-turn*.035);
  head.rotation.y=reduced?0:Math.sin(t*.65)*.045*(1-stride);head.rotation.z=reduced?0:Math.sin(t*.45)*.012;
  const blink=reduced?1:(t%5.3>.08&&t%5.3<.20?.08:1);eyes.forEach(e=>e.scale.y=blink);
  legs.forEach((leg,i)=>{const s=Math.sin(phase+i*Math.PI);leg.hip.rotation.x=s*.50*stride;leg.knee.rotation.x=Math.max(0,-s)*.62*stride;});
  arms.forEach((arm,i)=>{arm.upper.rotation.set(parcel.visible?-.92:-Math.sin(phase+i*Math.PI)*.35*stride,0,(i?1:-1)*.09);arm.forearm.rotation.x=parcel.visible?-.72:-.18;});
  shadow.visible=grounded;if(!grounded&&!reduced){legs.forEach(l=>{l.hip.rotation.x=-.15;l.knee.rotation.x=.35;});}
  if(t<gestureUntil&&!reduced&&!parcel.visible){arms[1].upper.rotation.z=-2.25;arms[1].forearm.rotation.x=Math.sin(t*14)*.25;}
 }};
}
