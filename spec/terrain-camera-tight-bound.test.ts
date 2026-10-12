import { describe, expect, it } from 'vitest';
import { fieldOf, trustedFieldRadiusUpperBound } from '../src/shared/terrain.ts';
import { defaultEnvironment, encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import { HEIGHT_LIMITS, LANDING_BLEND } from '../src/assets/claude-geometry/terrain/field.ts';
import type { TerrainField } from '../src/assets/claude-geometry/terrain/field.ts';
import { SPAWN_DIR } from '../src/assets/claude-geometry/core/anchor.ts';
import { noise3, fbm3, ridged3 } from '../src/assets/claude-geometry/core/noise.ts';
import { point, noiseAt, fbmAt, ridgedAt } from '../src/assets/claude-geometry/terrain/dual.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
let seed = 9100;
function fresh(style: 'temperate' | 'ocean' | 'ice' | 'desert' = 'temperate', relief = .3, roughness = .025, version = 2, radius = 10) {
 const env = defaultEnvironment(style, ++seed); env.generatorVersion = version;
 env.params.relief = relief; env.params.roughness = roughness;
 return fieldOf(encodeEnvironment(env), radius) as TerrainField;
}
describe('fresh temperate factory camera height bound', () => {
 it('uses the proved low-relief upper bound for the actual public environment', () => {
  const field = fieldOf(samplePublicVillage(21.6).environment,21.6);
  const upper = trustedFieldRadiusUpperBound(field)!;
  expect(upper).toBeGreaterThanOrEqual(21.6+.78525); expect(upper).toBeLessThan(21.6+.7852501);
 });
 it('retains universal clamp fallback for each other factory style', () => {
  for(const style of ['ocean','desert','ice'] as const) { const field=fresh(style);const upper=trustedFieldRadiusUpperBound(field)!;
   expect(upper).toBeGreaterThanOrEqual(10+HEIGHT_LIMITS.ceiling);expect(upper).toBeLessThan(10+HEIGHT_LIMITS.ceiling+1e-10); }
 });
 it('clips a high-relief analytic upper bound to the existing universal ceiling', () => {
  for(const version of [1,2]) { const upper=trustedFieldRadiusUpperBound(fresh('temperate',1.4,1,version))!;
   expect(upper).toBeGreaterThanOrEqual(11.75);expect(upper).toBeLessThan(11.75+1e-10); }
 });
 it('keeps exact height values and dominates their values on varied versions, seeds and directions', () => {
  for(const version of [1,2]) for(const relief of [.3,.6,1.4]) {
   const field=fresh('temperate',relief,.7,version), original=field.heightAt, upper=trustedFieldRadiusUpperBound(field)!;
   for(let i=0;i<150;i++){ const dir:[number,number,number]=[Math.sin(i*17+.1),Math.cos(i*13+.2),Math.sin(i*7+.3)];
    const before=field.heightAt(dir);expect(10+before).toBeLessThanOrEqual(upper);expect(trustedFieldRadiusUpperBound(field)).toBe(upper);expect(field.heightAt(dir)).toBe(before); }
   expect(field.heightAt).toBe(original);
  }
 });
 it('rejects a changed original exposed program height even when radial heightAt is untouched', () => {
  const field=fresh('temperate',.3,.025,2,21.6), height=field.heightAt; field.program.height=()=>({v:100,x:0,y:0,z:0});
  expect(field.heightAt).toBe(height);expect(trustedFieldRadiusUpperBound(field)).toBeNull();
 });
 it('rejects replacement of the original program object at source radius', () => {
  const field=fresh();Object.defineProperty(field,'program',{value:{...field.program}});expect(trustedFieldRadiusUpperBound(field)).toBeNull();
 });
 it('rejects parameter and environment identity/value changes after issuance', () => {
  for(const change of [(f:TerrainField)=>{f.env.params.relief=1.4;},(f:TerrainField)=>{f.env.generatorVersion=1;},
   (f:TerrainField)=>{f.env.params.extra=0;},(f:TerrainField)=>{Object.defineProperty(f.env,'params',{value:{...f.env.params}});},
   (f:TerrainField)=>{Object.defineProperty(f,'env',{value:{...f.env}});},(f:TerrainField)=>{Object.defineProperty(f,'landingLevel',{value:100});}]){
   const field=fresh();expect(trustedFieldRadiusUpperBound(field)).not.toBeNull();change(field);expect(trustedFieldRadiusUpperBound(field)).toBeNull();
  }
 });
 it('invalidates modified live landing dependencies, including restoration', () => {
  const field=fresh(),upper=trustedFieldRadiusUpperBound(field),blend=LANDING_BLEND[1],spawn=SPAWN_DIR[0];
  try{LANDING_BLEND[1]+=1;expect(trustedFieldRadiusUpperBound(field)).toBeNull();}finally{LANDING_BLEND[1]=blend;}
  expect(trustedFieldRadiusUpperBound(field)).toBe(upper);
  try{SPAWN_DIR[0]+=.1;expect(trustedFieldRadiusUpperBound(field)).toBeNull();}finally{SPAWN_DIR[0]=spawn;}
  expect(trustedFieldRadiusUpperBound(field)).toBe(upper);
 });
 it('rejects changed height Math primitives without evaluating mutated terrain', () => {
  const field=fresh(),original=Math.floor;
  try{Math.floor=(n:number)=>original(n)+1;expect(trustedFieldRadiusUpperBound(field)).toBeNull();}finally{Math.floor=original;}
 });
 it('does not issue provenance when a factory calibration primitive was replaced before creation', () => {
  const original=Math.round;let field:TerrainField;
  try{Math.round=(value:number)=>original(value);field=fresh();expect(trustedFieldRadiusUpperBound(field)).toBeNull();}finally{Math.round=original;}
 });
 it('keeps both scalar and dual noise within the proved allowances and identical values', () => {
  for(let i=0;i<250;i++){const p=point((i%17)/16,(i%19)/18-1,(i%23)/22),s=i*37;
   const n=noise3(p.x.v,p.y.v,p.z.v,s),f=fbm3(p.x.v,p.y.v,p.z.v,s,5,2,.6),r=ridged3(p.x.v,p.y.v,p.z.v,s,4);
   expect(noiseAt(p,s).v).toBe(n);expect(fbmAt(p,s,5,2,.6).v).toBe(f);expect(ridgedAt(p,s,4).v).toBe(r);
   expect(Math.abs(n)).toBeLessThanOrEqual(2+2**-32);expect(Math.abs(f)).toBeLessThanOrEqual(2+2**-31);expect(r).toBeGreaterThanOrEqual(0);expect(r).toBeLessThanOrEqual(1+2**-30);
  }
 });
 it('does not certify arbitrary lookalike fields or legacy factory fields', () => {
  const field=fresh();expect(trustedFieldRadiusUpperBound({...field})).toBeNull();expect(trustedFieldRadiusUpperBound(fieldOf(null))).toBeNull();
 });
});
