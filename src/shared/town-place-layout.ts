import {Quaternion,Vector3} from 'three';
import type {Vec3} from './world.ts';
import {localToDir} from '../assets/claude-geometry/core/anchor.ts';

export interface TownPlacePlot {id:string;x:number;z:number;turn:number;template:number}
export interface TownPlacePlan {id:string;name:string;nameZh:string;center:Vec3;yaw:number;intent:string;plots:TownPlacePlot[];walk:[number,number][]}
type Plot=[number,number,number,number,(number|string)?];
const point=(latitude:number,longitude:number):Vec3=>{const a=latitude*Math.PI/180,b=longitude*Math.PI/180;return[Math.cos(a)*Math.sin(b),Math.sin(a),Math.cos(a)*Math.cos(b)];};
const northBearing=(latitude:number,longitude:number)=>{const up=new Vector3(...point(latitude,longitude)),toward=new Vector3(...point(latitude+.001,longitude));const local=toward.projectOnPlane(up).normalize().applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),up).invert());return Math.atan2(local.x,local.z);};
const plan=(id:string,name:string,nameZh:string,latitude:number,longitude:number,yaw:number,intent:string,plots:Plot[],walk:[number,number][]):TownPlacePlan=>({id,name,nameZh,center:point(latitude,longitude),yaw:northBearing(latitude,longitude)+yaw*Math.PI/180,intent,plots:plots.map(([x,z,turn,template,suffix],i)=>({id:`${id}-${suffix??i+1}`,x,z,turn,template})),walk});
/** Concrete ordinary placements selected by the spatial authoring pass.
 * Stable suffixes retain actual object IDs when obsolete proposals are removed.
 * Walking lines still require separate outdoor-route verification. */
export function townPlacePlans():TownPlacePlan[]{return[
 plan("arrival","Arrival porches","迎宾门廊",76,5,0,"Two low porch fronts define the actual landing approach; the street narrows towards an off-axis northern corner rather than an outer ring of houses.",[
  [-3.1,-4.5,90,24,1],[3.1,-4.4,270,24,2],[-3.3,2.6,90,4,3],[3.3,2.6,270,4,4],[-9.5,-7.2,90,47,5],[9.5,-7.6,270,5,6],[-4.3,-11.2,270,54,7],[-9.6,-12,90,38,8]
 ],[[0,-9],[0,-3],[0,1.7],[1.8,4.3]]),
 plan("north-court","Northern corner forecourt","北极转角前庭",89,0,0,"The actual polar point meets an offset roof corner, with a small approach open towards the landing porches and side views into the postal quarter.",[
  [0,1.2,180,18,1],[5.2,2.4,240,4,3]
 ],[[0,-5],[0,-2],[2.3,-0.2],[3.1,2.8]]),
 plan("post","Post bend","邮务弯巷",54,94,0,"The taller eastern street wall faces a low open western gallery; the narrow lane bends towards the retained postal doorway.",[
  [-3.65,-8,90,18,1],[3.65,-7.4,270,24,2],[-3.7,-2.5,90,23,3],[3.5,-1.8,270,18,4],[-3.9,2.7,90,2,5],[3.7,3.45,270,4,6],[-9.7,-2.1,270,25,8],[-9.1,4,180,35,9],[9.1,-7.8,90,18,10],[9.4,-1.8,90,46,11]
 ],[[0,-12],[0,-5],[0,0.6],[-1.6,3.8],[-2.89,6.48]]),
 plan("harbour","Harbour workyard","港口作业院",45,180,0,"Staggered low working wings and a south-facing arrival store bound the ship work court; the existing ship and task clearance determine its shape, with a narrow side entry leading to the dock.",[
  [-6,-10.2,75,48,1],[5.9,-6.6,270,24,2],[-5.9,-2,90,24,3],[5.3,0.8,270,24,4],[-1.6,12.85,180,4,8],[12.4,-14,270,19,9],[-12.5,8.5,90,2,11],[-0.8,-11,360,24,12],[6.4,-2.8,270,58,"east-neck"],[5,-12.5,360,59,"south-return-3"],[-5.8,-14.8,180,60,"south-west-edge-2"],[-7,-6.1,90,58,"west-neck-2"],[-10,-6.4,270,60,"west-yard-edge-2"]
 ],[[-4,-14],[-3.7,-8],[-2.7,-4],[-2.7,1.8],[0,4],[1.2,10]]),
 plan("orchard","Working orchard court","果院边廊",49,244,-18.000000008,"L-shaped roofs enclose a work garden; a low side gallery opens onto the orchard task approach.",[
  [-1.8744289469,0.0810554775,348.8049704138,49,1],[-8.7000000006,-7.8999999994,55.000000004,18,3],[-2.8000000006,-9.2999999998,4e-9,18,4],[3.7999999995,-7.5000000003,325.000000004,18,5],[-10.0129976817,-1.7505993079,89.7027415895,18,7],[-8.1405105973,5.0301952037,80.0622982112,50,8],[-2.7999999994,8.5000000002,180.000000004,25,9]
 ],[[-13,1],[-5,0],[-1,2],[4,1],[12,-1]]),
 plan("north-steps","Roof terrace passage","屋台折巷",54,320,28.0000000004,"A side-facing stair house overlooks low terraces; the path folds twice before a small shared court.",[
  [-8.8,-8,89.9999999998,18,3],[-2.5,-9.6,359.9999999998,20,4],[4,-8.8,319.9999999998,19,5],[9.2,-5.6,269.9999999998,26,6]
 ],[[1,-12],[1,-4],[-3,-2],[-2,4],[4,4]]),
 plan("craft","Workshop dogleg","工匠折街",2,46,0,"A tight low workshop frontage turns a right angle beside one taller corner house; the working court opens only beyond that corner.",[
  [-3.7,-9.7,90,24,1],[3.6,-8,270,18,2],[-3.7,-3.1,90,24,3],[3.6,-2.4,270,23,4],[-3.7,3.5,90,18,5],[2.5,6.1,180,24,6],[9.3,6.1,180,24,7],[8.8,-2.4,270,35,8],[16.1,-2,270,37,9],[-9.5,-8.2,270,18,10],[-9.5,-2.5,270,25,11],[-10,3.8,270,18,12],[-2.1,10.6,180,18,14],[4.7,12,180,25,15],[11.4,12.1,180,34,16]
 ],[[0,-13],[0,-5],[0,1.3],[6,1.4],[6,4],[10.514830840334564,3.8499935760388815]]),
 plan("arcades","Market elbow","檐下集巷",0,137,5,"A low open trading edge and a diagonal counter gallery face an asymmetric market pocket. Three small approaches meet beside the counter; the outer work frontage continues towards the craft quarter.",[
  [-14,-10,60,18,1],[-7.7,-11.8,360,18,2],[-1.4,-11,0,21,3],[5,-10.5,335,35,4],[11.5,-9.5,280,18,5],[-13.5,-2.8,90,24,6],[-6.7,-2.7,0,24,7],[0.8,-4.5,0,18,8],[8,-3.5,260,5,9],[14.2,-3.3,270,18,10],[1.2,3.8,230,38,13],[8.4,4.5,270,18,14],[14.5,3.7,260,34,15],[-5.8,11.4,180,18,17],[0.8,10.8,180,21,18],[13.6,10.6,225,4,20],[24,-4,270,35,21],[25,5.5,270,24,22]
 ],[[-16,0],[-8,0],[-2,-0.3],[4,0],[4,7],[2,15]]),
 plan("courts","Shared back courts","背巷共院",-2,229,-6e-9,"A narrow inhabited entrance opens into a small three-sided court; secondary door lanes continue behind its unequal wings.",[
  [-3.6500000005,-8.6999999998,90.000000003,21,1],[3.6499999996,-8.0000000002,270.000000003,18,2],[-3.6500000001,-2.7999999998,90.000000003,18,3],[3.5999999999,-2.2000000002,270.000000003,4,4],[-3.6999999998,3.4000000002,90.000000003,25,5],[3.7000000002,3.6999999998,270.000000003,18,6],[4e-10,7.7,180.000000003,4,7],[-10.0425000004,-7.9574999995,270.000000003,18,8],[-9.6000000002,-2.8999999995,270.000000003,46,9],[-9.7499999998,3.3000000005,270.000000003,21,10],[10.0999999996,-8.0000000005,90.000000003,25,12],[9.4999999999,-1.6000000005,90.000000003,18,13],[10.3000000002,3.6499999995,90.000000003,46,14]
 ],[[0,-13],[0,-4],[0,1.1],[0,4.1]]),
 plan("porches","Porch side streets","门廊侧街",0,321,8,"Short residential fronts step in and out; a diagonal lane reveals alternating sheltered doorways and small courts.",[
  [-14.5,-2,0,38,1],[-17,4,180,36,2],[-10,-6,0,18,3],[-9,4,180,36,4],[-3,2,180,51,5],[-1.4,-6.4,0,52,6],[5,5,180,18,7],[5.8,-5.8,270,53,8],[-18,-11,40,4,9],[-10,-13,45,21,10],[-4.2,-13,90,2,11],[13,6,250,4,12],[17,-12,330,18,13],[-20.5,11.5,160,2,14],[11,12,210,4,15],[3.85,0.4,0,55,16],[-4.9,-1.2,0,56,17],[6.5,-12,270,57,18]
 ],[[-16,0.1],[-8,0.1],[-2,0.4],[4,0],[4,7],[1,15]]),
 plan("wash-court","Shared house court","住院晒场",-53,30,5,"Two low wings and one taller end make a quiet three-sided shared house court.",[
  [-2.5,-2,90,25,1],[4.4,2,270,18,2],[-3.1,5,180,4,3],[-8.6,-8,65,18,4],[-2.5,-10,148.8865391721,18,5],[4.4,-8.7,320,18,6],[10,-4.7,270,18,7],[-9.3,-1.6,90,18,8],[4.7,8.8,200,18,11],[10.7,2,270,36,12],[1.5,17.2,270,4,13],[5.9227706811,-2.4458575407,110.3156292481,38,14]
 ],[[0,-13],[0,-3],[0.7,3],[6,4]]),
 plan("timber-yard","Long workshop yard","长棚作业庭",-53,127,-8,"A transverse long shed faces a shallow gallery across a narrow work court. A taller room closes one end; the other end opens into the service lane. The western shed also faces the shared U-house forecourt.",[
  [-2.1,-1.7,360,24,1],[4.1,2.4,270,18,2],[-5.4,4.5,90,21,3],[-9.3,-8.3,60,18,4],[-3.2,-10,162.2092862112,18,5],[-10,-1.7,270,24,8],[10.3,0.5,270,8,12],[0.2,5.5,180,38,13]
 ],[[0,-13],[0,-2],[-3,2],[0,5],[12,5]]),
 plan("garden-steps","Garden corner rooms","庭边转角屋",-53,223,9.9999999968,"A deep L-shaped house and a stepped upper gallery flank an off-centre garden; a kinked passage follows its outside edge.",[
  [-2.3000000001,-2.4999999999,1.6e-9,18,1],[4.2000000001,1.7999999999,265.0000000016,25,2],[-3.1999999999,4.8000000001,180.0000000016,5,3],[-9.6000000002,-7.7999999997,60.0000000016,18,4],[-3.4000000003,-9.9999999999,1.6e-9,21,5],[-9.6,-1.2999999997,90.0000000016,18,8],[-4.1,1.0000000001,180.0000000016,27,13],[2.0000000002,7.9999999999,180.0000000016,38,14]
 ],[[-13,1],[-4,1],[-1,-1],[4,0],[4,11]]),
 plan("south-lane","Turning residential lane","南部转巷",-53,316,-8,"A low roof hides the next segment of a bent lane; staggered fronts open onto a compact common doorstep.",[
  [1.4,-1.5,270,18,2],[-3.3,5.1,170,4,3],[10.2,0.9,270,4,12],[-1.4,-6,90,38,13],[2.9332582042,4.1167683295,181.2316963867,38,14]
 ],[[0,-13],[0,-5],[-3,-1],[-2,4],[7,4]]),
 plan("work-to-home","Workshop rear lane","作坊后巷",-35,181,84.9999999904,"Low shed backs meet a turning residential lane; the two unequal corners narrow the passage between market and southern work courts.",[
  [0,0,65.0000000048,25,1],[3.5000000003,3.9999999997,155.0000000048,38,2],[-4.0000000002,-2.4999999997,65.0000000048,39,4],[5.2929744095,-0.6804267163,276.1556424205,38,5]
 ],[[0,-10],[0,-2],[0,3],[2,7]]),
 plan("court-to-porch","Court to porch passage","共院门廊连巷",-12,277,10,"A tall street head steps down into a one-sided low gallery; the angled exit continues into the porch side streets.",[
  [3.6,-5.4,270,18,2],[-3.6,0.4,90,24,3],[3.6,1.5,270,46,4],[-1.2,7.2,90,43,5],[3.4,10.1,180,45,6],[3.15,5.8,0,44,7]
 ],[[0,-11],[0,-4],[0.4,3],[2,10]]),
 plan("post-upper","Post upper side lane","邮屋上侧巷",60,128,-14.9999999996,"A stepped postal corner closes the northern street wall while a lower house leaves a diagonal way to the task porch.",[

 ],[[0,-8],[0,-1],[1,3],[0,7]]),
 plan("orchard-back","Orchard back rooms","果院后屋",58,276,35,"A working rear house and its offset side wing bound a small shaded doorstep at the meeting of orchard and roof terraces.",[
  [-2.7,-8.15,0,38,1]
 ],[[0,-8],[0,-1],[1.8,3],[2,8]]),
 plan("roof-to-arrival","Terrace arrival turn","屋台迎宾转角",49,313,25,"A low street corner turns towards the arrival side; a raised room at the far edge gives the lane an unequal skyline.",[
  [0.35,0,180,18,1]
 ],[[0,-8],[0,-1],[1.5,5],[5,8]]),
 plan("southern-passage","Southern return passage","南院回巷",-39,92,30,"A short inward-facing frontage links the wash court to the long workshop yard through one off-centre opening.",[
  [-2.9,3.3,110,46,4],[3.5,4.4,240,18,5]
 ],[[0,-8],[0,-1],[1,5],[4,8]]),
 plan("garden-back-lane","Garden rear passage","庭后折巷",-36,272,-20,"A tall corner and a low inward-facing pair make the outside of the garden court a legible return lane.",[

 ],[[0,-8],[0,-1],[1,4],[5,8]]),
 plan("south-court","South enclosed court","南极围院",-88,70,0,"Three sides of homes make a sheltered polar court, with one deliberately open view between low wings.",[
  [2.2,0,270,2,2]
 ],[[0,-9],[0,-3],[0,1],[1.5,2]]),
 plan("back-junction","Back working passage","后街作业折巷",-0.636,187.646,-5.6e-9,"A shallow open gallery faces an offset doorway; a seated planted corner closes the south side while two narrow exits connect market, harbour stores and shared courts.",[
  [-1.9999999999,1.8000000001,90.0000000028,38,1],[2.7999999999,-1.7000000001,270.0000000028,4,2],[-0.5500000002,-4.65,90.0000000028,39,3]
 ],[[-0.4,6],[-0.4,1.8],[0.2,-1.7],[2,-5.8]]),
];}
export const townPlacePoint=(place:TownPlacePlan,radius:number,x:number,z:number)=>localToDir({dir:place.center,yaw:place.yaw},radius,[x,0,z]);
