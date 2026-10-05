import { test,expect } from '@playwright/test';
import { visit,claimAndBuild,readUniverse,menuAction,closeVisit } from './flight-helper.ts';
test.setTimeout(240000);
test('player places the shared cabin, deck and service light; refresh and visitor remain authoritative',async({browser})=>{
  const ownerContext=await browser.newContext({viewport:{width:1920,height:1080}}),owner=await ownerContext.newPage();const errors:string[]=[];owner.on('pageerror',e=>errors.push(e.message));
  await owner.goto('/');await owner.getByRole('button',{name:'Let’s wander'}).click();const target=await visit(owner);await claimAndBuild(owner);await owner.waitForTimeout(1300);
  const positions:[[number,number],...[number,number][]]=[[820,740],[1130,755],[895,810],[1250,655],[740,710],[950,830],[1110,550],[730,550]];
  for(const [count,kind] of ['cottage','path','lamp'].entries()){
    await owner.getByRole('button',{name:`Add ${kind}`,exact:true}).click();let placed=false;
    for(const [x,y]of positions){await owner.mouse.click(x,y);if(await owner.locator('#save-object').isEnabled()){await owner.locator('#save-object').click();placed=true;break;}}
    expect(placed).toBe(true);await expect(owner.locator('#planet-count')).toHaveText(`${count+1} / 64 objects`);
  }
  const saved=(await readUniverse(owner)).currentPlanet.objects;expect(saved.map(o=>o.kind)).toEqual(['cottage','path','lamp']);await expect(owner.locator('canvas')).toHaveAttribute('data-placed-asset-kit','sunseed-structure/1');await owner.screenshot({path:'docs/evidence/round-6/player-shared-kit.png'});
  await owner.locator('#finish-building').click();await owner.reload();expect((await readUniverse(owner)).currentPlanet.objects).toEqual(saved);await expect(owner.locator('canvas')).toHaveAttribute('data-placed-asset-kinds','cottage,path,lamp');
  const visitorContext=await browser.newContext({viewport:{width:1000,height:800}}),visitor=await visitorContext.newPage();visitor.on('pageerror',e=>errors.push(e.message));await visitor.goto('/');await visitor.getByRole('button',{name:'Let’s wander'}).click();await visit(visitor,target);
  await expect(visitor.locator('canvas')).toHaveAttribute('data-placed-asset-kinds','cottage,path,lamp');expect((await readUniverse(visitor)).currentPlanet.objects).toEqual(saved);
  const denied=await visitor.request.post('/api/objects/update',{data:{planetId:target,objectId:saved[0].id,position:saved[0].position,rotation:Math.PI,expectedVersion:saved[0].version}});expect(denied.status()).toBe(403);
  await menuAction(owner,'build-mode');await owner.getByLabel('Select a saved object').selectOption(saved[2].id);await owner.locator('#rotate-object').click();await owner.locator('#save-object').click();await expect.poll(async()=>(await readUniverse(visitor)).currentPlanet.objects[2].version).toBe(2);await visitor.screenshot({path:'docs/evidence/round-6/visitor-shared-kit.png'});
  expect(errors).toEqual([]);await closeVisit(ownerContext);await closeVisit(visitorContext);
});
