import {test,expect} from '@playwright/test';
import type {Page,BrowserContext} from '@playwright/test';
import {Vector3,Quaternion} from 'three';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {industrialCabin} from '../../src/assets/claude-geometry/blueprint/samples.ts';
import {encodeBlueprint} from '../../src/assets/claude-geometry/blueprint/codec.ts';
import type {Blueprint,PartPlacement} from '../../src/assets/claude-geometry/blueprint/model.ts';
import {anchorQuaternion,localToDir} from '../../src/assets/claude-geometry/core/anchor.ts';
import {structureFit} from '../../src/shared/blueprints.ts';
import {normalize} from '../../src/shared/world.ts';
import type {Vec3} from '../../src/shared/world.ts';
import type {PlacedObject} from '../../src/shared/planets.ts';
import {visit,menuAction,readUniverse,closeVisit} from './flight-helper.ts';
const evidence='docs/evidence/physics-v1',stateFile='.data/physics-browser-owner.json';
async function begin(page:Page){await page.goto('/');if(await page.locator('#courier-dialog').isVisible()){await page.getByRole('button',{name:'Fern A little leafy'}).click();await page.getByRole('button',{name:'Let’s wander'}).click();}await expect(page.locator('#scene-sync')).toContainText('Live');}
async function readFeet(page:Page){const d=await page.locator('#world canvas').evaluate(e=>({...((e as HTMLElement).dataset)}));return {position:JSON.parse(d.groundPosition!) as Vec3,radius:Number(d.feetRadius),north:new Vector3(...JSON.parse(d.cameraHeading!)),grounded:d.grounded==='true'};}
function frame(o:PlacedObject,parts:PartPlacement[]){const anchor={dir:o.position,yaw:o.rotation},base=structureFit(parts,o.position,o.rotation).baseRadius,inverse=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();return {at:(x:number,z:number,y=0)=>localToDir(anchor,base,[x,y,z]),local:(p:{position:Vec3;radius:number})=>new Vector3(...p.position).multiplyScalar(p.radius).addScaledVector(new Vector3(...o.position),-base).applyQuaternion(inverse)};}
async function walk(page:Page,target:(feet:Awaited<ReturnType<typeof readFeet>>)=>Vec3,touch=false){
  const cdp=touch?await page.context().newCDPSession(page):null,held=new Set<string>();let touchActive=false;
  try{
    // Camera drag aligns the initial keyboard path; movement remains actual keys/touch.
    if(!touch){const f=await readFeet(page),up=new Vector3(...f.position),dir=new Vector3(...target(f)).projectOnPlane(up).normalize();let turn=Math.atan2(up.dot(new Vector3().crossVectors(f.north,dir)),f.north.dot(dir));
      while(Math.abs(turn)>.02){const amount=Math.max(-1.1,Math.min(1.1,turn));await page.mouse.move(850,450);await page.mouse.down();await page.mouse.move(850-amount/.004,450,{steps:4});await page.mouse.up();turn-=amount;}
    }
    for(let step=0;step<260;step++){
      const f=await readFeet(page),up=new Vector3(...f.position),to=new Vector3(...target(f)),distance=up.angleTo(to)*f.radius;
      if(distance<.13){for(const k of held)await page.keyboard.up(k);held.clear();if(cdp&&touchActive){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touchActive=false;}await page.waitForTimeout(280);return;}
      const direction=to.projectOnPlane(up).normalize(),right=new Vector3().crossVectors(f.north,up).normalize(),x=direction.dot(right),y=direction.dot(f.north);
      if(cdp){const b=(await page.locator('#joystick').boundingBox())!,cx=b.x+b.width/2,cy=b.y+b.height/2,scale=Math.min(1,distance/.6);
        if(step===0){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});touchActive=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34*scale,y:cy-y*34*scale}]});
      }else{
        // A narrow stair needs continuous heading correction. Eight-direction
        // keyboard quantisation alone can keep pressing into a side rail.
        const angle=Math.atan2(up.dot(new Vector3().crossVectors(f.north,direction)),f.north.dot(direction));
        if(Math.abs(angle)>.025){const turn=Math.max(-.7,Math.min(.7,angle));await page.mouse.move(850,450);await page.mouse.down();await page.mouse.move(850-turn/.004,450,{steps:2});await page.mouse.up();}
        if(Math.abs(angle)<.8){if(!held.has('w')){await page.keyboard.down('w');held.add('w');}}else if(held.has('w')){await page.keyboard.up('w');held.delete('w');}
      }
      await page.waitForTimeout(distance<.4?35:65);
      if(step%45===44){const notice=await page.locator('#notice').textContent();if(notice?.includes('Reconnect'))throw Error('Movement server rejection: '+notice);}
    }
    throw Error('Walking did not reach waypoint: '+JSON.stringify(await readFeet(page)));
  }finally{for(const k of held)await page.keyboard.up(k);if(cdp){if(touchActive)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}}
}
function stairs():Blueprint{const parts:Omit<PartPlacement,'n'>[]=[...[1,2,3].map(z=>({part:'floor.deck' as const,x:1,z,level:0,rot:0 as const})),{part:'stair.straight',x:1,z:3,level:0,rot:0},{part:'structure.column',x:1,z:1,level:0,rot:2},{part:'floor.deck',x:1,z:1,level:1,rot:0}];return {id:randomUUID() as Blueprint['id'],name:'Physics stair fixture',parts:parts.map((p,i)=>({...p,n:i+1})),groups:[]};}

test('physics milestone: real desktop flight and door entry, stair persistence, phone touch and return landing',async({browser})=>{
  test.setTimeout(480_000);mkdirSync(evidence,{recursive:true});const contexts:BrowserContext[]=[],errors:string[]=[],checks:string[]=[];
  const record=()=>writeFileSync(`${evidence}/browser-result.json`,JSON.stringify({status:checks.includes('No browser page errors')?'passed':'incomplete',browser:'Installed Google Chrome, headed; 1440×900 and 390×844 touch emulation',fixtures:'Blueprints and placements created through authenticated normal APIs; player movement uses keyboard/touch only.',checks,pageErrors:errors},null,2)+'\n');
  const check=(s:string)=>{checks.push(s);console.log('Verified:',s);record();};
  try{
    const reuse=process.env.PHYSICS_RESUME==='1'&&existsSync(stateFile),context=await browser.newContext({viewport:{width:1440,height:900},...(reuse?{storageState:stateFile}:{})});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await begin(page);
    let u=await readUniverse(page);if(!u.currentPlanet.mine){await visit(page);await menuAction(page,'claim-planet');await page.locator('#resume').click();check('Real public-hub walk, takeoff, flight, landing and planet claim');}
    await context.storageState({path:stateFile});u=await readUniverse(page);const planetId=u.currentPlanet.id;
    let cabin=u.currentPlanet.objects[0],stair=u.currentPlanet.objects[1];
    if(!cabin){for(const [bp,position,rotation] of [[industrialCabin(),normalize([.55,1,.4]),Math.PI/2],[stairs(),normalize([-.55,1,.4]),0]] as const){
      const saved=await page.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});expect(saved.ok(),await saved.text()).toBe(true);const entry=await saved.json();
      const placed=await page.request.post('/api/objects/create',{data:{planetId,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position,rotation}});expect(placed.ok(),await placed.text()).toBe(true);
    }await page.reload();await expect(page.locator('#scene-sync')).toContainText('Live');u=await readUniverse(page);[cabin,stair]=u.currentPlanet.objects;}
    const cf=frame(cabin,u.currentPlanet.blueprints![cabin.blueprintHash!]),sf=frame(stair,u.currentPlanet.blueprints![stair.blueprintHash!]);
    const resumed=sf.local(await readFeet(page));if(resumed.y>.1&&Math.abs(resumed.x)<.5&&resumed.z<1.6&&resumed.z> -1.7)await walk(page,f=>sf.at(0,1.9,sf.local(f).y));
    await walk(page,()=>cf.at(-1.9,-1.9));await walk(page,()=>cf.at(-1.9,1.9));await walk(page,()=>cf.at(-.45,1.9));await walk(page,f=>cf.at(-.45,0,cf.local(f).y));let feet=await readFeet(page);expect(cf.local(feet).z).toBeLessThan(.25);expect(feet.grounded).toBe(true);await page.screenshot({path:`${evidence}/desktop-door-inside.png`});check('Rotated cabin: actual keyboard entry through open door');
    // Aim through a solid wall and observe that the capsule stays inside.
    await walk(page,f=>cf.at(.6,0,cf.local(f).y));const before=await readFeet(page);await page.keyboard.down('w');await page.waitForTimeout(850);await page.keyboard.up('w');await page.waitForTimeout(350);feet=await readFeet(page);expect(Math.abs(cf.local(feet).x)).toBeLessThan(.85);expect(feet.radius-before.radius).toBeLessThan(.3);check('Solid cabin wall blocks continued walking');
    await walk(page,f=>cf.at(-.42,0,cf.local(f).y));await walk(page,f=>cf.at(-.45,1.9,cf.local(f).y));
    await walk(page,()=>cf.at(-1.9,1.9));await walk(page,()=>cf.at(-1.9,-1.9));await walk(page,()=>sf.at(1.1,2));await walk(page,()=>sf.at(0,1.9));await walk(page,f=>sf.at(0,-1.04,sf.local(f).y));feet=await readFeet(page);expect(sf.local(feet).y).toBeCloseTo(2.2,1);expect(feet.grounded).toBe(true);
    await page.waitForTimeout(700);const saved=(await readUniverse(page)).player;expect(saved.ground!.radius).toBeCloseTo(feet.radius,2);await page.screenshot({path:`${evidence}/desktop-upper-floor.png`});await page.reload();await expect(page.locator('#scene-sync')).toContainText('Live');feet=await readFeet(page);expect(sf.local(feet).y).toBeCloseTo(2.2,1);check('Keyboard climbs stairs; upper-floor height survives server save and refresh');
    const storage=await context.storageState();await closeVisit(context);
    const mobile=await browser.newContext({storageState:storage,viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(mobile);const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await begin(phone);expect(sf.local(await readFeet(phone)).y).toBeCloseTo(2.2,1);await phone.screenshot({path:`${evidence}/phone-upper-floor.png`});
    await walk(phone,f=>sf.at(0,1.9,sf.local(f).y),true);expect(sf.local(await readFeet(phone)).y).toBeLessThan(.2);await walk(phone,f=>sf.at(0,-1.04,sf.local(f).y),true);expect(sf.local(await readFeet(phone)).y).toBeCloseTo(2.2,1);await phone.reload();await expect(phone.locator('#scene-sync')).toContainText('Live');expect(sf.local(await readFeet(phone)).y).toBeCloseTo(2.2,1);expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);check('390×844 phone: real joystick descent/ascent; same server floor after reconnect');
    await walk(phone,f=>sf.at(0,1.9,sf.local(f).y),true);await phone.waitForTimeout(650);const returnStorage=await mobile.storageState();await closeVisit(mobile);
    const returning=await browser.newContext({storageState:returnStorage,viewport:{width:1440,height:900}});contexts.push(returning);const pilot=await returning.newPage();pilot.on('pageerror',e=>errors.push(e.message));await begin(pilot);await visit(pilot,'hub');await visit(pilot,planetId);await expect(pilot.locator('#scene-sync')).toContainText('Live');const landed=(await readUniverse(pilot)).player;expect(landed.ground!.radius).toBeLessThan(10.4);expect(landed.ground!.grounded).toBe(true);await pilot.screenshot({path:`${evidence}/return-landing.png`});check('Return flight lands on terrain with no stale upper-floor height');expect(errors).toEqual([]);check('No browser page errors');
  }finally{for(const c of contexts)try{await closeVisit(c);}catch{/* context already closed */}record();}
});
