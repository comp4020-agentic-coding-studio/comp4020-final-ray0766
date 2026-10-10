import {expect,it} from 'vitest';
import {blueprintGroundFootprint} from '../src/assets/claude-geometry/blueprint/model.ts';
import type {PartPlacement} from '../src/assets/claude-geometry/blueprint/model.ts';
import {structureGroundFootprint} from '../src/shared/blueprint-ground-footprint.ts';

it('keeps exact dense support samples through in-place edits, replacement, rotation and deletion',()=>{
 const parts:PartPlacement[]=[{n:1,part:'floor.deck',level:0,x:1,z:1,rot:0}];
 const check=()=>expect(structureGroundFootprint(parts)).toEqual(blueprintGroundFootprint(parts));
 check();check();
 parts.push({n:2,part:'stair.straight',level:0,x:2,z:1,rot:0});check();
 parts[1].rot=1;check();parts[0].x=0;check();
 parts[0]={...parts[0],part:'wall.door.open'};check();
 parts.splice(1,1);check();parts.reverse();check();
});
it('preserves independent mutable results without letting callers poison later support calculations',()=>{
 const parts:PartPlacement[]=[{n:1,part:'floor.deck',level:0,x:1,z:1,rot:0}],before=JSON.stringify(parts);
 const first=structureGroundFootprint(parts);first.samples[0][0]=900;first.samples.push([700,800]);first.radius=999;
 expect(structureGroundFootprint(parts)).toEqual(blueprintGroundFootprint(parts));
 expect(structureGroundFootprint([...parts])).toEqual(blueprintGroundFootprint(parts));
 expect(JSON.stringify(parts)).toBe(before);
});
