import {expect,it} from 'vitest';
import * as T from 'three';
import {LineCompositor} from '../src/assets/claude-geometry/style/lines.ts';
import {VILLAGE} from '../src/assets/claude-geometry/style/look.ts';
import {orthographicLineShader} from '../src/client/village-drawing.ts';

it('adapts both source pen passes for room cameras without modifying the source compositor',()=>{
  const compositor=new LineCompositor(VILLAGE.edges!);
  const passes=compositor as unknown as {normalQuad:{material:T.ShaderMaterial};lineQuad:{material:T.ShaderMaterial}};
  try{
    const normal=passes.normalQuad.material.fragmentShader,line=passes.lineQuad.material.fragmentShader;
    const normalRoom=orthographicLineShader(normal),lineRoom=orthographicLineShader(line);
    expect(normalRoom).toContain('return vec3( d.xy, -inv );');
    expect(normalRoom).toContain('return -orthographicDepthToViewZ(');
    expect(lineRoom).toContain('vec4( vec3( d.xy, -z ), 1.0 )');
    expect(lineRoom).toContain('( 2.0 * z - za - zb ) / max( z, 0.1 )');
    expect(normalRoom+lineRoom).not.toContain('perspectiveDepthToViewZ(');
    expect(passes.normalQuad.material.fragmentShader).toBe(normal);
    expect(passes.lineQuad.material.fragmentShader).toBe(line);
    expect(()=>orthographicLineShader('unknown replacement')).toThrow('depth contract');
  }finally{compositor.dispose();}
});

it('reconstructs the room position at different depths and screen coordinates',()=>{
  const camera=new T.OrthographicCamera(-7,7,5,-5,.05,100);
  for(const point of [new T.Vector3(-4,2,-8),new T.Vector3(3,-2,-20),new T.Vector3(0,1,-60)]){
    const ndc=point.clone().project(camera),depth=ndc.z*.5+.5;
    const z=-(depth*(camera.near-camera.far)-camera.near);
    const plane=new T.Vector3(ndc.x,ndc.y,1).applyMatrix4(camera.projectionMatrixInverse);
    const restored=new T.Vector3(plane.x,plane.y,-z);
    expect(restored.distanceTo(point)).toBeLessThan(1e-10);
    // The old perspective ray scaling displaces x/y on the same room surface.
    if(point.x!==0)expect(plane.clone().multiplyScalar(z/-plane.z).distanceTo(point)).toBeGreaterThan(1);
  }
});
