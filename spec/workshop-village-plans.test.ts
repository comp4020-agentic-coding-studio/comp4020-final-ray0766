// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {Workshop} from '../src/client/workshop.ts';
import {SAMPLE_PUBLIC_BLUEPRINTS} from '../src/shared/sample-public-village.ts';
import type {Blueprint} from '../src/assets/claude-geometry/blueprint/model.ts';
import {canonicalGroups,canonicalParts} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {PART_IDS} from '../src/assets/claude-geometry/blueprint/parts/catalogue.ts';
import {setLanguage,translate} from '../src/client/i18n.ts';

it('offers every current town plan translated and made only from the ordinary 45-part catalogue',()=>{
 expect(PART_IDS).toHaveLength(45);expect(SAMPLE_PUBLIC_BLUEPRINTS.length).toBeGreaterThan(0);
 for(const blueprint of SAMPLE_PUBLIC_BLUEPRINTS){
  expect(translate(blueprint.name,'zh'),blueprint.name).not.toBe(blueprint.name);
  for(const part of blueprint.parts)expect(PART_IDS,blueprint.name).toContain(part.part);
 }
});

it('opens every town plan as an independent editable copy and saves it under a fresh owner id',async()=>{
 document.body.innerHTML='';setLanguage('en');
 const originals=JSON.stringify(SAMPLE_PUBLIC_BLUEPRINTS),documents:Blueprint[]=[];
 const save=vi.fn(async(body:unknown)=>{
  const request=body as {document:Blueprint;expectedVersion:number};
  expect(request.expectedVersion).toBe(0);documents.push(structuredClone(request.document));
  return {blueprint:request.document,version:1,hash:'0'.repeat(64)};
 });
 new Workshop({read:async()=>[],save,place:()=>{},allowed:()=>true});
 const dialog=document.querySelector<HTMLDialogElement>('#workshop')!;
 dialog.setAttribute('open','');
 const select=dialog.querySelector<HTMLSelectElement>('#ws-example')!,group=select.querySelector('optgroup')!;
 expect([...group.querySelectorAll('option')].map(option=>option.textContent)).toEqual(SAMPLE_PUBLIC_BLUEPRINTS.map(p=>p.name));
 setLanguage('zh');expect(group.label).toBe('村镇蓝图');
 expect([...group.querySelectorAll('option')].map(option=>option.textContent)).toEqual(SAMPLE_PUBLIC_BLUEPRINTS.map(p=>translate(p.name,'zh')));
 setLanguage('en');expect(group.label).toBe('Village plans');
 const load=dialog.querySelector<HTMLButtonElement>('#ws-example-load')!,saveButton=dialog.querySelector<HTMLButtonElement>('#ws-save')!;
 for(let index=0;index<SAMPLE_PUBLIC_BLUEPRINTS.length;index++){
  select.value=`sample-${index}`;load.click();
  const name=dialog.querySelector<HTMLInputElement>('#ws-name')!;name.value=`My plan ${index}`;name.dispatchEvent(new Event('input'));
  saveButton.click();await vi.waitFor(()=>expect(documents).toHaveLength(index+1));
  await vi.waitFor(()=>expect(saveButton.disabled).toBe(false));
  const saved=documents[index],original=SAMPLE_PUBLIC_BLUEPRINTS[index];
  expect(saved.id).not.toBe(original.id);expect(saved.name).toBe(`My plan ${index}`);
  // Saving canonicalizes order; part placement and group membership stay intact.
  expect(saved.parts).toEqual(canonicalParts(original.parts));expect(saved.groups).toEqual(canonicalGroups(original.groups));
 }
 expect(new Set(documents.map(document=>document.id)).size).toBe(SAMPLE_PUBLIC_BLUEPRINTS.length);
 expect(JSON.stringify(SAMPLE_PUBLIC_BLUEPRINTS)).toBe(originals);
});
