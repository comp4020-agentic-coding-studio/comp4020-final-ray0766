import * as T from 'three';
import { courier,PALETTES } from './character.ts';
import { surfacePoint,surfaceScale,surfaceOrientation } from './terrain.ts';
import { disposeGeometry } from './build-art.ts';
import type { PresenceSnapshot,Visitor } from '../shared/presence.ts';
import { MAX_NEIGHBOURS,PRESENCE_TTL } from '../shared/presence.ts';
import { RADIUS } from '../shared/world.ts';
interface Remote {visitor:Visitor;root:T.Group;low:T.Group;body:T.MeshStandardMaterial;avatar:ReturnType<typeof courier>|null;position:T.Vector3;from:T.Vector3;facing:T.Vector3;at:number;speed:number}
export class GroundPresence {
  private people=new Map<string,Remote>();private planet='';private receivedAt=0;
  constructor(private scene:T.Scene,private canvas:HTMLCanvasElement){}
  clear(){for(const r of this.people.values())disposeGeometry(r.root);this.people.clear();this.canvas.dataset.visitors='0';this.canvas.dataset.nearbyVisitors='0';document.getElementById('presence-summary')!.textContent='No other visitors nearby.';}
  receive(snapshot:PresenceSnapshot,now=performance.now()){
    if(snapshot.planetId!==this.planet){this.clear();this.planet=snapshot.planetId;}
    this.receivedAt=now;const ids=new Set(snapshot.visitors.map(v=>v.id));
    for(const[id,r]of this.people)if(!ids.has(id)){disposeGeometry(r.root);this.people.delete(id);}
    for(const visitor of snapshot.visitors.slice(0,MAX_NEIGHBOURS)){
      let r=this.people.get(visitor.id);
      if(!r){
        const root=new T.Group(),low=new T.Group();root.add(low);this.scene.add(root);
        const body=new T.MeshStandardMaterial({color:PALETTES[visitor.character],roughness:.8});body.userData.ownedResource=true;
        const torso=new T.Mesh(new T.CapsuleGeometry(.19,.64,3,6),body);torso.position.y=.74;low.add(torso);
        const helmet=new T.Mesh(new T.IcosahedronGeometry(.24,1),new T.MeshBasicMaterial({color:'#b5cad0'}));helmet.position.y=1.39;low.add(helmet);
        const ring=new T.Mesh(new T.RingGeometry(.28,.32,20),new T.MeshBasicMaterial({color:'#75bbc8',transparent:true,opacity:.65,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;root.add(ring);
        r={visitor,root,low,body,avatar:null,position:new T.Vector3(...visitor.position),from:new T.Vector3(...visitor.position),facing:new T.Vector3(...visitor.facing),at:now,speed:0};this.people.set(visitor.id,r);
      }
      const target=new T.Vector3(...visitor.position);r.speed=Math.min(3,r.position.angleTo(target)*RADIUS/Math.max(.3,(now-r.at)/1000));r.from.copy(r.position);r.visitor=visitor;r.at=now;r.body.color.set(PALETTES[visitor.character]);r.avatar?.setColor(visitor.character);
    }
    this.canvas.dataset.visitors=String(this.people.size);this.canvas.dataset.nearbyVisitors=String(snapshot.nearbyCount);this.canvas.dataset.presencePlanet=snapshot.planetId;document.getElementById('presence-summary')!.textContent=snapshot.nearbyCount?`${snapshot.nearbyCount} other visitor${snapshot.nearbyCount===1?'':'s'} on this world · cyan foot rings`:'No other visitors nearby.';
  }
  frame(now:number,dt:number,self:T.Vector3,reduced:boolean){
    if(now-this.receivedAt>PRESENCE_TTL){if(this.people.size)this.clear();return;}
    const ordered=[...this.people.values()].sort((a,b)=>self.angleTo(a.position)-self.angleTo(b.position));let detailed=0,visible=0;
    for(const r of ordered){
      const t=Math.min(1,(now-r.at)/900),target=new T.Vector3(...r.visitor.position);r.position.copy(r.from).lerp(target,reduced?1:t).normalize();
      const near=self.angleTo(r.position)*RADIUS,detail=near<6&&detailed<4;r.root.visible=near<21;if(r.root.visible)visible++;
      if(detail){detailed++;if(!r.avatar){r.avatar=courier(r.visitor.character);r.avatar.root.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=false;});r.root.add(r.avatar.root);}}
      else if(r.avatar){disposeGeometry(r.avatar.root);r.avatar=null;}
      r.low.visible=!detail;r.avatar?.animate(now/1000,t<1?r.speed*surfaceScale(r.position):0,reduced);
      r.facing.lerp(new T.Vector3(...r.visitor.facing),reduced?1:1-Math.exp(-8*dt)).projectOnPlane(r.position);
      if(r.facing.lengthSq()<.01)r.facing.set(0,0,1).projectOnPlane(r.position);r.facing.normalize();
      r.root.quaternion.copy(surfaceOrientation(r.position,r.facing));r.root.position.copy(surfacePoint(r.position,.02));
    }
    this.canvas.dataset.visibleVisitors=String(visible);this.canvas.dataset.detailedVisitors=String(detailed);
  }
}
