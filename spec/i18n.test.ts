// @vitest-environment jsdom
import {beforeEach,describe,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {chooseLanguage,initI18n,LANGUAGE_KEY,localizedOption,localizeTree,setAttribute,setHTML,setLanguage,setText,sourceText,translate} from '../src/client/i18n.ts';
import {messages,patterns} from '../src/client/messages.ts';

beforeEach(()=>{localStorage.clear();document.body.innerHTML='<header class="minimal-bar"><span id="location-chip">SUNSEED / ARRIVALS</span><button id="open-menu">Pause menu</button></header>';setLanguage('en');localStorage.clear();});
describe('language preference and source messages',()=>{
 test('English is the default; explicit choices and unavailable storage are safe',()=>{
  expect(chooseLanguage(null)).toBe('en');expect(chooseLanguage('')).toBe('en');expect(chooseLanguage('bad')).toBe('en');expect(chooseLanguage('zh-CN')).toBe('en');expect(chooseLanguage('en')).toBe('en');expect(chooseLanguage('zh')).toBe('zh');
  const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});
  expect(()=>initI18n()).not.toThrow();expect(document.documentElement.lang).toBe('en');expect(()=>setLanguage('zh')).not.toThrow();expect(document.documentElement.lang).toBe('zh-CN');get.mockRestore();set.mockRestore();
 });
 test.each(['zh-CN','zh-TW','fr-FR'])('starts in English on a %s browser until the user chooses another language',browser=>{
  const language=vi.spyOn(navigator,'language','get').mockReturnValue(browser);
  try{initI18n();expect(document.documentElement.lang).toBe('en');setLanguage('zh');initI18n();expect(document.documentElement.lang).toBe('zh-CN');expect(localStorage.getItem(LANGUAGE_KEY)).toBe('zh');}finally{language.mockRestore();}
 });
 test('all translated patterns preserve their placeholder set and are ordered numerically',()=>{
  for(const [en,zh,terms=[]] of patterns){const slots=[...en.matchAll(/\{(\d+)\}/g)].map(m=>Number(m[1]));expect(slots,en).toEqual(slots.map((_,i)=>i));expect([...zh.matchAll(/\{(\d+)\}/g)].map(m=>Number(m[1])).sort(),en).toEqual([...slots].sort());for(const n of terms)expect(slots,en).toContain(n);}
  for(const [key,value] of Object.entries(messages)){expect(key.trim(),key).toBe(key);expect(value.trim(),key).not.toBe('');}
 });
 test('counts and nested system terms translate; player names, technical IDs and unknown messages survive',()=>{
  expect(translate('64 / 64 objects','zh')).toBe('64 / 64 个物件');
  expect(translate('Harbour Belt · 42 m away · 3 saved objects','zh')).toBe('港湾带 · 距离 42 米 · 3 个已保存的物件');
  expect(translate('Land on Cottage?','zh')).toBe('降落到 Cottage 吗？');
  expect(translate('Land on My  Cottage?','zh')).toBe('降落到 My  Cottage 吗？');
  expect(translate('HDG 123°  /  PITCH -4°','zh')).toBe('航向 123° / 俯仰 -4°');
  expect(translate('constructor','zh')).toBe('constructor');
  expect(translate('Grouped 2 parts as "Cottage".','zh')).toBe('已将 2 个部件分组为“Cottage”。');
  expect(translate('Cannot place: Overlaps Floor deck #7.','zh')).toBe('无法放置：与 地板平台 #7 重叠。');
  expect(translate('wall.door.open','zh')).toBe('wall.door.open');expect(translate('unknown diagnostic','zh')).toBe('unknown diagnostic');expect(translate('Cottage','en')).toBe('Cottage');
 });
});
describe('in-place UI translation',()=>{
 test('keeps modal, draft, selection, focus, listeners and raw user names intact across repeated switches',()=>{
  const d=document.createElement('dialog');setHTML(d,'<header><h2>Workshop</h2></header><label>Name<input id="draft" value="Cottage"></label><select id="saved" data-i18n-verbatim></select><select id="parts"></select><button id="save">Save blueprint</button><p id="status"></p>');document.body.append(d);d.setAttribute('open','');
  const input=d.querySelector('input')!;input.focus();input.setSelectionRange(2,5);
  const saved=d.querySelector<HTMLSelectElement>('#saved')!;saved.add(localizedOption('Cottage','uuid-example',false,false,true));
  const parts=d.querySelector<HTMLSelectElement>('#parts')!;parts.add(localizedOption('Plank floor','floor.deck'));parts.add(localizedOption('Cottage stair','stair.straight'));parts.value='stair.straight';
  let clicks=0;const button=d.querySelector<HTMLButtonElement>('#save')!;button.onclick=()=>clicks++;setText(d.querySelector('#status')!,'Saving blueprint…');setAttribute(input,'placeholder','e.g. Cabin shell');
  for(const lang of ['zh','en','zh'] as const)setLanguage(lang);
  expect(d.open).toBe(true);expect(d.querySelector('input')).toBe(input);expect(document.activeElement).toBe(input);expect(input.value).toBe('Cottage');expect([input.selectionStart,input.selectionEnd]).toEqual([2,5]);expect(parts.value).toBe('stair.straight');expect(parts.selectedOptions[0].text).toBe('小屋楼梯');expect(saved.options[0].text).toBe('Cottage');expect(saved.value).toBe('uuid-example');expect(input.placeholder).toBe('例如：小屋外壳');expect(button.textContent).toBe('保存蓝图');button.click();expect(clicks).toBe(1);expect(sourceText(button)).toBe('Save blueprint');expect(localStorage.getItem(LANGUAGE_KEY)).toBe('zh');
  setText(d.querySelector('#status')!,'Saved blueprint opened.');expect(d.querySelector('#status')!.textContent).toBe('已打开保存的蓝图。');setLanguage('en');expect(d.querySelector('#status')!.textContent).toBe('Saved blueprint opened.');
 });
 test('initial HTML and accessible names change together, with language controls inside every dialog',()=>{
  const html=readFileSync('index.html','utf8');document.body.innerHTML=html.slice(html.indexOf('<body>')+6,html.indexOf('</body>'));localStorage.setItem(LANGUAGE_KEY,'zh');initI18n();
  expect(document.documentElement.lang).toBe('zh-CN');expect(document.querySelector('#open-menu')?.getAttribute('aria-label')).toBe('菜单（Tab）');expect(document.querySelector('#open-menu .menu-label')?.textContent).toBe('菜单');expect(document.querySelector('#open-menu kbd')?.textContent).toBe('Tab');expect(document.querySelector('#open-menu')?.getAttribute('aria-keyshortcuts')).toBe('Tab');expect(document.querySelector('#ship-thrust')).toBeNull();expect(document.querySelector('#my-planet')?.textContent).toBe('选择我的星球');expect(document.querySelectorAll('dialog .language-select').length).toBe(document.querySelectorAll('dialog').length);
  const heading=document.querySelector('#planet-name')!;setText(heading,'Cottage',true);localizeTree(document.body);expect(heading.textContent).toBe('Cottage');setLanguage('en');expect(document.querySelector('#confirm-flight')?.textContent).toBe('Depart');expect(document.querySelector('#land-ship')).toBeNull();
 });
});
