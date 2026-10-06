import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {Vector3,Ray,Box3} from 'three';
import {GroundWorld} from '../../src/shared/physics/world.ts';
import type {Vec3} from '../../src/shared/world.ts';
import {readFeet,frame,walk} from './physics-helper.ts';
import {readUniverse,closeVisit} from './flight-helper.ts';
const phase=process.env.MOVEMENT_REVIEW??'';
const dir='docs/evidence/movement-review';

async function face(page:Page,target:Vec3){
 const f=await readFeet(page),up=new Vector3(...f.position),toward=new Vector3(...target).projectOnPlane(up).normalize();let turn=Math.atan2(up.dot(new Vector3().crossVectors(f.north,toward)),f.north.dot(toward));
 while(Math.abs(turn)>.015){const amount=Math.max(-1.1,Math.min(1.1,turn));await page.mouse.move(800,430);await page.mouse.down();await page.mouse.move(800-amount/.004,430,{steps:5});await page.mouse.up();turn-=amount;}
}
test('bounded real controls: diagonal doors, wall sliding, stairs, ledge and camera obstruction',async({browser})=>{
 test.skip(!phase||!existsSync('.data/physics-browser-owner.json'),'Opt-in local review fixture');test.setTimeout(240_000);mkdirSync(dir,{recursive:true});
 const contexts=[],errors:string[]=[],rejections:string[]=[],checks:string[]=[],samples:unknown[]=[];let current:Page|undefined;
 const network:unknown[]=[];const report:Record<string,unknown>={phase,browser:browser.version(),checks,errors,rejections,samples};
 const context=await browser.newContext({storageState:'.data/physics-browser-owner.json',viewport:{width:1440,height:900},reducedMotion:phase.endsWith('camera')?'no-preference':'reduce'});contexts.push(context);const page=await context.newPage();current=page;
 const watch=(p:Page)=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',async r=>{if(r.url().includes('/api/move')){const response=await r.json().catch(()=>null);network.push({status:r.status(),request:r.request().postDataJSON(),response});if(r.status()>=400)rejections.push(r.status()+': '+response?.error);}});};watch(page);
 try{
 await page.goto('/');await expect(page.locator('#scene-sync')).toContainText('Live');const initial=await readUniverse(page),original=initial.currentPlanet,world=new GroundWorld(original);writeFileSync(`.data/movement-${phase}-initial.json`,JSON.stringify(initial));
 const cabin=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(p=>p.part==='wall.door.open'))!,stairs=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(p=>p.part==='stair.straight'))!;const cf=frame(cabin,original.blueprints![cabin.blueprintHash!]),sf=frame(stairs,original.blueprints![stairs.blueprintHash!]);
 const sample=async(p:Page,label:string)=>{
  const feet=await readFeet(p),d=await p.locator('#world canvas').evaluate(e=>({...((e as HTMLElement).dataset)}));const head=new Vector3(...JSON.parse(d.cameraHead!)),eye=new Vector3(...JSON.parse(d.cameraPosition!)),delta=eye.clone().sub(head),length=delta.length();let solid=length;
  for(const body of world.bodies)for(const box of body.colliders){const origin=head.clone().sub(box.center).applyQuaternion(box.inverse),direction=delta.clone().applyQuaternion(box.inverse).normalize(),half=box.half.clone().addScalar(.06),bounds=new Box3(half.clone().negate(),half),hit=new Ray(origin,direction).intersectBox(bounds,new Vector3());if(bounds.containsPoint(origin))solid=0;else if(hit)solid=Math.min(solid,hit.distanceTo(origin));}
  const row={label,cabin:cf.local(feet).toArray(),stairs:sf.local(feet).toArray(),position:feet.position,radius:feet.radius,grounded:feet.grounded,head:head.toArray(),eye:eye.toArray(),boom:length,firstSolid:solid,cameraCrossesSolid:length>solid+.005,blocked:world.blocked({...feet,verticalSpeed:0}),support:d.groundSupport};samples.push(row);return row;
 };
 if(phase.endsWith('camera')){
  if(phase==='after-camera'){await walk(page,f=>cf.at(-.58,1.6,cf.local(f).y));await sample(page,'released-original-contact');await page.screenshot({path:`${dir}/after-door-release.png`});checks.push('Actual keyboard exits the original saved stuck contact without relocation');}
  await walk(page,f=>cf.at(-.44,.15,cf.local(f).y));
  for(let i=0;i<12;i++){
   await page.mouse.move(800,430);await page.mouse.down();await page.mouse.move(800-Math.PI/6/.004,430+(i%3-1)*60,{steps:6});await page.mouse.up();
   for(let t=0;t<3;t++){await page.waitForTimeout(80);const row=await sample(page,'smooth-camera-'+i+'-'+t);expect(row.cameraCrossesSolid).toBe(false);expect(row.blocked).toBe(false);}
  }
  await page.screenshot({path:`${dir}/${phase}-indoor-follow.png`});await walk(page,f=>cf.at(-.58,1.6,cf.local(f).y));await sample(page,'smooth-camera-exit');
  expect(errors).toEqual([]);expect(rejections).toEqual([]);expect((await readUniverse(page)).currentPlanet).toEqual(original);checks.push('Normal motion: twelve indoor yaw/pitch drags and exit, with 36 sampled smoothed camera positions clear of solid proxies');report.status='completed';writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2)+'\n');return;
 }
 const press=async(label:string,target:Vec3,ms:number)=>{await face(page,target);await page.keyboard.down('w');try{for(let t=0;t<ms;t+=100){await page.waitForTimeout(100);await sample(page,label);}}finally{await page.keyboard.up('w');}await page.waitForTimeout(320);return sample(page,label+'-rest');};
 if(!phase.endsWith('phone')){
 const foot=sf.local(await readFeet(page));if(foot.y>.1&&Math.abs(foot.x)<.5&&foot.z<1.6&&foot.z>-1.7)await walk(page,f=>sf.at(0,1.9,sf.local(f).y));
 await walk(page,()=>cf.at(-1.9,-1.9));await walk(page,()=>cf.at(-1.9,1.9));await walk(page,()=>cf.at(-.68,1.6));
 await walk(page,f=>cf.at(-.42,.35,cf.local(f).y));await sample(page,'diagonal-entry');await page.screenshot({path:`${dir}/${phase}-diagonal-entry.png`});
 await walk(page,f=>cf.at(-.60,1.6,cf.local(f).y));await sample(page,'diagonal-exit');checks.push('Diagonal entry and exit through the existing narrow doorway');
 for(let i=0;i<3;i++){
  await press('left-jamb-'+i,cf.at(-1.1,.5),450);await walk(page,f=>cf.at(-.48,1.6,cf.local(f).y));
  await press('right-jamb-'+i,cf.at(.2,.6),450);await walk(page,f=>cf.at(-.48,1.6,cf.local(f).y));
 }
 await walk(page,f=>cf.at(-.48,.15,cf.local(f).y));await press('interior-wall-slide',cf.at(1.3,-.45),550);await page.screenshot({path:`${dir}/${phase}-wall-slide.png`});await walk(page,f=>cf.at(-.48,.15,cf.local(f).y));checks.push('Repeated jamb contact releases; inside wall sliding returns to the doorway');
 for(let i=0;i<12;i++){await page.mouse.move(800,430);await page.mouse.down();await page.mouse.move(800-Math.PI/6/.004,430,{steps:6});await page.mouse.up();await page.waitForTimeout(200);await sample(page,'indoor-orbit-'+i);}
 await page.screenshot({path:`${dir}/${phase}-indoor-camera.png`});
 await walk(page,f=>cf.at(-.48,1.9,cf.local(f).y));await walk(page,()=>cf.at(-1.9,1.9));await walk(page,()=>cf.at(-1.9,-1.9));await walk(page,()=>sf.at(1.1,2));await walk(page,()=>sf.at(0,1.9));await walk(page,f=>sf.at(0,-1.04,sf.local(f).y));expect(sf.local(await readFeet(page)).y).toBeCloseTo(2.2,1);await sample(page,'stair-top');
 await walk(page,f=>sf.at(.24,-1.05,sf.local(f).y));await page.waitForTimeout(600);expect(sf.local(await readFeet(page)).y).toBeCloseTo(2.2,1);await sample(page,'floor-edge-standing');await page.screenshot({path:`${dir}/${phase}-floor-edge.png`});
 await walk(page,f=>sf.at(0,-1.05,sf.local(f).y));await walk(page,f=>sf.at(0,1.9,sf.local(f).y));expect(sf.local(await readFeet(page)).y).toBeLessThan(.2);await sample(page,'stair-bottom-turn');await walk(page,()=>sf.at(.28,1.9));await walk(page,()=>sf.at(0,1.9));checks.push('Stair ascent, floor-edge rest, descent and bottom turn');
 }
 const storage=await context.storageState();await closeVisit(context);
 const mobile=await browser.newContext({storageState:storage,viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(mobile);const phone=await mobile.newPage();current=phone;watch(phone);await phone.goto('/');await expect(phone.locator('#scene-sync')).toContainText('Live');
 if(phase==='after-phone'){await walk(phone,()=>cf.at(-1.9,1.9),true);await walk(phone,()=>cf.at(-1.9,-1.9),true);await walk(phone,()=>sf.at(1.1,2),true);await walk(phone,()=>sf.at(0,1.9),true);}
 await walk(phone,f=>sf.at(0,-1.04,sf.local(f).y),true);expect(sf.local(await readFeet(phone)).y).toBeCloseTo(2.2,1);await sample(phone,'phone-stair-top');await phone.screenshot({path:`${dir}/${phase}-phone-stairs.png`});await walk(phone,f=>sf.at(0,1.9,sf.local(f).y),true);expect(sf.local(await readFeet(phone)).y).toBeLessThan(.2);await phone.reload();await expect(phone.locator('#scene-sync')).toContainText('Live');expect((await readUniverse(phone)).currentPlanet).toEqual(original);checks.push('Phone joystick ascent/descent and refresh preserve the existing world');
 await walk(phone,()=>sf.at(1.1,2),true);await walk(phone,()=>cf.at(-1.9,-1.9),true);await walk(phone,()=>cf.at(-1.9,1.9),true);await walk(phone,()=>cf.at(-.66,1.6),true);await walk(phone,f=>cf.at(-.44,.20,cf.local(f).y),true);expect(cf.local(await readFeet(phone)).z).toBeLessThan(.4);await sample(phone,'phone-diagonal-entry');
 const cdp=await mobile.newCDPSession(phone);try{for(let i=0;i<4;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:285,y:370}]});for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:285-step*24,y:370}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(220);await sample(phone,'phone-indoor-orbit-'+i);}}finally{await cdp.detach();}
 await phone.screenshot({path:`${dir}/${phase}-phone-door-camera.png`});await walk(phone,f=>cf.at(-.58,1.6,cf.local(f).y),true);await sample(phone,'phone-diagonal-exit');await phone.reload();await expect(phone.locator('#scene-sync')).toContainText('Live');expect((await readUniverse(phone)).currentPlanet).toEqual(original);checks.push('Phone joystick diagonal entry/exit and touch camera orbit preserve the existing world');
 expect(errors).toEqual([]);expect(rejections).toEqual([]);report.status='completed';writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2)+'\n');
 }catch(e){report.status='interrupted';report.error=String(e);await current?.screenshot({path:`${dir}/${phase}-failure.png`}).catch(()=>{});writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2)+'\n');throw e;}finally{writeFileSync(`.data/movement-${phase}-network.json`,JSON.stringify(network));for(const c of contexts)try{await closeVisit(c);}catch{/* already closed */}}
});
