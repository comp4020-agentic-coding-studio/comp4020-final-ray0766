import { setText, sourceText } from './i18n.ts';
// Cache only a successfully constructed panel. Failed imports can be retried.
export function lazyPanel<T>(create:()=>Promise<T>){
 let value:T|undefined,pending:Promise<T>|undefined;
 return ()=>value?Promise.resolve(value):pending??(pending=create().then(v=>{value=v;return v;}).finally(()=>{pending=undefined;}));
}
export async function openPanel<T>(button:HTMLButtonElement,load:()=>Promise<T>,open:(panel:T)=>void|Promise<void>){
 if(button.disabled)return;const label=sourceText(button)||'Workspace',menu=document.getElementById('menu-dialog') as HTMLDialogElement;
 const status=document.getElementById('tool-status')!,reload=document.getElementById('reload-tools') as HTMLButtonElement;
 setText(status, 'Opening '+label.toLowerCase()+'…');reload.hidden=true;button.disabled=true;setText(button, 'Loading…');
 try{const panel=await load();if(!menu.open)return;setText(status, '');await open(panel);}
 catch{setText(status, 'Could not open '+label.toLowerCase()+'. Reconnect and try again, or reload this page.');reload.hidden=false;reload.onclick=()=>location.reload();}
 finally{button.disabled=false;setText(button, label);}
}
