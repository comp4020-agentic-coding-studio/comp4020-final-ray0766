import {expect,it} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {buildCameraFrame} from '../src/client/build-camera.ts';
it('frames the actual planet inside the clear desktop and narrow canvas, including both panel heights',()=>{
 for(const [width,height,top,left] of [[1920,1080,102,1586],[390,844,470,12],[390,844,620,12],[844,390,102,510]]){
  for(const up of [new Vector3(0,1,0),new Vector3(1,0,0),new Vector3(0,-1,0)]){
   const north=new Vector3(0,0,-1),f=buildCameraFrame(up,north,60,48,width,height,{left,top,right:width-12,bottom:height-12});
   const camera=new PerspectiveCamera(48,width/height,.08,2400);camera.position.copy(f.position);camera.up.copy(f.up);camera.lookAt(f.target);camera.setViewOffset(width,height,f.offsetX,f.offsetY,width,height);camera.updateMatrixWorld(true);
   const center=new Vector3().project(camera);expect((center.x+1)*width/2).toBeCloseTo((f.area.left+f.area.right)/2,5);expect((1-center.y)*height/2).toBeCloseTo((f.area.top+f.area.bottom)/2,5);
   // Sample the globe, not just its centre; the whole sphere must remain clickable outside the panel.
   for(let i=0;i<30;i++)for(let j=0;j<30;j++){
    const point=new Vector3().setFromSphericalCoords(60,Math.PI*i/29,Math.PI*2*j/30).project(camera),x=(point.x+1)*width/2,y=(1-point.y)*height/2;
    expect(x).toBeGreaterThanOrEqual(f.area.left);expect(x).toBeLessThanOrEqual(f.area.right);expect(y).toBeGreaterThanOrEqual(f.area.top);expect(y).toBeLessThanOrEqual(f.area.bottom);
   }
  }
 }
});
