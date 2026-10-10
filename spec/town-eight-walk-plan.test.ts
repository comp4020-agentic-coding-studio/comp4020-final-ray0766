import {afterEach,describe,expect,it} from 'vitest';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {defaultEnvironment,encodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {structureSize} from '../src/shared/blueprints.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';

const temporary:string[]=[];
afterEach(()=>{for(const folder of temporary.splice(0))rmSync(folder,{recursive:true,force:true});});
function run(twoLevels:boolean){
 mkdirSync('.data',{recursive:true});const folder=mkdtempSync('.data/spec-eight-gates-');temporary.push(folder);
 const environment=defaultEnvironment('temperate',1);Object.assign(environment.params,{relief:.3,roughness:0,waterLevel:null,woodland:0,outcrops:0});
 const parts:PartPlacement[]=[];for(const level of [0,1])for(let x=0;x<3;x++)for(let z=0;z<3;z++)parts.push({n:parts.length+1,part:'floor.deck',x,z,level,rot:0});
 const at=(x:number)=>localToDir({dir:[0,0,1],yaw:0},6,[x,0,0]);
 const town={version:1,radius:6,environment:encodeEnvironment(environment),objects:[{id:'open-decks',kind:'structure' as const,position:[0,0,1] as [number,number,number],rotation:0,version:1 as const,blueprintHash:'decks',...structureSize(parts)}],blueprints:{decks:parts},buildings:['open-decks'],routes:[{id:'first',width:1,points:[at(-.5),at(0)]},{id:'second',width:1,points:[at(0),at(.5)]}]};
 const world=new GroundWorld({id:'spec-two-level-gates',revision:0,...town}),body=world.bodies.find(b=>b.objectId==='open-decks')!;
 const selection={townFingerprint:createHash('sha256').update(JSON.stringify({version:town.version,objects:town.objects,blueprints:town.blueprints,routes:town.routes})).digest('hex'),runtimeIndexSha256:'0'.repeat(64),designedRouteIds:['first','second'],routeStartFeetRadius:twoLevels?{second:world.support(at(0),9).radius}:undefined,outdoorOnly:{publicSupports:[{objectId:'open-decks',colliderIndices:body.colliders.flatMap((c,i)=>c.support&&c.tag==='floor'?[i]:[]),tag:'floor',reason:'Explicitly public open decks in an isolated pure authoring test'}]},routes:Array.from({length:8},(_,i)=>({id:'spec-'+i,fixture:'front',purpose:'Pure offline shared-gate regression, no identities or browser',legs:[{routeId:'first'},{routeId:'second'}]}))};
 const townFile=join(folder,'town.json'),selectionFile=join(folder,'selection.json'),out=join(folder,'plan.json');writeFileSync(townFile,JSON.stringify(town));writeFileSync(selectionFile,JSON.stringify(selection));
 const process=spawnSync(globalThis.process.execPath,['scripts/town-eight-walk-plan.ts','--town='+townFile,'--selection='+selectionFile,'--out='+out],{encoding:'utf8',timeout:20000});
 return {process,out,proof:JSON.parse(readFileSync(join(folder,'plan-authoring.json'),'utf8'))};
}
describe('eight designed route gate authoring',()=>{
 it('joins actually matching public deck gates and carries continuous poses',()=>{
  const result=run(false);expect(result.process.status,result.process.stderr).toBe(0);expect(existsSync(result.out)).toBe(true);
  const executable=JSON.parse(readFileSync(result.out,'utf8'));expect(executable.routes.every((r:{stops:{expectedFeetRadius:number}[]})=>r.stops.every(s=>Number.isFinite(s.expectedFeetRadius)))).toBe(true);
  expect(result.proof.gateChecks.every((g:{passed:boolean})=>g.passed)).toBe(true);
  for(const chain of result.proof.chainProof)expect(chain.reverse.initialPose).toEqual(chain.forward.actual);
 },30000);
 it('refuses a shared radial direction when the real gates are on different storeys',()=>{
  const result=run(true);expect(result.process.status).not.toBe(0);expect(existsSync(result.out)).toBe(false);
  expect(result.proof.networkProof.every((r:{forward:{connected:boolean};reverse:{connected:boolean}})=>r.forward.connected&&r.reverse.connected)).toBe(true);
  expect(result.proof.gateChecks.every((g:{directionGapMetres:number;heightGapMetres:number;passed:boolean})=>g.directionGapMetres===0&&g.heightGapMetres>2&&!g.passed)).toBe(true);
  expect(result.proof.status).toBe('failed-original-design-retained');
 },30000);
});
