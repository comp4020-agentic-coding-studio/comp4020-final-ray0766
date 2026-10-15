// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Universe } from '../src/shared/planets.ts';
import { TeleportStations } from '../src/client/teleport-station.ts';
import { setLanguage } from '../src/client/i18n.ts';
vi.mock('../src/shared/teleport.ts', () => ({ STATION_REACH: 2, stationSites: () => [{ interact: [0, 1, 0] }] }));
vi.mock('../src/shared/planet-plan/compositions.ts', () => ({ TELEPORT_STATION: { blueprint: {} } }));
beforeEach(() => {
  document.body.innerHTML = '<button id="claim-planet"></button><div id="boarding-prompt"></div><button id="guide-port"></button>';
  setLanguage('en');
});
function fixture(ownedPlanetId: string | null = null, current = 'hub') {
  const bridge = { teleport: vi.fn(), preview: vi.fn(), confirm: vi.fn(), ghost: vi.fn(), apply: vi.fn(), notice: vi.fn() };
  const gate = new TeleportStations(bridge);
  const universe = { ownedPlanetId, currentPlanet: { id: current, kind: current === 'hub' ? 'hub' : 'garden', revision: 0, mine: current === ownedPlanetId }, player: { flight: { mode: 'ground' } }, planets: [{ id: 'hub', kind: 'hub' }] } as Universe;
  gate.receive(universe); gate.frame([0, 1, 0], 10, true); return { gate, bridge };
}
it('explains a missing home in both languages, routes to the existing ship guide, and never claims or travels', async () => {
  const find = vi.fn(); document.getElementById('guide-port')!.onclick = find;
  const { gate, bridge } = fixture();
  expect(document.getElementById('teleport-prompt')!.hidden).toBe(false);
  expect(document.getElementById('teleport-home-help')!.textContent).toContain('Pause → Make this my planet');
  expect(document.getElementById('teleport-go')!.hidden).toBe(true); expect(gate.canUse).toBe(false);
  setLanguage('zh'); expect(document.getElementById('teleport-home-help')!.textContent).toContain('还没有认领家园');
  document.getElementById('teleport-find-ship')!.click(); expect(find).toHaveBeenCalledOnce();
  await gate.use(); expect(bridge.teleport).not.toHaveBeenCalled(); expect(bridge.confirm).not.toHaveBeenCalled();
  expect(bridge.apply).not.toHaveBeenCalled();
  gate.frame([0, -1, 0], 10, true); expect(document.getElementById('teleport-prompt')!.hidden).toBe(true);
});
it('keeps an owner’s existing gate action and keeps a neighbour’s gate unavailable', () => {
  const { gate } = fixture('p-home'); expect(gate.canUse).toBe(true);
  expect(document.getElementById('teleport-home-help')!.hidden).toBe(true);
  expect(document.getElementById('teleport-go')!.hidden).toBe(false);
  document.body.innerHTML = '<button id="claim-planet"></button><div id="boarding-prompt"></div>';
  const visitor = fixture('p-home', 'p-neighbour'); expect(visitor.gate.canUse).toBe(false);
  expect(document.getElementById('teleport-prompt')!.hidden).toBe(true);
});
