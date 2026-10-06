import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { closeVisit, menuAction, openMenu, readUniverse, visit, walkToPort } from './flight-helper.ts';
import { normalize } from '../../src/shared/world.ts';

// Run once against a fresh temporary database after all worker patches are applied.
const evidence = process.env.INTEGRATION_EVIDENCE ?? 'docs/evidence/combined-integration';
test.use({ trace: 'off' });
test('combined save, sync, building and visible phone boarding smoke', async ({ browser }) => {
  test.setTimeout(300_000); mkdirSync(evidence, { recursive: true });
  const contexts: BrowserContext[] = [], errors: string[] = [], checks: string[] = [];
  const conflicts: { status: number; message: string }[] = [];
  let page: Page | undefined, releaseMove: (() => void) | undefined, releaseUniverse: (() => void) | undefined;
  const record = (status: string, error?: unknown) => writeFileSync(`${evidence}/result.json`, JSON.stringify({
    status, checks, pageErrors: errors, conflicts, browser: browser.version(),
    viewports: [{ width: 1600, height: 1000 }, { width: 390, height: 844 }],
    fixtures: 'Fresh temporary server DB and two browser identities. Real UI travel, claim, workshop saves and placement. A visitor movement request and old universe reply are delayed while an owner API fixture changes the scene, to exercise the real server 409 fence and stale reply recovery. No player teleport, state injection or saved cookies.',
    error: error ? String(error) : undefined,
  }, null, 2) + '\n');
  const check = (value: string) => { checks.push(value); console.log('Verified:', value); record('incomplete'); };
  async function reachable(target: Page, selector: string) {
    const control = target.locator(selector); await expect(control).toBeVisible(); await control.scrollIntoViewIfNeeded();
    expect(await control.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  }
  async function showTips(target: Page) {
    await openMenu(target); await target.locator('#help').click(); await target.locator('#show-first-visit-tips').click();
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch: true }); contexts.push(context);
    page = await context.newPage(); const primary = page; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await page.getByRole('button', { name: 'Fern A little leafy' }).click(); await page.getByRole('button', { name: 'Let’s wander' }).click();
    await expect(page.locator('#scene-sync')).toContainText('Live');
    await expect.poll(async () => Number(await primary.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
    const tip = page.locator('#first-visit-tip'); await expect(tip).toBeVisible({ timeout: 15000 });
    await tip.getByRole('button', { name: 'Skip tips' }).click(); await expect(tip).not.toBeVisible(); await showTips(page); await expect(tip).toBeVisible();
    const observerContext = await browser.newContext({ viewport: { width: 1000, height: 700 } }); contexts.push(observerContext);
    const observer = await observerContext.newPage(); observer.on('pageerror', e => errors.push(e.message));
    await observer.goto('/'); await observer.getByRole('button', { name: 'Let’s wander' }).click();
    await expect(page.locator('#world canvas')).toHaveAttribute('data-visitors', '1', { timeout: 8000 });
    check('Rendered desktop, skip/help return and two independent identities with live presence');

    const planet = await visit(page); await openMenu(page); await expect(tip).toHaveAttribute('data-step', 'claim');
    await reachable(page, '#claim-planet'); await page.locator('#claim-planet').click(); await expect(tip).toHaveAttribute('data-step', 'build');
    await visit(observer, planet); await expect(observer.locator('#world canvas')).toHaveAttribute('data-visitors', '1', { timeout: 8000 });
    await menuAction(page, 'open-workshop');
    page.once('dialog', dialog => dialog.accept()); await page.locator('#ws-new').click();
    await page.locator('#ws-tool').selectOption('floor.deck'); await page.locator('#ws-add').click();
    await page.locator('#ws-name').fill('Combined smoke '); await page.locator('#ws-name').pressSequentially('wasderm');
    await expect(page.locator('#star-map')).not.toBeVisible(); await page.locator('#ws-save').click(); await expect(page.locator('#ws-place')).toBeEnabled();
    await page.locator('#ws-x').selectOption({ value: '1' }); await expect(page.locator('#ws-x')).toHaveValue('1'); await page.locator('#ws-add').click(); await expect(page.locator('#ws-count')).toContainText('2 / 120 parts');
    await page.locator('#ws-save').click(); await expect(page.locator('#ws-place')).toBeEnabled();
    let entries = await (await page.request.get('/api/blueprints')).json();
    expect(entries).toHaveLength(1); expect(entries[0].version).toBe(2); expect(entries[0].blueprint.parts).toHaveLength(2);
    expect((await readUniverse(page)).currentPlanet.objectCount).toBe(0);
    await page.screenshot({ path: `${evidence}/desktop-unplaced-blueprint-saved.png` });
    await page.locator('#ws-close').click(); await page.reload(); await expect(page.locator('#scene-sync')).toContainText('Live');
    entries = await (await page.request.get('/api/blueprints')).json(); expect(entries[0].version).toBe(2); expect(entries[0].blueprint.parts).toHaveLength(2);
    expect((await readUniverse(page)).player.character).toBe('fern'); check('UI edits and saves unplaced geometry twice; version 2, geometry and coat survive refresh');

    // An old universe reply remains in flight while the owner changes geometry
    // and the visitor's stale movement reaches the real server. Reconnect /state
    // may recover first; releasing that old reply must not undo the new state.
    let held = false, oldSceneRevision = -1;
    const universeGate = new Promise<void>(resolve => { releaseUniverse = resolve; });
    await observer.route('**/api/universe', async route => {
      if (oldSceneRevision < 0) {
        const response = await route.fetch(); oldSceneRevision = (await response.json()).currentPlanet.revision;
        await universeGate; await route.fulfill({ response });
      } else await route.continue();
    });
    await expect.poll(() => oldSceneRevision).toBeGreaterThanOrEqual(0);
    const gate = new Promise<void>(resolve => { releaseMove = resolve; });
    await observer.route('**/api/move', async route => { if (!held) { held = true; await gate; } await route.continue(); });
    const conflict = observer.waitForResponse(response => response.url().endsWith('/api/move') && response.status() === 409);
    await observer.keyboard.down('w'); await expect.poll(() => held).toBe(true); await observer.keyboard.up('w');
    const objectId = randomUUID();
    const created = await page.request.post('/api/objects/create', { data: { planetId: planet, objectId, kind: 'lamp', position: normalize([-.7, 1, .4]), rotation: 0 } });
    expect(created.status()).toBe(200); const newSceneRevision = (await created.json()).currentPlanet.revision;
    expect(newSceneRevision).toBeGreaterThan(oldSceneRevision);
    releaseMove!(); releaseMove = undefined;
    const rejection = await conflict, rejected = await rejection.json(); conflicts.push({ status: rejection.status(), message: rejected.error });
    expect(rejected.error).toContain('newer ground position'); await observer.unroute('**/api/move');
    await expect(observer.locator('#notice')).toContainText('newer ground position');
    await expect(observer.locator('#save-status')).toHaveText('Progress saved', { timeout: 8000 });
    releaseUniverse!(); releaseUniverse = undefined;
    await expect(observer.locator('#planet-card')).toHaveAttribute('data-revision', String(newSceneRevision), { timeout: 8000 });
    await observer.unroute('**/api/universe');
    const resumed = observer.waitForResponse(response => response.url().endsWith('/api/move') && response.status() === 200);
    await observer.keyboard.down('w'); await observer.waitForTimeout(600); await observer.keyboard.up('w'); await resumed;
    await expect.poll(async () => await observer.locator('#notice').isHidden() || !(await observer.locator('#notice').textContent())?.includes('newer ground position'), { timeout: 8000 }).toBe(true);
    expect((await observer.request.post('/api/objects/delete', { data: { planetId: planet, objectId, expectedVersion: 1 } })).status()).toBe(403);
    await observer.screenshot({ path: `${evidence}/desktop-visitor-recovered.png` });
    await closeVisit(observerContext); contexts.pop();
    await openMenu(page);
    expect((await page.request.post('/api/objects/delete', { data: { planetId: planet, objectId, expectedVersion: 1 } })).status()).toBe(200);
    await expect(page.locator('#planet-count')).toHaveText('0 / 64 objects', { timeout: 8000 });
    check('Two identities: owner changes scene, visitor gets real 409, reconnect recovers before delayed old universe reply, next movement saves, obsolete notice clears and visitor delete is 403');

    await page.locator('#build-mode').click(); await expect(tip).toHaveAttribute('data-step', 'place');
    await page.locator('#built-list').focus(); await page.keyboard.press('m'); await expect(page.locator('#star-map')).not.toBeVisible();
    await page.keyboard.press('Control+m'); await expect(page.locator('#star-map')).not.toBeVisible();
    await page.screenshot({ path: `${evidence}/desktop-builder.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Add tree', exact: true }).tap();
    for (const [x, y] of [[295, 350], [85, 350], [195, 310]]) { await page.touchscreen.tap(x, y); if (await page.locator('#save-object').isEnabled()) break; }
    await expect(page.locator('#save-object')).toBeEnabled(); await reachable(page, '#save-object'); await reachable(page, '#cancel-object');
    const turn = await page.locator('#placement-status').textContent(); await page.locator('#built-list').focus(); await page.keyboard.press('r'); await expect(page.locator('#placement-status')).toHaveText(turn!);
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#cancel-object').tap(); await expect(page.locator('#save-object')).toBeEnabled();
    await tip.getByRole('button', { name: 'Skip tips' }).tap(); await expect(page.locator('#save-object')).toBeEnabled();
    await page.locator('#save-object').tap(); await expect.poll(async () => (await readUniverse(primary)).currentPlanet.objectCount).toBe(1);
    await showTips(page); await expect(tip).toHaveAttribute('data-step', 'saved'); await reachable(page, '#finish-building');
    await page.locator('#finish-building').tap(); await menuAction(page, 'guide-port'); await walkToPort(page, true);
    await expect(page.locator('#notice')).not.toBeVisible({ timeout: 15000 });
    await expect(tip).toHaveAttribute('data-step', 'board'); await expect(tip).toBeVisible({ timeout: 15000 });
    await reachable(page, '#board-ship'); await reachable(page, '#first-visit-tip');
    const bounds = await tip.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `${evidence}/phone-boarding-visible.png` });
    check('390 px touch draft cancellation/skip preserve controls; saved build guides return; boarding tip is actually visible after notice expiry and both tip/button are hit-testable');
    await page.locator('#board-ship').tap(); await page.locator('#cancel-flight').tap(); expect((await readUniverse(page)).player.flight.mode).toBe('ground');
    await page.locator('#board-ship').tap(); await page.keyboard.press('Escape'); await expect(page.locator('#flight-dialog')).not.toBeVisible();
    await page.locator('#board-ship').tap(); await page.locator('#confirm-flight').tap(); await expect.poll(async () => (await readUniverse(primary)).player.flight.mode).toBe('space');
    await expect(tip).not.toBeVisible(); check('Stay here and Escape cancel boarding; actual launch completes first-visit guidance');
    expect(errors).toEqual([]); record('passed');
  } catch (error) { await page?.screenshot({ path: `${evidence}/failure.png` }).catch(() => {}); record('failed', error); throw error; }
  finally { releaseMove?.(); releaseUniverse?.(); for (const context of contexts) await closeVisit(context).catch(() => {}); }
});
