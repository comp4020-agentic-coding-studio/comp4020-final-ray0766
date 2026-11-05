import {bearing,spaceDistance,wrapAngle} from '../shared/flight.ts';
import type {FlightState,FlightInput} from '../shared/flight.ts';
import {nearestRail,railPath,railPathLength} from '../shared/flight-network.ts';
import type {FlightNetwork,RailEdge} from '../shared/flight-network.ts';
import {flightRouteInput} from './flight-route.ts';
import type {Vec3} from '../shared/world.ts';
const brake=():FlightInput=>({thrust:false,brake:true,turn:0,pitch:0});
/** The cursor is reconstructed from saved physical position. No save migration,
 * teleports, client-authoritative landing or alternate movement endpoint. */
export class RailDrive {
 nodeId:string|null=null;selected:string|null=null;edge:RailEdge|null=null;autopilot=false;
 private cameFrom:string|null=null;private ahead:string|null=null;private toward:string|null=null;private autoNodes:string[]=[];private awaitRelease=false;
 constructor(readonly network:FlightNetwork){}
 stop(){this.autopilot=false;this.autoNodes=[];}
 reset(){this.stop();this.nodeId=null;this.selected=null;this.edge=null;this.cameFrom=null;this.ahead=null;this.toward=null;this.awaitRelease=false;}
 attach(f:FlightState){
  if(this.nodeId||this.edge)return true;
  const n=[...this.network.nodes.values()].find(n=>spaceDistance(n.point,f.position)<2.2&&f.speed<.1);
  if(n){this.arrive(n.id,null,f.yaw);this.awaitRelease=false;return true;}
  const near=nearestRail(this.network,f.position);if(!near||near.distance>2.2)return false;
  this.edge=near.edge;const a=this.network.nodes.get(near.edge.a)!,b=this.network.nodes.get(near.edge.b)!;
  this.ahead=Math.abs(wrapAngle(bearing(a.point,b.point).yaw-f.yaw))<Math.PI/2?b.id:a.id;this.toward=this.ahead;return true;
 }
 private arrive(id:string,from:string|null,yaw:number){this.nodeId=id;this.cameFrom=from;this.edge=null;this.toward=null;this.ahead=null;this.awaitRelease=true;const node=this.network.nodes.get(id)!;this.selected=[...node.links].sort((a,b)=>Math.abs(wrapAngle(bearing(node.point,this.network.nodes.get(a)!.point).yaw-yaw))-Math.abs(wrapAngle(bearing(node.point,this.network.nodes.get(b)!.point).yaw-yaw)))[0]??null;}
 switchTrack(direction:number){
  if(!this.nodeId)return 'not-junction';const node=this.network.nodes.get(this.nodeId)!;if(node.links.length<2)return 'single';
  this.selected=node.links[(node.links.indexOf(this.selected!)+Math.sign(direction)+node.links.length)%node.links.length];return 'switched';
 }
 choices(){if(!this.nodeId)return null;const links=this.network.nodes.get(this.nodeId)!.links,i=links.indexOf(this.selected!);return {left:links[(i-1+links.length)%links.length],right:links[(i+1)%links.length],count:links.length};}
 setAutopilot(f:FlightState,target:string){
  if(!this.attach(f))return false;this.autopilot=true;
  if(this.nodeId)this.autoNodes=railPath(this.network,this.nodeId,target).slice(1);
  else{const ends=[this.edge!.a,this.edge!.b].map(id=>({id,path:railPath(this.network,id,target)})).filter(v=>v.path.length).sort((a,b)=>spaceDistance(f.position,this.network.nodes.get(a.id)!.point)+railPathLength(this.network,a.path)-spaceDistance(f.position,this.network.nodes.get(b.id)!.point)-railPathLength(this.network,b.path));if(!ends.length){this.stop();return false;}this.autoNodes=ends[0].path;}
  if(!this.autoNodes.length)this.stop();return true;
 }
 distance(f:FlightState,target:string){if(this.nodeId)return railPathLength(this.network,railPath(this.network,this.nodeId,target));if(this.edge)return Math.min(...[this.edge.a,this.edge.b].map(id=>spaceDistance(f.position,this.network.nodes.get(id)!.point)+railPathLength(this.network,railPath(this.network,id,target))));return null;}
 activePoints():Vec3[]{if(this.nodeId&&this.selected)return [this.network.nodes.get(this.nodeId)!.point,this.network.nodes.get(this.selected)!.point];if(this.edge)return [this.network.nodes.get(this.edge.a)!.point,this.network.nodes.get(this.edge.b)!.point];return [];}
 next(f:FlightState){const id=this.toward??this.selected;return id?{id,distance:spaceDistance(f.position,this.network.nodes.get(id)!.point)}:null;}
 input(f:FlightState,direction:number,stopping:boolean):FlightInput{
  if(!this.attach(f))return brake();
  if(!direction)this.awaitRelease=false;
  if(this.edge&&this.toward&&Math.hypot(f.position[0]-this.network.nodes.get(this.toward)!.point[0],f.position[2]-this.network.nodes.get(this.toward)!.point[2])<1.6&&f.speed<.1){const from=this.edge.a===this.toward?this.edge.b:this.edge.a;const yaw=bearing(this.network.nodes.get(from)!.point,this.network.nodes.get(this.toward)!.point).yaw;this.arrive(this.toward,from,yaw);if(this.autopilot&&this.autoNodes[0]===this.nodeId)this.autoNodes.shift();if(this.autopilot&&!this.autoNodes.length)this.stop();}
  if(this.nodeId){
   const node=this.network.nodes.get(this.nodeId)!;let chosen=this.selected;
   if(this.autopilot)chosen=this.autoNodes[0]??null;
   else if(direction<0)chosen=this.cameFrom??[...node.links].sort((a,b)=>Math.abs(wrapAngle(bearing(node.point,this.network.nodes.get(b)!.point).yaw-f.yaw))-Math.abs(wrapAngle(bearing(node.point,this.network.nodes.get(a)!.point).yaw-f.yaw)))[0]??null;
   const drive=this.autopilot||!!direction&&!this.awaitRelease&&!stopping;
   if(chosen&&drive){this.edge={a:node.id,b:chosen,length:spaceDistance(node.point,this.network.nodes.get(chosen)!.point)};this.ahead=direction<0&&!this.autopilot?node.id:chosen;this.toward=chosen;this.nodeId=null;}
   else {const yaw=chosen?bearing(node.point,this.network.nodes.get(chosen)!.point).yaw:f.yaw;return {...brake(),turn:Math.max(-1,Math.min(1,wrapAngle(yaw-f.yaw)*3)),pitch:Math.max(-1,Math.min(1,-f.pitch*3))};}
  }
  const desired=this.autopilot?this.autoNodes[0]:direction<0?(this.edge!.a===this.ahead?this.edge!.b:this.edge!.a):this.ahead;
  const reversing=desired!==this.toward&&f.speed>.1;if(desired&&!reversing&&(this.autopilot||direction))this.toward=desired;
  const goal=this.network.nodes.get(this.toward!)!.point,active=!stopping&&!reversing&&(this.autopilot||!!direction),input=flightRouteInput(f,[goal[0],f.position[1],goal[2]],active);
  // Aim and translation both follow the selected physical rail, never the view.
  // Brake in the previous direction before reversing; keep the old speed limit.
  const d:[number,number]=[goal[0]-f.position[0],goal[2]-f.position[2]];
  return {...input,planar:d};
 }
}
