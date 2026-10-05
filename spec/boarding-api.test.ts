import { expect,inject,it } from 'vitest';
import { createHash } from 'node:crypto';
import { normalize,SPAWN } from '../src/shared/world.ts';
const base=inject('baseUrl');
it('rejects remote/forged boarding over HTTP and keeps sessions out of presence responses',async()=>{
  const create=async()=>{const r=await fetch(base+'/api/state'),cookie=r.headers.get('set-cookie')!.split(';')[0],state=await r.json();return{cookie,state,post:(url:string,body:unknown)=>fetch(base+'/api/'+url,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)})};};
  const a=await create(),b=await create();
  expect((await a.post('flight/takeoff',{planetId:'hub',journey:0})).status).toBe(409);
  expect((await a.post('flight/takeoff',{planetId:'hub',journey:0,position:normalize([0,1,-.72])})).status).toBe(400);
  expect((await a.post('move',{planetId:'hub',position:normalize([0,1,-.72])})).status).toBe(409);
  const saved=await(await fetch(base+'/api/state',{headers:{Cookie:a.cookie}})).json();expect(saved).toEqual(a.state);
  const body={planetId:'hub',facing:normalize([0,SPAWN[2],-SPAWN[1]])};expect((await a.post('presence',body)).status).toBe(200);
  const response=await b.post('presence',body),snapshot=await response.json();expect(response.status).toBe(200);expect(snapshot.visitors.length).toBeGreaterThan(0);
  for(const c of [a.cookie,b.cookie]){const token=c.split('=')[1];expect(JSON.stringify(snapshot)).not.toContain(token);expect(JSON.stringify(snapshot)).not.toContain(createHash('sha256').update(token).digest('hex'));}
  expect((await b.post('presence',{...body,position:[1,0,0]})).status).toBe(400);
  expect((await fetch(base+'/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(401);
  expect((await b.post('presence',{...body,planetId:'missing'})).status).toBe(409);
});
