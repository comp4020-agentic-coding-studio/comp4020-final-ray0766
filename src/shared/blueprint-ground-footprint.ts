import {blueprintGroundFootprint} from '../assets/claude-geometry/blueprint/model.ts';
import type {PartPlacement} from '../assets/claude-geometry/blueprint/model.ts';
import type {Footprint} from '../assets/claude-geometry/core/ground.ts';

// Parts may be edited in place by a workshop. Identity alone is insufficient:
// compare the entire authored list before reusing its dense support samples.
const footprints=new WeakMap<readonly PartPlacement[],{signature:string;footprint:Footprint}>();
export function structureGroundFootprint(parts:readonly PartPlacement[]):Footprint{
 const signature=JSON.stringify(parts);let entry=footprints.get(parts);
 if(!entry||entry.signature!==signature){entry={signature,footprint:blueprintGroundFootprint(parts)};footprints.set(parts,entry);}
 // Preserve the original fresh-result contract. A caller cannot mutate the
 // memoized samples and silently change another building's collision/support.
 return {radius:entry.footprint.radius,samples:entry.footprint.samples.map(([x,z])=>[x,z])};
}
