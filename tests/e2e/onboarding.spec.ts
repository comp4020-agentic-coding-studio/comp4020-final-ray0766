import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { closeVisit, openMenu, readUniverse, visit, walkToPort } from './flight-helper.ts';

// Run alone on the parent's assigned port with a fresh temporary DATABASE_PATH.
test('first-visit tips accompany real claim/build/boarding controls and can be skipped', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const tip = page.locator('#first-visit-tip');
  async function reachable(id: string) {
    const control = page.locator('#' + id); await control.scrollIntoViewIfNeeded();
    expect(await control.evaluate(node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
  }
  async function showTips() {
    await openMenu(page); await page.locator('#help').click();
    await page.getByRole('button', { name: 'Show first-visit tips' }).click();
  }
  async function capture(name: string, target: Page = page) {
    await target.screenshot({ path: info.outputPath(name + '.png') });
  }
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'Let’s wander' }).click();
    await expect(tip).toBeVisible({ timeout: 15000 });
    await expect(tip).toHaveAttribute('data-step', 'port');
    await capture('desktop-arrival');
    await tip.getByRole('button', { name: 'Skip tips' }).click();
    await expect(tip).not.toBeVisible(); await showTips();
    await expect(tip).toBeVisible();
    await visit(page); // Existing helper flies using actual keyboard controls.
    await openMenu(page); await expect(tip).toHaveAttribute('data-step', 'claim');
    await reachable('claim-planet'); await page.locator('#claim-planet').click();
    await expect(tip).toHaveAttribute('data-step', 'build');
    await reachable('build-mode'); await page.locator('#build-mode').click();
    await expect(tip).toHaveAttribute('data-step', 'place');
    await expect(tip).toHaveAttribute('data-placement', 'builder');
    await capture('desktop-first-build');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1200); // Let the real overview camera settle after resize.
    await page.getByRole('button', { name: 'Add tree', exact: true }).tap();
    await page.touchscreen.tap(295, 350);
    await expect(page.locator('#save-object')).toBeEnabled();
    await reachable('save-object'); await reachable('cancel-object');
    await capture('phone-preview-controls');
    await tip.getByRole('button', { name: 'Skip tips' }).tap();
    await expect(page.locator('#builder')).toBeVisible();
    await expect(page.locator('#save-object')).toBeEnabled();
    await page.locator('#save-object').tap();
    await expect.poll(async () => (await readUniverse(page)).currentPlanet.objectCount).toBe(1);
    await showTips(); await expect(tip).toHaveAttribute('data-step', 'saved');
    await reachable('finish-building'); await page.locator('#finish-building').tap();
    await expect(page.locator('#builder')).not.toBeVisible();
    await walkToPort(page, true);
    await expect(tip).toHaveAttribute('data-step', 'board', { timeout: 10000 });
    await expect(tip).toBeVisible({ timeout: 15000 });
    await reachable('board-ship'); await capture('phone-boarding');
    await page.locator('#board-ship').tap();
    await expect(tip).not.toBeVisible();
    await page.locator('#cancel-flight').tap();
    expect((await readUniverse(page)).player.flight.mode).toBe('ground');
    await page.locator('#board-ship').tap(); await page.keyboard.press('Escape');
    await expect(page.locator('#flight-dialog')).not.toBeVisible();
    await reachable('board-ship');
    await page.locator('#board-ship').tap(); await page.locator('#confirm-flight').tap();
    await expect.poll(async () => (await readUniverse(page)).player.flight.mode).toBe('space');
    await expect(tip).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(errors).toEqual([]);
  } finally { await closeVisit(context); }
});
