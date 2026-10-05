import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RADIUS } from '../shared/world.ts';

// Original procedural industrial craft. Orbital lunar maps: NASA SVS; see ASSET-CREDITS.md.
const standard=(color:string,metalness:number,roughness:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
const steel=standard('#59666d',.82,.34),paint=standard('#4b5b60',.68,.45),dark=standard('#17232d',.8,.32),ceramic=standard('#87918e',.22,.61),copper=standard('#8e5d36',.7,.4);
const surface=document.createElement('canvas');surface.width=256;surface.height=256;const surf=surface.getContext('2d')!;surf.fillStyle='#a4a4a4';surf.fillRect(0,0,256,256);
let grain=59;const rand=()=>{grain=(grain*1664525+1013904223)>>>0;return grain/4294967296;};
for(let i=0;i<1700;i++){const c=130+Math.floor(rand()*65);surf.fillStyle=`rgb(${c},${c},${c})`;surf.fillRect(rand()*256,rand()*256,.35+rand()*.7,1+rand()*7);}
const wear=new T.CanvasTexture(surface);wear.wrapS=wear.wrapT=T.RepeatWrapping;for(const material of [steel,paint,copper]){material.roughnessMap=wear;material.bumpMap=wear;material.bumpScale=.009;}
const glass=new T.MeshPhysicalMaterial({color:'#10242b',metalness:.3,roughness:.11,clearcoat:1,clearcoatRoughness:.07});
const white=new T.MeshStandardMaterial({color:'#9acecd',emissive:'#87c4da',emissiveIntensity:2,roughness:.3});
const amber=new T.MeshStandardMaterial({color:'#cd925b',emissive:'#b45c1d',emissiveIntensity:1.5});
function mesh(p:T.Object3D,g:T.BufferGeometry,m:T.Material,pos:[number,number,number]=[0,0,0]){const a=new T.Mesh(g,m);a.position.fromArray(pos);p.add(a);return a;}
function panel(p:T.Object3D,size:[number,number,number],pos:[number,number,number],m:T.Material=paint,r=.035){return mesh(p,new RoundedBoxGeometry(...size,2,r),m,pos);}
function cylinder(p:T.Object3D,r:number,length:number,pos:[number,number,number],m:T.Material){const o=mesh(p,new T.CylinderGeometry(r,r,length,24,1),m,pos);o.rotation.x=Math.PI/2;return o;}
function hoop(p:T.Object3D,r:number,tube:number,pos:[number,number,number],m:T.Material){return mesh(p,new T.TorusGeometry(r,tube,6,32),m,pos);}
function tapered(p:T.Object3D,sections:number[][],m:T.Material){
  const vertices:number[]=[],indices:number[]=[];const profile=[[-1,-.55],[-.65,-1],[.65,-1],[1,-.55],[1,.5],[.65,1],[-.65,1],[-1,.5]];
  for(const [z,w,h,y] of sections)for(const [x,py] of profile)vertices.push(x*w,py*h+y,z);
  for(let i=0;i<sections.length-1;i++)for(let k=0;k<8;k++){const a=i*8+k,b=i*8+(k+1)%8;indices.push(a,b,b+8,a,b+8,a+8);}
  for(let k=1;k<7;k++){indices.push(0,k+1,k);const o=(sections.length-1)*8;indices.push(o,o+k,o+k+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);const flat=g.toNonIndexed();flat.computeVertexNormals();g.dispose();return mesh(p,flat,m);
}
function mergeStatic(root:T.Group){
  root.updateMatrixWorld(true);const groups=new Map<T.Material,T.BufferGeometry[]>();
  root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));const found=groups.get(o.material)??[];found.push(g);groups.set(o.material,found);o.geometry.dispose();}});
  root.clear();for(const [m,geometries] of groups){const merged=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g));if(merged)root.add(new T.Mesh(merged,m));geometries.forEach(g=>g.dispose());}
}
export function makeShip(){
  const root=new T.Group(),body=new T.Group();root.add(body);
  tapered(body,[[-3,.23,.17,-.08],[-2.3,.64,.3,0],[-.8,.94,.37,0],[1.9,.8,.32,0],[2.4,.6,.23,-.03]],paint);
  tapered(body,[[-2.6,.15,.07,.11],[-1.9,.49,.16,.34],[-.55,.54,.28,.4],[.15,.48,.19,.35]],dark);
  tapered(body,[[-2.13,.38,.07,.46],[-1.72,.45,.17,.56],[-.65,.48,.24,.52],[-.25,.39,.09,.53]],glass);
  for(const side of [-1,1]){
    const x=side*1.23;
    panel(body,[.98,.18,2.1],[side*1.03,-.03,.16],dark);
    const wing=panel(body,[1.14,.14,1.4],[side*1.24,.1,.27],paint);wing.rotation.y=side*-.25;
    cylinder(body,.36,2.68,[x,.015,.8],steel);
    panel(body,[.59,.13,1.54],[x,.29,.2],ceramic);
    panel(body,[.13,.3,2.05],[x+side*.34,.1,.4],dark);
    for(const z of [-.12,.23,.58,.93,1.28])hoop(body,.365,.035,[x,0,z],dark);
    cylinder(body,.42,.42,[x,0,2.04],steel);hoop(body,.40,.055,[x,0,2.26],copper);
    cylinder(body,.315,.08,[x,0,2.275],dark);hoop(body,.265,.028,[x,0,2.322],white);
    cylinder(body,.22,.07,[x,0,2.32],dark);hoop(body,.165,.025,[x,0,2.365],white);cylinder(body,.078,.075,[x,0,2.36],white);
    for(let spoke=0;spoke<6;spoke++){const a=spoke*Math.PI/3;const blade=panel(body,[.04,.17,.025],[x+Math.cos(a)*.1,Math.sin(a)*.1,2.36],steel,.006);blade.rotation.z=a-Math.PI/2;}
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const blade=panel(body,[.045,.095,.35],[x+Math.cos(a)*.34,Math.sin(a)*.34,2.15],dark,.008);blade.rotation.z=a;}
    const fin=panel(body,[.095,.78,1.13],[x+side*.13,.62,1.45],paint);fin.rotation.z=side*-.25;
    panel(body,[.016,.34,.35],[x+side*.13+side*.064,.77,1.59],copper,.005);
    panel(body,[.07,.035,.52],[side*.70,.35,-.4],white,.006);
    panel(body,[.34,.08,.52],[side*.53,.32,1.51],dark);
    for(let j=0;j<6;j++)panel(body,[.39,.025,.035],[side*.53,.38,1.3+j*.077],steel,.005);
    for(const z of [-1.3,-.4,.5,1.6]){panel(body,[.51,.025,.68],[side*.36,.38,z],paint,.012);for(const dz of [-.25,.25])cylinder(body,.025,.028,[side*.49,.409,z+dz],dark).rotation.x=0;}
    panel(body,[.055,.055,.22],[side*1.68,.13,-.33],side===1?white:amber,.008);
    panel(body,[.2,.22,.6],[side*.5,-.38,1.15],dark);cylinder(body,.09,.43,[side*.67,-.23,1.65],steel);
  }
  panel(body,[.37,.045,1.54],[0,.41,.91],dark,.01);
  for(let j=0;j<9;j++)panel(body,[.3,.025,.045],[0,.44,.3+j*.14],steel,.005);
  panel(body,[.13,.15,.53],[0,.39,-2.48],dark,.009);cylinder(body,.042,.15,[0,.4,-2.79],glass);
  const decal=document.createElement('canvas');decal.width=512;decal.height=128;const ctx=decal.getContext('2d')!;ctx.fillStyle='#293539';ctx.fillRect(0,0,512,128);ctx.fillStyle='#d0d2c7';ctx.font='bold 58px monospace';ctx.fillText('LW—07',28,69);ctx.font='17px monospace';ctx.fillText('UTILITY / EXPLORATION',30,105);const tex=new T.CanvasTexture(decal);tex.colorSpace=T.SRGBColorSpace;
  const name=mesh(body,new T.PlaneGeometry(.86,.215),new T.MeshStandardMaterial({map:tex,roughness:.6,metalness:.3}),[0,.425,1.62]);name.rotation.x=-Math.PI/2;
  mergeStatic(body);
  const flame=new T.Group();root.add(flame);
  const exhaust=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,uniforms:{power:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float power;void main(){float core=pow(1.-abs(vUv.x-.5)*2.,2.);float tail=pow(1.-vUv.y,1.7);float shock=.76+.24*sin(vUv.y*48.);gl_FragColor=vec4(mix(vec3(.10,.43,.75),vec3(.62,.86,1.),core*tail),core*tail*shock*(.4+power*.4));}'});
  exhaust.userData.ownedResource=true;
  for(const side of [-1,1])for(const angle of [0,Math.PI/2]){const plane=mesh(flame,new T.PlaneGeometry(.65,2.6),exhaust,[side*1.23,0,3.65]);plane.rotation.x=Math.PI/2;plane.rotation.y=angle;}
  const engineLight=new T.PointLight('#81b9e0',0,7,2);engineLight.position.set(0,0,2.5);root.add(engineLight);
  return{root,flame,animate:(power:number,brake:boolean)=>{exhaust.uniforms.power.value=power;flame.visible=power>.03;flame.scale.z=.35+power*.95;engineLight.intensity=power*.65;white.emissiveIntensity=brake?1.2:1.6+power*1.4;}};
}
function hash(x:number,y:number,z:number){let n=Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,y:number,z:number){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);let result=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)result+=hash(ix+a,iy+b,iz+c)*(a?sx:1-sx)*(b?sy:1-sy)*(c?sz:1-sz);return result;}
const worlds=new Map<number,T.MeshStandardMaterial>();
const moonColor=new T.TextureLoader().load('/textures/lroc-color-2k.jpg');moonColor.colorSpace=T.SRGBColorSpace;moonColor.anisotropy=4;
const moonHeight=new T.TextureLoader().load('/textures/lola-height-1k.jpg');
function planetMaterial(seed:number){
  const key=seed%4;if(worlds.has(key))return worlds.get(key)!;
  if(key!==0){const material=new T.MeshStandardMaterial({map:moonColor,bumpMap:moonHeight,bumpScale:.21,color:['#ffffff','#c8c2b9','#aab9c2','#c3bab1'][key],roughness:.97,metalness:0,envMapIntensity:.06});worlds.set(key,material);return material;}
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d')!,im=ctx.createImageData(512,256);
  const relief=document.createElement('canvas');relief.width=512;relief.height=256;const rctx=relief.getContext('2d')!,rim=rctx.createImageData(512,256);
  const palettes=[[97,111,111],[129,117,101],[93,111,124],[135,126,112]];
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){
    const theta=x/512*Math.PI*2,phi=y/256*Math.PI,nx=Math.cos(theta)*Math.sin(phi),ny=Math.cos(phi),nz=Math.sin(theta)*Math.sin(phi);let f=0,amp=.56,scale=3;
    for(let o=0;o<5;o++){f+=noise(nx*scale+key*17,ny*scale+key*31,nz*scale+key*13)*amp;amp*=.5;scale*=2.08;}
    const ridge=Math.abs(noise(nx*20+key*11,ny*20,nz*20)-.5)*.14;
    const water=key===0&&f<.46,ice=Math.abs(ny)>.93+noise(nx*12,ny*12,nz*12)*.05;const value=water?.66:.67+(f-.3)*.48+ridge;
    const color=ice?[174,188,185]:water?[37,66,75]:palettes[key],at=(y*512+x)*4;
    for(let c=0;c<3;c++){im.data[at+c]=color[c]*value*1.1;rim.data[at+c]=(water?.35:f)*255;}im.data[at+3]=255;rim.data[at+3]=255;
  }
  ctx.putImageData(im,0,0);rctx.putImageData(rim,0,0);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;const bump=new T.CanvasTexture(relief);const material=new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.14,roughness:.92,metalness:0,envMapIntensity:.12});worlds.set(key,material);return material;
}
export function orbitalPlanet(slot:number){
  const root=new T.Group();const globe=mesh(root,new T.SphereGeometry(RADIUS,64,40),planetMaterial(slot));globe.rotation.y=slot*1.37;
  if(slot===0){
    // Coarse orbital representation of the same public city, bounded to one draw.
    const count=120,geometry=new T.BoxGeometry(1,1,1),material=new T.MeshStandardMaterial({color:'#54616c',metalness:.5,roughness:.65});material.userData.ownedResource=true;
    const city=new T.InstancedMesh(geometry,material,count),dummy=new T.Object3D();
    for(let i=0;i<count;i++){const a=i*2.399963,r=.25+Math.sqrt(i/count)*5.5,n=new T.Vector3(Math.cos(a)*r,10,Math.sin(a)*r-2).normalize(),h=.18+(Math.sin(i*72.15)*.5+.5)**2*1.5;dummy.position.copy(n).multiplyScalar(RADIUS+h/2);dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);dummy.scale.set(.15+(i%5)*.04,h,.22);dummy.updateMatrix();city.setMatrixAt(i,dummy.matrix);}root.add(city);
  }
  const atmosphere=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,uniforms:{tint:{value:new T.Color(slot%4===1?'#8e765b':'#548494')}},vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n;varying vec3 v;uniform vec3 tint;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),3.5);gl_FragColor=vec4(tint,rim*.2);}'});
  atmosphere.userData.ownedResource=true;mesh(root,new T.SphereGeometry(RADIUS*1.028,48,24),atmosphere);return root;
}
export function configureSpace(scene:T.Scene,renderer:T.WebGLRenderer){
  scene.background=new T.Color('#040810');scene.fog=new T.FogExp2('#080e18',.00013);
  const environment=new RoomEnvironment();const generator=new T.PMREMGenerator(renderer);scene.environment=generator.fromScene(environment,.08).texture;scene.environmentIntensity=.42;environment.dispose();generator.dispose();
  scene.add(new T.HemisphereLight('#7196b4','#070a0e',.5));
  const sun=new T.DirectionalLight('#eedcca',3.5);sun.position.set(-80,130,70);scene.add(sun);
  const rim=new T.DirectionalLight('#587a9b',1.3);rim.position.set(65,-20,-80);scene.add(rim);
  // Sparse geometry supplies scale and parallax; no particle wall or bloom veil.
  const positions:number[]=[],colors:number[]=[];let seed=103;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<950;i++){const p=new T.Vector3(random()-.5,random()-.5,random()-.5).normalize().multiplyScalar(900+random()*1300);positions.push(...p.toArray());const b=.32+random()*.58;colors.push(b,b*.94,b*.86);}
  const stars=new T.BufferGeometry();stars.setAttribute('position',new T.Float32BufferAttribute(positions,3));stars.setAttribute('color',new T.Float32BufferAttribute(colors,3));scene.add(new T.Points(stars,new T.PointsMaterial({vertexColors:true,size:1.7,sizeAttenuation:true,transparent:true,opacity:.8,depthWrite:false})));
  // A distant moon is scenery, deliberately far outside the reachable constellation.
  const moonMaterial=planetMaterial(3).clone();moonMaterial.fog=false;const moon=mesh(scene,new T.SphereGeometry(950,64,40),moonMaterial,[-4800,-4500,10500]);moon.rotation.z=.4;
  const ringCanvas=document.createElement('canvas');ringCanvas.width=512;ringCanvas.height=512;const rc=ringCanvas.getContext('2d')!,ri=rc.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const r=Math.hypot(x-256,y-256)/256,at=(y*512+x)*4;const bands=.64+.2*Math.sin(r*730)+.13*Math.sin(r*1790);ri.data[at]=142*bands;ri.data[at+1]=138*bands;ri.data[at+2]=126*bands;ri.data[at+3]=(r>.74&&r<1?(.12+bands*.6)*(r>.88&&r<.903?.08:1):0)*255;}rc.putImageData(ri,0,0);const ringMap=new T.CanvasTexture(ringCanvas);ringMap.colorSpace=T.SRGBColorSpace;
  const ring=mesh(scene,new T.RingGeometry(1250,1680,160,1),new T.MeshStandardMaterial({map:ringMap,roughness:1,metalness:0,transparent:true,opacity:.8,side:T.DoubleSide,fog:false,depthWrite:false}),[-4800,-4500,10500]);ring.rotation.set(1.12,.3,-.18);
}
