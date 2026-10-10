import {expect,it} from 'vitest';
import {Fog,Scene} from 'three';
import type {PlanetView} from '../src/shared/planets.ts';
import {worldVisualSignature} from '../src/client/world-visual-signature.ts';
import {updateGroundFog} from '../src/client/presentation.ts';

const planet=():PlanetView=>({id:'home',name:'Home',kind:'garden',claimed:true,mine:true,revision:4,objectCount:0,center:[0,0,0],slot:1,radius:21.6,environment:null,objects:[],homeDoor:{buildingId:'house',partNumber:12,open:true,version:0}});
it('keeps terrain and building presentation stable for door-only revisions but refreshes actual edits',()=>{
  const before=planet(),after=structuredClone(before);after.revision++;after.homeDoor!.open=false;after.homeDoor!.version++;
  expect(worldVisualSignature(after)).toBe(worldVisualSignature(before));
  after.objects.push({id:'path',kind:'path',position:[0,1,0],rotation:0,version:1});
  expect(worldVisualSignature(after)).not.toBe(worldVisualSignature(before));
  const moved=structuredClone(after);moved.objects[0].position=[.1,.99,0];
  expect(worldVisualSignature(moved)).not.toBe(worldVisualSignature(after));
});
it('keeps a 390px pulled-back globe visible and restores walking fog on return',()=>{
  const scene=new Scene();scene.fog=new Fog('#9cc8c4',30,78);
  updateGroundFog(scene,'hub',21.6,117);
  expect(scene.fog.near).toBeGreaterThan(117-21.6);
  expect(scene.fog.far-scene.fog.near).toBe(48);
  const pulledBackNear=scene.fog.near;
  // Finishing Build changes the mode immediately; the phone camera is still
  // far away and must not disappear into walking-distance fog for that frame.
  updateGroundFog(scene,'hub',21.6,117);
  expect(scene.fog.near).toBe(pulledBackNear);
  for(const distance of [95,70,45]){
    updateGroundFog(scene,'hub',21.6,distance);
    expect(scene.fog.near).toBeGreaterThan(distance-21.6);
    expect(scene.fog.far-scene.fog.near).toBeCloseTo(48,10);
  }
  updateGroundFog(scene,'hub',21.6,28);
  expect(scene.fog.near).toBe(30);expect(scene.fog.far).toBe(78);
});
