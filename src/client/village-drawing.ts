import * as T from 'three';
import {LineDrawer,PEN_CELL} from '../assets/claude-geometry/style/lines.ts';
import {createCloudSky} from '../assets/claude-geometry/style/sky.ts';
import type {CloudSky} from '../assets/claude-geometry/style/sky.ts';
import {VILLAGE} from '../assets/claude-geometry/style/look.ts';

type DrawingCamera=T.PerspectiveCamera|T.OrthographicCamera;

/** The source pen uses perspective depth. Keep the host's room camera and
 * adapt only its private passes; never change the immutable source shaders. */
export function orthographicLineShader(shader:string):string {
  if(!shader.includes('perspectiveDepthToViewZ('))throw Error('Village line depth contract changed.');
  let result=shader.replaceAll('perspectiveDepthToViewZ(', 'orthographicDepthToViewZ(');
  const replace=(before:string,after:string)=>{
    if(!result.includes(before))throw Error('Village line position contract changed.');
    result=result.replace(before,after);
  };
  if(result.includes('float iz(')){
    // Orthographic screen coordinates vary linearly with view x/y and depth;
    // they must never be multiplied by the perspective ray's z ratio.
    replace('return -1.0 / orthographicDepthToViewZ(', 'return -orthographicDepthToViewZ(');
    replace('return d / -d.z / inv;', 'return vec3( d.xy, -inv );');
    replace('if ( dot( n, -P ) < 0.0 )', 'if ( n.z < 0.0 )');
  }else{
    replace('d / -d.z * z', 'vec3( d.xy, -z )');
    replace('( 1.0 / za + 1.0 / zb - 2.0 * iz ) / iz', '( 2.0 * z - za - zb ) / max( z, 0.1 )');
  }
  return result;
}

/** One drawing pipeline per active camera, with bounded render-target lifetime.
 * Photo cameras reuse it for framing and export, and release it on close. */
export function createVillageDrawing(renderer:T.WebGLRenderer,scene:T.Scene,camera:DrawingCamera,clouds=false){
  const drawer=new LineDrawer(renderer,scene,camera as T.PerspectiveCamera,VILLAGE.edges!);
  if(camera instanceof T.OrthographicCamera){
    const compositor=drawer.pass.lines as unknown as {normalQuad:{material:T.ShaderMaterial};lineQuad:{material:T.ShaderMaterial}};
    for(const quad of [compositor.normalQuad,compositor.lineQuad]){
      quad.material.fragmentShader=orthographicLineShader(quad.material.fragmentShader);quad.material.needsUpdate=true;
    }
  }
  const sky=clouds?createCloudSky(VILLAGE.cloudSky!,Math.min(camera.far*.8,1200)):null;
  if(sky)scene.add(sky);
  let width=0,height=0,ratio=0,scale=0,disposed=false;
  const size=new T.Vector2();
  const measure=typeof location!=='undefined'&&new URLSearchParams(location.search).has('measure');
  let measuredFrames=0,submissionMs=0;
  function resize(){
    renderer.getSize(size);const nextRatio=renderer.getPixelRatio();
    if(size.x===width&&size.y===height&&ratio===nextRatio)return;
    width=size.x;height=size.y;ratio=nextRatio;drawer.setSize(width,height,ratio);
  }
  function render(target?:T.Vector3,planet=false){
    if(disposed)return;resize();
    const backdrop=sky??scene.getObjectByName('cloud-sky') as CloudSky|undefined;
    if(backdrop)backdrop.acrossView=planet;
    const reach=planet&&target?Math.max(1,camera.position.distanceTo(target)/20):1;
    if(reach!==scale){
      const edges=VILLAGE.edges!;scale=reach;
      drawer.pass.lines.setFade(edges.creaseFade,[edges.fade[0]*reach,edges.fade[1]*reach],[edges.creaseFade[0]*reach,edges.creaseFade[1]*reach]);
      drawer.pass.lines.setPenCell(PEN_CELL*reach);
    }
    // Count all colour, shadow, normals, line and output passes as one frame.
    const autoReset=renderer.info.autoReset;renderer.info.autoReset=false;renderer.info.reset();
    const start=measure?performance.now():0;
    try{drawer.render();}finally{renderer.info.autoReset=autoReset;}
    if(measure){submissionMs+=performance.now()-start;if(++measuredFrames===30){renderer.domElement.dataset.renderCpuMs=(submissionMs/measuredFrames).toFixed(3);measuredFrames=0;submissionMs=0;}}
    renderer.domElement.dataset.villageDrawing='14e244f';
    renderer.domElement.dataset.lineFadeScale=String(scale);
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
  }
  return {render,resize,dispose(){if(disposed)return;disposed=true;for(const pass of drawer.composer.passes)if(pass!==drawer.pass)pass.dispose();drawer.dispose();if(sky){sky.geometry.dispose();sky.material.dispose();sky.removeFromParent();}}};
}
