import {forward,wrapAngle} from '../shared/flight.ts';
import type {FlightState} from '../shared/flight.ts';
export interface FlightOrbit {yaw:number;elevation:number;distance:number}
export const defaultFlightOrbit=():FlightOrbit=>({yaw:0,elevation:.3,distance:28});
const bindings:Record<string,string>={w:'forward',s:'backward',' ':'brake',a:'left',d:'right',arrowleft:'left',arrowright:'right',arrowup:'forward',arrowdown:'backward'};
/** View drag and wheel only change orbit values; steering uses separate controls. */
export class FlightControls {
 readonly orbit=defaultFlightOrbit();private switches:number[]=[];private keys=new Set<string>();private held=new Map<number,string>();private drag:{id:number;x:number;y:number}|null=null;private lifetime=new AbortController();
 constructor(private canvas:HTMLCanvasElement,private enabled:()=>boolean,private manual:()=>void,buttons:HTMLElement[]=[],allowDriving=true){
  const options={signal:this.lifetime.signal};
  window.addEventListener('keydown',e=>{if(!allowDriving||!enabled()||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]'))||(e.key===' '&&e.target instanceof Element&&e.target.closest('button')))return;const key=e.key.toLowerCase(),action=bindings[key];if(!action||e.repeat&&!this.keys.has(key))return;e.preventDefault();if(!this.keys.has(key)){manual();if(action==='left'||action==='right')this.switches.push(action==='left'?-1:1);this.switches=this.switches.slice(-4);}this.keys.add(key);},options);
  window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()),options);
  window.addEventListener('blur',()=>this.clear(),options);document.addEventListener('visibilitychange',()=>this.clear(),options);
  canvas.addEventListener('pointerdown',e=>{if(!enabled()||this.drag||e.button!==0)return;e.preventDefault();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},options);
  canvas.addEventListener('pointermove',e=>{if(!this.drag||this.drag.id!==e.pointerId||!enabled())return;this.orbit.yaw=wrapAngle(this.orbit.yaw-(e.clientX-this.drag.x)*.005);this.orbit.elevation=Math.max(-1.15,Math.min(1.2,this.orbit.elevation+(e.clientY-this.drag.y)*.005));this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};},options);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(this.drag?.id===(e as PointerEvent).pointerId)this.drag=null;},options);
  canvas.addEventListener('wheel',e=>{if(!enabled())return;e.preventDefault();this.orbit.distance=Math.max(10,Math.min(90,this.orbit.distance*Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.002)));},{...options,passive:false});
  for(const button of buttons){button.addEventListener('pointerdown',e=>{if(!enabled()||e.button!==0)return;e.preventDefault();manual();const action=button.dataset.flightDrive!;if(action==='left'||action==='right'){this.switches.push(action==='left'?-1:1);this.switches=this.switches.slice(-4);}button.setPointerCapture(e.pointerId);this.held.set(e.pointerId,action);},options);for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,e=>this.held.delete((e as PointerEvent).pointerId),options);}
 }
 takeSwitch(){return this.switches.shift()??0;}
 input(){const active=new Set([...this.keys].map(k=>bindings[k]).concat([...this.held.values()]));return {x:Number(active.has('right'))-Number(active.has('left')),z:Number(active.has('forward'))-Number(active.has('backward')),brake:active.has('brake')};}
 lookForward(f:Pick<FlightState,'yaw'|'pitch'>){this.orbit.yaw=f.yaw;this.orbit.elevation=Math.max(-1.15,Math.min(1.2,.2-f.pitch));}
 clear(){this.switches=[];this.keys.clear();this.held.clear();if(this.drag&&this.canvas.hasPointerCapture?.(this.drag.id))this.canvas.releasePointerCapture(this.drag.id);this.drag=null;}
 dispose(){this.clear();this.lifetime.abort();}
}
export function shipHeading(f:Pick<FlightState,'yaw'|'pitch'>){return {degrees:Math.round((f.yaw*180/Math.PI+360)%360)%360,pitch:Math.round(f.pitch*180/Math.PI),forward:forward(f.yaw,f.pitch)};}
