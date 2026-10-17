import type { HomeSetupAddition } from '../shared/home-setup.ts';
import { TELEPORT_STATION } from '../shared/planet-plan/compositions.ts';
import type { Universe } from '../shared/planets.ts';
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

/** One gate action (your home ⇄ the harbour) and the owner's station siting. */
export class TeleportStations {
  private prompt = document.createElement('div');
  private action = document.createElement('button');
  private homeHelp = document.createElement('p');
  private findShip = document.createElement('button');
  private setupButton = document.createElement('button');
  private setupDialog = document.createElement('dialog');
  private universe: Universe | null = null;
  private sites: StationSite[] = [];
  private sitesKey = '';
  private near = false;
  private busy = false;
  /** Kept after a network failure so a retry of the same journey is the same request. */
  private pending: { planetId: string; requestId: string } | null = null;
  private labelKey = '';
  private plan: TeleportStationPreview | null = null;
  private planSite = 0;
  private hinted = false;
  constructor(private bridge: TeleportBridge) {
    this.prompt.id = 'teleport-prompt'; this.prompt.className = 'boarding-prompt teleport-prompt'; this.prompt.hidden = true;
    setHTML(this.prompt, '<small id="teleport-context">TELEPORT STATION</small>');
    this.action.id = 'teleport-go'; this.action.className = 'primary'; this.prompt.append(this.action);
    this.homeHelp.id='teleport-home-help';this.homeHelp.hidden=true;
    setText(this.homeHelp,'This gate returns to your own home. You have not claimed one yet. Find your ship, mark a Blank · unclaimed world in Atlas, fly there and land. Then Pause → Make this my planet → Build on my planet.');
    this.findShip.id='teleport-find-ship';this.findShip.className='primary';this.findShip.hidden=true;setText(this.findShip,'Find my ship');
    this.findShip.onclick=()=>document.getElementById('guide-port')?.click();
    this.prompt.append(this.homeHelp,this.findShip);
    (document.getElementById('boarding-prompt') ?? document.body.lastElementChild)!.after(this.prompt);
    this.action.onclick = () => void this.use();
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
  }
  /** Your home's gate leads to the harbour, the harbour's gate back to your home; a neighbour's gate offers nothing. */
  private destination(): string | null {
    const u = this.universe; if (!u?.ownedPlanetId || (u.currentPlanet.kind === 'hub' && u.player.arrival && u.player.arrival.homePreparation !== 'ready')) return null;
    if (u.currentPlanet.kind === 'hub') return u.ownedPlanetId;
    return u.currentPlanet.id === u.ownedPlanetId ? u.planets.find(p => p.kind === 'hub')?.id ?? null : null;
  }
  /** Called from the UI tick with the walker's surface position. */
  frame(position: Vec3, radius: number, enabled: boolean) {
    const target = this.destination();
    const nearStation=enabled&&this.sites.some(site=>distance(position,site.interact,radius)<STATION_REACH-.12);
    const arrival=this.universe?.player.arrival,preparing=!!arrival&&arrival.homePreparation!=='ready';
    const needsHome=nearStation&&this.universe?.currentPlanet.kind==='hub'&&(!this.universe.ownedPlanetId||preparing)&&!this.busy;
    this.near=nearStation&&!!target;
    this.homeHelp.hidden=!needsHome;this.findShip.hidden=!needsHome||preparing;this.action.hidden=!!needsHome;
    if(needsHome)setText(this.homeHelp,preparing
      ? arrival?.homePreparation==='retry'?'Your home preparation paused. Open the village guide to retry. You can keep exploring here.':'Your home is being prepared. You can explore the village while this gate gets ready.'
      : 'This gate returns to your own home. You have not claimed one yet. Find your ship, mark a Blank · unclaimed world in Atlas, fly there and land. Then Pause → Make this my planet → Build on my planet.');
    this.prompt.hidden = !this.near && !this.busy && !needsHome;
    this.action.disabled = this.busy;
    const label = this.busy ? 'Opening the gate…' : target === 'hub' ? 'Go to the main planet' : 'Return to my home';
    const key = `${label}|${document.documentElement.lang}`;
    if (key !== this.labelKey) { this.labelKey = key; setText(this.action, label); if (!this.busy) { const hint = document.createElement('kbd'); hint.textContent = 'E'; this.action.append(hint); } }
  }
  get canUse() { return this.near && !this.busy; }
  /** The station a fresh arrival stands beside, for facing it. */
  arrivalSite(position: Vec3, radius: number) { return this.sites.find(site => distance(position, site.arrival, radius) < .6) ?? null; }
  async use() {
    const target = this.destination();
    if (!this.canUse || !target) return;
    this.busy = true; this.labelKey = '';
    const request = this.pending?.planetId === target ? this.pending : { planetId: target, requestId: crypto.randomUUID() };
    this.pending = request;
    try {
      const next = await this.bridge.teleport(request.planetId, request.requestId);
      this.pending = null; this.bridge.apply(next);
      this.bridge.notice(next.currentPlanet.kind === 'hub' ? 'Arrived at the harbour teleport station.' : 'Arrived home beside your teleport station.');
    } catch (error) {
      // A refusal is final for this request; a lost connection may retry the same one.
      if (error instanceof Error && 'status' in error) this.pending = null;
      this.bridge.notice(error instanceof Error ? error.message : 'The gate could not open. You are still here.');
    } finally { this.busy = false; this.labelKey = ''; }
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
