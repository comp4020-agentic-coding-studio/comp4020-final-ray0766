import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {buildPart,LEGACY_PART_IDS as PART_IDS} from '../src/shared/blueprint-parts.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {handleFor} from '../src/assets/claude-geometry/core/dispose.ts';
import {villagePartDiagnostic,villagePartLabel} from '../src/client/part-labels.ts';
import {translate} from '../src/client/i18n.ts';

type Figure={id:string;cost:{village:Record<'low'|'medium'|'high',{triangles:number;drawCalls:number}>};boxHigh:{village:{min:number[];max:number[]}}};
const manifest=JSON.parse(readFileSync(new URL('../src/assets/claude-geometry/data/workshop-manifest.json',import.meta.url),'utf8')) as {parts:Figure[]};

it('builds the actual 45 village shapes at every tier within the handed-over figures and measured bounds',()=>{
 expect(manifest.parts.map(part=>part.id)).toEqual([...PART_IDS]);
 for(const lod of ['low','medium','high'] as const){
  const library=new StyleLibrary(lod,{look:'village',scans:false});
  try{for(const id of PART_IDS){
   const part=buildPart(id,library),handle=handleFor(part.group),figure=manifest.parts.find(p=>p.id===id)!;
   try{
    expect({triangles:part.triangles,drawCalls:part.drawCalls},`${id}/${lod}`).toEqual(figure.cost.village[lod]);
    if(lod==='high'){
     const box=new T.Box3().setFromObject(part.group);
     for(let axis=0;axis<3;axis++){
      // The handed-over manifest rounds measured bounds to four decimals.
      expect(box.min.getComponent(axis),id).toBeCloseTo(figure.boxHigh.village.min[axis],4);
      expect(box.max.getComponent(axis),id).toBeCloseTo(figure.boxHigh.village.max[axis],4);
     }
    }
   }finally{handle.dispose();}
  }expect(library.unlisted()).toEqual([]);}finally{library.dispose();}
 }
});

it('names the current visible forms in both languages without altering stable part ids',()=>{
 expect(villagePartLabel('garden.tree')).toBe('Garden pine');
 expect(villagePartLabel('furniture.bench')).toBe('Garden bench');
 expect(villagePartLabel('wall.door.open')).toBe('Lattice door, open');
 expect(villagePartDiagnostic('Overlaps Door wall #7.')).toBe('Overlaps Lattice door #7.');
 expect(villagePartDiagnostic('Overlaps Tree #12.')).toBe('Overlaps Garden pine #12.');
 for(const id of PART_IDS)expect(translate(villagePartLabel(id),'zh'),id).not.toBe(villagePartLabel(id));
});
