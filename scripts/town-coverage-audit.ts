/** Read-only geometry audit. No server, browser, identity or database imports.
 * node scripts/town-coverage-audit.ts <output-directory> [town-snapshot.json] [sample-step-metres]
 * Roads and declared route corridors never count as buildings. This produces
 * measurements, not a numerical substitute for the user's visual acceptance. */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join, dirname, relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import ts from 'typescript';
import {Group, Mesh, MeshBasicMaterial, Quaternion, Vector3} from 'three';
import type {Object3D} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {publicTown, townDistrictFor, townPoint} from '../src/shared/public-town-layout.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import {partTransform, pivotOf, groundCells} from '../src/shared/blueprint-model.ts';
import {buildPart, PARTS} from '../src/shared/blueprint-parts.ts';
import type {PartId} from '../src/shared/blueprint-parts.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {disposeObject3D} from '../src/assets/claude-geometry/core/dispose.ts';
import {anchorFrame} from '../src/assets/claude-geometry/core/anchor.ts';
import {structureFit} from '../src/shared/blueprints.ts';
import {fieldOf, objectSeat} from '../src/shared/terrain.ts';
import {buildProp} from '../src/assets/claude-geometry/props/index.ts';
import {QUICK_PARTS} from '../src/shared/quick-parts.ts';
import {HUB_DOCK, BOARD_RADIUS} from '../src/shared/ports.ts';
import {HUB_SHIP} from '../src/shared/harbour-layout.ts';
import {SPAWN} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';

type P2=[number,number];
type Triangle=[P2,P2,P2];
type Triangle3=[Vec3,Vec3,Vec3];
type Category='houseRoof'|'shelterRoof'|'buildingGround'|'attachedOpenDeck'|'workSurface'|'roadDeck'|'polarSquare'|'pathStone'|'prop'|'operationalClearance'|'routeOnly'|'unassigned';
const categories:Category[]=['houseRoof','shelterRoof','buildingGround','attachedOpenDeck','workSurface','roadDeck','polarSquare','pathStone','prop','operationalClearance','routeOnly','unassigned'];
interface Surface {category:Category; triangles:Triangle[]; bounds:[number,number,number,number]}
interface Projection {id:string; up:Vec3; right:Vec3; front:Vec3; base:number; cosine:number; surfaces:Surface[]}
interface Cell {point:Vec3;latitude:number;longitude:number;area:number;ring:number;column:number;category:Category;roof:boolean;ground:boolean;designed:boolean;nearestRoof:number;nearestDesigned:number}
interface Ring {start:number;count:number;latitude:number;low:number;high:number}
const output=resolve(process.argv[2]??'docs/evidence/village-world/coverage-audit');
const snapshot=process.argv[3];
const step=Number(process.argv[4]??.24);
const gentle=process.argv.includes('--gentle');let lastSlice=performance.now();
async function cooperate(){if(gentle&&performance.now()-lastSlice>=12){await pause(45);lastSlice=performance.now();}}
if(!(step>=.1&&step<=1))throw Error('Sample step must be between 0.1 m and 1 m.');
mkdirSync(output,{recursive:true});
const town:PublicTown=snapshot?JSON.parse(readFileSync(snapshot,'utf8')):structuredClone(publicTown());
const input=JSON.stringify(town),radius=town.radius,area=4*Math.PI*radius*radius;
writeFileSync(join(output,'town-snapshot.json'),input);
const checksum=(data:string)=>createHash('sha256').update(data).digest('hex');
// Bind the actual host geometry/rule dependencies as well as the immutable
// vendor code. External package versions are represented by the lockfile.
function sourceFingerprints(){
  const pending=['scripts/town-coverage-audit.ts','src/client/public-town-art.ts','src/client/legacy-build-art.ts','package.json','pnpm-lock.yaml'];
  const files:Record<string,string>={};
  while(pending.length){
    const path=pending.pop()!;if(path in files)continue;
    const text=readFileSync(path,'utf8');files[path]=checksum(text);
    if(!/\.[cm]?[jt]sx?$/.test(path))continue;
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
    const visit=(node:ts.Node)=>{
      const target=ts.isImportDeclaration(node)||ts.isExportDeclaration(node)?node.moduleSpecifier:
        ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword?node.arguments[0]:undefined;
      if(target&&ts.isStringLiteral(target)&&target.text.startsWith('.')){
        const child=relative(process.cwd(),resolve(dirname(path),target.text));
        if(child.startsWith('..'))throw Error('Audit dependency leaves the project: '+child);
        pending.push(child);
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
  return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
}
const sourceBefore=sourceFingerprints();
const field=fieldOf(town.environment,radius),library=new StyleLibrary('low',{look:'village',scans:false});
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const geodesic=(a:Vec3,b:Vec3)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))))*radius;
const round=(n:number)=>Math.round(n*10000)/10000;
const degrees=(point:Vec3)=>({latitude:round(Math.asin(point[1])*180/Math.PI),longitude:round((Math.atan2(point[0],point[2])*180/Math.PI+360)%360)});
function trianglesOf(root:Object3D):Triangle3[]{
  const triangles:Triangle3[]=[];root.updateMatrixWorld(true);
  root.traverse(node=>{
    if(!(node instanceof Mesh)||node.name==='ink-shell')return;
    const p=node.geometry.getAttribute('position'),index=node.geometry.index,count=index?.count??p.count;
    for(let i=0;i<count;i+=3)triangles.push([0,1,2].map(j=>new Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(node.matrixWorld).toArray() as Vec3) as Triangle3);
  });return triangles;
}
const partTriangles=new Map<PartId,Triangle3[]>();
function geometry(id:PartId){let found=partTriangles.get(id);if(!found){const built=buildPart(id,library);found=trianglesOf(built.group);partTriangles.set(id,found);disposeObject3D(built.group);}return found;}
function surface(category:Category,triangles:Triangle[]):Surface{
  const useful=triangles.filter(([a,b,c])=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-10);
  const points=useful.flat();return {category,triangles:useful,bounds:[Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))]};
}
function rectangle(x:number,z:number,w=1,d=1):Triangle[]{return [[[x,z],[x+w,z],[x+w,z+d]],[[x,z],[x+w,z+d],[x,z+d]]];}
function inside(surface:Surface,x:number,z:number){
  const b=surface.bounds;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])return false;
  return surface.triangles.some(([a,b,c])=>{
    const s=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
    const t=(c[0]-b[0])*(z-b[1])-(c[1]-b[1])*(x-b[0]);
    const u=(a[0]-c[0])*(z-c[1])-(a[1]-c[1])*(x-c[0]);
    return (s>=-1e-9&&t>=-1e-9&&u>=-1e-9)||(s<=1e-9&&t<=1e-9&&u<=1e-9);
  });
}
const buildingIds=new Set(town.buildings),roadIds=new Set(town.roadObjects),perObject:Record<string,unknown>[]=[];
const projections:Projection[]=[];
for(const object of town.objects){
  await cooperate();
  const parts=town.blueprints[object.blueprintHash??''];
  const fit=object.kind==='structure'?structureFit(parts,object.position,object.rotation,field):objectSeat(field,object,town.blueprints);
  const frame=anchorFrame({dir:object.position,yaw:object.rotation}),base=fit.baseRadius,surfaces:Surface[]=[];
  const project=(p:Vec3):P2=>[p[0]*base/(base+p[1]),p[2]*base/(base+p[1])];
  const roofs:Triangle[]=[],floor:Triangle[]=[],open:Triangle[]=[];
  if(object.kind==='structure'){
    const pivot=pivotOf(parts),hasWalls=parts.some(p=>PARTS[p.part].role==='wall');
    if(buildingIds.has(object.id)){
      for(const part of parts){
        if(PARTS[part.part].roof||part.part.startsWith('roof.verge')){
          const t=partTransform(part,pivot),turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.yaw);
          roofs.push(...geometry(part.part).map(triangle=>triangle.map(p=>project(new Vector3(...p).applyQuaternion(turn).add(new Vector3(...t.position)).toArray() as Vec3)) as Triangle));
        }
      }
      const structuralCells=new Set(parts.filter(p=>p.level===0&&(p.part==='floor.deck'||p.part==='floor.grate')).map(p=>`${p.x},${p.z}`));
      for(const [x,z]of groundCells(parts))(structuralCells.has(`${x},${z}`)?floor:open).push(...rectangle(x-pivot.x,z-pivot.z));
      surfaces.push(surface(hasWalls?'houseRoof':'shelterRoof',roofs),surface('buildingGround',floor),surface('attachedOpenDeck',open));
      perObject.push({id:object.id,...degrees(object.position),blueprintHash:object.blueprintHash,kind:hasWalls?'house':'openShelter',parts:parts.length,roofParts:parts.filter(p=>PARTS[p.part].roof).length,groundCells:groundCells(parts).length,structuralFloorCells:structuralCells.size,roofProjectedTriangles:roofs.length});
    }else if(roadIds.has(object.id)){
      const category=object.id.includes('north-square')||object.id.includes('south-square')?'polarSquare':'roadDeck';
      surfaces.push(surface(category,groundCells(parts).flatMap(([x,z])=>rectangle(x-pivot.x,z-pivot.z))));
    }else if(object.id.startsWith('town-worksite-')&&parts.every(p=>p.level===0&&['street.paving','garden.bed','rail.guard','furniture.sideboard','storage.crates'].includes(p.part))){
      // These explicit ordinary garden/repair/shop plans have real paved
      // foundations. Only those cells count, never the surrounding yard.
      surfaces.push(surface('workSurface',groundCells(parts).flatMap(([x,z])=>rectangle(x-pivot.x,z-pivot.z))));
    }else throw Error(`Unclassified structure: ${object.id}; explicit audit classification required.`);
  }else{
    let built:Group;
    if(object.kind==='path'){
      // Exact host legacy-build-art.ts meshes, reconstructed without its DOM
      // canvas material factory. Shape values are fingerprinted in the report.
      built=new Group();const material=new MeshBasicMaterial();
      for(const [x,z,w,d]of [[-.22,-.20,.34,.29],[.20,-.18,.33,.33],[-.16,.18,.43,.31],[.26,.22,.25,.27]]){
        const mesh=new Mesh(new RoundedBoxGeometry(w,.065,d,1,.025),material);mesh.position.set(x,.06,z);built.add(mesh);
      }
    }else if(QUICK_PARTS[object.kind]&&object.assetVersion===2){
      const part=QUICK_PARTS[object.kind]!;built=buildPart(part.part,library).group;built.position.fromArray(part.offset);
    }else if(object.kind==='lamp'&&object.assetVersion===2)built=buildProp('lamp',library).group;
    else throw Error(`Unclassified ordinary prop: ${object.kind}/${object.assetVersion}; do not assume a circular footprint.`);
    const triangles=trianglesOf(built).map(t=>t.map(p=>project([p[0],p[1]+.015,p[2]])) as Triangle);disposeObject3D(built);
    surfaces.push(surface(object.kind==='path'?'pathStone':'prop',triangles));
  }
  let reach=0;for(const s of surfaces)for(const triangle of s.triangles)for(const p of triangle)reach=Math.max(reach,Math.hypot(...p));
  projections.push({id:object.id,up:object.position,right:frame.right,front:frame.front,base,cosine:Math.cos(Math.atan(reach/base)+1e-6),surfaces});
}
library.dispose();
// These are existing operational radii, reported separately. They do not
// turn a broad unnamed park into an intentional courtyard or into housing.
const clearances=[{id:'boarding interaction',point:HUB_DOCK,radius:BOARD_RADIUS,source:'src/shared/ports.ts: BOARD_RADIUS'},
  {id:'parked ship safety',point:HUB_SHIP,radius:2.5,source:'src/shared/public-town-layout.ts: HUB_SHIP minimum centre clearance'},
  {id:'arrival standing space',point:SPAWN,radius:1,source:'src/shared/public-town-layout.ts: SPAWN minimum centre clearance'}];
const routes=town.routes.flatMap(route=>route.points.slice(1).map((to,index)=>({from:route.points[index],to,width:route.width,id:route.id})));
function pointSegmentDistance(p:Vec3,a:Vec3,b:Vec3){
  const av=new Vector3(...a),bv=new Vector3(...b),pv=new Vector3(...p),normal=av.clone().cross(bv).normalize();
  if(normal.lengthSq()<.5)return geodesic(p,a);
  const projection=pv.clone().addScaledVector(normal,-pv.dot(normal)).normalize();
  if(projection.dot(pv)<0)projection.negate();
  const arc=av.angleTo(bv);
  if(Math.abs(av.angleTo(projection)+projection.angleTo(bv)-arc)<1e-7)return Math.asin(Math.min(1,Math.abs(pv.dot(normal))))*radius;
  return Math.min(geodesic(p,a),geodesic(p,b));
}
// Latitude rings use near-square cells, rather than oversampling longitude
// at the poles. Every cell carries its exact spherical area weight.
const cells:Cell[]=[],rings:Ring[]=[],ringCount=Math.ceil(Math.PI*radius/step);
for(let row=0;row<ringCount;row++){
  const low=-Math.PI/2+row*Math.PI/ringCount,high=-Math.PI/2+(row+1)*Math.PI/ringCount;
  const latitude=Math.asin((Math.sin(low)+Math.sin(high))/2),count=Math.max(1,Math.round(2*Math.PI*radius*Math.cos(latitude)/step));
  const cellArea=2*Math.PI*radius*radius*(Math.sin(high)-Math.sin(low))/count;
  rings.push({start:cells.length,count,latitude,low,high});
  for(let column=0;column<count;column++){
    if(column%64===0)await cooperate();
    const longitude=(column+.5)*360/count,point=townPoint(latitude*180/Math.PI,longitude);
    let category:Category='unassigned',roof=false,ground=false;
    for(const projection of projections){
      const cosine=dot(point,projection.up);if(cosine<projection.cosine)continue;
      const scale=projection.base/cosine,x=dot(point,projection.right)*scale,z=dot(point,projection.front)*scale;
      for(const s of projection.surfaces)if(inside(s,x,z)){
        if(categories.indexOf(s.category)<categories.indexOf(category))category=s.category;
        if(s.category==='houseRoof'||s.category==='shelterRoof')roof=true;
        if(s.category==='buildingGround')ground=true;
      }
    }
    if(category==='unassigned'&&clearances.some(c=>geodesic(point,c.point)<=c.radius))category='operationalClearance';
    if(category==='unassigned'&&routes.some(r=>dot(point,r.from)>.85&&pointSegmentDistance(point,r.from,r.to)<=r.width/2))category='routeOnly';
    cells.push({point,latitude:latitude*180/Math.PI,longitude,area:cellArea,ring:row,column,category,roof,ground,designed:category!=='unassigned',nearestRoof:0,nearestDesigned:0});
  }
}
if(Math.abs(cells.reduce((sum,cell)=>sum+cell.area,0)-area)>1e-5)throw Error('Spherical sample areas do not sum to the complete sphere.');
console.log(`Projected ${projections.length} ordinary objects onto ${cells.length} area-weighted samples.`);
interface KD {point:Vec3;axis:number;left?:KD;right?:KD}
function kd(points:Vec3[],depth=0):KD|undefined{
  if(!points.length)return;const axis=depth%3;points.sort((a,b)=>a[axis]-b[axis]);const middle=points.length>>1;
  return {point:points[middle],axis,left:kd(points.slice(0,middle),depth+1),right:kd(points.slice(middle+1),depth+1)};
}
function nearestSquared(tree:KD|undefined,p:Vec3,best=Infinity):number{
  if(!tree)return best;
  const q=tree.point,d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;best=Math.min(best,d);
  const delta=p[tree.axis]-q[tree.axis];best=nearestSquared(delta<0?tree.left:tree.right,p,best);
  return delta*delta<best?nearestSquared(delta<0?tree.right:tree.left,p,best):best;
}
const roofTree=kd(cells.filter(c=>c.roof).map(c=>c.point)),designedTree=kd(cells.filter(c=>c.designed).map(c=>c.point));
for(const [index,cell]of cells.entries()){
  if(index%256===0)await cooperate();
  cell.nearestRoof=cell.roof?0:2*Math.asin(Math.min(1,Math.sqrt(nearestSquared(roofTree,cell.point))/2))*radius;
  cell.nearestDesigned=cell.designed?0:2*Math.asin(Math.min(1,Math.sqrt(nearestSquared(designedTree,cell.point))/2))*radius;
}
function neighbours(cell:Cell):number[]{
  const ring=rings[cell.ring],out=[ring.start+(cell.column+ring.count-1)%ring.count,ring.start+(cell.column+1)%ring.count];
  for(const row of [cell.ring-1,cell.ring+1]){
    const next=rings[row];if(!next)continue;
    const first=Math.floor(cell.column/ring.count*next.count),last=Math.ceil((cell.column+1)/ring.count*next.count)-1;
    for(let col=first;col<=last;col++)out.push(next.start+(col+next.count)%next.count);
  }return out;
}
const coordinate=(cell:Cell)=>({latitude:round(cell.latitude),longitude:round(cell.longitude),district:townDistrictFor(cell.point)});
function components(erosion:number){
  const seen=new Uint8Array(cells.length),result:{areaM2:number;samples:number;deepest:ReturnType<typeof coordinate>;inscribedDiameterM:number;latitudeRange:number[];longitudeRange:number[];districts:string[]}[]=[];
  for(let start=0;start<cells.length;start++){
    if(seen[start]||cells[start].designed||cells[start].nearestDesigned<erosion)continue;
    const queue=[start];seen[start]=1;let sum=0,deepest=start,minLat=90,maxLat=-90,minLon=360,maxLon=0;const districts=new Set<string>();
    for(let head=0;head<queue.length;head++){
      const index=queue[head],cell=cells[index];sum+=cell.area;minLat=Math.min(minLat,cell.latitude);maxLat=Math.max(maxLat,cell.latitude);minLon=Math.min(minLon,cell.longitude);maxLon=Math.max(maxLon,cell.longitude);districts.add(townDistrictFor(cell.point));
      if(cell.nearestDesigned>cells[deepest].nearestDesigned)deepest=index;
      for(const next of neighbours(cell))if(!seen[next]&&!cells[next].designed&&cells[next].nearestDesigned>=erosion){seen[next]=1;queue.push(next);}
    }
    result.push({areaM2:round(sum),samples:queue.length,deepest:coordinate(cells[deepest]),inscribedDiameterM:round(2*cells[deepest].nearestDesigned),latitudeRange:[round(minLat),round(maxLat)],longitudeRange:[round(minLon),round(maxLon)],districts:[...districts].sort()});
  }
  return {erosionM:erosion,count:result.length,remainingAreaM2:round(result.reduce((sum,c)=>sum+c.areaM2,0)),largest:result.sort((a,b)=>b.areaM2-a.areaM2).slice(0,16)};
}
const amounts=(selected:Cell[])=>{
  const totals=Object.fromEntries(categories.map(c=>[c,0])) as Record<Category,number>;let sum=0,roof=0,ground=0;
  for(const c of selected){sum+=c.area;totals[c.category]+=c.area;if(c.roof)roof+=c.area;if(c.ground)ground+=c.area;}
  return {areaM2:round(sum),roofM2:round(roof),roofPercent:round(100*roof/sum),structuralGroundM2:round(ground),structuralGroundPercent:round(100*ground/sum),categories:Object.fromEntries(categories.map(c=>[c,{areaM2:round(totals[c]),percent:round(100*totals[c]/sum)}]))};
};
const windows=[];
for(const latitude of [-90,-75,-60,-45,-30,-15,0,15,30,45,60,75,90])for(const longitude of Math.abs(latitude)===90?[0]:Array.from({length:24},(_,i)=>i*15)){
  const center=townPoint(latitude,longitude);
  for(const windowRadiusM of [4,6,8]){
    await cooperate();
    const cosine=Math.cos(windowRadiusM/radius),selected=cells.filter(c=>dot(c.point,center)>=cosine);
    windows.push({latitude,longitude,windowRadiusM,...amounts(selected)});
  }
}
function peaks(key:'nearestRoof'|'nearestDesigned',limit:number){
  const result:Cell[]=[];
  for(const cell of [...cells].filter(c=>key==='nearestRoof'?!c.roof:!c.designed).sort((a,b)=>b[key]-a[key])){
    if(result.some(other=>geodesic(cell.point,other.point)<Math.max(2,(cell[key]+other[key])*.6)))continue;
    result.push(cell);if(result.length>=limit)break;
  }
  return result.map(c=>({...coordinate(c),clearanceRadiusM:round(c[key]),inscribedDiameterM:round(2*c[key]),atCategory:c.category,
    local6m:amounts(cells.filter(p=>dot(p.point,c.point)>=Math.cos(6/radius)))}));
}
const sortedDistance=cells.map(c=>({distance:c.nearestRoof,area:c.area})).sort((a,b)=>a.distance-b.distance);
function weightedPercentile(p:number){let sum=0;for(const item of sortedDistance){sum+=item.area;if(sum>=area*p)return round(item.distance);}return sortedDistance.at(-1)!.distance;}
const sourceFiles=sourceFingerprints();
if(JSON.stringify(sourceFiles)!==JSON.stringify(sourceBefore))throw Error('Audit source changed while measuring; keep the partial output as failed evidence.');
if(snapshot&&checksum(JSON.stringify(JSON.parse(readFileSync(snapshot,'utf8'))))!==checksum(input))throw Error('Audit snapshot changed while measuring.');
const report={generatedAt:new Date().toISOString(),status:'measurement-only-not-visual-acceptance',sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),snapshotSha256:checksum(input),sourceFiles,sourceUnchanged:true,
  radiusM:radius,sphereAreaM2:round(area),objects:town.objects.length,buildingObjects:town.buildings.length,
  method:{sampling:'Near-square latitude cells with exact spherical area weights; longitude count shrinks near both poles. Four-edge adjacency wraps longitude and overlaps adjacent variable-length rings.',execution:gentle?'Cooperative main loops target 12 ms CPU slices followed by 45 ms pauses; remaining sorts/output are synchronous.':'Single-process CPU analysis.',sampleStepM:step,samples:cells.length,latitudeRings:rings.length,maxNominalSampleDistanceUncertaintyM:round(step*Math.SQRT2),
    roof:'Union of actual low-detail village roof/roof-verge triangles, transformed by authored part grid, height, yaw and actual terrain seat. Radial projection onto sphere, not a centre radius. A house has at least one wall; a shelter has no walls. Attached unroofed floor does not become roof.',
    ground:'Actual level-0 floor.deck/floor.grate cells. Other foundation cells are separately attachedOpenDeck; all pure road blueprints stay roadDeck/polarSquare. Explicit ordinary garden/repair/shop worksite plans count only their physical foundation cells as workSurface, never housing or surrounding yard. Per-category area precedence is roofs, structural floor, open deck, work surface, road, square, Path stones, props, operational clearance, painted route only, then unassigned.',
    paths:'Actual host path meshes (four rounded stones), not the source three-stone prop and not a bounding circle.',
    openSpace:'Only exact attached deck/court footprints, three existing operational clearance disks, and declared route widths are recognized as designed. No district name, arbitrary buffer, empty yard or broad park exclusion.',
    distances:'Spherical distance to the nearest roof-covered/design-covered sample via a 3D nearest-neighbour tree; boundary sampling uncertainty is reported. Cap diameters are sampled estimates, not precision collision measurements.',
    components:'Unassigned cells only; roads/routes/courts already excluded. Erosion radii 0, 0.5, 1 and 2 m report how narrow residual alleys connect wider voids. Raw connected area alone is not a pass/fail criterion; neither is a roof percentage.',
    limitations:['Low-detail rendered geometry is used; not all-LOD exact union.','Automatic host seam/trim finishes, wall overhang and foundations are not counted as roof.','Areas project onto the radius-21.6 reference sphere rather than corrugated terrain surface area.','No camera, fog, sea or occlusion masking; no runtime performance or physical phone claim.','A measured purposeful route can still fail visual composition or walking quality; independent browser review remains necessary.']},
  total:amounts(cells),districts:town.renderDistricts.map(d=>({id:d.id,name:d.nameZh,...amounts(cells.filter(c=>townDistrictFor(c.point)===d.id))})),
  hemisphere:{north:amounts(cells.filter(c=>c.latitude>=0)),south:amounts(cells.filter(c=>c.latitude<0)),front:amounts(cells.filter(c=>c.point[2]>=0)),back:amounts(cells.filter(c=>c.point[2]<0))},
  distanceToRoofM:{p50:weightedPercentile(.5),p90:weightedPercentile(.9),p95:weightedPercentile(.95),p99:weightedPercentile(.99),max:weightedPercentile(1)},
  purposefulOperationalClearances:clearances.map(c=>({...c,...degrees(c.point)})),
  largestRoofFreeCaps:peaks('nearestRoof',30),largestUnassignedCaps:peaks('nearestDesigned',30),unassignedComponents:[0,.5,1,2].map(components),
  leastBuiltWindows:windows.filter(w=>w.windowRadiusM===6).sort((a,b)=>a.roofPercent-b.roofPercent).slice(0,30),perObject,
};
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
writeFileSync(join(output,'windows.json'),JSON.stringify(windows,null,2));
writeFileSync(join(output,'samples.csv'),'latitude,longitude,area_m2,category,roof,structural_ground,nearest_roof_m,nearest_designed_m\n'+cells.map(c=>[round(c.latitude),round(c.longitude),round(c.area),c.category,Number(c.roof),Number(c.ground),round(c.nearestRoof),round(c.nearestDesigned)].join(',')).join('\n')+'\n');
const colors:Record<Category,string>={houseRoof:'#cf553f',shelterRoof:'#e89943',buildingGround:'#a98664',attachedOpenDeck:'#dab37b',workSurface:'#d6be62',roadDeck:'#687886',polarSquare:'#ada5bc',pathStone:'#b5b9b3',prop:'#496d47',operationalClearance:'#72a6ca',routeOnly:'#a0bbce',unassigned:'#e4eddd'};
const spans:string[]=[];
for(const ring of rings)for(let from=0;from<ring.count;){
  const category=cells[ring.start+from].category;let to=from+1;
  while(to<ring.count&&cells[ring.start+to].category===category)to++;
  const x=from/ring.count*1440,y=(1-Math.sin(ring.high))*360,h=(Math.sin(ring.high)-Math.sin(ring.low))*360;
  spans.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${((to-from)*1440/ring.count+.03).toFixed(2)}" height="${(h+.03).toFixed(2)}" fill="${colors[category]}"/>`);from=to;
}
const map=spans.join('');
const grid=[-60,-30,0,30,60].map(lat=>`<path d="M0 ${(1-Math.sin(lat*Math.PI/180))*360} H1440"/><text x="4" y="${(1-Math.sin(lat*Math.PI/180))*360-4}">${lat}°</text>`).join('')+Array.from({length:12},(_,i)=>`<path d="M${i*120} 0 V720"/><text x="${i*120+4}" y="18">${i*30}°</text>`).join('');
const legend=categories.map((c,i)=>`<rect x="${i%6*235+10}" y="${744+Math.floor(i/6)*28}" width="14" height="14" fill="${colors[c]}"/><text x="${i%6*235+30}" y="${756+Math.floor(i/6)*28}">${c}</text>`).join('');
writeFileSync(join(output,'coverage-equal-area.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="825" viewBox="0 0 1440 825"><rect width="1440" height="825" fill="white"/>${map}<g stroke="#222" stroke-opacity=".25" stroke-width=".6" fill="#111" font-family="sans-serif" font-size="15">${grid}</g><g font-family="sans-serif" font-size="15">${legend}<text x="10" y="817">Analytical equal-area map, not a browser screenshot. North at top; longitude 0°→360°. R=${radius} m; sample ${step} m.</text></g></svg>`);
console.log(JSON.stringify({output,total:report.total,distanceToRoofM:report.distanceToRoofM,largestRoofFreeCaps:report.largestRoofFreeCaps.slice(0,5),largestUnassignedCaps:report.largestUnassignedCaps.slice(0,5),components:report.unassignedComponents.map(c=>({erosionM:c.erosionM,count:c.count,largest:c.largest[0]}))},null,2));
