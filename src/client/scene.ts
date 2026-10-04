import * as T from 'three';
import { NPCS, RADIUS, normalize } from '../shared/world.ts';
import type { Character, Vec3 } from '../shared/world.ts';

const materials = new Map<string, T.MeshStandardMaterial>();
function mat(color: string) {
  if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  return materials.get(color)!;
}
function mesh(parent: T.Object3D, geometry: T.BufferGeometry, color: string, pos: number[] = [0, 0, 0]) {
  const m = new T.Mesh(geometry, mat(color)); m.position.fromArray(pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent: T.Object3D, size: number[], color: string, pos: number[]) { return mesh(parent, new T.BoxGeometry(...size as [number, number, number]), color, pos); }
function anchored(scene: T.Scene, point: Vec3) {
  const group = new T.Group(); group.position.fromArray(point).multiplyScalar(RADIUS);
  group.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...point)); scene.add(group); return group;
}
export const PALETTES = { clay: '#d76c42', fern: '#537a62', sky: '#6687a0' };
export function courier(color: Character | 'mica' | 'sol') {
  const root = new T.Group();
  const rig = new T.Group(); root.add(rig);
  const coat = color === 'mica' ? '#bf7550' : color === 'sol' ? '#cfad56' : PALETTES[color];
  const body = mesh(rig, new T.CylinderGeometry(.2, .25, .42, 7), coat, [0, .52, 0]);
  const head = mesh(rig, new T.IcosahedronGeometry(.225, 1), '#eed8ae', [0, .94, .015]);
  const hat = mesh(rig, new T.CylinderGeometry(.235, .26, .13, 9), coat, [0, 1.12, 0]);
  const brim = box(rig, [.32,.035,.22], coat, [0,1.07,.16]);
  box(rig, [.24,.26,.14], '#815a41', [0,.6,-.23]);
  for (const x of [-.08,.08]) mesh(rig, new T.SphereGeometry(.025, 6, 4), '#323f38', [x,.965,.22]);
  const legs = [-.13,.13].map(x => box(rig, [.115,.3,.17], '#364b43', [x,.17,.02]));
  const arms = [-.29,.29].map(x => box(rig, [.12,.32,.13], coat, [x,.54,0]));
  const parcel = box(rig, [.4,.28,.27], '#e8b76a', [0,.55,.31]);
  box(parcel, [.055,.285,.275], '#f3e3b6', [0,0,0]);
  parcel.visible = false;
  const shadow = new T.Mesh(new T.CircleGeometry(.34, 20), new T.MeshBasicMaterial({ color:'#435b40', transparent:true,opacity:.16,depthWrite:false }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y=.02; root.add(shadow);
  return {root, parcel, setColor(c: Character) { body.material = mat(PALETTES[c]); hat.material=mat(PALETTES[c]); brim.material=mat(PALETTES[c]); arms.forEach(a=> a.material=mat(PALETTES[c])); },
    animate(t: number, speed: number, reduced: boolean) {
      const stride = reduced ? 0 : Math.min(1,speed/2.5);
      rig.position.y = Math.abs(Math.sin(t*10))*.045*stride;
      legs.forEach((leg,i)=> { leg.rotation.x=Math.sin(t*10+i*Math.PI)*.6*stride; });
      arms.forEach((arm,i)=> { arm.rotation.x=Math.sin(t*10+i*Math.PI)*-.45*stride; });
      head.rotation.z = reduced ? 0 : Math.sin(t*1.5)*.025;
    }
  };
}
function tree(group:T.Group, scale:number, variant:number) {
  group.scale.setScalar(scale);
  mesh(group,new T.CylinderGeometry(.10,.14,.9,5),'#88775a',[0,.4,0]);
  if (variant%2) {
    mesh(group,new T.ConeGeometry(.62,1.45,7),'#708568',[0,1.35,0]);
    mesh(group,new T.ConeGeometry(.46,1.15,7),'#8b9b75',[0,1.9,0]);
  } else {
    mesh(group,new T.IcosahedronGeometry(.7,0),'#a0aa76',[0,1.45,0]);
    mesh(group,new T.IcosahedronGeometry(.46,0),'#82916b',[.35,1.13,0]);
  }
}
export function createWorld(scene:T.Scene) {
  const geometry = new T.IcosahedronGeometry(RADIUS, 5);
  const positions = geometry.attributes.position;
  const colors:number[]=[];
  for(let i=0;i<positions.count;i+=3) {
    const shade = new T.Color(['#c1cba0','#c6cda5','#bcc89c','#c2c99e','#c9cfa7'][Math.floor((Math.sin(i*17.1)+1)*2.49)]);
    for(let j=0;j<3;j++) colors.push(shade.r,shade.g,shade.b);
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const globe = new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));
  globe.receiveShadow = true; scene.add(globe);
  const mica = new T.Vector3(...NPCS.mica.position), sol = new T.Vector3(...NPCS.sol.position);
  const blocks: {point:T.Vector3;radius:number}[]=[];
  const post = anchored(scene,normalize([.47,1,-.30]));
  box(post,[1.2,.95,.85],'#efe4c8',[0,.47,0]);
  const roof=mesh(post,new T.ConeGeometry(1, .65,4),'#bd6546',[0,1.28,0]); roof.rotation.y=Math.PI/4;
  box(post,[.32,.56,.03],'#6d775e',[0,.30,.445]);
  box(post,[.26,.26,.03],'#92a4a0',[-.38,.63,.445]);
  box(post,[.26,.26,.03],'#92a4a0',[.38,.63,.445]);
  blocks.push({point:post.position.clone().normalize(),radius:.95});
  const mail = anchored(scene,normalize([.48,1,-.10]));
  box(mail,[.09,.65,.09],'#796450',[0,.3,0]);
  box(mail,[.42,.35,.30],'#b45b3c',[0,.70,0]);
  box(mail,[.25,.035,.01],'#f7eac8',[0,.76,.16]);
  const house=anchored(scene,normalize([-.55,.85,-.61]));
  box(house,[1.5,.18,1.05],'#e8dec1',[0,.09,0]);
  box(house,[1.25,.8,.82],'#a4bcaf',[0,.55,0]);
  const glassRoof=mesh(house,new T.ConeGeometry(1.04,.65,4),'#d9e3c7',[0,1.2,0]);glassRoof.rotation.y=Math.PI/4;
  for (const x of [-.64,0,.64]) box(house,[.045,.9,.86],'#f1e7cf',[x,.57,0]);
  box(house,[1.35,.04,.88],'#f1e7cf',[0,.5,0]);
  blocks.push({point:house.position.clone().normalize(),radius:1});
  for (let i=0;i<4;i++) {
    const pot=anchored(scene,normalize([-.57+i*.07,.8,-.42]));
    mesh(pot,new T.CylinderGeometry(.13,.09,.2,6),'#b87856',[0,.12,0]);
    mesh(pot,new T.IcosahedronGeometry(.2,0),'#708c60',[0,.4,0]);
  }
  const points=[new T.Vector3(0,1,.27).normalize(),mica,sol];
  for(let leg=0;leg<2;leg++) {
    const a=points[leg], b=points[leg+1];
    const steps=Math.floor(a.angleTo(b)*RADIUS/.48);
    for(let i=0;i<=steps;i++) {
      const p=a.clone().lerp(b,i/steps).normalize();
      const stone=anchored(scene,p.toArray() as Vec3);
      const s=mesh(stone,new T.CylinderGeometry(.17,.2,.035,6),'#ece1bb',[0,.025,0]);s.scale.z=.75;s.rotation.y=i*2.1;
    }
  }
  const flowers=anchored(scene,normalize([-.5,.87,-.44]));
  flowers.visible=false;
  for(let i=0;i<5;i++) {
    const x=(i%3-1)*.26,z=Math.floor(i/3)*.24;
    mesh(flowers,new T.CylinderGeometry(.025,.025,.4,4),'#789263',[x,.2,z]);
    mesh(flowers,new T.IcosahedronGeometry(.13,0),'#ddab4b',[x,.46,z]);
  }
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<170;i++) {
    const y=1-(i+.5)/170*2, r=Math.sqrt(1-y*y);
    const p=new T.Vector3(Math.cos(i*golden)*r,y,Math.sin(i*golden)*r);
    // Keep the short task route clear; distant scenery stays decorative.
    const routeDistance = Math.min(...Array.from({length:21},(_,j)=> mica.clone().lerp(sol,j/20).normalize().angleTo(p)*RADIUS));
    if(routeDistance<1.6 || p.angleTo(points[0])*RADIUS<2 || blocks.some(b=>p.angleTo(b.point)*RADIUS<2.4)) continue;
    const group=anchored(scene,p.toArray() as Vec3);
    if(i%3===0) {
      tree(group,.7+(i%7)/15,i); blocks.push({point:p,radius:.35});
    } else if(i%3===1) {
      const stone=mesh(group,new T.DodecahedronGeometry(.24+(i%4)*.045,0),'#b5b7a0',[0,.14,0]);stone.scale.y=.65;
    } else {
      for(let j=0;j<3;j++) mesh(group,new T.ConeGeometry(.065,.28,3),'#8a9a6c',[(j-1)*.12,.12,Math.sin(j)*.08]);
    }
  }
  const npcs = (Object.keys(NPCS) as (keyof typeof NPCS)[]).map(id=> {
    const anchor=anchored(scene,NPCS[id].position);
    const avatar=courier(id);anchor.add(avatar.root);avatar.root.rotation.y=id==='mica'?Math.PI*.85:Math.PI*.55;
    const ring=mesh(anchor,new T.TorusGeometry(.56,.028,5,32),id==='mica'?'#bd6546':'#668277',[0,.045,0]);ring.rotation.x=Math.PI/2;
    const beacon=mesh(anchor,new T.OctahedronGeometry(.13,0),'#f5e9be',[0,1.7,0]);
    return {id,anchor,avatar,beacon};
  });
  return {globe,npcs,blocks,flowers};
}
