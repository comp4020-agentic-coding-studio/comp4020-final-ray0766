import * as T from 'three';
import {applyArtMaterial} from './art-profile.ts';
import {terrainModel} from './terrain-model.ts';
import type {PlacedObject} from '../shared/planets.ts';
import type {BlueprintContents} from '../shared/blueprints.ts';
import type {HomeSurfaceRoute} from '../shared/home-layout.ts';
import { HUB_RADIUS } from '../shared/world-size.ts';
import { RADIUS,normalize } from '../shared/world.ts';
import type { Vec3,NpcId } from '../shared/world.ts';
import { portPoint } from '../shared/ports.ts';
import { courier } from './character.ts';
import { surfaceHeight,surfacePoint,setGroundWorld,useTerrain } from './terrain.ts';
import { makeShip } from './ship-model.ts';
import { createHarbour } from './harbour.ts';
import { harbourMaterials } from './harbour-materials.ts';
import type {createPublicTownArt} from './public-town-art.ts';
import {isSamplePublicRadius,samplePublicVillage} from '../shared/sample-public-village.ts';
export { courier } from './character.ts';
export interface Obstacle {point:T.Vector3;radius:number;height:number}
export function createWorld(scene:T.Scene,populated=true,environment:string|null=null,objects:PlacedObject[]=[],blueprints:BlueprintContents={},radius=populated?HUB_RADIUS:RADIUS,surfaceRoutes:readonly HomeSurfaceRoute[]=[],preparedTown?:ReturnType<typeof createPublicTownArt>,preparedTerrain?:ReturnType<typeof terrainModel>){
  const publicVillage=populated&&isSamplePublicRadius(radius)?samplePublicVillage(radius):null;
  setGroundWorld(populated,publicVillage?.environment??environment,radius);
  if(populated){if(publicVillage)useTerrain(publicVillage);return createHarbour(scene,publicVillage,preparedTown,preparedTerrain);}
  useTerrain({environment,objects,blueprints,radius});
  const terrain=environment?(preparedTerrain??terrainModel(environment,objects,blueprints,'medium',true,radius,surfaceRoutes)):null;let globe:T.Mesh;
  if(terrain){globe=terrain.ground;scene.add(terrain.object);}else{
  const geo=new T.IcosahedronGeometry(RADIUS,5),a=geo.attributes.position,colors:number[]=[];
  for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).normalize();a.setXYZ(i,...surfacePoint(p).toArray() as Vec3);const shade=.9+.08*Math.sin(p.x*18+p.z*9)*Math.cos(p.z*13);const color=new T.Color('#93a571').multiplyScalar(shade);colors.push(color.r,color.g,color.b);}
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const ground=applyArtMaterial(new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0}));ground.userData.ownedResource=true;
  globe=new T.Mesh(geo,ground);globe.receiveShadow=true;scene.add(globe);}
  const scenery=new T.Group();scene.add(scenery);const blocks:Obstacle[]=[];
  const dock=new T.Group(),n=new T.Vector3(...normalize(portPoint('garden')));dock.position.copy(surfacePoint(n));dock.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);scene.add(dock);
  const {dark,concrete,pale,copper,cyan:glow}=harbourMaterials();
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);dock.add(o);return o;};
  const marker=new T.Mesh(new T.TorusGeometry(.7,.025,6,64),pale);marker.position.y=.07;marker.rotation.x=Math.PI/2;dock.add(marker);
  // A low boarding marker stays legible at street level without a light column
  // running through the neighbouring facade or the walking camera.
  box(.28,.22,.28,-.63,.11,0,concrete);box(.22,.60,.22,-.63,.50,0,dark);box(.28,.08,.28,-.63,.78,0,copper);box(.23,.23,.02,-.63,.57,.15,glow);
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle='#f3ecdb';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#c26b4b';ctx.fillRect(28,28,8,200);ctx.fillStyle='#2f4a43';ctx.font='600 86px system-ui';ctx.textAlign='center';ctx.fillText('RETURN / GATE',512,158);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
  const label=new T.Mesh(new T.PlaneGeometry(1.05,.2625),applyArtMaterial(new T.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:'#ffffff',emissiveIntensity:.18,roughness:.88})));label.position.set(-.2,1.22,.12);dock.add(label);
  const parked=makeShip();dock.add(parked.root);parked.root.position.set(radius>20?3.1:0,3.4,radius>20?3.2:-2.2);parked.animate(0,false);
  const flowers=new T.Group();scene.add(flowers);const npcs:{id:NpcId;anchor:T.Group;avatar:ReturnType<typeof courier>;beacon:T.Mesh}[]=[];
  return{globe,scenery,blocks,flowers,npcs,dock,parked,setSunDirection(dir:Vec3){terrain?.setSunDirection(dir);},dispose(){terrain?.dispose();},animate(t:number,reduced:boolean,_eye?:T.Vector3,_up?:T.Vector3,overview=false){void _eye;void _up;void overview;terrain?.tick(t);parked.root.position.y=3.4+(reduced?0:Math.sin(t*.7)*.03);},height:surfaceHeight};
}
