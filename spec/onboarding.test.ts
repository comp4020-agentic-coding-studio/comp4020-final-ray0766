// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { firstVisitTip, mountOnboarding } from '../src/client/onboarding.ts';
import type { OnboardingContext } from '../src/client/onboarding.ts';
import type { Universe } from '../src/shared/planets.ts';

const key = 'little-worlds:first-visit:v1';
const html = readFileSync('index.html', 'utf8');
const el = (id: string) => document.getElementById(id)!;
function context(kind: 'hub' | 'garden' = 'hub', mine = false, count = 0): OnboardingContext {
  const planet = { id: kind === 'hub' ? 'hub' : 'garden-1', kind, mine, claimed: mine, objectCount: count };
  // The guide reads only planet summaries; it never needs player identity or transforms.
  const universe = { planets: [planet], currentPlanet: planet, ownedPlanetId: mine ? planet.id : null } as Universe;
  return { universe, mode: 'ground', building: false, nearDock: false, online: true };
}
let mounted: ReturnType<typeof mountOnboarding> | undefined;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.className = '';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { mounted?.dispose(); mounted = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });
const mount = (read: () => OnboardingContext | null, findShip?:()=>void) => mounted = mountOnboarding({ read,findShip });

describe('acknowledged first-visit steps', () => {
  test('arrival at an unclaimed landing beacon leads to claiming before boarding', () => {
    const state = context('garden'); state.nearDock = true;
    expect(firstVisitTip(state).id).toBe('claim');
    expect(firstVisitTip(state).text).toContain('browser');
  });
  test('claim → build preview → saved object → walk → boarding', () => {
    const state = context('garden', true);
    expect(firstVisitTip(state).id).toBe('build');
    state.building = true;
    expect(firstVisitTip(state).id).toBe('place');
    // An attempted placement/failed save leaves acknowledged objectCount at zero.
    expect(firstVisitTip(state).text).toContain('A preview is not saved');
    state.universe.currentPlanet.objectCount = 1;
    expect(firstVisitTip(state).id).toBe('saved');
    state.building = false;
    expect(firstVisitTip(state).id).toBe('port');
    state.nearDock = true;
    expect(firstVisitTip(state).id).toBe('board');
    expect(firstVisitTip(state).text).toContain('Stay here cancels');
  });
  test('visitors and existing owners are never told to claim a second home', () => {
    const state = context('garden'); state.universe.currentPlanet.claimed = true;
    expect(firstVisitTip(state).id).toBe('visitor');
    state.universe.ownedPlanetId = 'another-world';
    state.universe.currentPlanet.claimed = false;
    expect(firstVisitTip(state).id).toBe('port');
  });
});

describe('context card without changing game controls', () => {
  test('new pending arrivals never see old claim/flight tips, including after the core guide was skipped', () => {
    const state = context();
    state.universe.player = {arrival:{version:1,homePreparation:'pending',homePlanetId:null}} as unknown as Universe['player'];
    mount(() => state);
    expect(document.querySelector('#first-visit-tip')).toBeNull();
    expect(el('show-first-visit-tips').hidden).toBe(true);
    // Background completion cannot opt the new arrival into the historical guide.
    Object.assign(state.universe.player,{arrival:{version:1,homePreparation:'ready',homePlanetId:'own'}});
    mounted!.refresh();expect(document.querySelector('#first-visit-tip')).toBeNull();
  });
  test('builder card follows all controls; skip leaves building and returns focus to Done', () => {
    const state = context('garden', true); state.building = true;
    el('builder').hidden = false;
    const save = vi.fn(); el('save-object').onclick = save;
    mount(() => state);
    expect(el('builder').lastElementChild).toBe(el('first-visit-tip'));
    expect(el('first-visit-tip').dataset.placement).toBe('builder');
    expect(el('first-visit-tip').querySelector('button')!.hidden).toBe(true);
    (el('first-visit-tip').querySelectorAll('button')[1]).click();
    expect(el('first-visit-tip').hidden).toBe(true);
    expect(document.activeElement).toBe(el('finish-building'));
    expect(state.building).toBe(true); expect(el('builder').hidden).toBe(false);
    expect(save).not.toHaveBeenCalled();
    mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    expect(localStorage.getItem(key)).toBe('hidden');
  });
  test('uses only the existing Find my ship handler; does not board or claim', () => {
    const guide = vi.fn(), board = vi.fn(), claim = vi.fn();
    el('board-ship').onclick = board; el('claim-planet').onclick = claim;
    mount(() => context(),guide);
    (el('first-visit-tip').querySelector('button')!).click();
    expect(guide).toHaveBeenCalledOnce(); expect(board).not.toHaveBeenCalled(); expect(claim).not.toHaveBeenCalled();
  });
  test('hides behind unrelated dialogs, offline state, panels and notices', () => {
    const state = context(); mount(() => state);
    el('help-dialog').setAttribute('open', ''); mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    el('help-dialog').removeAttribute('open'); state.online = false;
    mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    state.online = true; document.body.classList.add('workshop-open');
    mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    document.body.classList.remove('workshop-open'); el('notice').hidden = false;
    mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    el('notice').hidden = true; mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(false);
  });
  test('moves into Pause and Atlas without stealing focus or duplicating claim/build buttons', () => {
    mount(() => context('garden'));
    el('menu-dialog').setAttribute('open', ''); el('resume').focus();
    mounted!.refresh(); expect(el('first-visit-tip').parentElement).toBe(el('planet-card'));
    expect(document.activeElement).toBe(el('resume'));
    expect(el('first-visit-tip').querySelector('button')!.hidden).toBe(true);
    el('menu-dialog').removeAttribute('open'); el('star-map').setAttribute('open', '');
    mounted!.refresh(); expect(el('first-visit-tip').nextElementSibling).toBe(el('planet-list'));
    expect(el('first-visit-tip').textContent).toContain('select your destination and Depart');
  });
  test('the docking tip is inline with the real Board control and yields to its confirmation', () => {
    const state = context(); state.nearDock = true; mount(() => state);
    expect(el('first-visit-tip').parentElement).toBe(el('boarding-prompt'));
    el('flight-dialog').setAttribute('open', ''); mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(true);
    el('flight-dialog').removeAttribute('open'); mounted!.refresh(); expect(el('first-visit-tip').hidden).toBe(false);
  });
  test('completed builders are quiet by default, and help can opt them back in', () => {
    mount(() => context('garden', true, 1));
    expect(document.querySelector('#first-visit-tip')).toBeNull();
    const help = el('help-dialog') as HTMLDialogElement;
    help.setAttribute('open', ''); help.close = () => help.removeAttribute('open');
    el('show-first-visit-tips').click();
    expect(el('first-visit-tip').hidden).toBe(false);
    expect(localStorage.getItem(key)).toBe('built');
  });
  test('skip survives remount; tips resume at current state from How to play', () => {
    const state = context(); mount(() => state);
    el('first-visit-tip').querySelectorAll('button')[1].click();
    mounted!.dispose(); mount(() => context('garden', true));
    expect(document.querySelector('#first-visit-tip')).toBeNull();
    (el('help-dialog') as HTMLDialogElement).close = vi.fn();
    el('show-first-visit-tips').click(); expect(el('first-visit-tip').dataset.step).toBe('build');
  });
  test('completion waits for acknowledged build and later takeoff, including refresh', () => {
    let state = context('garden', true); mount(() => state);
    state = context('garden', true, 1); mounted!.refresh();
    expect(localStorage.getItem(key)).toBe('built');
    mounted!.dispose(); mount(() => state);
    expect(el('first-visit-tip').hidden).toBe(false);
    state.mode = 'space'; mounted!.refresh();
    expect(localStorage.getItem(key)).toBe('done');
    expect(el('first-visit-tip').hidden).toBe(true);
  });
  test('storage denial leaves controls and tips usable, and disposal removes the timer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const read = vi.fn(() => context()); mount(read);
    expect(el('first-visit-tip').hidden).toBe(false);
    mounted!.dispose(); const calls = read.mock.calls.length;
    vi.advanceTimersByTime(1000); expect(read).toHaveBeenCalledTimes(calls);
    expect(document.querySelector('#show-first-visit-tips')).toBeNull();
  });
});
