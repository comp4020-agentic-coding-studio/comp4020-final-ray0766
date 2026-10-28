import * as T from 'three';
import { courier } from './character.ts';
import { createTutorialRoute } from './tutorial-route.ts';
import { canWalkTutorialConnector, tutorialStationApproaches } from '../shared/tutorial-navigation.ts';
import type { GroundWorld } from '../shared/physics/world.ts';
import type { Universe } from '../shared/planets.ts';
import {distance,type Vec3} from '../shared/world.ts';
import {BOARD_RADIUS,portPoint} from '../shared/ports.ts';
import { GUIDE_HELP, GUIDE_TOPICS, guideTarget } from '../shared/world-guide.ts';
import type { GuideTopic } from '../shared/world-guide.ts';
import { guideShortcut, nearbyGuidePoint } from './guide-interaction.ts';
import './world-guide.css';
import {createGuideConversation} from './guide-conversation.ts';

const names = { en: ['My planet', 'Place a module', 'Find ship', 'Return', 'People & saving'], zh: ['自己的星球', '放一个模块', '寻找飞船', '传送返回', '多人和保存'] };
interface Frame {
  universe: Universe; position: Vec3; world: GroundWorld; enabled: boolean; visible: boolean; time: number; reducedMotion: boolean;
  scene: T.Scene; camera: T.Camera; feet: T.Vector3; up: T.Vector3; forward: T.Vector3;
  roomKey: string; indoor: boolean; online: boolean; stand(point:T.Vector3):T.Vector3|null;
}
/** A stationary local character and a right-side, non-modal conversation panel. */
export function createWorldGuide(scene: T.Scene, release: () => void) {
  let current: Frame | null=null, topic:GuideTopic='home', selected:GuideTopic|null=null, routePlanet='', roomKey='', lastPaint='', talking=false;
  const actor=courier('fern');actor.root.name='world-guide';actor.root.visible=false;scene.add(actor.root);
  const route=createTutorialRoute(scene,{surfacePoint(normal,offset=0){const w=current?.world;return normal.clone().setLength(w?w.support(normal.toArray() as Vec3,w.radius(normal.toArray() as Vec3)+.45).radius+offset:10+offset);}});
  const open=document.createElement('button');open.id='world-guide-open';open.type='button';document.querySelector('.minimal-bar')?.append(open);
  const menuOpen=document.createElement('button');menuOpen.id='world-guide-menu';menuOpen.type='button';document.getElementById('help')?.before(menuOpen);
  const homeOpen=document.createElement('button');homeOpen.id='world-guide-home';homeOpen.type='button';homeOpen.hidden=true;document.body.append(homeOpen);
  const homeChat=document.createElement('button');homeChat.id='world-guide-chat-home';homeChat.type='button';homeChat.hidden=true;document.body.append(homeChat);
  const bubble=document.createElement('section');bubble.id='world-guide-dialog';bubble.hidden=true;bubble.dataset.i18nVerbatim='';bubble.setAttribute('role','dialog');bubble.setAttribute('aria-modal','false');bubble.setAttribute('aria-labelledby','world-guide-title');
  bubble.innerHTML='<button id="world-guide-close" type="button" aria-label="Close">×</button><h2 id="world-guide-title"></h2><p id="world-guide-intro"></p><details id="world-guide-help" open><summary id="world-guide-help-title"></summary><div id="world-guide-topics"></div><p id="world-guide-answer" role="status"></p><p id="world-guide-availability"></p></details><button id="world-guide-walk" type="button"></button>';
  document.body.append(bubble);
  const chat=document.createElement('section');chat.id='world-guide-chat';chat.hidden=true;chat.dataset.i18nVerbatim='';chat.setAttribute('role','dialog');chat.setAttribute('aria-modal','false');chat.setAttribute('aria-labelledby','world-guide-chat-title');
  chat.innerHTML='<header><h2 id="world-guide-chat-title"></h2><button id="world-guide-chat-close" type="button" aria-label="Close chat">×</button></header><p id="world-guide-ai-status"></p><p id="world-guide-ai-quota"></p><div id="world-guide-messages" role="log" aria-live="polite"><p id="world-guide-ai-answer"></p></div><p id="world-guide-ai-result" role="status"></p><form id="world-guide-form"><label for="world-guide-question" id="world-guide-question-label"></label><div class="world-guide-input"><textarea id="world-guide-question" maxlength="500" rows="2"></textarea><button id="world-guide-ask" type="submit"></button></div></form><footer><button id="world-guide-ai-stop" type="button" hidden></button><button id="world-guide-refresh" type="button"></button><button id="world-guide-local" type="button"></button></footer>';
  document.body.append(chat);
  const chatOpen=document.createElement('button');chatOpen.id='world-guide-chat-open';chatOpen.type='button';document.querySelector('.minimal-bar')?.append(chatOpen);
  const hud=document.createElement('section');hud.id='world-guide-hud';hud.hidden=true;hud.dataset.i18nVerbatim='';hud.innerHTML='<p id="world-guide-status" role="status"></p><button id="world-guide-details" type="button"></button><button id="world-guide-stop" type="button"></button>';document.body.append(hud);
  const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById('world-guide-'+id)! as E;
  const language=()=>document.documentElement.lang.startsWith('zh')?'zh' as const:'en' as const;
  const ai=createGuideConversation({language,answer(text){el('ai-answer').textContent=text;const log=el('messages');log.scrollTop=log.scrollHeight;},changed(){lastPaint='';paint();}});
  function close(focus=false){ai.cancel();talking=false;bubble.hidden=true;chat.hidden=true;actor.root.visible=false;document.body.classList.remove('world-guide-talking');release();if(focus)document.querySelector<HTMLCanvasElement>('#world canvas')?.focus({preventScroll:true});}
  function select(value:GuideTopic){topic=value;selected=value==='save'?null:value;routePlanet=current?.universe.currentPlanet.id??'';route.root.visible=false;document.querySelector<HTMLButtonElement>('.tutorial-skip')?.click();paint();}
  function paint(){
    const lang=language(),zh=lang==='zh',target=current&&guideTarget(current.universe,topic),available=!!target&&!!current?.enabled&&!current.indoor;
    const aboard=current?.universe.player.flight.mode==='space',nearShip=topic==='visit'&&!current?.indoor&&!!current&&distance(current.position,portPoint(current.universe.currentPlanet.id),current.world.baseRadius)<BOARD_RADIUS-.12;
    const key=[lang,topic,selected,available,aboard,nearShip,current?.indoor,current?.online,route.diagnostics.reason,actor.root.visible,talking,ai.revision].join('|');if(key===lastPaint)return;lastPaint=key;
    homeChat.textContent=chatOpen.textContent=zh?'聊天 · DeepSeek':'Chat · DeepSeek';el('chat-close').setAttribute('aria-label',zh?'收起聊天':'Close chat');
    open.textContent=aboard?(zh?'向导 · 已登船':'Guide · Aboard'):(zh?'向导 · 空格':'Guide · Space');open.title=aboard?(zh?'你已在飞船中，使用目的地与航程控制；落地后可使用地面向导。':'You are already aboard. Use the destination and trip controls; ground guidance resumes after landing.'):(zh?'空格打开向导，选择寻找飞船。':'Space opens the guide. Choose Find ship.');open.setAttribute('aria-label',zh?'小星球向导':'World guide');menuOpen.textContent=homeOpen.textContent=zh?'小星球向导':'World guide';
    el('title').textContent=zh?'芽芽 · 小星球向导':'Sprout · World guide';
    el('intro').textContent=actor.root.visible?(zh?'我在你身边。可在右侧聊天，或展开固定帮助查看地面路线。':'I am beside you. Chat on the right, or open fixed help for ground directions.'):(zh?'附近没有安全的站立空位，仍可在此聊天或查看固定帮助。':'There is no safe standing space nearby; chat and fixed help remain available here.');
    el('topics').replaceChildren(...GUIDE_TOPICS.map((value,i)=>{const b=document.createElement('button');b.type='button';b.textContent=names[lang][i];b.dataset.topic=value;b.setAttribute('aria-pressed',String(topic===value));b.onclick=()=>select(value);return b;}));
    el('answer').textContent=GUIDE_HELP[topic][lang];
    el('availability').textContent=aboard?(zh?'你已在飞船中，请使用目的地与航程控制。':'You are already aboard; use the destination and trip controls.'):!current?.online?(zh?'当前离线。可以阅读本地帮助；重连后再继续路线。':'Offline. Local help is available; reconnect before continuing the route.'):current.indoor?(topic==='visit'?(zh?'第 1 步：关闭对话，从房门出去。第 2 步：室外地面箭头会继续指向飞船。':'Step 1: close this chat and leave through the room door. Step 2: ground arrows outside continue to your ship.'):(zh?'室内可交谈；请先出门，再显示室外目的地路线。':'You can talk indoors. Go outside before showing a route to an outdoor destination.')):nearShip?(zh?'飞船就在这里。关闭对话，按 E 或点击“登上飞船”，再选择目的地。':'Your ship is here. Close this chat, press E or choose Board your ship, then pick a destination.'):!available?(zh?'这里没有可用的步行目的地；请使用固定帮助。':'There is no walking destination here; use the fixed help.'):selected?(route.diagnostics.connected?(zh?'地面箭头已显示。向导不会领路；请自己沿路线行走。':'Ground arrows are shown. Sprout stays here; walk the route yourself.'):(zh?'正在确认安全路线。若无法连通，请回到附近石板路再试。':'Checking a safe route. If no route connects, return to the nearby stone path and try again.')):(zh?'点一个目的地，显示地面导航。':'Choose a destination to show ground directions.');
    ai.paint();
    el('walk').textContent=zh?'关闭并行走':'Close and walk';el('details').textContent=zh?'与向导交谈':'Talk to guide';el('stop').textContent=zh?'清除路线':'Clear route';el('close').setAttribute('aria-label',zh?'关闭向导':'Close guide');
    el('status').textContent=selected?(names[lang][GUIDE_TOPICS.indexOf(selected)]+' · '+(current?.indoor?(zh?'出门后继续':'Continue outside'):!current?.online?(zh?'等待重连':'Waiting for connection'):selected==='visit'&&nearShip?(zh?'可登船':'Ready to board'):route.diagnostics.reason==='arrived'?(zh?'已到达':'Arrived'):route.diagnostics.connected?(zh?'沿地面箭头行走':'Follow the ground arrows'):route.diagnostics.reason==='checking'?(zh?'检查路线中':'Checking route'):(zh?'没有已确认的安全路线':'No confirmed safe route'))):'';
  }
  function show(panel:'help'|'chat'='help'){
    if(!current?.visible)return;release();document.querySelector<HTMLDialogElement>('#menu-dialog')?.close();document.querySelector<HTMLButtonElement>('.tutorial-skip')?.click();
    const p=nearbyGuidePoint(current.feet,current.up,current.forward,current.stand);talking=true;document.body.classList.add('world-guide-talking');if(panel==='help')bubble.hidden=false;else chat.hidden=false;roomKey=current.roomKey;
    actor.root.removeFromParent();current.scene.add(actor.root);actor.root.visible=!!p;
    if(p){actor.root.position.copy(p);const up=current.up.clone().normalize(),forward=current.feet.clone().sub(p).projectOnPlane(up).normalize(),right=new T.Vector3().crossVectors(up,forward).normalize();actor.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward));actor.greet(current.time);}
    lastPaint='';paint();if(panel==='chat')void ai.refresh();el(panel==='chat'?'question':'close').focus({preventScroll:true});
  }
  open.onclick=menuOpen.onclick=homeOpen.onclick=el('details').onclick=()=>show('help');
  homeChat.onclick=chatOpen.onclick=()=>show('chat');
  el('local').addEventListener('click',()=>show('help'));
  el('chat-close').onclick=()=>{ai.cancel();chat.hidden=true;if(bubble.hidden)close(true);else el('close').focus();};
  el('close').onclick=()=>{bubble.hidden=true;if(chat.hidden)close(true);else el('question').focus();};
  el('walk').onclick=()=>close(true);
  el('stop').onclick=()=>{selected=null;route.root.visible=false;hud.hidden=true;paint();};
  el('form').onsubmit=event=>{event.preventDefault();void ai.ask();};
  let shortcutHeld=false;
  window.addEventListener('keyup',event=>{if(shortcutHeld&&(event.code==='Space'||event.key===' ')){shortcutHeld=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  window.addEventListener('blur',()=>{shortcutHeld=false;});
  window.addEventListener('keydown',event=>{
    if(shortcutHeld&&(event.code==='Space'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(guideShortcut(event)&&current?.visible&&!document.querySelector('dialog[open]')){shortcutHeld=true;event.preventDefault();event.stopImmediatePropagation();if(!bubble.hidden){bubble.hidden=true;if(chat.hidden)close(true);}else show();}
  },{capture:true});
  paint();
  return {get active(){return selected!==null;},get talking(){return talking;},close,findShip(){if(!current?.visible)return;select('visit');show();el<HTMLDetailsElement>('help').open=true;},frame(input:Frame){
    ai.tick(!chat.hidden);current=input;chatOpen.disabled=!input.visible;open.disabled=menuOpen.disabled=!input.visible;homeOpen.hidden=!input.visible||!input.indoor||!input.universe.player.location||input.universe.player.location.kind!=='interior';
    homeChat.hidden=homeOpen.hidden;
    if(talking&&(!input.visible||input.roomKey!==roomKey||!!document.querySelector('dialog[open]')))close();
    if(selected&&routePlanet!==input.universe.currentPlanet.id){selected=null;route.root.visible=false;}
    const target=selected?guideTarget(input.universe,selected):null;
    route.frame({position:input.position,target,planetId:input.universe.currentPlanet.id,radius:input.world.baseRadius,visible:!!selected&&input.visible&&!input.indoor,paused:!input.enabled,time:input.time,reducedMotion:input.reducedMotion,homeRoutes:input.universe.currentPlanet.homeManifest?.routes,routeRevision:input.universe.currentPlanet.revision,stationApproaches:tutorialStationApproaches(input.universe.currentPlanet),canConnect:(a,b)=>canWalkTutorialConnector(input.world,a,b)});
    hud.hidden=!selected||!input.visible||talking;
    if(talking){
      if(actor.root.visible&&!input.stand(actor.root.position.clone()))actor.root.visible=false;
      actor.animate(input.time,0,input.reducedMotion);

    }
    paint();return {mode:talking?'talking':selected?'route':'idle',position:actor.root.visible?actor.root.position.toArray():null,topic,selected,route:route.root.visible?route.diagnostics.reason:'hidden',routeVisible:route.root.visible,aiEnabled:ai.enabled,actorVisible:actor.root.visible};
  }};
}
