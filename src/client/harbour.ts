import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPCS, SPAWN, normalize } from '../shared/world.ts';
import type { Vec3,NpcId } from '../shared/world.ts';
import { HUB_DOCK } from '../shared/ports.ts';
import { groundRadius,surfacePoint,surfaceHeight } from './terrain.ts';
import { courier } from './character.ts';
import { makeShip } from './ship-model.ts';
import { harbourMaterials } from './harbour-materials.ts';
import { habitatCabin,sharedParts } from './shared-assets.ts';
import { builtObject } from './build-art.ts';
import type { Obstacle } from './scene.ts';

// Compact public village. The previous district remains in harbour-city.ts and
// commit f2a350a; no durable NPC, boarding, building or player anchor is rewritten.
export function createHarbour(scene:T.Scene){
  const radius=groundRadius(),p=harbourMaterials(),scenery=new T.Group(),blocks:Obstacle[]=[];
  scene.add(scenery);
  const mesh=(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,position:number[]=[0,0,0],shadow=true)=>{
    const m=new T.Mesh(geometry,material);m.position.fromArray(position);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;
  };
  const box=(parent:T.Object3D,size:number[],position:number[],material:T.Material)=>mesh(parent,new T.BoxGeometry(...size as [number,number,number]),material,position);
  function anchor(parent:T.Object3D,point:Vec3,yaw=0){const up=new T.Vector3(...normalize(point)),g=new T.Group();g.position.copy(surfacePoint(up));g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);g.rotateY(yaw);parent.add(g);return g;}
  function label(parent:T.Object3D,text:string,width:number,y:number,z:number){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#f3ecdb';ctx.fillRect(0,0,512,128);ctx.fillStyle='#32554e';ctx.font='600 46px system-ui';ctx.textAlign='center';ctx.fillText(text,256,82,480);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.userData.ownedResource=true;
    const material=new T.MeshStandardMaterial({map:texture,roughness:.9});material.userData.ownedResource=true;
    mesh(parent,new T.PlaneGeometry(width,width/4),material,[0,y,z],false);
  }
  function route(a:Vec3,b:Vec3,width=1.15){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=36;i++){
      const n=start.clone().lerp(end,i/36).normalize(),t=end.clone().sub(start).projectOnPlane(n).normalize(),right=new T.Vector3().crossVectors(t,n).normalize();
      for(const side of [-1,1]){const at=n.clone().addScaledVector(right,side*width/(2*radius)).normalize();positions.push(...surfacePoint(at,.025).toArray());uv.push(side===-1?0:1,i/8);}
      if(i<36)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(scenery,geometry,p.concrete,[0,0,0],false);
  }
  const ground=new T.MeshStandardMaterial({color:'#95ab7f',roughness:.98,flatShading:true});ground.userData.ownedResource=true;
  const globe=mesh(scene,new T.IcosahedronGeometry(radius,6),ground,[0,0,0],false);
  route(SPAWN,HUB_DOCK,1.35);route(SPAWN,NPCS.mica.position);route(NPCS.mica.position,HUB_DOCK);
  route(SPAWN,NPCS.sol.position);route(NPCS.sol.position,HUB_DOCK);
  function cabin(point:Vec3,yaw:number,title?:string){
    const root=anchor(scenery,point,yaw);root.add(habitatCabin());
    blocks.push({point:new T.Vector3(...point).normalize(),radius:1.28,height:2.5});
    if(title)label(root,title,1.8,2.65,1.02);
    return root;
  }
  // Put each shop behind its unchanged NPC, facing the short central walk.
  for(const id of ['mica','sol'] as const){
    const up=new T.Vector3(...NPCS[id].position),front=new T.Vector3(0,1,.12).projectOnPlane(up).normalize();
    const site=up.clone().addScaledVector(front,-2.15/radius).normalize(),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),site);
    const localFront=front.clone().projectOnPlane(site).normalize().applyQuaternion(q.clone().invert());
    const root=cabin(site.toArray() as Vec3,Math.atan2(localFront.x,localFront.z),id==='mica'?'MICA · POST':'SOL · GARDEN');
    const planter=builtObject('flowers');planter.position.set(-1.15,.03,1.05);root.add(planter);
  }
  const quiet=normalize([.8,.6,.2]),orchard=normalize([-.75,.5,.35]);
  route(NPCS.mica.position,quiet,.9);route(SPAWN,orchard,.9);
  cabin(normalize([.38,1,.48]),-Math.PI/2);cabin(normalize([-.38,1,.48]),Math.PI/2);
  route(SPAWN,normalize([.25,1,.34]),.9);route(SPAWN,normalize([-.25,1,.34]),.9);
  for(const [point,yaw] of [[quiet,-.7],[orchard,.7],[normalize([.12,.45,.95]),Math.PI]] as [Vec3,number][]){const g=anchor(scenery,point,yaw);g.add(builtObject('bench'));}
  for(const point of [[.6,1,.1],[-.6,1,.1],[.82,.5,-.7],[-.7,.48,-.8],[.45,.5,.93],[-.44,.42,.94],[.95,-.2,.34],[-.9,-.3,.2],[.12,-.8,.55]] as Vec3[]){
    const up=normalize(point),g=anchor(scenery,up);g.add(builtObject('tree'));blocks.push({point:new T.Vector3(...up),radius:.40,height:2.1});
  }
  for(const point of [[.12,1,.14],[-.13,1,-.25],[.21,1,-.52],[-.42,.85,-.4]] as Vec3[])anchor(scenery,point).add(sharedParts([{part:'service.light',position:[0,0,0]}]));
  const dock=anchor(scene,HUB_DOCK),gate=anchor(scenery,HUB_DOCK);
  for(const x of [-1.55,1.55]){box(gate,[.18,2.6,.18],[x,1.3,-.15],p.dark);box(gate,[.30,.24,.30],[x,.12,-.15],p.concrete);}
  box(gate,[3.5,.18,.38],[0,2.64,-.15],p.copper);label(gate,'SUNSEED · PORT',2.6,2.3,.06);
  box(dock,[.30,.9,.30],[-.75,.45,.05],p.dark);box(dock,[.38,.09,.36],[-.75,.92,.05],p.copper);
  const dockUp=new T.Vector3(...HUB_DOCK),away=new T.Vector3(0,0,-1).projectOnPlane(dockUp).normalize();
  const shipPoint=dockUp.clone().addScaledVector(away,5.0/radius).normalize().toArray() as Vec3;
  route(HUB_DOCK,shipPoint,1.35);
  // Curved paving follows the small sphere; no enormous flat landing disc.
  const padUp=new T.Vector3(...shipPoint),right=new T.Vector3(1,0,0).projectOnPlane(padUp).normalize(),front=new T.Vector3().crossVectors(right,padUp).normalize();
  const positions:number[]=[...surfacePoint(padUp,.03).toArray()],indices:number[]=[];
  for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,n=padUp.clone().addScaledVector(right,Math.cos(a)*3.8/radius).addScaledVector(front,Math.sin(a)*3.8/radius).normalize();positions.push(...surfacePoint(n,.03).toArray());if(i>0)indices.push(0,i,i+1);}
  const pad=new T.BufferGeometry();pad.setAttribute('position',new T.Float32BufferAttribute(positions,3));pad.setIndex(indices);pad.computeVertexNormals();mesh(scenery,pad,p.concrete,[0,0,0],false);
  const parked=makeShip(),shipAnchor=anchor(scene,shipPoint);shipAnchor.add(parked.root);parked.root.position.y=1.25;parked.animate(0,false);
  blocks.push({point:padUp,radius:2.1,height:2.5});
  const flowers=new T.Group();scene.add(flowers);const planter=anchor(flowers,[-.4,.85,-.49]);planter.add(builtObject('flowers'));
  const npcs=(Object.keys(NPCS) as NpcId[]).map(id=>{const a=anchor(scene,NPCS[id].position),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=id==='mica'?-Math.PI/2:Math.PI/2;const beacon=mesh(a,new T.BoxGeometry(.18,.13,.035),p.pale,[0,1.9,0],false);return{id,anchor:a,avatar,beacon};});
  // Preserve the established static material batching, without model ink callbacks.
  function bake(root:T.Group){
    const ink:T.Object3D[]=[];root.traverse(o=>{if(o.name==='ink-shell'||o.name==='ink-lines')ink.push(o);});
    for(const o of ink){if((o instanceof T.Mesh||o instanceof T.Line)&&!o.geometry.userData.sharedResource)o.geometry.dispose();o.removeFromParent();}
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map<T.Material,T.BufferGeometry[]>(),meshes:T.Mesh[]=[];
    root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));const bucket=batches.get(o.material)??[];bucket.push(g);batches.set(o.material,bucket);meshes.push(o);}});
    const freed=new Set<T.BufferGeometry>();for(const o of meshes){if(!o.geometry.userData.sharedResource&&!freed.has(o.geometry)){freed.add(o.geometry);o.geometry.dispose();}o.removeFromParent();}
    for(const [material,parts]of batches){const g=mergeGeometries(parts);if(g)mesh(root,g,material,[0,0,0],!material.transparent&&material!==p.amber);parts.forEach(p=>p.dispose());}
  }
  bake(scenery);bake(flowers);
  return {globe,scenery,blocks,flowers,npcs,dock,parked,dispose(){},height:surfaceHeight,animate(_t:number,_reduced:boolean,_eye?:T.Vector3,_up?:T.Vector3){void _t;void _reduced;void _eye;void _up;}};
}
