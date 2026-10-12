import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BufferGeometry,type BufferAttribute,Float32BufferAttribute,Uint32BufferAttribute,BoxGeometry,Matrix4,Quaternion,Vector3,Box3} from 'three';
import {createCameraExactAvatarShadowTest,registerCameraExactAvatarShadowGeometry} from '../src/client/camera-exact-avatar-shadow.ts';
import {createCameraAvatarShadowTest} from '../src/client/camera-avatar-shadow.ts';
/** One captured avatar mesh as the fixture stores it. */
interface FixtureMesh { label: string; geometryId?: string; positions: number[]; indices?: number[]; drawRange: { start: number; count: number | 'all' }; groups: BufferGeometry['groups']; matrixWorld: number[] }
const fixture=JSON.parse(readFileSync(new URL('./fixtures/r11-protected-avatar-shadow.json',import.meta.url),'utf8'));
function setup(){
 const meshes=fixture.meshes.map((m:FixtureMesh)=>{const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(m.positions,3));if(m.indices)geometry.setIndex(new Uint32BufferAttribute(m.indices,1));geometry.setDrawRange(m.drawRange.start,m.drawRange.count==='all'?Infinity:m.drawRange.count);geometry.groups=m.groups;registerCameraExactAvatarShadowGeometry(geometry);return{label:m.label,geometryId:m.geometryId,geometry,matrixWorld:new Matrix4().fromArray(m.matrixWorld)};});
 return{meshes,bounds:structuredClone(fixture.bounds),pose:{eye:new Vector3(...fixture.pose.eye),direction:new Vector3(...fixture.pose.direction),up:new Vector3(...fixture.pose.up)},collider:{center:new Vector3(...fixture.collider.center),half:new Vector3(...fixture.collider.half),q:new Quaternion(...fixture.collider.q)}};
}
describe('strict real avatar shadow against complete protected OBB',()=>{
 it('clears r11 genuine visor box false positive with all19 independent support witnesses',()=>{
  const s=setup();expect(createCameraAvatarShadowTest(s.pose,s.bounds)(s.collider)).toBe(false);
  const proof=createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider);
  expect(proof.disjoint).toBe(true);expect(proof.coarseDisjoint).toBe(false);expect(proof.frameId).toBe(fixture.frameId);
  expect(proof.meshWitnesses).toHaveLength(19);expect(proof.avatarGeometry).toHaveLength(19);
  const blocker:Vector3[]=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])blocker.push(new Vector3(x*s.collider.half.x,y*s.collider.half.y,z*s.collider.half.z).applyQuaternion(s.collider.q).add(s.collider.center));
  // Independent scalar projection enumerates every raw local vertex and eye;
  // it does not trust the proof's cached hull, extrema, disjoint bit or gap.
  for(const witness of proof.meshWitnesses){
   const raw=fixture.meshes.find((m:FixtureMesh)=>m.label===witness.label),matrix=new Matrix4().fromArray(raw.matrixWorld),axis=new Vector3(...witness.axis);
   expect(Math.abs(axis.length()-1)).toBeLessThan(1e-10);
   const projected=[s.pose.eye.dot(axis)];for(let i=0;i<raw.positions.length;i+=3)projected.push(new Vector3(raw.positions[i],raw.positions[i+1],raw.positions[i+2]).applyMatrix4(matrix).dot(axis));
   const other=blocker.map(p=>p.dot(axis)),gap=Math.max(Math.min(...other)-Math.max(...projected),Math.min(...projected)-Math.max(...other));
   expect(gap).toBeGreaterThan(witness.supportExpansion+1e-7);expect(Math.abs(gap-witness.gap)).toBeLessThan(1e-10);
  }
 });
 it('retains a genuine opaque foreground OBB between eye and visor',()=>{
  const s=setup(),visor=s.meshes[3],center=new Box3().setFromBufferAttribute(visor.geometry.getAttribute('position') as BufferAttribute).getCenter(new Vector3()).applyMatrix4(visor.matrixWorld);
  s.collider.center.copy(s.pose.eye).lerp(center,.5);s.collider.half.set(.3,.3,.3);s.collider.q.identity();
  expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);
 });
 it('does not omit eye from finite shadow when mesh and blocker themselves are separate',()=>{
  const geometry=new BoxGeometry(.2,.2,.2),matrixWorld=new Matrix4().makeTranslation(0,0,-5),bounds=[{label:'body',corners:Array.from({length:8},(_,i)=>new Vector3(i&4?.1:-.1,i&2?.1:-.1,i&1?.1:-.1).applyMatrix4(matrixWorld).toArray())}];
  registerCameraExactAvatarShadowGeometry(geometry);
  const proof=createCameraExactAvatarShadowTest({eye:new Vector3(),direction:new Vector3(0,0,-1),up:new Vector3(0,1,0)},bounds,[{label:'body',geometry,matrixWorld}],1)({center:new Vector3(0,0,-2),half:new Vector3(.2,.2,.2),q:new Quaternion()});
  expect(proof.disjoint).toBe(false);
 });
 it('fails closed for missing/duplicate labels, mismatched matrix and invalid frame identity',()=>{
  const s=setup();expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes.slice(1),fixture.frameId)(s.collider).disjoint).toBe(false);
  s.meshes[1].label=s.meshes[0].label;expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);
  const m=setup();m.meshes[3].matrixWorld.elements[12]+=.0001;expect(createCameraExactAvatarShadowTest(m.pose,m.bounds,m.meshes,fixture.frameId)(m.collider).disjoint).toBe(false);
  const f=setup();expect(createCameraExactAvatarShadowTest(f.pose,f.bounds,f.meshes,NaN)(f.collider).disjoint).toBe(false);
 });
 it('rejects versioned geometry mutation after pose binding',()=>{
  const s=setup(),test=createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId),position=s.meshes[3].geometry.getAttribute('position');position.setXYZ(0,99,99,99);position.needsUpdate=true;
  const result=test(s.collider);expect(result.disjoint).toBe(false);expect(result.reason).toBe('registered-avatar-geometry-changed');
 });
 it('fails closed for invalid indices, nonfinite positions and degenerate transforms',()=>{
  const s=setup();s.meshes[3].geometry.getIndex()!.setX(0,999999);s.meshes[3].geometry.getIndex()!.needsUpdate=true;expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);
  const n=setup();n.meshes[3].geometry.getAttribute('position').setX(0,NaN);n.meshes[3].geometry.getAttribute('position').needsUpdate=true;expect(createCameraExactAvatarShadowTest(n.pose,n.bounds,n.meshes,fixture.frameId)(n.collider).disjoint).toBe(false);
  const d=setup();d.meshes[3].matrixWorld.makeScale(0,1,1);expect(createCameraExactAvatarShadowTest(d.pose,d.bounds,d.meshes,fixture.frameId)(d.collider).disjoint).toBe(false);
 });
 it('rejects changed position buffer identity, draw range and groups without rebuilding admission',()=>{const s=setup();const p=s.meshes[3].geometry.getAttribute('position') as Float32BufferAttribute;p.array=new Float32Array(p.array);expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);const d=setup();d.meshes[3].geometry.setDrawRange(0,3);expect(createCameraExactAvatarShadowTest(d.pose,d.bounds,d.meshes,fixture.frameId)(d.collider).disjoint).toBe(false);const g=setup();g.meshes[3].geometry.addGroup(0,3,0);expect(createCameraExactAvatarShadowTest(g.pose,g.bounds,g.meshes,fixture.frameId)(g.collider).disjoint).toBe(false);});
 it('refuses unregistered replacement geometry even with matching bounds',()=>{const s=setup();s.meshes[3].geometry=s.meshes[3].geometry.clone();expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);});
 it('retains strict subrounding separation as blocked',()=>{
  const s=setup();s.collider.center.copy(new Box3().setFromBufferAttribute(s.meshes[3].geometry.getAttribute('position') as BufferAttribute).getCenter(new Vector3()).applyMatrix4(s.meshes[3].matrixWorld));s.collider.half.set(.001,.001,.001);
  expect(createCameraExactAvatarShadowTest(s.pose,s.bounds,s.meshes,fixture.frameId)(s.collider).disjoint).toBe(false);
 });
});
