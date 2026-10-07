import type { Universe } from '../shared/planets.ts';
import type { PlayerState, Vec3 } from '../shared/world.ts';
import { distance } from '../shared/world.ts';
import { setHTML, setText } from './i18n.ts';
import './home-controls.css';

interface HomeControlsBridge {
  enter(): Promise<void>;
  command(route: string, body: unknown): Promise<Universe>;
  apply(next: Universe): void;
  workshop(): Promise<void>;
  notice(message: string): void;
}

/** Small, owner-aware doorway and remodelling controls. No extra room is created. */
export class HomeControls {
  private root = document.createElement('section');
  private universe: Universe | null = null;
  private player: PlayerState | null = null;
  private pending = false;
  private near = false;
  private enabled = false;
  constructor(private bridge: HomeControlsBridge) {
    this.root.id = 'home-controls';
    this.root.hidden = true;
    setHTML(this.root, `<div class="home-caption"><span id="home-caption">My home</span><span id="home-distance"></span></div>
      <div class="home-entry-actions"><button id="home-door-toggle" hidden>Close door</button><button id="home-enter" class="primary" hidden>Enter home · E</button></div><p id="home-door-hint" hidden>Open the door before entering.</p>
      <details id="home-remodel"><summary>Make it yours</summary><div class="home-remodel-actions">
      <button id="home-terrace" data-home-variant="terrace">Add a terrace</button>
      <button id="home-roof" data-home-variant="roof">Change the roof</button>
      <button id="home-extend" data-home-variant="extended">Extend the home</button>
      <button id="home-base" data-home-variant="base">Original cottage</button>
      <button id="home-undo">Undo last remodel</button><button id="home-workshop">Edit with building parts</button>
      </div><p>One home, one room. Your furniture stays with your home.</p></details>`);
    document.body.append(this.root);
    this.get<HTMLButtonElement>('door-toggle').onclick = () => void this.toggleDoor();
    this.get<HTMLButtonElement>('enter').onclick = () => void this.enter();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-home-variant]')) {
      button.onclick = () => void this.remodel(button.dataset.homeVariant!);
    }
    this.get<HTMLButtonElement>('undo').onclick = () => void this.remodel();
    this.get<HTMLButtonElement>('workshop').onclick = () => void this.bridge.workshop();
  }
  private get<E extends HTMLElement>(suffix: string) { return this.root.querySelector(`#home-${suffix}`) as E; }
  receive(universe: Universe) { this.universe = universe; this.receivePlayer(universe.player); }
  receivePlayer(player: PlayerState) {
    this.player = player;
    const home = player.home;
    this.root.hidden = !home || player.location?.kind === 'interior' || player.flight.mode !== 'ground';
    this.get('remodel').hidden = !home?.canEdit;
    setText(this.get('caption'), home?.canEdit ? 'My home' : 'A neighbour’s home');
    this.get<HTMLButtonElement>('undo').disabled = this.pending || !home?.canUndo;
  }
  frame(position: Vec3, radius: number, enabled: boolean) {
    this.enabled = enabled;
    const home = this.player?.home;
    const d = home ? distance(position, home.door.position, radius) : Infinity;
    this.near = d <= 1.6;
    this.get('enter').hidden = !this.near || !enabled;
    this.get<HTMLButtonElement>('enter').disabled = this.pending || !home?.interior.doorOpen;
    const door = this.get<HTMLButtonElement>('door-toggle');
    door.hidden = !this.near || !enabled; door.disabled = this.pending;
    setText(door, home?.interior.doorOpen ? 'Close door' : 'Open door');
    door.setAttribute('aria-pressed', String(home?.interior.doorOpen ?? false));
    this.get('door-hint').hidden = !this.near || !!home?.interior.doorOpen;
    setText(this.get('distance'), Number.isFinite(d) ? `${Math.round(d)} m` : '');
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-home-variant],#home-workshop')) button.disabled = this.pending || !enabled;
    this.get<HTMLButtonElement>('undo').disabled = this.pending || !enabled || !home?.canUndo;
  }
  get canEnter() { return this.near && this.enabled && !this.pending && !!this.player?.home?.interior.doorOpen && this.player.location?.kind !== 'interior'; }
  async enter() {
    if (!this.canEnter) return;
    this.pending = true;
    try { await this.bridge.enter(); }
    catch (error) { this.bridge.notice(error instanceof Error ? error.message : 'Could not enter your home.'); }
    finally { this.pending = false; }
  }
  private async toggleDoor() {
    const home = this.player?.home, location = this.player?.location;
    if (!home || !location || !this.near || !this.enabled || this.pending) return;
    this.pending = true;
    try {
      const next = await this.bridge.command('home/door', { buildingId: home.buildingId, visitEpoch: location.visitEpoch, expectedDoorVersion: home.interior.doorVersion, open: !home.interior.doorOpen });
      this.bridge.apply(next);
    } catch (error) { this.bridge.notice(error instanceof Error ? error.message : 'Could not change the door.'); }
    finally { this.pending = false; }
  }
  private async remodel(variant?: string) {
    const home = this.player?.home;
    if (this.pending || !this.enabled || !home?.canEdit || !this.universe) return;
    this.pending = true;
    try {
      const next = await this.bridge.command(variant ? 'home/remodel' : 'home/undo', {
        buildingId: home.buildingId, expectedVersion: home.buildingVersion, ...(variant ? {variant} : {}),
      });
      this.bridge.apply(next);
      this.bridge.notice(variant ? 'Home updated. Your room and furniture are safe.' : 'Last remodel undone.');
    } catch (error) { this.bridge.notice(error instanceof Error ? error.message : 'Could not update your home.'); }
    finally { this.pending = false; }
  }
}
