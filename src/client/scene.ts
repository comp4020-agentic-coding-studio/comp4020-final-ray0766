import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NPCS, RADIUS, SPAWN, normalize } from '../shared/world.ts';
import type { Vec3, NpcId } from '../shared/world.ts';
import { HUB_DOCK, portPoint } from '../shared/ports.ts';
import { courier } from './character.ts';
import { surfaceHeight, surfacePoint } from './terrain.ts';
import { makeShip } from './space-art.ts';
export { courier } from './character.ts';
export interface Obstacle {point:T.Vector3;radius:number;height:number}
const mat=(color:string,metalness=.5,roughness=.62)=>new T.MeshStandardMaterial({color,metalness,roughness});
const metal=mat('#47545a'),wall=mat('#738083',.25,.8),dark=mat('#1d2932',.65,.4),trim=mat('#969b90',.7,.36),glass=mat('#1d3d47',.65,.2);
const glow=new T.MeshStandardMaterial({color:'#8db6bf',emissive:'#6b9caa',emissiveIntensity:1.5,roughness:.4});
const warm=new T.MeshStandardMaterial({color:'#dbb47a',emissive:'#ca8f44',emissiveIntensity:1.5,roughness:.4});
const normal=(p:Vec3)=>new T.Vector3(...normalize(p));
function anchor(parent:T.Object3D,p:Vec3,yaw=0){const n=normal(p),g=new T.Group();g.position.copy(surfacePoint(n));g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);g.rotateY(yaw);parent.add(g);return g;}
function part(p:T.Object3D,g:T.BufferGeometry,m:T.Material,pos:number[]=[0,0,0]){const mesh=new T.Mesh(g,m);mesh.position.fromArray(pos);mesh.castShadow=true;mesh.receiveShadow=true;p.add(mesh);return mesh;}
const box=(p:T.Object3D,size:[number,number,number],pos:number[],m:T.Material=metal)=>part(p,new RoundedBoxGeometry(...size,1,.035),m,pos);
function label(p:T.Object3D,text:string,width:number,pos:number[],color='#a6c3c9',background='#17242c'){
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.fillRect(24,30,8,195);ctx.font='500 86px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,536,133,928);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
  const m=new T.MeshStandardMaterial({map:t,emissiveMap:t,emissive:'#ffffff',emissiveIntensity:.6,roughness:.62});return part(p,new T.PlaneGeometry(width,width/4),m,pos);
}
function strip(parent:T.Object3D,a:Vec3,b:Vec3,width:number,m:T.Material,offset=.028){
  const aa=normal(a),bb=normal(b),points:number[]=[],indices:number[]=[];
  for(let i=0;i<=30;i++){const n=aa.clone().lerp(bb,i/30).normalize(),right=new T.Vector3().crossVectors(bb.clone().sub(aa),n).normalize();for(const side of [-1,1])points.push(...surfacePoint(n.clone().addScaledVector(right,side*width/(2*RADIUS)).normalize(),offset).toArray());if(i<30)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();const mesh=part(parent,g,m);mesh.castShadow=false;
}
function bake(group:T.Group){
  group.updateMatrixWorld(true);const batches=new Map<T.Material,T.BufferGeometry[]>(),remove:T.Mesh[]=[];
  group.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)&&o.material instanceof T.MeshStandardMaterial&&!o.material.map){const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);g.deleteAttribute('uv');const b=batches.get(o.material)??[];b.push(g);batches.set(o.material,b);remove.push(o);}});
  remove.forEach(o=>{o.removeFromParent();o.geometry.dispose();});for(const [m,gs]of batches){const g=mergeGeometries(gs);if(g)part(group,g,m);gs.forEach(g=>g.dispose());}
}
export function createWorld(scene:T.Scene,populated=true){
  const geo=new T.IcosahedronGeometry(RADIUS,5),a=geo.attributes.position,colors:number[]=[];
  for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).normalize();a.setXYZ(i,...surfacePoint(p).toArray() as Vec3);const shade=.7+.2*Math.sin(p.x*18+p.z*9)*Math.cos(p.z*13);const color=new T.Color(populated?'#48595b':'#666b5b').multiplyScalar(shade);colors.push(color.r,color.g,color.b);}
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const ground=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:.1});ground.userData.ownedResource=true;
  const globe=part(scene,geo,ground);globe.castShadow=false;const scenery=new T.Group();scene.add(scenery);const blocks:Obstacle[]=[];
  const dock=anchor(scene,portPoint(populated?'hub':'garden'));
  const portable=!populated;
  const marker=part(dock,new T.TorusGeometry(portable?.7:1.1,.025,6,64),glow,[0,.07,0]);marker.rotation.x=Math.PI/2;
  const terminal=box(dock,[.28,.82,.28],[-.63,.41,0],dark);box(terminal,[.23,.23,.02],[0,.16,.15],glow);label(dock,portable?'RETURN / LW07':'BOARDING / 01',portable?1.05:1.45,[-.2,1.22,.12]);
  const parked=makeShip();const shipAnchor=portable?dock:anchor(scene,[0,.7,-1.3]);shipAnchor.add(parked.root);parked.root.scale.setScalar(portable?.65:.82);parked.root.position.y=portable?3.4:.44;if(portable)parked.root.position.z=-2.2;parked.flame.visible=false;
  if(portable){for(const x of [-.58,.58]){const guide=box(dock,[.018,4.05,.018],[x,1.7,-1.1],glow);guide.rotation.x=-Math.atan2(2.2,3.4);}}
  const flowers=new T.Group();scene.add(flowers);
  const npcs: {id:NpcId;anchor:T.Group;avatar:ReturnType<typeof courier>;beacon:T.Mesh}[]=[];
  if(populated){
    const road=mat('#242f35',.32,.85);strip(scenery,SPAWN,HUB_DOCK,1.85,road);
    for(const x of [-.078,.078])strip(scenery,normalize([x,1,.36]),normalize([x,1,-.83]),.036,glow,.036);
    for(const z of [.18,-.03,-.23,-.43,-.61]){const g=anchor(scenery,[0,1,z]);for(const side of [-1,1]){const chevron=box(g,[.035,.018,.32],[side*.11,.052,0],warm);chevron.rotation.y=side*.65;}}
    strip(scenery,normalize([0,1,-.1]),NPCS.mica.position,.88,road);strip(scenery,normalize([0,1,-.38]),NPCS.sol.position,.88,road);
    // Walkable service circuit connects the far hemisphere without enlarging the sphere.
    const circuit:Vec3[]=[SPAWN,normalize([-.30,1,.7]),normalize([-.58,.45,.9]),normalize([-.3,-.5,1]),normalize([.35,-.65,.7]),normalize([.8,-.18,.55]),normalize([.75,.7,.3]),normalize([.2,1,.55]),SPAWN];
    for(let i=0;i<circuit.length-1;i++)strip(scenery,circuit[i],circuit[i+1],.88,road);
    const plaza=anchor(scenery,[.38,-.68,.42]);part(plaza,new T.CylinderGeometry(1.3,1.35,.13,24),dark,[0,.05,0]);
    box(plaza,[.3,4.2,.3],[0,2.1,0],metal);for(const y of [2.2,3.1,4.1]){const ring=part(plaza,new T.TorusGeometry(y===4.1?.42:.7,.06,8,32),glow,[0,y,0]);ring.rotation.x=Math.PI/2;}
    label(plaza,'OBSERVATORY / 03',1.7,[0,1.35,.3]);blocks.push({point:plaza.position.clone().normalize(),radius:.3,height:4.2});
    for(const p of [[-.30,1,.65],[.72,.45,.48],[.15,-.7,.72]] as Vec3[]){const sign=anchor(scenery,p);box(sign,[.055,1.35,.055],[0,.67,0],metal);label(sign,'SERVICE LOOP  →',1.1,[0,1.18,.05]);}
    const district=[
      {p:[-.35,1,.25],w:1.7,h:2.8,d:1.65,t:'HABITAT / 04',yaw:.2},
      {p:[.37,1,.34],w:1.85,h:3.3,d:1.7,t:'TRANSIT EXCHANGE',yaw:-.2},
      {p:[-.40,1,-.10],w:1.8,h:3.8,d:1.45,t:'CREW QUARTERS',yaw:.3},
      {p:[.57,1,-.31],w:2,h:2.5,d:1.55,t:'MICA / POST',yaw:-.22},
      {p:[-.64,.86,-.73],w:1.8,h:2.35,d:1.5,t:'SOL / BIO LAB',yaw:.25},
      {p:[.54,.7,-.8],w:1.65,h:3.6,d:1.5,t:'CARGO / 02',yaw:-.4},
      {p:[.7,.62,.12],w:1.9,h:3.15,d:1.8,t:'ENGINEERING',yaw:-.55},
      {p:[-.63,.7,.60],w:1.65,h:2.7,d:1.5,t:'FREIGHT STORAGE',yaw:.5},
      {p:[-.82,.12,-.1],w:1.8,h:3.3,d:1.7,t:'RELAY / 07',yaw:.2},
      {p:[.1,-.7,.65],w:1.8,h:2.7,d:1.6,t:'OUTPOST / 09',yaw:0},
    ];
    for(const [i,b]of district.entries()){
      const g=anchor(scenery,b.p as Vec3,b.yaw);blocks.push({point:g.position.clone().normalize(),radius:Math.min(b.w,b.d)*.59,height:b.h+.4});
      box(g,[b.w+.16,.18,b.d+.16],[0,.09,0],dark);box(g,[b.w,b.h,b.d],[0,b.h/2+.16,0],i%3===0?metal:wall);
      for(const side of [-1,1])box(g,[.075,b.h+.1,b.d+.07],[side*b.w*.49,b.h/2+.2,0],dark);
      box(g,[b.w+.10,.14,b.d+.12],[0,b.h+.18,0],dark);box(g,[b.w*.68,.22,b.d*.55],[0,b.h+.35,-.2],metal);
      for(let j=0;j<5;j++)box(g,[b.w*.52,.04,.075],[0,b.h+.48,-.48+j*.15],dark);
      for(let level=0;level<Math.floor(b.h/1.05);level++)for(const x of [-.29,.29]){box(g,[.42,.42,.04],[x*b.w,.85+level*.88,b.d/2+.025],glass);box(g,[.36,.018,.048],[x*b.w,.69+level*.88,b.d/2+.052],i%2?warm:glow);}
      box(g,[.54,1.05,.07],[0,.66,b.d/2+.05],dark);box(g,[.025,.85,.03],[-.24,.7,b.d/2+.10],warm);box(g,[.42,.13,.31],[0,.14,b.d/2+.21],metal);
      label(g,b.t,b.w*.95,[0,Math.min(1.96,b.h-.05),b.d/2+.075]);
      for(const x of [-.42,.40])part(g,new T.CylinderGeometry(.055,.055,b.h*.85,10),trim,[x*b.w,b.h*.47,-b.d*.52]);
      if(i%2===0){const antenna=box(g,[.055,1.0,.055],[b.w*.32,b.h+.75,-.4],trim);part(antenna,new T.SphereGeometry(.055,10,6),warm,[0,.53,0]);}
    }
    // A framed terminal canopy reads as a building while its middle remains walkable.
    const gate=anchor(scenery,HUB_DOCK);for(const x of [-1.48,1.48]){box(gate,[.22,2.8,.34],[x,1.4,-.4],metal);box(gate,[.045,2.2,.06],[x,1.3,-.19],glow);}
    box(gate,[3.22,.34,1.05],[0,2.83,-.45],dark);label(gate,'STARPORT  /  ↑',2.95,[0,2.9,.105]);
    strip(scenery,HUB_DOCK,normalize([0,.7,-1.3]),1.65,road);
    blocks.push({point:normal([0,.7,-1.3]),radius:1.55,height:1.4});
    const pad=anchor(scenery,[0,.7,-1.3]);part(pad,new T.CylinderGeometry(2.05,2.12,.16,48),dark,[0,.07,0]);const ring=part(pad,new T.TorusGeometry(1.88,.03,6,64),warm,[0,.17,0]);ring.rotation.x=-Math.PI/2;
    for(const z of [.25,-.1,-.43])for(const x of [-.135,.135]){const g=anchor(scenery,[x,1,z]);box(g,[.07,1.9,.07],[0,.95,0],metal);box(g,[.34,.045,.17],[0,1.93,.04],glow);}
    const signpost=anchor(scenery,[-.11,1,.27]);box(signpost,[.065,1.55,.065],[0,.775,0],metal);label(signpost,'↑ STARPORT',1.16,[0,1.4,.05]);label(signpost,'WALK THE BLUE LINE',1.12,[0,1.10,.05],'#b09d7e');
    for(const id of Object.keys(NPCS) as NpcId[]){const a=anchor(scene,NPCS[id].position),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=id==='mica'?Math.PI*.82:Math.PI*.3;const beacon=part(a,new T.OctahedronGeometry(.08),warm,[0,1.9,0]);npcs.push({id,anchor:a,avatar,beacon});}
    const bed=anchor(flowers,[-.5,.85,-.4]);box(bed,[.8,.15,.5],[0,.08,0],dark);for(let i=0;i<6;i++)part(bed,new T.ConeGeometry(.08,.32,6),mat('#6d9379',0,1),[(i%3-1)*.2,.3,Math.floor(i/3)*.2]);
    bake(scenery);
  }
  return{globe,scenery,blocks,flowers,npcs,dock,parked,
    animate(t:number,reduced:boolean){if(portable)parked.root.position.y=3.4+(reduced?0:Math.sin(t*.7)*.03);},height:surfaceHeight};
}
