import type {PartId} from './blueprint-parts.ts';
import type {Vec3} from './world.ts';
// Metre-identical models and collision boxes. The pot's translation only
// recentres its edge-local origin for an ordinary world placement.
export const QUICK_PARTS:Partial<Record<string,{part:PartId;offset:Vec3;radius:number;height:number}>>={
 tree:{part:'garden.tree',offset:[0,0,0],radius:.4399,height:2.3},
 flowers:{part:'garden.pot',offset:[0,0,.33],radius:.202,height:.4966},
 bench:{part:'furniture.bench',offset:[0,0,0],radius:.6104,height:.44},
};
