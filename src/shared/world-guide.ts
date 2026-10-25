import type { Universe } from './planets.ts';
import { portPoint } from './ports.ts';
import { stationSites } from './teleport.ts';
import type { TutorialTarget } from './tutorial-navigation.ts';

export type GuideTopic = 'home' | 'build' | 'visit' | 'return' | 'save';
export const GUIDE_TOPICS: readonly GuideTopic[] = ['home', 'build', 'visit', 'return', 'save'];
export const GUIDE_HELP: Record<GuideTopic, { en: string; zh: string }> = {
  home: { en: 'Walk to a teleport gate and choose Return to my home. A first visit prepares a home in the background. If preparation pauses, Village guide offers Retry. Without a gate, use Atlas and your ship. Gates never claim another person’s planet.', zh: '走到传送门，选择“返回我的家园”。首次访问会在后台准备家园；准备暂停时，可从村庄引导重试。没有传送门时，用星图和飞船。传送不会认领他人的星球。' },
  build: { en: 'On your own planet, Pause → Build on my planet. Choose one module, place its preview on free ground, then Save. Preview is not saved until the server confirms. To build a custom module, use the workshop later. Visitors can look around but cannot edit your world.', zh: '在自己的星球打开暂停菜单 → 在我的星球建造。选一个模块，在空地放置预览，再保存。服务端确认后才算保存；自定义模块可稍后在工坊制作。访客可以参观，但不能编辑你的世界。' },
  visit: { en: 'Follow the ground arrows to your parked ship. Close this chat and press E or choose Board your ship, then choose a destination. Takeoff, flight and landing are automatic. Drag to look around. Click a planet to confirm a new destination. Skip waits for preparation; Cancel returns to departure.', zh: '沿地面箭头前往停泊的飞船。关闭对话，按 E 或点击“登上飞船”，再选择目的地，飞船自动起飞、航行和降落。拖动观察，点击星球并确认可更改目的地。跳过需等待准备完成；取消会返回出发地。' },
  return: { en: 'Any outdoor teleport gate can take you to the main planet or your own home. At a neighbour’s gate, E goes to the main planet; Return to my home goes directly home. If you have no home, the main planet is still available. Without a gate, return to your parked ship. Private rooms remain owner-only.', zh: '任何室外传送门都能带你回主星球或自己的家园。在别人星球按 E 回主星球，点“返回我的家园”直接回家。没有家园也能回主星球；没有传送门则返回停泊的飞船。私人房间仍仅供主人进入。' },
  save: { en: 'Progress saved means acknowledged movement, not an unsaved building preview. Finish edits with Save and wait for confirmation. Offline means wait for reconnection before changing the world. Nearby people are live players; village residents and this guide are local characters. Keep this browser’s cookies to retain your anonymous identity. I only know the documented game features, not private messages or everyone’s saves.', zh: '“进度已保存”指已确认的移动，不包括未保存的建造预览。编辑后请保存并等待确认。离线时等重连再改动世界。附近访客是真人；村庄居民和本向导是本地角色。保留浏览器 Cookie 才能继续使用匿名身份。我只知道已记录的游戏功能，不了解私人消息或所有人的存档。' },
};
export function guideTarget(universe: Universe, topic: GuideTopic): TutorialTarget | null {
  const p = universe.currentPlanet;
  if (universe.player.flight.mode !== 'ground' || universe.player.location?.kind === 'interior' || topic === 'save') return null;
  if (topic === 'visit') return { kind: 'port', position: portPoint(p.id), planetId: p.id };
  if ((topic === 'home' || topic === 'build') && p.mine && universe.player.home?.planetId === p.id)
    return { kind: 'home', position: universe.player.home.door.position, planetId: p.id };
  const gate = stationSites(p)[0];
  return gate ? { kind: 'gate', position: gate.interact, planetId: p.id } : null;
}
