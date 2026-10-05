import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const phone of [false, true]) test(`${phone ? 'phone' : 'desktop'} switches views and records a rendering sample`, async ({ page }) => {
  const viewport = phone ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
  await page.setViewportSize(viewport);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Let’s wander' }).click();
  await page.getByRole('button', { name: 'View planet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walking view', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/evidence/round-3/${phone ? 'phone' : 'desktop'}-planet.png` });
  await page.getByRole('button', { name: 'Walking view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View planet', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  const sample = await page.evaluate(async () => {
    const intervals: number[] = []; let last = performance.now();
    await new Promise<void>(resolve => {
      const start = last;
      function frame(now: number) {
        intervals.push(now - last); last = now;
        if (now - start < 2500) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    intervals.shift(); intervals.sort((a, b) => a - b);
    const canvas = document.querySelector('canvas')!;
    return {
      medianFrameMs: intervals[Math.floor(intervals.length / 2)],
      p95FrameMs: intervals[Math.floor(intervals.length * .95)],
      meanFps: 1000 * intervals.length / intervals.reduce((a, b) => a + b, 0),
      drawCalls: Number(canvas.dataset.drawCalls), triangles: Number(canvas.dataset.triangles),
      frames: intervals.length, browser: navigator.userAgent, devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  expect(sample.frames).toBeGreaterThan(0);
  expect(sample.drawCalls).toBeGreaterThan(0);
  expect(sample.triangles).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  expect(errors).toEqual([]);
  await mkdir('docs/evidence/round-3', { recursive: true });
  await writeFile(`docs/evidence/round-3/${phone ? 'phone' : 'desktop'}-render-sample.json`, JSON.stringify({
    measuredAt: new Date().toISOString(), note: 'Mac Chrome headless; phone is viewport emulation, not physical phone hardware. Short stationary sample after both camera transitions. FPS is evidence, not a passing threshold.', ...sample,
  }, null, 2) + '\n');
});
