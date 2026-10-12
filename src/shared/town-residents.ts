import type { Quest, Vec3 } from './world.ts';
import { MAIN_PLANET_LEDGER, MAIN_PLANET_PLAN } from './planet-plan/main-planet.ts';

export type ResidentLanguage = 'en' | 'zh';
export interface ResidentText { en: string; zh: string }
export type ResidentOccupation = 'shopkeeper' | 'repairer' | 'gardener' | 'courier' | 'reader' | 'neighbour' | 'porter' | 'maker';
export type ResidentActivity = 'serve' | 'repair' | 'tend' | 'sort' | 'walk' | 'chat' | 'read' | 'rest';
export type ResidentAccessory = 'apron' | 'tools' | 'sunhat' | 'mailbag' | 'book' | 'basket' | 'shawl' | 'cap';
export interface TownResidentAnchor { position: Vec3; facing?: Vec3; route?: readonly Vec3[] }
export interface TownResidentDefinition extends TownResidentAnchor {
  id: string; name: ResidentText; role: ResidentText; place: ResidentText;
  occupation: ResidentOccupation; activity: ResidentActivity; accessory: ResidentAccessory;
  coat: 'clay' | 'sage' | 'cream' | 'blue' | 'ochre';
  /** A resident is authored scenery, never a player, owner, account or quest authority. */
  kind: 'resident'; conversational: boolean; phase: number; speed: number;
}
export const RESIDENT_INTERACT_DISTANCE = 2.2;
export const RESIDENT_INTERACT_HEIGHT = .65;
const text = (en: string, zh: string): ResidentText => ({ en, zh });
export interface TownResidentSite extends TownResidentAnchor { place: string }
/** v12 inhabitants stand where the planned main planet places them
 * (src/shared/planet-plan/main-planet.plan.json residents): beside a lot's door
 * path, at a street edge, or walking a short stretch of paving. */
export const TOWN_RESIDENT_SITES: Readonly<Record<string, TownResidentSite>> = Object.fromEntries(MAIN_PLANET_LEDGER.residents.map(r => [r.id, {
  place: r.place, position: r.position as Vec3, facing: r.facing as Vec3 | undefined, route: r.route as Vec3[] | undefined,
}]));
export function townResidentAnchors(): Record<string, TownResidentAnchor> {
  return Object.fromEntries(Object.entries(TOWN_RESIDENT_SITES).map(([id, site]) => [id, {
    position: [...site.position] as Vec3,
    facing: site.facing ? [...site.facing] as Vec3 : undefined,
    route: site.route?.map(point => [...point] as Vec3),
  }]));
}
export const TOWN_RESIDENT_ANCHORS = townResidentAnchors();

type ResidentProfile = Omit<TownResidentDefinition, keyof TownResidentAnchor | 'kind' | 'phase' | 'speed'>;
const profiles: readonly ResidentProfile[] = [
  { id: 'ada-shop', name: text('Ada', '艾达'), role: text('Shopkeeper', '店主'), place: text('Market corner', '集市街角'), occupation: 'shopkeeper', activity: 'serve', accessory: 'apron', coat: 'clay', conversational: true },
  { id: 'ivo-repair', name: text('Ivo', '伊沃'), role: text('Repairer', '修理工'), place: text('Open workshop', '敞开工坊'), occupation: 'repairer', activity: 'repair', accessory: 'tools', coat: 'blue', conversational: true },
  { id: 'nell-garden', name: text('Nell', '奈尔'), role: text('Gardener', '园丁'), place: text('Garden terrace', '花园台地'), occupation: 'gardener', activity: 'tend', accessory: 'sunhat', coat: 'sage', conversational: true },
  { id: 'pax-courier', name: text('Pax', '帕克斯'), role: text('Courier', '送信员'), place: text('Post lane', '邮局巷'), occupation: 'courier', activity: 'sort', accessory: 'mailbag', coat: 'ochre', conversational: true },
  { id: 'market-basket', name: text('Bea', '贝娅'), role: text('Neighbour', '邻居'), place: text('Market corner', '集市街角'), occupation: 'neighbour', activity: 'walk', accessory: 'basket', coat: 'sage', conversational: false },
  { id: 'market-chat-a', name: text('Tavi', '塔维'), role: text('Neighbour', '邻居'), place: text('Market corner', '集市街角'), occupation: 'neighbour', activity: 'chat', accessory: 'shawl', coat: 'cream', conversational: false },
  { id: 'market-chat-b', name: text('Oren', '欧伦'), role: text('Neighbour', '邻居'), place: text('Market corner', '集市街角'), occupation: 'neighbour', activity: 'chat', accessory: 'cap', coat: 'blue', conversational: false },
  { id: 'repair-apprentice', name: text('Kit', '奇特'), role: text('Apprentice', '学徒'), place: text('Open workshop', '敞开工坊'), occupation: 'maker', activity: 'repair', accessory: 'tools', coat: 'clay', conversational: false },
  { id: 'harbour-porter', name: text('Roe', '罗伊'), role: text('Porter', '搬运工'), place: text('Harbour steps', '港口台阶'), occupation: 'porter', activity: 'walk', accessory: 'basket', coat: 'ochre', conversational: false },
  { id: 'garden-helper', name: text('Fern', '芙恩'), role: text('Garden helper', '园艺帮手'), place: text('Garden terrace', '花园台地'), occupation: 'gardener', activity: 'tend', accessory: 'apron', coat: 'cream', conversational: false },
  { id: 'garden-reader', name: text('Lin', '林'), role: text('Reader', '读者'), place: text('Garden terrace', '花园台地'), occupation: 'reader', activity: 'read', accessory: 'book', coat: 'blue', conversational: false },
  { id: 'post-walker', name: text('Em', '艾姆'), role: text('Post assistant', '邮务助手'), place: text('Post lane', '邮局巷'), occupation: 'courier', activity: 'walk', accessory: 'mailbag', coat: 'clay', conversational: false },
  { id: 'court-reader', name: text('Ash', '阿什'), role: text('Reader', '读者'), place: text('Shared courtyard', '共享庭院'), occupation: 'reader', activity: 'read', accessory: 'book', coat: 'sage', conversational: false },
  { id: 'court-neighbour', name: text('Wren', '雷恩'), role: text('Neighbour', '邻居'), place: text('Shared courtyard', '共享庭院'), occupation: 'neighbour', activity: 'rest', accessory: 'shawl', coat: 'ochre', conversational: false },
  { id: 'south-walker', name: text('Jori', '乔里'), role: text('Neighbour', '邻居'), place: text('South mews', '南侧里巷'), occupation: 'neighbour', activity: 'walk', accessory: 'cap', coat: 'cream', conversational: false },
  { id: 'south-maker', name: text('Una', '乌娜'), role: text('Maker', '手艺人'), place: text('South mews', '南侧里巷'), occupation: 'maker', activity: 'repair', accessory: 'apron', coat: 'sage', conversational: false },
];

export function townResidents(anchors: Readonly<Record<string, TownResidentAnchor>> = TOWN_RESIDENT_ANCHORS): TownResidentDefinition[] {
  const places = new Map(MAIN_PLANET_PLAN.districts.map(place => [place.id, place]));
  return profiles.flatMap((profile, index) => {
    const anchor = anchors[profile.id];
    const place = places.get(TOWN_RESIDENT_SITES[profile.id]?.place);
    return anchor ? [{ ...profile, ...anchor, place: place ? text(place.name, place.nameZh) : profile.place, position: [...anchor.position] as Vec3,
      facing: anchor.facing ? [...anchor.facing] as Vec3 : undefined,
      route: anchor.route?.map(p => [...p] as Vec3), kind: 'resident' as const,
      phase: index * 2.399963229728653, speed: .55 + (index % 3) * .1 }] : [];
  });
}

const dialogue: Record<string, Record<Quest, ResidentText>> = {
  'ada-shop': {
    available: text('The flower basket smells like a whole garden this morning. Mica passed by before I opened the shutters.', '今早这一篮花，闻起来像整座花园。开窗板前，Mica 还从门口经过呢。'),
    carrying: text('A sunshine parcel! The garden end of town always has something new growing.', '是阳光包裹呀！小镇花园那头，总有新的东西在长大。'),
    delivered: text('Sol will be pleased. Sit a moment—the neighbour brought these little cups over this morning.', 'Sol 一定很高兴。歇一会儿吧，这几只小杯子是邻居今早捎来的。'),
  },
  'ivo-repair': {
    available: text('I am tightening the little ship stand today. I like working here when the harbour quietens down.', '今天把停船的小支架拧紧些。我喜欢港口安静下来时，在这里慢慢干活。'),
    carrying: text('Off to the glasshouse? I have a few bolts left to check before taking my own break.', '要去玻璃温室吗？我还要检查几颗螺栓，做完也该歇歇了。'),
    delivered: text('Good to see you back. That loose bracket finally stopped rattling.', '又见到你啦。那块松动的支架，终于不再咔哒响了。'),
  },
  'nell-garden': {
    available: text('This seedling keeps leaning toward the light. The readers like the warm spot beside the low wall, too.', '这株小苗总朝着亮处伸。读书的街坊，也爱坐在矮墙边那块暖和的地方。'),
    carrying: text('Sol is tending the glasshouse. A little sunshine should make the seedlings happy.', 'Sol 正在照看玻璃温室。添一点阳光，小苗们也会高兴的。'),
    delivered: text('The sunshine has arrived, then. I will give this little one some room to stretch.', '这么说，阳光已经送到了。我也给这株小苗腾点地方，让它舒舒服服地长。'),
  },
  'pax-courier': {
    available: text('I recognise the neighbours by their porches. For the sunshine delivery, ask Mica at the post office.', '看见门廊，我就知道是哪位街坊。想帮忙送阳光包裹，可以去邮局找 Mica。'),
    carrying: text('That parcel belongs with Sol at the glasshouse. I am sorting the smaller letters here.', '那只包裹要送给玻璃温室的 Sol。我在这里整理这些小信件。'),
    delivered: text('One sunshine parcel safely delivered. Now there is time to notice all the different doorways.', '阳光包裹顺利送到啦。现在可以慢慢看看街坊们各不相同的门口了。'),
  },
};

/** Read-only flavour and hints. Never changes deliveries, identity or quest state. */
export function residentDialogue(id: string, quest: Quest, language: ResidentLanguage): string {
  return dialogue[id]?.[quest]?.[language] ?? '';
}
