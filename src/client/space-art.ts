import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RADIUS } from '../shared/world.ts';

// Orbital lunar maps: NASA SVS; see ASSET-CREDITS.md.
function mesh(p:T.Object3D,g:T.BufferGeometry,m:T.Material,pos:[number,number,number]=[0,0,0]){const a=new T.Mesh(g,m);a.position.fromArray(pos);p.add(a);return a;}
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
