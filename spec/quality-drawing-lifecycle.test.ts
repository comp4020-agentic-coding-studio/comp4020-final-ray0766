// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import * as T from 'three';
const state=vi.hoisted(()=>({sizes:[] as number[][],drawers:0}));
vi.mock('../src/assets/claude-geometry/style/lines.ts',()=>({PEN_CELL:.2,LineDrawer:class {
  pass={lines:{setFade(){},setPenCell(){}}};composer={passes:[]};constructor(){state.drawers++;}setSize(...size:number[]){state.sizes.push(size);}render(){}dispose(){}
}}));
vi.mock('../src/assets/claude-geometry/style/sky.ts',()=>({createCloudSky:()=>null}));
import {createVillageDrawing} from '../src/client/village-drawing.ts';
import {setQualityPreference} from '../src/client/quality.ts';
it('sizes each rebuilt line target at unchanged DPR1 after repeated Smooth round trips',()=>{
 setQualityPreference('standard');state.sizes=[];state.drawers=0;
 const renderer={domElement:document.createElement('canvas'),getSize:(size:T.Vector2)=>size.set(390,844),getPixelRatio:()=>1} as unknown as T.WebGLRenderer;
 const drawing=createVillageDrawing(renderer,new T.Scene(),new T.PerspectiveCamera());
 try{
  drawing.resize();expect(state.sizes).toEqual([[390,844,1]]);
  for(const tier of ['standard','beautiful','standard'] as const){
   setQualityPreference('smooth');drawing.resize();drawing.resize();
   setQualityPreference(tier);drawing.resize();
   expect(state.sizes.at(-1)).toEqual([390,844,1]);
   expect(state.sizes.length).toBe(state.drawers);
  }
  expect(state.drawers).toBe(4);
 }finally{drawing.dispose();setQualityPreference('standard');}
});
