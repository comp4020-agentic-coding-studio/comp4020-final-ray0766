// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as T from 'three';

const drawerMocks=vi.hoisted(()=>({instances:[] as {render:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>;extraDispose:ReturnType<typeof vi.fn>;setSize:ReturnType<typeof vi.fn>;pass:{lines:{normalQuad:{material:{fragmentShader:string;needsUpdate:boolean}};lineQuad:{material:{fragmentShader:string;needsUpdate:boolean}}}}}[]}));
vi.mock('../src/assets/claude-geometry/style/lines.ts',()=>({
  PEN_CELL:12,
  LineDrawer:class{
    pass;composer;render=vi.fn();dispose=vi.fn();setSize=vi.fn();extraDispose=vi.fn();
    constructor(){
      const shader='perspectiveDepthToViewZ( d ) d / -d.z * z ( 1.0 / za + 1.0 / zb - 2.0 * iz ) / iz';
      this.pass={lines:{normalQuad:{material:{fragmentShader:shader,needsUpdate:false}},lineQuad:{material:{fragmentShader:shader,needsUpdate:false}},setFade:vi.fn(),setPenCell:vi.fn()}};
      this.composer={renderTarget1:{samples:4},renderTarget2:{samples:4},passes:[this.pass,{dispose:this.extraDispose}]};drawerMocks.instances.push(this);
    }
  },
}));

beforeEach(()=>{
  vi.resetModules();localStorage.clear();drawerMocks.instances.length=0;document.body.replaceChildren();document.documentElement.lang='en';
  Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8});
  Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8});
});
afterEach(()=>vi.restoreAllMocks());
const load=()=>import('../src/client/quality.ts');

it('offers three rendering budgets without using missing hints as a compatibility failure',async()=>{
  const q=await load();
  expect(q.getQualityProfile()).toMatchObject({id:'standard',screenLines:true,shadowSize:1024});
  expect(q.recommendQuality({webgl:null})).toBe('standard');
  expect(q.recommendQuality({webgl:true,deviceMemory:2})).toBe('smooth');
  expect(q.recommendQuality({webgl:true,maxTextureSize:4096})).toBe('smooth');
  expect(q.getQualityState().capabilities.webgl).toBeNull();
  q.setQualityPreference('smooth');expect(q.qualityPixelRatio(3)).toBe(1);expect(q.getQualityProfile().screenLines).toBe(false);
  q.setQualityPreference('beautiful');expect(q.qualityPixelRatio(3,390,844)).toBe(1.8);expect(q.getQualityProfile().shadowSize).toBe(2048);
  expect(q.qualityPixelRatio(Number.NaN)).toBe(1);expect(q.qualityPixelRatio(.9)).toBe(.9);
});

it('persists only the explicit preference and never lets automatic sampling replace a manual choice',async()=>{
  let q=await load();q.setQualityPreference('beautiful');
  q.setQualityCapabilities({webgl:true,deviceMemory:1});
  for(let i=0;i<500;i++)q.observeQualityFrame(80,{ready:true,foreground:true});
  expect(q.getQualityProfile().id).toBe('beautiful');expect(localStorage.getItem(q.QUALITY_KEY)).toBe('beautiful');
  expect(localStorage.length).toBe(1);
  vi.resetModules();q=await load();expect(q.getQualityProfile().id).toBe('beautiful');
  expect(()=>q.setQualityPreference('unknown' as never)).toThrow('Unknown');
});

it('ignores loading, paused, background, suspended and isolated bad frames before a bounded measured downgrade',async()=>{
  const q=await load();
  for(let i=0;i<300;i++){
    q.observeQualityFrame(80,{ready:false,foreground:true});
    q.observeQualityFrame(80,{ready:true,foreground:false});
    q.observeQualityFrame(80,{ready:true,foreground:true,paused:true});
    q.observeQualityFrame(2000,{ready:true,foreground:true});
  }
  expect(q.getQualityProfile().id).toBe('standard');
  // Discontinuity resets the window; a few slow startup frames do not decide.
  for(let i=0;i<70;i++)q.observeQualityFrame(80,{ready:true,foreground:true});
  q.observeQualityFrame(16,{ready:false,foreground:true});
  expect(q.getQualityProfile().id).toBe('standard');
  for(let i=0;i<225;i++)q.observeQualityFrame(40,{ready:true,foreground:true});
  expect(q.getQualityState()).toMatchObject({preference:'auto',recommended:'smooth',reason:'measured-frames'});
  q.setQualityCapabilities({deviceMemory:32,hardwareConcurrency:32,maxTextureSize:16384});
  for(let i=0;i<600;i++)q.observeQualityFrame(8,{ready:true,foreground:true});
  expect(q.getQualityProfile().id).toBe('smooth');expect(localStorage.length).toBe(0);
});

it('keeps standard on a fast ready scene and cleans subscriptions when their owner aborts',async()=>{
  const q=await load(),listener=vi.fn(),controller=new AbortController();q.onQualityChange(listener,{signal:controller.signal});
  for(let i=0;i<600;i++)q.observeQualityFrame(16.7,{ready:true,foreground:true});
  expect(q.getQualityProfile().id).toBe('standard');
  q.setQualityPreference('smooth');expect(listener).toHaveBeenCalledTimes(1);
  controller.abort();q.setQualityPreference('standard');expect(listener).toHaveBeenCalledTimes(1);
});

it('shares manual settings between welcome and menu, updates language in place, and disposes its DOM',async()=>{
  const q=await load(),welcome=q.mountQualitySettings(document.body,{compact:true}),menu=q.mountQualitySettings(document.body);
  const select=welcome.element.querySelector('select')!;select.value='smooth';select.dispatchEvent(new Event('change'));
  expect(menu.element.querySelector('select')!.value).toBe('smooth');
  document.documentElement.lang='zh-CN';await Promise.resolve();
  expect(menu.element.textContent).toContain('画面质量');expect(menu.element.textContent).toContain('玩法完整保留');
  expect(select.value).toBe('smooth');
  welcome.dispose();menu.dispose();expect(document.querySelector('.quality-settings')).toBeNull();
});

function fakeRenderer(){
  const target={name:'prior-target'},canvas=document.createElement('canvas');
  const renderer={
    domElement:canvas,getSize:(value:T.Vector2)=>value.set(800,600),getPixelRatio:()=>1.35,
    getRenderTarget:()=>target,setRenderTarget:vi.fn(),render:vi.fn(),
    info:{autoReset:true,reset:vi.fn(),render:{calls:4,triangles:120},memory:{geometries:10,textures:5},programs:[{}]},
  };
  return {renderer:renderer as unknown as T.WebGLRenderer,raw:renderer,target};
}

it('releases every active and inactive line pipeline for Smooth, rebuilds lazily, and restores shared renderer state',async()=>{
  const q=await load();q.setQualityPreference('standard');
  const {createVillageDrawing}=await import('../src/client/village-drawing.ts');
  const {renderer,raw,target}=fakeRenderer(),scene=new T.Scene(),a=createVillageDrawing(renderer,scene,new T.PerspectiveCamera()),b=createVillageDrawing(renderer,scene,new T.PerspectiveCamera());
  a.render();b.render();expect(drawerMocks.instances.length).toBe(2);
  q.setQualityPreference('smooth');
  for(const drawer of drawerMocks.instances){expect(drawer.dispose).toHaveBeenCalledTimes(1);expect(drawer.extraDispose).toHaveBeenCalledTimes(1);}
  a.render();expect(raw.render).toHaveBeenCalledWith(scene,expect.any(T.PerspectiveCamera));expect(raw.setRenderTarget).toHaveBeenLastCalledWith(target);expect(raw.info.autoReset).toBe(true);
  expect(raw.domElement.dataset.drawingPipeline).toBe('direct');expect(raw.domElement.dataset.screenSpacePasses).toBe('0');
  expect(JSON.parse(raw.domElement.dataset.rendererMemory!)).toEqual({geometries:10,textures:5,programs:1});
  q.setQualityPreference('beautiful');expect(drawerMocks.instances.length).toBe(2);
  a.render();expect(drawerMocks.instances.length).toBe(3);expect(raw.domElement.dataset.screenSpacePasses).toBe('3');
  a.dispose();a.dispose();b.dispose();expect(drawerMocks.instances[2].dispose).toHaveBeenCalledTimes(1);
});

it('preserves the host orthographic line shader when a room pipeline is rebuilt',async()=>{
  const q=await load();q.setQualityPreference('smooth');
  const {createVillageDrawing}=await import('../src/client/village-drawing.ts');
  const {renderer}=fakeRenderer(),drawing=createVillageDrawing(renderer,new T.Scene(),new T.OrthographicCamera());
  drawing.render();expect(drawerMocks.instances.length).toBe(0);
  q.setQualityPreference('standard');drawing.render();
  expect(drawerMocks.instances[0].pass.lines.normalQuad.material.fragmentShader).toContain('orthographicDepthToViewZ');
  expect(drawerMocks.instances[0].pass.lines.lineQuad.material.fragmentShader).toContain('vec3( d.xy, -z )');drawing.dispose();
});

it('releases old shadow targets on budget changes without moving the light or its shadow camera',async()=>{
  const q=await load(),{configureQualityShadow}=await import('../src/client/presentation.ts');
  const sun=new T.DirectionalLight();sun.position.set(3,9,2);sun.shadow.camera.left=-8;
  const map=new T.WebGLRenderTarget(2048,2048),pass=new T.WebGLRenderTarget(2048,2048),mapDispose=vi.spyOn(map,'dispose'),passDispose=vi.spyOn(pass,'dispose');
  sun.shadow.map=map;sun.shadow.mapPass=pass;sun.shadow.mapSize.set(2048,2048);
  configureQualityShadow(sun,q.QUALITY_PROFILES.smooth);
  expect(sun.castShadow).toBe(false);expect(sun.shadow.map).toBeNull();expect(sun.shadow.mapPass).toBeNull();
  expect(mapDispose).toHaveBeenCalledTimes(1);expect(passDispose).toHaveBeenCalledTimes(1);
  configureQualityShadow(sun,q.QUALITY_PROFILES.standard);expect(sun.castShadow).toBe(true);expect(sun.shadow.mapSize.toArray()).toEqual([1024,1024]);
  configureQualityShadow(sun,q.QUALITY_PROFILES.beautiful);expect(sun.shadow.mapSize.toArray()).toEqual([2048,2048]);
  expect(sun.position.toArray()).toEqual([3,9,2]);expect(sun.shadow.camera.left).toBe(-8);sun.shadow.dispose();
});


it('bounds Retina and wide-window canvas pixels while retaining density on a phone',async()=>{
  const q=await load();
  for(const tier of ['smooth','standard','beautiful'] as const){
    q.setQualityPreference(tier);
    const profile=q.getQualityProfile();
    for(const [width,height,dpr] of [[2560,1230,2],[5120,2880,2],[1920,1080,1],[390,844,3]]){
      const ratio=q.qualityPixelRatio(dpr,width,height);
      expect(width*height*ratio*ratio).toBeLessThanOrEqual(profile.maxRenderPixels+1e-6);
      expect(ratio).toBeLessThanOrEqual(Math.min(dpr,profile.pixelRatioCap));
      expect(Number.isFinite(ratio)&&ratio>0).toBe(true);
    }
  }
  q.setQualityPreference('beautiful');
  expect(q.qualityPixelRatio(3,390,844)).toBe(1.8);
  // Beautiful retains roughly one world pixel per CSS pixel on the tested Retina window.
  expect(q.qualityPixelRatio(2,2560,1230)).toBeGreaterThanOrEqual(1);
  expect(q.qualityPixelRatio(2,2560,1230)).toBeLessThan(1.8);
  expect(q.qualityPixelRatio(2,0,NaN)).toBe(1.8);
});
