import type { Universe } from '../shared/planets.ts';
import { NPCS, distance } from '../shared/world.ts';
import type { PlayerState, Vec3 } from '../shared/world.ts';
import { stationSites } from '../shared/teleport.ts';
import './tutorial.css';

export interface TutorialTarget { kind: 'mica' | 'sol' | 'gate' | 'home'; position: Vec3; planetId: string }
export type TutorialStepKind = 'mica' | 'sol' | 'preparing' | 'gate' | 'home' | 'complete' | 'return-hub' | 'return-home' | 'legacy';
export interface TutorialStep { kind: TutorialStepKind; number: number; target: TutorialTarget | null }
export interface TutorialRouteFeedback {
  state: 'checking' | 'ready' | 'unavailable';
  /** Bind diagnostics to the target that was actually checked, never a stale
   * route from a previous world or an earlier quest step. */
  planetId: string;
  targetKind: TutorialTarget['kind'];
  arrived?: boolean;
}
export interface TutorialContext { universe: Universe; online: boolean; ready: boolean; paused?: boolean; touch?: boolean; route?: TutorialRouteFeedback }
export type TutorialPreparation = 'pending' | 'preparing' | 'retry' | 'ready';
interface Arrival { version: 1; homePreparation: TutorialPreparation; homePlanetId: string | null }
type Preference = 'active' | 'skipped' | 'completed';
export const TUTORIAL_KEY = 'little-worlds:core-guide:v1';

/** No browser identity, cookies, task counters or transforms enter this setting.
 * It is a browser preference: clearing only cookies can retain Skip, and the
 * menu can always reopen it. Pending → ready never creates a second guide. */
function arrivalOf(player: PlayerState): Arrival | undefined {
  const arrival = (player as PlayerState & {arrival?: Arrival}).arrival;
  return arrival?.version === 1 && ['pending', 'preparing', 'retry', 'ready'].includes(arrival.homePreparation) ? arrival : undefined;
}
function gateTarget(universe: Universe): TutorialTarget | null {
  const planet = universe.currentPlanet;
  if (planet.id !== 'hub' && planet.id !== universe.ownedPlanetId) return null;
  const sites = stationSites(planet), radius = planet.radius ?? 10;
  const site = [...sites].sort((a, b) => distance(universe.player.position, a.interact, radius) - distance(universe.player.position, b.interact, radius))[0];
  return site ? {kind: 'gate', position: [...site.interact], planetId: planet.id} : null;
}

/** Every progression condition is an acknowledged server field. Nearby local
 * movement, clicking a button, or a predicted API result cannot advance this. */
export function deriveTutorialStep(universe: Universe): TutorialStep {
  const player = universe.player, planet = universe.currentPlanet, arrival = arrivalOf(player);
  const ground = player.flight.mode === 'ground', exterior = player.location?.kind !== 'interior';
  const homeId = universe.ownedPlanetId;
  if (!arrival && (!homeId || !player.home)) return {kind: 'legacy', number: 0, target: null};
  if (player.quest !== 'delivered') {
    const kind = player.quest === 'carrying' ? 'sol' : 'mica', number = kind === 'mica' ? 1 : 2;
    if (planet.kind !== 'hub' || !ground || !exterior) return {kind: 'return-hub', number, target: ground && exterior ? gateTarget(universe) : null};
    return {kind, number, target: {kind, position: [...NPCS[kind].position], planetId: planet.id}};
  }
  if (ground && planet.id === homeId && player.home?.planetId === homeId && player.home.canEdit) {
    if (player.location?.kind === 'interior' && player.location.planetId === homeId && player.location.buildingId === player.home.buildingId && player.location.interiorId === player.home.interiorId) return {kind: 'complete', number: 5, target: null};
    return {kind: 'home', number: 4, target: {kind: 'home', position: [...player.home.door.position], planetId: homeId}};
  }
  if (!homeId || (arrival && (arrival.homePreparation !== 'ready' || arrival.homePlanetId !== homeId))) return {kind: 'preparing', number: 3, target: null};
  if (ground && exterior && planet.kind === 'hub') return {kind: 'gate', number: 3, target: gateTarget(universe)};
  return {kind: 'return-home', number: 3, target: null};
}

const copy = {
  en: {
    heading: 'A little welcome', progress: 'One small step', skip: 'Skip guide', close: 'Keep exploring', retry: 'Retry home preparation', retrying: 'Asking to retry…',
    micaTitle: 'Meet Mica at the post office', mica: 'Near Mica, press E or tap Collect the parcel. This small delivery is your first destination.',
    solTitle: 'Bring the sunseeds to Sol', sol: 'The parcel is saved. Near Sol at the glasshouse, press E or tap Deliver to Sol.',
    preparingTitle: 'A home is being prepared', preparing: 'Your delivery is saved. Stay and explore the village while your home is prepared. The gate becomes your next goal when the server confirms it is ready.',
    gateTitle: 'The village gate leads home', gate: 'Stand beside its glowing pad, then press E or tap Return to my home. It links this village and your own home only.',
    homeTitle: 'Walk to your front door', home: 'At your own doorway, open the door if it is closed, then press E or tap Enter home. The workshop, ship and decorating can wait.',
    completeTitle: 'Welcome home', complete: 'Delivery complete and you are inside your home. That is the core loop. Your next visit resumes your saved place. Explore, or choose your own next idea.',
    returnHubTitle: 'Continue at the main village', returnHub: 'Your saved journey stays where it is. At your home, use its gate to the main planet. In flight or on another world, use Atlas to mark the main planet, return to your ship and land there.',
    returnHomeTitle: 'Return to your own home', returnHome: 'Your delivery is already complete. In flight, mark your own planet in Atlas and land; on another world, return to your parked ship. At the main village, its gate takes you home.',
    legacyTitle: 'Your existing journey is preserved', legacy: 'Your existing ownership and travel stay as saved. If you have no home yet, find your ship, mark a Blank · unclaimed world in Atlas, fly there and land. Pause → Make this my planet → Build on my planet. Already own a planet? Mark it in Atlas and keep using its Build controls. Gates link your own home and the main planet only; they cannot claim a home for you.',
    movement: 'WASD / arrows walk · Shift runs · Space jumps · E interacts. Drag to turn, or tap the ground.', touchMovement: 'Use the thumbstick to walk, drag to turn, and tap the nearby action. Run and Jump remain on screen.',
    offline: 'Connection interrupted. Waiting for your saved state; no step has been confirmed.', preparingShort: 'Home: preparing in the background.', retryShort: 'Home preparation needs another try. Your journey remains saved.', readyShort: 'Home: ready when you are.',
    retryError: 'The retry could not be confirmed. Reconnect and try again; your current journey is unchanged.',
    collected: 'Parcel collected · saved', delivered: 'A small kindness delivered · saved', arrived: 'Home reached · confirmed',
    routeChecking: 'Checking a walkable route nearby…',
    routeReady: 'Follow the bright route to the destination ring.',
    routeArrived: 'You are near the destination ring. Use the nearby action.',
    routeUnavailable: 'No safe connection to the path was found here. The ring still marks your destination. Return to the stone path to try again; avoid cutting through buildings. You can skip the guide.',
  },
  zh: {
    heading: '小小的欢迎', progress: '一次一个小目标', skip: '跳过引导', close: '继续探索', retry: '重试准备家园', retrying: '正在请求重试…',
    micaTitle: '去邮局认识 Mica', mica: '靠近 Mica 后按 E 或点击“领取包裹”。这趟小小的投递就是你的第一个目标。',
    solTitle: '把太阳种子送给 Sol', sol: '包裹已保存。靠近玻璃花房的 Sol 后按 E 或点击“交给 Sol”。',
    preparingTitle: '你的家园正在准备', preparing: '投递已保存。家园准备期间可以继续逛村庄。服务端确认准备完成后，传送门会成为下一个目标。',
    gateTitle: '村庄的传送门通往家园', gate: '站在传送门的发光踏台旁，按 E 或点击“回到我的家园”。它只连接主世界与你自己的家园。',
    homeTitle: '走到你家的门口', home: '到自家门口后，门关着时先开门，再按 E 或点击“进入家园”。工坊、飞船和装修都可以以后再学。',
    completeTitle: '欢迎回家', complete: '投递已完成，你也已进入自家房间。核心循环到这里就完成了；下次到访会继续原存档。接下来可以随意探索，选择自己的新点子。',
    returnHubTitle: '回主世界继续这一小步', returnHub: '当前旅程与位置保持不变。在自家可以用传送门去主世界；飞行中或在其他星球时，在星图标记主世界，返回自己的飞船并在那里降落。',
    returnHomeTitle: '回到你自己的家园', returnHome: '你的投递已经完成。飞行中可在星图标记自家星球再降落；在别的星球先返回停泊的飞船。回到主世界后，它的传送门会带你回家。',
    legacyTitle: '继续你已有的旅程', legacy: '已有的归属与旅程保持原存档。还没有家园时，先找飞船，在星图标记“空白 · 未认领”星球，飞过去并降落，再从暂停菜单选择“认领这颗星球”→“在我的星球建造”。已经认领过时，可在星图标记自家星球，继续用原来的建造入口。传送门只连接自家与主世界，不能替你认领家园。',
    movement: 'WASD / 方向键行走 · Shift 跑步 · 空格跳跃 · E 互动；拖动画面转向，也可以点击地面。', touchMovement: '用摇杆行走，拖动画面转向，点击附近的互动按钮；屏幕上也有跑步与跳跃按钮。',
    offline: '连接暂时中断，正在等待已保存状态；尚未确认新的步骤。', preparingShort: '家园：正在后台准备。', retryShort: '家园准备需要重试，当前旅程仍然保存。', readyShort: '家园：已经准备好了，随时可以回家。',
    retryError: '重试还未得到确认，请恢复连接后再试；当前旅程没有改变。',
    collected: '包裹已领取 · 已保存', delivered: '这份小小善意已送达 · 已保存', arrived: '已经回家 · 已确认',
    routeChecking: '正在确认附近可走路线…',
    routeReady: '跟随鲜艳路线走向目标圈。',
    routeArrived: '已经靠近目标圈，可以使用附近的互动按钮。',
    routeUnavailable: '暂未找到安全接路。目标圈仍标着目的地；请先回到石路再尝试，不要直穿建筑。也可以跳过引导。',
  },
};

export interface TutorialOptions { read(): TutorialContext | null; retryHome?: () => Promise<void> }
export function mountTutorial(options: TutorialOptions) {
  let preference: Preference | null = null;
  try {
    const saved = localStorage.getItem(TUTORIAL_KEY);
    if (saved === 'active' || saved === 'skipped' || saved === 'completed') preference = saved;
  } catch { /* Optional browser preference; acknowledged state remains authoritative. */ }
  let context: TutorialContext | null = null, step: TutorialStep | null = null, disposed = false;
  let reviewing = false, retryPending = false, retryError = false, completionUntil = 0, lastPaint = -Infinity;
  let feedback: 'collected' | 'delivered' | 'arrived' | null = null, feedbackUntil = 0, lastQuest: PlayerState['quest'] | undefined;
  const root = document.createElement('aside');root.id = 'core-tutorial';root.className = 'core-tutorial';root.hidden = true;root.dataset.i18nVerbatim = '';
  root.innerHTML = '<div class="tutorial-heading"><span class="tutorial-eyebrow"></span><button type="button" class="tutorial-skip"></button></div><p class="tutorial-progress"></p><h2></h2><p class="tutorial-copy"></p><p class="tutorial-route-status" role="status" aria-live="polite" hidden></p><p class="tutorial-feedback" role="status" aria-live="polite"></p><p class="tutorial-controls"></p><p class="tutorial-home-state" role="status"></p><button type="button" class="tutorial-retry"></button>';
  document.body.append(root);
  const get = <E extends HTMLElement = HTMLElement>(name: string) => root.querySelector<E>(name)!;
  const now = () => performance.now();
  const remember = (value: Preference) => {
    preference = value;try { localStorage.setItem(TUTORIAL_KEY, value); } catch { /* Optional local preference only. */ }
  };
  const isActive = () => !disposed && !!context && (preference === 'active' || reviewing || completionUntil > now());
  const canShow = () => !!context?.ready && !context.paused && !document.hidden
    && !document.body.matches('.scene-loading,.workshop-open,.shipyard-open,.history-open,.terrain-workshop-open,.departing')
    && !document.querySelector('dialog[open]');
  function clearRouteStatus() { get('.tutorial-route-status').hidden = true;get('.tutorial-route-status').textContent = '';delete root.dataset.routeState; }
  function hide() { root.hidden = true;clearRouteStatus();document.body.classList.remove('tutorial-active'); }
  function paint(force = false) {
    if (disposed) return;
    if (!context) return hide();
    const time = now();if (!force && time - lastPaint < 100) return;lastPaint = time;
    const player = context.universe.player, arrival = arrivalOf(player);
    if (preference === null && arrival) remember('active');
    if (!isActive()) { step = null;return hide(); }
    const previous = step;step = deriveTutorialStep(context.universe);
    if (lastQuest === 'available' && player.quest === 'carrying') { feedback = 'collected';feedbackUntil = time + 3500; }
    if (lastQuest !== undefined && lastQuest !== 'delivered' && player.quest === 'delivered') { feedback = 'delivered';feedbackUntil = time + 3500; }
    lastQuest = player.quest;
    if (step.kind === 'complete' && preference === 'active') {
      remember('completed');completionUntil = time + 8000;
      if (previous?.kind !== 'complete') { feedback = 'arrived';feedbackUntil = time + 3500; }
    }
    document.body.classList.add('tutorial-active');
    // Hide legacy tips synchronously so the two cards cannot flash together.
    const legacy = document.getElementById('first-visit-tip');if (legacy) legacy.hidden = true;
    if (!canShow()) { root.hidden = true;clearRouteStatus();return; }
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en', words = copy[language];
    root.setAttribute('aria-label', words.heading);get('.tutorial-eyebrow').textContent = words.heading;
    get('.tutorial-progress').textContent = step.number ? `${words.progress} · ${step.number} / 5` : words.progress;
    const titleKey = `${step.kind === 'return-hub' ? 'returnHub' : step.kind === 'return-home' ? 'returnHome' : step.kind}Title` as keyof typeof words;
    get('h2').textContent = words[titleKey];
    const textKey = (step.kind === 'return-hub' ? 'returnHub' : step.kind === 'return-home' ? 'returnHome' : step.kind) as keyof typeof words;
    get('.tutorial-copy').textContent = context.online ? words[textKey] : words.offline;
    const routeTarget = context.online && player.flight.mode === 'ground' && player.location?.kind !== 'interior' && step.target?.planetId === context.universe.currentPlanet.id ? step.target : null;
    const route = context.route;
    const routeState = routeTarget ? route?.planetId === routeTarget.planetId && route.targetKind === routeTarget.kind ? route.state : 'checking' : null;
    const routeStatus = get('.tutorial-route-status');
    routeStatus.hidden = routeState === null;
    routeStatus.textContent = routeState === 'unavailable' ? words.routeUnavailable : routeState === 'ready' ? route?.arrived ? words.routeArrived : words.routeReady : routeState === 'checking' ? words.routeChecking : '';
    if (routeState) root.dataset.routeState = routeState;else delete root.dataset.routeState;
    get('.tutorial-controls').textContent = context.touch ? words.touchMovement : words.movement;
    const completed = step.kind === 'complete';get('.tutorial-controls').hidden = completed;
    const skip = get<HTMLButtonElement>('.tutorial-skip');skip.textContent = completed ? words.close : words.skip;
    const status = get('.tutorial-home-state');status.hidden = !arrival || completed;
    status.textContent = retryError ? words.retryError : arrival?.homePreparation === 'ready' ? words.readyShort : arrival?.homePreparation === 'retry' ? words.retryShort : words.preparingShort;
    const retry = get<HTMLButtonElement>('.tutorial-retry');retry.hidden = arrival?.homePreparation !== 'retry' || !options.retryHome;
    retry.disabled = !context.online || retryPending;retry.textContent = retryPending ? words.retrying : words.retry;
    const response = get('.tutorial-feedback');response.hidden = !feedback || time >= feedbackUntil;response.textContent = feedback ? words[feedback] : '';
    root.dataset.step = step.kind;root.dataset.replaying = String(reviewing);root.hidden = false;
  }
  function frame(next: TutorialContext | null = options.read()) { context = next;paint(); }
  function receive(universe: Universe) {
    const base = options.read() ?? context;
    if (base) context = {...base, universe};paint(true);
  }
  function replay() {
    context = options.read() ?? context;if (!context || disposed) return;
    reviewing = true;retryError = false;remember('active');paint(true);
  }
  function skip() {
    if (disposed) return;
    reviewing = false;completionUntil = 0;remember(step?.kind === 'complete' ? 'completed' : 'skipped');step = null;hide();
    document.getElementById('open-menu')?.focus({preventScroll: true});
  }
  get<HTMLButtonElement>('.tutorial-skip').onclick = skip;
  get<HTMLButtonElement>('.tutorial-retry').onclick = async () => {
    if (!context?.online || retryPending || !options.retryHome || arrivalOf(context.universe.player)?.homePreparation !== 'retry') return;
    retryPending = true;retryError = false;paint(true);
    try { await options.retryHome(); } catch { retryError = true; }
    finally { retryPending = false;paint(true); }
  };
  const language = new MutationObserver(() => paint(true));language.observe(document.documentElement,{attributes: true,attributeFilter: ['lang']});
  function dispose() { if (disposed) return;disposed = true;language.disconnect();root.remove();document.body.classList.remove('tutorial-active'); }
  frame();
  return {
    frame, receive, replay, open: replay, skip, dispose,
    get active() { return isActive(); },get step() { return step; },
    get target(): TutorialTarget | null {
      if (!isActive() || !canShow() || !context?.online || context.universe.player.flight.mode !== 'ground' || context.universe.player.location?.kind === 'interior') return null;
      return step?.target?.planetId === context.universe.currentPlanet.id ? step.target : null;
    },
  };
}
