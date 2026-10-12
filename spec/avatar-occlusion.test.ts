import {describe,expect,it,vi} from 'vitest';
import {BoxGeometry,Group,Material,Mesh,MeshStandardMaterial} from 'three';
import {AvatarOcclusion} from '../src/client/avatar-occlusion.ts';
import {courier} from '../src/client/character.ts';

const materials=(mesh:Mesh)=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
function meshes(root:Group){const found:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh)found.push(o);});return found;}
function solidFixture(){const original=new MeshStandardMaterial({color:'#d76c42'}),mesh=new Mesh(new BoxGeometry(),original),root=new Group();root.add(mesh);return{root,mesh,original,fader:new AvatarOcclusion(root)};}

describe('local avatar camera occlusion',()=>{
  it('fades the actual local courier while preserving shared NPC materials and the occupied geometry',()=>{
    const local=courier('clay'),neighbour=courier('clay'),localMeshes=meshes(local.root),npcMeshes=meshes(neighbour.root);
    const sources=localMeshes.map(materials),npcSources=npcMeshes.map(materials);
    const geometry=localMeshes.map(m=>({geometry:m.geometry,position:m.position.toArray(),rotation:m.quaternion.toArray(),scale:m.scale.toArray(),visible:m.visible}));
    const rootPose={position:local.root.position.toArray(),rotation:local.root.quaternion.toArray(),scale:local.root.scale.toArray(),visible:local.root.visible};
    const originals=new Set([...sources,...npcSources].flat()),before=new Map([...originals].map(m=>[m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite}]));
    expect(sources.flat().some(m=>!m.transparent&&npcSources.flat().includes(m))).toBe(true);
    const fader=new AvatarOcclusion(local.root),amount=fader.update(.5,1/60);
    expect(amount).toBeGreaterThanOrEqual(.25);expect(amount).toBeLessThan(1);
    localMeshes.forEach((mesh,i)=>{
      expect(mesh.geometry).toBe(geometry[i].geometry);expect(mesh.position.toArray()).toEqual(geometry[i].position);expect(mesh.quaternion.toArray()).toEqual(geometry[i].rotation);expect(mesh.scale.toArray()).toEqual(geometry[i].scale);expect(mesh.visible).toBe(geometry[i].visible);
      materials(mesh).forEach((m,j)=>{
        const source=sources[i][j];
        if(source.transparent)expect(m).toBe(source);
        else{expect(m).not.toBe(source);expect(m.opacity).toBeCloseTo(source.opacity*amount,9);expect(m.transparent).toBe(true);expect(m.depthWrite).toBe(false);}
      });
    });
    npcMeshes.forEach((m,i)=>expect(materials(m)).toEqual(npcSources[i]));
    for(const m of originals)expect({opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite}).toEqual(before.get(m));
    expect({position:local.root.position.toArray(),rotation:local.root.quaternion.toArray(),scale:local.root.scale.toArray(),visible:local.root.visible}).toEqual(rootPose);
    fader.restore();localMeshes.forEach((m,i)=>expect(materials(m)).toEqual(sources[i]));fader.dispose();
  });

  it('preserves shader hooks and handles shared, array and already-transparent materials',()=>{
    const solid=new MeshStandardMaterial({color:'#537a62'}),glass=new MeshStandardMaterial({transparent:true,opacity:.4});
    solid.onBeforeCompile=vi.fn();solid.customProgramCacheKey=()=> 'independent-cel-fixture';solid.userData={sharedResource:true,artProfile:'fixture'};
    const root=new Group(),a=new Mesh(new BoxGeometry(),[solid,glass,solid]),b=new Mesh(new BoxGeometry(),solid);root.add(a,b);
    const fader=new AvatarOcclusion(root);fader.update(.4,.1);
    const copies=materials(a),copy=copies[0];expect(copy).not.toBe(solid);expect(copies[1]).toBe(glass);expect(copies[2]).toBe(copy);expect(b.material).toBe(copy);
    expect(copy.onBeforeCompile).toBe(solid.onBeforeCompile);expect(copy.customProgramCacheKey).toBe(solid.customProgramCacheKey);
    expect(copy.customProgramCacheKey()).toBe('independent-cel-fixture');expect(copy.userData).toMatchObject({sharedResource:false,ownedResource:true,artProfile:'fixture'});
    expect(solid.userData).toEqual({sharedResource:true,artProfile:'fixture'});expect(glass.opacity).toBe(.4);
    fader.restore();expect(materials(a)).toEqual([solid,glass,solid]);expect(b.material).toBe(solid);fader.dispose();
  });

  it('adopts a real setColor coat change during fading and restores the new shared coat',()=>{
    const local=courier('clay'),neighbour=courier('fern'),list=meshes(local.root),fader=new AvatarOcclusion(local.root);
    fader.update(.5,.1);const faded=list.map(materials);local.setColor('fern');const recoloured=list.map(materials);
    const changed=list.map((_,i)=>i).filter(i=>recoloured[i][0]!==faded[i][0]);expect(changed.length).toBeGreaterThan(0);
    const sharedFern=recoloured[changed[0]][0];expect(meshes(neighbour.root).some(m=>materials(m).includes(sharedFern))).toBe(true);
    const amount=fader.update(.5,1/60);
    for(const i of changed){const copy=materials(list[i])[0];expect(copy).not.toBe(sharedFern);expect(copy.opacity).toBeCloseTo(amount,9);expect((copy as MeshStandardMaterial).color.equals((sharedFern as MeshStandardMaterial).color)).toBe(true);}
    expect(sharedFern.opacity).toBe(1);expect(sharedFern.transparent).toBe(false);
    fader.restore();for(const i of changed)expect(materials(list[i])[0]).toBe(sharedFern);fader.dispose();
  });

  it('keeps a visible opacity floor, fades and restores smoothly, and agrees across 30/60/120Hz',()=>{
    const results=[30,60,120].map(rate=>{
      const {fader,mesh,original}=solidFixture();let prior=1,amount=1;
      expect(fader.update(.2,0)).toBe(1);expect(mesh.material).toBe(original);
      for(let i=0;i<rate/5;i++){amount=fader.update(.2,1/rate);expect(amount).toBeLessThan(prior);expect(amount).toBeGreaterThanOrEqual(.25);prior=amount;}
      const faded=amount;
      for(let i=0;i<rate*2/5;i++){amount=fader.update(4,1/rate);expect(amount).toBeGreaterThan(prior);expect(amount).toBeLessThanOrEqual(1);prior=amount;}
      const restored=amount;
      for(let i=0;i<rate*2;i++)amount=fader.update(.2,1/rate);
      expect(amount).toBe(.25);expect((mesh.material as Material).opacity).toBe(.25);
      for(let i=0;i<rate*2;i++)amount=fader.update(.2,1/rate,false);
      expect(amount).toBe(1);expect(mesh.material).toBe(original);fader.dispose();return{faded,restored};
    });
    for(const result of results.slice(1)){expect(result.faded).toBeCloseTo(results[0].faded,10);expect(result.restored).toBeCloseTo(results[0].restored,10);}
  });

  it('reuses copies and disposes each owned material once without disposing originals or geometry',()=>{
    const {root,mesh,original,fader}=solidFixture(),sourceDispose=vi.fn(),geometryDispose=vi.fn();
    original.addEventListener('dispose',sourceDispose);mesh.geometry.addEventListener('dispose',geometryDispose);
    fader.update(.5,.1);const first=mesh.material as Material,firstDispose=vi.fn();first.addEventListener('dispose',firstDispose);
    for(let i=0;i<20;i++){fader.update(.5,1/60);expect(mesh.material).toBe(first);}
    const newCoat=new MeshStandardMaterial({color:'#6687a0'}),newSourceDispose=vi.fn();newCoat.addEventListener('dispose',newSourceDispose);mesh.material=newCoat;
    fader.update(.5,1/60);const second=mesh.material as Material,secondDispose=vi.fn();second.addEventListener('dispose',secondDispose);expect(second).not.toBe(first);expect(second).not.toBe(newCoat);
    fader.restore();expect(mesh.material).toBe(newCoat);expect(firstDispose).not.toHaveBeenCalled();expect(secondDispose).not.toHaveBeenCalled();
    fader.dispose();expect(mesh.material).toBe(newCoat);expect(root.visible).toBe(true);expect(firstDispose).toHaveBeenCalledTimes(1);expect(secondDispose).toHaveBeenCalledTimes(1);
    fader.dispose();expect(firstDispose).toHaveBeenCalledTimes(1);expect(secondDispose).toHaveBeenCalledTimes(1);expect(sourceDispose).not.toHaveBeenCalled();expect(newSourceDispose).not.toHaveBeenCalled();expect(geometryDispose).not.toHaveBeenCalled();
  });
});
