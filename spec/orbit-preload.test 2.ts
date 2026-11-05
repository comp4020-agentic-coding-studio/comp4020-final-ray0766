import {expect,it} from 'vitest';
import {Group,Mesh,BufferGeometry,BufferAttribute,MeshBasicMaterial} from 'three';
import {orbitPlan,orbitCacheLimit,orbitBufferBytes} from '../src/client/orbit-preload.ts';
import {groundFlight} from '../src/shared/flight.ts';
import type {PlanetSummary} from '../src/shared/planets.ts';
const planets=Array.from({length:60},(_,i)=>({id:String(i),slot:i,center:[(i%10)*90,0,Math.floor(i/10)*90]} as PlanetSummary));
it('bounds loaded and rendered worlds independently even in a large atlas',()=>{
 const f={...groundFlight(),yaw:Math.PI/2};for(const quality of ['smooth','standard','beautiful'] as const){const budget=orbitCacheLimit(quality),plan=orbitPlan(planets,f,budget);expect(plan.wanted.length).toBeLessThanOrEqual(budget);expect(plan.detailed.length).toBeLessThanOrEqual(8);expect(new Set(plan.wanted.map(p=>p.id)).size).toBe(plan.wanted.length);}
 expect(orbitCacheLimit('smooth')).toBeLessThan(orbitCacheLimit('standard'));
});
it('prepares ahead while retaining the near detail set and refuses distant atlas-wide loading',()=>{
 const f={...groundFlight(),yaw:Math.PI/2},p=orbitPlan(planets,f,12);
 for(const near of p.detailed)expect(p.wanted).toContain(near);
 expect(p.wanted.some(x=>x.center[0]>=270)).toBe(true);expect(p.wanted.some(x=>x.center[0]>=540)).toBe(false);
});
it('turning reorders prefetch without depending on the camera orbit',()=>{
 const f={...groundFlight(),position:[270,0,180] as [number,number,number]},east=orbitPlan(planets,{...f,yaw:Math.PI/2},12),west=orbitPlan(planets,{...f,yaw:-Math.PI/2},12);
 expect(east.wanted.map(p=>p.id)).not.toEqual(west.wanted.map(p=>p.id));expect(east.detailed.map(p=>p.id)).toEqual(west.detailed.map(p=>p.id));
});
it('counts unique geometry buffers instead of double-counting reused meshes',()=>{
 const g=new BufferGeometry(),a=new Float32Array(9);g.setAttribute('position',new BufferAttribute(a,3));const root=new Group(),m=new MeshBasicMaterial();root.add(new Mesh(g,m),new Mesh(g,m));expect(orbitBufferBytes(root)).toBe(a.byteLength);g.dispose();m.dispose();
});
