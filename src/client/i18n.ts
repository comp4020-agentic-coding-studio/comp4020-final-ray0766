import { messages, patterns } from './messages.ts';

export type Language = 'en' | 'zh';
export const LANGUAGE_KEY = 'little-worlds:language:v1';
export function chooseLanguage(saved: string | null, browser: string): Language {
  return saved === 'zh' || saved === 'en' ? saved : /^zh(?:-|$)/i.test(browser) ? 'zh' : 'en';
}
let language: Language = 'en';
const source = new WeakMap<Node, string>();
const verbatim = new WeakSet<Node>();
const attributes = new WeakMap<Element, Map<string, string>>();
const ignored = 'input,textarea,script,style,noscript,[contenteditable],.language-picker,[data-i18n-verbatim]';
const attributeNames = ['aria-label', 'title', 'placeholder'] as const;
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchers = patterns.map(([english, chinese, terms = []]) => ({
  expression: new RegExp('^' + english.split(/\{\d+\}/).map(part => escape(part).replace(/ +/g, '\\s+')).join('(.+?)') + '$'),
  chinese, terms,
}));

/** English is the source/fallback; interpolated names and IDs remain verbatim.
 * Only explicitly listed system-term slots are recursively translated. */
export function translate(value: string, locale: Language = language, depth = 0): string {
  if (locale === 'en' || !value || depth > 5) return value;
  const key = normalize(value);
  let result = Object.hasOwn(messages, key) ? messages[key] : undefined;
  if (!result) for (const entry of matchers) {
    const match = entry.expression.exec(value.trim());
    if (!match) continue;
    result = entry.chinese.replace(/\{(\d+)\}/g, (_, digit: string) => {
      const index = Number(digit), part = match[index + 1];
      return entry.terms.includes(index) ? translate(part, locale, depth + 1) : part;
    });
    break;
  }
  return result ? value.slice(0, value.length - value.trimStart().length) + result + value.slice(value.trimEnd().length) : value;
}

export function sourceText(element: Element): string {
  return [...element.childNodes].map(node => source.get(node) ?? node.textContent ?? '').join('');
}
function textNode(node: Text, value: string) {
  source.set(node, value);
  const next = verbatim.has(node) || node.parentElement?.closest(ignored) ? value : translate(value);
  if (node.data !== next) node.data = next;
}
export function setText(element: Node, value: string | null, raw = false) {
  const english = value ?? '';
  if (raw) { element.textContent = english; if (element.firstChild) { source.set(element.firstChild, english); verbatim.add(element.firstChild); } return; }
  if (element.firstChild) verbatim.delete(element.firstChild);
  if (element.childNodes.length === 1 && element.firstChild?.nodeType === 3) textNode(element.firstChild as Text, english);
  else { element.textContent = english; if (element.firstChild) textNode(element.firstChild as Text, english); }
}
export function setAttribute(element: Element, name: string, value: string) {
  let entries = attributes.get(element);
  if (!entries) { entries = new Map(); attributes.set(element, entries); }
  entries.set(name, value);
  element.setAttribute(name, translate(value));
}
export function localizedOption(label: string, value?: string, defaultSelected?: boolean, selected?: boolean, raw = false) {
  // Give even label-only options an explicit, language-independent value.
  const option = new Option(label, value ?? label, defaultSelected, selected);
  setText(option, label, raw); return option;
}
export function localizeTree(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.parentElement?.closest(ignored)) textNode(node as Text, source.get(node) ?? node.textContent ?? '');
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.closest('.language-picker,[data-i18n-verbatim]')) continue;
    for (const name of attributeNames) {
      const value = attributes.get(element)?.get(name) ?? element.getAttribute(name);
      if (value !== null && value !== undefined) setAttribute(element, name, value);
    }
  }
}
function picker(host: Element) {
  const label = document.createElement('label'); label.className = 'language-picker';
  const caption = document.createElement('span'); caption.textContent = '语言 / Language';
  const select = document.createElement('select'); select.className = 'language-select';
  select.setAttribute('aria-label', '语言 / Language');
  select.add(new Option('中文', 'zh')); select.add(new Option('English', 'en')); select.value = language;
  select.onchange = () => setLanguage(select.value as Language);
  label.append(caption, select); host.append(label);
}
export function prepareDialog(dialog: Element) {
  if (dialog.querySelector('.language-picker')) return;
  const header = dialog.querySelector(':scope > header');
  if (header) picker(header);
  else { const host = document.createElement('div'); host.className = 'dialog-language'; dialog.prepend(host); picker(host); }
}
export function setHTML(element: Element, value: string) {
  element.innerHTML = value;
  localizeTree(element);
  if (element.tagName === 'DIALOG') prepareDialog(element);
}
export function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'zh') return;
  language = next;
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Optional preference; gameplay still works. */ }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.title = translate('Little Worlds — a constellation made together');
  localizeTree(document.body);
  document.querySelectorAll<HTMLSelectElement>('.language-select').forEach(select => { select.value = next; });
}
export function initI18n() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch { /* Browser language remains available. */ }
  language = chooseLanguage(saved, navigator.language);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = translate('Little Worlds — a constellation made together');
  // User-authored strings are never interpreted as message keys, even if their
  // spelling happens to match a catalogue label such as “Cottage”.
  for (const selector of ['#planet-name', '#course-name', '.flight-ident']) document.querySelector(selector)?.setAttribute('data-i18n-verbatim', '');
  localizeTree(document.body);
  const bar = document.querySelector('.minimal-bar'); if (bar) picker(bar);
  document.querySelectorAll('dialog').forEach(prepareDialog);
}
