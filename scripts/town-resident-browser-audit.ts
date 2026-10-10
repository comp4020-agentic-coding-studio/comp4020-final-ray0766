import {chromium,expect} from '@playwright/test';
import {isolatedRuntimeAssets} from './integration-runtime-assets.ts';
import type {Page} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {activate,begin,groundWalk,hostContext,integrationUrl,rendererContext,universe} from './integration-browser-helpers.ts';
import {planTownGroundRoutes} from './town-ground-routes.ts';
import {samplePublicVillage} from '../src/shared/sample-public-village.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import {GroundWorld,STEP_HEIGHT} from '../src/shared/physics/world.ts';
import {TownResidentMotion} from '../src/shared/town-resident-motion.ts';
import {residentDialogue,townResidents,RESIDENT_INTERACT_DISTANCE,RESIDENT_INTERACT_HEIGHT} from '../src/shared/town-residents.ts';
import type {TownResidentDefinition} from '../src/shared/town-residents.ts';
import {distance,NPCS,INTERACT_DISTANCE} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {BOARD_RADIUS,HUB_DOCK} from '../src/shared/ports.ts';

/** Default: inspect the current source and print a plan, no browser/network.
 * APP_URL=http://127.0.0.1:8134 node scripts/town-resident-browser-audit.ts npc-v9
 * --run --mode=desktop|touch|both [--only=ada-shop,ivo-repair]
 * --focus-only --mode=desktop --only=nell-garden --fixture=north
 * --snapshot-file=.data/frozen.json --runtime-script=index-FROZEN.js verifies
 * the language focus regression at an already nearby existing saved pose;
 * it does not infer a route from potentially newer authoring source.
 * --capture-only captures a safe interaction-distance approach, then really
 * walks back to about 3.1 m and captures normal ground framing at 0/1/2 s;
 * it deliberately makes no claim that interaction checks passed.
 * --negative-file=.data/npc-negative-approaches.json optionally supplies real
 * walkable wall/upper-landing approaches. No test fixture or NPC is created.
 * Negative manifest: {townFingerprint,cases:[{id,residentId,kind:'wall'|'height',
 * points:Vec3[]}]}. Points start on accessible ground, include real stair
 * turns when needed, and finish at the intended counterexample. The driver
 * verifies actual height/LOS and never writes a pose or bypasses collision.
 */
const baseURL=integrationUrl();if(new URL(baseURL).port!=='8134')throw Error('Resident review is restricted to isolated 8134.');
const args=process.argv.slice(2),phase=args.find(a=>!a.startsWith('--'))??'residents-v9';
if(!/^[a-z0-9-]+$/.test(phase)||args.some(a=>a.startsWith('--')&&!/^--(run|capture-only|focus-only|mode=(desktop|touch|both)|only=[a-z0-9,-]+|fixture=[a-z0-9-]+|runtime-script=[a-zA-Z0-9._-]+|runtime-index-sha256=[a-f0-9]{64}|snapshot-file=[a-zA-Z0-9._/-]+|negative-file=[a-zA-Z0-9._/-]+)$/.test(a)))throw Error('Invalid resident audit options.');
const captureOnly=args.includes('--capture-only'),focusOnly=args.includes('--focus-only');
const mode=args.find(a=>a.startsWith('--mode='))?.slice(7)??'both',selected=args.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const snapshotFile=args.find(a=>a.startsWith('--snapshot-file='))?.slice(16),fixtureName=args.find(a=>a.startsWith('--fixture='))?.slice(10),runtimeScript=args.find(a=>a.startsWith('--runtime-script='))?.slice(17),runtimeIndexSha=args.find(a=>a.startsWith('--runtime-index-sha256='))?.slice(23);
if(snapshotFile&&(!snapshotFile.startsWith('.data/')||snapshotFile.split('/').includes('..')))throw Error('Frozen snapshots must be local .data files.');
if(focusOnly&&(captureOnly||mode!=='desktop'||!fixtureName||selected?.length!==1||!snapshotFile||!runtimeScript))throw Error('Focus-only requires one explicit desktop resident, existing fixture, frozen snapshot and runtime script.');
const town:PublicTown=snapshotFile?JSON.parse(readFileSync(snapshotFile,'utf8')) as PublicTown:samplePublicVillage(),radius=town.radius,world=new GroundWorld(snapshotFile?{id:'frozen-resident-evidence',revision:0,...town}:{id:'hub',radius,revision:0,objects:[]});
const fingerprint=createHash('sha256').update(JSON.stringify({version:town.version,objects:town.objects,blueprints:town.blueprints,routes:town.routes})).digest('hex');
const definitions=townResidents().filter(d=>d.conversational&&(!selected||selected.includes(d.id)));
if(!definitions.length||selected?.some(id=>!definitions.some(d=>d.id===id)))throw Error('Unknown core resident.');
type Fixture={name:string;position:Vec3;cookie:string};
const fixtures=JSON.parse(readFileSync('.data/village-view-fixtures.json','utf8')) as Fixture[];
if(fixtureName&&!fixtures.some(f=>f.name===fixtureName))throw Error('Unknown existing fixture.');
type NegativeCase={id:string;residentId:string;kind:'wall'|'height';points:Vec3[]};
const negativeFile=args.find(a=>a.startsWith('--negative-file='))?.slice(16);
if(negativeFile&&(negativeFile.startsWith('/')||negativeFile.split('/').includes('..')))throw Error('Negative manifest must be a local relative path.');
const negative=negativeFile?JSON.parse(readFileSync(negativeFile,'utf8')) as {townFingerprint:string;cases:NegativeCase[]}:null;
if(negative&&(negative.townFingerprint!==fingerprint||!Array.isArray(negative.cases)||negative.cases.some(c=>!c.id||!['wall','height'].includes(c.kind)||!c.points.length||c.points.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n))||Math.abs(new Vector3(...p).length()-1)>1e-5))))throw Error('Invalid or stale negative-case manifest.');
const residentPose=(definition:TownResidentDefinition)=>new TownResidentMotion(world,definition);
const feetAt=(point:Vec3)=>({position:point,radius:world.support(point,world.radius(point)+STEP_HEIGHT).radius,grounded:true,verticalSpeed:0});
function eligibility(definition:TownResidentDefinition,point:Vec3,feetRadius:number){
 const resident=residentPose(definition),start=new Vector3(...point).multiplyScalar(feetRadius+1.35),end=new Vector3(...resident.pose.position).multiplyScalar(resident.pose.radius+1.3),range=distance(point,resident.pose.position,radius),heightGap=Math.abs(feetRadius-resident.pose.radius),visible=world.cameraDistance(start,end)+.03>=start.distanceTo(end);
 return {residentValid:resident.valid,rangeMetres:range,heightGap,lineClear:visible,eligible:resident.valid&&range<=RESIDENT_INTERACT_DISTANCE&&heightGap<=RESIDENT_INTERACT_HEIGHT&&visible};
}
function candidates(definition:TownResidentDefinition){
 const up=new Vector3(...definition.position),forward=new Vector3(...definition.facing??[0,0,1]).projectOnPlane(up).normalize(),right=new Vector3().crossVectors(up,forward).normalize();
 const around=(metres:number,angle:number)=>up.clone().addScaledVector(forward,Math.cos(angle)*metres/radius).addScaledVector(right,Math.sin(angle)*metres/radius).normalize().toArray() as Vec3;
 const priority=(point:Vec3)=>distance(point,HUB_DOCK,radius)<BOARD_RADIUS+.1||Object.values(NPCS).some(n=>distance(point,n.position,radius)<INTERACT_DISTANCE+.1);
 let approach:Vec3|undefined,exit:Vec3|undefined;
 for(const reach of [1.9,1.75,1.5,1.25,1.1,.8])for(const angle of [0,.4,-.4,.8,-.8,1.2,-1.2,Math.PI]){
  if(approach)break;const point=around(reach,angle),feet=feetAt(point);if(!world.blocked(feet)&&!priority(point)&&eligibility(definition,point,feet.radius).eligible)approach=point;
 }
 for(const angle of [0,.4,-.4,.8,-.8,1.2,-1.2,Math.PI]){
  const point=around(3.1,angle),feet=feetAt(point);if(!world.blocked(feet)&&!priority(point)){exit=point;break;}
 }
 return {approach,exit};
}
const plans=definitions.map(d=>({id:d.id,names:d.name,place:d.place,...(focusOnly?{approach:undefined,exit:undefined}:candidates(d)),authoredResidentValid:focusOnly?null:residentPose(d).valid,negativeCases:negative?.cases.filter(c=>c.residentId===d.id).map(c=>({id:c.id,kind:c.kind,waypoints:c.points.length}))??[]}));
if(!args.includes('--run'))console.log(JSON.stringify({mode:'plan-only-no-browser-no-network',baseURL,townVersion:town.version,townFingerprint:fingerprint,coreResidents:plans,checks:['English and Chinese exact current-quest dialogue','Real E or touch activation, repeated activation without duplicate state changes','Close ×, Escape without menu, leave range, then reopen','Reload at saved public-ground position and compare existing identity/protected state','Real wall and elevated-landing negative walks only when final natural geometry supplies their manifest'],negativeCoverage:negative?'Explicit candidates supplied; not executed':'Wall and cross-floor browser cases remain untested until real walkable counterexamples are supplied.'},null,2));

const pose=(page:Page)=>page.locator('#world canvas').evaluate(el=>({position:JSON.parse(el.dataset.groundPosition!) as Vec3,radius:Number(el.dataset.feetRadius),grounded:el.dataset.grounded==='true',nearResident:el.dataset.nearResident??'',verticalSpeed:el.dataset.verticalSpeed===undefined?null:Number(el.dataset.verticalSpeed),head:el.dataset.cameraHead?JSON.parse(el.dataset.cameraHead) as Vec3:null,eye:el.dataset.cameraPosition?JSON.parse(el.dataset.cameraPosition) as Vec3:null,north:el.dataset.cameraHeading?JSON.parse(el.dataset.cameraHeading) as Vec3:null,support:el.dataset.groundSupport??null,scene:el.dataset.terrainId??null,playerVisible:el.dataset.playerVisible==='true'?true:el.dataset.playerVisible==='false'?false:null,cameraMode:el.dataset.cameraMode??null}));
async function faceResident(page:Page,target:Vec3,touch:boolean){
 const viewport=page.viewportSize()!,x=touch?viewport.width*.70:viewport.width*.55,y=viewport.height*.44,cdp=touch?await page.context().newCDPSession(page):null;
 try{for(let attempt=0;attempt<10;attempt++){
  const data=await page.locator('#world canvas').evaluate(el=>({position:JSON.parse(el.dataset.groundPosition!) as Vec3,north:JSON.parse(el.dataset.cameraHeading!) as Vec3})),up=new Vector3(...data.position),north=new Vector3(...data.north),toward=new Vector3(...target).projectOnPlane(up).normalize(),turn=Math.atan2(up.dot(new Vector3().crossVectors(north,toward)),north.dot(toward));
  if(Math.abs(turn)<.025)return;const amount=Math.max(-.65,Math.min(.65,turn)),end=x-amount/.004;
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:2}]});for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*step/8,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:8});await page.mouse.up();}
  await page.waitForTimeout(150);
 }}finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await cdp.detach();}else await page.mouse.up();}
}
async function run(){
 const output=join('docs/evidence/village-world',phase);if(existsSync(output))throw Error('Keep previous evidence intact; choose a new phase name.');mkdirSync(output,{recursive:true});
 const results:Record<string,unknown>[]=[],report:Record<string,unknown>={status:'running',baseURL,townVersion:town.version,townFingerprint:fingerprint,host:hostContext(),plan:plans,results,browser:'Installed Google Chrome, Playwright channel chrome',physicalPhone:false,negativeCoverage:{wall:'not-executed',height:'not-executed'},limitations:['Only existing authenticated identities on isolated 8134 are used. Every approach is actual keyboard/touch walking; no direct pose writes, new identity, teleport, collider bypass or fixture reset.','Resident interactions are local flavour; all quest/build/flight write endpoints are prohibited by the runner.','Protective state comparisons happen on the isolated identity, not the real 8098 database.','Wall/floor logic unit tests are not substituted for browser counterexamples. Absence remains visible.','This is interaction evidence, not a phone-performance or whole-town visual-coverage claim.']};
 if(snapshotFile){report.frozenSnapshot=snapshotFile;report.frozenSnapshotSha256=createHash('sha256').update(readFileSync(snapshotFile)).digest('hex');}
 if(focusOnly)report.scope='One desktop resident: actual existing saved approach, E, top language focus en/zh/en, Tab and real movement only. No authored route, reload, menu or negative-interaction coverage.';
 const save=()=>writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');save();
 const browser=await chromium.launch({channel:'chrome',headless:true});report.browserVersion=browser.version();
 try{for(const touch of mode==='desktop'?[false]:mode==='touch'?[true]:[false,true])for(const definition of definitions){
  const plan=plans.find(p=>p.id===definition.id)!,fixture=fixtureName?fixtures.find(f=>f.name===fixtureName):[...fixtures].sort((a,b)=>distance(a.position,definition.position,radius)-distance(b.position,definition.position,radius))[0];
  const name=`${touch?'touch-390':'desktop'}-${definition.id}`,context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,locale:'en-US'});
  if(!fixture?.cookie)throw Error('Existing isolated fixture missing.');await context.addCookies([{name:'little_post',value:fixture.cookie,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors:string[]=[],denied:string[]=[],badResponses:unknown[]=[],walks:unknown[]=[],checks:string[]=[],screenshots:string[]=[],negativeResults:Record<string,unknown>[]=[],writeRequests:string[]=[];
  const row:Record<string,unknown>={name,status:'running',fixture:fixture.name,errors,denied,badResponses,walks,checks,screenshots,negativeResults};results.push(row);save();
  await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url()),allowed=url.origin===baseURL&&(!url.pathname.startsWith('/api/')||r.method()==='GET'||r.method()==='POST'&&['/api/move','/api/presence'].includes(url.pathname));if(!allowed){denied.push(`${r.method()} ${url.origin}${url.pathname}`);await route.abort('blockedbyclient');}else await route.continue();});
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)badResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writeRequests.push(url.pathname);});
  const shot=async(label:string)=>{await page.waitForTimeout(250);const file=`${name}-${label}.png`;await page.screenshot({path:join(output,file)});screenshots.push(file);};
  const waypointSamples:Record<string,unknown>[]=[];row.waypointSamples=waypointSamples;
  let activeStep:Record<string,unknown>|null=null,failureProtectionCheck:(()=>Promise<Record<string,boolean>>)|null=null;
  const walkStep=async(target:Vec3,label:string,waypointIndex:number,tolerance=.18,timeoutMs=12000)=>{
   const started=Date.now(),before=await pose(page),step:Record<string,unknown>={label,waypointIndex,target,status:'walking',startedAtMs:started,before};activeStep=step;waypointSamples.push(step);
   try{await groundWalk(page,target,touch,tolerance,timeoutMs);const after=await pose(page);Object.assign(step,{status:'reached',durationMs:Date.now()-started,after,remainingMetres:distance(after.position,target,radius)});}
   catch(error){const actual=await pose(page).catch(()=>null);Object.assign(step,{status:'failed',durationMs:Date.now()-started,actual,remainingMetres:actual?distance(actual.position,target,radius):null,error:String(error)});row.failedNavigationStep=step;save();throw error;}
  };
  try{
   // Authenticate before page GET /api/state, which would create an identity
   // if a fixture were missing. No automatic replacement is allowed.
   const auth=await context.request.get('/api/universe');if(auth.status()!==200)throw Error('Existing isolated fixture did not authenticate; page was not opened.');
   const initial=await auth.json() as Awaited<ReturnType<typeof universe>>;
   const assets=await isolatedRuntimeAssets(context.request,baseURL);
   if(runtimeIndexSha)expect(assets.index.sha256,'Frozen runtime HTML SHA').toBe(runtimeIndexSha);
   if(runtimeScript)expect(assets.assets.some(a=>a.path===`/assets/${runtimeScript}`),'Expected frozen runtime entry script').toBe(true);
   if(report.runtimeAssets)expect(assets,'Served assets must remain frozen across all resident rows').toEqual(report.runtimeAssets);
   else{report.runtimeAssets=assets;writeFileSync(join(output,'runtime-assets.json'),JSON.stringify(assets,null,2)+'\n');}row.runtimeIndexSha256=assets.index.sha256;save();
   row.questAtStart={quest:initial.player.quest,deliveries:initial.player.deliveries};
   if(initial.currentPlanet.id!=='hub'||initial.player.flight.mode!=='ground'||initial.player.location?.kind==='interior')throw Error('Fixture is not on public exterior ground; its saved visit is preserved.');
   const readLibrary=async()=>{const r=await context.request.get('/api/blueprints');expect(r.status()).toBe(200);return JSON.stringify(await r.json());};
   const originalLibrary=await readLibrary(),protect=(u:typeof initial)=>JSON.stringify({character:u.player.character,quest:u.player.quest,deliveries:u.player.deliveries,home:u.player.home,ship:u.player.ship,ownedPlanetId:u.ownedPlanetId,objects:u.currentPlanet.objects,blueprints:u.currentPlanet.blueprints});
   const protectedBefore=protect(initial),cookieBefore=(await context.cookies(baseURL)).find(c=>c.name==='little_post')?.value;
   failureProtectionCheck=async()=>({sameIdentity:!!cookieBefore&&(await context.cookies(baseURL)).find(c=>c.name==='little_post')?.value===cookieBefore,sameQuestHomeShipOwnershipAndObjects:protect(await universe(page))===protectedBefore,sameBlueprintNamesGroupsAndContents:await readLibrary()===originalLibrary});
   await begin(page,touch);await page.waitForTimeout(1000);row.renderer=await rendererContext(page);
   const counts=JSON.parse(await page.locator('#world canvas').getAttribute('data-public-counts')??'null') as {objects:number}|null;expect(counts?.objects,'Runtime scene must match the selected town snapshot object count').toBe(town.objects.length);
   if(!focusOnly&&(!plan.approach||!plan.exit||!plan.authoredResidentValid))throw Error('Current authored resident has no valid ground approach/exit; adjust the actual place instead of moving a fixture through geometry.');
   const navigate=async(point:Vec3,label:string)=>{
    const start=await pose(page),navigation=planTownGroundRoutes({town,starts:[{id:'actual-saved-feet',point:start.position}],targets:[{id:label,point}],spacing:.75,maxExpandedPerTarget:18000}),route=navigation.routes[0];
    walks.push({label,status:route.status,plannedLengthMetres:route.lengthMetres,expanded:route.expanded,blockedPoints:route.blockedPoints,points:route.route?.points});save();
    if(!route.route||route.status!=='connected')throw Error(`No validated real-control approach: ${label} (${route.status}).`);
    for(const [index,target]of route.route.points.slice(1).entries())await walkStep(target,label,index+1);
   };
   if(focusOnly){row.initialActualPose=await pose(page);expect((await pose(page)).nearResident,'Focus case requires the existing saved position to be actually near this runtime resident').toBe(definition.id);}
   else{await navigate(plan.approach!,'resident-approach');await expect.poll(async()=>(await pose(page)).nearResident).toBe(definition.id);await faceResident(page,definition.position,touch);}await shot('approach');
   if(captureOnly){
    await navigate(plan.exit!,'full-body-place-view');await faceResident(page,definition.position,touch);
    row.normalGroundFraming={interactionApproach:plan.approach,fullBodyPlaceView:plan.exit,actualRangeMetres:distance((await pose(page)).position,definition.position,radius),camera:'Actual normal follow camera, oriented through mouse/touch drag; no camera settings or model dimensions changed.'};
    const started=Date.now(),moments:unknown[]=[];
    for(const target of [0,1000,2000]){await page.waitForTimeout(Math.max(0,target-(Date.now()-started)));const file=`${name}-ground-${target/1000}s.png`;await page.screenshot({path:join(output,file)});screenshots.push(file);moments.push({requestedMs:target,actualMs:Date.now()-started,feet:await pose(page)});}
    const after=await universe(page);expect(protect(after)===protectedBefore,'Protected state unchanged after photo approach').toBe(true);expect(await readLibrary()===originalLibrary).toBe(true);
    expect((await context.cookies(baseURL)).find(c=>c.name==='little_post')?.value===cookieBefore).toBe(true);
    expect(denied).toEqual([]);expect(errors).toEqual([]);expect(badResponses).toEqual([]);row.moments=moments;row.protection={sameIdentity:true,sameQuestHomeShipOwnershipAndObjects:true,sameBlueprintNamesGroupsAndContents:true};row.status='captured-visual-review-pending';row.interactions='not-executed-capture-only';continue;
   }
   const open=async()=>{if(touch)await activate(page,'#interact',true);else await page.keyboard.press('e');await expect(page.locator('#conversation')).toBeVisible();await expect(page.locator('#conversation')).toHaveAttribute('data-resident',definition.id);};
   await open();const topLanguage=page.locator('.minimal-bar .language-select'),topWritesStart=writeRequests.length,languageSamples:unknown[]=[];
   await topLanguage.focus();await expect(topLanguage).toBeFocused();await page.waitForTimeout(250);
   await expect(page.locator('#conversation')).toBeVisible();await expect(page.locator('#conversation')).toHaveAttribute('data-resident',definition.id);
   if(focusOnly)await shot('top-language-focused');
   for(const [index,language]of (['en','zh','en'] as const).entries()){
    await topLanguage.selectOption(language);await page.waitForTimeout(250);await expect(topLanguage).toBeFocused();
    await expect(page.locator('#conversation')).toBeVisible();await expect(page.locator('#conversation')).toHaveAttribute('data-resident',definition.id);
    await expect(page.locator('#speaker')).toContainText(definition.name[language]);await expect(page.locator('#dialogue-text')).toHaveText(residentDialogue(definition.id,initial.player.quest,language));
    languageSamples.push({language,conversationVisible:await page.locator('#conversation').isVisible(),resident:await page.locator('#conversation').getAttribute('data-resident'),speaker:await page.locator('#speaker').textContent(),dialogue:await page.locator('#dialogue-text').textContent(),feet:await pose(page)});
    if(focusOnly)await shot(`top-language-${index}-${language}`);
   }
   const languageWrites=writeRequests.slice(topWritesStart);expect(languageWrites.filter(path=>!['/api/move','/api/presence'].includes(path)),'Language controls cannot write quest/build/identity state').toEqual([]);
   row.topLanguageFocus={focusedWaitMs:250,sequence:['en','zh','en'],samples:languageSamples,sameResidentThroughout:true,conversationStayedOpen:true,apiWritePaths:languageWrites,writeMeaning:'Only ordinary movement-save/presence background traffic is permitted; all quest/build/identity writes fail the runner.'};
   await topLanguage.press('Tab');await expect(topLanguage).not.toBeFocused();
   if(focusOnly){
    const before=await pose(page);await page.keyboard.down('w');try{await page.waitForTimeout(140);}finally{await page.keyboard.up('w');}await page.waitForTimeout(450);
    const after=await pose(page),movedMetres=distance(before.position,after.position,radius);row.postTabMovement={input:'W held 140 ms, released, telemetry settled 450 ms',before,after,movedMetres};expect(movedMetres,'Real movement resumes after Tab moves focus out of the select').toBeGreaterThan(.08);await shot('after-tab-walk');
    await expect.poll(async()=>distance((await universe(page)).player.position,(await pose(page)).position,radius),{timeout:5000}).toBeLessThan(.15);
    row.protection=await failureProtectionCheck();expect(Object.values(row.protection as Record<string,boolean>).every(Boolean)).toBe(true);expect(denied).toEqual([]);expect(errors).toEqual([]);expect(badResponses).toEqual([]);
    if(await page.locator('#conversation').isVisible())await activate(page,'#close-conversation',touch);checks.push('Actual E opened same resident; focused >250 ms; en/zh/en exact text in place; Tab released focus and real W movement resumed; same identity and protected save content');row.status='passed-top-language-focus-regression';continue;
   }
   await activate(page,'#close-conversation',touch);
   checks.push('Top language focus >150 ms retained the same conversation; en/zh/en changed text in place with no quest/build/identity writes; Tab released input focus');
   for(const language of ['en','zh'] as const){
    if(await page.locator('#menu-dialog').isVisible())await activate(page,'#resume',touch);
    await activate(page,'#open-menu',touch);await page.locator('#menu-dialog .language-select').selectOption(language);await activate(page,'#resume',touch);
    await expect(page.locator('html')).toHaveAttribute('lang',language==='zh'?'zh-CN':'en');
    await open();await expect(page.locator('#speaker')).toContainText(definition.name[language]);await expect(page.locator('#dialogue-text')).toHaveText(residentDialogue(definition.id,initial.player.quest,language));
    for(let repeat=0;repeat<3;repeat++)await open();await expect(page.locator('#conversation:visible')).toHaveCount(1);await shot(language+'-repeat');
    await activate(page,'#close-conversation',touch);await expect(page.locator('#conversation')).toBeHidden();
    await open();await page.keyboard.press('Escape');await expect(page.locator('#conversation')).toBeHidden();await expect(page.locator('#menu-dialog')).not.toBeVisible();
    await open();await navigate(plan.exit!,language+'-leave-range');await expect(page.locator('#conversation')).toBeHidden();expect(distance((await pose(page)).position,definition.position,radius)).toBeGreaterThan(RESIDENT_INTERACT_DISTANCE);await faceResident(page,definition.position,touch);await shot(language+'-range-exit');
    await navigate(plan.approach!,language+'-return');await open();await expect(page.locator('#dialogue-text')).toHaveText(residentDialogue(definition.id,initial.player.quest,language));await activate(page,'#close-conversation',touch);
    checks.push(`${language}: exact dialogue, ${touch?'touch':'E'}, three repeats, ×, Escape, leave-range close and reopen`);
   }
   for(const candidate of negative?.cases.filter(c=>c.residentId===definition.id)??[]){
    const result:Record<string,unknown>={id:candidate.id,kind:candidate.kind,status:'running'};negativeResults.push(result);
    await navigate(candidate.points[0],candidate.id+'-ground-approach');
    for(const [index,point]of candidate.points.slice(1).entries())await walkStep(point,candidate.id+'-negative-path',index+1,.14,14000);
    const feet=await pose(page),proof=eligibility(definition,feet.position,feet.radius);result.proof=proof;result.grounded=feet.grounded;
    expect(proof.rangeMetres,'A negative case must still be horizontally in interaction range').toBeLessThan(RESIDENT_INTERACT_DISTANCE-.05);
    if(candidate.kind==='wall'){expect(proof.heightGap).toBeLessThanOrEqual(RESIDENT_INTERACT_HEIGHT);expect(proof.lineClear).toBe(false);}
    else expect(proof.heightGap).toBeGreaterThan(RESIDENT_INTERACT_HEIGHT+.08);
    await expect.poll(async()=>(await pose(page)).nearResident).not.toBe(definition.id);
    // Another action winning priority is not proof of this resident's guard.
    await expect(page.locator('#board-ship')).not.toBeVisible();await expect(page.locator('#interact')).not.toBeVisible();
    await page.keyboard.press('e');await expect(page.locator('#conversation')).toBeHidden();await expect(page.locator('dialog[open]')).toHaveCount(0);await shot(candidate.id);result.status='passed-actual-negative-walk';
    (report.negativeCoverage as Record<string,string>)[candidate.kind]='executed';
    // Return down the same authored stair/corner sequence before asking the
    // ground-only route planner for another destination.
    for(const [index,point]of [...candidate.points].reverse().slice(1).entries())await walkStep(point,candidate.id+'-negative-return',index+1,.14,14000);
   }
   await navigate(plan.approach!,'return-before-reload');await expect.poll(async()=>distance((await universe(page)).player.position,(await pose(page)).position,radius),{timeout:5000}).toBeLessThan(.3);
   const saved=(await universe(page)).player.position;await page.reload();await expect(page.locator('.scene-loading-overlay')).toBeHidden({timeout:45000});await expect(page.locator('#scene-sync')).toContainText(/Live|实时|已连接/);
   await expect.poll(async()=>distance((await pose(page)).position,saved,radius),{timeout:10000}).toBeLessThan(.15);
   const after=await universe(page),cookieAfter=(await context.cookies(baseURL)).find(c=>c.name==='little_post')?.value;
   expect(!!cookieBefore&&cookieAfter===cookieBefore,'Same existing anonymous identity after reload').toBe(true);
   expect(protect(after)===protectedBefore,'Quest, home, ship, ownership and public objects unchanged').toBe(true);expect(await readLibrary()===originalLibrary,'Blueprint labels, groups and contents unchanged').toBe(true);
   await open();await expect(page.locator('#dialogue-text')).toHaveText(residentDialogue(definition.id,initial.player.quest,'zh'));await shot('reload-zh');await activate(page,'#close-conversation',touch);
   row.protection={sameIdentity:true,sameQuestAndDeliveries:true,sameHomeShipAndOwnership:true,sameObjectsAndBlueprints:true,sameBlueprintNamesAndGroups:true,savedPositionRestored:true};checks.push('Reload restored the same identity, saved position, Chinese preference, quest, home/ship and blueprint labels/groups');
   expect(denied).toEqual([]);expect(errors).toEqual([]);expect(badResponses).toEqual([]);row.status='passed-core-interactions';
  }catch(error){
   row.status='failed';row.failure=String(error);row.failureTelemetry=await pose(page).catch(()=>null);row.lastNavigationStep=activeStep;await shot('failure').catch(()=>{});
   // A failed route still preserves and checks the same protected save. This
   // is a GET-only comparison, never a reset or a replacement identity.
   if(failureProtectionCheck)try{row.failureProtection=await failureProtectionCheck();}catch(protectionError){row.failureProtection={status:'could-not-verify',error:String(protectionError)};}
  }
  finally{await page.goto('about:blank').catch(()=>{});await context.close();save();console.log(JSON.stringify({name,status:row.status,failure:row.failure,checks:checks.length}));}
 }}finally{
  const corePassed=results.length===definitions.length*(mode==='both'?2:1)&&results.every(r=>r.status==='passed-core-interactions'),coverage=report.negativeCoverage as Record<string,string>;
  report.status=focusOnly&&results.length===1&&results[0].status==='passed-top-language-focus-regression'?'passed-top-language-focus-regression':captureOnly&&results.length===definitions.length*(mode==='both'?2:1)&&results.every(r=>r.status==='captured-visual-review-pending')?'captured-visual-review-pending':corePassed?(coverage.wall==='executed'&&coverage.height==='executed'?'interaction-checks-passed':'core-passed-negative-browser-coverage-incomplete'):'failed-or-incomplete';save();await browser.close();
 }
 if(!['interaction-checks-passed','captured-visual-review-pending','passed-top-language-focus-regression'].includes(String(report.status)))process.exitCode=1;
}
if(args.includes('--run'))await run();
