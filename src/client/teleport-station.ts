import type { HomeSetupAddition } from '../shared/home-setup.ts';
import { TELEPORT_STATION } from '../shared/planet-plan/compositions.ts';
import type { PlanetSummary, Universe } from '../shared/planets.ts';
import { STATION_REACH, stationSites } from '../shared/teleport.ts';
import type { StationSite, TeleportStationPreview } from '../shared/teleport.ts';
import { distance } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import { setHTML, setText } from './i18n.ts';
import './teleport-station.css';

export interface StationConfirm { planetId: string; expectedRevision: number; hash: string; visitEpoch: number; site: number }
interface TeleportBridge {
  /** Saves the walk, then asks the server; resolves with the acknowledged universe. */
  teleport(planetId: string, requestId: string): Promise<Universe>;
  preview(planetId: string): Promise<TeleportStationPreview>;
  confirm(body: StationConfirm): Promise<Universe>;
  ghost(addition: HomeSetupAddition | undefined): void;
  apply(next: Universe): void;
  notice(message: string): void;
}
interface Destination { planet: PlanetSummary; role: 'home' | 'hub' | 'marked'; source?: 'landing' | 'history' }

/** Gate prompt, destination list and the owner's station siting, for the teleport stations. */
export class TeleportStations {
  private prompt = document.createElement('div');
  private dialog = document.createElement('dialog');
  private setupButton = document.createElement('button');
  private setupDialog = document.createElement('dialog');
  private universe: Universe | null = null;
  private sites: StationSite[] = [];
  private sitesKey = '';
  private near = false;
  private enabled = false;
  private busy = false;
  /** Kept after a network failure so a retry of the same choice is the same request. */
  private pending: { planetId: string; requestId: string } | null = null;
  private plan: TeleportStationPreview | null = null;
  private planSite = 0;
  private hinted = false;
  constructor(private bridge: TeleportBridge) {
    this.prompt.id = 'teleport-prompt'; this.prompt.className = 'boarding-prompt teleport-prompt'; this.prompt.hidden = true;
    setHTML(this.prompt, '<small>TELEPORT STATION</small><button id="open-teleport" class="primary">Use the teleport station <kbd>E</kbd></button>');
    (document.getElementById('boarding-prompt') ?? document.body.lastElementChild)!.after(this.prompt);
    this.prompt.querySelector<HTMLButtonElement>('#open-teleport')!.onclick = () => this.open();
    this.dialog.id = 'teleport-dialog'; this.dialog.setAttribute('aria-labelledby', 'teleport-title');
    setHTML(this.dialog, `<button id="teleport-close" class="close" aria-label="Close the teleport station">×</button><span class="eyebrow">TELEPORT STATION · MARKED WORLDS</span><h2 id="teleport-title">Where to?</h2><p>Your home and the harbour are always open. Other planets join this list once you have flown there and landed.</p><p id="teleport-status" class="teleport-status" role="status" aria-live="polite"></p><div id="teleport-list" class="planet-list teleport-list"></div>`);
    document.body.append(this.dialog);
    this.dialog.querySelector<HTMLButtonElement>('#teleport-close')!.onclick = () => this.close();
    // A request in flight keeps the dialog: Escape cannot hide a travel that is still being decided.
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.setupButton.id = 'station-setup'; this.setupButton.hidden = true; setText(this.setupButton, 'Place a teleport station');
    (document.getElementById('home-setup') ?? document.getElementById('claim-planet'))?.after(this.setupButton);
    this.setupButton.onclick = () => void this.openSetup();
    this.setupDialog.id = 'station-setup-dialog'; this.setupDialog.setAttribute('aria-labelledby', 'station-setup-title');
    setHTML(this.setupDialog, `<span class="eyebrow">TELEPORT STATION</span><h2 id="station-setup-title">A gate for your home</h2><p>The station is an ordinary building on your planet. Saved buildings never move to make room for it.</p><p id="station-setup-status" role="status"></p><button id="station-setup-preview" class="primary">Preview a site</button><button id="station-setup-cancel">Cancel</button>`);
    document.body.append(this.setupDialog);
    this.setupDialog.querySelector<HTMLButtonElement>('#station-setup-cancel')!.onclick = () => this.closeSetup();
    this.setupDialog.addEventListener('cancel', event => { event.preventDefault(); this.closeSetup(); });
    this.setupDialog.querySelector<HTMLButtonElement>('#station-setup-preview')!.onclick = () => { if (!this.plan?.sites.length) return; this.setupDialog.close(); this.showSite(0); };
  }
  receive(universe: Universe) {
    this.universe = universe;
    const planet = universe.currentPlanet, key = JSON.stringify([planet.id, planet.revision]);
    if (key !== this.sitesKey) { this.sitesKey = key; this.sites = stationSites(planet); }
    if (this.plan && (this.plan.planetId !== planet.id || this.plan.expectedRevision !== planet.revision)) this.closeSetup();
    const player = universe.player;
    // Once per session: an owner home without a gate learns where the siting proposal lives.
    if (planet.mine && planet.kind === 'garden' && !this.sites.length && player.flight.mode === 'ground' && player.location?.kind !== 'interior' && !this.hinted) {
      this.hinted = true; this.bridge.notice('Your home has no teleport station yet. Open the menu and choose Place a teleport station.');
    }
    this.setupButton.hidden = !planet.mine || planet.kind !== 'garden' || this.sites.length > 0 || player.flight.mode !== 'ground' || player.location?.kind === 'interior';
    if (this.dialog.open && !this.busy) this.render();
  }
  /** Called from the UI tick with the walker's surface position. */
  frame(position: Vec3, radius: number, enabled: boolean) {
    this.enabled = enabled;
    this.near = enabled && this.sites.some(site => distance(position, site.interact, radius) < STATION_REACH - .12);
    this.prompt.hidden = !this.near;
  }
  get canOpen() { return this.near && !this.busy; }
  /** The station a fresh arrival stands beside, for facing away from its ring. */
  arrivalSite(position: Vec3, radius: number) { return this.sites.find(site => distance(position, site.arrival, radius) < .6) ?? null; }
  open() {
    if (!this.canOpen || !this.universe) return;
    setText(this.status, '');this.status.classList.remove('error');
    this.render(); this.dialog.showModal();
  }
  private close() { if (this.busy) return; this.dialog.close(); }
  private get status() { return this.dialog.querySelector<HTMLElement>('#teleport-status')!; }
  private destinations(): Destination[] {
    const u = this.universe!, byId = new Map(u.planets.map(p => [p.id, p])), list: Destination[] = [];
    const home = u.ownedPlanetId ? byId.get(u.ownedPlanetId) : undefined, hub = u.planets.find(p => p.kind === 'hub');
    if (home) list.push({ planet: home, role: 'home' });
    if (hub) list.push({ planet: hub, role: 'hub' });
    for (const mark of u.teleportMarks ?? []) {
      const planet = byId.get(mark.planetId);
      if (planet && planet.kind !== 'hub' && planet.id !== home?.id) list.push({ planet, role: 'marked', source: mark.source });
    }
    return list;
  }
  private render() {
    const u = this.universe!, list = this.dialog.querySelector('#teleport-list')!;
    list.replaceChildren();
    for (const entry of this.destinations()) {
      const p = entry.planet, here = p.id === u.currentPlanet.id;
      const card = document.createElement('article');
      card.className = `planet-option teleport-option is-${entry.role}${here ? ' is-here' : ''}`; card.dataset.planetId = p.id;
      const orb = document.createElement('div'); orb.className = 'map-orb';
      orb.style.setProperty('--orb', entry.role === 'hub' ? '#d8b783' : entry.role === 'home' ? '#91b499' : p.claimed ? '#9bb9c0' : '#cdd4bc');
      setText(orb, entry.role === 'hub' ? '⌂' : entry.role === 'home' ? '★' : p.claimed ? '✦' : '·', true);
      const info = document.createElement('div'), tag = document.createElement('small'), name = document.createElement('h3'), owner = document.createElement('p'), detail = document.createElement('p');
      setText(tag, entry.role === 'home' ? 'Your home' : entry.role === 'hub' ? 'Main planet' : 'Marked by landing');
      setText(name, p.name, true);
      setText(owner, entry.role === 'home' ? 'Owner: you' : entry.role === 'hub' ? 'Owner: everyone · public harbour' : p.claimed ? 'Owner: a neighbour' : 'Owner: nobody yet · unclaimed');
      setText(detail, entry.role === 'marked' ? 'Arrive at its landing pad' : 'Arrive beside its teleport station');
      const button = document.createElement('button'); button.className = here ? 'quiet' : 'primary';
      button.disabled = here || this.busy; setText(button, here ? 'You are here' : 'Teleport');
      button.onclick = () => void this.go(p);
      info.append(tag, name, owner, detail); card.append(orb, info, button); list.append(card);
    }
  }
  private async go(planet: PlanetSummary) {
    // The open dialog pauses the scene; the server re-checks the gate, the mark and the destination.
    if (this.busy || planet.id === this.universe?.currentPlanet.id) return;
    this.busy = true;
    const buttons = [...this.dialog.querySelectorAll<HTMLButtonElement>('button')];
    buttons.forEach(button => button.disabled = true);
    this.status.classList.remove('error'); setText(this.status, 'Opening the gate…');
    const request = this.pending?.planetId === planet.id ? this.pending : { planetId: planet.id, requestId: crypto.randomUUID() };
    this.pending = request;
    try {
      const next = await this.bridge.teleport(request.planetId, request.requestId);
      this.pending = null; this.busy = false; this.dialog.close();
      this.bridge.apply(next);
      this.bridge.notice(next.currentPlanet.kind === 'hub' ? 'Arrived at the harbour teleport station.' : next.currentPlanet.mine ? 'Arrived home beside your teleport station.' : 'Arrived at the landing pad.');
    } catch (error) {
      // A refusal is final for this request; a lost connection may retry the same one.
      if (error instanceof Error && 'status' in error) this.pending = null;
      this.status.classList.add('error');
      setText(this.status, error instanceof Error ? error.message : 'The gate could not open. You are still here.');
    } finally {
      this.busy = false;
      if (this.dialog.open) { buttons.forEach(button => button.disabled = false); this.render(); }
    }
  }
  private async openSetup() {
    if (this.busy || !this.universe) return; this.busy = true;
    try {
      this.plan = await this.bridge.preview(this.universe.currentPlanet.id);
      document.querySelector<HTMLDialogElement>('#menu-dialog')?.close();
      this.setupDialog.querySelector<HTMLButtonElement>('#station-setup-preview')!.hidden = !this.plan.sites.length;
      setText(this.setupDialog.querySelector('#station-setup-status')!, this.plan.reason ?? (this.plan.sites.length === 1 ? 'One free site found near your landing pad.' : `${this.plan.sites.length} free sites found near your landing pad.`));
      this.setupDialog.showModal();
    } catch (error) { this.bridge.notice(error instanceof Error ? error.message : 'Could not look for a station site.'); }
    finally { this.busy = false; }
  }
  private showSite(index: number) {
    const plan = this.plan; if (!plan) return;
    this.planSite = index; const site = plan.sites[index];
    this.bridge.ghost({ position: site.position, rotation: site.rotation, blueprint: { ...structuredClone(TELEPORT_STATION.blueprint), parts: plan.blueprint } });
    document.getElementById('station-setup-bar')?.remove();
    const bar = document.createElement('section'); bar.id = 'station-setup-bar'; bar.className = 'station-setup-bar';
    setHTML(bar, '<strong>Teleport station preview</strong><p id="station-setup-site"></p><button id="station-setup-build" class="primary">Build the station here</button><button id="station-setup-next">Next site</button><button id="station-setup-dismiss">Cancel</button>');
    setText(bar.querySelector('#station-setup-site')!, `Site ${index + 1} of ${plan.sites.length}. Nothing is saved until you build.`);
    document.body.append(bar);
    const next = bar.querySelector<HTMLButtonElement>('#station-setup-next')!; next.disabled = plan.sites.length < 2;
    next.onclick = () => this.showSite((this.planSite + 1) % plan.sites.length);
    bar.querySelector<HTMLButtonElement>('#station-setup-dismiss')!.onclick = () => this.closeSetup();
    bar.querySelector<HTMLButtonElement>('#station-setup-build')!.onclick = () => void this.build();
  }
  private async build() {
    const plan = this.plan, location = this.universe?.player.location;
    if (this.busy || !plan) return; this.busy = true;
    const controls = [...document.querySelectorAll<HTMLButtonElement>('#station-setup-bar button')]; controls.forEach(button => button.disabled = true);
    try {
      const next = await this.bridge.confirm({ planetId: plan.planetId, expectedRevision: plan.expectedRevision, hash: plan.hash, visitEpoch: location?.visitEpoch ?? 0, site: this.planSite });
      this.busy = false; this.closeSetup(); this.bridge.apply(next);
      this.bridge.notice('Teleport station built. Walk up to its gate to travel.');
    } catch (error) { this.bridge.notice(error instanceof Error ? error.message : 'Could not build the station.'); }
    finally { this.busy = false; controls.forEach(button => button.disabled = false); }
  }
  private closeSetup() {
    if (this.busy) return;
    this.setupDialog.close(); this.plan = null; this.bridge.ghost(undefined); document.getElementById('station-setup-bar')?.remove();
  }
}
