import * as T from 'three';
import {spaceDistance} from '../shared/flight.ts';
import type {Vec3} from '../shared/world.ts';
import type {FlightNetwork} from '../shared/flight-network.ts';
const starTexture=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d')!;const g=ctx.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#fff');g.addColorStop(.18,'#fffc');g.addColorStop(1,'#fff0');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);return new T.CanvasTexture(canvas);};
/** Nearby star bands only: no second world, unbounded particles or depth mask. */
export class RailArt {
 readonly root=new T.Group();private texture=starTexture();private lines=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#bce8e1',transparent:true,opacity:.5,depthWrite:false}));
 private stars=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:'#d9f4e5',size:3,sizeAttenuation:false,map:this.texture,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending}));
 private active=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#ffdc7e',transparent:true,opacity:.95,depthWrite:false}));
 private activeStars=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:'#ffe8a1',size:5,sizeAttenuation:false,map:this.texture,transparent:true,opacity:.95,depthWrite:false,blending:T.AdditiveBlending}));private stations=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:'#fff1bd',size:9,sizeAttenuation:false,map:this.texture,transparent:true,depthWrite:false}));private stamp='';
 constructor(){this.root.add(this.lines,this.stars,this.active,this.activeStars,this.stations);}
 update(network:FlightNetwork,position:Vec3,path:Vec3[]){
  path=path.slice(0,7);
  const edges=[...network.edges].sort((a,b)=>Math.min(spaceDistance(position,network.nodes.get(a.a)!.point),spaceDistance(position,network.nodes.get(a.b)!.point))-Math.min(spaceDistance(position,network.nodes.get(b.a)!.point),spaceDistance(position,network.nodes.get(b.b)!.point))).slice(0,16);
  const stamp=JSON.stringify([edges.map(e=>[e.a,e.b]),path]);if(stamp===this.stamp)return;this.stamp=stamp;
  const lines:number[]=[],stars:number[]=[],bright:number[]=[];
  const dots=(a:Vec3,b:Vec3,out:number[])=>{const count=Math.min(60,Math.ceil(spaceDistance(a,b)/5));for(let i=0;i<=count;i++)out.push(...a.map((v,j)=>v+(b[j]-v)*i/count));};
  for(const e of edges){const a=network.nodes.get(e.a)!.point,b=network.nodes.get(e.b)!.point;lines.push(...a,...b);dots(a,b,stars);}
  for(let i=1;i<path.length;i++)dots(path[i-1],path[i],bright);
  const set=(mesh:T.Line|T.LineSegments|T.Points,values:number[])=>{mesh.geometry.dispose();mesh.geometry=new T.BufferGeometry();mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(values,3));};
  set(this.lines,lines);set(this.stars,stars);set(this.active,path.flat());set(this.activeStars,bright);set(this.stations,[...new Set(edges.flatMap(e=>[e.a,e.b]))].flatMap(id=>network.nodes.get(id)!.point));
  this.root.userData.visibleEdges=edges.length;this.root.userData.particles=(stars.length+bright.length)/3;
 }
}
