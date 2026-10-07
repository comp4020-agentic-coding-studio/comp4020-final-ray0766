import {SPRINT_SPEED} from '../shared/world.ts';
import * as T from 'three';
import { courier,PALETTES } from './character.ts';
import { surfacePoint,surfaceOrientation,groundRadius } from './terrain.ts';
import { disposeGeometry } from './build-art.ts';
import type { PresenceSnapshot,Visitor } from '../shared/presence.ts';
import { MAX_NEIGHBOURS,PRESENCE_TTL,PRESENCE_INTERVAL } from '../shared/presence.ts';
import { COURIER_LOOK } from './presentation-materials.ts';
import { applyCel } from '../assets/claude-geometry/style/cel.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';
interface Remote {visitor:Visitor;root:T.Group;low:T.Group;body:T.MeshStandardMaterial;avatar:ReturnType<typeof courier>|null;position:T.Vector3;from:T.Vector3;facing:T.Vector3;at:number;speed:number;radius:number;fromRadius:number}
export interface PresenceTicket {readonly epoch:number;readonly request:number;readonly planetId:string}
export class GroundPresence {
  private people=new Map<string,Remote>();private planet='';private receivedAt=0;
  private epoch=0;private requested=0;private accepted=0;
  constructor(private scene:T.Scene,private canvas:HTMLCanvasElement){}
  ticket(planetId:string):PresenceTicket{return {epoch:this.epoch,request:++this.requested,planetId};}
  clear(){
    this.epoch++;this.planet='';this.receivedAt=0;
    for(const r of this.people.values())disposeGeometry(r.root);this.people.clear();
    for(const key of ['visitors','nearbyVisitors','visibleVisitors','detailedVisitors'])this.canvas.dataset[key]='0';
    delete this.canvas.dataset.presencePlanet;delete this.canvas.dataset.visitorRadii;
    document.getElementById('presence-summary')!.textContent='No other visitors nearby.';
  }
  receive(snapshot:PresenceSnapshot,now=performance.now(),ticket=this.ticket(snapshot.planetId)){
    if(ticket.epoch!==this.epoch||ticket.request<=this.accepted||ticket.planetId!==snapshot.planetId)return false;
    this.accepted=ticket.request;
    if(snapshot.planetId!==this.planet){this.clear();this.planet=snapshot.planetId;}
    this.receivedAt=now;const ids=new Set(snapshot.visitors.map(v=>v.id));
    for(const[id,r]of this.people)if(!ids.has(id)){disposeGeometry(r.root);this.people.delete(id);}
    for(const visitor of snapshot.visitors.slice(0,MAX_NEIGHBOURS)){
      let r=this.people.get(visitor.id);
      if(!r){
        const root=new T.Group(),low=new T.Group();root.add(low);this.scene.add(root);
        const body=applyCel(new T.MeshStandardMaterial({color:PALETTES[visitor.character],...COURIER_LOOK.surface}),VILLAGE.cel!);body.userData.ownedResource=true;
        const torso=new T.Mesh(new T.CapsuleGeometry(.19,.64,3,6),body);torso.position.y=.74;low.add(torso);
        const helmet=new T.Mesh(new T.IcosahedronGeometry(.24,1),new T.MeshBasicMaterial({color:'#f3ecdb'}));helmet.position.y=1.39;low.add(helmet);
        const peak=new T.Mesh(new T.BoxGeometry(.29,.035,.16),new T.MeshBasicMaterial({color:'#7d5b43'}));peak.position.set(0,1.43,.18);low.add(peak);
        const ring=new T.Mesh(new T.RingGeometry(.28,.32,20),new T.MeshBasicMaterial({color:'#326e68',transparent:true,opacity:.65,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;root.add(ring);
        r={visitor,root,low,body,avatar:null,position:new T.Vector3(...visitor.position),from:new T.Vector3(...visitor.position),facing:new T.Vector3(...visitor.facing),at:now,speed:0,radius:visitor.radius??groundRadius(),fromRadius:visitor.radius??groundRadius()};this.people.set(visitor.id,r);
      }
      const target=new T.Vector3(...visitor.position);r.speed=Math.min(SPRINT_SPEED,r.position.angleTo(target)*groundRadius()/Math.max(.1,(now-r.at)/1000));r.from.copy(r.position);r.fromRadius=r.radius;r.visitor=visitor;r.at=now;r.body.color.set(PALETTES[visitor.character]);r.avatar?.setColor(visitor.character);
    }
    this.canvas.dataset.visitors=String(this.people.size);this.canvas.dataset.nearbyVisitors=String(snapshot.nearbyCount);this.canvas.dataset.presencePlanet=snapshot.planetId;document.getElementById('presence-summary')!.textContent=snapshot.nearbyCount?`${snapshot.nearbyCount} other visitor${snapshot.nearbyCount===1?'':'s'} on this world · teal foot rings`:'No other visitors nearby.';
    return true;
  }
  frame(now:number,dt:number,self:T.Vector3,reduced:boolean){
    if(now-this.receivedAt>PRESENCE_TTL){if(this.people.size)this.clear();return;}
    const ordered=[...this.people.values()].sort((a,b)=>self.angleTo(a.position)-self.angleTo(b.position));let detailed=0,visible=0;
    for(const r of ordered){
      const t=Math.min(1,(now-r.at)/PRESENCE_INTERVAL),target=new T.Vector3(...r.visitor.position);r.position.copy(r.from).lerp(target,reduced?1:t).normalize();
      const near=self.angleTo(r.position)*groundRadius(),detail=near<6&&detailed<4;r.root.visible=near<21;if(r.root.visible)visible++;
      if(detail){detailed++;if(!r.avatar){r.avatar=courier(r.visitor.character);r.avatar.root.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=false;});r.root.add(r.avatar.root);}}
      else if(r.avatar){disposeGeometry(r.avatar.root);r.avatar=null;}
      r.low.visible=!detail;r.avatar?.animate(now/1000,t<1?r.speed:0,reduced,0,r.visitor.grounded??true);
      r.radius=reduced?(r.visitor.radius??groundRadius()):T.MathUtils.lerp(r.fromRadius,r.visitor.radius??groundRadius(),t);
      r.facing.lerp(new T.Vector3(...r.visitor.facing),reduced?1:1-Math.exp(-8*dt)).projectOnPlane(r.position);
      if(r.facing.lengthSq()<.01)r.facing.set(0,0,1).projectOnPlane(r.position);r.facing.normalize();
      r.root.quaternion.copy(surfaceOrientation(r.position,r.facing));r.root.position.copy(r.visitor.radius===undefined?surfacePoint(r.position,.02):r.position.clone().multiplyScalar(r.radius+.02));
    }
    this.canvas.dataset.visitorRadii=JSON.stringify(ordered.filter(r=>r.root.visible).map(r=>r.root.position.length()-.02));
    this.canvas.dataset.visibleVisitors=String(visible);this.canvas.dataset.detailedVisitors=String(detailed);
  }
}
