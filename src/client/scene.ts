import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPCS, RADIUS, SPAWN, normalize } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import { box, ball, shape, beam, sign, roof, material } from './art.ts';
import { courier } from './character.ts';
import { surfaceHeight, surfacePoint } from './terrain.ts';
export { courier } from './character.ts';

export interface Obstacle {point:T.Vector3;radius:number;height:number}
const v=(p:Vec3)=>new T.Vector3(...normalize(p));
function anchor(parent:T.Object3D,p:Vec3|T.Vector3,yaw=0) {
  const n=Array.isArray(p)?v(p):p.clone().normalize();const group=new T.Group();
  group.position.copy(surfacePoint(n));group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);group.rotateY(yaw);parent.add(group);return group;
}
function tree(g:T.Group,scale:number,kind:number) {
  g.scale.setScalar(scale);
  shape(g,new T.CylinderGeometry(.095,.16,1.35,6),'#847054',[0,.67,0]);
  beam(g,new T.Vector3(0,.9,0),new T.Vector3(.42,1.65,.05),.06,'#847054');
  for(const [x,y,z,r] of [[0,1.9,0,.77],[-.38,1.55,.12,.51],[.44,1.7,.10,.55],[.08,2.35,0,.45]]){
    const m=ball(g,r,kind%3===0?'#9bad72':kind%3===1?'#729c7d':'#b8ad6d',[x,y,z],1);m.scale.y=.8;
  }
}
function planter(g:T.Object3D,x:number,z:number,flowers=false){
  shape(g,new T.CylinderGeometry(.19,.14,.3,7),'#b47758',[x,.15,z]);
  shape(g,new T.CylinderGeometry(.16,.16,.025,7),'#786549',[x,.31,z]);
  for(let i=0;i<3;i++) {
    const leaf=ball(g,.17,'#7d9966',[x+Math.sin(i*2)*.10,.49,z+Math.cos(i*2)*.1]);leaf.scale.set(.7,1.2,.7);
    if(flowers)ball(g,.075,'#e6bb62',[x+Math.sin(i*2)*.11,.67,z+Math.cos(i*2)*.1]);
  }
}
function bench(g:T.Object3D,x:number,z:number){
  for(const dx of [-.45,.45])box(g,[.075,.40,.50],'#52665d',[x+dx,.20,z]);
  for(let i=0;i<3;i++)box(g,[1.15,.075,.14],'#af8f64',[x,.45,z+(i-1)*.17],true);
  for(let i=0;i<2;i++)box(g,[1.15,.12,.07],'#af8f64',[x,.7+i*.15,z-.24],true);
}
function lamp(parent:T.Object3D,p:Vec3){
  const g=anchor(parent,p);shape(g,new T.CylinderGeometry(.045,.07,1.8,6),'#536a61',[0,.9,0]);
  box(g,[.34,.06,.34],'#50625d',[0,1.8,0]);box(g,[.23,.32,.23],'#f3d89a',[0,1.97,0],true);
  shape(g,new T.ConeGeometry(.29,.24,4),'#536a61',[0,2.25,0]).rotation.y=Math.PI/4;
}
function cottage(parent:T.Object3D,p:Vec3,color:string,yaw:number,width=1.8,label?:string) {
  const g=anchor(parent,p,yaw),h=1.75;
  box(g,[width+.13,.2,1.55],'#aeaa90',[0,.10,0],true);
  box(g,[width,h,1.4],color,[0,h/2+.12,0],true);
  roof(g,width+.35,1.75,.7,'#ba755c',h+.12);
  box(g,[.28,.67,.27],'#d6c3a0',[width*.25,h+.75,-.25],true);
  box(g,[.58,.99,.055],'#5d7772',[width*.17,.64,.729],true);
  box(g,[.065,.065,.02],'#e5bf73',[width*.17+.17,.64,.765]);
  box(g,[.72,.075,.38],'#e3d6b6',[width*.17,.15,.84],true);
  for(const x of [-width*.32,width*.32]){
    box(g,[.38,.43,.075],'#526c72',[x,1.29,.745],true);
    box(g,[.035,.45,.08],'#ebdbb9',[x,1.29,.79]);
    box(g,[.40,.035,.08],'#ebdbb9',[x,1.29,.79]);
    for(const side of [-1,1])box(g,[.09,.47,.065],'#7c9b8b',[x+side*.26,1.29,.765],true);
  }
  for(let i=0;i<3;i++)box(g,[.22,.055,.023],'#bdb29b',[-width*.40+i*.26,.31+(i%2)*.13,.716]);
  if(label){const s=sign(g,label,width*.82);s.position.set(0,1.8,.76);}
  planter(g,-width*.6,.68,true);
  return g;
}
function road(parent:T.Object3D,points:Vec3[],width:number,color:string){
  const curve=new T.CatmullRomCurve3(points.map(p=>v(p)),false,'catmullrom',.2);
  const centers=curve.getPoints(points.length*28).map(p=>p.normalize());
  const positions:number[]=[],indices:number[]=[];
  centers.forEach((p,i)=>{
    const tangent=centers[Math.min(i+1,centers.length-1)].clone().sub(centers[Math.max(0,i-1)]).normalize();
    const right=new T.Vector3().crossVectors(tangent,p).normalize();
    for(const side of [-1,1])positions.push(...surfacePoint(p.clone().addScaledVector(right,side*width/(2*RADIUS)).normalize(),.026).toArray());
    if(i<centers.length-1)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
  });
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  shape(parent,geo,color).castShadow=false;
  for(let side=0;side<2;side++){
    const pts=centers.filter((_,i)=>i%4===0).map((_,j)=>new T.Vector3().fromArray(positions,j*4*6+side*3));
    const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#e5d4b4',transparent:true,opacity:.75}));parent.add(line);
  }
  return centers;
}
// Merge repeated opaque scenery by material: rich detail without one draw call per leaf.
function bakeStatic(group:T.Group){
  group.updateMatrixWorld(true);
  const batches=new Map<T.Material,T.BufferGeometry[]>(),meshes:T.Mesh[]=[];
  const lineGeometry:T.BufferGeometry[]=[],lines:T.LineSegments[]=[];
  group.traverse(obj=>{
    if(obj instanceof T.Mesh&&!Array.isArray(obj.material)&&obj.material instanceof T.MeshToonMaterial){
      const geo=(obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry.clone()).applyMatrix4(obj.matrixWorld);
      geo.deleteAttribute('uv');
      if(!batches.has(obj.material))batches.set(obj.material,[]);
      batches.get(obj.material)!.push(geo);meshes.push(obj);
    }
    if(obj instanceof T.LineSegments){lineGeometry.push(obj.geometry.clone().applyMatrix4(obj.matrixWorld));lines.push(obj);}
  });
  for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
  for(const line of lines){line.removeFromParent();line.geometry.dispose();}
  for(const [mat,geos]of batches){
    const merged=mergeGeometries(geos);
    if(merged){const mesh=new T.Mesh(merged,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    geos.forEach(g=>g.dispose());
  }
  if(lineGeometry.length){
    const merged=mergeGeometries(lineGeometry);
    if(merged)group.add(new T.LineSegments(merged,new T.LineBasicMaterial({color:'#3e514c',transparent:true,opacity:.45})));
    lineGeometry.forEach(g=>g.dispose());
  }
}
export function createWorld(scene:T.Scene) {
  const terrainGeo=new T.IcosahedronGeometry(RADIUS,5);const attr=terrainGeo.attributes.position;const colors:number[]=[];
  for(let i=0;i<attr.count;i+=3){
    const center=new T.Vector3();for(let j=0;j<3;j++){const p=new T.Vector3().fromBufferAttribute(attr,i+j).normalize();center.add(p);attr.setXYZ(i+j,...surfacePoint(p).toArray() as Vec3);}center.normalize();
    const noise=Math.sin(center.x*22+center.z*9)*Math.cos(center.y*15-center.z*13);
    const color=new T.Color(noise>.45?'#a2b68a':noise<-.35?'#91aa7d':'#99b084');for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b);
  }
  terrainGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();
  const terrainMat=material('#ffffff').clone();terrainMat.vertexColors=true;
  const globe=new T.Mesh(terrainGeo,terrainMat);globe.receiveShadow=true;scene.add(globe);
  const scenery=new T.Group();scene.add(scenery);const blocks:Obstacle[]=[];
  const addBlock=(g:T.Group,radius:number,height:number)=>blocks.push({point:g.position.clone().normalize(),radius,height});
  const mainRoute=road(scenery,[SPAWN,normalize([.15,1,.07]),NPCS.mica.position,normalize([.01,1,-.36]),NPCS.sol.position],1.06,'#c8b598');
  const loop=road(scenery,[SPAWN,normalize([-.22,1,.22]),normalize([-.45,1,-.08]),NPCS.sol.position],.76,'#cfbd9e');
  road(scenery,[NPCS.mica.position,normalize([.53,.85,-.25]),normalize([.66,.5,-.20])],.68,'#ccb999');
  // Postal corner: prominent sign, striped awning, parcels and a red collection box.
  const post=cottage(scenery,[.48,1,-.31],'#ead9ae',-.20,2.15,'LITTLE POST');addBlock(post,1.16,2.8);
  for(let i=0;i<6;i++){const awning=box(post,[.30,.055,.57],i%2?'#e9d7b0':'#b7694b',[-.75+i*.30,1.40,1.0]);awning.rotation.x=.17;}
  for(const x of [-.91,.91])shape(post,new T.CylinderGeometry(.025,.025,1.40,5),'#71674f',[x,.70,1.22]);
  for(let i=0;i<3;i++){box(post,[.32,.28,.3],'#b7986c',[-1.28,.14+i*.26,.30],true);box(post,[.055,.282,.305],'#e7d5a7',[-1.28,.14+i*.26,.30]);}
  const mailbox=anchor(scenery,[.52,1,-.11]);shape(mailbox,new T.CylinderGeometry(.035,.05,.55,7),'#5d6454',[0,.3,0]);
  box(mailbox,[.40,.57,.32],'#ad614a',[0,.78,0],true);box(mailbox,[.27,.047,.02],'#394e48',[0,.91,.17]);
  sign(mailbox,'POST',.3,'#eee2ba','#ad614a').position.set(0,.70,.18);
  // Housing frames the approach, leaving the established task corridor and pole clear.
  const home=cottage(scenery,[-.31,1,.24],'#d5ba87',.65,1.75);addBlock(home,1.02,2.7);
  const store=cottage(scenery,[.48,1,.18],'#acc5b7',-.58,1.65,'SEEDS');addBlock(store,.94,2.7);
  const sideHome=cottage(scenery,[-.52,1,-.04],'#cba887',.6,1.65);addBlock(sideHome,.96,2.7);
  bench(sideHome,0,1.1);
  // Greenhouse courtyard: glazed frame, work bench, beds and a little wind vane.
  const glass=anchor(scenery,[-.59,.85,-.65],.25);addBlock(glass,1.1,2.55);
  box(glass,[2.2,.2,1.65],'#b5ae90',[0,.10,0],true);
  box(glass,[2,1.4,1.4],'#8eb8ae',[0,.9,0],true);roof(glass,2.08,1.53,.65,'#b6d1be',1.6);
  for(const x of [-1,-.5,0,.5,1])box(glass,[.052,1.4,1.47],'#eee0ba',[x,.9,0]);
  for(const y of [.25,.85,1.57])box(glass,[2.08,.046,1.47],'#eee0ba',[0,y,0]);
  box(glass,[.49,.95,.07],'#668c7d',[.49,.68,.77],true);sign(glass,'SOL’S GLASSHOUSE',1.5).position.set(0,1.69,.80);
  for(let i=0;i<5;i++)planter(glass,-1.12+i*.48,1.12,i%2===0);
  const flowers=anchor(scene,[-.50,.85,-.41]);flowers.visible=false;
  for(let i=0;i<7;i++){const x=(i%4-1.5)*.25,z=Math.floor(i/4)*.26;shape(flowers,new T.CylinderGeometry(.018,.018,.40,4),'#60866a',[x,.21,z]);ball(flowers,.12,i%2?'#dfb653':'#e4c479',[x,.46,z],1);}
  const garden=anchor(scenery,[-.35,.86,-.71],-.45);
  for(let i=0;i<2;i++){box(garden,[.47,.07,1.30],'#8c795a',[-.32+i*.64,.075,0],true);for(let j=0;j<4;j++)ball(garden,.12,'#67916c',[-.32+i*.64,.2,-.45+j*.30]);}
  // An actual curved pond surface; the surrounding wooden walk can be explored.
  const pondNormal=v([.74,.72,.14]),pondGroup=anchor(scenery,pondNormal);
  const pondGeo=new T.CircleGeometry(1.48,44);const pa=pondGeo.attributes.position;
  const rot=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),pondNormal);
  for(let i=0;i<pa.count;i++){
    const p=new T.Vector3().fromBufferAttribute(pa,i);p.y*=.73;p.applyQuaternion(rot).addScaledVector(pondNormal,RADIUS).normalize();pa.setXYZ(i,...surfacePoint(p,.05).toArray() as Vec3);
  }pondGeo.computeVertexNormals();
  const water=new T.Mesh(pondGeo,new T.MeshToonMaterial({color:'#6ba8a5'}));water.receiveShadow=true;scenery.add(water);
  for(let i=0;i<5;i++){const r=shape(pondGroup,new T.TorusGeometry(.18+i*.15,.009,3,32),'#b2d7c3',[(i%2)*.28,.09,0]);r.rotation.x=-Math.PI/2;r.scale.z=.7;r.castShadow=false;}
  // Plank crossing and railing hug the sphere rather than floating as one flat slab.
  for(let i=0;i<12;i++){
    const a=anchor(scenery,pondNormal.clone().add(new T.Vector3(-.08+i*.015,0,.09)).normalize());
    box(a,[.16,.065,.60],'#b29973',[0,.16,0],true);
    if(i%3===0)for(const z of [-.33,.33])box(a,[.055,.48,.055],'#80785d',[0,.37,z]);
  }
  // Original windmill landmark on the far hill.
  const mill=anchor(scenery,[-.10,.69,-.85]);addBlock(mill,.8,3.3);
  shape(mill,new T.CylinderGeometry(.46,.75,2.3,9),'#e4d4ae',[0,1.15,0]);roof(mill,1.5,1.4,.7,'#9c7261',2.27);
  const rotor=new T.Group();rotor.position.set(0,2.19,.7);mill.add(rotor);
  for(let i=0;i<4;i++){const sail=new T.Group();sail.rotation.z=i*Math.PI/2;rotor.add(sail);box(sail,[.07,1.45,.06],'#657060',[0,.66,0]);box(sail,[.30,.88,.03],'#e5daba',[.13,.80,.03],true);}
  ball(rotor,.14,'#73785f',[0,0,.07],1);
  // Lived-in details along the main trail.
  lamp(scenery,[.18,1,.19]);lamp(scenery,[.24,1,-.36]);lamp(scenery,[-.25,1,-.50]);
  const signs=anchor(scenery,[.10,1,-.20]);box(signs,[.06,.9,.06],'#847657',[0,.45,0]);
  const plank=sign(signs,'← GLASSHOUSE',.95);plank.position.set(0,.78,.035);
  const picnic=anchor(scenery,[-.15,1,.53],.5);bench(picnic,0,0);planter(picnic,.8,0,true);
  // A few distant cottages and orchards make walking around the globe rewarding.
  for(const [p,c,yaw] of [ [[.9,.1,.1],'#d3bf8f',.2], [[-.8,.2,.4],'#b9c6ac',-.3], [[.1,-.7,.6],'#d2b290',0] ] as [Vec3,string,number][]){const h=cottage(scenery,p,c,yaw,1.65);addBlock(h,.94,2.7);}
  const route=[...mainRoute,...loop];
  const clearance=(p:T.Vector3)=>Math.min(...route.map(n=>n.angleTo(p)*RADIUS));
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<230;i++){
    const y=1-(i+.5)/230*2,r=Math.sqrt(1-y*y),p=new T.Vector3(Math.cos(i*golden)*r,y,Math.sin(i*golden)*r);
    if(clearance(p)<1.13||blocks.some(b=>p.angleTo(b.point)*RADIUS<b.radius+1.0)||p.angleTo(pondNormal)*RADIUS<2.3||p.angleTo(v(SPAWN))*RADIUS<.9)continue;
    const g=anchor(scenery,p);
    if(i%4<2){tree(g,.65+(i%5)*.11,i);blocks.push({point:p,radius:.21,height:2.4});}
    else if(i%4===2){ball(g,.22+(i%3)*.06,'#afb599',[0,.13,0]).scale.y=.65;}
    else for(let j=0;j<4;j++){const blade=shape(g,new T.ConeGeometry(.045,.22,3),'#749769',[(j-1.5)*.12,.12,Math.sin(j)*.08]);blade.rotation.z=(j-1.5)*.2;}
  }
  const npcs=(Object.keys(NPCS)as(keyof typeof NPCS)[]).map(id=>{
    const a=anchor(scene,NPCS[id].position),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=id==='mica'?Math.PI*.82:Math.PI*.3;
    const ring=shape(a,new T.TorusGeometry(.48,.025,5,32),'#e7d6a7',[0,.035,0]);ring.rotation.x=Math.PI/2;
    const beacon=shape(a,new T.OctahedronGeometry(.10,0),'#f4d181',[0,2.0,0]);return{id,anchor:a,avatar,beacon};
  });
  // Rotor stays dynamic; all other scenery can be batched.
  mill.remove(rotor);scene.attach(rotor);rotor.position.copy(mill.localToWorld(new T.Vector3(0,2.19,.7)));rotor.quaternion.copy(mill.quaternion);
  const rotorRest=rotor.quaternion.clone(),rotorSpin=new T.Quaternion(),rotorAxis=new T.Vector3(0,0,1);
  bakeStatic(scenery);
  const birds=new T.Group();scene.add(birds);
  for(let i=0;i<4;i++){
    const g=new T.Group();birds.add(g);for(const side of [-1,1]){const wing=shape(g,new T.ConeGeometry(.055,.28,3),'#f0e6c9',[side*.10,0,0]);wing.rotation.z=side*1.2;}
  }
  return{globe,npcs,blocks,flowers,scenery,
    animate(t:number,reduced:boolean){rotor.quaternion.copy(rotorRest).multiply(rotorSpin.setFromAxisAngle(rotorAxis,reduced?0:t*.15));birds.children.forEach((b,i)=>{const angle=t*.08+i*1.57;b.position.set(Math.sin(angle)*14,12+Math.sin(angle*2+i)*1.4,Math.cos(angle)*14);b.rotation.z=Math.sin(t*5+i)*.08;});birds.visible=!reduced;},
    height:surfaceHeight,
  };
}
