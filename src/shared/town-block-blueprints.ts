import type {Blueprint, PartPlacement, Rot} from './blueprint-model.ts';
import type {BlueprintId} from '../assets/claude-geometry/core/ids.ts';

type Cell = readonly [number, number];
type Edge = readonly [number, number, Rot];
export interface TownBlockPlan {
 key: string;
 name: string;
 nameZh: string;
 blueprint: Blueprint;
 /** Ground cells of the roofed building body. Steps and outdoor courts are excluded. */
 solidGroundCells: Cell[];
 /** Every ordinary roof cell, including its actual level. */
 roofCells: {x:number;z:number;level:number}[];
 entrances: {doorPart:number;stepPart:number;cell:Cell;outward:Rot}[];
 openWorkBays?: {cells:Cell[];outward:Rot;stepParts:number[]}[];
 /** Authoring hints only: neighbour placement still needs real geometry checks. */
 joins: string[];
}

const directions:readonly Edge[] = [[0,1,0],[1,0,1],[0,-1,2],[-1,0,3]];
const rectangle=(x0:number,z0:number,width:number,depth:number):Cell[]=>
 Array.from({length:width},(_,x)=>Array.from({length:depth},(_,z)=>[x+x0,z+z0] as const)).flat();
const sameCell=(a:Cell,b:Cell)=>a[0]===b[0]&&a[1]===b[1];

class BlockSketch {
 readonly parts:PartPlacement[]=[];
 readonly entrances:TownBlockPlan['entrances']=[];
 readonly openWorkBays:NonNullable<TownBlockPlan['openWorkBays']>=[];
 add(part:PartPlacement['part'],x:number,z:number,rot:Rot=0,level=0){
  const p:PartPlacement={n:this.parts.length+1,part,x,z,rot,level};
  this.parts.push(p);return p;
 }
 shell(cells:readonly Cell[],level:number,doors:readonly Edge[]=[],corrugated=false,openings:readonly Edge[]=[]){
  const has=(x:number,z:number)=>cells.some(c=>c[0]===x&&c[1]===z);
  for(const [x,z]of cells){
   this.add('floor.deck',x,z,0,level);
   for(const [dx,dz,rot]of directions)if(!has(x+dx,z+dz)){
    if(openings.some(d=>d[0]===x&&d[1]===z&&d[2]===rot))continue;
    const door=doors.some(d=>d[0]===x&&d[1]===z&&d[2]===rot);
    this.add(door?'wall.door.open':(x+2*z+rot)%4===0?'wall.window':corrugated?'wall.corrugated':'wall.solid',x,z,rot,level);
   }
  }
 }
 entry(door:Edge,step:Cell){
  const doorPart=this.parts.find(p=>p.level===0&&p.part==='wall.door.open'&&p.x===door[0]&&p.z===door[1]&&p.rot===door[2]);
  if(!doorPart)throw Error('A block entry must identify an actual open door.');
  const stepPart=this.add('step.entry',step[0],step[1],door[2]);
  this.entrances.push({doorPart:doorPart.n,stepPart:stepPart.n,cell:[door[0],door[1]],outward:door[2]});
 }
 flat(cells:readonly Cell[],level:number,parapet=false){
  const has=(x:number,z:number)=>cells.some(c=>c[0]===x&&c[1]===z);
  for(const [x,z]of cells){
   this.add('roof.deck',x,z,0,level);
   if(parapet)for(const [dx,dz,rot]of directions)if(!has(x+dx,z+dz))this.add('roof.parapet',x,z,rot,level);
  }
 }
 finish(key:string,name:string,nameZh:string,solid:Cell[],joins:string[]):TownBlockPlan{
  const names=['deep-row','work-hall','thick-corner','step-house','yard-wing','warehouse','low-service',
   'narrow-deep-row','narrow-ridge-house','full-depth-block','full-depth-work-hall','full-depth-step-house'];
  const index=names.indexOf(key);
  if(index<0)throw Error(`Unknown block identity ${key}`);
  return {key,name,nameZh,blueprint:{id:`41d329a7-cb47-4cc7-bc09-b1${String(index).padStart(10,'0')}` as BlueprintId,
   name:`Town · ${name}`,parts:this.parts,groups:[
    {name:'Ground shell',members:this.parts.filter(p=>p.level===0).map(p=>p.n)},
    {name:'Upper mass and roof',members:this.parts.filter(p=>p.level>0).map(p=>p.n)},
   ]},solidGroundCells:solid,
   roofCells:this.parts.filter(p=>p.part==='roof.deck'||p.part==='roof.slope'||p.part==='roof.slope.hip'||p.part==='roof.slope.valley')
    .map(p=>({x:p.x,z:p.z,level:p.level})),entrances:this.entrances,
   ...(this.openWorkBays.length?{openWorkBays:this.openWorkBays}:{}),joins};
 }
}

/** Five street bays, four metres of real enclosed depth, one inset entry.
 * The low parapet silhouette is reserved for continuous rows and service edges. */
function deepRow():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,5,4);
 s.shell(cells,0,[[1,1,2]]);
 // Real interior posts carry the centre slabs; none stands on the entry axis.
 s.add('structure.column',1,2);s.add('structure.column',3,2);
 s.flat(cells,1,true);s.entry([1,1,2],[1,0]);
 return s.finish('deep-row','Deep street row','深进街屋',cells,
  ['Flat-roof east/west end walls have no sloping eaves; keep actual wall skins apart.',
   'The -Z street face has its real step at x=1, z=0; the rear remains a four-metre-deep room.']);
}

/** A broad twenty-cell workshop with a raised crosswise gable and ten cells
 * of lower roof. The upper closed volume is part of the public shell, not an
 * independent room or an interaction destination. */
function workHall():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,5,4),upper=rectangle(0,2,5,2);
 s.shell(cells,0,[[2,1,2]],true);
 for(const [x,z]of [[1,1],[3,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upper,1);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upper)s.add('roof.slope',x,z,z===2?2:0,2);
 for(const z of [2,3]){
  const rot:Rot=z===2?2:0;
  s.add(z===2?'roof.verge.right':'roof.verge.left',0,z,rot,2);
  s.add(z===2?'roof.verge.left':'roof.verge.right',4,z,rot,2);
 }
 s.entry([2,1,2],[2,0]);
 return s.finish('work-hall','Deep ridge workshop','深进高脊工房',cells,
  ['East/west gable ends use ordinary verge boards; separate their real protrusions.',
   'Front and rear low roofs keep the high continuous ridge legible from the globe.']);
}

/** A thick L closes two street edges around one finite four-cell entry court.
 * A raised three-bay gable marks the outer corner; both doors and both steps
 * are ordinary, independent parts within the five-by-five document. */
function thickCorner():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(x>=3&&z<=1)),upper=rectangle(0,0,2,3);
 s.shell(cells,0,[[3,2,2],[2,0,1]]);
 for(const [x,z]of [[1,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upper,1);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upper)s.add('roof.slope',x,z,x===0?3:1,2);
 for(const x of [0,1]){
  const rot:Rot=x===0?3:1;
  s.add(x===0?'roof.verge.left':'roof.verge.right',x,0,rot,2);
  s.add(x===0?'roof.verge.right':'roof.verge.left',x,2,rot,2);
 }
 s.entry([3,2,2],[3,1]);s.entry([2,0,1],[3,0]);
 return s.finish('thick-corner','Thick corner house','厚翼转角屋',cells,
  ['The front-right two-by-two notch is a bounded doorstep court, not roofed building area.',
   'Its -Z and +X entries are separate. The rear and west walls can define the outer block edge.']);
}

/** The same twenty-cell ground depth rises into a three-by-three upper block
 * at the rear-left. A broad low shoulder and a high parapet make the steps in
 * mass visible without changing the ordinary floor-to-floor dimension. */
function stepHouse():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,5,4),upper=rectangle(0,2,3,3);
 s.shell(cells,0,[[3,1,2]]);
 for(const [x,z]of [[1,1],[1,3],[3,2]])s.add('structure.column',x,z);
 s.shell(upper,1);s.add('structure.column',1,3,0,1);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 s.flat(upper,2,true);s.entry([3,1,2],[3,0]);
 return s.finish('step-house','Stepped terrace block','退台阶楼',cells,
  ['The -Z entrance remains under the low shoulder; the three-by-three upper block rises at rear-left.',
   'Flat roofs have no sloping eaves. Align adjacent low shoulders only after checking real copings and wall skins.']);
}

/** A five-by-three rear body and two short returns enclose a finite three-by-two
 * open entry court. Nineteen real roof cells replace the old shallow fourteen-
 * cell U; the six courtyard cells are never counted as building or paving. */
function yardWing():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(x>=1&&x<=3&&z<=1)),upper=rectangle(1,3,3,2);
 s.shell(cells,0,[[2,2,2]]);
 for(const [x,z]of [[1,2],[3,2],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upper,1);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upper)s.add('roof.slope',x,z,z===3?2:0,2);
 for(const z of [3,4]){
  const rot:Rot=z===3?2:0;
  s.add(z===3?'roof.verge.right':'roof.verge.left',1,z,rot,2);
  s.add(z===3?'roof.verge.left':'roof.verge.right',3,z,rot,2);
 }
 s.entry([2,2,2],[2,1]);
 return s.finish('yard-wing','Deep shared court house','深院厚翼屋',cells,
  ['The -Z court is exactly three-by-two cells, with one real step at its back; do not classify wider surrounding grass as this court.',
   'Its rear body is three metres deep. An upper crosswise gable distinguishes it from the low court returns.']);
}

/** Twenty-three ground cells, with two offset, perpendicular raised gables.
 * Both roofs use valid two-cell pitches; repeating slopes across a four-cell
 * depth would put real eaves through neighbouring cells and is not used. */
function warehouse():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(z===0&&(x===1||x===2)));
 const upperA=rectangle(0,2,2,2),upperB=rectangle(3,1,2,2),upper=[...upperA,...upperB];
 s.shell(cells,0,[[2,1,2]],true);
 for(const [x,z]of [[1,1],[3,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upperA,1,[],true);s.shell(upperB,1,[],true);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upperA)s.add('roof.slope',x,z,x===0?3:1,2);
 for(const [x,z]of upperB)s.add('roof.slope',x,z,z===1?2:0,2);
 for(const x of [0,1]){
  const rot:Rot=x===0?3:1;
  s.add(x===0?'roof.verge.left':'roof.verge.right',x,2,rot,2);
  s.add(x===0?'roof.verge.right':'roof.verge.left',x,3,rot,2);
 }
 for(const z of [1,2]){
  const rot:Rot=z===1?2:0;
  s.add(z===1?'roof.verge.right':'roof.verge.left',3,z,rot,2);
  s.add(z===1?'roof.verge.left':'roof.verge.right',4,z,rot,2);
 }
 s.entry([2,1,2],[2,0]);
 return s.finish('warehouse','Staggered twin-ridge warehouse','错脊深仓',cells,
  ['A two-cell front notch carries the -Z entrance. The remaining twenty-three cells are a deep roofed store body.',
   'The two raised gables turn through ninety degrees; keep their actual eaves clear of taller neighbours.']);
}

/** A genuinely deep, low work shed for a limited harbour/service frontage.
 * Its two-cell open work mouth has two real steps and no centre post; the
 * rear corner posts and side walls carry the roof under ordinary rules. */
function lowService():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,5,4);
 s.shell(cells,0,[[3,1,2]],true,[[0,1,2],[1,1,2]]);
 s.add('structure.column',1,1);s.add('structure.column',1,3);s.add('structure.column',3,2);
 s.flat(cells,1);s.entry([3,1,2],[3,0]);
 const steps=[s.add('step.entry',0,0,2),s.add('step.entry',1,0,2)];
 s.openWorkBays.push({cells:[[0,1],[1,1]],outward:2,stepParts:steps.map(p=>p.n)});
 return s.finish('low-service','Deep open service shed','深进开口作坊',cells,
  ['The low unbroken roof and two-cell open work mouth belong to harbour/service frontage, not every residential block.',
   'The work bay is roofed building floor, not an outdoor court; both ordinary steps remain real collision.']);
}

/** A real four-by-four room for the narrowing end of a spherical street
 * block. Only its frontage is narrower; it keeps the full four-metre depth. */
function narrowDeepRow():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,4,4);
 s.shell(cells,0,[[1,1,2]]);s.add('structure.column',1,2);
 s.flat(cells,1,true);s.entry([1,1,2],[1,0]);
 return s.finish('narrow-deep-row','Narrow deep street row','窄面深进街屋',cells,
  ['Four metres of real body frontage and four metres of depth; the step stays inside the same frontage.',
   'No sloped side eaves. Copings and wall skins still extend beyond the nominal four-metre width.']);
}

/** Three metres of frontage, four of body depth, with a raised transverse
 * two-cell gable. The end walls have verge boards, not sideways roof eaves. */
function narrowRidgeHouse():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,1,3,4),upper=rectangle(0,2,3,2);
 s.shell(cells,0,[[1,1,2]]);
 s.add('structure.column',1,1);s.add('structure.column',1,3);
 s.shell(upper,1);s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upper)s.add('roof.slope',x,z,z===2?2:0,2);
 for(const z of [2,3]){
  const rot:Rot=z===2?2:0;
  s.add(z===2?'roof.verge.right':'roof.verge.left',0,z,rot,2);
  s.add(z===2?'roof.verge.left':'roof.verge.right',2,z,rot,2);
 }
 s.entry([1,1,2],[1,0]);
 return s.finish('narrow-ridge-house','Narrow deep ridge house','窄面深进脊屋',cells,
  ['Three metres of body frontage, four of depth, with an ordinary centred -Z step.',
   'The raised gable drains towards front and rear. Side verge and wall extents still need a real clearance check.']);
}

/** Almost the entire five-by-five document is real building body: one cell
 * is reserved for the inset step. It can replace a deep row where the whole
 * five-metre depth fits, without scaling the old row or changing its hash. */
function fullDepthBlock():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(x===2&&z===0));
 s.shell(cells,0,[[2,1,2]]);
 for(const [x,z]of [[1,1],[3,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.flat(cells,1,true);s.entry([2,1,2],[2,0]);
 return s.finish('full-depth-block','Full-depth inset-entry block','满深内凹入口街屋',cells,
  ['Twenty-four real roofed ground cells; only the one-cell -Z inset entry is excluded from building area.',
   'The full five-metre depth needs its own real foundation and neighbour checks; do not substitute its parts into an already seated row.']);
}

/** The raised crosswise workshop ridge over a twenty-four-cell deep body.
 * Four front wall bays stand on z=0; only the centred step is recessed. */
function fullDepthWorkHall():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(x===2&&z===0)),upper=rectangle(0,2,5,2);
 s.shell(cells,0,[[2,1,2]],true);
 for(const [x,z]of [[1,1],[3,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upper,1);s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 for(const [x,z]of upper)s.add('roof.slope',x,z,z===2?2:0,2);
 for(const z of [2,3]){
  const rot:Rot=z===2?2:0;
  s.add(z===2?'roof.verge.right':'roof.verge.left',0,z,rot,2);
  s.add(z===2?'roof.verge.left':'roof.verge.right',4,z,rot,2);
 }
 s.entry([2,1,2],[2,0]);
 return s.finish('full-depth-work-hall','Full-depth ridge workshop','满深高脊工房',cells,
  ['Four real front wall bays reach z=0; the step occupies only the centre notch, x=2 z=0.',
   'Ten high pitched roof cells and fourteen lower flat roof cells cover exactly the twenty-four building cells.']);
}

/** A full deep street body below a three-by-three rear-left upper mass. The
 * ordinary upper support column and all four ground posts remain in place. */
function fullDepthStepHouse():TownBlockPlan{
 const s=new BlockSketch(),cells=rectangle(0,0,5,5).filter(([x,z])=>!(x===2&&z===0)),upper=rectangle(0,2,3,3);
 s.shell(cells,0,[[2,1,2]]);
 for(const [x,z]of [[1,1],[3,1],[1,3],[3,3]])s.add('structure.column',x,z);
 s.shell(upper,1);s.add('structure.column',1,3,0,1);
 s.flat(cells.filter(c=>!upper.some(u=>sameCell(c,u))),1);
 s.flat(upper,2,true);s.entry([2,1,2],[2,0]);
 return s.finish('full-depth-step-house','Full-depth stepped terrace block','满深退台阶楼',cells,
  ['Four real front wall bays reach z=0 beside the single inset step; the upper block remains rear-left.',
   'Nine high roof cells and fifteen lower roof cells cover exactly twenty-four building cells, with all ordinary supporting posts retained.']);
}

export const TOWN_BLOCK_THROUGH_LANE = Object.freeze({
 key:'walk-through',
 name:'Two deep rows around an outdoor passage',
 nameZh:'双排屋穿巷组合',
 buildingKeys:['deep-row','step-house'] as const,
 solidGroundArea:40,
 passageMinimumClearWidth:2,
 reason:'A 2 m passage through a 5 × 5 m document removes 10 m², leaving at most 15 m² of solid body before entrance steps. Use two ordinary anchors around a real outdoor lane; do not claim a 1 m nominal wall gap is a comfortable through passage.',
 placement:'The layout owner authors both ordinary objects along the same real street tangent, then checks actual eaves, copings, foundation fit and clear width over the spherical ground.',
});

/** Isolated authoring catalogue. Registration and public placement belong to
 * the layout owner; this module never changes the original workshop examples. */
export function townBlockBlueprints():TownBlockPlan[]{
 return [deepRow(),workHall(),thickCorner(),stepHouse(),yardWing(),warehouse(),lowService(),
  narrowDeepRow(),narrowRidgeHouse(),fullDepthBlock(),fullDepthWorkHall(),fullDepthStepHouse()];
}
