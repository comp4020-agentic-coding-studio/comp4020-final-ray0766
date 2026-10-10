import {partLabel,PART_IDS,PARTS} from '../shared/blueprint-parts.ts';
import type {PartId} from '../shared/blueprint-parts.ts';

/** Source IDs remain stable; three source labels still describe older geometry. */
const current:Partial<Record<PartId,string>>={
 'stair.straight':'Timber stair',
 'garden.tree':'Garden pine',
 'furniture.bench':'Garden bench',
};
export const villagePartLabel=(id:PartId)=>current[id]??partLabel(id,'village');

/** Source geometry diagnostics name numbered parts. Adapt only those messages;
 * player group names and library text never pass through this function. */
export function villagePartDiagnostic(message:string){
 for(const id of PART_IDS){
  const name=PARTS[id].label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  message=message.replace(new RegExp(`\\b${name}(?= #\\d)`, 'g'),villagePartLabel(id));
 }
 return message;
}
