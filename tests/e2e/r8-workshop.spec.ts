import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {homeCottage,cornerLane,padStall} from '../../src/assets/claude-geometry/blueprint/samples.ts';
import {PART_IDS} from '../../src/assets/claude-geometry/blueprint/parts/catalogue.ts';
import {structureSize,structureFit} from '../../src/shared/blueprints.ts';
import {fieldOf} from '../../src/shared/terrain.ts';
import {placementProblem} from '../../src/shared/planets.ts';
import type {Vec3} from '../../src/shared/world.ts';
import {visit,menuAction,openMenu,readUniverse,closeVisit} from './flight-helper.ts';
const dir='docs/evidence/r8-workshop';
test('R8 player workflow: flight, actual assembly controls, all samples, save/reload and phone',async({browser})=>{
 test.setTimeout(420000);if(!String(test.info().project.use.baseURL).endsWith(':8116'))throw Error('Use isolated 8116');mkdirSync(dir,{recursive:true});
 const c=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900},...(process.env.R8_RESUME==='1'&&existsSync('.data/r8-owner.json')?{storageState:'.data/r8-owner.json'}:{})}),p=await c.newPage(),errors:string[]=[],checks:string[]=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const report=(status:string,error?:unknown)=>writeFileSync(`${dir}/player.json`,JSON.stringify({status,browser:browser.version(),checks,errors,error:error?String(error):undefined},null,2)+'\n');
 const check=(v:string)=>{checks.push(v);console.log(v);report('running');};
 try{
  await p.goto('/?measure=1');if(await p.locator('#begin').isVisible())await p.locator('#begin').click();await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();
  if(!(await readUniverse(p)).currentPlanet.mine){await visit(p);await menuAction(p,'claim-planet');await p.locator('#resume').click();check('Real boarding, flight, landing and claim');}await c.storageState({path:'.data/r8-owner.json'});
  await menuAction(p,'open-workshop');await expect(p.locator('#ws-save')).toBeEnabled();await expect(p.locator('#ws-tool option')).toHaveCount(46);
  for(const id of PART_IDS.slice(21)){await p.locator('#ws-tool').selectOption(id);await expect(p.locator('#ws-tool')).toHaveValue(id);}check('All 24 new tools exposed in the actual player workshop');
  for(const [key,make]of [['home',homeCottage],['lane',cornerLane],['stall',padStall]] as const){
   const bp=make();await p.locator('#ws-example').selectOption(key);await p.locator('#ws-example-load').click();await expect(p.locator('#ws-parts option')).toHaveCount(bp.parts.length);
   await p.locator('#ws-save').click();await expect(p.locator('#ws-count')).toContainText('Saved');await p.waitForTimeout(600);await p.screenshot({path:`${dir}/desktop-${key}.png`});
  }
  // Recreate a complete sample through normal selection and Add controls.
  await p.locator('#ws-new').click();await p.locator('#ws-name').fill('R8 hand-built lane');
  for(const part of cornerLane().parts){await p.locator('#ws-tool').selectOption(part.part);await p.locator('#ws-x').selectOption({value:String(part.x)});await p.locator('#ws-z').selectOption({value:String(part.z)});await p.locator('#ws-level').selectOption(String(part.level));await p.locator('#ws-rot').selectOption(String(part.rot));await p.locator('#ws-add').click();const status=await p.locator('#ws-status').textContent();if(!(status??'').startsWith('Add '))throw Error('Assembly failed '+JSON.stringify(part)+' '+status);}
  await expect(p.locator('#ws-parts option')).toHaveCount(cornerLane().parts.length);await p.locator('#ws-save').click();await expect(p.locator('#ws-count')).toContainText('Saved');check('Corner lane reconstructed piece by piece through real UI, then server-saved');
  await p.locator('#ws-close').click();await p.reload();await menuAction(p,'open-workshop');await expect.poll(()=>p.locator('#ws-library option').count()).toBeGreaterThanOrEqual(4);check('Four server blueprints survive refresh');
  await p.setViewportSize({width:390,height:844});await p.locator('#workshop .language-select').selectOption('zh');await expect(p.locator('#ws-example-load')).toHaveText('载入样例');
  for(const [key,make]of [['home',homeCottage],['lane',cornerLane],['stall',padStall]] as const){await p.locator('#ws-example').selectOption(key);await p.locator('#ws-example-load').click();await expect(p.locator('#ws-parts option')).toHaveCount(make().parts.length);await p.waitForTimeout(550);await p.screenshot({path:`${dir}/phone-${key}-zh.png`});}
  await p.locator('#ws-tool').selectOption('light.wall');await expect(p.locator('#ws-tool option:checked')).toContainText('壁灯');expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await p.locator('#workshop .language-select').selectOption('en');await expect(p.locator('#ws-tool option:checked')).toContainText('Wall');await p.locator('#ws-close').click();check('390px visible samples, translated controls, no horizontal overflow and in-place language switch');
  let u=await readUniverse(p);const library=await(await p.request.get('/api/blueprints')).json(),entry=library.find((e:{blueprint:{name:string}})=>e.blueprint.name==='Lived-in cottage');expect(entry).toBeTruthy();
  let created=false;
  for(let i=0;i<96&&!created;i++){const y=1-2*(i+.5)/96,r=Math.sqrt(1-y*y),angle=i*2.39996,position:Vec3=[r*Math.cos(angle),y,r*Math.sin(angle)],rotation=(i%8)*Math.PI/4;
   if(placementProblem('structure',position,u.currentPlanet.objects,undefined,structureSize(entry.blueprint.parts).radius,u.currentPlanet.radius)||structureFit(entry.blueprint.parts,position,rotation,fieldOf(u.currentPlanet.environment,u.currentPlanet.radius)).problem)continue;
   const response=await p.request.post('/api/objects/create',{data:{planetId:u.currentPlanet.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position,rotation}});expect(response.ok(),await response.text()).toBe(true);u=await response.json();created=true;
  }
  expect(created).toBe(true);await p.reload();await expect.poll(async()=>(await readUniverse(p)).currentPlanet.objects.length).toBe(1);
  await c.storageState({path:'.data/r8-owner.json'});writeFileSync('.data/r8-planet.json',JSON.stringify({planetId:u.currentPlanet.id,object:u.currentPlanet.objects[0],blueprint:entry.blueprint}));check('New sample accepted at a legal terrain fit and persists as immutable placed content');
  expect(errors).toEqual([]);report('passed');
 }catch(e){await p.screenshot({path:`${dir}/player-failure.png`}).catch(()=>{});report('failed',e);throw e;}finally{await closeVisit(c);}
});
