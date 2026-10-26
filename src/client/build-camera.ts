import { Vector3 } from 'three';

export interface BuildPanelRect { left:number; top:number; right:number; bottom:number }
/** Fit the planet to the unobstructed canvas, not behind the tool panel.
 * The offset changes projection only; ray picking uses this same camera. */
export function buildCameraFrame(up:Vector3,north:Vector3,radius:number,fov:number,width:number,height:number,panel:BuildPanelRect){
  const top=Math.min(80,height*.15),bottom=Math.max(top+80,height-44);
  const area=width<=700
    ? {left:12,right:width-12,top,bottom:Math.max(top+80,Math.min(bottom,panel.top-12))}
    : {left:20,right:Math.max(140,Math.min(width-20,panel.left-16)),top,bottom};
  const spanX=Math.max(80,area.right-area.left),spanY=Math.max(80,area.bottom-area.top);
  const tanV=Math.tan(fov*Math.PI/360),tanH=tanV*width/height;
  const angle=Math.atan(Math.min(tanH*spanX/width,tanV*spanY/height)*.88);
  const extent=radius*1.12;
  const distance=extent/Math.sin(angle);
  const bearing=up.clone().multiplyScalar(.97).addScaledVector(north,-.24).normalize();
  return {position:bearing.multiplyScalar(distance),target:new Vector3(),up:up.clone(),
    offsetX:width/2-(area.left+area.right)/2,offsetY:height/2-(area.top+area.bottom)/2,area,extent};
}
