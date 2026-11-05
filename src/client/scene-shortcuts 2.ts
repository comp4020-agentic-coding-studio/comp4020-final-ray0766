/** Scene shortcuts never replace native focus navigation inside a UI. */
export function mountSceneShortcuts(options:{scene:()=>HTMLElement|null;canOpenMenu:()=>boolean;openMenu:()=>void;releaseMouse:()=>void},win:Window=window){
 const doc=win.document;let openingTabHeld=false;
 function sceneTarget(event:KeyboardEvent){return event.target===options.scene()||event.target===doc.body||event.target===doc.documentElement;}
 function down(event:KeyboardEvent){
  if(event.key==='Escape'){
   // Native pointer-lock Escape may arrive as only pointerlockchange. If a key
   // event is delivered, never let it close a dialog or invoke older handlers.
   event.preventDefault();event.stopImmediatePropagation();options.releaseMouse();return;
  }
  if(event.key!=='Tab')return;
  if(openingTabHeld){event.preventDefault();event.stopImmediatePropagation();return;}
  if(event.defaultPrevented||event.repeat||event.isComposing||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||!sceneTarget(event)||doc.querySelector('dialog[open]')||!options.canOpenMenu())return;
  openingTabHeld=true;event.preventDefault();event.stopImmediatePropagation();options.releaseMouse();options.openMenu();
 }
 function up(event:KeyboardEvent){if(event.key==='Tab'&&openingTabHeld){openingTabHeld=false;event.preventDefault();event.stopImmediatePropagation();}else if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}}
 function cancel(event:Event){if(event.target instanceof HTMLDialogElement){event.preventDefault();event.stopImmediatePropagation();options.releaseMouse();}}
 function blur(){openingTabHeld=false;}
 win.addEventListener('keydown',down,true);win.addEventListener('keyup',up,true);win.addEventListener('blur',blur);doc.addEventListener('cancel',cancel,true);
 return{dispose(){win.removeEventListener('keydown',down,true);win.removeEventListener('keyup',up,true);win.removeEventListener('blur',blur);doc.removeEventListener('cancel',cancel,true);}};
}

/** A delayed dialog-close event must not steal focus from a newly opened UI. */
export function restoreSceneFocus(scene:HTMLElement|null,doc:Document=document){
 if(!doc.querySelector('dialog[open],[role="dialog"]:not([hidden])'))scene?.focus({preventScroll:true});
}
