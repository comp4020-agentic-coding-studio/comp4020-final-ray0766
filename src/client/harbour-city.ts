import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NPCS, SPAWN, normalize } from '../shared/world.ts';
import type { Vec3,NpcId } from '../shared/world.ts';
import { HUB_DOCK } from '../shared/ports.ts';
import { groundRadius,logicalNormal,surfaceNormal,surfacePoint,surfaceScale,surfaceHeight } from './terrain.ts';
import { courier } from './character.ts';
import { makeShip } from './ship-model.ts';
import { harbourMaterials } from './harbour-materials.ts';
import { sharedParts,habitatCabin } from './shared-assets.ts';
import { builtObject } from './build-art.ts';
import type { Obstacle } from './scene.ts';

// Original modular architecture, generated surfaces and lighting. No reference art
// is loaded by the application. Dimensions below are display metres.
export function createHarbour(scene:T.Scene){
  const scenery=new T.Group(),near=new T.Group(),far=new T.Group(),extra=new T.Group();scene.add(scenery);scenery.add(near,far,extra);
  const blocks:Obstacle[]=[];let seed=719;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const {concrete,pale,metal,dark,copper,road,edge,cyan,amber,glass,facade}=harbourMaterials();
  function mesh(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,p:number[]=[0,0,0],shadow=true){const o=new T.Mesh(g,m);o.position.fromArray(p);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o;}
  function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material=metal,bevel=0){return mesh(parent,bevel?new RoundedBoxGeometry(w,h,d,1,bevel):new T.BoxGeometry(w,h,d),m,[x,y,z]);}
  function anchor(parent:T.Object3D,p:Vec3,yaw=0){const n=new T.Vector3(...normalize(p)),g=new T.Group();g.position.copy(surfacePoint(n));g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),surfaceNormal(n));g.rotateY(yaw);parent.add(g);return g;}
  function atMetres(parent:T.Object3D,x:number,z:number,yaw=0){const n=new T.Vector3(x,groundRadius(),z).normalize();return anchor(parent,logicalNormal(n).toArray() as Vec3,yaw);}
  function sign(parent:T.Object3D,title:string,subtitle:string,w:number,x:number,y:number,z:number){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle='#f3ecdb';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#c26b4b';ctx.fillRect(20,26,5,204);ctx.fillStyle='#2f4a43';ctx.font='600 72px system-ui';ctx.fillText(title,58,106,920);ctx.fillStyle='#49665b';ctx.font='27px system-ui';ctx.fillText(subtitle,60,188,914);ctx.fillStyle='#c26b4b';ctx.fillRect(925,38,55,6);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;t.userData.ownedResource=true;
    const m=new T.MeshStandardMaterial({map:t,emissiveMap:t,emissive:'#ffffff',emissiveIntensity:.18,roughness:.88});m.userData.ownedResource=true;return mesh(parent,new T.PlaneGeometry(w,w/4),m,[x,y,z],false);
  }
  function tileRoof(parent:T.Object3D,w:number,d:number,rise:number,x:number,base:number,z:number){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-w/2,0,-d/2,w/2,0,-d/2,0,rise,-d/2,-w/2,0,d/2,w/2,0,d/2,0,rise,d/2],3));g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1,0,1,4,0,4,3]);const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return mesh(parent,flat,copper,[x,base,z]);
  }
  function beam(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m:T.Material){const o=mesh(parent,new T.CylinderGeometry(r,r,a.distanceTo(b),8),m,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
  function route(a:Vec3,b:Vec3,width:number,m:T.Material,offset=.028){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),points:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=48;i++){const n=start.clone().lerp(end,i/48).normalize(),centre=surfacePoint(n,offset),t=surfacePoint(start.clone().lerp(end,Math.min(1,i/48+.001)).normalize()).sub(surfacePoint(start.clone().lerp(end,Math.max(0,i/48-.001)).normalize())).normalize(),right=new T.Vector3().crossVectors(t,surfaceNormal(n)).normalize();for(const side of [-1,1]){points.push(...centre.clone().addScaledVector(right,side*width/2).toArray());uv.push(side===-1?0:width,i/3);}if(i<48)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();mesh(near,g,m,[0,0,0],false);
  }
  function windowFace(parent:T.Object3D,w:number,h:number,x:number,y:number,z:number,angle=0){const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w/9.6,uv.getY(i)*h/33.6);const o=mesh(parent,g,facade,[x,y,z]);o.rotation.y=angle;return o;}
  function building(parent:T.Group,x:number,z:number,w:number,d:number,h:number,index:number,detailed=false,yaw=0){
    const g=atMetres(parent,x,z,yaw);box(g,w,.45,d,0,.22,0,concrete);box(g,w-.35,h,d-.35,0,h/2+.4,0,index%3===0?concrete:pale);
    if(detailed){windowFace(g,w-.7,h-3.6,0,h/2+1.8,d/2+.016);windowFace(g,w-.7,h-3.6,0,h/2+1.8,-d/2-.016,Math.PI);windowFace(g,d-.7,h-3.6,w/2+.016,h/2+1.8,0,Math.PI/2);windowFace(g,d-.7,h-3.6,-w/2-.016,h/2+1.8,0,-Math.PI/2);}
    for(const side of [-1,1])for(const back of [-1,1])box(g,.28,h+.7,.28,side*(w/2-.05),h/2+.35,back*(d/2-.05),dark);
    box(g,w+.45,.33,d+.45,0,h+.45,0,copper);tileRoof(g,w*.72,d*.64,.65,0,h+.595,0);
    for(let floor=1;floor<h/3.35;floor++)box(g,w+.21,.15,d+.21,0,floor*3.35+.4,0,dark);
    if(h>30){box(g,w*.42,h*.2,d*.50,w*.15,h*1.1+.6,0,pale);tileRoof(g,w*.42,d*.50,.6,w*.15,h*1.2+.6,0);}
    if(detailed){
      const n=logicalNormal(g.position.clone().normalize());blocks.push({point:n,radius:Math.min(w,d)*.49/surfaceScale(n),height:h});
      // Cream door surround, timber panels, tiled awning and hanging lantern.
      box(g,w-.4,3.3,.16,0,1.75,d/2+.06,concrete);box(g,2.12,2.65,.16,0,1.48,d/2+.18,pale);box(g,1.62,2.35,.07,0,1.34,d/2+.27,metal);
      for(const side of [-1,1]){box(g,.67,1.0,.035,side*.39,.83,d/2+.33,dark);box(g,.67,.73,.035,side*.39,1.80,d/2+.33,glass);beam(g,new T.Vector3(side*.93,2.4,d/2+.2),new T.Vector3(side*.93,2.81,d/2+.92),.06,dark);}
      box(g,.06,.3,.06,.44,1.22,d/2+.38,copper);tileRoof(g,2.55,1.1,.18,0,2.85,d/2+.5);
      box(g,.24,.30,.22,1.33,2.32,d/2+.25,amber);box(g,.30,.06,.28,1.33,2.50,d/2+.25,dark);box(g,.06,.40,.07,1.33,2.6,d/2+.13,dark);
      const entry=sharedParts([{part:'wall.window',position:[-2,.16,d/2+.40]},{part:'wall.window',position:[2,.16,d/2+.40]}]);g.add(entry);
      sign(g,['TRANSIT EXCHANGE','HABITAT / 04','MICA / POST','SOL / BIO LAB'][index%4],'SUNSEED HARBOUR  /  DISTRICT 07',Math.min(w-.8,5.6),0,3.88,d/2+.20);
      for(const side of [-1,1]){const xx=side*(w*.31);box(g,1.65,.50,.4,xx,.6,d/2+.35,copper,.04);box(g,1.70,.10,.44,xx,.87,d/2+.35,pale);}
      if(index%4===2){
        box(g,.55,.75,.30,-1.42,.94,d/2+.33,copper,.06);box(g,.36,.055,.025,-1.42,1.1,d/2+.50,dark);box(g,.29,.15,.025,-1.42,.84,d/2+.50,pale);
        const clock=mesh(g,new T.CylinderGeometry(.32,.32,.06,20),pale,[0,4.92,d/2+.22]);clock.rotation.x=Math.PI/2;box(g,.035,.21,.025,0,4.99,d/2+.265,dark);box(g,.17,.035,.025,.07,4.92,d/2+.265,dark);
      }
      box(g,2.3,1.1,1.8,-w*.18,h+1.34,0,pale,.16);for(let i=0;i<5;i++)box(g,1.85,.065,.045,-w*.18,h+1.08+i*.14,.91,dark);
    }
    return g;
  }
  const globe=mesh(scene,new T.SphereGeometry(groundRadius(),256,192),concrete,[0,0,0],false);
  // A continuous route with walkable apron; curb/detail geometry stays outside it.
  route(SPAWN,HUB_DOCK,8.2,road);route(SPAWN,HUB_DOCK,.045,cyan,.048);
  const shipPoint=normalize([0,.7,-1.3]);route(HUB_DOCK,shipPoint,8.8,road);
  for(const z of [12,7,2,-3,-8,-13,-18,-23,-28,-33]){
    const p=atMetres(near,0,z);for(const side of [-1,1]){for(let stone=0;stone<5;stone++)box(p,.35,.16,.93,side*4.3,.08,stone-2,concrete,.025);box(p,.045,.025,3.6,side*3.80,.06,0,cyan);box(p,.55,.024,.10,side*3.1,.065,0,pale);}
    box(p,7.9,.012,.025,0,.041,2.44,edge);
  }
  route(normalize([0,1,-.14]),NPCS.mica.position,3.2,road);route(normalize([0,1,-.50]),NPCS.sol.position,3.2,road);
  const district=[[-11,10,9,8,17,1,Math.PI/2],[12,8,9,10,25,0,-Math.PI/2],[-12,-6,10,9,23,1,Math.PI/2],[22,-7,9,10,17,2,-Math.PI/2],[-25,-24,10,10,14,3,Math.PI/2],[17,-27,9,9,29,0,-Math.PI/2],[-17,-40,9,8,18,1,Math.PI/2]];
  district.forEach(([x,z,w,d,h,i,yaw])=>building(near,x,z,w,d,h,i,true,yaw));
  // Structural elevated service bridge. The opening is 5.5 m above the street.
  const bridge=atMetres(near,0,-7);box(bridge,19,.65,2.5,0,5.65,0,dark);box(bridge,19,.12,2.8,0,6.08,0,dark);for(const side of [-1,1]){box(bridge,18,.08,.1,0,7.22,side*1.2,dark);box(bridge,18,.09,.08,0,6.3,side*1.2,dark);for(let x=-9;x<=9;x+=.5){box(bridge,.12,1.05,.10,x,6.65,side*1.2,pale);}}
  for(const x of [-7.8,7.8]){box(bridge,.5,5.5,.6,x,2.75,0,dark);beam(bridge,new T.Vector3(x,4.1,0),new T.Vector3(x+Math.sign(x)*2.8,5.4,0),.10,dark);}
  sign(bridge,'PORT AUTHORITY  /  01','BOARDING ACCESS  ↑     PUBLIC CONCOURSE',6.2,0,5.63,1.30);
  for(const z of [9,-2,-16,-29])for(const side of [-1,1]){
    const g=atMetres(near,side*4.9,z);box(g,.19,4.6,.20,0,2.3,0,dark);box(g,1.6,.08,.48,-side*.5,4.72,0,dark);tileRoof(g,1.6,.48,.08,-side*.5,4.68,0);box(g,1.25,.025,.33,-side*.5,4.59,0,amber);box(g,.36,.52,.34,0,.28,0,concrete,.04);
    for(const xx of [-.52,.52])box(g,.035,.25,.33,-side*.5+xx,4.55,0,dark);
    for(const zz of [-.6,.6]){box(g,.16,.50,.16,side*.6,.25,zz,concrete,.025);box(g,.13,.10,.13,side*.6,.52,zz,amber);box(g,.19,.06,.19,side*.6,.6,zz,dark);}
  }
  // Public service kiosks are the same assembled cabin offered in the existing player catalogue.
  for(const [x,z,yaw]of [[7,-14,-Math.PI/2],[-7,-22,Math.PI/2]]){const g=atMetres(near,x,z,yaw);g.add(habitatCabin());const n=logicalNormal(g.position.clone().normalize());blocks.push({point:n,radius:1.2/surfaceScale(n),height:2.5});}
  for(const [x,z]of [[-4.8,-9],[4.8,-21]]){const g=atMetres(near,x,z);g.add(sharedParts([{part:'service.light',position:[0,0,0]}]));}
  const direction=atMetres(near,-3.2,8);box(direction,.07,2.7,.07,0,1.35,0,dark);sign(direction,'STARPORT  ↑','BOARDING / FOLLOW BLUE LINE',2.75,0,2.3,.055);
  // Boardable terminal and the player’s currently saved ship.
  const dock=anchor(scene,HUB_DOCK),gate=anchor(near,HUB_DOCK);
  for(const side of [-1,1]){box(gate,.65,6.1,.9,side*5.2,3.05,-1.6,concrete);box(gate,1.2,.6,1.45,side*5.2,.3,-1.6,concrete);beam(gate,new T.Vector3(side*5.2,4.0,-1.6),new T.Vector3(side*3.0,5.9,-1.6),.10,dark);for(let y=.8;y<6;y+=.8)box(gate,.67,.045,.92,side*5.2,y,-1.6,edge);box(gate,.24,.4,.22,side*4.84,3.3,-1.12,amber);box(gate,.32,.08,.30,side*4.84,3.54,-1.12,dark);}
  box(gate,11.3,.55,5.0,0,6.2,-2.2,dark);tileRoof(gate,11.7,5.3,.15,0,6.475,-2.2);sign(gate,'SUNSEED / STARPORT','GATE 01   /   FLIGHT SERVICES   /   OPEN',7.9,0,6.2,.35);
  box(dock,.46,1.08,.36,-1.1,.54,0,dark,.03);box(dock,.62,.16,.48,-1.1,1.16,0,dark,.025);const consoleScreen=box(dock,.5,.33,.06,-1.1,1.09,.27,glass);consoleScreen.rotation.x=-.15;sign(dock,'01 / BOARD','TOUCH / E',1.18,-1.1,1.77,.16);box(dock,.035,.58,.035,-1.44,.87,.20,cyan);
  const pad=anchor(near,shipPoint);
  mesh(pad,new T.CylinderGeometry(8.6,8.6,.3,64),concrete,[0,.13,0]);const rim=mesh(pad,new T.TorusGeometry(8.1,.04,6,96),pale,[0,.32,0],false);rim.rotation.x=-Math.PI/2;
  for(let i=0;i<48;i++){const a=i/48*Math.PI*2;const stone=box(pad,.76,.09,.38,Math.cos(a)*8.35,.32,Math.sin(a)*8.35,edge,.04);stone.rotation.y=-a+Math.PI/2;}box(pad,.16,.018,4,0,.32,0,pale);box(pad,4,.018,.16,0,.32,0,pale);
  for(const x of [-3,3]){box(pad,.07,.02,9,x,.32,0,pale);for(const z of [-5.4,5.4])box(pad,3,.024,.10,x,.33,z,pale);}
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;box(pad,.3,.08,.15,Math.cos(a)*7.7,.35,Math.sin(a)*7.7,cyan);}
  const parked=makeShip();const shipAnchor=anchor(scene,shipPoint);shipAnchor.add(parked.root);parked.root.position.y=1.05;parked.animate(0,false);
  const shipN=new T.Vector3(...shipPoint);blocks.push({point:shipN,radius:3.6/surfaceScale(shipN),height:2.5});
  // A distant cargo hall and an identifiable mast terminate the landing axis.
  const hall=building(far,0,-104,39,22,16,0,false);box(hall,26,9,.22,0,4.6,11.25,dark);for(let x=-12;x<=12;x+=3)box(hall,.16,8.9,.3,x,4.6,11.4,metal);sign(hall,'ORBITAL / FREIGHT','SUNSEED CIVIL SPACEPORT',24,0,13.1,11.4);
  building(far,35,-102,16,18,93,1);building(far,-48,-88,24,22,64,2);building(far,62,-44,22,20,74,0);
  // Stable deterministic rings: larger structural blocks behind the detailed street.
  for(let i=0;i<68;i++){const angle=i*2.399963,r=80+random()*145,x=Math.cos(angle)*r,z=Math.sin(angle)*r-72;if(Math.abs(x)<20&&z>-70&&z<35)continue;const w=8+random()*13,d=9+random()*13,h=16+random()**2*72;building(far,x,z,w,d,h,i);}
  for(let i=0;i<86;i++){const angle=i*2.399963,r=190+random()*210,x=Math.cos(angle)*r,z=Math.sin(angle)*r-100;building(extra,x,z,9+random()*17,10+random()*19,20+random()*78,i);}
  const flowers=new T.Group();scene.add(flowers);const planter=anchor(flowers,[-.4,.85,-.49]);for(const x of [-.75,0,.75]){const pot=builtObject('flowers');pot.position.x=x;pot.scale.setScalar(1.5);planter.add(pot);}
  const npcs=(Object.keys(NPCS) as NpcId[]).map(id=>{const a=anchor(scene,NPCS[id].position),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=id==='mica'?-Math.PI/2:Math.PI/2;const beacon=mesh(a,new T.BoxGeometry(.18,.13,.035),pale,[0,1.9,0],false);for(const side of [-1,1]){const fold=box(beacon,.105,.012,.008,side*.039,.009,.022,copper);fold.rotation.z=side*.5;fold.castShadow=false;}return{id,anchor:a,avatar,beacon};});
  // Large fixed districts use material batches and cel shading. Model-level ink
  // callbacks cannot survive a world-space merge; omit those shells/lines here.
  // Library resources remain owned by the library, including shared geometry.
  function bake(root:T.Group,shadows:boolean){
    const ink:T.Object3D[]=[];root.traverse(o=>{if(o.name==='ink-shell'||o.name==='ink-lines')ink.push(o);});
    for(const o of ink){if((o instanceof T.Mesh||o instanceof T.Line)&&!o.geometry.userData.sharedResource)o.geometry.dispose();o.removeFromParent();}
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map<T.Material,T.BufferGeometry[]>(),meshes:T.Mesh[]=[];
    root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));const gs=batches.get(o.material)??[];gs.push(g);batches.set(o.material,gs);meshes.push(o);}});
    const freed=new Set<T.BufferGeometry>();for(const o of meshes){if(!o.geometry.userData.sharedResource&&!freed.has(o.geometry)){freed.add(o.geometry);o.geometry.dispose();}o.removeFromParent();}
    for(const[m,gs]of batches){const g=mergeGeometries(gs);if(g)mesh(root,g,m,[0,0,0],shadows&&!m.transparent&&!(m instanceof T.MeshStandardMaterial&&m.emissiveIntensity>0&&m.emissive.getHex()!==0));gs.forEach(g=>g.dispose());}
  }
  bake(near,true);bake(far,false);bake(extra,false);bake(flowers,false);
  const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{up:{value:new T.Vector3(0,1,0)},zenith:{value:new T.Color('#83bdb9')},horizon:{value:new T.Color('#cfe4dc')}},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 direction;uniform vec3 up;uniform vec3 zenith;uniform vec3 horizon;void main(){float h=dot(normalize(direction),up);gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-.08,.85,h)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});skyMaterial.userData.ownedResource=true;
  const atmosphere=new T.Mesh(new T.SphereGeometry(1500,24,16),skyMaterial);atmosphere.renderOrder=-10;scene.add(atmosphere);
  return {globe,scenery,blocks,flowers,npcs,dock,parked,dispose(){},height:surfaceHeight,
    animate(_t:number,_reduced:boolean,eye?:T.Vector3,up?:T.Vector3){extra.visible=innerWidth>=700;if(eye)atmosphere.position.copy(eye);if(up)skyMaterial.uniforms.up.value.copy(up);},
  };
}
