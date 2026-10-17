import { expect, it } from 'vitest';
import * as T from 'three';
import { MAIN_PLANET_LEDGER, mainPlanetNetwork } from '../src/shared/planet-plan/main-planet.ts';
import { createVillagePolish, publicVillagePolishSites, VILLAGE_POLISH_BUDGET } from '../src/client/village-polish.ts';

it('binds focus signs to existing entries, caps draw calls and keeps the shared layout immutable', () => {
  const before = JSON.stringify(MAIN_PLANET_LEDGER), networkBefore = JSON.stringify(mainPlanetNetwork().junctions);
  const sites = publicVillagePolishSites(); expect(sites).toHaveLength(3);
  expect(sites.every(site => MAIN_PLANET_LEDGER.doorPaths.some(d => d.lot === site.id && JSON.stringify(d.from) === JSON.stringify(site.position)))).toBe(true);
  const parent = new T.Group(), polish = createVillagePolish(parent, { surfacePoint: (p, offset = 0) => p.clone().multiplyScalar(21.6 + offset) });
  polish.frame({ planetId: 'hub', radius: 21.6, quality: 'smooth' });
  expect(polish.diagnostics.sites).toBe(3); expect(polish.diagnostics.drawCalls).toBeLessThanOrEqual(VILLAGE_POLISH_BUDGET.drawCalls);
  const fine = polish.root.getObjectByName('village-focus-fine-relief')!; expect(fine.visible).toBe(false);
  polish.frame({ planetId: 'hub', radius: 21.6, quality: 'beautiful', time: 2 }); expect(fine.visible).toBe(true);
  expect(polish.diagnostics.collision).toBe(false); expect(polish.diagnostics.animation).toBe(true);
  polish.frame({ planetId: 'hub', radius: 21.6, quality: 'beautiful', reducedMotion: true, time: 3 }); expect(polish.diagnostics.animation).toBe(false);
  expect(JSON.stringify(MAIN_PLANET_LEDGER)).toBe(before); expect(JSON.stringify(mainPlanetNetwork().junctions)).toBe(networkBefore);
  polish.frame({ planetId: 'unrelated-home', radius: 10, quality: 'standard' }); expect(polish.diagnostics.sites).toBe(0);
  polish.dispose(); expect(parent.children).toHaveLength(0);
});
