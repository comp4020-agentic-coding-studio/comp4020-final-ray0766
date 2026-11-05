import type {Character} from './world.ts';
export const APPEARANCE_OPTIONS={model:['sample'],face:['soft','oval','round'],hair:['swept','crop','bob'],skin:['porcelain','sand','warm','bronze','deep'],eyes:['moss','hazel','ocean'],coat:['clay','fern','sky']} as const;
export type Appearance={version:1;model:typeof APPEARANCE_OPTIONS.model[number];face:typeof APPEARANCE_OPTIONS.face[number];hair:typeof APPEARANCE_OPTIONS.hair[number];skin:typeof APPEARANCE_OPTIONS.skin[number];eyes:typeof APPEARANCE_OPTIONS.eyes[number];coat:Character};
export interface SavedAppearance{revision:number;options:Appearance}
export const SKIN_COLORS={porcelain:'#efd0b5',sand:'#dfb58d',warm:'#c99870',bronze:'#a7704c',deep:'#704833'} as const;
export const EYE_COLORS={moss:'#456d59',hazel:'#926f39',ocean:'#4d7d9c'} as const;
export function defaultAppearance(coat:Character='clay'):Appearance{return{version:1,model:'sample',face:'soft',hair:'swept',skin:'sand',eyes:'moss',coat};}
export function appearanceOf(player:{character:Character;appearance?:SavedAppearance}):Appearance{return player.appearance?{...player.appearance.options,model:'sample',coat:player.character}:defaultAppearance(player.character);}
export function validAppearance(value:unknown):value is Appearance{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;
 return v.version===1&&Object.keys(v).length===7&&Object.keys(v).every(k=>k==='version'||Object.hasOwn(APPEARANCE_OPTIONS,k))&&Object.entries(APPEARANCE_OPTIONS).every(([key,values])=>(values as readonly unknown[]).includes(v[key]));
}
export function appearanceKey(a:Appearance){return [a.version,a.model,a.face,a.hair,a.skin,a.eyes,a.coat].join(':');}
