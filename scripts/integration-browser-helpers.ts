import {expect} from '@playwright/test';
import type {Page,CDPSession} from '@playwright/test';
import {Vector3} from 'three';
import {cpus,platform,release,totalmem} from 'node:os';
import type {Universe,PlanetSummary} from '../src/shared/planets.ts';
import type {Vec3} from '../src/shared/world.ts';
import {distance,SPAWN} from '../src/shared/world.ts';
import {landingRadius,safeRadius} from '../src/shared/world-size.ts';
import {bearing,FLIGHT_BRAKE,spaceDistance,wrapAngle} from '../src/shared/flight.ts';
import {HUB_DOCK} from '../src/shared/ports.ts';
import {homeNearDoor} from '../src/shared/home.ts';

/** Only this separately authorised copy may be driven. No production fallback. */
export function integrationUrl(){
 const raw=process.env.APP_URL;
 if(!raw)throw Error('Set APP_URL=http://127.0.0.1:8130 for the isolated integration copy.');
 const url=new URL(raw);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||!['8130','8134'].includes(url.port)||url.protocol!=='http:')throw Error('Integration browser tests are restricted to local isolated ports 8130 and 8134.');
 return url.origin;
}
export const hostContext=()=>({platform:platform(),osRelease:release(),cpu:cpus()[0]?.model,cpuLogicalCount:cpus().length,memoryGiB:Math.round(totalmem()/2**30),realPhone:false});
export async function universe(page:Page):Promise<Universe>{const response=await page.request.get('/api/universe');expect(response.status()).toBe(200);return response.json();}
export async function activate(page:Page,selector:string,touch=false){const control=page.locator(selector);await expect(control).toBeVisible({timeout:10000});await expect(control).toBeEnabled({timeout:10000});await control.scrollIntoViewIfNeeded({timeout:10000});if(touch)await control.tap({timeout:10000});else await control.click({timeout:10000});}
export async function menu(page:Page,selector:string,touch=false){if(!await page.locator('#menu-dialog').isVisible())await activate(page,'#open-menu',touch);await activate(page,selector,touch);}
export async function begin(page:Page,touch=false){
 await page.goto('/?measure=1');
 await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles')),{timeout:30000}).toBeGreaterThan(1000);
 await expect(page.locator('#world canvas')).toHaveAttribute('data-terrain-id',/.+/,{timeout:45000});
 await expect(page.locator('.scene-loading-overlay')).toBeHidden({timeout:45000});
 if(await page.locator('#begin').isVisible())await activate(page,'#begin',touch);
 if(await page.locator('#first-visit-tip').isVisible())await activate(page,'#first-visit-tip button:last-child',touch);
 await expect(page.locator('#scene-sync')).toContainText(/Live|实时|已连接/);
}
export async function visibleControl(page:Page,selector:string){
 const control=page.locator(selector);await expect(control).toBeVisible();
 expect(await control.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
}
export async function rendererContext(page:Page){return page.locator('#world canvas').evaluate(node=>{
 const canvas=node as HTMLCanvasElement,gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
 return {userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},drawingBuffer:{width:canvas.width,height:canvas.height},touchPoints:navigator.maxTouchPoints,visibility:document.visibilityState,webglVendor:gl&&debug?String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)):null,webglRenderer:gl&&debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):null};
 });}

type CaptureData={frames:number[];calls:number[];triangles:number[];cpu:number[];longTasks:number[];start:number;previous:number;running:boolean;raf:number;observer:PerformanceObserver|null;visible:boolean;phaseCounts:Record<string,number>};
type CaptureWindow=Window&{__integrationFrameCapture?:CaptureData};
/** rAF scheduling and renderer counters during actual controls, not GPU timing. */
export async function measureAction<T>(page:Page,label:string,samples:Record<string,unknown>[],action:()=>Promise<T>,minimumMs=4000):Promise<T>{
 await page.bringToFront();
 await page.evaluate(()=>{
  const win=window as CaptureWindow;
  if(win.__integrationFrameCapture?.running)throw Error('Overlapping frame sample.');
  const data:CaptureData={frames:[],calls:[],triangles:[],cpu:[],longTasks:[],start:performance.now(),previous:0,running:true,raf:0,observer:null,visible:!document.hidden,phaseCounts:{}};
  if(PerformanceObserver.supportedEntryTypes.includes('longtask')){data.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())data.longTasks.push(entry.duration);});data.observer.observe({type:'longtask',buffered:false});}
  const tick=(time:number)=>{
   if(!data.running)return;
   if(data.previous)data.frames.push(time-data.previous);data.previous=time;data.visible&&=!document.hidden;
   const canvas=document.querySelector<HTMLCanvasElement>('#world canvas');
   const phase=document.body.classList.contains('scene-loading')?'loading':document.body.classList.contains('home-interior-active')?'interior':document.body.classList.contains('in-space')?'flight':document.querySelector('dialog#workshop[open]')?'workshop':'ground';
   data.phaseCounts[phase]=(data.phaseCounts[phase]??0)+1;
   // The workshop has its own renderer; the world canvas counters stop there.
   if(canvas&&phase!=='workshop'&&phase!=='loading'){
    const call=Number(phase==='interior'?canvas.dataset.homeDrawCalls:canvas.dataset.drawCalls);if(Number.isFinite(call))data.calls.push(call);
    // Ground triangle counters are stale while the independent interior renders.
    if(phase!=='interior'){const triangles=Number(canvas.dataset.triangles);if(Number.isFinite(triangles))data.triangles.push(triangles);}
    const cpu=Number(canvas.dataset.renderCpuMs);if(Number.isFinite(cpu))data.cpu.push(cpu);
   }
   data.raf=requestAnimationFrame(tick);
  };win.__integrationFrameCapture=data;data.raf=requestAnimationFrame(tick);
 });
 const started=Date.now();let actionMs=0,failed:string|undefined;
 try{const value=await action();actionMs=Date.now()-started;if(actionMs<minimumMs)await page.waitForTimeout(minimumMs-actionMs);return value;}
 catch(error){actionMs=Date.now()-started;failed=String(error);throw error;}
 finally{
  if(!page.isClosed())try{
   const measured=await page.evaluate(()=>{
    const win=window as CaptureWindow,data=win.__integrationFrameCapture!;data.running=false;cancelAnimationFrame(data.raf);data.observer?.disconnect();
    const stats=(values:number[])=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),at=(q:number)=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)];return sorted.length?{samples:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1),mean:sorted.reduce((a,b)=>a+b,0)/sorted.length}:null;};
    const result={durationMs:performance.now()-data.start,frames:stats(data.frames),longFrames:{over33_3ms:data.frames.filter(x=>x>100/3).length,over50ms:data.frames.filter(x=>x>50).length,over100ms:data.frames.filter(x=>x>100).length},longTasks:stats(data.longTasks),drawCalls:stats(data.calls),triangles:stats(data.triangles),renderCpuSubmissionMs:stats(data.cpu),continuouslyForeground:data.visible,phaseFrameCounts:data.phaseCounts};delete win.__integrationFrameCapture;return result;
   });samples.push({label,...measured,actionMs,paddingAfterActionMs:Math.max(0,minimumMs-actionMs),failed,timingMeaning:'Foreground Chrome rAF intervals during the named action plus explicit settling time, including all loading frames. p50/p95/p99 are frame scheduling, not GPU timings. renderCpuSubmissionMs is the app rolling submission counter. Interior triangle count and stale workshop/loading renderer counters are omitted. No physical-phone or sustained thermal claim.'});
  }catch(error){samples.push({label,actionMs,failed:failed??String(error),samplingFailed:String(error)});}
 }
}

export async function groundWalk(page:Page,target:Vec3,touch=false,tolerance=.38,timeoutMs=45000){
 const cdp=touch?await page.context().newCDPSession(page):null,held=new Set<string>();let touching=false;
 const until=Date.now()+timeoutMs;
 try{while(Date.now()<until){
  if(await page.locator('body').evaluate(node=>node.classList.contains('scene-loading'))){
   for(const key of held)await page.keyboard.up(key);held.clear();
   if(cdp&&touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}
   await page.waitForTimeout(50);continue;
  }
  const feet=await page.locator('#world canvas').evaluate(el=>({position:JSON.parse(el.dataset.groundPosition!) as Vec3,north:JSON.parse(el.dataset.cameraHeading!) as Vec3,radius:Number(el.dataset.groundRadius)}));
  const gap=distance(feet.position,target,feet.radius);if(gap<tolerance){await page.waitForTimeout(50);return;}
  const up=new Vector3(...feet.position),north=new Vector3(...feet.north),direction=new Vector3(...target).projectOnPlane(up).normalize(),right=new Vector3().crossVectors(north,up).normalize();
  const x=direction.dot(right),y=direction.dot(north);
  if(cdp){const b=(await page.locator('#joystick').boundingBox())!,cx=b.x+b.width/2,cy=b.y+b.height/2,scale=Math.min(1,gap/.65);
   if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});touching=true;}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34*scale,y:cy-y*34*scale,id:1}]});
  }else{const next=new Set([...(Math.abs(x)>.30?[x>0?'d':'a']:[]),...(Math.abs(y)>.30?[y>0?'w':'s']:[])]);for(const key of held)if(!next.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}}
  await page.waitForTimeout(gap<.8?50:100);
 }}finally{for(const key of held)await page.keyboard.up(key);if(cdp){if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}await page.waitForTimeout(300);}
 throw Error('Real walking could not reach the navigation waypoint.');
}
export async function roomWalk(page:Page,targetX:number,touch=false,targetZ?:number){
 await expect(page.locator('.scene-loading-overlay')).toBeHidden({timeout:45000});
 const u=await universe(page),room=u.player.home?.interior.room;
 expect(room).toBeTruthy();expect(u.player.location?.kind).toBe('interior');
 const readPosition=async()=>JSON.parse(await page.locator('#world canvas').getAttribute('data-home-position')??'[]') as Vec3;
 let last=await readPosition();const z=targetZ??last[2];
 // fitHomeCamera's fixed room-local bearing. Follow mode only translates it.
 // Project the desired XZ displacement into actual screen-relative controls.
 const right=new Vector3(room!.depth*1.45,0,-room!.width*.88).normalize(),forward=new Vector3().crossVectors(new Vector3(0,1,0),right);
 const cdp=touch?await page.context().newCDPSession(page):null,held=new Set<string>(),until=Date.now()+20000;let touching=false,reached=false;
 try{while(Date.now()<until){
  last=await readPosition();const direction=new Vector3(targetX-last[0],0,z-last[2]),gap=direction.length();
  if(gap<.045){reached=true;break;}direction.normalize();
  const x=direction.dot(right),y=direction.dot(forward);
  if(cdp){const box=(await page.locator('#home-joystick').boundingBox())!,cx=box.x+box.width/2,cy=box.y+box.height/2,scale=Math.min(1,gap/.4);
   if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});touching=true;}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34*scale,y:cy-y*34*scale,id:1}]});
   await page.waitForTimeout(50);
  }else{
   const next=[...(Math.abs(x)>.25?[x>0?'d':'a']:[]),...(Math.abs(y)>.25?[y>0?'w':'s']:[])];
   for(const key of next){await page.keyboard.down(key);held.add(key);}
   await page.waitForTimeout(Math.min(60,Math.max(12,gap/2.5*650)));
   for(const key of held)await page.keyboard.up(key);held.clear();
  }
 }}finally{for(const key of held)await page.keyboard.up(key);if(cdp){if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}await page.waitForTimeout(300);}
 if(!reached)throw Error('Room controls could not reach the 2D waypoint: '+JSON.stringify({target:[targetX,z],last:[last[0],last[2]]}));
}
export async function roomDoor(page:Page,touch=false){
 const room=(await universe(page)).player.home!.interior.room;
 // Inside the true door interaction band, with clearance from its swing arc.
 await roomWalk(page,0,touch,room.depth/2-1.02);
 await expect.poll(async()=>{const location=(await universe(page)).player.location;return location?.kind==='interior'&&homeNearDoor(location.position,room);},{timeout:5000}).toBe(true);
}
export async function walkToPort(page:Page,touch=false){
 const u=await universe(page);
 if(await page.locator('#board-ship').isVisible())return;
 const homeRoute=u.currentPlanet.homeManifest?.routes.find(route=>route.id==='home');
 if(homeRoute)for(const point of [...homeRoute.points].reverse().slice(1))await groundWalk(page,point,touch);
 else await groundWalk(page,u.currentPlanet.id==='hub'?HUB_DOCK:SPAWN,touch,1.1);
 await expect(page.locator('#board-ship')).toBeVisible();
}
async function flightTouch(cdp:CDPSession,page:Page,turn:number,pitch:number,thrust:boolean,brake:boolean){
 const stick=(await page.locator('#flight-stick').boundingBox())!,pedal=(await page.locator(brake?'#ship-brake':'#ship-thrust').boundingBox())!;
 const length=Math.max(1,Math.hypot(turn,pitch));
 const points=[{id:1,x:stick.x+stick.width/2+turn/length*36,y:stick.y+stick.height/2-pitch/length*36}];
 if(thrust||brake)points.push({id:2,x:pedal.x+pedal.width/2,y:pedal.y+pedal.height/2});
 // Short true multi-touch holds also release pedals when switching between them.
 try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await page.waitForTimeout(95);}
 finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
}
export async function flyTo(page:Page,target:PlanetSummary,touch=false){
 if(await page.locator('#builder').isVisible())await activate(page,'#finish-building',touch);
 if(await page.locator('#menu-dialog').isVisible())await activate(page,'#resume',touch);
 expect((await universe(page)).player.location?.kind).not.toBe('interior');
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 if((await universe(page)).player.flight.mode==='ground'){await walkToPort(page,touch);await activate(page,'#board-ship',touch);await activate(page,'#confirm-flight',touch);await expect(page.locator('#flight-hud')).toBeVisible({timeout:15000});}
 // Hub departure temporarily rejects keydown and clears controls at its end.
 // Start the driver only afterwards so its held-key bookkeeping stays real.
 await expect(page.locator('body')).not.toHaveClass(/departing/,{timeout:15000});
 await expect(page.locator('.scene-loading-overlay')).toBeHidden({timeout:45000});
 await menu(page,'#open-map',touch);await page.locator('#region-select').selectOption('all');
 await activate(page,`.planet-option[data-planet-id="${target.id}"] button`,touch);
 await expect(page.locator('#flight-hud')).toHaveAttribute('data-target',target.id);await expect(page.locator('dialog[open]')).toHaveCount(0);
 const held=new Set<string>(),cdp=touch?await page.context().newCDPSession(page):null,stopAt=landingRadius(target)-1.1,until=Date.now()+150000;
 const planets=(await universe(page)).planets,waypoints:Vec3[]=[];
 const set=async(key:string,on:boolean)=>{if(on&&!held.has(key)){await page.keyboard.down(key);held.add(key);}else if(!on&&held.has(key)){await page.keyboard.up(key);held.delete(key);}};
 let stalled=0,detours=0,arrived=false;
 try{while(Date.now()<until){
  if(await page.locator('body').evaluate(node=>node.classList.contains('scene-loading'))){
   for(const key of held)await page.keyboard.up(key);held.clear();
   await page.waitForTimeout(50);continue;
  }
  const d=await page.locator('#flight-hud').evaluate(el=>({...el.dataset})),position=JSON.parse(d.position!) as Vec3,speed=Number(d.speed),targetDistance=Number(d.distance);
  // A detour is only a means of reaching the target. Once the real landing
  // control allows a stopped arrival, do not keep chasing an obsolete waypoint.
  if(targetDistance<=landingRadius(target)&&speed<.8&&await page.locator('#land-ship').isEnabled()){arrived=true;break;}
  const marked=bearing(position,target.center),aim=bearing(position,waypoints[0]??target.center);
  // HUD errors and position are sampled together. Reconstruct actual attitude;
  // waypoints steer with the same keys/touches and never write a flight pose.
  const yaw=wrapAngle(aim.yaw-marked.yaw+Number(d.yawError));
  const pitch=Math.max(-1.25,Math.min(1.25,aim.pitch))-marked.pitch+Number(d.pitchError);
  const gap=waypoints.length?spaceDistance(position,waypoints[0]):targetDistance,stop=waypoints.length?3:stopAt;
  if(waypoints.length&&gap<=stop+.8&&speed<.8){waypoints.shift();stalled=0;continue;}
  const turning=Math.abs(yaw)>.22||Math.abs(pitch)>.22;
  const braking=turning&&speed>1.5||gap<stop+speed*speed/(2*FLIGHT_BRAKE)+speed*.40;
  stalled=!waypoints.length&&gap>landingRadius(target)&&speed<.1&&!turning?stalled+1:0;
  if(stalled>15){
   if(++detours>3)throw Error('Flight remains obstructed after three actual-control detours.');
   for(const key of held)await page.keyboard.up(key);held.clear();
   const obstacle=[...planets].sort((a,b)=>spaceDistance(position,a.center)-spaceDistance(position,b.center))[0];
   const normal=new Vector3(...position).sub(new Vector3(...obstacle.center)).normalize();
   const escape=new Vector3(...obstacle.center).addScaledVector(normal,safeRadius(obstacle)+16);
   // First leave the contacted shell radially. Then use the empty corridor
   // above/below the entire survey, on the same side as the outward normal.
   // The offset final approach avoids the ship's vertical-pitch limit.
   const height=(normal.y<0?-1:1)*Math.max(...planets.map(p=>Math.abs(p.center[1])+safeRadius(p)+24));
   const outward=normal.clone();outward.y=0;if(outward.lengthSq()<.01)outward.set(1,0,0);outward.normalize();
   // A purely vertical waypoint makes yaw undefined directly above it; the
   // real ship is pitch-limited. Leave a shallow horizontal component outward.
   const climb=escape.clone().addScaledVector(outward,Math.abs(height-escape.y)*.42);climb.y=height;
   const horizontal=climb.clone().sub(new Vector3(...target.center));horizontal.y=0;
   if(horizontal.lengthSq()<1)horizontal.set(1,0,0);horizontal.normalize();
   const approach=new Vector3(...target.center).addScaledVector(horizontal,safeRadius(target)+20);approach.y=height;
   waypoints.push(escape.toArray() as Vec3,climb.toArray() as Vec3,approach.toArray() as Vec3);
   stalled=0;continue;
  }
  if(cdp)await flightTouch(cdp,page,Math.abs(yaw)>.07?Math.max(-1,Math.min(1,yaw*2.5)):0,Math.abs(pitch)>.07?Math.max(-1,Math.min(1,pitch*2.5)):0,!braking&&!turning&&gap>stop,braking);
  else{await set('a',yaw<-.10);await set('d',yaw>.10);await set('ArrowUp',pitch>.10);await set('ArrowDown',pitch<-.10);await set('s',braking);await set('w',!braking&&!turning&&gap>stop);await page.waitForTimeout(65);}
 }}finally{for(const key of held)await page.keyboard.up(key);await cdp?.detach();}
 const last=await page.locator('#flight-hud').evaluate(el=>({...el.dataset}));
 if(!arrived)throw Error('Real-control flight timed out before the conservative arrival condition: '+JSON.stringify({distance:last.distance,speed:last.speed,yaw:last.yawError,pitch:last.pitchError,detours,clearance:safeRadius(target),remainingWaypoints:waypoints.length}));
 expect(Number(last.distance)).toBeLessThanOrEqual(landingRadius(target));expect(Number(last.speed)).toBeLessThan(6);
 await expect(page.locator('#land-ship')).toBeEnabled();await activate(page,'#land-ship',touch);await expect(page.locator('#flight-title')).toContainText(target.name);await activate(page,'#confirm-flight',touch);
 await expect(page.locator('#flight-hud')).not.toBeVisible({timeout:15000});await expect.poll(async()=>(await universe(page)).currentPlanet.id).toBe(target.id);
 await expect(page.locator('.scene-loading-overlay')).toBeHidden({timeout:45000});
 return {targetRadius:target.radius,landingBand:landingRadius(target),clearance:safeRadius(target),distanceAtLanding:Number(last.distance),speedAtLanding:Number(last.speed),detours,controls:touch?'CDP actual two-finger steering and thrust/brake touches':'keyboard yaw/pitch/thrust/brake',teleport:false};
}
