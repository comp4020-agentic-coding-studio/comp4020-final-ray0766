import { setAttribute, setText } from './i18n.ts';
import type { Universe } from '../shared/planets.ts';
import './onboarding.css';

export interface OnboardingContext {
  universe: Universe;
  mode: 'ground' | 'space';
  building: boolean;
  nearDock: boolean;
  online: boolean;
}
interface Tip { id: string; title: string; text: string; action?: { label: string; target: string } }
type Preference = 'active' | 'built' | 'hidden' | 'done';
const STORAGE_KEY = 'little-worlds:first-visit:v1';

function hasBuiltHome({ universe }: OnboardingContext) {
  return universe.planets.some(p => p.mine && p.objectCount > 0);
}

/** Read acknowledged ownership/objects only; a preview never advances the guide. */
export function firstVisitTip(context: OnboardingContext, atlas = false): Tip {
  const { universe: u, mode, building, nearDock } = context;
  const p = u.currentPlanet;
  if (atlas) return {
    id: 'atlas', title: 'Choose a destination',
    text: `${u.ownedPlanetId ? 'Choose a world to visit.' : 'Choose a nearby “Blank · unclaimed” world.'} Mark bearing points the way; it does not move you. Fly within 20 m, brake below 6 m/s, then choose Land and explore.`,
  };
  if (mode === 'space') return {
    id: 'flight', title: u.ownedPlanetId ? 'Fly to your next stop' : 'Fly to a blank world',
    text: 'Atlas (M) marks a bearing. W thrusts, A/D turn, ↑/↓ climb or dive; S brakes. On touch, use the stick and Thrust / Brake. Slow near your destination to land.',
    action: { label: 'Open Atlas', target: 'open-map' },
  };
  if (p.kind === 'garden' && !p.claimed && !u.ownedPlanetId) return {
    id: 'claim', title: 'Make this world your home',
    text: 'Pause → Make this my planet. One home per browser identity; keep this browser’s data to keep access. After claiming, choose Build on my planet.',
    action: { label: 'Open Pause', target: 'open-menu' },
  };
  if (p.mine && building) return hasBuiltHome(context) ? {
    id: 'saved', title: 'Your first object is saved',
    text: 'Finish or cancel any new preview, then Done building returns to walking. Pause → Find my ship marks the way back to your landing point.',
  } : {
    id: 'place', title: 'Place your first object',
    text: 'Choose an object → tap open ground → Rotate if needed → Place object. A preview is not saved. Cancel drops the preview; Done building returns to walking.',
  };
  if (p.mine && !hasBuiltHome(context)) return {
    id: 'build', title: 'Build something small',
    text: 'Pause → Build on my planet opens the ready-made kit. Choose an object, tap open ground, then Place object to save it. Open workshop is optional.',
    action: { label: 'Open Pause', target: 'open-menu' },
  };
  if (p.kind === 'garden' && !p.mine && !u.ownedPlanetId) return {
    id: 'visitor', title: 'This world is a visit',
    text: 'Only its owner can build here. Use Atlas to mark a blank world, then return to your parked ship to fly there.',
    action: { label: 'Open Atlas', target: 'open-map' },
  };
  if (nearDock) return {
    id: 'board', title: 'Ready to board',
    text: 'Press E or Board your ship, then Launch ship. Stay here or Escape cancels before takeoff.',
  };
  return {
    id: 'port', title: p.kind === 'hub' ? 'Walk to the starport' : 'Walk back to your ship',
    text: p.kind === 'hub'
      ? 'Follow the short path to SUNSEED · PORT. Board your ship appears beside the gate. Find my ship adds a walking direction; Atlas marks a destination.'
      : 'Done building returns to walking. Find my ship marks your landing point. Walk to its return beacon; Board your ship appears when you are close.',
    action: { label: 'Find my ship', target: 'guide-port' },
  };
}

/** One contextual card, mounted beside existing controls. No network writes. */
export function mountOnboarding({ read }: { read: () => OnboardingContext | null }) {
  const get = (id: string) => document.getElementById(id);
  let preference: Preference | null = null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'active' || stored === 'built' || stored === 'hidden' || stored === 'done') preference = stored;
  } catch { /* Tips still work when browser storage is unavailable. */ }
  function remember(value: Preference) {
    if (preference === value) return;
    preference = value;
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Optional local preference. */ }
  }

  const card = document.createElement('aside');
  card.id = 'first-visit-tip'; card.className = 'onboarding-tip'; card.hidden = true;
  setAttribute(card, 'aria-label', 'First-visit tip');
  const title = document.createElement('strong'), copy = document.createElement('p');
  title.className = 'onboarding-title'; copy.className = 'onboarding-copy';
  const actions = document.createElement('div'); actions.className = 'onboarding-actions';
  const action = document.createElement('button'), skip = document.createElement('button');
  action.type = skip.type = 'button'; setText(skip, 'Skip tips');
  setAttribute(skip, 'title', 'Show them again in Pause → How to play');
  actions.append(action, skip); card.append(title, copy, actions);
  let target: string | undefined;
  action.onclick = () => {
    const control = target ? get(target) : null;
    if (!(control instanceof HTMLButtonElement) || control.disabled || control.hidden) return;
    control.click(); refresh();
    // Opening a native dialog handles focus; a direction marker leaves walking available.
    if (!document.querySelector('dialog[open]')) get('open-menu')?.focus({ preventScroll: true });
  };
  skip.onclick = () => {
    remember('hidden'); card.hidden = true;
    (get('menu-dialog')?.hasAttribute('open') ? get('resume') :
      get('star-map')?.hasAttribute('open') ? get('close-map') :
        read()?.building ? get('finish-building') : get('open-menu'))?.focus({ preventScroll: true });
  };
  const reopen = document.createElement('button');
  reopen.type = 'button'; reopen.id = 'show-first-visit-tips'; reopen.className = 'onboarding-reopen';
  setText(reopen, 'Show first-visit tips');
  get('help-dialog')?.querySelector('.close-help')?.before(reopen);
  reopen.onclick = () => {
    remember('active');
    (get('help-dialog') as HTMLDialogElement | null)?.close();
    refresh(); get('open-menu')?.focus({ preventScroll: true });
  };

  function refresh() {
    const context = read();
    const hide = () => { card.hidden = true; };
    if (!context || !context.online || document.hidden) return hide();
    // The core guide owns every newly prepared arrival, even after Skip. These
    // old flight/claim tips remain available for older identities only.
    const coreArrival=!!context.universe.player&&'arrival' in context.universe.player&&!!context.universe.player.arrival;
    reopen.hidden=coreArrival||document.body.classList.contains('tutorial-active');
    if(reopen.hidden)return hide();
    if (context.universe.player?.home) return hide();
    if (preference === null) remember(hasBuiltHome(context) ? 'done' : 'active');
    if (preference === 'hidden' || preference === 'done') return hide();
    if (hasBuiltHome(context) && context.mode === 'ground') remember('built');
    if (preference === 'built' && context.mode === 'space') { remember('done'); return hide(); }
    if (document.body.matches('.workshop-open, .shipyard-open, .history-open, .terrain-workshop-open, .departing')) return hide();
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog && dialog.id !== 'menu-dialog' && dialog.id !== 'star-map') return hide();
    // Leave the flight instruments, notices and optional delivery their existing room.
    if (!dialog && !context.building && (context.mode === 'space' ||
      document.body.classList.contains('delivery-open') ||
      get('notice')?.hidden === false || get('conversation')?.hidden === false)) return hide();

    const tip = firstVisitTip(context, dialog?.id === 'star-map');
    let host = get('world')?.parentElement;
    let before: Element | null = null;
    let placement = 'ground';
    if (dialog?.id === 'star-map') { host = dialog; before = get('planet-list'); placement = 'atlas'; }
    else if (dialog) { host = get('planet-card'); placement = 'menu'; }
    else if (context.building) { host = get('builder'); placement = 'builder'; }
    else if (context.nearDock && tip.id === 'board') { host = get('boarding-prompt'); placement = 'boarding'; }
    if (!host) return hide();
    // Append in the builder: Save / Cancel / Done retain their place and hit targets.
    if (card.parentElement !== host) host.insertBefore(card, before);
    card.dataset.placement = placement; card.dataset.step = tip.id;
    setText(title, tip.title); setText(copy, placement === 'menu' ? tip.text.replaceAll('Pause → ', '') : tip.text);
    target = tip.action?.target;
    action.hidden = !tip.action || placement === 'menu' || placement === 'atlas' || placement === 'builder';
    setText(action, tip.action?.label ?? '');
    card.hidden = false;
  }

  // Read-only sampling avoids edits to shared Colony/flight classes or the render loop.
  const timer = window.setInterval(refresh, 250);
  function dispose() {
    window.clearInterval(timer); card.remove(); reopen.remove();
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose, { once: true });
  refresh();
  return { refresh, dispose };
}
