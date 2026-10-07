import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutErrors, placementProblem as partProblem } from '../../src/assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement, Rot } from '../../src/assets/claude-geometry/blueprint/model.ts';
import { structureFit, structureSize } from '../../src/shared/blueprints.ts';
import type { LibraryEntry } from '../../src/shared/blueprints.ts';
import { placementProblem } from '../../src/shared/planets.ts';
import type { PlacedObject, Universe } from '../../src/shared/planets.ts';
import { fieldOf } from '../../src/shared/terrain.ts';

const baseURL = process.env.APP_URL ?? 'http://127.0.0.1:8128';
const target = new URL(baseURL);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '8128') throw new Error('Random-home browser checks require the isolated local port 8128.');
const evidence = 'docs/evidence/home-random';
const read = async (page: Page): Promise<Universe> => (await page.request.get('/api/universe')).json();
const library = async (page: Page): Promise<LibraryEntry[]> => (await page.request.get('/api/blueprints')).json();
async function close(context: BrowserContext) {
  for (const page of context.pages()) if (!page.isClosed()) await page.goto('about:blank');
  await context.close();
}
async function begin(page: Page, touch = false) {
  await page.goto('/?measure=1');
  await expect(page.locator('#begin')).toBeVisible({ timeout: 25000 });
  if (touch) await page.locator('#begin').tap(); else await page.locator('#begin').click();
  await expect.poll(async () => (await read(page)).currentPlanet.homeManifest?.version).toBe(2);
  await expect.poll(async () => Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(1000);
  await expect(page.locator('#home-controls')).toBeVisible();
}
async function action(page: Page, id: string, touch = false) {
  const click = (selector: string) => touch ? page.locator(selector).tap() : page.locator(selector).click();
  if (await page.locator('#courier-dialog').isVisible()) await click('#begin');
  if (!await page.locator('#menu-dialog').isVisible()) await click('#open-menu');
  await click('#' + id);
}
async function renderStats(page: Page) {
  return page.locator('#world canvas').evaluate(element => ({
    drawCalls: Number(element.dataset.drawCalls), triangles: Number(element.dataset.triangles),
    quality: element.dataset.quality, width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height,
  }));
}
function assertInitial(universe: Universe) {
  const planet = universe.currentPlanet, manifest = planet.homeManifest!;
  expect(planet.mine).toBe(true);
  expect(universe.ownedPlanetId).toBe(planet.id);
  expect(universe.planets.filter(p => p.mine)).toHaveLength(1);
  expect(planet.radius).toBe(21.6);
  expect(universe.player.worldRadius).toBe(21.6);
  expect(manifest).toMatchObject({ generator: 'home-neighbourhood', version: 2, radius: 21.6, catalogueVersion: 'home-kit-v1' });
  expect(manifest.objects).toEqual(planet.objects);
  expect(planet.objects.length).toBeLessThanOrEqual(40);
  expect(planet.objects.filter(o => o.kind === 'structure').length).toBeLessThanOrEqual(4);
  expect(planet.objects.filter(object => object.id === universe.player.home!.buildingId && object.kind === 'structure')).toHaveLength(1);
  expect(manifest.homeBuildingId).toBe(universe.player.home!.buildingId);
  expect(manifest.routes.map(route => route.id)).toContain('home');
}
/** Read-only planning selects a legal cell; all mutations below use the UI. */
function ordinaryPot(universe: Universe): { object: PlacedObject; part: PartPlacement; parts: PartPlacement[] } {
  const planet = universe.currentPlanet, field = fieldOf(planet.environment, planet.radius);
  for (const object of planet.objects.filter(o => o.kind === 'structure' && o.id !== universe.player.home!.buildingId)) {
    const parts = planet.blueprints![object.blueprintHash!]!;
    for (let z = 1; z <= 3; z++) for (let x = 1; x <= 3; x++) for (const rot of [0, 1, 2, 3] as Rot[]) {
      const part: PartPlacement = { n: Math.max(...parts.map(p => p.n)) + 1, part: 'garden.pot', level: 0, x, z, rot };
      const changed = [...parts, part];
      if (partProblem(parts, part) || layoutErrors(changed).length || structureFit(changed, object.position, object.rotation, field).problem) continue;
      if (placementProblem('structure', object.position, planet.objects, object.id, structureSize(changed).radius, planet.radius)) continue;
      return { object, part, parts };
    }
  }
  throw new Error('No existing non-home structure has a legal ordinary garden-pot cell.');
}
async function editOrdinaryStructure(page: Page, before: Universe, touch: boolean, shot: string) {
  const candidate = ordinaryPot(before), entries = await library(page);
  const originalEntry = entries.find(entry => entry.hash === candidate.object.blueprintHash)!;
  expect(originalEntry).toBeTruthy();
  await action(page, 'build-mode', touch);
  await expect(page.locator('#builder')).toBeVisible();
  await page.locator('#built-list').selectOption(candidate.object.id);
  await expect(page.locator('#edit-structure')).toBeVisible();
  if (touch) await page.locator('#edit-structure').tap(); else await page.locator('#edit-structure').click();
  await expect(page.locator('#workshop')).toBeVisible();
  await expect(page.locator('#ws-name')).toHaveValue(originalEntry.blueprint.name);
  await page.locator('#ws-tool').selectOption('garden.pot');
  await page.locator('#ws-x').selectOption({ value: String(candidate.part.x) });
  await page.locator('#ws-z').selectOption({ value: String(candidate.part.z) });
  await page.locator('#ws-rot').selectOption({ value: String(candidate.part.rot) });
  if (touch) await page.locator('#ws-add').tap(); else await page.locator('#ws-add').click();
  await page.screenshot({ path: `${evidence}/${shot}-add-diagnostic.png` });
  writeFileSync(`${evidence}/${shot}-add-diagnostic.json`, JSON.stringify({candidate, status:await page.locator('#ws-status').textContent(),hint:await page.locator('#ws-hint').textContent(),tool:await page.locator('#ws-tool').inputValue(),x:await page.locator('#ws-x').inputValue(),z:await page.locator('#ws-z').inputValue(),rot:await page.locator('#ws-rot').inputValue(),level:await page.locator('#ws-level').inputValue()},null,2));
  await expect(page.locator('#ws-count')).toContainText(String(candidate.parts.length + 1) + ' / 120');
  await page.locator('#ws-tool').selectOption({ value: 'select' });
  if (touch) await page.locator('#ws-frame').tap(); else await page.locator('#ws-frame').click();
  await page.screenshot({ path: `${evidence}/${shot}-workshop.png` });
  await expect(page.locator('#ws-apply')).toBeEnabled();
  if (touch) await page.locator('#ws-apply').tap(); else await page.locator('#ws-apply').click();
  await expect(page.locator('#workshop')).not.toBeVisible();
  await expect.poll(async () => (await read(page)).currentPlanet.objects.find(o => o.id === candidate.object.id)!.version).toBe(candidate.object.version + 1);
  const saved = await read(page), changed = saved.currentPlanet.objects.find(o => o.id === candidate.object.id)!;
  expect(changed.position).toEqual(candidate.object.position);
  expect(changed.rotation).toBe(candidate.object.rotation);
  expect(changed.blueprintHash).not.toBe(candidate.object.blueprintHash);
  const savedParts = saved.currentPlanet.blueprints![changed.blueprintHash!];
  expect(savedParts).toHaveLength(candidate.parts.length + 1);
  expect(savedParts).toContainEqual(expect.objectContaining({ part: 'garden.pot', x: candidate.part.x, z: candidate.part.z, rot: candidate.part.rot }));
  expect(saved.currentPlanet.objects.map(o => o.id)).toEqual(before.currentPlanet.objects.map(o => o.id));
  expect(saved.player.home!.buildingId).toBe(before.player.home!.buildingId);
  expect(saved.player.home!.interiorId).toBe(before.player.home!.interiorId);
  expect(saved.player.home!.interior).toEqual(before.player.home!.interior);
  expect(saved.currentPlanet.homeManifest).toEqual(before.currentPlanet.homeManifest);
  const savedEntry = (await library(page)).find(entry => entry.blueprint.id === originalEntry.blueprint.id)!;
  expect(savedEntry.blueprint.name).toBe(originalEntry.blueprint.name);
  expect(savedEntry.blueprint.groups).toEqual(originalEntry.blueprint.groups);
  await page.reload();
  await expect.poll(async () => Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(1000);
  if (await page.locator('#courier-dialog').isVisible()) { if (touch) await page.locator('#begin').tap(); else await page.locator('#begin').click(); }
  const reloaded = await read(page);
  expect(reloaded.currentPlanet.objects).toEqual(saved.currentPlanet.objects);
  expect(reloaded.currentPlanet.homeManifest).toEqual(before.currentPlanet.homeManifest);
  expect(reloaded.player.home!.interiorId).toBe(before.player.home!.interiorId);
  return { objectId: changed.id, beforeParts: candidate.parts.length, afterParts: savedParts.length, beforeVersion: candidate.object.version, afterVersion: changed.version, preservedPrivateName: savedEntry.blueprint.name, part: candidate.part };
}

test('random neighbourhood: independent owners, durable seeds and real non-home kit editing', async ({ browser }) => {
  test.setTimeout(180000); mkdirSync(evidence, { recursive: true });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'en-US' })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const pageErrors: string[] = [], uiWrites: string[] = [], checks: string[] = [];
  pages.forEach((page, index) => { page.on('pageerror', error => pageErrors.push(`owner-${index + 1}: ${error.message}`)); page.on('request', request => { if (request.method() === 'POST') uiWrites.push(new URL(request.url()).pathname); }); });
  const record: Record<string, unknown> = { status: 'failed', browser: 'Installed Google Chrome via Playwright channel chrome', baseURL, viewport: '1440×1000', checks, pageErrors };
  try {
    await begin(pages[0]); await begin(pages[1]);
    const [a, b] = await Promise.all(pages.map(read));
    for (const context of contexts) expect((await context.cookies()).map(cookie => cookie.name)).toContain('little_home_sample_p8128');
    assertInitial(a); assertInitial(b);
    expect(a.ownedPlanetId).not.toBe(b.ownedPlanetId);
    expect(a.currentPlanet.homeManifest!.seed).not.toBe(b.currentPlanet.homeManifest!.seed);
    expect(a.currentPlanet.homeManifest!.objects.map(o => [o.kind, o.position])).not.toEqual(b.currentPlanet.homeManifest!.objects.map(o => [o.kind, o.position]));
    record.owners = [a, b].map(u => ({ planetId: u.currentPlanet.id, seed: u.currentPlanet.homeManifest!.seed, objects: u.currentPlanet.objects.length, structures: u.currentPlanet.objects.filter(o => o.kind === 'structure').length, homeId: u.player.home!.buildingId, interiorId: u.player.home!.interiorId }));
    checks.push('Two independent cookie contexts each own one distinct same-scale planet with a different saved seed and layout');
    for (const [index, page] of pages.entries()) {
      await page.bringToFront();
      await page.reload();
      await expect(page.locator('#home-controls')).toBeVisible();
      const fresh = await read(page), initial = index ? b : a;
      expect(fresh.currentPlanet.homeManifest).toEqual(initial.currentPlanet.homeManifest);
      expect(fresh.currentPlanet.objects).toEqual(initial.currentPlanet.objects);
      await action(page, 'view-mode');
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${evidence}/desktop-owner-${index + 1}-overview.png` });
      await action(page, 'view-mode');
    }
    checks.push('Reload preserves each concrete generated manifest, object identity and initial placement without drawing again');
    await pages[0].bringToFront();
    record.edit = await editOrdinaryStructure(pages[0], await read(pages[0]), false, 'desktop');
    checks.push('Build → selected saved non-home structure → Edit parts → ordinary garden pot → Apply updates that same object and survives reload');
    checks.push('Home building/interior IDs, furniture, initial generation manifest and private blueprint name/groups remain intact');
    expect(uiWrites).toContain('/api/blueprints/save'); expect(uiWrites).toContain('/api/objects/replace');
    await pages[0].screenshot({ path: `${evidence}/desktop-after-edit.png` });
    record.render = await renderStats(pages[0]); record.uiWriteRoutes = [...new Set(uiWrites)];
    expect(pageErrors).toEqual([]); record.status = 'passed';
  } finally {
    writeFileSync(`${evidence}/desktop-result.json`, JSON.stringify(record, null, 2));
    for (const context of contexts) await close(context);
  }
});

test('random neighbourhood 390px: actual touch controls edit and retain a saved kit structure', async ({ browser }) => {
  test.setTimeout(120000); mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await context.newPage(), pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const record: Record<string, unknown> = { status: 'failed', viewport: '390×844', realPhone: false, browser: 'Installed Google Chrome with mobile viewport and native Playwright touch input', pageErrors };
  try {
    await begin(page, true); const initial = await read(page); assertInitial(initial);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    await page.screenshot({ path: `${evidence}/phone-exterior.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    record.seed = initial.currentPlanet.homeManifest!.seed;
    record.edit = await editOrdinaryStructure(page, initial, true, 'phone');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `${evidence}/phone-after-edit.png` });
    record.render = await renderStats(page); record.checks = ['Touch begin, Build, Edit parts, Add and Apply controls', 'Ordinary saved non-home structure changes in place', 'Reload preserves its parts and the unique home/interior', 'No horizontal page overflow'];
    expect(pageErrors).toEqual([]); record.status = 'passed';
  } finally { writeFileSync(`${evidence}/phone-result.json`, JSON.stringify(record, null, 2)); await close(context); }
});

test('slow first state request stays single and retains one matching UI/API identity', async ({ browser }) => {
  test.setTimeout(90000); mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  const page = await context.newPage(), pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let requests = 0, firstSeen!: () => void, releaseFirst!: () => void;
  const seen = new Promise<void>(resolve => { firstSeen = resolve; });
  const held = new Promise<void>(resolve => { releaseFirst = resolve; });
  const record: Record<string, unknown> = { status: 'failed', browser: 'Installed Google Chrome', firstRequestHoldMs: 4100, pageErrors };
  await page.route('**/api/state', async route => {
    requests++;
    if (requests === 1) { firstSeen(); await held; }
    await route.continue();
  });
  try {
    const navigating = page.goto('/?measure=1', { waitUntil: 'domcontentloaded' });
    void navigating.catch(() => {});
    await seen;
    // The production reconnect timer fires at 2500 ms. Hold a genuine browser
    // request longer than that, without fabricating a response or player state.
    await page.waitForTimeout(4100);
    expect(requests).toBe(1);
    record.requestsBeforeRelease = requests;
    releaseFirst();
    await navigating;
    await expect(page.locator('#home-controls')).toBeVisible({ timeout: 25000 });
    if (await page.locator('#begin').isVisible()) await page.locator('#begin').click();
    const universe = await read(page); assertInitial(universe);
    await action(page, 'build-mode');
    await expect(page.locator('#builder')).toBeVisible();
    const expectedIds = universe.currentPlanet.objects.map(object => object.id).sort();
    await expect.poll(async () => page.locator('#built-list option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean).sort())).toEqual(expectedIds);
    const after = await read(page);
    expect(after.ownedPlanetId).toBe(universe.ownedPlanetId);
    expect(after.player.planetId).toBe(universe.player.planetId);
    expect(after.currentPlanet.homeManifest).toEqual(universe.currentPlanet.homeManifest);
    expect(after.planets.filter(planet => planet.mine)).toHaveLength(1);
    expect(requests).toBe(1);
    await page.screenshot({ path: `${evidence}/slow-first-state-builder.png` });
    record.requestsAfterReady = requests; record.planetId = universe.currentPlanet.id;
    record.builderObjectCount = expectedIds.length;
    record.checks = ['First state request remains the only request beyond the automatic reconnect interval', 'Real saved builder options exactly match the API object UUIDs', 'One owner planet and one persistent seed/manifest', 'No injected response and no API writes'];
    expect(pageErrors).toEqual([]); record.status = 'passed';
  } finally {
    releaseFirst();
    writeFileSync(`${evidence}/slow-first-state-result.json`, JSON.stringify(record, null, 2));
    await close(context);
  }
});
