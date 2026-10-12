// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {Workshop} from '../src/client/workshop.ts';
import {SAMPLE_PUBLIC_BLUEPRINTS,samplePublicWorkshopPlans} from '../src/shared/sample-public-village.ts';
import type {Blueprint} from '../src/shared/blueprint-model.ts';
import {canonicalGroups,canonicalParts} from '../src/shared/blueprint-codec.ts';
import {PART_IDS} from '../src/shared/blueprint-parts.ts';
import {setLanguage,translate} from '../src/client/i18n.ts';

it('keeps every registered town plan translated and made only from the ordinary player catalogue including the host wide door',()=>{
 expect(PART_IDS).toHaveLength(65);expect(SAMPLE_PUBLIC_BLUEPRINTS.length).toBeGreaterThan(0);
 for(const blueprint of SAMPLE_PUBLIC_BLUEPRINTS){
  expect(translate(blueprint.name,'zh'),blueprint.name).not.toBe(blueprint.name);
  for(const part of blueprint.parts)expect(PART_IDS,blueprint.name).toContain(part.part);
 }
});

it('keeps the existing 43 workshop examples, appends the 19 planned-town compositions and saves each as an independent editable copy',async()=>{
 document.body.innerHTML='';setLanguage('en');
 const originals=JSON.stringify(SAMPLE_PUBLIC_BLUEPRINTS),documents:Blueprint[]=[];
 const plans=samplePublicWorkshopPlans();expect(plans).toHaveLength(62);expect(plans.slice(0,43)).toEqual(SAMPLE_PUBLIC_BLUEPRINTS.slice(0,43));
 const save=vi.fn(async(body:unknown)=>{
  const request=body as {document:Blueprint;expectedVersion:number};
  expect(request.expectedVersion).toBe(0);documents.push(structuredClone(request.document));
  return {blueprint:request.document,version:1,hash:'0'.repeat(64)};
 });
 new Workshop({read:async()=>[],save,place:()=>{},allowed:()=>true});
 const dialog=document.querySelector<HTMLDialogElement>('#workshop')!;
 dialog.setAttribute('open','');
 const select=dialog.querySelector<HTMLSelectElement>('#ws-example')!,group=select.querySelector('optgroup')!;
 expect([...group.querySelectorAll('option')].map(option=>option.textContent)).toEqual(plans.map(p=>p.name));
 setLanguage('zh');expect(group.label).toBe('村镇蓝图');
 expect([...group.querySelectorAll('option')].map(option=>option.textContent)).toEqual(plans.map(p=>translate(p.name,'zh')));
 setLanguage('en');expect(group.label).toBe('Village plans');
 const load=dialog.querySelector<HTMLButtonElement>('#ws-example-load')!,saveButton=dialog.querySelector<HTMLButtonElement>('#ws-save')!;
 for(let index=0;index<plans.length;index++){
  select.value=`sample-${index}`;load.click();
  const name=dialog.querySelector<HTMLInputElement>('#ws-name')!;name.value=`My plan ${index}`;name.dispatchEvent(new Event('input'));
  saveButton.click();await vi.waitFor(()=>expect(documents).toHaveLength(index+1));
  await vi.waitFor(()=>expect(saveButton.disabled).toBe(false));
  const saved=documents[index],original=plans[index];
  expect(saved.id).not.toBe(original.id);expect(saved.name).toBe(`My plan ${index}`);
  // Saving canonicalizes order; part placement and group membership stay intact.
  expect(saved.parts).toEqual(canonicalParts(original.parts));expect(saved.groups).toEqual(canonicalGroups(original.groups));
 }
 expect(new Set(documents.map(document=>document.id)).size).toBe(plans.length);
 expect(JSON.stringify(SAMPLE_PUBLIC_BLUEPRINTS)).toBe(originals);
});
