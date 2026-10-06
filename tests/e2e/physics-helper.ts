import type {Page} from '@playwright/test';
import {Vector3,Quaternion} from 'three';
import {anchorQuaternion,localToDir} from '../../src/assets/claude-geometry/core/anchor.ts';
import {structureFit} from '../../src/shared/blueprints.ts';
import type {PlacedObject} from '../../src/shared/planets.ts';
import type {PartPlacement} from '../../src/assets/claude-geometry/blueprint/model.ts';
import type {Vec3} from '../../src/shared/world.ts';
export async function readFeet(page:Page){const d=await page.locator('#world canvas').evaluate(e=>({...((e as HTMLElement).dataset)}));return {position:JSON.parse(d.groundPosition!) as Vec3,radius:Number(d.feetRadius),north:new Vector3(...JSON.parse(d.cameraHeading!)),grounded:d.grounded==='true'};}
export function frame(o:PlacedObject,parts:PartPlacement[]){const anchor={dir:o.position,yaw:o.rotation},base=structureFit(parts,o.position,o.rotation).baseRadius,inverse=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();return {at:(x:number,z:number,y=0)=>localToDir(anchor,base,[x,y,z]),local:(p:{position:Vec3;radius:number})=>new Vector3(...p.position).multiplyScalar(p.radius).addScaledVector(new Vector3(...o.position),-base).applyQuaternion(inverse)};}
export async function walk(page:Page,target:(feet:Awaited<ReturnType<typeof readFeet>>)=>Vec3,touch=false){
  const cdp=touch?await page.context().newCDPSession(page):null,held=new Set<string>();let touchActive=false;
  try{
    // Camera drag aligns the initial keyboard path; movement remains actual keys/touch.
    if(!touch){const f=await readFeet(page),up=new Vector3(...f.position),dir=new Vector3(...target(f)).projectOnPlane(up).normalize();let turn=Math.atan2(up.dot(new Vector3().crossVectors(f.north,dir)),f.north.dot(dir));
      while(Math.abs(turn)>.02){const amount=Math.max(-1.1,Math.min(1.1,turn));await page.mouse.move(850,450);await page.mouse.down();await page.mouse.move(850-amount/.004,450,{steps:4});await page.mouse.up();turn-=amount;}
    }
    for(let step=0;step<260;step++){
      const f=await readFeet(page),up=new Vector3(...f.position),to=new Vector3(...target(f)),distance=up.angleTo(to)*f.radius;
      if(distance<.065){for(const k of held)await page.keyboard.up(k);held.clear();if(cdp&&touchActive){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touchActive=false;}await page.waitForTimeout(280);return;}
      const direction=to.projectOnPlane(up).normalize(),right=new Vector3().crossVectors(f.north,up).normalize(),x=direction.dot(right),y=direction.dot(f.north);
      if(cdp){const b=(await page.locator('#joystick').boundingBox())!,cx=b.x+b.width/2,cy=b.y+b.height/2,scale=Math.min(1,distance/.6);
        if(step===0){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});touchActive=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34*scale,y:cy-y*34*scale}]});
      }else{
        // A narrow stair needs continuous heading correction. Eight-direction
        // keyboard quantisation alone can keep pressing into a side rail.
        const angle=Math.atan2(up.dot(new Vector3().crossVectors(f.north,direction)),f.north.dot(direction));
        if(Math.abs(angle)>.025){const turn=Math.max(-.7,Math.min(.7,angle));await page.mouse.move(850,450);await page.mouse.down();await page.mouse.move(850-turn/.004,450,{steps:2});await page.mouse.up();}
        if(Math.abs(angle)<.8){if(!held.has('w')){await page.keyboard.down('w');held.add('w');}}else if(held.has('w')){await page.keyboard.up('w');held.delete('w');}
      }
      await page.waitForTimeout(distance<.55?35:65);
      if(!touch&&distance<.55&&held.has('w')){await page.keyboard.up('w');held.delete('w');await page.waitForTimeout(55);}
      if(step%45===44){const notice=await page.locator('#notice').textContent();if(notice?.includes('Reconnect'))throw Error('Movement server rejection: '+notice);}
    }
    throw Error('Walking did not reach waypoint: '+JSON.stringify(await readFeet(page)));
  }finally{for(const k of held)await page.keyboard.up(k);if(cdp){if(touchActive)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}}
}
