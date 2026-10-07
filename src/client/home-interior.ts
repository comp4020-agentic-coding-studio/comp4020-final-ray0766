import * as T from 'three';
import { courier } from './character.ts';
import { disposeGeometry } from './build-art.ts';
import { createWorldStyleLibrary } from './presentation.ts';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import { libraryMaterials, makeKit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { emitPart } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';
import { HOME_EXIT, HOME_ROOM, homeItemBounds, homePathAllowed, homePositionAllowed } from '../shared/home.ts';
import type { HomeDescriptor, HomeInterior as InteriorData, HomeItem } from '../shared/home.ts';
import type { PlayerState, Vec3 } from '../shared/world.ts';
import type { Universe } from '../shared/planets.ts';
import type { PresenceSnapshot } from '../shared/presence.ts';
import './home-interior.css';

export interface HomeInteriorOptions {
  renderer: T.WebGLRenderer;
  move(body: { buildingId: string; visitEpoch: number; sequence: number; position: Vec3; yaw: number }): Promise<PlayerState>;
  save(body: { buildingId: string; expectedVersion: number; material: InteriorData['material']; items: HomeItem[] }): Promise<Universe>;
  exit(body: { buildingId: string; visitEpoch: number }): Promise<Universe>;
  applyPlayer(player: PlayerState): void;
  applyUniverse(universe: Universe): void;
  recover(): Promise<Universe>;
}

/** Camera fitting in room-local coordinates; all room geometry stays in metres. */
export function fitHomeCamera(camera: T.OrthographicCamera, width: number, depth: number, height: number, aspect: number, phone: boolean) {
  camera.position.set(width * .88, Math.max(width, depth) * 1.18, depth * 1.45);
  camera.lookAt(0, height * .31, 0);
  camera.updateMatrixWorld(true);
  const extent = new T.Box3();
  for (const x of [-width / 2 - .25, width / 2 + .25]) for (const z of [-depth / 2 - .3, depth / 2 + .3]) for (const y of [-.25, height]) {
    extent.expandByPoint(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  // Reserve the lower portion for controls. Fit the room, never scale the avatar.
  const occupied = phone ? .71 : .83;
  const span = Math.max((extent.max.y - extent.min.y) / occupied, (extent.max.x - extent.min.x) / (aspect * .91));
  const centerY = (extent.min.y + extent.max.y) / 2 - span * (phone ? .045 : .015);
  camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
  camera.top = centerY + span / 2; camera.bottom = centerY - span / 2;
  camera.updateProjectionMatrix();
}

const PART: Record<HomeItem['kind'], PartId> = { table: 'furniture.table', chair: 'furniture.chair', shelf: 'furniture.shelf', plant: 'garden.pot' };
const THEMES = { warm: ['#efe3c6', '#5f8b82'], sage: ['#cdd9bc', '#597f6f'], blue: ['#d3e2e6', '#668da1'] } as const;
const copy = (interior: InteriorData): InteriorData => structuredClone(interior);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Preview refusal before save; the server remains the authority. */
export function homeFurnitureFits(items: readonly HomeItem[], position: Vec3) {
  if (!homePositionAllowed(position, items)) return false;
  return items.every((item, i) => {
    const a = homeItemBounds(item);
    if (a.minX < -HOME_ROOM.width / 2 + .08 || a.maxX > HOME_ROOM.width / 2 - .08 || a.minZ < -HOME_ROOM.depth / 2 + .08 || a.maxZ > HOME_ROOM.depth / 2 - .08) return false;
    if (a.minX < .65 && a.maxX > -.65 && a.maxZ > .5) return false;
    return items.slice(0, i).every(other => { const b = homeItemBounds(other); return !(a.minX < b.maxX + .04 && a.maxX > b.minX - .04 && a.minZ < b.maxZ + .04 && a.maxZ > b.minZ - .04); });
  });
}
const translation: Record<string, [string, string]> = {
  title: ['A room of your own', '我的小屋'], guest: ['Visiting this home', '正在做客'],
  leave: ['Go outside', '出门'], door: ['Walk to the doorway to leave', '走到门口即可出门'],
  arrange: ['Arrange room', '布置房间'], save: ['Save changes', '保存布置'], cancel: ['Cancel', '取消'],
  move: ['MOVE', '移动'], hint: ['WASD / arrows · walk to the doorway to leave', 'WASD / 方向键移动 · 走到门口出门'],
  phoneHint: ['Use the thumbstick · exit at the doorway', '拖动摇杆走动 · 从门口出门'],
  saved: ['Room saved', '房间已保存'], saving: ['Saving…', '正在保存…'], entering: ['Welcome home', '欢迎回家'],
  offline: ['Connection lost. Your saved room is safe.', '连接中断，已保存的房间仍然安全。'],
  retry: ['Reconnect', '重新连接'], pending: ['Opening the door…', '正在开门…'],
  material: ['Wall colour', '墙面颜色'], furniture: ['Furniture', '家具'], rotate: ['Turn', '旋转'],
  warm: ['Cream', '奶油'], sage: ['Sage', '浅绿'], blue: ['Sky', '浅蓝'],
  table: ['Table', '圆桌'], chair: ['Chair', '椅子'], shelf: ['Shelf', '书架'], plant: ['Plant', '盆栽'],
  edited: ['Preview · save to keep your changes', '布置预览 · 保存后保留修改'],
  blocked: ['Leave the doorway and a walking route clear.', '请给门口和行走路线留出空间。'],
  readonly: ['You can explore; the owner arranges this room.', '可以自由参观，房间由主人布置。'],
  left: ['Move left', '向左移动'], right: ['Move right', '向右移动'], forward: ['Move back', '向后移动'], back: ['Move forward', '向前移动'],
};

/** One room in the designated home; no extra canvas, identity, timer or API owner. */
export class HomeInterior {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-5, 5, 5, -5, .05, 100);
  private readonly ui = document.createElement('section');
  private readonly library = createWorldStyleLibrary();
  private room = new T.Group();
  private furniture = new T.Group();
  private avatar = courier('clay');
  private selection = new T.Mesh(new T.RingGeometry(.45, .49, 4, 1, Math.PI / 4), new T.MeshBasicMaterial({ color: '#dcad5c', transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide }));
  private guests = new Map<string, ReturnType<typeof courier>>();
  private home: HomeDescriptor | null = null;
  private acknowledged: PlayerState | null = null;
  private draft: InteriorData | null = null;
  private position: Vec3 = [0, 0, 0];
  private yaw = 0;
  private moving = 0;
  private keys = new Set<string>();
  private stick = new T.Vector2();
  private stickPointer: number | null = null;
  private pendingMove: Promise<void> | null = null;
  private pendingAction = false;
  private online = true;
  private editing = false;
  private dirty = false;
  private draftVersion = 0;
  private selected = '';
  private lastSend = 0;
  private elapsed = 0;
  private entryAt = 0;
  private exitArmed = false;
  private lastViewport = '';
  private locale = '';
  private statusKey = 'entering';
  private sourceKey = '';
  private currentVisit = '';
  private surfaceResourceDisposers: (() => void)[] = [];
  private abort = new AbortController();
  private _active = false;
  get active() { return this._active; }
  get facing(): Vec3 { return [Math.sin(this.yaw), 0, Math.cos(this.yaw)]; }

  constructor(private readonly options: HomeInteriorOptions) {
    this.scene.background = new T.Color('#98b6ad');
    this.scene.add(this.room, this.furniture, this.avatar.root, this.selection);
    this.selection.rotation.x = -Math.PI / 2; this.selection.visible = false;
    const fill = new T.HemisphereLight('#e2efe5', '#a99a79', 1.4);
    const sun = new T.DirectionalLight(VILLAGE.light.key, 2.4);
    sun.position.set(-4, 8, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.normalBias = .025; sun.shadow.bias = -.00015;
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .1, far: 25 });
    sun.shadow.camera.updateProjectionMatrix(); this.scene.add(fill, sun, sun.target);
    this.library.attachRenderer(options.renderer);
    this.ui.className = 'home-interior-ui'; this.ui.hidden = true;
    this.ui.dataset.i18nVerbatim = ''; this.ui.setAttribute('aria-label', 'Home interior');
    this.ui.innerHTML = `<header class="home-room-header"><div><span class="home-room-eyebrow">HOME / 小屋</span><h2 data-home-text="title"></h2><p id="home-room-status" role="status" aria-live="polite"></p></div><button id="home-exit" data-home-text="leave"></button></header>
      <div class="home-room-tools"><button id="home-arrange" data-home-text="arrange"></button><button id="home-retry" data-home-text="retry" hidden></button><p id="home-room-hint"></p></div>
      <section id="home-room-editor" class="home-room-editor" hidden aria-label="Arrange room"><div class="home-material-row"><span data-home-text="material"></span><button id="home-material-warm" data-material="warm" data-home-text="warm"></button><button id="home-material-sage" data-material="sage" data-home-text="sage"></button><button id="home-material-blue" data-material="blue" data-home-text="blue"></button></div><label><span data-home-text="furniture"></span> <select id="home-item-select"></select></label><div class="home-item-moves"><button id="home-item-left">←</button><button id="home-item-forward">↑</button><button id="home-item-back">↓</button><button id="home-item-right">→</button><button id="home-item-rotate" data-home-text="rotate"></button></div><div class="home-save-row"><button id="home-cancel" data-home-text="cancel"></button><button id="home-save" data-home-text="save"></button></div></section>
      <div id="home-joystick" class="home-joystick" role="group" aria-label="Move around the room"><span id="home-stick"></span><small data-home-text="move"></small></div>`;
    document.body.append(this.ui);
    const on = (id: string, fn: () => void) => this.get(id).addEventListener('click', fn, { signal: this.abort.signal });
    on('home-exit', () => { if (this.nearExit()) void this.leave(); });
    on('home-arrange', () => this.beginEditing());
    on('home-cancel', () => this.cancelEditing());
    on('home-save', () => void this.saveDraft());
    on('home-retry', () => void this.recover());
    for (const material of ['warm', 'sage', 'blue'] as const) on(`home-material-${material}`, () => {
      if (!this.canChange() || !this.draft) return;
      this.draft.material = material; this.dirty = true; this.applyTheme(material); this.setStatus('edited'); this.updateControls();
    });
    this.get<HTMLSelectElement>('home-item-select').addEventListener('change', e => { this.selected = (e.target as HTMLSelectElement).value; }, { signal: this.abort.signal });
    on('home-item-left', () => this.changeItem(-.25, 0)); on('home-item-right', () => this.changeItem(.25, 0));
    on('home-item-forward', () => this.changeItem(0, -.25)); on('home-item-back', () => this.changeItem(0, .25));
    on('home-item-rotate', () => this.changeItem(0, 0, Math.PI / 2));
    window.addEventListener('keydown', this.keyDown, { capture: true, signal: this.abort.signal });
    window.addEventListener('keyup', this.keyUp, { capture: true, signal: this.abort.signal });
    window.addEventListener('blur', () => this.clearInput(), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clearInput(); void this.flush(); } }, { signal: this.abort.signal });
    const joystick = this.get('home-joystick');
    const drag = (e: PointerEvent) => { const rect = joystick.getBoundingClientRect(); this.stick.set((e.clientX - rect.left - rect.width / 2) / 34, (e.clientY - rect.top - rect.height / 2) / 34).clampLength(0, 1); this.get('home-stick').style.transform = `translate(${this.stick.x * 25}px,${this.stick.y * 25}px)`; };
    joystick.addEventListener('pointerdown', e => { if (this.editing || !this.online || this.pendingAction) return; e.preventDefault(); this.stickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); drag(e); }, { signal: this.abort.signal });
    joystick.addEventListener('pointermove', e => { if (this.stickPointer === e.pointerId) drag(e); }, { signal: this.abort.signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(name, () => { this.stickPointer = null; this.stick.set(0, 0); this.get('home-stick').style.transform = ''; }, { signal: this.abort.signal });
    this.localize();
  }

  private get<E extends HTMLElement = HTMLElement>(id: string) { return this.ui.querySelector<E>(`#${id}`)!; }
  private text(key: string) { return translation[key]?.[this.locale.startsWith('zh') ? 1 : 0] ?? key; }
  private localize() {
    this.locale = document.documentElement.lang;
    this.ui.querySelectorAll<HTMLElement>('[data-home-text]').forEach(el => { el.textContent = this.text(el.dataset.homeText!); });
    for (const direction of ['left', 'right', 'forward', 'back']) this.get(`home-item-${direction}`).setAttribute('aria-label', this.text(direction));
    this.populateItems(); this.setStatus(this.statusKey); this.updateControls();
  }
  private setStatus(key: string) { this.statusKey = key; this.get('home-room-status').textContent = this.text(key); }
  private clearInput() { this.keys.clear(); this.stick.set(0, 0); this.moving = 0; this.get('home-stick').style.transform = ''; }
  private keyDown = (event: KeyboardEvent) => {
    if (!this.active || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as Element)?.closest('input,select,textarea,[contenteditable]')) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'escape', ' '].includes(key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (key === 'e' && !event.repeat && this.nearExit()) void this.leave();
      else if (key === 'escape' && this.editing) this.cancelEditing();
      else this.keys.add(key);
    }
  };
  private keyUp = (event: KeyboardEvent) => { if (!this.active) return; this.keys.delete(event.key.toLowerCase()); };

  receive(player: PlayerState) {
    const location = player.location;
    if (!player.home || location?.kind !== 'interior') { if (this.active) this.close(); return; }
    const visit = `${location.interiorId}:${location.visitEpoch}`;
    const arriving = visit !== this.currentVisit;
    this.acknowledged = player; this.home = player.home;
    if (arriving) {
      this.currentVisit = visit; this.position = [...location.position]; this.yaw = location.yaw;
      this.entryAt = this.elapsed; this.exitArmed = false; this.editing = false; this.dirty = false; this.clearInput();
      this.draft = copy(player.home.interior); this.draftVersion = this.draft.version; this.selected = this.draft.items[0]?.id ?? '';
      this._active = true; this.ui.hidden = false; document.body.classList.add('home-interior-active');
      this.avatar.setColor(player.character); this.online = true; this.setStatus(player.home.canEdit ? 'entering' : 'readonly');
    }
    const sourceKey = `${player.home.interiorId}:${player.home.interior.version}`;
    if (sourceKey !== this.sourceKey) {
      this.sourceKey = sourceKey;
      if (!this.editing || this.pendingAction) { this.draft = copy(player.home.interior); this.draftVersion = this.draft.version; }
      this.buildRoom(); this.buildFurniture(); this.applyTheme((this.draft ?? player.home.interior).material);
    }
    this.avatar.setColor(player.character); this.populateItems(); this.updateControls();
  }

  setOnline(online: boolean) { this.online = online; if (!online) { this.clearInput(); this.setStatus('offline'); } this.updateControls(); }

  /** Only scoped indoor visitors belong here. Position is planar, never normalized. */
  receivePresence(snapshot: PresenceSnapshot) {
    if (!this.active || snapshot.scope !== `home:${this.home?.buildingId}` || snapshot.visitEpoch !== this.acknowledged?.location?.visitEpoch) return;
    const current = new Set(snapshot.visitors.map(v => v.id));
    for (const [id, guest] of this.guests) if (!current.has(id)) { disposeGeometry(guest.root); this.guests.delete(id); }
    for (const visitor of snapshot.visitors.slice(0, 8)) {
      let guest = this.guests.get(visitor.id);
      if (!guest) { guest = courier(visitor.character); guest.root.traverse(o => { if (o instanceof T.Mesh) o.castShadow = false; }); this.scene.add(guest.root); this.guests.set(visitor.id, guest); }
      guest.setColor(visitor.character); guest.root.position.fromArray(visitor.position); guest.root.rotation.y = Math.atan2(visitor.facing[0], visitor.facing[2]);
    }
  }

  private buildRoom() {
    this.surfaceResourceDisposers.forEach(dispose => dispose()); this.surfaceResourceDisposers = [];
    disposeGeometry(this.room); this.room = new T.Group(); this.scene.add(this.room);
    const interior = this.draft ?? this.home!.interior, { width, depth, height } = interior.room;
    const b = new PartBuilder('medium'), source = libraryMaterials(this.library), kit = makeKit(b, source);
    const part = (id: PartId, x: number, z: number, yaw = 0) => b.within({ position: [x, 0, z], rotation: [0, yaw, 0] }, () => emitPart(id, 'village', kit));
    for (let x = -.5 * width + .5; x < width / 2; x++) for (let z = -.5 * depth + .5; z < depth / 2; z++) part('floor.deck', x, z);
    // Back and left walls remain at full height. Front/right walls are a visual
    // cutaway; the shared planar collision boundary remains authoritative.
    for (let x = -.5 * width + .5; x < width / 2; x++) {
      part(Math.abs(x) < 1.1 ? 'wall.window' : 'wall.solid', x, -depth / 2, Math.PI);
      if (height > 2.04) b.box(kit.m('skinInner'), [1, height - 2.04, .18], { position: [x, (height + 2.04) / 2, -depth / 2] }, 0);
    }
    for (let z = -.5 * depth + .5; z < depth / 2; z++) {
      part(z < 0 ? 'wall.window' : 'wall.solid', -width / 2, z, -Math.PI / 2);
      if (height > 2.04) b.box(kit.m('skinInner'), [.18, height - 2.04, 1], { position: [-width / 2, (height + 2.04) / 2, z] }, 0);
    }
    b.box(kit.m('post'), [width + .14, .12, .2], { position: [0, height, -depth / 2] }, 0);
    b.box(kit.m('post'), [.2, .12, depth + .14], { position: [-width / 2, height, 0] }, 0);
    // Low visible edge describes the cutaway and preserves a clear exit opening.
    b.box(kit.m('post'), [.1, .14, depth], { position: [width / 2, .02, 0] }, 0);
    for (const side of [-1, 1]) b.box(kit.m('post'), [(width - 1.2) / 2, .14, .1], { position: [side * (width / 4 + .3), .02, depth / 2] }, 0);
    for (const x of [-width / 2, width / 2]) b.box(kit.m('post'), [.14, .22, .14], { position: [x, .04, depth / 2] }, 0);
    const built = b.build('home-room-kit'); this.room.add(built.group);
    this.surfaceResourceDisposers.push(() => source.owned().forEach(material => material.dispose()));
    const mat = new T.MeshBasicMaterial({ color: '#e6c578', transparent: true, opacity: .7, depthWrite: false });
    const doorway = new T.Mesh(new T.PlaneGeometry(1.05, .35), mat); doorway.rotation.x = -Math.PI / 2; doorway.position.set(0, .015, HOME_EXIT[2]); this.room.add(doorway);
    const arrow = new T.Shape(); arrow.moveTo(-.15, -.08); arrow.lineTo(.15, -.08); arrow.lineTo(0, .14); arrow.closePath();
    const marker = new T.Mesh(new T.ShapeGeometry(arrow), new T.MeshBasicMaterial({ color: '#4c6758', side: T.DoubleSide })); marker.rotation.x = Math.PI / 2; marker.position.set(0, .024, HOME_EXIT[2]); this.room.add(marker);
    this.lastViewport = '';
  }

  private buildFurniture() {
    disposeGeometry(this.furniture); this.furniture = new T.Group(); this.scene.add(this.furniture);
    for (const item of (this.draft ?? this.home!.interior).items) {
      const b = new PartBuilder('medium'), source = libraryMaterials(this.library), kit = makeKit(b, source);
      emitPart(PART[item.kind], 'village', kit); const built = b.build(`home-item-${item.id}`);
      // Catalogue edge furniture uses its back edge as origin; indoor records
      // use footprint centres. Recenter without changing scale or height.
      const box = new T.Box3().setFromObject(built.group), center = box.getCenter(new T.Vector3());
      built.group.position.set(-center.x, 0, -center.z);
      const root = new T.Group(); root.add(built.group); root.position.fromArray(item.position); root.rotation.y = item.yaw; root.userData.homeItem = item.id; this.furniture.add(root);
      source.owned().forEach(material => { material.userData.ownedResource = true; });
    }
  }

  private applyTheme(material: InteriorData['material']) {
    const [plaster, paint] = THEMES[material];
    for (const root of [this.room, this.furniture]) root.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshStandardMaterial) {
        if (m.name === 'custom:village:plaster') m.color.set(plaster);
        if (m.name === 'custom:village:paint') m.color.set(paint);
      }
    });
  }

  private canChange() { return this.active && this.online && this.home?.canEdit && this.editing && !this.pendingAction; }
  private beginEditing() { if (!this.home?.canEdit || !this.online || this.pendingAction) return; this.clearInput(); this.editing = true; this.draft = copy(this.home.interior); this.draftVersion = this.draft.version; this.selected ||= this.draft.items[0]?.id ?? ''; this.populateItems(); this.updateControls(); }
  private cancelEditing() { if (this.pendingAction || !this.home) return; this.editing = false; this.dirty = false; this.draft = copy(this.home.interior); this.buildFurniture(); this.applyTheme(this.draft.material); this.setStatus('saved'); this.updateControls(); }
  private populateItems() {
    const select = this.get<HTMLSelectElement>('home-item-select'), items = this.draft?.items ?? [];
    const signature = items.map(i => `${i.id}:${i.kind}`).join('|') + this.locale;
    if (select.dataset.items !== signature) { select.replaceChildren(...items.map((item, i) => new Option(`${this.text(item.kind)} ${i + 1}`, item.id))); select.dataset.items = signature; }
    if (!items.some(i => i.id === this.selected)) this.selected = items[0]?.id ?? '';
    select.value = this.selected;
  }
  private changeItem(x: number, z: number, yaw = 0) {
    if (!this.canChange() || !this.draft) return;
    const candidate = copy(this.draft), item = candidate.items.find(i => i.id === this.selected); if (!item) return;
    item.position[0] += x; item.position[2] += z; item.yaw = (item.yaw + yaw) % (Math.PI * 2);
    if (!homeFurnitureFits(candidate.items, this.position)) { this.setStatus('blocked'); return; }
    this.draft = candidate; this.dirty = true; this.buildFurniture(); this.applyTheme(candidate.material); this.setStatus('edited'); this.updateControls();
  }
  private nearExit() { return this.active && Math.abs(this.position[0] - HOME_EXIT[0]) < .7 && this.position[2] > HOME_EXIT[2] - .85; }
  private updateControls() {
    const enabled = this.online && !this.pendingAction;
    this.get<HTMLButtonElement>('home-exit').disabled = !enabled || !this.nearExit() || this.editing;
    this.get('home-exit').title = this.text('door');
    this.get('home-arrange').hidden = !this.home?.canEdit || this.editing;
    this.get<HTMLButtonElement>('home-arrange').disabled = !enabled;
    this.get('home-room-editor').hidden = !this.editing;
    this.get('home-retry').hidden = this.online;
    this.get('home-joystick').hidden = this.editing;
    this.get<HTMLButtonElement>('home-save').disabled = !enabled || !this.dirty;
    this.get<HTMLButtonElement>('home-cancel').disabled = this.pendingAction;
    this.get('home-room-hint').textContent = this.editing ? this.text('edited') : this.text(innerWidth < 700 ? 'phoneHint' : 'hint');
    const selected = this.draft?.items.find(item => item.id === this.selected);
    this.selection.visible = this.editing && !!selected;
    if (selected) { const box = homeItemBounds(selected); this.selection.position.set(selected.position[0], .022, selected.position[2]); this.selection.scale.set((box.maxX - box.minX + .2) * 1.5, (box.maxZ - box.minZ + .2) * 1.5, 1); }
    for (const material of ['warm', 'sage', 'blue']) this.get(`home-material-${material}`).setAttribute('aria-pressed', String(this.draft?.material === material));
    this.ui.querySelectorAll<HTMLButtonElement>('.home-item-moves button,.home-material-row button').forEach(b => { b.disabled = !enabled; });
  }

  frame(delta: number, nowSeconds: number) {
    if (!this.active || !this.home) return;
    this.elapsed = nowSeconds;
    if (document.documentElement.lang !== this.locale) this.localize();
    const dt = Math.min(.05, Math.max(0, delta));
    this.moving = 0;
    if (this.online && !this.pendingAction && !this.editing && !document.hidden) {
      const input = new T.Vector2(this.stick.x + Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')), this.stick.y + Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'))).clampLength(0, 1);
      // Screen-space controls against the fixed indoor camera.
      const right = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0); right.y = 0; right.normalize();
      const forward = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), right).normalize();
      const direction = right.multiplyScalar(input.x).addScaledVector(forward, -input.y);
      const before: Vec3 = [...this.position], room = this.home.interior;
      const acknowledged = this.acknowledged?.location;
      const canMove = (candidate: Vec3) => homePositionAllowed(candidate, room.items) && (acknowledged?.kind !== 'interior' || homePathAllowed(acknowledged.position, candidate, room.items));
      const steps = Math.max(1, Math.ceil(direction.length() * 2.5 * dt / .04));
      for (let i = 0; i < steps; i++) {
        const next: Vec3 = [this.position[0] + direction.x * 2.5 * dt / steps, 0, this.position[2] + direction.z * 2.5 * dt / steps];
        if (canMove(next)) this.position = next;
        else {
          const x: Vec3 = [next[0], 0, this.position[2]], z: Vec3 = [this.position[0], 0, next[2]];
          if (canMove(x)) this.position = x; else if (canMove(z)) this.position = z;
        }
      }
      this.moving = distance(before, this.position) / Math.max(dt, .001);
      if (this.moving > .01) this.yaw = (Math.atan2(this.position[0] - before[0], this.position[2] - before[2]) + Math.PI * 2) % (Math.PI * 2);
      if (input.lengthSq() < .01 || !this.nearExit()) this.exitArmed = true;
      if (this.exitArmed && nowSeconds - this.entryAt > .65 && Math.abs(this.position[0]) < .55 && this.position[2] > HOME_EXIT[2] - .16 && input.lengthSq() > .05) void this.leave();
      if (nowSeconds - this.lastSend > .14) { this.lastSend = nowSeconds; void this.flush(); }
    }
    this.avatar.root.position.fromArray(this.position); this.avatar.root.rotation.y = this.yaw;
    this.avatar.animate(nowSeconds, this.moving, matchMedia('(prefers-reduced-motion: reduce)').matches);
    for (const guest of this.guests.values()) guest.animate(nowSeconds, 0, true);
    const viewport = `${innerWidth}:${innerHeight}:${this.home.interior.room.width}:${this.home.interior.room.depth}`;
    if (viewport !== this.lastViewport) { const r = this.home.interior.room; fitHomeCamera(this.camera, r.width, r.depth, r.height, innerWidth / innerHeight, innerWidth < 700); this.lastViewport = viewport; }
    this.options.renderer.render(this.scene, this.camera);
    const canvas = this.options.renderer.domElement;
    canvas.dataset.homeInterior = this.home.interiorId; canvas.dataset.homePosition = JSON.stringify(this.position); canvas.dataset.homeVersion = String(this.home.interior.version);
    canvas.dataset.homePending = String(this.pendingAction || !!this.pendingMove); canvas.dataset.homeDrawCalls = String(this.options.renderer.info.render.calls);
    this.updateControls();
  }

  async flush(): Promise<void> {
    if (this.pendingMove) { await this.pendingMove; return; }
    const saved = this.acknowledged?.location;
    if (!this.active || !this.online || !this.home || saved?.kind !== 'interior' || distance(this.position, saved.position) < .005) return;
    const visit = this.currentVisit;
    const body = { buildingId: this.home.buildingId, visitEpoch: saved.visitEpoch, sequence: saved.sequence + 1, position: [...this.position] as Vec3, yaw: this.yaw };
    this.pendingMove = this.options.move(body).then(next => { if (visit !== this.currentVisit) return; this.receive(next); this.options.applyPlayer(next); }).catch(error => {
      if (visit !== this.currentVisit) return;
      if (this.acknowledged?.location?.kind === 'interior') this.position = [...this.acknowledged.location.position];
      this.setOnline(false); this.get('home-room-status').textContent = error instanceof Error ? error.message : this.text('offline');
    }).finally(() => { this.pendingMove = null; });
    await this.pendingMove;
  }
  private async saveDraft() {
    if (!this.canChange() || !this.home || !this.draft || !this.dirty) return;
    this.clearInput(); this.pendingAction = true; this.updateControls(); this.setStatus('saving');
    try {
      await this.flush(); await this.flush(); if (!this.online) return;
      const next = await this.options.save({ buildingId: this.home.buildingId, expectedVersion: this.draftVersion, material: this.draft.material, items: this.draft.items });
      this.editing = false; this.dirty = false; this.receive(next.player); this.options.applyUniverse(next); this.setStatus('saved');
    } catch (error) { this.get('home-room-status').textContent = error instanceof Error ? error.message : this.text('offline'); }
    finally { this.pendingAction = false; this.updateControls(); }
  }
  private async leave() {
    const location = this.acknowledged?.location;
    if (!this.online || this.pendingAction || this.editing || !this.home || location?.kind !== 'interior') return;
    this.pendingAction = true; this.clearInput(); this.setStatus('pending'); this.updateControls();
    try {
      await this.flush(); await this.flush(); if (!this.online) return;
      const next = await this.options.exit({ buildingId: this.home.buildingId, visitEpoch: location.visitEpoch });
      this.receive(next.player); this.options.applyUniverse(next);
    } catch (error) { this.setOnline(false); this.get('home-room-status').textContent = error instanceof Error ? error.message : this.text('offline'); }
    finally { this.pendingAction = false; this.updateControls(); }
  }
  private async recover() {
    if (this.pendingAction) return;
    this.pendingAction = true; this.clearInput();
    try { const next = await this.options.recover(); this.currentVisit = ''; this.receive(next.player); this.options.applyUniverse(next); this.setOnline(true); }
    catch (error) { this.get('home-room-status').textContent = error instanceof Error ? error.message : this.text('offline'); }
    finally { this.pendingAction = false; this.updateControls(); }
  }
  private close() {
    this._active = false; this.ui.hidden = true; this.currentVisit = ''; this.sourceKey = ''; this.clearInput(); this.editing = false; this.dirty = false;
    document.body.classList.remove('home-interior-active');
    for (const guest of this.guests.values()) disposeGeometry(guest.root); this.guests.clear();
    for (const key of ['homeInterior', 'homePosition', 'homeVersion', 'homePending', 'homeDrawCalls']) delete this.options.renderer.domElement.dataset[key];
  }
  dispose() {
    this.close(); this.abort.abort(); this.ui.remove(); this.surfaceResourceDisposers.forEach(dispose => dispose());
    disposeGeometry(this.room); disposeGeometry(this.furniture); disposeGeometry(this.avatar.root); disposeGeometry(this.selection); this.library.dispose();
  }
}
