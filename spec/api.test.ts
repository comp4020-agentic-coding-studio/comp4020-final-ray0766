import { expect, inject, it } from 'vitest';
const base=inject('baseUrl');
it('issues an HttpOnly identity; validates writes and protects cross-site requests',async()=>{
  const first=await fetch(base+'/api/state');const cookie=first.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Lax');
  const post=(route:string,body:unknown,extra:Record<string,string>={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie.split(';')[0],...extra},body:JSON.stringify(body)});
  expect((await post('/api/character',{character:'sky'})).status).toBe(200);
  const restored=await fetch(base+'/api/state',{headers:{Cookie:cookie.split(';')[0]}});
  expect(await restored.json()).toMatchObject({character:'sky',quest:'available'});
  expect((await post('/api/character',{character:'hacker'})).status).toBe(400);
  expect((await post('/api/character',{character:'fern'},{Origin:'https://unrelated.example'})).status).toBe(403);
  expect((await post('/api/interact',{action:'deliver'})).status).toBe(409);
  expect((await post('/api/interact',{action:'pickup'})).status).toBe(409);
  expect((await post('/api/move',{position:[0,0,0]})).status).toBe(400);
  expect((await post('/api/character',{character:'fern'},{Cookie:''})).status).toBe(401);
  expect((await post('/api/character',{character:'fern'},{'Content-Type':'text/plain'})).status).toBe(415);
  expect((await post('/api/character',null)).status).toBe(400);
  const other=await fetch(base+'/api/state');expect(await other.json()).toMatchObject({character:'clay'});
});
