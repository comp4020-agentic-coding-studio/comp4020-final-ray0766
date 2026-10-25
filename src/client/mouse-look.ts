/** Relative mouse input only: the accepted spherical camera owns the pose. */
export function lookDelta(x:number,y:number,pitch:number) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return {yaw:0,pitch};
  return {yaw:-x*.003,pitch:Math.max(-.3,Math.min(.7,pitch-y*.0025))};
}
export type MouseLookMode='ready'|'pending'|'locked'|'drag';
export function createMouseLook(options:{
  element:HTMLElement;canLook:()=>boolean;move:(x:number,y:number)=>void;
  released:()=>void;changed:(mode:MouseLookMode)=>void;
}) {
  const {element}=options,doc=element.ownerDocument,win=doc.defaultView!;
  let wanted=false,pending=false,failed=false,disposed=false,mode:MouseLookMode='ready';
  const locked=()=>doc.pointerLockElement===element;
  const supported=()=>typeof element.requestPointerLock==='function';
  const allowed=()=>!disposed&&!doc.hidden&&options.canLook();
  function publish(){const next=locked()?'locked':pending?'pending':failed||!supported()?'drag':'ready';if(mode!==next){mode=next;options.changed(mode);}}
  function release(){wanted=false;if(locked())doc.exitPointerLock();publish();}
  function rejected(){pending=false;wanted=false;failed=true;publish();if(disposed)removeLockListeners();}
  function changed(){
    pending=false;
    if(locked()&&(!wanted||!allowed())){doc.exitPointerLock();return;}
    if(!locked()){wanted=false;options.released();}
    publish();if(disposed&&!locked())removeLockListeners();
  }
  // Called only by a canvas click or the keyboard-accessible look button.
  function request(){
    if(!allowed()||pending||locked())return;
    if(!supported()){failed=true;publish();return;}
    wanted=true;pending=true;failed=false;publish();
    try{const result=element.requestPointerLock();if(result)void result.catch(rejected);}catch{rejected();}
  }
  function move(event:MouseEvent){
    if(!locked()||!wanted)return;
    if(!allowed()){release();return;}
    options.move(event.movementX,event.movementY);
  }
  function escape(event:KeyboardEvent){if(event.key==='Escape')release();}
  function hidden(){if(doc.hidden)release();}
  function removeLockListeners(){doc.removeEventListener('pointerlockchange',changed);doc.removeEventListener('pointerlockerror',rejected);}
  doc.addEventListener('pointerlockchange',changed);doc.addEventListener('pointerlockerror',rejected);
  doc.addEventListener('mousemove',move);doc.addEventListener('keydown',escape);
  doc.addEventListener('visibilitychange',hidden);win.addEventListener('blur',release);
  publish();
  return {
    request,release,locked,canCapture:()=>supported()&&!failed,
    sync(){if(!allowed())release();},
    dispose(){disposed=true;release();if(!pending&&!locked())removeLockListeners();doc.removeEventListener('mousemove',move);doc.removeEventListener('keydown',escape);doc.removeEventListener('visibilitychange',hidden);win.removeEventListener('blur',release);},
  };
}
