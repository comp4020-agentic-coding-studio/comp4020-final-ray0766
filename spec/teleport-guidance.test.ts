// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Universe } from '../src/shared/planets.ts';
import { TeleportStations } from '../src/client/teleport-station.ts';
import { setLanguage } from '../src/client/i18n.ts';
vi.mock('../src/shared/teleport.ts', () => ({ STATION_REACH: 2, stationSites: () => [{ interact: [0, 1, 0] }] }));
vi.mock('../src/shared/planet-plan/compositions.ts', () => ({ TELEPORT_STATION: { blueprint: {} } }));
beforeEach(() => {
  document.body.innerHTML = '<button id="claim-planet"></button><div id="boarding-prompt"></div>';
  setLanguage('en');
});
function fixture(ownedPlanetId: string | null = null, current = 'hub') {
  const bridge = { findShip:vi.fn(),teleport: vi.fn(), preview: vi.fn(), confirm: vi.fn(), ghost: vi.fn(), apply: vi.fn(), notice: vi.fn() };
  const gate = new TeleportStations(bridge);
  const universe = { ownedPlanetId, currentPlanet: { id: current, kind: current === 'hub' ? 'hub' : 'garden', revision: 0, mine: current === ownedPlanetId }, player: { flight: { mode: 'ground' } }, planets: [{ id: 'hub', kind: 'hub' }] } as Universe;
  gate.receive(universe); gate.frame([0, 1, 0], 10, true); return { gate, bridge, universe };
}
it('explains a missing home in both languages, routes to the existing ship guide, and never claims or travels', async () => {
  const { gate, bridge } = fixture();
  expect(document.getElementById('teleport-prompt')!.hidden).toBe(false);
  expect(document.getElementById('teleport-home-help')!.textContent).toContain('Pause → Make this my planet');
  expect(document.getElementById('teleport-go')!.hidden).toBe(true); expect(gate.canUse).toBe(false);
  setLanguage('zh'); expect(document.getElementById('teleport-home-help')!.textContent).toContain('还没有认领家园');
  document.getElementById('teleport-find-ship')!.click(); expect(bridge.findShip).toHaveBeenCalledOnce();
  await gate.use(); expect(bridge.teleport).not.toHaveBeenCalled(); expect(bridge.confirm).not.toHaveBeenCalled();
  expect(bridge.apply).not.toHaveBeenCalled();
  gate.frame([0, -1, 0], 10, true); expect(document.getElementById('teleport-prompt')!.hidden).toBe(true);
});
it('offers both return destinations to visitors, while preserving the owner and harbour defaults', async () => {
  const { gate, bridge, universe } = fixture('p-home', 'p-neighbour');
  expect(gate.canUse).toBe(true);
  expect(document.getElementById('teleport-go')!.textContent).toContain('Go to the main planet');
  expect(document.getElementById('teleport-home')!.hidden).toBe(false);
  expect(document.getElementById('station-setup')!.hidden).toBe(true);
  bridge.teleport.mockResolvedValue({ ...universe, currentPlanet: { ...universe.currentPlanet, id: 'p-home' } });
  document.getElementById('teleport-home')!.click(); await vi.waitFor(() => expect(bridge.apply).toHaveBeenCalledOnce());
  expect(bridge.teleport).toHaveBeenCalledWith('p-home', expect.any(String));
});

it('always offers the harbour to a homeless visitor, alongside honest home guidance', async () => {
  const { gate, bridge } = fixture(null, 'p-neighbour');
  expect(gate.canUse).toBe(true); expect(document.getElementById('teleport-go')!.hidden).toBe(false);
  expect(document.getElementById('teleport-home')!.hidden).toBe(true);
  expect(document.getElementById('teleport-home-help')!.hidden).toBe(false);
  bridge.teleport.mockRejectedValue(new Error('Offline')); await gate.use();
  expect(bridge.teleport).toHaveBeenCalledWith('hub', expect.any(String));
});

it('prevents duplicate clicks and retries a lost acknowledgement with the same request identity', async () => {
  const { gate, bridge, universe } = fixture('p-home', 'p-neighbour');
  let reject!: (e: Error) => void;
  bridge.teleport.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
  const first = gate.use('p-home'); await gate.use('hub');
  expect(bridge.teleport).toHaveBeenCalledOnce(); gate.frame([0, 1, 0], 10, true);
  expect((document.getElementById('teleport-home') as HTMLButtonElement).disabled).toBe(true);
  reject(new Error('Connection lost')); await first;
  expect(bridge.apply).not.toHaveBeenCalled(); expect(bridge.notice).toHaveBeenCalledWith('Connection lost');
  bridge.teleport.mockResolvedValue({ ...universe, currentPlanet: { ...universe.currentPlanet, id: 'p-home' } });
  await gate.use('p-home');
  expect(bridge.teleport.mock.calls[1]).toEqual(bridge.teleport.mock.calls[0]);
  expect(bridge.apply).toHaveBeenCalledOnce();
});

it('rejects arbitrary destinations and stale indoor or flight use without depending on the next frame', async () => {
  const { gate, bridge, universe } = fixture('p-home', 'p-neighbour');
  await gate.use('p-stranger'); expect(bridge.teleport).not.toHaveBeenCalled();
  gate.receive({ ...universe, player: { ...universe.player, location: { kind: 'interior' } } } as Universe);
  await gate.use(); expect(gate.canUse).toBe(false);
  gate.receive({ ...universe, player: { ...universe.player, flight: { mode: 'space' } } } as Universe);
  await gate.use(); expect(bridge.teleport).not.toHaveBeenCalled();
});

it('shows background preparation rather than the old claim instructions, then enables only a ready home gate', () => {
  const {gate,bridge}=fixture('p-home');
  const universe={ownedPlanetId:'p-home',currentPlanet:{id:'hub',kind:'hub',revision:0},planets:[{id:'hub',kind:'hub'}],player:{flight:{mode:'ground'},arrival:{version:1,homePreparation:'preparing',homePlanetId:'p-home'}}} as Universe;
  gate.receive(universe);gate.frame([0,1,0],10,true);
  expect(gate.canUse).toBe(false);expect(document.getElementById('teleport-go')!.hidden).toBe(true);
  expect(document.getElementById('teleport-find-ship')!.hidden).toBe(true);
  expect(document.getElementById('teleport-home-help')!.textContent).toContain('being prepared');
  setLanguage('zh');expect(document.getElementById('teleport-home-help')!.textContent).toContain('正在准备');
  gate.receive({...universe,player:{...universe.player,arrival:{...universe.player.arrival!,homePreparation:'retry'}}});gate.frame([0,1,0],10,true);
  expect(document.getElementById('teleport-home-help')!.textContent).toContain('重试');expect(bridge.teleport).not.toHaveBeenCalled();
  gate.receive({...universe,player:{...universe.player,arrival:{...universe.player.arrival!,homePreparation:'ready'}}});gate.frame([0,1,0],10,true);
  expect(gate.canUse).toBe(true);expect(document.getElementById('teleport-home-help')!.hidden).toBe(true);
});
