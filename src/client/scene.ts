import * as T from 'three';
import { RADIUS,normalize } from '../shared/world.ts';
import type { Vec3,NpcId } from '../shared/world.ts';
import { portPoint } from '../shared/ports.ts';
import { courier } from './character.ts';
import { surfaceHeight,surfacePoint,setGroundWorld } from './terrain.ts';
import { makeShip } from './space-art.ts';
import { createHarbour } from './harbour.ts';
export { courier } from './character.ts';
export interface Obstacle {point:T.Vector3;radius:number;height:number}
export function createWorld(scene:T.Scene,populated=true){
  setGroundWorld(populated);if(populated)return createHarbour(scene);
  const geo=new T.IcosahedronGeometry(RADIUS,5),a=geo.attributes.position,colors:number[]=[];
  for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).normalize();a.setXYZ(i,...surfacePoint(p).toArray() as Vec3);const shade=.7+.2*Math.sin(p.x*18+p.z*9)*Math.cos(p.z*13);const color=new T.Color('#666b5b').multiplyScalar(shade);colors.push(color.r,color.g,color.b);}
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const ground=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:.1});ground.userData.ownedResource=true;
  const globe=new T.Mesh(geo,ground);globe.receiveShadow=true;scene.add(globe);const scenery=new T.Group();scene.add(scenery);const blocks:Obstacle[]=[];
  const dock=new T.Group(),n=new T.Vector3(...normalize(portPoint('garden')));dock.position.copy(surfacePoint(n));dock.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);scene.add(dock);
  const dark=new T.MeshStandardMaterial({color:'#1d2932',metalness:.65,roughness:.4}),glow=new T.MeshStandardMaterial({color:'#8db6bf',emissive:'#6b9caa',emissiveIntensity:1.5,roughness:.4});dark.userData.ownedResource=glow.userData.ownedResource=true;
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);dock.add(o);return o;};
  const marker=new T.Mesh(new T.TorusGeometry(.7,.025,6,64),glow);marker.position.y=.07;marker.rotation.x=Math.PI/2;dock.add(marker);
  box(.28,.82,.28,-.63,.41,0,dark);box(.23,.23,.02,-.63,.57,.15,glow);
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle='#17242c';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#a6c3c9';ctx.font='500 86px monospace';ctx.textAlign='center';ctx.fillText('RETURN / LW07',512,158);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
  const label=new T.Mesh(new T.PlaneGeometry(1.05,.2625),new T.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:'#ffffff',emissiveIntensity:.6}));label.position.set(-.2,1.22,.12);dock.add(label);
  const parked=makeShip();dock.add(parked.root);parked.root.scale.setScalar(.65);parked.root.position.set(0,3.4,-2.2);parked.flame.visible=false;
  for(const x of [-.58,.58])box(.018,4.05,.018,x,1.7,-1.1,glow).rotation.x=-Math.atan2(2.2,3.4);
  const flowers=new T.Group();scene.add(flowers);const npcs:{id:NpcId;anchor:T.Group;avatar:ReturnType<typeof courier>;beacon:T.Mesh}[]=[];
  return{globe,scenery,blocks,flowers,npcs,dock,parked,animate(t:number,reduced:boolean,_eye?:T.Vector3,_up?:T.Vector3){void _eye;void _up;parked.root.position.y=3.4+(reduced?0:Math.sin(t*.7)*.03);},height:surfaceHeight};
}
